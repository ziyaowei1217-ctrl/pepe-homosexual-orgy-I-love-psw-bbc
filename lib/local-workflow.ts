import type { DealThread, ViewingRequest } from "./deal-workflow";

export const applicationStatuses = [
  "pending_payment",
  "funds_held",
  "confirmed",
  "move_in_pending",
  "completed"
] as const;

export type LocalApplicationStatus = (typeof applicationStatuses)[number];

export type LocalApplication = {
  id: string;
  listingId: string;
  listingTitle: string;
  createdAt: number;
  status: LocalApplicationStatus;
};

export type LocalNotificationKind = "match" | "dm" | "tour" | "application" | "escrow";

export type LocalNotification = {
  id: string;
  kind: LocalNotificationKind;
  title: string;
  detail: string;
  createdAt: number;
  read: boolean;
};

export type LocalWorkflowState = {
  version: 1;
  favoriteListingIds: string[];
  contactedListingIds: string[];
  dealThreads: Record<string, DealThread>;
  viewingRequests: ViewingRequest[];
  applications: LocalApplication[];
  notifications: LocalNotification[];
};

export const emptyLocalWorkflowState: LocalWorkflowState = {
  version: 1,
  favoriteListingIds: ["1"],
  contactedListingIds: [],
  dealThreads: {},
  viewingRequests: [],
  applications: [],
  notifications: []
};

export function normalizeLocalWorkflowState(value: unknown): LocalWorkflowState {
  if (!isRecord(value) || value.version !== 1) return cloneEmptyState();

  return {
    version: 1,
    favoriteListingIds: uniqueStrings(value.favoriteListingIds, ["1"]),
    contactedListingIds: uniqueStrings(value.contactedListingIds),
    dealThreads: normalizeDealThreads(value.dealThreads),
    viewingRequests: Array.isArray(value.viewingRequests)
      ? value.viewingRequests.filter(isViewingRequest)
      : [],
    applications: Array.isArray(value.applications)
      ? value.applications.filter(isLocalApplication)
      : [],
    notifications: Array.isArray(value.notifications)
      ? value.notifications.filter(isLocalNotification).sort((left, right) => right.createdAt - left.createdAt)
      : []
  };
}

export function createLocalApplication(
  applications: LocalApplication[],
  input: { listingId: string; listingTitle: string; now: Date }
) {
  if (applications.some((application) => application.listingId === input.listingId)) return applications;

  return [
    ...applications,
    {
      id: `application-${input.listingId}`,
      listingId: input.listingId,
      listingTitle: input.listingTitle,
      createdAt: input.now.getTime(),
      status: "pending_payment" as const
    }
  ];
}

export function advanceLocalApplication(applications: LocalApplication[], applicationId: string) {
  return applications.map((application) => {
    if (application.id !== applicationId) return application;
    const index = applicationStatuses.indexOf(application.status);
    const status = applicationStatuses[Math.min(index + 1, applicationStatuses.length - 1)];
    return status === application.status ? application : { ...application, status };
  });
}

export function addLocalNotification(notifications: LocalNotification[], notification: LocalNotification) {
  return [notification, ...notifications.filter((item) => item.id !== notification.id)]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 50);
}

function cloneEmptyState(): LocalWorkflowState {
  return {
    ...emptyLocalWorkflowState,
    favoriteListingIds: [...emptyLocalWorkflowState.favoriteListingIds],
    contactedListingIds: [],
    dealThreads: {},
    viewingRequests: [],
    applications: [],
    notifications: []
  };
}

function uniqueStrings(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

function normalizeDealThreads(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, DealThread] => isDealThread(entry[1]))
  );
}

function isDealThread(value: unknown): value is DealThread {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.listingId === "string" &&
    typeof value.subject === "string" &&
    Array.isArray(value.participants) &&
    value.participants.every((item) => typeof item === "string") &&
    Array.isArray(value.messages) &&
    typeof value.lastActivityAt === "number"
  );
}

function isViewingRequest(value: unknown): value is ViewingRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.listingId === "string" &&
    typeof value.listingTitle === "string" &&
    typeof value.area === "string" &&
    typeof value.timeLabel === "string" &&
    typeof value.iso === "string" &&
    (value.mode === "in-person" || value.mode === "video") &&
    Array.isArray(value.participantNames) &&
    value.participantNames.every((item) => typeof item === "string") &&
    ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].includes(String(value.status))
  );
}

function isLocalApplication(value: unknown): value is LocalApplication {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.listingId === "string" &&
    typeof value.listingTitle === "string" &&
    typeof value.createdAt === "number" &&
    applicationStatuses.includes(value.status as LocalApplicationStatus)
  );
}

function isLocalNotification(value: unknown): value is LocalNotification {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ["match", "dm", "tour", "application", "escrow"].includes(String(value.kind)) &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.read === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
