import { describe, expect, it } from "vitest";

import {
  DEFAULT_SAVED_COLLECTION_ID,
  MAX_SAVED_NOTE_LENGTH,
  addSavedCollection,
  getSavedListingIds,
  mergeSavedCollectionsState,
  normalizeSavedCollectionsState,
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
});
