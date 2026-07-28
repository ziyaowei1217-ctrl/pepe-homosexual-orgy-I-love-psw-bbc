import { describe, expect, it } from "vitest";

import {
  appendDealMessage,
  buildInitialDealThread,
  buildViewingSlots,
  canHostDecideViewing,
  canReuseDealThreadForViewing,
  createViewingRequest,
  getDealWorkflowStage,
  getComposerDraftAfterQuickReply,
  upsertViewingRequest,
  getExistingThreadDealRoomId,
  getExistingRemoteThreadId,
  type DealWorkflowListing
} from "../lib/deal-workflow";

const listing: DealWorkflowListing = {
  id: "westwood",
  title: "Westwood UCLA 步行圈阳光主卧",
  area: "Los Angeles · Westwood"
};

describe("deal workflow", () => {
  it("allows only hosts to decide actionable viewing requests", () => {
    const request = {
      id: "viewing-1",
      listingId: "westwood",
      listingTitle: listing.title,
      area: listing.area,
      timeLabel: "Friday",
      iso: "2026-08-21T12:00:00.000Z",
      mode: "in-person" as const,
      participantNames: ["Renter"],
      status: "REQUESTED" as const
    };

    expect(canHostDecideViewing({ viewerRole: "host" }, request)).toBe(true);
    expect(canHostDecideViewing({ viewerRole: "renter" }, request)).toBe(false);
    expect(canHostDecideViewing({ viewerRole: "host" }, { ...request, status: "CANCELLED" })).toBe(false);
  });

  it("starts a listing DM with context but no fabricated messages", () => {
    const thread = buildInitialDealThread({
      listing,
      contactName: "Maya",
      participantNames: ["Grace", "You"]
    });

    expect(thread.id).toBe("listing-westwood-host");
    expect(thread.subject).toBe("Westwood UCLA 步行圈阳光主卧");
    expect(thread.participants).toEqual(["Maya", "Grace", "You"]);
    expect(thread.messages).toEqual([]);
    expect(thread.lastActivityAt).toBe(0);
  });

  it("appends trimmed outgoing DM messages and keeps empty drafts out", () => {
    const thread = buildInitialDealThread({
      listing,
      contactName: "Maya",
      participantNames: ["You"]
    });

    const withMessage = appendDealMessage(thread, {
      body: "  Can we tour after class?  ",
      now: new Date("2026-07-09T18:30:00Z"),
      senderName: "You"
    });
    const unchanged = appendDealMessage(withMessage, {
      body: "   ",
      now: new Date("2026-07-09T18:31:00Z"),
      senderName: "You"
    });

    expect(withMessage.messages).toHaveLength(thread.messages.length + 1);
    expect(withMessage.messages.at(-1)).toMatchObject({
      align: "right",
      author: "You",
      body: "Can we tour after class?",
      status: "sent",
      time: "18:30"
    });
    expect(withMessage.lastActivityAt).toBe(new Date("2026-07-09T18:30:00Z").getTime());
    expect(unchanged.messages).toHaveLength(withMessage.messages.length);
  });

  it("creates requested viewing appointments from selected slots", () => {
    const slots = buildViewingSlots("2026-08-20");
    const request = createViewingRequest({
      listing,
      participantNames: ["Grace", "You"],
      previousCount: 2,
      slot: slots[1]
    });

    expect(slots.map((slot) => slot.label)).toEqual([
      "8月20日 周四 18:30",
      "8月21日 周五 12:00",
      "8月22日 周六 11:00",
      "8月23日 周日 17:00"
    ]);
    expect(request).toMatchObject({
      id: "viewing-westwood-3",
      listingId: "westwood",
      listingTitle: "Westwood UCLA 步行圈阳光主卧",
      mode: "in-person",
      participantNames: ["Grace", "You"],
      status: "REQUESTED",
      timeLabel: "8月21日 周五 12:00"
    });
  });

  it("summarizes workflow stage from DM and viewing state", () => {
    const thread = buildInitialDealThread({
      listing,
      contactName: "Maya",
      participantNames: ["You"]
    });
    const messaged = appendDealMessage(thread, {
      body: "Can we see it this weekend?",
      now: new Date("2026-07-09T18:30:00Z"),
      senderName: "You"
    });
    const request = createViewingRequest({
      listing,
      participantNames: ["You"],
      previousCount: 0,
      slot: buildViewingSlots("2026-08-20")[0]
    });

    expect(getDealWorkflowStage(thread, [])).toBe("可以发送消息");
    expect(getDealWorkflowStage(messaged, [])).toBe("沟通中");
    expect(getDealWorkflowStage(messaged, [request])).toBe("已请求看房");
    expect(getDealWorkflowStage(messaged, [{ ...request, status: "CONFIRMED" }])).toBe("看房已确认");
  });

  it("adjusts one listing tour without replacing another listing", () => {
    const first = createViewingRequest({ listing, participantNames: ["You"], previousCount: 0, slot: buildViewingSlots("2026-08-20")[0] });
    const other = { ...first, id: "viewing-other-1", listingId: "other" };
    const adjusted = { ...first, id: "viewing-westwood-2", timeLabel: "New time" };

    expect(upsertViewingRequest([first, other], adjusted)).toEqual([other, adjusted]);
  });

  it("requires quick replies to populate the composer before sending", () => {
    expect(getComposerDraftAfterQuickReply("old draft", "Can we tour?")).toBe("Can we tour?");
  });

  it("reuses an existing remote thread instead of recreating and overwriting its participants", () => {
    const thread = {
      ...buildInitialDealThread({
        listing,
        contactName: "房东",
        participantNames: ["Grace", "我"]
      }),
      id: "remote-thread-1",
      dealRoomId: "room-a"
    };

    expect(getExistingRemoteThreadId({ westwood: thread }, "westwood")).toBe("remote-thread-1");
    expect(getExistingRemoteThreadId({ westwood: thread }, "other")).toBeNull();
    expect(getExistingThreadDealRoomId({ westwood: thread }, "westwood")).toBe("room-a");
    expect(getExistingThreadDealRoomId({ westwood: thread }, "other")).toBeNull();
  });

  it("only reuses a viewing thread for the explicitly selected roommate group", () => {
    const groupThread = {
      ...buildInitialDealThread({
        listing,
        contactName: "房东",
        participantNames: ["Grace", "我"]
      }),
      id: "remote-thread-1",
      dealRoomId: "room-a"
    };
    const soloThread = { ...groupThread, dealRoomId: null };

    expect(canReuseDealThreadForViewing(groupThread, "room-a")).toBe(true);
    expect(canReuseDealThreadForViewing(groupThread, "room-b")).toBe(false);
    expect(canReuseDealThreadForViewing(groupThread, null)).toBe(false);
    expect(canReuseDealThreadForViewing(soloThread, null)).toBe(true);
    expect(canReuseDealThreadForViewing(soloThread, "room-a")).toBe(false);
  });
});
