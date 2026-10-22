// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeStoredAuthSession } from "../lib/auth-session";
import { fixtureListings } from "./support/assistant-fixtures";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => "/" }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.style.overflow = "";
  navigation.push.mockReset();
  vi.unstubAllGlobals();
});

function sse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    }
  }), { headers: { "Content-Type": "text/event-stream" } });
}

/** Fresh modules per test: the assistant status and conversation live in module memory. */
async function renderShell({ enabled, chat = [] }: { enabled: boolean; chat?: Array<() => Response> }) {
  const requests: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/assistant") return Response.json({ enabled });
    requests.push({ url, body: JSON.parse(String(init?.body)) });
    const next = chat.shift();
    return next ? next() : Response.json({ code: "ASSISTANT_UNAVAILABLE" }, { status: 503 });
  }));
  vi.resetModules();
  const { PublicShell } = await import("../components/marketplace/public-shell");
  const { SavedListingsProvider } = await import("../components/marketplace/saved-listings-provider");
  const client = await import("../lib/assistant/client");
  await act(async () => {
    render(<SavedListingsProvider><PublicShell active="discover"><main>页面</main></PublicShell></SavedListingsProvider>);
  });
  return { requests, client };
}

describe("assistant UI", () => {
  it("stays hidden when the server has no key", async () => {
    await renderShell({ enabled: false });
    expect(screen.queryByRole("button", { name: "打开 AI 助手" })).toBeNull();
    expect(screen.getByRole("link", { name: "打开账户" })).toBeTruthy();
  });

  it("asks signed-out visitors to log in", async () => {
    await renderShell({ enabled: true });
    fireEvent.click(await screen.findByRole("button", { name: "打开 AI 助手" }));
    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    expect(within(dialog).getByText("登录后使用 AI 助手")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "登录" }).getAttribute("href")).toBe("/account?returnTo=%2F&intent=account");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  it("streams an answer with cards and hands a draft to the inbox", async () => {
    writeStoredAuthSession("token-1");
    const listing = fixtureListings[0];
    const { requests, client } = await renderShell({
      enabled: true,
      chat: [() => sse([
        { type: "status", label: "正在搜索房源…" },
        { type: "listings", listings: [listing], total: 5, searchUrl: "/search?q=Westwood" },
        { type: "text", text: "找到 5 套，" },
        { type: "text", text: "这套最便宜。" },
        { type: "draft", listingId: listing.id, listingTitle: listing.title, body: "你好，6 月能看房吗？" },
        { type: "done" }
      ])]
    });
    fireEvent.click(await screen.findByRole("button", { name: "打开 AI 助手" }));
    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "帮我写一条消息，问房东能不能看房" }));
    });

    expect(requests[0].url).toBe("/api/assistant/chat");
    expect(requests[0].body).toMatchObject({ messages: [{ role: "user", content: "帮我写一条消息，问房东能不能看房" }], context: { shownListingIds: [] } });
    expect(await within(dialog).findByText("找到 5 套，这套最便宜。")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: listing.title }).getAttribute("href")).toBe(`/listing/${listing.id}`);
    expect(within(dialog).getByRole("link", { name: "在找房页查看全部 5 套" }).getAttribute("href")).toBe("/search?q=Westwood");

    const draft = within(dialog).getByRole("region", { name: "给房东的消息草稿" });
    fireEvent.click(within(draft).getByRole("button", { name: "去发送" }));
    expect(navigation.push).toHaveBeenCalledWith(`/inbox?listingId=${listing.id}`);
    expect(screen.queryByRole("dialog")).toBeNull();

    const applied: string[] = [];
    function Inbox({ role }: { role: string }) {
      client.useAssistantDraftHandoff("token-1", { listingId: listing.id, viewerRole: role }, (body) => applied.push(body));
      return null;
    }
    const host = render(<Inbox role="host" />);
    expect(applied).toEqual([]);
    host.unmount();
    render(<Inbox role="renter" />);
    expect(applied).toEqual(["你好，6 月能看房吗？"]);
  });

  it("drops a failed answer from the history and sends the last cards as context", async () => {
    writeStoredAuthSession("token-1");
    const { requests } = await renderShell({
      enabled: true,
      chat: [
        () => sse([{ type: "listings", listings: fixtureListings.slice(0, 2) }, { type: "text", text: "这两套。" }, { type: "done" }]),
        () => sse([{ type: "text", text: "一半" }, { type: "error", code: "ASSISTANT_DECLINED" }])
      ]
    });
    fireEvent.click(await screen.findByRole("button", { name: "打开 AI 助手" }));
    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    const input = within(dialog).getByRole("textbox", { name: "问 AI 助手" });
    async function ask(text: string) {
      fireEvent.change(input, { target: { value: text } });
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
      });
    }

    expect(document.activeElement).toBe(input);
    // Enter that commits an IME candidate (Safari: keyCode 229) is not a send.
    fireEvent.change(input, { target: { value: "UCLA 附近" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(requests).toHaveLength(0);
    expect((input as HTMLTextAreaElement).value).toBe("UCLA 附近");

    await ask("找房");
    await ask("第二套呢");
    expect(await within(dialog).findByText("这个问题 AI 助手无法回答，请换个问法。")).toBeTruthy();
    expect(within(dialog).queryByText("一半")).toBeNull();

    await ask("那第一套呢");
    expect(requests[2].body.messages).toEqual([
      { role: "user", content: "找房" },
      { role: "assistant", content: "这两套。" },
      { role: "user", content: "那第一套呢" }
    ]);
    expect(requests[2].body.context.shownListingIds).toEqual(["westwood-a", "westwood-b"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "清空" }));
    expect(within(dialog).getByText("可以这样问：")).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });
});

describe("listing copy helper", () => {
  async function renderHelper(copy: unknown) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input) === "/api/assistant" ? Response.json({ enabled: true }) : Response.json(copy))));
    vi.resetModules();
    const { ListingCopyHelper } = await import("../components/assistant/listing-copy-helper");
    const onApply = vi.fn();
    const draft = { title: "旧标题", area: "Los Angeles · Westwood", availableFrom: "", availableTo: "", beds: 1, baths: 1, commute: "", transit: "", price: 0, originalPrice: 0, tags: ["Wi-Fi"], landlordAware: false, remoteListingId: null };
    await act(async () => {
      render(<ListingCopyHelper token="token-1" draft={draft} onApply={onApply} />);
    });
    fireEvent.click(await screen.findByRole("button", { name: "AI 帮我写" }));
    fireEvent.change(screen.getByRole("textbox", { name: "用几句话描述房间" }), { target: { value: "主卧，近地铁，可养猫" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "填入表单" }));
    });
    return onApply;
  }

  it("fills the fields it has values for and adds amenities", async () => {
    const onApply = await renderHelper({ title: "Westwood 主卧", commute: "", transit: "近地铁 · Westwood", tags: ["Wi-Fi", "宠物友好"] });
    expect(onApply).toHaveBeenCalledWith({ title: "Westwood 主卧", transit: "近地铁 · Westwood", tags: ["Wi-Fi", "宠物友好"] });
    expect(screen.getByRole("status").textContent).toBe("已填入标题、交通、设施（设施在「价格与设施」一步），请核对后再保存。");
  });

  it("says so when the description gives nothing to fill", async () => {
    const onApply = await renderHelper({ title: "", commute: "", transit: "", tags: [] });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("描述里没有可用的信息，请补充后再试。");
  });
});
