// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoommatesExperience } from '../components/marketplace/roommate-experiences';
import { writeStoredAuthSession } from '../lib/auth-session';
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
function candidate(id: number, target = `profile-${id}`) { return { id: `candidate-${id}`, actionTargetId: target, name: `Alex ${id}`, age: 23, role: 'Student', image: 'https://example.com/person.png', match: 90, budget: '$1800', commute: 'LA', tags: [] }; }
it('uses fresh eligible batches after actions while keeping filters, deduplicating targets and following advertised cursors if needed', async () => {
  writeStoredAuthSession('deck-token');
  window.history.replaceState(null, '', '/roommates?city=Boston&budgetMin=1200');
  const actions: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/deck')) {
      const cursor = url.searchParams.get('cursor');
      // A repeated first page exercises deduplication even when actions are not
      // reflected immediately by a replica; a real shrinking deck returns 3 here.
      return Response.json({ items: cursor ? [candidate(3)] : [candidate(1), candidate(11, 'profile-1'), candidate(2)], pageInfo: { nextCursor: cursor ? null : 2 } });
    }
    if (url.pathname.endsWith('/actions')) { actions.push(url.pathname); return Response.json({ conversation: null }); }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<RoommatesExperience />);
  fireEvent.click(await screen.findByRole('button', { name: '跳过 Alex 1' }));
  fireEvent.click(await screen.findByRole('button', { name: '跳过 Alex 2' }));
  await screen.findByRole('button', { name: '跳过 Alex 3' });
  expect(actions).toHaveLength(2);
  expect(screen.queryByText('当前没有新的推荐，稍后再来看看。')).toBeNull();
  const deckUrls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/deck?')).map(([url]) => new URL(String(url)));
  expect(deckUrls.some(url => url.searchParams.get('cursor') === '2')).toBe(true);
  expect(deckUrls.every(url => url.searchParams.get('city') === 'Boston' && url.searchParams.get('budgetMin') === '1200')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '跳过 Alex 3' }));
  await waitFor(() => expect(screen.getByText('当前没有新的推荐，稍后再来看看。')).toBeTruthy());
});
