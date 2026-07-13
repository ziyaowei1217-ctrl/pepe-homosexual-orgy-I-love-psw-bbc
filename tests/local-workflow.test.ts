import { describe, expect, it } from "vitest";

import {
  addLocalNotification,
  advanceLocalApplication,
  createLocalApplication,
  emptyLocalWorkflowState,
  normalizeLocalWorkflowState
} from "../lib/local-workflow";

describe("local workflow", () => {
  it("hydrates valid records and ignores malformed values", () => {
    expect(
      normalizeLocalWorkflowState({
        version: 1,
        favoriteListingIds: ["1", 2, "1"],
        contactedListingIds: ["2", null],
        dealThreads: {},
        viewingRequests: [],
        applications: [],
        notifications: []
      })
    ).toMatchObject({
      version: 1,
      favoriteListingIds: ["1"],
      contactedListingIds: ["2"]
    });
  });

  it("falls back safely for unknown or malformed state", () => {
    expect(normalizeLocalWorkflowState({ version: 99 })).toEqual(emptyLocalWorkflowState);
    expect(normalizeLocalWorkflowState(null)).toEqual(emptyLocalWorkflowState);
  });

  it("creates one application per listing and advances only that application", () => {
    const created = createLocalApplication([], {
      listingId: "1",
      listingTitle: "Westwood room",
      now: new Date("2026-07-12T10:00:00.000Z")
    });
    const duplicate = createLocalApplication(created, {
      listingId: "1",
      listingTitle: "Westwood room",
      now: new Date("2026-07-12T11:00:00.000Z")
    });
    const withSecond = createLocalApplication(duplicate, {
      listingId: "2",
      listingTitle: "Koreatown room",
      now: new Date("2026-07-12T12:00:00.000Z")
    });
    const advanced = advanceLocalApplication(withSecond, created[0].id);

    expect(duplicate).toEqual(created);
    expect(advanced.find((item) => item.listingId === "1")?.status).toBe("funds_held");
    expect(advanced.find((item) => item.listingId === "2")?.status).toBe("pending_payment");
  });

  it("caps escrow at completed", () => {
    const application = {
      id: "application-1",
      listingId: "1",
      listingTitle: "Westwood room",
      createdAt: 1,
      status: "completed" as const
    };

    expect(advanceLocalApplication([application], application.id)).toEqual([application]);
  });

  it("sorts notifications newest first and replaces duplicate ids", () => {
    const older = { id: "same", kind: "dm" as const, title: "Old", detail: "Old", createdAt: 1, read: false };
    const newer = { id: "same", kind: "dm" as const, title: "New", detail: "New", createdAt: 3, read: false };
    const other = { id: "other", kind: "tour" as const, title: "Tour", detail: "Tour", createdAt: 2, read: false };

    expect(addLocalNotification(addLocalNotification([older, other], newer), newer).map((item) => item.title)).toEqual([
      "New",
      "Tour"
    ]);
  });
});
