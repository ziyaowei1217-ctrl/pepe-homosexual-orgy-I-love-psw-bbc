import type { LocalNotification } from "./local-workflow";

export function getUnreadNotificationCount(notifications: LocalNotification[]) {
  return notifications.filter((notification) => !notification.read).length;
}

export function markNotificationsRead(notifications: LocalNotification[]) {
  return notifications.map((notification) => (notification.read ? notification : { ...notification, read: true }));
}
