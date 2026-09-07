// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SubletApp from '../components/sublet-app';
import * as api from '../lib/api';
import { writeStoredAuthSession } from '../lib/auth-session';

vi.mock('next/navigation', () => ({ usePathname: () => '/messages', useRouter: () => ({ push() {} }) }));
vi.mock('../lib/roommate-realtime', () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
vi.mock('../lib/api', async () => ({
  ...await vi.importActual<typeof import('../lib/api')>('../lib/api'),
  apiGet: vi.fn(), getSessionUser: vi.fn(), getMyProfile: vi.fn(), getRoommateConversations: vi.fn()
}));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('sends a required UUID and reuses it when the legacy deal panel retries a lost response', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  writeStoredAuthSession('legacy-deal-token');
  const listing = { id: 'listing-legacy', revision: 1, title: 'Westwood room', area: 'Westwood', image: '', price: 1800, originalPrice: 1800,
    beds: 1, baths: 1, commute: '12 min', transit: 'Bus', trust: 'Verified', tags: [], score: 90, status: 'APPROVED', media: [] };
  const thread = { id: 'legacy-thread', ownerId: 'renter', listingOwnerId: 'host', viewerRole: 'renter', dealRoomId: null,
    listingId: listing.id, listingTitle: listing.title, area: listing.area, contactName: 'Host', participantNames: ['Renter'], messages: [], viewingRequests: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  vi.mocked(api.apiGet).mockImplementation(async <T,>(path: string): Promise<T> =>
    (path === '/deal-threads' ? [thread] : path === '/listings' || path.startsWith('/listings?') ? [listing] : []) as T);
  vi.mocked(api.getSessionUser).mockResolvedValue({ id: 'renter', email: 'renter@example.com', role: 'USER' });
  vi.mocked(api.getMyProfile).mockResolvedValue({ id: 'profile', email: 'renter@example.com', displayName: 'Renter', school: 'UCLA', city: 'Los Angeles', role: 'renter', avatarUrl: null,
    eduEmailVerified: true, phoneVerified: false, wechat: null, instagram: null, bio: null });
  vi.mocked(api.getRoommateConversations).mockResolvedValue([]);
  const requests: Array<{ body: string; clientMessageId?: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/deal-threads/legacy-thread/messages')) {
      requests.push(JSON.parse(String(init?.body)));
      if (requests.length === 1) throw new Error('response lost after commit');
      return Response.json(thread);
    }
    return Response.json([]);
  }));
  render(<SubletApp initialSection='Messages' initialMessageListingId={listing.id} />);
  const composer = await screen.findByPlaceholderText('输入给房东的消息');
  fireEvent.change(composer, { target: { value: 'Friday?' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.click(await screen.findByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0].clientMessageId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(requests[1].clientMessageId).toBe(requests[0].clientMessageId);
});
