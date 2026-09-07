// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { sendDealMessage } from '../lib/deal-message-commands';
import { writeStoredAuthSession } from '../lib/auth-session';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('rejects a stale session before dispatching any deal message', async () => {
  writeStoredAuthSession('new-token');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(sendDealMessage('stale-token', 'thread', 'Private message')).rejects.toThrow('登录状态已改变');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects a late response after the account changes and keeps the new account operation independent', async () => {
  writeStoredAuthSession('pending-account-A');
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>(done => { resolve = done; });
  const fetchMock = vi.fn().mockReturnValueOnce(response).mockResolvedValue(Response.json({ id: 'thread' }));
  vi.stubGlobal('fetch', fetchMock);
  const pending = sendDealMessage('pending-account-A', 'thread', 'Private message');
  const rejected = expect(pending).rejects.toThrow('登录状态已改变');
  writeStoredAuthSession('pending-account-B');
  await sendDealMessage('pending-account-B', 'thread', 'Private message');
  resolve(Response.json({ id: 'thread' }));
  await rejected;
  const first = JSON.parse(String(fetchMock.mock.calls[0][1].body));
  const second = JSON.parse(String(fetchMock.mock.calls[1][1].body));
  expect(first.clientMessageId).not.toBe(second.clientMessageId);
});
