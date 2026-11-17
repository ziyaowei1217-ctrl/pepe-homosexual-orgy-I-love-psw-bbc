export const DEFAULT_SAVED_COLLECTION_ID = "all";
/** The account keeps at most this many lists, 全部收藏 included (api/src/user-documents/user-document-values.ts). */
export const MAX_SAVED_COLLECTIONS = 50;
/** The account keeps notes up to this length (api/src/user-documents/user-document-values.ts) and refuses longer ones. */
export const MAX_SAVED_NOTE_LENGTH = 2000;

/** Cuts a note to the account's limit without splitting an emoji (half of one cannot be stored). */
function cutNote(note: string) {
  if (note.length <= MAX_SAVED_NOTE_LENGTH) return note;
  return note.slice(0, /[\uD800-\uDBFF]/.test(note.charAt(MAX_SAVED_NOTE_LENGTH - 1)) ? MAX_SAVED_NOTE_LENGTH - 1 : MAX_SAVED_NOTE_LENGTH);
}

export type SavedCollection = {
  id: string;
  name: string;
  listingIds: string[];
};

export type SavedCollectionsState = {
  version: 1;
  collections: SavedCollection[];
  notes: Record<string, string>;
};

export function normalizeSavedCollectionsState(
  value: unknown,
  legacyFavoriteIds: string[] = []
): SavedCollectionsState {
  const parsedCollections = isRecord(value) && value.version === 1 && Array.isArray(value.collections)
    ? value.collections.flatMap((collection) => normalizeCollection(collection))
    : [];
  const defaultCollection = parsedCollections.find((collection) => collection.id === DEFAULT_SAVED_COLLECTION_ID);
  const migratedIds = uniqueStrings([
    ...(defaultCollection?.listingIds ?? []),
    ...legacyFavoriteIds
  ]);
  const otherCollections = parsedCollections.filter((collection) => collection.id !== DEFAULT_SAVED_COLLECTION_ID);

  return {
    version: 1,
    collections: [
      {
        id: DEFAULT_SAVED_COLLECTION_ID,
        name: "全部收藏",
        listingIds: migratedIds
      },
      ...dedupeCollections(otherCollections)
    ],
    notes: isRecord(value) && isRecord(value.notes)
      ? Object.fromEntries(
          Object.entries(value.notes)
            .filter(
              (entry): entry is [string, string] =>
                entry[0].trim().length > 0 && typeof entry[1] === "string"
            )
            .map(([listingId, note]) => [listingId, cutNote(note)])
        )
      : {}
  };
}

export function getSavedListingIds(state: SavedCollectionsState) {
  return uniqueStrings(state.collections.flatMap((collection) => collection.listingIds));
}

/** Merge a retained guest snapshot again safely if its storage cleanup was interrupted. */
export function mergeSavedCollectionsState(account: SavedCollectionsState, guest: SavedCollectionsState): SavedCollectionsState {
  const collections = account.collections.map(collection => ({ ...collection, listingIds: [...collection.listingIds] }));
  for (const incoming of guest.collections) {
    let id = incoming.id;
    let existing = collections.find(collection => collection.id === id);
    let suffix = 1;
    while (existing && existing.name !== incoming.name && id !== DEFAULT_SAVED_COLLECTION_ID) {
      id = `${incoming.id}-guest${suffix === 1 ? "" : `-${suffix}`}`;
      suffix += 1;
      existing = collections.find(collection => collection.id === id);
    }
    if (existing) existing.listingIds = uniqueStrings([...existing.listingIds, ...incoming.listingIds]);
    else collections.push({ ...incoming, id, listingIds: [...incoming.listingIds] });
  }

  const notes = new Map(Object.entries(account.notes));
  for (const [listingId, note] of Object.entries(guest.notes)) {
    const existing = notes.get(listingId);
    if (!existing) notes.set(listingId, note);
    else if (note && existing !== note && !existing.endsWith(`\n\n${note}`)) {
      notes.set(listingId, cutNote(`${existing}\n\n${note}`));
    }
  }
  return { version: 1, collections, notes: Object.fromEntries(notes) };
}

/**
 * Adds an empty list. Without an `id`, the id comes from the name, and a name whose id another list already has is
 * refused; conflictingSavedCollection says which list that is.
 */
export function addSavedCollection(
  state: SavedCollectionsState,
  name: string,
  id = createCollectionId(name)
) {
  const normalizedName = name.trim();
  const normalizedId = id.trim();
  if (
    !normalizedName ||
    !normalizedId ||
    state.collections.length >= MAX_SAVED_COLLECTIONS ||
    state.collections.some((collection) => collection.id === normalizedId)
  ) {
    return state;
  }

  return {
    ...state,
    collections: [...state.collections, { id: normalizedId, name: normalizedName, listingIds: [] }]
  };
}

/**
 * Deletes one of the renter's own lists. Its homes stay saved: any that are in no other list move to 全部收藏.
 * 全部收藏 itself cannot be deleted.
 */
export function removeSavedCollection(state: SavedCollectionsState, collectionId: string): SavedCollectionsState {
  const removed = state.collections.find((collection) => collection.id === collectionId);
  if (!removed || removed.id === DEFAULT_SAVED_COLLECTION_ID) return state;
  const remaining = state.collections.filter((collection) => collection.id !== collectionId);
  const stillSaved = new Set(remaining.flatMap((collection) => collection.listingIds));
  const keep = removed.listingIds.filter((listingId) => !stillSaved.has(listingId));
  return {
    ...state,
    collections: remaining.map((collection) => collection.id === DEFAULT_SAVED_COLLECTION_ID && keep.length > 0
      ? { ...collection, listingIds: [...collection.listingIds, ...keep] }
      : collection)
  };
}

export function toggleListingInCollection(
  state: SavedCollectionsState,
  listingId: string,
  collectionId = DEFAULT_SAVED_COLLECTION_ID
) {
  const normalizedListingId = listingId.trim();
  if (!normalizedListingId) return state;

  let foundCollection = false;
  const collections = state.collections.map((collection) => {
    if (collection.id !== collectionId) return collection;
    foundCollection = true;
    const isIncluded = collection.listingIds.includes(normalizedListingId);
    return {
      ...collection,
      listingIds: isIncluded
        ? collection.listingIds.filter((id) => id !== normalizedListingId)
        : [...collection.listingIds, normalizedListingId]
    };
  });

  if (!foundCollection) return state;
  return { ...state, collections };
}

export function setSavedListingNote(
  state: SavedCollectionsState,
  listingId: string,
  note: string
): SavedCollectionsState {
  const normalizedListingId = listingId.trim();
  if (!normalizedListingId) return state;
  const notes = { ...state.notes };
  const normalizedNote = cutNote(note.trim());
  if (normalizedNote) notes[normalizedListingId] = normalizedNote;
  else delete notes[normalizedListingId];
  return { ...state, notes };
}

export function getSavedCollectionsStorageKey(userId?: string | null) {
  return userId
    ? `sublet-saved-collections-v1:${userId}`
    : "sublet-saved-collections-v1:guest";
}

function normalizeCollection(value: unknown): SavedCollection[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return [];
  const id = value.id.trim();
  const name = value.name.trim();
  if (!id || !name) return [];
  return [{ id, name, listingIds: uniqueStrings(value.listingIds) }];
}

function dedupeCollections(collections: SavedCollection[]) {
  const seen = new Set<string>();
  return collections.filter((collection) => {
    if (seen.has(collection.id)) return false;
    seen.add(collection.id);
    return true;
  });
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

/**
 * The list a new list with this name would clash with: one with the same name, or one whose name gives the same id
 * (it differs only in case, spacing, punctuation or emoji). Null when the name can be used.
 */
export function conflictingSavedCollection(state: SavedCollectionsState, name: string) {
  const normalizedName = name.trim();
  const id = createCollectionId(normalizedName);
  return state.collections.find((collection) => collection.name === normalizedName || collection.id === id) ?? null;
}

/**
 * A list's id depends only on its name, so the same name made on two devices before they sync becomes one list
 * (as do two names that differ only in case, spacing, punctuation or emoji; one device refuses the second of those).
 * A name with no Latin letters, digits or Chinese characters uses its other letters and digits (kana, Cyrillic,
 * accented letters), and one with none of those (only emoji or symbols) its code points. Names that had an id before
 * keep the same one.
 */
function createCollectionId(name: string) {
  const lower = name.trim().toLowerCase();
  const slug = toSlug(lower.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-"))
    || toSlug(lower.replace(/[^\p{L}\p{N}]+/gu, "-"))
    || Array.from(lower, (character) => character.codePointAt(0)!.toString(16)).join("-");
  return slug ? `collection-${slug.slice(0, 120)}` : "";
}

function toSlug(value: string) {
  return value.replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
