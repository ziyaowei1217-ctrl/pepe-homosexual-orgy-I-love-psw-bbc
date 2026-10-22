import { describe, expect, it } from "vitest";

import { createChatHandler, parseChatRequest, type ChatDeps } from "../lib/assistant/chat";
import { recentTurns } from "../lib/assistant/protocol";
import { jsonError } from "../lib/assistant/server";
import { assistantRequest, fakeAnthropic, fixtureListings, readEvents } from "./support/assistant-fixtures";

function setup(replies: Parameters<typeof fakeAnthropic>[0], overrides: Partial<ChatDeps> = {}) {
  const fake = fakeAnthropic(replies);
  const quotaCalls: string[] = [];
  const deps: ChatDeps = {
    client: () => fake.client,
    claimQuota: async (token, kind) => {
      quotaCalls.push(`${token}:${kind}`);
      return "user-1";
    },
    loadListings: async () => fixtureListings,
    today: () => "2026-05-01",
    ...overrides
  };
  return { handler: createChatHandler(deps), requests: fake.requests, quotaCalls };
}

const ask = (content: string, context?: unknown) => assistantRequest("/api/assistant/chat", { messages: [{ role: "user", content }], context });

describe("assistant chat handler", () => {
  it("is unavailable without an API key and requires a session", async () => {
    const { handler, quotaCalls } = setup([], { client: () => null });
    expect((await handler(ask("hi"))).status).toBe(503);

    const signedOut = setup([]);
    const response = await signedOut.handler(assistantRequest("/api/assistant/chat", { messages: [{ role: "user", content: "hi" }] }, null));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "ASSISTANT_SIGN_IN_REQUIRED" });
    expect(quotaCalls).toEqual([]);
  });

  it("passes the API's rate-limit answer through and rejects malformed bodies", async () => {
    const limited = setup([], { claimQuota: async () => jsonError(429, "ASSISTANT_RATE_LIMITED", { "Retry-After": "120" }) });
    const response = await limited.handler(ask("hi"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");

    const { handler, requests, quotaCalls } = setup([]);
    const lastFromAssistant = assistantRequest("/api/assistant/chat", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] });
    expect((await handler(lastFromAssistant)).status).toBe(400);
    const systemRole = assistantRequest("/api/assistant/chat", { messages: [{ role: "system", content: "x" }] });
    expect((await handler(systemRole)).status).toBe(400);
    expect(requests).toEqual([]);
    // A malformed request does not use up the user's quota.
    expect(quotaCalls).toEqual([]);
  });

  it("searches with the search page's rules and streams cards, text and done", async () => {
    const { handler, requests, quotaCalls } = setup([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "search_listings", input: { query: "Westwood", priceMin: 2000, priceMax: 1000, moveIn: "2026-06-01", moveOut: "2026-08-01" } }]
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "找到 2 套。" }] }
    ]);
    const response = await handler(ask("Westwood 两千以内"));
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const events = await readEvents(response);

    expect(quotaCalls).toEqual(["token-1:chat"]);
    expect(events.map((event) => event.type)).toEqual(["status", "listings", "text", "done"]);
    const listings = events[1];
    // Reversed prices are swapped exactly like /search does, so the link opens the same results.
    expect(listings.searchUrl).toBe("/search?q=Westwood&moveIn=2026-06-01&moveOut=2026-08-01&priceMin=1000&priceMax=2000");
    expect(listings.listings.map((listing: { id: string }) => listing.id).sort()).toEqual(["westwood-a", "westwood-b"]);
    expect(listings).toMatchObject({ total: 2, moveIn: "2026-06-01", moveOut: "2026-08-01" });

    const first = requests[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.metadata).toEqual({ user_id: "user-1" });
    expect(first.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.messages[0].content).toContain("今天：2026-05-01");

    const toolResult = requests[1].messages.at(-1).content[0];
    expect(toolResult.tool_use_id).toBe("t1");
    const facts = JSON.parse(toolResult.content);
    expect(facts.total).toBe(2);
    expect(facts.listings[0]).toHaveProperty("stayTotalUsd");
    expect(facts.listings[0]).not.toHaveProperty("score");
    expect(facts.listings[0]).not.toHaveProperty("trust");
  });

  it("only drafts messages for listings the user has seen", async () => {
    const { handler, requests } = setup([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "draft_message", input: { listingId: "ktown-c", body: "你好" } },
          { type: "tool_use", id: "t2", name: "draft_message", input: { listingId: "westwood-a", body: "你好，6 月能看房吗？" } }
        ]
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "草稿在下面。" }] }
    ]);
    const events = await readEvents(await handler(ask("帮我写消息", { listingId: "westwood-a" })));

    const drafts = events.filter((event) => event.type === "draft");
    expect(drafts).toEqual([{ type: "draft", listingId: "westwood-a", listingTitle: "Westwood 主卧", body: "你好，6 月能看房吗？" }]);
    const results = requests[1].messages.at(-1).content;
    expect(results[0]).toMatchObject({ tool_use_id: "t1", is_error: true });
    expect(results[1].is_error).toBeUndefined();
  });

  it("names the page context with titles and numbers the listings shown last", async () => {
    const { handler, requests } = setup([{ stop_reason: "end_turn", content: [{ type: "text", text: "好的" }] }]);
    await readEvents(await handler(ask("第二套怎么样", {
      shownListingIds: ["westwood-b", "gone", "ktown-c"],
      savedListingIds: ["westwood-a"],
      moveIn: "2026-06-01",
      moveOut: "2026-07-15"
    })));
    const context = requests[0].messages[0].content as string;
    expect(context).toContain("用户选的日期：2026-06-01 至 2026-07-15");
    expect(context).toContain("1. westwood-b「Westwood 一室」\n2. ktown-c「Koreatown 单间」");
    expect(context).toContain("用户收藏的房源：westwood-a「Westwood 主卧」");
    expect(context).not.toContain("gone");
  });

  it("drops the whole answer when the model declines", async () => {
    const { handler } = setup([{ stop_reason: "refusal", content: [{ type: "text", text: "部分" }] }]);
    const events = await readEvents(await handler(ask("?")));
    expect(events.at(-1)).toEqual({ type: "error", code: "ASSISTANT_DECLINED" });
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it("leaves out the declined attempt's blocks after a mid-output fallback", async () => {
    const { handler, requests } = setup([
      {
        stop_reason: "tool_use",
        content: [
          { type: "thinking", thinking: "x", signature: "s" },
          { type: "text", text: "我先" },
          { type: "tool_use", id: "old", name: "search_listings", input: {} },
          { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "other" }, trigger: { type: "refusal" } },
          { type: "tool_use", id: "new", name: "search_listings", input: { query: "Koreatown" } }
        ]
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "完成" }] }
    ]);
    await readEvents(await handler(ask("找房")));
    const replayed = requests[1].messages[1].content.map((block: { type: string; id?: string }) => block.id ?? block.type);
    expect(replayed).toEqual(["text", "fallback", "new"]);
    expect(requests[1].messages[2].content.map((result: { tool_use_id: string }) => result.tool_use_id)).toEqual(["new"]);
  });

  it("caps rounds, tool calls and history", async () => {
    const manyTools = Array.from({ length: 7 }, (_, index) => ({ type: "tool_use", id: `t${index}`, name: "search_listings", input: {} }));
    const { handler, requests } = setup([
      { stop_reason: "tool_use", content: manyTools },
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "r2", name: "search_listings", input: {} }] },
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "r3", name: "search_listings", input: {} }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "最后" }] }
    ]);
    const long = "很".repeat(3_900);
    const messages = [
      { role: "user", content: `old ${long}` },
      { role: "assistant", content: long },
      { role: "user", content: long },
      { role: "assistant", content: long },
      { role: "user", content: "现在呢" }
    ];
    const events = await readEvents(await handler(assistantRequest("/api/assistant/chat", { messages })));
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(requests).toHaveLength(4);
    expect(requests.map((request) => request.max_tokens)).toEqual([4000, 4000, 4000, 4000]);
    expect(requests[3].tool_choice).toEqual({ type: "none" });
    const results = requests[1].messages.at(-1).content;
    expect(results.filter((result: { is_error?: boolean }) => result.is_error)).toHaveLength(2);
    // The oldest turns that do not fit in the history budget are dropped, and history starts with the user.
    expect(requests[0].messages[0].role).toBe("user");
    expect(requests[0].messages.some((message: { content: unknown }) => String(message.content).startsWith("old"))).toBe(false);
  });

  it("keeps only valid context fields", () => {
    expect(parseChatRequest({ messages: [{ role: "user", content: "hi" }], context: { listingId: "../x", savedListingIds: ["ok-1", 3, "a/b"] } })?.context).toMatchObject({
      listingId: "", savedListingIds: ["ok-1"]
    });
    expect(parseChatRequest({ messages: [{ role: "user", content: " " }] })).toBeNull();
    expect(parseChatRequest({ messages: [{ role: "user", content: "hi" }] })?.context).toEqual({
      listingId: "", savedListingIds: [], shownListingIds: [], moveIn: "", moveOut: ""
    });
  });

  it("trims history the same way in the browser and on the server", () => {
    const turn = (role: "user" | "assistant", size: number) => ({ role, content: "x".repeat(size) });
    // Newest first until 12K characters, then never starting with an answer.
    expect(recentTurns([turn("user", 5000), turn("assistant", 5000), turn("user", 4000), turn("assistant", 4000), turn("user", 10)]).map((t) => t.content.length)).toEqual([4000, 4000, 10]);
    const many = Array.from({ length: 25 }, (_, index) => turn(index % 2 ? "assistant" : "user", 10));
    expect(recentTurns(many)).toHaveLength(19);
    expect(recentTurns(many)[0].role).toBe("user");
  });
});
