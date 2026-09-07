// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InboxExperience } from '../components/marketplace/inbox-experience';
import { writeStoredAuthSession } from '../lib/auth-session';
import type { ApiDealThread } from '../lib/api';

vi.mock('../lib/roommate-realtime', () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function thread(id = 'thread-A'): ApiDealThread {
  return { id, ownerId: 'renter', listingOwnerId: 'host', viewerRole: 'renter', dealRoomId: null, listingId: `listing-${id}`,
    listingTitle: 'Westwood room', area: 'Westwood', contactName: id, participantNames: ['Renter'], messages: [], viewingRequests: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

function backend() {
  const stored = new Map<string, { id: string; threadId: string; body: string }>();
  const requests: Array<{ threadId: string; clientMessageId?: string; body: string }> = [];
  let loseResponse = true;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deal-threads')) return Response.json([thread(), thread('thread-B')]);
    if (url.endsWith('/roommate-conversations')) return Response.json([]);
    const match = url.match(/\/deal-threads\/([^/]+)\/messages$/);
    if (match && init?.method === 'POST') {
      const command = { ...JSON.parse(String(init.body)), threadId: match[1] };
      requests.push(command);
      // Mirrors the intended server contract: without a supplied identity every retry inserts.
      const key = command.clientMessageId ?? globalThis.crypto.randomUUID();
      if (!stored.has(key)) stored.set(key, { id: key, threadId: command.threadId, body: command.body });
      if (loseResponse) { loseResponse = false; throw new Error('response lost after commit'); }
      return Response.json({ ...thread(command.threadId), messages: [...stored.values()].filter(message => message.threadId === command.threadId)
        .map(message => ({ ...message, align: 'right', createdAt: '2026-09-01T00:00:00.000Z' })) });
    }
    return Response.json({}, { status: 404 });
  }));
  return { stored, requests, loseNextResponse() { loseResponse = true; } };
}

async function send(body: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: '消息内容' }), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
}

it('reuses an unconfirmed deal message ID after a lost response, then allocates a new ID for a confirmed repeat', async () => {
  writeStoredAuthSession('renter-token');
  const server = backend();
  render(<InboxExperience initialConversationId='thread-A' />);
  await send('Friday?');
  await screen.findByRole('alert');
  expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe('Friday?');
  await send('Friday?');
  await waitFor(() => expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe(''));
  expect(server.stored.size).toBe(1);
  expect(server.requests[0].clientMessageId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(server.requests[1].clientMessageId).toBe(server.requests[0].clientMessageId);
  await send('Friday?');
  await waitFor(() => expect(server.requests).toHaveLength(3));
  expect(server.requests[2].clientMessageId).not.toBe(server.requests[0].clientMessageId);
  expect(server.stored.size).toBe(2);
});

it('does not reuse a failed message operation for an edited payload', async () => {
  writeStoredAuthSession('renter-token');
  const server = backend();
  render(<InboxExperience initialConversationId='thread-A' />);
  await send('Friday?');
  await screen.findByRole('alert');
  await send('Saturday?');
  await waitFor(() => expect(server.requests).toHaveLength(2));
  expect(server.requests[0].clientMessageId).toEqual(expect.any(String));
  expect(server.requests[1].clientMessageId).not.toBe(server.requests[0].clientMessageId);
  expect(server.stored.size).toBe(2);
});

it('retains the unresolved identity across route changes and a complete Inbox remount', async () => {
  writeStoredAuthSession('route-renter-token');
  const server = backend();
  const view = render(<InboxExperience initialConversationId='thread-A' />);
  await send('Friday?');
  await screen.findByRole('alert');
  view.rerender(<InboxExperience initialConversationId='thread-B' />);
  await screen.findByRole('heading', { name: 'thread-B' });
  await send('Friday?');
  await waitFor(() => expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe(''));
  view.unmount();
  render(<InboxExperience initialConversationId='thread-A' />);
  await send('Friday?');
  await waitFor(() => expect((screen.getByRole('textbox', { name: '消息内容' }) as HTMLTextAreaElement).value).toBe(''));
  expect(server.requests[1].clientMessageId).not.toBe(server.requests[0].clientMessageId);
  expect(server.requests[2].clientMessageId).toBe(server.requests[0].clientMessageId);
  expect(server.stored.size).toBe(2);
});

it('does not reuse an unresolved operation after the authenticated account changes', async () => {
  writeStoredAuthSession('first-account-token');
  const server = backend();
  render(<InboxExperience initialConversationId='thread-A' />);
  await send('Friday?');
  await screen.findByRole('alert');
  await act(async () => { writeStoredAuthSession('second-account-token'); });
  await send('Friday?');
  await waitFor(() => expect(server.requests).toHaveLength(2));
  expect(server.requests[1].clientMessageId).not.toBe(server.requests[0].clientMessageId);
});
