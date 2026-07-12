import { describe, expect, it } from "vitest";

import { getUnreadNotificationCount, markNotificationsRead } from "../lib/notification-center";

const notifications = [
  { id: "1", kind: "dm" as const, title: "DM", detail: "New DM", createdAt: 2, read: false },
  { id: "2", kind: "tour" as const, title: "Tour", detail: "Tour", createdAt: 1, read: true }
];

describe("notification center", () => {
  it("counts unread events", () => {
    expect(getUnreadNotificationCount(notifications)).toBe(1);
  });

  it("marks every visible event read without mutating input", () => {
    const read = markNotificationsRead(notifications);
    expect(read.every((item) => item.read)).toBe(true);
    expect(notifications[0].read).toBe(false);
  });
});
