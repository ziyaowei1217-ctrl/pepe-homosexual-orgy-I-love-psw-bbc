export type InboxContactKind = "listing" | "roommate";

export type InboxContact = {
  kind: InboxContactKind;
  targetId: string;
  contactName: string;
  contextLabel: string;
  preview: string;
  time: string;
  image: string;
  activityOrder: number;
  unreadCount?: number;
};

export type InboxTarget = Pick<InboxContact, "kind" | "targetId">;

export type InboxSelection = {
  activeMessageListingId: string | null;
  activeRoommateDmId: string | null;
};

export type NarrowMessagePane = "contacts" | "conversation";

export function getInboxContactKey(contact: InboxTarget) {
  return `${contact.kind}:${contact.targetId}`;
}

export function getInboxSelection(target: InboxTarget): InboxSelection {
  return target.kind === "listing"
    ? { activeMessageListingId: target.targetId, activeRoommateDmId: null }
    : { activeMessageListingId: null, activeRoommateDmId: target.targetId };
}

export function getNarrowMessagePane(target: InboxTarget | null): NarrowMessagePane {
  return target ? "conversation" : "contacts";
}

export function mergeInboxContacts(...groups: readonly InboxContact[][]) {
  const contacts = groups.flat().sort((left, right) => right.activityOrder - left.activityOrder);
  const seen = new Set<string>();

  return contacts.filter((contact) => {
    const key = getInboxContactKey(contact);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getActiveInboxContact(contacts: InboxContact[], target: InboxTarget | null) {
  if (target) {
    const targetKey = getInboxContactKey(target);
    const requested = contacts.find((contact) => getInboxContactKey(contact) === targetKey);
    if (requested) return requested;
  }

  return contacts[0] ?? null;
}
