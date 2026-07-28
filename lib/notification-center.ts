import type { LocalReminder } from "./user-ui-state";

export function getUnreadNotificationCount(notifications: LocalReminder[]) {
  return notifications.filter((notification) => !notification.read).length;
}

export function markNotificationsRead(notifications: LocalReminder[]) {
  return notifications.map((notification) => (notification.read ? notification : { ...notification, read: true }));
}
