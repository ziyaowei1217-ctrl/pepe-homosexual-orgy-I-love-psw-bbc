// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SavedListingsProvider, useSavedListings } from '../components/marketplace/saved-listings-provider';
import { SavedPageExperience } from '../components/marketplace/saved-page-experience';
import { writeStoredAuthSession } from '../lib/auth-session';
import { applySavedCollectionsMutations, getSavedCollectionsStorageKey, getSavedListingIds, normalizeSavedCollectionsState } from '../lib/saved-collections';
import { createPreviewListings } from '../lib/preview-data';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const listings = createPreviewListings().slice(0, 2);
function Actions() {
  const saved = useSavedListings();
  return <><output data-testid='saved-state'>{JSON.stringify({ state: saved.state, hydrated: saved.hydrated })}</output>
    <button onClick={() => saved.toggleSaved('existing')}>Save existing</button>
    <button onClick={() => saved.toggleSaved(listings[0].id)}>Save first</button>
    <button onClick={() => saved.toggleSaved(listings[1].id)}>Save second</button>
    <button onClick={() => saved.createCollection('Weekend views')}>Create weekend</button>
    <button onClick={() => saved.toggleInCollection(listings[0].id, 'collection-weekend-views')}>Group first</button>
    <button onClick={() => saved.setNote(listings[0].id, 'Pending viewing note')}>Note first</button>
  </>;
}
function state() { return JSON.parse(screen.getByTestId('saved-state').textContent!); }

it('replays immediate saves, notes and memberships onto the delayed account/guest merge without losing ID collisions', async () => {
  const accountKey = getSavedCollectionsStorageKey('account');
  localStorage.setItem(accountKey, JSON.stringify({ version: 1, collections: [{ id: 'all', name: '全部收藏', listingIds: ['existing'] }, { id: 'collection-weekend-views', name: 'Account only', listingIds: ['account-only'] }], notes: { shared: 'Account parking note', existing: 'Keep me' } }));
  localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({ version: 1, collections: [{ id: 'all', name: '全部收藏', listingIds: ['guest-home'] }], notes: { shared: 'Guest cat note' } }));
  writeStoredAuthSession('signed-in');
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  render(<SavedListingsProvider><Actions /></SavedListingsProvider>);
  for (const name of ['Save existing', 'Save first', 'Create weekend', 'Group first', 'Note first', 'Save second']) fireEvent.click(screen.getByRole('button', { name }));
  expect(state().hydrated).toBe(false);
  expect(getSavedListingIds(state().state)).toEqual(['existing', listings[0].id, listings[1].id]);
  await act(async () => resolve(Response.json({ id: 'account', email: 'account@example.test' })));
  await waitFor(() => expect(state().hydrated).toBe(true));
  const saved = state().state;
  expect(getSavedListingIds(saved)).toEqual(['existing', 'account-only', 'guest-home', listings[0].id, listings[1].id]);
  expect(saved.collections).toContainEqual({ id: 'collection-weekend-views', name: 'Account only', listingIds: ['account-only'] });
  expect(saved.collections).toContainEqual({ id: 'collection-weekend-views-2', name: 'Weekend views', listingIds: [listings[0].id] });
  expect(saved.notes).toEqual({ shared: 'Account parking note\n\nGuest cat note', existing: 'Keep me', [listings[0].id]: 'Pending viewing note' });
  await waitFor(() => expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(saved));
  expect(localStorage.getItem(getSavedCollectionsStorageKey(null))).toBeNull();
});

it('replaying saved intentions twice is idempotent and preserves notes and recency', () => {
  const commands = [{ kind: 'saved', listingId: 'new', included: true }, { kind: 'collection', id: 'plans', name: 'Plans' }, { kind: 'membership', listingId: 'new', collectionId: 'plans', included: true }, { kind: 'note', listingId: 'new', note: 'Keep this' }] as const;
  const once = applySavedCollectionsMutations(normalizeSavedCollectionsState(null, ['old']), [...commands]);
  expect(applySavedCollectionsMutations(once, [...commands])).toEqual(once);
});

it('orders actual save interactions by recency, including saves kept only in a custom collection', async () => {
  render(<SavedListingsProvider><Actions /><SavedPageExperience listings={listings} /></SavedListingsProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Save first' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save second' }));
  expect(screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)).toEqual([listings[1].title, listings[0].title]);
  fireEvent.click(screen.getByRole('button', { name: 'Create weekend' }));
  fireEvent.click(screen.getByRole('button', { name: 'Group first' }));
  fireEvent.change(screen.getByRole('combobox', { name: '收藏排序' }), { target: { value: 'price-low' } });
  expect(screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)).toEqual([listings[0].title, listings[1].title]);
  fireEvent.change(screen.getByRole('combobox', { name: '收藏排序' }), { target: { value: 'recent' } });
  expect(screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)).toEqual([listings[1].title, listings[0].title]);
});

it('keeps emoji-only creation open with an accessible error, supports Unicode letters, and preserves duplicate input', () => {
  render(<SavedListingsProvider><SavedPageExperience listings={listings} /></SavedListingsProvider>);
  fireEvent.click(screen.getByRole('button', { name: '新建清单' }));
  const input = screen.getByRole('textbox', { name: '清单名称' });
  fireEvent.change(input, { target: { value: '🏠' } });
  fireEvent.click(screen.getByRole('button', { name: '创建清单' }));
  expect(screen.getByRole('alert').textContent).toContain('文字或数字');
  expect(input).toHaveProperty('value', '🏠');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(input, { target: { value: 'Москва' } });
  fireEvent.click(screen.getByRole('button', { name: '创建清单' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Москва 0' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '新建清单' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Москва' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '创建清单' }));
  expect(within(dialog).getByRole('alert').textContent).toContain('同名清单');
  expect(within(dialog).getByRole('textbox')).toHaveProperty('value', 'Москва');
});

it('restores an account note into a card mounted while hydration is pending and does not erase it on an untouched blur', async () => {
  const accountKey = getSavedCollectionsStorageKey('account');
  localStorage.setItem(accountKey, JSON.stringify({ version: 1, collections: [{ id: 'all', name: '全部收藏', listingIds: [listings[0].id] }], notes: { [listings[0].id]: 'Existing account viewing note' } }));
  writeStoredAuthSession('signed-in');
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  render(<SavedListingsProvider><Actions /><SavedPageExperience listings={listings} /></SavedListingsProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Save first' }));
  const note = screen.getByRole('textbox', { name: `${listings[0].title} 的收藏备注` });
  expect(note).toHaveProperty('value', '');
  await act(async () => resolve(Response.json({ id: 'account', email: 'account@example.test' })));
  await waitFor(() => expect(note).toHaveProperty('value', 'Existing account viewing note'));
  fireEvent.blur(note);
  expect(state().state.notes[listings[0].id]).toBe('Existing account viewing note');
  fireEvent.change(note, { target: { value: 'A new note with spaces ' } });
  expect(note).toHaveProperty('value', 'A new note with spaces ');
  fireEvent.blur(note);
  await waitFor(() => expect(JSON.parse(localStorage.getItem(accountKey)!).notes[listings[0].id]).toBe('A new note with spaces'));
});
