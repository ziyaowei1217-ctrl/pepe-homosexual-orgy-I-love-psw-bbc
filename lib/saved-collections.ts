export const DEFAULT_SAVED_COLLECTION_ID = "all";

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
          Object.entries(value.notes).filter(
            (entry): entry is [string, string] =>
              entry[0].trim().length > 0 && typeof entry[1] === "string"
          )
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
      notes.set(listingId, `${existing}\n\n${note}`);
    }
  }
  return { version: 1, collections, notes: Object.fromEntries(notes) };
}

export function addSavedCollection(
  state: SavedCollectionsState,
  name: string,
  id = createCollectionId(name)
) {
  const normalizedName = name.trim();
  const normalizedId = id.trim();
  if (!normalizedName || !normalizedId || state.collections.some((collection) => collection.id === normalizedId)) {
    return state;
  }

  return {
    ...state,
    collections: [...state.collections, { id: normalizedId, name: normalizedName, listingIds: [] }]
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
  const normalizedNote = note.trim();
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

function createCollectionId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `collection-${slug}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
