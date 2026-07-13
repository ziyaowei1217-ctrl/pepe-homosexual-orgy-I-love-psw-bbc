export type DealWorkflowListing = {
  id: string;
  title: string;
  area: string;
};

export type DealMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  align: "left" | "right";
  status: "received" | "sent";
};

export type DealThread = {
  id: string;
  listingId: string;
  subject: string;
  participants: string[];
  messages: DealMessage[];
  lastActivityAt: number;
};

export type ViewingMode = "in-person" | "video";

export type ViewingSlot = {
  id: string;
  label: string;
  iso: string;
  mode: ViewingMode;
};

export type ViewingRequestStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export type ViewingRequest = {
  id: string;
  listingId: string;
  listingTitle: string;
  area: string;
  timeLabel: string;
  iso: string;
  mode: ViewingMode;
  participantNames: string[];
  status: ViewingRequestStatus;
};

export type BuildInitialDealThreadInput = {
  listing: DealWorkflowListing;
  contactName: string;
  participantNames: string[];
};

export type AppendDealMessageInput = {
  body: string;
  now: Date;
  senderName: string;
};

export type CreateViewingRequestInput = {
  listing: DealWorkflowListing;
  participantNames: string[];
  previousCount: number;
  slot: ViewingSlot;
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function buildInitialDealThread({
  listing,
  contactName,
  participantNames
}: BuildInitialDealThreadInput): DealThread {
  const participants = uniqueNames([contactName, ...participantNames]);
  const neighborhood = getNeighborhood(listing.area);

  return {
    id: `listing-${listing.id}-host`,
    listingId: listing.id,
    subject: listing.title,
    participants,
    lastActivityAt: 0,
    messages: [
      {
        id: `${listing.id}-seed-1`,
        author: contactName,
        body: `${neighborhood} 这套还在，可先发偏好和看房时间。`,
        time: "10:24 AM",
        align: "left",
        status: "received"
      },
      {
        id: `${listing.id}-seed-2`,
        author: "You",
        body: `我这边会和 ${formatNameList(participantNames)} 对齐预算和时间。`,
        time: "10:27 AM",
        align: "right",
        status: "sent"
      }
    ]
  };
}

export function appendDealMessage(thread: DealThread, input: AppendDealMessageInput): DealThread {
  const body = input.body.trim();
  if (!body) return thread;

  return {
    ...thread,
    lastActivityAt: input.now.getTime(),
    participants: uniqueNames([...thread.participants, input.senderName]),
    messages: [
      ...thread.messages,
      {
        id: `${thread.id}-message-${thread.messages.length + 1}`,
        author: input.senderName,
        body,
        time: formatMessageTime(input.now),
        align: "right",
        status: "sent"
      }
    ]
  };
}

export function buildViewingSlots(startIso: string): ViewingSlot[] {
  const start = parseIsoDate(startIso);
  const offsets = [
    { days: 0, hour: 18, minute: 30, mode: "video" as const },
    { days: 1, hour: 12, minute: 0, mode: "in-person" as const },
    { days: 2, hour: 11, minute: 0, mode: "in-person" as const },
    { days: 3, hour: 17, minute: 0, mode: "video" as const }
  ];

  return offsets.map((offset, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset.days, offset.hour, offset.minute));
    const iso = date.toISOString();

    return {
      id: `slot-${index + 1}`,
      label: `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${weekdayLabels[date.getUTCDay()]} ${padTime(offset.hour)}:${padTime(offset.minute)}`,
      iso,
      mode: offset.mode
    };
  });
}

export function createViewingRequest({
  listing,
  participantNames,
  previousCount,
  slot
}: CreateViewingRequestInput): ViewingRequest {
  return {
    id: `viewing-${listing.id}-${previousCount + 1}`,
    listingId: listing.id,
    listingTitle: listing.title,
    area: listing.area,
    timeLabel: slot.label,
    iso: slot.iso,
    mode: slot.mode,
    participantNames: uniqueNames(participantNames),
    status: "REQUESTED"
  };
}

export function getDealWorkflowStage(thread: DealThread, requests: ViewingRequest[]) {
  const latest = requests.findLast((request) => request.listingId === thread.listingId);
  if (latest?.status === "CONFIRMED") return "Tour confirmed";
  if (latest?.status === "REQUESTED") return "Tour requested";
  if (thread.messages.length > 2) return "DM active";
  return "DM ready";
}

export function getLatestViewingRequest(listingId: string, requests: ViewingRequest[]) {
  return requests.findLast((request) => request.listingId === listingId) ?? null;
}

export function upsertViewingRequest(requests: ViewingRequest[], request: ViewingRequest) {
  return [...requests.filter((item) => item.listingId !== request.listingId), request];
}

export function getComposerDraftAfterQuickReply(_currentDraft: string, reply: string) {
  return reply;
}

function parseIsoDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return new Date("2026-08-20T00:00:00.000Z");
  return parsed;
}

function formatMessageTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function formatNameList(names: string[]) {
  const unique = uniqueNames(names);
  if (unique.length === 0) return "室友";
  if (unique.length === 1) return unique[0];
  return unique.slice(0, 2).join(" 和 ");
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

function getNeighborhood(area: string) {
  return area.split(/[·-]/).map((part) => part.trim()).filter(Boolean).at(-1) ?? area;
}

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}
