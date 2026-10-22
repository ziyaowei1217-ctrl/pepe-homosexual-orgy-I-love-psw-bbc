// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoommateDetailExperience, RoommateLikesExperience, RoommatesExperience } from "../components/marketplace/roommate-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { RoommateCard, RoommateDeckResponse } from "../lib/roommate-matching";

beforeEach(() => {
  // Reduced motion commits a swipe at once instead of after the fly-out.
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: true, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("roommate deck", () => {
  it("renders the header with links to likes and the roommate profile", () => {
    const html = renderToStaticMarkup(<RoommatesExperience />);

    expect(html).toContain("找到合拍的室友");
    expect(html).toContain('href="/roommates/likes"');
    expect(html).toMatch(/<a(?=[^>]*href="\/roommates\/me")(?=[^>]*aria-label="编辑室友资料")[^>]*>/);
    expect(html).toContain("登录并填写室友资料后可以互相喜欢、开始聊天");
  });

  it("likes the top card and opens the match moment when the like completes a match", async () => {
    writeStoredAuthSession("renter-token");
    const posts = stubApi((path) => path === "/roommates/mia/actions"
      ? { action: { action: "LIKE" }, match: { id: "match-1", status: "ACTIVE" }, conversation: { id: "conversation-1", matchId: "match-1" }, dealRoom: null }
      : undefined);
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "喜欢 Mia" }));

    const dialog = await screen.findByRole("dialog", { name: "你和 Mia 互相喜欢了" });
    expect(dialog.textContent).toContain("问问 TA：平时几点睡、几点起？");
    expect(within(dialog).getByRole("link", { name: "发消息" }).getAttribute("href")).toBe("/inbox/conversation-1");
    expect(posts).toEqual([["/roommates/mia/actions", { action: "LIKE" }]]);
    expect(screen.getByRole("button", { name: "喜欢 Noah" })).toBeDefined();
  });

  it("passes with the left arrow key and undoes back to the same card", async () => {
    writeStoredAuthSession("renter-token");
    const posts = stubApi((path) => path === "/roommates/actions/undo" ? { roommateProfileId: "mia", action: "PASS" } : undefined);
    render(<RoommatesExperience />);

    fireEvent.keyDown(await screen.findByRole("region", { name: "室友卡片，左右方向键跳过或喜欢" }), { key: "ArrowLeft" });
    expect(await screen.findByRole("button", { name: "跳过 Noah" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("已跳过 Mia");

    fireEvent.click(screen.getByRole("button", { name: "撤回 Mia" }));

    expect(await screen.findByRole("button", { name: "跳过 Mia" })).toBeDefined();
    expect(posts).toEqual([["/roommates/mia/actions", { action: "PASS" }], ["/roommates/actions/undo", {}]]);
  });

  it("puts the card back on top when the action fails", async () => {
    writeStoredAuthSession("renter-token");
    stubApi((path) => path.endsWith("/actions") ? new Response(null, { status: 503 }) : undefined);
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "稍后再看 Mia" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("服务暂时不可用"));
    expect(screen.getByRole("button", { name: "稍后再看 Mia" })).toBeDefined();
  });

  it("does not undo an earlier action when the swipe being undone failed, and keeps undo after the last card", async () => {
    writeStoredAuthSession("renter-token");
    const posts = stubApi((path) => path === "/roommates/noah/actions" ? new Response(null, { status: 503 }) : undefined);
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "跳过 Mia" }));
    fireEvent.click(await screen.findByRole("button", { name: "跳过 Noah" }));
    fireEvent.click(await screen.findByRole("button", { name: "撤回 Noah" }));

    expect(await screen.findByRole("button", { name: "跳过 Noah" })).toBeDefined();
    expect(posts.map(([path]) => path)).toEqual(["/roommates/mia/actions", "/roommates/noah/actions"]);
    expect(screen.queryByRole("button", { name: "跳过 Mia" })).toBeNull();
  });

  it("keeps undo for a retry after a failed request and drops it once the server refuses", async () => {
    writeStoredAuthSession("renter-token");
    let undoStatus = 503;
    stubApi((path) => path === "/roommates/actions/undo" ? new Response(null, { status: undoStatus }) : undefined);
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "跳过 Mia" }));
    fireEvent.click(await screen.findByRole("button", { name: "撤回 Mia" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("服务暂时不可用"));

    undoStatus = 409;
    fireEvent.click(screen.getByRole("button", { name: "撤回 Mia" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("只能撤回 10 分钟内"));
    expect((screen.getByRole("button", { name: "撤回" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps this card's undo when the server undid an action from another page", async () => {
    writeStoredAuthSession("renter-token");
    stubApi((path) => path === "/roommates/actions/undo" ? { roommateProfileId: "elsewhere", action: "PASS" } : undefined);
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "跳过 Mia" }));
    fireEvent.click(await screen.findByRole("button", { name: "撤回 Mia" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("其他页面"));
    expect(screen.getByRole("button", { name: "撤回 Mia" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "跳过 Mia" })).toBeNull();
  });

  it("asks guests for enough cards to get past their local passes and stops when nothing new comes back", async () => {
    const deckPaths: string[] = [];
    stubApi((path) => {
      if (!path.startsWith("/roommates/deck")) return undefined;
      deckPaths.push(path);
      return { items: ["Mia", "Noah", "Ava", "Leo", "Zoe"].map((name) => card(name.toLowerCase(), name)), total: 7, filteredOut: 0, viewer: { signedIn: false, hasProfile: false, missing: [] } };
    });
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "跳过 Mia" }));
    await waitFor(() => expect(deckPaths).toEqual(["/roommates/deck?limit=20", "/roommates/deck?limit=21"]));
    fireEvent.click(screen.getByRole("button", { name: "跳过 Noah" }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(deckPaths).toHaveLength(2);
  });

  it("sends guests to sign in before a like", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    stubApi();
    render(<RoommatesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "喜欢 Mia" }));

    expect(assign).toHaveBeenCalledWith("/account?returnTo=%2Froommates&intent=roommate-action");
    expect(screen.getByRole("button", { name: "喜欢 Mia" })).toBeDefined();
  });
});

describe("roommate detail", () => {
  it("loads the card with the session token and offers the conversation once matched", async () => {
    writeStoredAuthSession("renter-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ...card("mia", "Mia"), conversationId: "conversation-1" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RoommateDetailExperience profileId="mia" />);

    expect((await screen.findByRole("link", { name: "发消息" })).getAttribute("href")).toBe("/inbox/conversation-1");
    expect(screen.getByRole("heading", { level: 1, name: "Mia" })).toBeDefined();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/roommates\/deck\/mia$/);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer renter-token");
  });

  it("says when the roommate is not available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    render(<RoommateDetailExperience profileId="missing" />);

    expect(await screen.findByRole("heading", { name: "没有找到这位室友" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "室友详情" })).toBeDefined();
  });

  it("shows no score for a pair a hard filter blocks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...card("mia", "Mia"), score: null, tier: null, watchouts: ["TA 只找男生室友"] })));
    render(<RoommateDetailExperience profileId="mia" />);

    expect(await screen.findByText("条件有冲突，不会互相推荐。")).toBeDefined();
    expect(screen.getByText("TA 只找男生室友")).toBeDefined();
    expect(screen.queryByText("非常合拍")).toBeNull();
  });
});

describe("roommate likes", () => {
  it("separates inbound likes, outbound likes and mutual matches", () => {
    const html = renderToStaticMarkup(<RoommateLikesExperience />);

    expect(html).toContain("喜欢我的");
    expect(html).toContain("我喜欢的");
    expect(html).toContain("已匹配");
    expect(html).toContain("合租小组");
  });

  it("opens the conversation when a like back completes the match", async () => {
    writeStoredAuthSession("renter-token");
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const inbound = { id: "mia", name: "Mia", age: 22, role: "UCLA", image: "https://example.com/mia.jpg", match: 0, budget: "", commute: "", tags: [] };
    stubApi((path) => path === "/roommates/activity"
      ? { inbound: [{ action: "LIKE", profile: inbound }], outbound: [], matchedProfileIds: [] }
      : path === "/roommates/mia/actions" ? { action: { action: "LIKE" }, match: { id: "match-1" }, conversation: { id: "conversation-1", matchId: "match-1" }, dealRoom: null } : undefined);
    render(<RoommateLikesExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "也喜欢 TA" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/inbox/conversation-1"));
  });
});

function card(id: string, name: string): RoommateCard {
  return {
    id, name, age: 22, image: `https://example.com/${id}.jpg`, school: "UCLA", city: "Los Angeles", neighborhoods: ["Westwood", "Sawtelle"],
    budgetMin: 1200, budgetMax: 1600, moveInDate: "2027-01-04", moveOutDate: "2027-06-12", roomType: "private_room", gender: "female",
    sleepSchedule: "early_bird", cleanliness: "tidy", guests: "rarely", smoking: "no", pets: "none", intro: null, lookingFor: null,
    score: 86, tier: "great", reasons: ["入住时间重合约 5 个月", "都在 UCLA"], watchouts: [], icebreaker: "问问 TA：平时几点睡、几点起？",
    breakdown: [{ key: "dates", label: "入住时间", score: 92 }], likedYou: false, youLiked: false, later: false, conversationId: null
  };
}

/** Serves a two-card deck and records POST bodies; `respond` overrides any path. */
function stubApi(respond: (path: string) => unknown = () => undefined) {
  const posts: Array<[string, unknown]> = [];
  const deck: RoommateDeckResponse = { items: [card("mia", "Mia"), card("noah", "Noah")], total: 2, filteredOut: 0, viewer: { signedIn: true, hasProfile: true, missing: [] } };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).replace(/^.*\/api\/v1/, "");
    if (init.method === "POST") posts.push([path, JSON.parse(String(init.body))]);
    const body = respond(path) ?? (path.startsWith("/roommates/deck") ? deck : path.endsWith("/actions") ? { action: {}, match: null, conversation: null, dealRoom: null } : undefined);
    if (body instanceof Response) return body;
    return body === undefined ? new Response(null, { status: 404 }) : Response.json(body);
  }));
  return posts;
}
