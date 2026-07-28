export type LocalReminder = {
  id: string;
  title: string;
  detail: string;
  createdAt: number;
  read: boolean;
  target: string;
};

export type UserUiState = {
  version: 2;
  favoriteListingIds: string[];
  notifications: LocalReminder[];
};

export const emptyUserUiState: UserUiState = {
  version: 2,
  favoriteListingIds: [],
  notifications: []
};

export const legacyProductStorageKeys = [
  "sublet-pipeline-local-workflow-v1",
  "sublet-roommate-match-flow-v1",
  "sublet-roommate-dm-threads-v1"
] as const;

export function getUserUiStorageKey(userId: string) {
  return `sublet-user-ui-v2:${userId}`;
}

export function normalizeUserUiState(value: unknown): UserUiState {
  if (!isRecord(value) || value.version !== 2) return cloneEmptyState();

  return {
    version: 2,
    favoriteListingIds: uniqueStrings(value.favoriteListingIds),
    notifications: Array.isArray(value.notifications)
      ? value.notifications.filter(isLocalReminder).sort((left, right) => right.createdAt - left.createdAt)
      : []
  };
}

export function addLocalReminder(
  notifications: LocalReminder[],
  notification: LocalReminder
) {
  return [notification, ...notifications.filter((item) => item.id !== notification.id)]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 50);
}

export function markNotificationRead(notifications: LocalReminder[], notificationId: string) {
  return notifications.map((notification) =>
    notification.id === notificationId && !notification.read
      ? { ...notification, read: true }
      : notification
  );
}

export function markAllNotificationsRead(notifications: LocalReminder[]) {
  return notifications.map((notification) =>
    notification.read ? notification : { ...notification, read: true }
  );
}

export function clearLegacyProductStorage(storage: Pick<Storage, "removeItem">) {
  legacyProductStorageKeys.forEach((key) => storage.removeItem(key));
}

function isLocalReminder(value: unknown): value is LocalReminder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.read === "boolean" &&
    typeof value.target === "string" &&
    value.target.startsWith("/")
  );
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    )
  );
}

function cloneEmptyState(): UserUiState {
  return {
    version: 2,
    favoriteListingIds: [],
    notifications: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
