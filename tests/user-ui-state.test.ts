import { describe, expect, it } from "vitest";

import {
  emptyUserUiState,
  getUserUiStorageKey,
  markNotificationRead,
  normalizeUserUiState
} from "../lib/user-ui-state";

describe("user UI state", () => {
  it("isolates favorites per authenticated user and starts empty", () => {
    expect(getUserUiStorageKey("user-a")).toBe("sublet-user-ui-v2:user-a");
    expect(getUserUiStorageKey("user-b")).not.toBe(getUserUiStorageKey("user-a"));
    expect(emptyUserUiState.favoriteListingIds).toEqual([]);
  });

  it("does not migrate old workflow records into the new state", () => {
    expect(
      normalizeUserUiState({
        version: 1,
        favoriteListingIds: ["legacy"],
        applications: [{ id: "fake" }],
        dealThreads: { fake: {} }
      })
    ).toEqual(emptyUserUiState);
  });

  it("keeps only favorites and clickable local reminders", () => {
    const normalized = normalizeUserUiState({
      version: 2,
      favoriteListingIds: ["1", "1", 2],
      notifications: [
        {
          id: "tour-1",
          title: "看房请求已发送",
          detail: "Westwood",
          createdAt: 2,
          read: false,
          target: "/trips"
        },
        { id: 2 }
      ]
    });

    expect(normalized.favoriteListingIds).toEqual(["1"]);
    expect(normalized.notifications).toHaveLength(1);
    expect(normalized.notifications[0].target).toBe("/trips");
  });

  it("marks one reminder read without changing the others", () => {
    const notifications = [
      { id: "1", title: "一", detail: "a", createdAt: 2, read: false, target: "/messages" },
      { id: "2", title: "二", detail: "b", createdAt: 1, read: false, target: "/trips" }
    ];

    const next = markNotificationRead(notifications, "1");
    expect(next.map((item) => item.read)).toEqual([true, false]);
    expect(notifications[0].read).toBe(false);
  });
});
