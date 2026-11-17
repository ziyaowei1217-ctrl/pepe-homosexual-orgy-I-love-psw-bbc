// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SavedListingsProvider, useSavedListings } from '../components/marketplace/saved-listings-provider';
import { SavedPageExperience } from '../components/marketplace/saved-page-experience';
import { writeStoredAuthSession } from '../lib/auth-session';
import { getSavedCollectionsStorageKey, normalizeSavedCollectionsState, toggleListingInCollection } from '../lib/saved-collections';
import { createPreviewListings } from '../lib/preview-data';
import { getGuestUiStorageKey, getUserUiStorageKey } from '../lib/user-ui-state';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('preserves guest saved notes and custom collection membership when logging in', async () => {
  const listing = createPreviewListings()[0];
  const guestKey = getSavedCollectionsStorageKey(null);
  const userKey = getSavedCollectionsStorageKey('renter');
  localStorage.setItem(guestKey, JSON.stringify(toggleListingInCollection(normalizeSavedCollectionsState(null), listing.id)));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/auth/me')) return Response.json({ id: 'renter', email: 'renter@example.com', role: 'USER' });
    return Response.json({ message: 'Unexpected path' }, { status: 404 });
  }));
  render(<SavedListingsProvider><SavedPageExperience listings={[listing]} /></SavedListingsProvider>);
  const note = await screen.findByRole('textbox', { name: `${listing.title} 的收藏备注` });
  fireEvent.change(note, { target: { value: 'Visit on Friday; host allows my cat.' } });
  fireEvent.blur(note);
  fireEvent.click(screen.getByRole('button', { name: '新建清单' }));
  fireEvent.change(screen.getByPlaceholderText('例如：九月入住'), { target: { value: 'Friday visits' } });
  fireEvent.click(screen.getByRole('button', { name: '创建清单' }));
  fireEvent.change(screen.getByRole('combobox', { name: `${listing.title} 所属清单` }), { target: { value: 'collection-friday-visits' } });
  await waitFor(() => expect(localStorage.getItem(guestKey)).toContain('Visit on Friday; host allows my cat.'));
  expect(JSON.parse(localStorage.getItem(guestKey)!).collections).toContainEqual({ id: 'collection-friday-visits', name: 'Friday visits', listingIds: [listing.id] });
  await act(async () => writeStoredAuthSession('new-user-token'));
  await screen.findByText(/^收藏(会|已|先)/);
  // Storage is written by an effect after the merged copy renders.
  await waitFor(() => {
    const migrated = JSON.parse(localStorage.getItem(userKey)!);
    expect(migrated.collections[0].listingIds).toContain(listing.id);
    expect(migrated.collections).toContainEqual({ id: 'collection-friday-visits', name: 'Friday visits', listingIds: [listing.id] });
    expect(migrated.notes).toEqual({ [listing.id]: 'Visit on Friday; host allows my cat.' });
    expect(localStorage.getItem(guestKey)).toBeNull();
  });
  expect(screen.getByRole('button', { name: /Friday visits/ })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: `${listing.title} 的收藏备注` })).toHaveProperty('value', 'Visit on Friday; host allows my cat.');
});

const guestState = {
  version: 1,
  collections: [
    { id: 'all', name: '全部收藏', listingIds: ['guest-home'] },
    { id: 'same-id', name: 'Guest viewings', listingIds: ['shared-home'] },
    { id: 'empty-guest', name: 'Plans for later', listingIds: [] }
  ],
  notes: { 'shared-home': 'Guest note about a cat.', 'guest-home': 'Friday viewing.' }
};
const accountState = {
  version: 1,
  collections: [
    { id: 'all', name: '全部收藏', listingIds: ['account-home'] },
    { id: 'same-id', name: 'Account shortlist', listingIds: ['account-home'] },
    { id: 'same-id-guest', name: 'Existing distinct list', listingIds: ['other-home'] }
  ],
  notes: { 'shared-home': 'Account note about parking.', 'account-home': 'Keep this account note.' }
};
function installSignedInStorage() {
  const guestKey = getSavedCollectionsStorageKey(null);
  const accountKey = getSavedCollectionsStorageKey('renter');
  localStorage.setItem(guestKey, JSON.stringify(guestState));
  localStorage.setItem(accountKey, JSON.stringify(accountState));
  writeStoredAuthSession('renter-token');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'renter', email: 'renter@example.com' })));
  return { guestKey, accountKey };
}
function SavedStateProbe() {
  const { state, hydrated } = useSavedListings();
  return <output data-testid="saved-state">{hydrated ? JSON.stringify(state) : 'loading'}</output>;
}
function provider() {
  return <SavedListingsProvider><SavedStateProbe /></SavedListingsProvider>;
}
async function hydratedState() {
  await waitFor(() => expect(screen.getByTestId('saved-state').textContent).not.toBe('loading'));
  return JSON.parse(screen.getByTestId('saved-state').textContent!);
}
function expectMerged(state: typeof accountState) {
  expect(state.collections).toContainEqual({ id: 'same-id', name: 'Account shortlist', listingIds: ['account-home'] });
  expect(state.collections).toContainEqual({ id: 'same-id-guest', name: 'Existing distinct list', listingIds: ['other-home'] });
  expect(state.collections).toContainEqual(expect.objectContaining({ name: 'Guest viewings', listingIds: ['shared-home'] }));
  expect(state.collections).toContainEqual(expect.objectContaining({ name: 'Plans for later', listingIds: [] }));
  expect(new Set(state.collections.map(collection => collection.id)).size).toBe(state.collections.length);
  expect(state.notes['shared-home']).toContain('Account note about parking.');
  expect(state.notes['shared-home']).toContain('Guest note about a cat.');
  expect(state.notes).toMatchObject({ 'account-home': 'Keep this account note.', 'guest-home': 'Friday viewing.' });
}
it('preserves both sides of ID and note collisions and persists the account before deleting guest data', async () => {
  const { guestKey, accountKey } = installSignedInStorage();
  const originalRemove = Storage.prototype.removeItem;
  const persistedAtRemoval: unknown[] = [];
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key === guestKey) persistedAtRemoval.push(JSON.parse(this.getItem(accountKey)!));
    originalRemove.call(this, key);
  });
  render(provider());
  expectMerged(await hydratedState());
  await waitFor(() => expect(persistedAtRemoval).toHaveLength(1));
  expectMerged(persistedAtRemoval[0] as typeof accountState);
  expect(localStorage.getItem(guestKey)).toBeNull();
});

it('retries an incomplete source cleanup without duplicating collections or notes', async () => {
  const { guestKey, accountKey } = installSignedInStorage();
  const originalRemove = Storage.prototype.removeItem;
  const removal = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key !== guestKey) originalRemove.call(this, key);
  });
  const first = render(provider());
  const once = await hydratedState();
  expectMerged(once);
  first.unmount();
  removal.mockRestore();
  render(provider());
  expect(await hydratedState()).toEqual(once);
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(once);
    expect(localStorage.getItem(guestKey)).toBeNull();
  });
});

class StorageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Storage failure</p> : this.props.children; }
}
it('retains guest and previous account data when account storage fails, then recovers on retry', async () => {
  const { guestKey, accountKey } = installSignedInStorage();
  const originalSet = Storage.prototype.setItem;
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === accountKey) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    originalSet.call(this, key, value);
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const first = render(<StorageErrorBoundary>{provider()}</StorageErrorBoundary>);
  await waitFor(() => expect(writes.mock.calls.some(([key]) => key === accountKey)).toBe(true));
  expect(JSON.parse(localStorage.getItem(guestKey)!)).toEqual(guestState);
  expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(accountState);
  first.unmount();
  writes.mockRestore();
  render(provider());
  expectMerged(await hydratedState());
  await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
});

it('clears migrated legacy favorites without removing unrelated guest notifications', async () => {
  const { accountKey } = installSignedInStorage();
  const notification = { id: 'reminder', title: 'Keep', detail: 'Guest reminder', createdAt: 1, read: false, target: '/saved' };
  localStorage.setItem(getGuestUiStorageKey(), JSON.stringify({ version: 2, favoriteListingIds: ['legacy-home'], notifications: [notification] }));
  render(provider());
  const merged = await hydratedState();
  expect(merged.collections[0].listingIds).toContain('legacy-home');
  // Hydration renders before the persistence effect. Verify its durable result
  // separately instead of assuming both happen within one scheduler turn.
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(accountKey)!).collections[0].listingIds).toContain('legacy-home');
    expect(JSON.parse(localStorage.getItem(getGuestUiStorageKey())!)).toEqual({ version: 2, favoriteListingIds: [], notifications: [notification] });
  });
});

function UnsaveButton({ listingId }: { listingId: string }) {
  const { toggleSaved, savedIds } = useSavedListings();
  return savedIds.has(listingId) ? <button type="button" onClick={() => toggleSaved(listingId)}>{`remove ${listingId}`}</button> : null;
}
const reminder = { id: 'reminder', title: 'Keep', detail: 'Reminder', createdAt: 1, read: false, target: '/saved' };

it.each([
  { who: 'an account', legacyKey: getUserUiStorageKey('renter'), collectionsKey: getSavedCollectionsStorageKey('renter'), signedIn: true },
  { who: 'a guest', legacyKey: getGuestUiStorageKey(), collectionsKey: getSavedCollectionsStorageKey(null), signedIn: false }
])('copies old-format favorites for $who once, so a home removed later is not added back at the next load', async ({ legacyKey, collectionsKey, signedIn }) => {
  localStorage.setItem(legacyKey, JSON.stringify({ version: 2, favoriteListingIds: ['legacy-home'], notifications: [reminder] }));
  if (signedIn) writeStoredAuthSession('renter-token');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
    ? Response.json({ id: 'renter', email: 'renter@example.com', role: 'USER' })
    : Response.json({ message: 'Unexpected path' }, { status: 404 })));
  const first = render(<SavedListingsProvider><SavedStateProbe /><UnsaveButton listingId="legacy-home" /></SavedListingsProvider>);
  expect((await hydratedState()).collections[0].listingIds).toContain('legacy-home');
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(collectionsKey)!).collections[0].listingIds).toContain('legacy-home');
    expect(JSON.parse(localStorage.getItem(legacyKey)!)).toEqual({ version: 2, favoriteListingIds: [], notifications: [reminder] });
  });
  fireEvent.click(screen.getByRole('button', { name: 'remove legacy-home' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(collectionsKey)!).collections[0].listingIds).not.toContain('legacy-home'));
  first.unmount();

  render(<SavedListingsProvider><SavedStateProbe /></SavedListingsProvider>);
  expect((await hydratedState()).collections[0].listingIds).not.toContain('legacy-home');
  expect(JSON.parse(localStorage.getItem(collectionsKey)!).collections[0].listingIds).not.toContain('legacy-home');
});
