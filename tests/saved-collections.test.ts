import { describe, expect, it } from "vitest";

import {
  DEFAULT_SAVED_COLLECTION_ID,
  addSavedCollection,
  getSavedListingIds,
  normalizeSavedCollectionsState,
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
});
