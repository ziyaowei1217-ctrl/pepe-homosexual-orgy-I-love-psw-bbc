// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoPaymentPanel } from '../components/demo-payment-panel';
import { writeStoredAuthSession } from '../lib/auth-session';
import type { ApiRentalApplication } from '../lib/rental-applications';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
it('keeps retries bound to their operation and uses a distinct key when switching outcomes', async () => {
  writeStoredAuthSession('audit-renter-token');
  const application: ApiRentalApplication = {
    id: 'audit-app', listingId: 'audit-listing', listingOwnerId: 'owner', submitterId: 'renter',
    teamId: null, scope: 'SOLO', status: 'ACCEPTED', memberSnapshots: [{ userId: 'renter', displayName: 'Renter' }],
    moveIn: '2099-09-20T00:00:00.000Z', moveOut: '2099-10-20T00:00:00.000Z',
    schoolOrOccupation: 'Audit', incomeBand: 'TWO_TO_THREE_X', guarantorStatus: 'AVAILABLE', note: ''
  };
  const state = {
    application, disclaimer: '演示模式，不会真实扣款',
    payment: { id: 'payment', applicationId: application.id, amountCents: 180000, currency: 'USD', status: 'AWAITING_ATTEMPT' },
    heldFund: null, attempts: [] as object[], ledgerEntries: []
  };
  const commands: Array<{ outcome: string; key: string | null }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (options?.method !== 'POST') return Response.json(state);
    const key = new Headers(options.headers).get('Idempotency-Key');
    if (url.endsWith('/simulate-failure')) {
      commands.push({ outcome: 'failure', key });
      state.attempts.push({ id: 'committed-failure', outcome: 'FAILED', applied: false, createdAt: new Date().toISOString() });
      throw new TypeError('Network response lost after committed failed attempt');
    }
    if (url.endsWith('/simulate-success')) {
      commands.push({ outcome: 'success', key });
      if (commands[0].key === key) return Response.json({ message: 'Idempotency-Key is already bound to a different payment attempt' }, { status: 409 });
      if (commands.filter(command => command.outcome === 'success').length === 1) throw new TypeError('Success response lost');
      return Response.json({ ...state, payment: { ...state.payment, status: 'HELD' } });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  render(<DemoPaymentPanel application={application} token="audit-renter-token" currentUserId="renter" />);
  fireEvent.click(await screen.findByRole('button', { name: '模拟支付失败' }));
  await screen.findByRole('alert');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const success = screen.getByRole('button', { name: '模拟支付成功' });
    await waitFor(() => expect((success as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(success);
    await waitFor(() => expect(commands).toHaveLength(attempt + 2));
    if (attempt === 0) await screen.findByRole('alert');
    else await screen.findByText('资金已持有');
  }
  expect(commands.map(command => command.outcome)).toEqual(['failure', 'success', 'success']);
  expect(commands[1].key).not.toBe(commands[0].key);
  expect(commands[2].key).toBe(commands[1].key);
});
