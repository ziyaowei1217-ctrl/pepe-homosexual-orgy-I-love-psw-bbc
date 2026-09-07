// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxExperience } from "../components/marketplace/inbox-experience";
import { writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("marketplace inbox", () => {
  it("groups conversations by purpose and keeps the related task visible", () => {
    const html = renderToStaticMarkup(<InboxExperience initialConversationId={null} />);

    expect(html).toContain("收件箱");
    expect(html).toContain("房源申请");
    expect(html).toContain("预约看房");
    expect(html).toContain("室友匹配");
    expect(html).toContain("正在检查登录状态…");
    expect(html).not.toContain('href="/account?');
    expect(html).not.toContain("我已经看到你的申请");
    expect(html).not.toContain("价格筛选");
  });

  it("keeps the conversation composer above the mobile navigation", () => {
    const html = renderToStaticMarkup(<InboxExperience initialConversationId="thread-1" />);

    expect(html).toContain("flex h-[calc(100dvh-136px)]");
    expect(html).toContain("lg:min-h-0");
  });

  it("creates and selects a listing conversation when a renter opens contact for the first time", async () => {
    writeStoredAuthSession("renter-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/deal-threads") && init?.method === "GET") return jsonResponse([]);
      if (url.endsWith("/roommate-conversations")) return jsonResponse([]);
      if (url.endsWith("/deal-threads") && init?.method === "POST") return jsonResponse(dealThread());
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<InboxExperience initialConversationId={null} initialListingId="listing-1" />);
    });

    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/deal-threads") && (init as RequestInit)?.method === "POST")).toBe(true);
    expect(text(renderer.root)).toContain("Westwood room");
    expect(text(renderer.root)).toContain("发送第一条消息开始对话");
  });

  it("shows the viewing request composer when opened from the tour action", async () => {
    writeStoredAuthSession("renter-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/deal-threads")) return jsonResponse([dealThread()]);
      if (url.endsWith("/roommate-conversations")) return jsonResponse([]);
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<InboxExperience initialConversationId={null} initialListingId="listing-1" initialTour />);
    });

    const rendered = text(renderer.root);
    expect(rendered).toContain("预约看房时间");
    expect(rendered).toContain("发送看房请求");
  });

  it("does not keep showing a conversation excluded by search", async () => {
    writeStoredAuthSession("renter-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/deal-threads")) return jsonResponse([
        dealThread(),
        { ...dealThread(), id: "thread-2", listingId: "listing-2", listingTitle: "El Segundo room", area: "El Segundo", contactName: "Host Kai" }
      ]);
      if (url.endsWith("/roommate-conversations")) return jsonResponse([]);
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<InboxExperience initialConversationId={null} />);
    });

    const search = renderer.root.findByProps({ "aria-label": "搜索消息" });
    act(() => search.props.onChange({ target: { value: "El Segundo" } }));

    expect(text(renderer.root)).toContain("El Segundo room");
    expect(text(renderer.root)).toContain("选择一条对话");
    expect(text(renderer.root)).not.toContain("Westwood room");
  });
});

function dealThread() {
  return {
    id: "thread-1",
    ownerId: "renter-1",
    listingOwnerId: "host-1",
    viewerRole: "renter" as const,
    dealRoomId: null,
    listingId: "listing-1",
    listingTitle: "Westwood room",
    area: "LA · Westwood",
    contactName: "Host Taylor",
    participantNames: ["Lin"],
    messages: [],
    viewingRequests: [],
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z"
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
