// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InboxExperience } from '../components/marketplace/inbox-experience';
import { writeStoredAuthSession } from '../lib/auth-session';
import type { ApiRoommateConversation, ApiRoommateMessage } from '../lib/api';
import type { createRoommateRealtimeClient } from '../lib/roommate-realtime';

type RealtimeOptions = Parameters<typeof createRoommateRealtimeClient>[0];
const realtime = vi.hoisted(() => ({ options: null as RealtimeOptions | null }));
vi.mock('../lib/roommate-realtime', () => ({ createRoommateRealtimeClient: (options: RealtimeOptions) => {
  realtime.options = options;
  return { connect() {}, disconnect() {} };
} }));
beforeEach(() => { writeStoredAuthSession('inbox-token'); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); realtime.options = null; });
function message(n: number, senderRole: 'self' | 'peer' = 'peer', body = `Message ${n}`): ApiRoommateMessage {
  return { id: `message-${n}`, conversationId: 'roommate-thread', clientMessageId: `client-${n}`, senderRole, body, createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString() };
}
function conversation(latest = message(3)): ApiRoommateConversation {
  return { id: 'roommate-thread', matchId: 'match', peer: { id: 'peer', name: 'Roommate', age: 22, role: 'Student', image: null, match: 90, budget: '$1800', commute: 'UCLA', tags: [] }, latestMessage: latest,
    unreadCount: 3, lastReadMessageId: null, lastReadAt: null, peerLastReadMessageId: null, peerLastReadAt: null,
    writable: true, lastMessageAt: latest.createdAt, updatedAt: latest.createdAt };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(options: { summary?: ApiRoommateConversation; summaryResponse?: () => Promise<Response> | Response; page?: (cursor?: string) => Promise<Response> | Response; post?: (body: { body: string; clientMessageId: string }) => Promise<Response> | Response } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deal-threads')) return Response.json([]);
    if (url.endsWith('/roommate-conversations')) return options.summaryResponse?.() ?? Response.json([options.summary ?? conversation()]);
    if (url.endsWith('/roommate-thread/messages') && init?.method === 'POST') return options.post!(JSON.parse(String(init.body)));
    if (url.includes('/roommate-thread/messages')) return options.page?.(new URL(url).searchParams.get('cursor') ?? undefined) ?? Response.json({ messages: [message(3), message(2), message(1)], nextCursor: null });
    if (url.endsWith('/roommate-thread/read')) return Response.json({});
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<InboxExperience initialConversationId='roommate-thread' />);
  return fetchMock;
}
const content = () => within(screen.getByRole('region', { name: '对话内容' }));
function emit(item: ApiRoommateMessage) {
  act(() => realtime.options!.onEvent({ name: 'roommate.message.created', payload: { conversationId: item.conversationId, message: item } }));
}
function send(body: string) {
  fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
}

it('keeps loaded history and recovers messages missed during a reconnect', async () => {
  let pages = 0;
  setup({ page: () => Response.json({ messages: (++pages === 1 ? [message(3), message(2), message(1)] : [message(5), message(4), message(3)]), nextCursor: null }) });
  await content().findByText('Message 1');
  act(() => realtime.options!.onReconnect());
  await content().findByText('Message 4');
  for (let n = 1; n <= 5; n++) expect(content().getAllByText(`Message ${n}`)).toHaveLength(1);
});

it('does not erase messages when a conversation summary is refreshed', async () => {
  setup();
  await content().findByText('Message 1');
  await act(async () => { realtime.options!.onEvent({ name: 'roommate.conversation.updated', payload: { conversationId: 'roommate-thread' } }); });
  expect(content().getByText('Message 1')).toBeTruthy();
  expect(content().getByText('Message 2')).toBeTruthy();
});

it('fills the gap across multiple pages after more than 50 messages arrive offline', async () => {
  let reconnected = false;
  setup({ page: (cursor) => {
    if (!reconnected) return Response.json({ messages: [message(3), message(2), message(1)], nextCursor: null });
    const rows = cursor ? Array.from({ length: 10 }, (_, i) => message(10 - i)) : Array.from({ length: 50 }, (_, i) => message(60 - i));
    return Response.json({ messages: rows, nextCursor: cursor ? null : 'older-page' });
  } });
  await content().findByText('Message 1');
  reconnected = true;
  act(() => realtime.options!.onReconnect());
  await content().findByText('Message 4');
  for (let n = 1; n <= 60; n++) expect(content().getAllByText(`Message ${n}`)).toHaveLength(1);
});

it('recovers every offline page when the last completed conversation was empty', async () => {
  const first = deferred<Response>();
  let reconnected = false;
  setup({ summary: { ...conversation(), latestMessage: null, unreadCount: 0, lastMessageAt: null }, page: (cursor) => {
    if (!reconnected) return first.promise;
    const rows = cursor ? Array.from({ length: 10 }, (_, i) => message(10 - i)) : Array.from({ length: 50 }, (_, i) => message(60 - i));
    return Response.json({ messages: rows, nextCursor: cursor ? null : 'older-page' });
  } });
  await screen.findByRole('heading', { name: 'Roommate' });
  await act(async () => first.resolve(Response.json({ messages: [], nextCursor: null })));
  reconnected = true;
  act(() => realtime.options!.onReconnect());
  await content().findByText('Message 1');
  for (let n = 1; n <= 60; n++) expect(content().getAllByText(`Message ${n}`)).toHaveLength(1);
});

it('merges a live message that arrives before the initial history response', async () => {
  const page = deferred<Response>();
  setup({ page: () => page.promise });
  await content().findByText('Message 3');
  emit(message(4));
  await act(async () => page.resolve(Response.json({ messages: [message(3), message(2), message(1)], nextCursor: null })));
  expect(content().getByText('Message 4')).toBeTruthy();
  expect(content().getByText('Message 1')).toBeTruthy();
});

it('does not discard incoming messages or a newly typed draft when a send completes', async () => {
  const response = deferred<Response>();
  setup({ post: () => response.promise });
  await content().findByText('Message 1');
  send('First draft');
  fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: 'Second draft' } });
  emit(message(5));
  await act(async () => response.resolve(Response.json(message(4, 'self', 'First draft'))));
  expect(content().getByText('Message 5')).toBeTruthy();
  expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe('Second draft');
  const text = screen.getByRole('region', { name: '对话内容' }).textContent!;
  expect(text.indexOf('First draft')).toBeLessThan(text.indexOf('Message 5'));
});

it('retries a lost message response with the original client id and stores only one message', async () => {
  const committed = new Map<string, ApiRoommateMessage>();
  const ids: string[] = [];
  setup({ post: ({ body, clientMessageId }) => {
    ids.push(clientMessageId);
    if (!committed.has(clientMessageId)) committed.set(clientMessageId, { ...message(4, 'self', body), id: `stored-${committed.size}`, clientMessageId });
    if (ids.length === 1) throw new TypeError('response lost after commit');
    return Response.json(committed.get(clientMessageId));
  } });
  await content().findByText('Message 1');
  send('Only once');
  await screen.findByRole('alert');
  await waitFor(() => expect((screen.getByRole('button', { name: '发送消息' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await content().findByText('Only once');
  expect(ids[1]).toBe(ids[0]);
  expect(committed.size).toBe(1);
});

it('marks a live peer message read only while its conversation is visible', async () => {
  const fetchMock = setup();
  await content().findByText('Message 1');
  emit(message(4));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/roommate-thread/read') &&
    JSON.parse(String(init?.body)).lastReadMessageId === 'message-4')).toBe(true));
});

it('keeps background messages unread and synchronizes after returning to the tab', async () => {
  let visible = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  const fetchMock = setup();
  await content().findByText('Message 1');
  emit(message(4));
  await act(async () => {});
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/roommate-thread/read'))).toBe(false);
  const initialDeals = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/deal-threads')).length;
  fireEvent.focus(window);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/deal-threads'))).toHaveLength(initialDeals);
  visible = true;
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/roommate-thread/read'))).toBe(true));
});

it('disables sending when an ended roommate conversation is read-only', async () => {
  const fetchMock = setup({ summary: { ...conversation(), writable: false } });
  await content().findByText('Message 1');
  const draft = screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement;
  expect(draft.disabled).toBe(true);
  fireEvent.change(draft, { target: { value: 'Do not send' } });
  fireEvent.submit(draft.closest('form')!);
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/messages') && init?.method === 'POST')).toBe(false);
});

it('refreshes unread summaries from realtime read and unread hints', async () => {
  const fetchMock = setup();
  await content().findByText('Message 1');
  await act(async () => {
    realtime.options!.onEvent({ name: 'roommate.unread.updated', payload: { conversationId: 'roommate-thread' } });
  });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/roommate-conversations')).length).toBeGreaterThan(1);
});

it('coalesces a burst of realtime hints into one active refresh and one follow-up', async () => {
  const pending = deferred<Response>();
  let requests = 0;
  setup({ summaryResponse: () => ++requests === 2 ? pending.promise : Response.json([conversation()]) });
  await content().findByText('Message 1');
  act(() => {
    for (let index = 0; index < 10; index++) realtime.options!.onEvent({ name: 'roommate.unread.updated', payload: {} });
  });
  expect(requests).toBe(2);
  await act(async () => { pending.resolve(Response.json([conversation()])); });
  expect(requests).toBe(3);
});
