import { describe, expect, it } from "vitest";

import { getUnreadNotificationCount, markNotificationsRead } from "../lib/notification-center";

const notifications = [
  { id: "1", title: "DM", detail: "New DM", createdAt: 2, read: false, target: "/messages" },
  { id: "2", title: "Tour", detail: "Tour", createdAt: 1, read: true, target: "/trips" }
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
