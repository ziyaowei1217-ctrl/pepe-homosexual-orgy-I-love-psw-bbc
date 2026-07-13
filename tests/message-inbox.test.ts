import { describe, expect, it } from "vitest";

import {
  getActiveInboxContact,
  getInboxContactKey,
  getInboxSelection,
  getNarrowMessagePane,
  mergeInboxContacts,
  type InboxContact
} from "../lib/message-inbox";

const landlord: InboxContact = {
  kind: "listing",
  targetId: "westwood",
  contactName: "Alex · Host",
  contextLabel: "Westwood sunny room",
  preview: "The room is still available.",
  time: "9:30 AM",
  image: "/listing.jpg",
  activityOrder: 2
};

const roommate: InboxContact = {
  kind: "roommate",
  targetId: "mia",
  contactName: "Mia Chen",
  contextLabel: "UCLA MSBA",
  preview: "Want to compare move-in dates?",
  time: "Now",
  image: "/mia.jpg",
  activityOrder: 3
};

describe("message inbox", () => {
  it("mixes landlord and roommate contacts by recent activity", () => {
    const contacts = mergeInboxContacts([landlord], [roommate]);

    expect(contacts.map(getInboxContactKey)).toEqual(["roommate:mia", "listing:westwood"]);
  });

  it("uses last activity instead of message count when sorting contacts", () => {
    const olderBusyContact = { ...landlord, activityOrder: 100 };
    const newerShortThread = { ...roommate, activityOrder: 200 };

    expect(mergeInboxContacts([olderBusyContact], [newerShortThread]).map(getInboxContactKey)).toEqual([
      "roommate:mia",
      "listing:westwood"
    ]);
  });

  it("keeps exactly one active target when switching contact kinds", () => {
    expect(getInboxSelection({ kind: "listing", targetId: "westwood" })).toEqual({
      activeMessageListingId: "westwood",
      activeRoommateDmId: null
    });
    expect(getInboxSelection({ kind: "roommate", targetId: "mia" })).toEqual({
      activeMessageListingId: null,
      activeRoommateDmId: "mia"
    });
  });

  it("selects the URL-targeted contact and otherwise defaults to the newest", () => {
    const contacts = mergeInboxContacts([landlord], [roommate]);

    expect(getActiveInboxContact(contacts, { kind: "listing", targetId: "westwood" })).toBe(landlord);
    expect(getActiveInboxContact(contacts, null)).toBe(roommate);
  });

  it("shows contacts on a narrow inbox route without a requested conversation", () => {
    expect(getNarrowMessagePane(null)).toBe("contacts");
  });

  it("shows only the requested conversation on a narrow targeted route", () => {
    expect(getNarrowMessagePane({ kind: "roommate", targetId: "mia" })).toBe("conversation");
  });
});
