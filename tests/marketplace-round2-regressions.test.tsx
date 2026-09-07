// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApplicationDetailExperience, ApplicationFormExperience } from '../components/marketplace/application-experiences';
import { HostApplicationsExperience } from '../components/marketplace/host-experiences';
import { clearStoredAuthSession, writeStoredAuthSession } from '../lib/auth-session';
import { createPreviewListings } from '../lib/preview-data';
import type { ApiRentalApplication } from '../lib/rental-applications';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function application(status: ApiRentalApplication['status'] = 'DRAFT'): ApiRentalApplication {
  return {
    id: 'application-a', listingId: 'listing-a', listingTitle: 'Account A private rental',
    listingOwnerId: 'owner-a', submitterId: 'renter-a', teamId: null, scope: 'SOLO', status,
    memberSnapshots: [{ userId: 'renter-a', displayName: 'Renter A' }],
    moveIn: '2099-09-20T00:00:00.000Z', moveOut: '2100-01-01T00:00:00.000Z',
    schoolOrOccupation: 'Account A private employer', incomeBand: 'TWO_TO_THREE_X',
    guarantorStatus: 'AVAILABLE', note: 'Account A private application note'
  };
}
function installBackend(initial: ApiRentalApplication, userId = 'renter-a') {
  let current = initial;
  let payment = 'AWAITING_PAYMENT';
  let cancellationFailure = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    const otherAccount = new Headers(options?.headers).get('Authorization') === 'Bearer account-b-token';
    if (url.endsWith('/auth/me')) return Response.json({ id: otherAccount ? 'renter-b' : userId, email: `${userId}@example.com`, role: 'USER' });
    if (url.endsWith('/profiles/me')) return Response.json({ id: 'profile-a', displayName: otherAccount ? 'Account B' : 'Account A', role: 'lister' });
    if (url.endsWith('/applications/mine') || url.endsWith('/applications/host-inbox')) return Response.json(otherAccount ? [] : [current]);
    if (url.endsWith('/applications/application-a') && options?.method !== 'POST') return otherAccount ? Response.json({}, { status: 404 }) : Response.json(current);
    if (url.endsWith('/payments/configuration')) return Response.json({ mode: 'production' });
    if (url.endsWith('/payments/applications/application-a')) return Response.json({ status: payment });
    if (options?.method === 'POST' && url.endsWith('/submit')) { current = { ...current, status: 'SUBMITTED' }; return Response.json(current); }
    if (options?.method === 'POST' && url.endsWith('/accept')) { current = { ...current, status: 'ACCEPTED' }; return Response.json(current); }
    if (options?.method === 'POST' && url.endsWith('/cancel')) {
      if (cancellationFailure) throw new TypeError('Connection interrupted');
      current = { ...current, status: 'CANCELLATION_PENDING' }; payment = 'PROCESSING'; return Response.json(current);
    }
    return Response.json({ message: `Unexpected path ${url}` }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, update: (value: ApiRentalApplication) => { current = value; }, payment: (value: string) => { payment = value; }, failCancellation: (value: boolean) => { cancellationFailure = value; } };
}
async function switchStoredAccount() {
  await act(async () => {
    clearStoredAuthSession(); writeStoredAuthSession('account-b-token');
    window.dispatchEvent(new StorageEvent('storage', { key: 'sublet_auth_session' }));
    window.dispatchEvent(new Event('focus'));
  });
}
it.each(['renter', 'host'])('clears the old account private data and controls when %s switches accounts', async (role) => {
  writeStoredAuthSession('account-a-token');
  installBackend(application(role === 'host' ? 'SUBMITTED' : 'DRAFT'), role === 'host' ? 'owner-a' : 'renter-a');
  render(role === 'host' ? <HostApplicationsExperience /> : <ApplicationDetailExperience applicationId="application-a" />);
  await screen.findByRole('button', { name: role === 'host' ? '接受申请' : '继续提交' });
  await switchStoredAccount();
  expect(screen.queryByText('Account A private application note')).toBeNull();
  expect(screen.queryByRole('button', { name: role === 'host' ? '接受申请' : '继续提交' })).toBeNull();
});
it('rechecks credentials after a draft read before submitting', async () => {
  writeStoredAuthSession('account-a-token');
  const backend = installBackend(application());
  const original = backend.fetch.getMockImplementation()!;
  let reads = 0;
  let finishRead!: (response: Response) => void;
  backend.fetch.mockImplementation(async (input, options) => {
    if (String(input).endsWith('/applications/mine') && ++reads === 2) return new Promise<Response>(resolve => { finishRead = resolve; });
    return original(input, options);
  });
  render(<ApplicationDetailExperience applicationId="application-a" />);
  fireEvent.click(await screen.findByRole('button', { name: '继续提交' }));
  await waitFor(() => expect(finishRead).toBeDefined());
  await switchStoredAccount();
  await act(async () => finishRead(Response.json([application()])));
  expect(backend.fetch.mock.calls.filter(([url]) => String(url).endsWith('/submit'))).toHaveLength(0);
  expect(screen.queryByText('Account A private application note')).toBeNull();
});
it('blocks a host write if storage changed before a synchronization event', async () => {
  writeStoredAuthSession('account-a-token');
  const backend = installBackend(application('SUBMITTED'), 'owner-a');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<HostApplicationsExperience />);
  const accept = await screen.findByRole('button', { name: '接受申请' });
  localStorage.setItem('sublet_auth_session', JSON.stringify({ version: 1, accessToken: 'account-b-token' }));
  fireEvent.click(accept);
  await screen.findByRole('alert');
  expect(backend.fetch.mock.calls.filter(([url]) => String(url).endsWith('/accept'))).toHaveLength(0);
});
it.each(['renter', 'host'])('lets an accepted %s application cancel and then reflect completed refund', async (role) => {
  writeStoredAuthSession('account-a-token');
  const backend = installBackend(application('ACCEPTED'), role === 'host' ? 'owner-a' : 'renter-a');
  render(role === 'host' ? <HostApplicationsExperience /> : <ApplicationDetailExperience applicationId="application-a" />);
  fireEvent.click(await screen.findByRole('button', { name: '取消申请' }));
  fireEvent.change(screen.getByLabelText('取消原因'), { target: { value: '入住计划改变' } });
  fireEvent.click(screen.getByRole('button', { name: '确认取消申请' }));
  await screen.findByText('取消处理中');
  backend.update(application('CANCELLED')); backend.payment('REFUNDED');
  fireEvent.click(screen.getByRole('button', { name: '刷新付款状态' }));
  await waitFor(() => expect(screen.queryByText('取消处理中')).toBeNull());
  expect(screen.getByText('申请已取消')).toBeTruthy();
});
it('keeps the same cancellation request after an uncertain failure and remount', async () => {
  writeStoredAuthSession('account-a-token');
  const backend = installBackend(application('ACCEPTED'));
  backend.failCancellation(true);
  const view = render(<ApplicationDetailExperience applicationId="application-a" />);
  fireEvent.click(await screen.findByRole('button', { name: '取消申请' }));
  fireEvent.change(screen.getByLabelText('取消原因'), { target: { value: '计划改变' } });
  fireEvent.click(screen.getByRole('button', { name: '确认取消申请' }));
  await screen.findByRole('alert');
  view.unmount(); backend.failCancellation(false);
  render(<ApplicationDetailExperience applicationId="application-a" />);
  fireEvent.click(await screen.findByRole('button', { name: '取消申请' }));
  expect(screen.getByLabelText('取消原因')).toHaveProperty('value', '计划改变');
  fireEvent.click(screen.getByRole('button', { name: '确认取消申请' }));
  await screen.findByText('取消处理中');
  const calls = backend.fetch.mock.calls.filter(([url]) => String(url).endsWith('/cancel'));
  expect(calls).toHaveLength(2);
  expect(new Headers(calls[0][1]?.headers).get('Idempotency-Key')).toBe(new Headers(calls[1][1]?.headers).get('Idempotency-Key'));
  expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ reason: '计划改变' });
});
it.each(['renter', 'host'])('does not offer cancellation starting on the move-in day to %s', async (role) => {
  writeStoredAuthSession('account-a-token');
  installBackend({ ...application('ACCEPTED'), moveIn: '2020-01-01T00:00:00.000Z' }, role === 'host' ? 'owner-a' : 'renter-a');
  render(role === 'host' ? <HostApplicationsExperience /> : <ApplicationDetailExperience applicationId="application-a" />);
  await screen.findByRole('button', { name: '刷新付款状态' });
  expect(screen.queryByRole('button', { name: '取消申请' })).toBeNull();
});
it('submits the contact values entered in the form', async () => {
  writeStoredAuthSession('account-a-token');
  const listing = { ...createPreviewListings()[0], availableFrom: '2099-09-01', availableTo: '2100-01-01' };
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (input, options) => {
    if (String(input).endsWith('/auth/me')) return Response.json({ id: 'renter-a' });
    if (String(input).endsWith('/applications/mine')) return Response.json([]);
    if (String(input).endsWith('/applications')) { saved = JSON.parse(options.body); return Response.json(application()); }
    return Response.json(application('SUBMITTED'));
  }));
  render(<ApplicationFormExperience listing={listing} />);
  fireEvent.change(screen.getByPlaceholderText('你的姓名'), { target: { value: ' Lin Contact ' } });
  fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'contact@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('UCLA / Product Intern'), { target: { value: 'Researcher' } });
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '继续' }));
  fireEvent.click(screen.getByRole('button', { name: '提交申请' }));
  await screen.findByText('申请已提交');
  expect(saved).toMatchObject({ contactName: 'Lin Contact', contactEmail: 'contact@example.com' });
});
it('blocks a demo payment write using credentials from before account replacement', async () => {
  writeStoredAuthSession('account-a-token');
  const accepted = application('ACCEPTED');
  const backend = installBackend(accepted);
  const original = backend.fetch.getMockImplementation()!;
  backend.fetch.mockImplementation(async (input, options) => {
    if (String(input).endsWith('/payments/configuration')) return Response.json({ mode: 'demo' });
    if (String(input).includes('/demo-payments/')) return Response.json({
      disclaimer: '演示模式，不会真实扣款', application: accepted,
      payment: { id: 'payment-a', applicationId: accepted.id, amountCents: 180000, currency: 'USD', status: 'AWAITING_ATTEMPT' },
      heldFund: null, attempts: [], ledgerEntries: []
    });
    return original(input, options);
  });
  render(<ApplicationDetailExperience applicationId="application-a" />);
  const pay = await screen.findByRole('button', { name: '模拟支付成功' });
  localStorage.setItem('sublet_auth_session', JSON.stringify({ version: 1, accessToken: 'account-b-token' }));
  fireEvent.click(pay);
  await act(async () => undefined);
  expect(backend.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});
