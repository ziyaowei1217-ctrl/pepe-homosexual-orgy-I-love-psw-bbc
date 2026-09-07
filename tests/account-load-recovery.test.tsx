// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountExperience } from '../components/marketplace/account-experience';
import { readStoredAuthSession, writeStoredAuthSession } from '../lib/auth-session';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it.each([
  ['/profiles/me', 503],
  ['/auth/me', 500]
] as const)('keeps a valid session after %s returns %i and lets the account reload', async (failedEndpoint, status) => {
  writeStoredAuthSession('valid-token');
  let failed = true;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (failed && url.endsWith(failedEndpoint)) return Response.json({}, { status });
    if (url.endsWith('/auth/me')) return Response.json({ id: 'user', email: 'user@example.com', role: 'USER' });
    if (url.endsWith('/profiles/me')) {
      return Response.json({ id: 'profile', displayName: 'Recovered User', role: 'renter' });
    }
    if (url.endsWith('/applications/mine')) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
  render(<AccountExperience mode='overview' />);
  await screen.findByRole('alert');
  expect(readStoredAuthSession()?.accessToken).toBe('valid-token');
  expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: '重新加载账户' }));
  await screen.findByRole('heading', { name: '你好，Recovered User' });
  expect(readStoredAuthSession()?.accessToken).toBe('valid-token');
});
it('clears an actually expired credential and offers login', async () => {
  writeStoredAuthSession('expired-token');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 401 })));
  render(<AccountExperience mode='overview' />);
  await screen.findByRole('button', { name: '发送验证码' });
  await waitFor(() => expect(readStoredAuthSession()).toBeNull());
});
