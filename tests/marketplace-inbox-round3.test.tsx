// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HostApplicationsExperience } from '../components/marketplace/host-experiences';
import { InboxExperience } from '../components/marketplace/inbox-experience';
import InboxPage from '../app/inbox/page';

vi.mock('../lib/roommate-realtime', () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
vi.mock('../components/marketplace/public-shell', () => ({ PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { writeStoredAuthSession } from '../lib/auth-session';
import type { ApiRentalApplication } from '../lib/rental-applications';
import type { ApiDealThread } from '../lib/api';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function application(suffix: string): ApiRentalApplication {
  return {
    id: `application-${suffix}`, listingId: 'shared-listing', listingTitle: 'One shared listing',
    listingOwnerId: 'host', submitterId: `renter-${suffix}`, teamId: null, scope: 'SOLO', status: 'SUBMITTED',
    memberSnapshots: [{ userId: `renter-${suffix}`, displayName: `Applicant ${suffix}` }],
    moveIn: '2099-09-20T00:00:00.000Z', moveOut: '2100-01-01T00:00:00.000Z',
    schoolOrOccupation: `University ${suffix}`, incomeBand: 'TWO_TO_THREE_X', guarantorStatus: 'AVAILABLE', note: `Applicant ${suffix} private note`
  };
}
function thread(suffix: string): ApiDealThread {
  return {
    id: `thread-${suffix}`, ownerId: `renter-${suffix}`, listingOwnerId: 'host', viewerRole: 'host',
    dealRoomId: null, listingId: 'shared-listing', listingTitle: 'One shared listing', area: 'Westwood',
    contactName: `Applicant ${suffix}`, participantNames: [`Applicant ${suffix}`], messages: [], viewingRequests: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z'
  };
}

function mockThreads(threads: ApiDealThread[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deal-threads')) return Response.json(threads);
    if (url.endsWith('/roommate-conversations')) return Response.json([]);
    return Response.json({ message: `Unexpected route ${url}` }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('does not substitute another applicant when the intended conversation is unavailable', async () => {
  writeStoredAuthSession('host-token');
  const fetchMock = mockThreads([thread('A')]);
  render(<InboxExperience initialConversationId={null} initialListingId='shared-listing' initialApplicantId='renter-B' />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('未找到指定对话'));
  expect(screen.queryByRole('textbox', { name: '消息内容' })).toBeNull();
  expect(fetchMock.mock.calls.every((call) => !(call[1] as RequestInit | undefined)?.method || (call[1] as RequestInit).method === 'GET')).toBe(true);
});

it('requires the listing and applicant to match the same thread', async () => {
  writeStoredAuthSession('host-token');
  mockThreads([thread('A'), { ...thread('B'), listingId: 'another-listing' }]);
  render(<InboxExperience initialConversationId={null} initialListingId='shared-listing' initialApplicantId='renter-B' />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('textbox', { name: '消息内容' })).toBeNull();
});

it('keeps the intended applicant in the login return destination', async () => {
  render(await InboxPage({ searchParams: Promise.resolve({ listingId: 'shared-listing', applicantId: 'renter-B' }) }));
  const login = await screen.findByRole('link', { name: '登录' });
  const loginUrl = new URL(login.getAttribute('href')!, 'https://example.com');
  const destination = new URL(loginUrl.searchParams.get('returnTo')!, 'https://example.com');
  expect(destination.searchParams.get('listingId')).toBe('shared-listing');
  expect(destination.searchParams.get('applicantId')).toBe('renter-B');
});

it('does not fall back to another conversation for an unavailable explicit id', async () => {
  writeStoredAuthSession('host-token');
  mockThreads([thread('A')]);
  render(<InboxExperience initialConversationId='thread-missing' />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('textbox', { name: '消息内容' })).toBeNull();
});

it('selects a new route target and discards the previous recipient draft on same-page navigation', async () => {
  writeStoredAuthSession('host-token');
  mockThreads([thread('A'), thread('B')]);
  const view = render(<InboxExperience initialConversationId='thread-A' />);
  await screen.findByRole('heading', { name: 'Applicant A' });
  fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: 'Private draft for A' } });
  view.rerender(<InboxExperience initialConversationId='thread-B' />);
  await screen.findByRole('heading', { name: 'Applicant B' });
  expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe('');
});

it.each(['confirm', 'decline'] as const)('binds a viewing %s to the displayed revision', async (decision) => {
  writeStoredAuthSession('host-token');
  const request = {
    id: 'viewing-1', threadId: 'thread-A', revision: 7, requesterId: 'renter-A',
    listingId: 'shared-listing', listingTitle: 'One shared listing', area: 'Westwood',
    timeLabel: 'June 1, 9 AM', iso: '2099-06-01T09:00:00.000Z', mode: 'in-person' as const,
    participantNames: ['Applicant A'], status: 'REQUESTED' as const,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z'
  };
  let changed = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deal-threads')) return Response.json([{ ...thread('A'), viewingRequests: [{ ...request, revision: changed ? 8 : 7, timeLabel: changed ? 'June 15, 11 PM' : request.timeLabel }] }]);
    if (url.endsWith('/roommate-conversations')) return Response.json([]);
    if (url.endsWith(`/viewing-1/${decision}`) && init?.method === 'POST') {
      changed = true;
      return Response.json({ message: '看房请求已更新，请刷新后重试' }, { status: 409 });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<InboxExperience initialConversationId='thread-A' />);
  fireEvent.click(await screen.findByRole('button', { name: decision === 'confirm' ? '确认预约' : '拒绝' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(`/viewing-1/${decision}`))).toBe(true));
  const [, sent] = fetchMock.mock.calls.find(([url]) => String(url).endsWith(`/viewing-1/${decision}`))!;
  expect(JSON.parse(String(sent?.body))).toEqual({ expectedRevision: 7 });
  await screen.findByText('June 15, 11 PM');
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('opens the exact applicant from the host contact link and sends only to that applicant', async () => {
  writeStoredAuthSession('host-token');
  const threads = [thread('A'), thread('B')];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return Response.json({ id: 'host', email: 'host@example.com', role: 'USER' });
    if (url.endsWith('/profiles/me')) return Response.json({ id: 'profile-host', role: 'lister', displayName: 'Host' });
    if (url.endsWith('/applications/host-inbox')) return Response.json([application('A'), application('B')]);
    if (url.endsWith('/deal-threads')) return Response.json(threads);
    if (url.endsWith('/roommate-conversations')) return Response.json([]);
    if (url.endsWith('/deal-threads/thread-B/messages') && init?.method === 'POST') return Response.json({ ...thread('B'), messages: [{ id: 'delivered', body: JSON.parse(String(init.body)).body, align: 'right', createdAt: '2026-09-01T00:00:00.000Z' }] });
    return Response.json({ message: `Unexpected route ${url}` }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const hostView = render(<HostApplicationsExperience />);
  const bCard = (await screen.findByText('Applicant B private note')).closest('article')!;
  const bContact = within(bCard).getByRole('link', { name: '要求补充' });
  const href = bContact.getAttribute('href')!;
  expect(new URL(href, 'https://example.com').searchParams.get('applicantId')).toBe('renter-B');
  const params = new URL(href, 'https://example.com').searchParams;
  hostView.unmount();
  render(await InboxPage({ searchParams: Promise.resolve(Object.fromEntries(params)) }));
  await screen.findByRole('heading', { name: 'Applicant B' });
  expect(screen.queryByRole('heading', { name: 'Applicant A' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: 'Applicant B, please clarify your private application note.' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/messages') && init?.method === 'POST')).toHaveLength(1));
  const [sentUrl, sentInit] = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/messages') && init?.method === 'POST')!;
  expect(String(sentUrl)).toContain('/deal-threads/thread-B/messages');
  expect(JSON.parse(String(sentInit?.body)).body).toContain('Applicant B');
});

it('renders descending roommate pages chronologically and marks the newest peer message as read', async () => {
  writeStoredAuthSession('renter-token');
  const messages = [3, 2, 1].map((n) => ({
    id: `message-${n}`, conversationId: 'roommate-thread', senderRole: 'peer',
    clientMessageId: `client-${n}`, body: `Peer message ${n}`, createdAt: `2026-09-01T0${n}:00:00.000Z`
  }));
  const conversation = {
    id: 'roommate-thread', matchId: 'match', peer: { id: 'peer', name: 'Peer roommate', age: 22, role: 'Student', image: null, match: 90, budget: '$1800', commute: 'Westwood', tags: [] },
    latestMessage: messages[0], unreadCount: 3, lastReadMessageId: null, lastReadAt: null,
    peerLastReadMessageId: null, peerLastReadAt: null, writable: true,
    lastMessageAt: messages[0].createdAt, updatedAt: messages[0].createdAt
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deal-threads')) return Response.json([]);
    if (url.endsWith('/roommate-conversations')) return Response.json([conversation]);
    // Matches real RoommateConversationsService.listMessages's DESC response contract.
    if (url.endsWith('/roommate-thread/messages')) return Response.json({ messages, nextCursor: null });
    if (url.endsWith('/roommate-thread/read')) return Response.json({ conversationId: conversation.id, self: { lastReadMessageId: JSON.parse(String(init?.body)).lastReadMessageId, lastReadAt: messages[0].createdAt }, peer: { lastReadMessageId: null, lastReadAt: null } });
    return Response.json({ message: `Unexpected route ${url}` }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<InboxExperience initialConversationId='roommate-thread' />);
  await screen.findByText('Peer message 1');
  const content = screen.getByRole('region', { name: '对话内容' });
  const allText = content.textContent!;
  expect(allText.indexOf('Peer message 1')).toBeLessThan(allText.indexOf('Peer message 2'));
  expect(allText.indexOf('Peer message 2')).toBeLessThan(allText.indexOf('Peer message 3'));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/read'))).toBe(true));
  const [, readInit] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/read'))!;
  expect(JSON.parse(String(readInit?.body))).toEqual({ lastReadMessageId: 'message-3' });
});
