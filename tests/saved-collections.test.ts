import { describe, expect, it } from "vitest";

import {
  DEFAULT_SAVED_COLLECTION_ID,
  MAX_SAVED_COLLECTIONS,
  MAX_SAVED_NOTE_LENGTH,
  addSavedCollection,
  getSavedListingIds,
  mergeSavedCollectionsState,
  normalizeSavedCollectionsState,
  removeSavedCollection,
  setSavedListingNote,
  toggleListingInCollection
} from "../lib/saved-collections";

describe("saved listing collections", () => {
  it("migrates device-local legacy favorites into a default collection", () => {
    const state = normalizeSavedCollectionsState(null, ["listing-a", "listing-a", "listing-b"]);

    expect(state.collections).toEqual([
      {
        id: DEFAULT_SAVED_COLLECTION_ID,
        name: "全部收藏",
        listingIds: ["listing-a", "listing-b"]
      }
    ]);
    expect(getSavedListingIds(state)).toEqual(["listing-a", "listing-b"]);
  });

  it("keeps a listing saved while it still belongs to another collection", () => {
    const initial = addSavedCollection(
      normalizeSavedCollectionsState(null, ["listing-a"]),
      "九月入住",
      "september"
    );
    const inBoth = toggleListingInCollection(initial, "listing-a", "september");
    const removedFromDefault = toggleListingInCollection(
      inBoth,
      "listing-a",
      DEFAULT_SAVED_COLLECTION_ID
    );

    expect(getSavedListingIds(removedFromDefault)).toEqual(["listing-a"]);
    expect(removedFromDefault.collections.find((item) => item.id === "september")?.listingIds).toEqual(["listing-a"]);
  });

  it("keeps notes within what the account stores, without cutting an emoji in half", () => {
    const empty = normalizeSavedCollectionsState(null);
    const long = setSavedListingNote(empty, "home-1", "备".repeat(MAX_SAVED_NOTE_LENGTH + 10));
    expect(long.notes["home-1"]).toHaveLength(MAX_SAVED_NOTE_LENGTH);
    // An emoji is two UTF-16 units; one starting at the last allowed unit is dropped whole.
    const emoji = setSavedListingNote(empty, "home-1", `${"x".repeat(MAX_SAVED_NOTE_LENGTH - 1)}😀`);
    expect(emoji.notes["home-1"]).toBe("x".repeat(MAX_SAVED_NOTE_LENGTH - 1));
    expect(normalizeSavedCollectionsState({ version: 1, collections: [], notes: { "home-1": "y".repeat(MAX_SAVED_NOTE_LENGTH * 2) } }).notes["home-1"])
      .toHaveLength(MAX_SAVED_NOTE_LENGTH);
    // Joining a guest note onto the account's note stays within the limit too.
    const account = setSavedListingNote(empty, "home-1", "a".repeat(1500));
    const guest = setSavedListingNote(empty, "home-1", "b".repeat(1500));
    expect(mergeSavedCollectionsState(account, guest).notes["home-1"]).toHaveLength(MAX_SAVED_NOTE_LENGTH);
  });

  it("stops at the account's list limit, and deletes a list without unsaving its homes", () => {
    let state = normalizeSavedCollectionsState(null, ["listing-a"]);
    for (let index = 1; index < MAX_SAVED_COLLECTIONS + 5; index += 1) state = addSavedCollection(state, `清单 ${index}`, `list-${index}`);
    expect(state.collections).toHaveLength(MAX_SAVED_COLLECTIONS);
    expect(state.collections[0].id).toBe(DEFAULT_SAVED_COLLECTION_ID);

    state = toggleListingInCollection(state, "listing-a", "list-1");
    state = toggleListingInCollection(state, "listing-b", "list-1");
    state = toggleListingInCollection(state, "listing-c", "list-1");
    state = toggleListingInCollection(state, "listing-c", "list-2");
    const removed = removeSavedCollection(state, "list-1");
    expect(removed.collections.map((collection) => collection.id)).not.toContain("list-1");
    // listing-a is in 全部收藏 already and listing-c is still in list-2; listing-b was only in the deleted list.
    expect(removed.collections[0].listingIds).toEqual(["listing-a", "listing-b"]);
    expect(getSavedListingIds(removed).sort()).toEqual(["listing-a", "listing-b", "listing-c"]);
    expect(removeSavedCollection(removed, DEFAULT_SAVED_COLLECTION_ID)).toBe(removed);
    expect(removeSavedCollection(removed, "missing")).toBe(removed);
    // Deleting one makes room for one more.
    expect(addSavedCollection(removed, "新清单", "list-new").collections).toHaveLength(MAX_SAVED_COLLECTIONS);
  });
});
