// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InboxExperience } from '../components/marketplace/inbox-experience';
import { writeStoredAuthSession } from '../lib/auth-session';
import type { ApiDealThread, ApiRoommateMessage } from '../lib/api';
import type { createRoommateRealtimeClient } from '../lib/roommate-realtime';
type RealtimeOptions = Parameters<typeof createRoommateRealtimeClient>[0];
const realtime = vi.hoisted(() => ({ options: null as RealtimeOptions | null }));
vi.mock('../lib/roommate-realtime', () => ({ createRoommateRealtimeClient: (options: RealtimeOptions) => { realtime.options = options; return { connect() {}, disconnect() {} }; } }));
beforeEach(() => writeStoredAuthSession('history-token'));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); realtime.options = null; });
function message(n: number, body = `Message ${n}`): ApiRoommateMessage {
  return { id: `message-${n}`, conversationId: 'history-thread', clientMessageId: `client-${n}`, senderRole: 'peer', body, createdAt: new Date(Date.UTC(2026, 8, 1, 0, n)).toISOString() };
}
function dealMessage(n: number) { const item = message(n); return { id: item.id, threadId: 'history-thread', senderName: 'Host', status: 'sent' as const, body: item.body, align: 'left' as const, createdAt: item.createdAt }; }
function dealThread(latest = 5): ApiDealThread { return { id: 'history-thread', ownerId: 'renter', listingOwnerId: 'host', viewerRole: 'renter', listingId: 'home', listingTitle: 'History home', area: 'LA', contactName: 'Host', participantNames: [], messages: [dealMessage(latest)], messagePageInfo: { nextCursor: 'preview-cursor', hasMore: true }, viewingRequests: [], createdAt: message(1).createdAt, updatedAt: message(latest).createdAt }; }
function setup(source: 'deal' | 'roommate', height = 120) {
  let refreshed = false;
  const tops = new WeakMap<Element, number>();
  const isHistory = (element: Element) => element.getAttribute('aria-label') === '消息历史';
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return isHistory(this) ? height : 0; });
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) { return isHistory(this) ? Math.max(height, this.querySelectorAll('p.whitespace-pre-wrap').length * 100 + (this.querySelector('button') ? 40 : 0)) : 0; });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) { return tops.get(this) ?? 0; });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value) { tops.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight))); });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const path = url.pathname;
    if (path.endsWith('/deal-threads')) return Response.json(source === 'deal' ? [dealThread(refreshed ? 7 : 5)] : []);
    if (path.endsWith('/roommate-conversations')) return Response.json(source === 'roommate' ? [{ id: 'history-thread', peer: { name: 'Roommate', role: 'Student', id: 'peer' }, latestMessage: message(refreshed ? 7 : 5), unreadCount: 0, writable: true }] : []);
    if (path.endsWith('/history-thread/messages') && init?.method === 'POST') { const body = JSON.parse(String(init.body)); return Response.json(source === 'roommate' ? { ...message(8, body.body), senderRole: 'self', clientMessageId: body.clientMessageId } : { ...dealThread(8), messages: [{ ...dealMessage(8), body: body.body, align: 'right' }] }); }
    if (path.endsWith('/history-thread/messages')) {
      const earlier = url.searchParams.has('cursor');
      const numbers = earlier ? [1, 2, 3] : refreshed ? [5, 6, 7] : [3, 4, 5];
      return Response.json({ messages: source === 'deal' ? numbers.map(dealMessage) : [...numbers].reverse().map(n => message(n)), nextCursor: earlier ? null : 'older-cursor' });
    }
    if (path.endsWith('/read')) return Response.json({});
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<InboxExperience initialConversationId='history-thread' />);
  return { fetchMock, reconnect() { refreshed = true; act(() => realtime.options!.onReconnect()); fireEvent.focus(window); } };
}
const history = () => screen.getByLabelText('消息历史');
const content = () => within(screen.getByRole('region', { name: '对话内容' }));

it.each(['deal', 'roommate'] as const)('loads actual %s cursor pages, preserves reading position on prepend and keeps older messages after reconnect', async source => {
  const { fetchMock, reconnect } = setup(source);
  await content().findByText('Message 3');
  expect(history().scrollTop).toBe(220);
  history().scrollTop = 20;
  fireEvent.scroll(history());
  fireEvent.click(screen.getByRole('button', { name: '加载较早消息' }));
  await content().findByText('Message 1');
  expect(history().scrollTop).toBe(180);
  expect(content().getAllByText('Message 3')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '加载较早消息' })).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('cursor=older-cursor'))).toBe(true);
  history().scrollTop = 30;
  fireEvent.scroll(history());
  reconnect();
  await content().findByText('Message 7');
  for (let n = 1; n <= 7; n++) expect(content().getAllByText(`Message ${n}`)).toHaveLength(1);
  expect(history().scrollTop).toBe(30);
});

it.each([120, 600])('opens short/tall history at the latest exchange and reveals a successful own send at viewport height %i', async height => {
  setup('roommate', height);
  await content().findByText('Message 3');
  expect(history().scrollTop).toBe(Math.max(0, history().scrollHeight - height));
  history().scrollTop = 0;
  fireEvent.scroll(history());
  fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: 'Own message' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await content().findByText('Own message');
  await waitFor(() => expect(history().scrollTop).toBe(Math.max(0, history().scrollHeight - height)));
});

it('follows live messages near the bottom but preserves a reader browsing older messages', async () => {
  setup('roommate');
  await content().findByText('Message 3');
  act(() => realtime.options!.onEvent({ name: 'roommate.message.created', payload: { conversationId: 'history-thread', message: message(6) } }));
  expect(history().scrollTop).toBe(history().scrollHeight - history().clientHeight);
  history().scrollTop = 10;
  fireEvent.scroll(history());
  act(() => realtime.options!.onEvent({ name: 'roommate.message.created', payload: { conversationId: 'history-thread', message: message(7) } }));
  expect(history().scrollTop).toBe(10);
});
