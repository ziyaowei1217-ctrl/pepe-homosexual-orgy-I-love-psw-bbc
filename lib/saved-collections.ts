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
  /** Oldest to newest, independent of collection membership or catalog order. */
  savedOrder?: string[];
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

  const collections = [
    { id: DEFAULT_SAVED_COLLECTION_ID, name: "全部收藏", listingIds: migratedIds },
    ...dedupeCollections(otherCollections)
  ];
  const activeIds = uniqueStrings(collections.flatMap((collection) => collection.listingIds));
  return {
    version: 1,
    collections,
    savedOrder: uniqueStrings([...(isRecord(value) ? uniqueStrings(value.savedOrder) : []), ...activeIds]).filter((id) => activeIds.includes(id)),
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
  const activeIds = uniqueStrings(state.collections.flatMap((collection) => collection.listingIds));
  return uniqueStrings([...(state.savedOrder ?? []), ...activeIds]).filter((id) => activeIds.includes(id));
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
  return { version: 1, collections, notes: Object.fromEntries(notes), savedOrder: uniqueStrings([...getSavedListingIds(account), ...getSavedListingIds(guest)]) };
}

export function addSavedCollection(
  state: SavedCollectionsState,
  name: string,
  id = createCollectionId(name)
) {
  const normalizedName = name.trim();
  let normalizedId = id.trim();
  if (getSavedCollectionNameError(state, normalizedName) || !normalizedId) {
    return state;
  }
  const baseId = normalizedId;
  let suffix = 2;
  while (state.collections.some((collection) => collection.id === normalizedId)) normalizedId = `${baseId}-${suffix++}`;

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
  const activeIds = uniqueStrings(collections.flatMap((collection) => collection.listingIds));
  return { ...state, collections, savedOrder: uniqueStrings([...getSavedListingIds(state), normalizedListingId]).filter((id) => activeIds.includes(id)) };
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
  const slug = name.trim().normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return slug ? `collection-${slug}` : "";
}

export function getSavedCollectionNameError(state: SavedCollectionsState, name: string) {
  const normalizedName = name.trim().normalize("NFC");
  if (!normalizedName || !createCollectionId(normalizedName)) return "清单名称需要包含文字或数字。";
  if (state.collections.some((collection) => collection.name.normalize("NFC").toLowerCase() === normalizedName.toLowerCase())) return "同名清单已存在，请使用其他名称。";
  return null;
}

export type SavedCollectionsMutation =
  | { kind: "saved"; listingId: string; included: boolean }
  | { kind: "membership"; listingId: string; collectionId: string; included: boolean }
  | { kind: "collection"; name: string; id: string }
  | { kind: "note"; listingId: string; note: string };

/** Replay user intentions after asynchronous hydration, including collection-ID collisions. */
export function applySavedCollectionsMutations(state: SavedCollectionsState, commands: SavedCollectionsMutation[]) {
  const collectionIds = new Map<string, string>();
  let next = state;
  for (const command of commands) {
    if (command.kind === "collection") {
      const existing = next.collections.find((collection) => collection.name.normalize("NFC").toLowerCase() === command.name.normalize("NFC").toLowerCase());
      if (existing) collectionIds.set(command.id, existing.id);
      else {
        const created = addSavedCollection(next, command.name, command.id);
        const collection = created.collections.at(-1);
        if (created !== next && collection) collectionIds.set(command.id, collection.id);
        next = created;
      }
    } else if (command.kind === "note") next = setSavedListingNote(next, command.listingId, command.note);
    else if (command.kind === "membership") {
      const collectionId = collectionIds.get(command.collectionId) ?? command.collectionId;
      const included = next.collections.find((collection) => collection.id === collectionId)?.listingIds.includes(command.listingId) ?? false;
      if (included !== command.included) next = toggleListingInCollection(next, command.listingId, collectionId);
    } else if (command.included) {
      if (!getSavedListingIds(next).includes(command.listingId)) next = toggleListingInCollection(next, command.listingId);
    } else {
      next = next.collections.reduce((current, collection) => collection.listingIds.includes(command.listingId) ? toggleListingInCollection(current, command.listingId, collection.id) : current, next);
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
