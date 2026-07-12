import { describe, expect, it } from "vitest";

import {
  appendDealMessage,
  buildInitialDealThread,
  buildViewingSlots,
  createViewingRequest,
  getDealWorkflowStage,
  getComposerDraftAfterQuickReply,
  upsertViewingRequest,
  type DealWorkflowListing
} from "../lib/deal-workflow";

const listing: DealWorkflowListing = {
  id: "westwood",
  title: "Westwood UCLA 步行圈阳光主卧",
  area: "Los Angeles · Westwood"
};

describe("deal workflow", () => {
  it("starts a listing DM with listing context and participant names", () => {
    const thread = buildInitialDealThread({
      listing,
      contactName: "Maya",
      participantNames: ["Grace", "You"]
    });

    expect(thread.id).toBe("listing-westwood-host");
    expect(thread.subject).toBe("Westwood UCLA 步行圈阳光主卧");
    expect(thread.participants).toEqual(["Maya", "Grace", "You"]);
    expect(thread.messages[0].body).toContain("Westwood");
    expect(thread.messages[1].body).toContain("Grace");
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
      time: "6:30 PM"
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

    expect(getDealWorkflowStage(thread, [])).toBe("DM ready");
    expect(getDealWorkflowStage(messaged, [])).toBe("DM active");
    expect(getDealWorkflowStage(messaged, [request])).toBe("Tour requested");
    expect(getDealWorkflowStage(messaged, [{ ...request, status: "CONFIRMED" }])).toBe("Tour confirmed");
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
});
