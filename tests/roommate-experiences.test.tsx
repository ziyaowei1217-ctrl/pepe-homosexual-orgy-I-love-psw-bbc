// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RoommateLikesExperience,
  RoommatesExperience
} from "../components/marketplace/roommate-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("roommate channel", () => {
  it("explains matches inside an independent roommate discovery experience", () => {
    const html = renderToStaticMarkup(<RoommatesExperience />);

    expect(html).toContain("找到合拍的室友");
    expect(html).toContain("你的个人资料");
    expect(html).toContain("为什么适合你");
    expect(html).toContain('href="/roommates/likes"');
    expect(html).toMatch(/<a(?=[^>]*href="\/account\/profile")(?=[^>]*aria-label="编辑个人资料")[^>]*>/);
    expect(html).not.toContain("房源结果");
  });

  it("separates inbound likes, outbound likes, and mutual matches", () => {
    const html = renderToStaticMarkup(<RoommateLikesExperience />);

    expect(html).toContain("喜欢我的");
    expect(html).toContain("我喜欢的");
    expect(html).toContain("已匹配");
    expect(html).toContain("合租小组");
  });

  it("uses the real action target for expanded roommate candidates", async () => {
    writeStoredAuthSession("renter-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/roommates/deck")) return jsonResponse({ items: [roommateCandidate()], pageInfo: {}, discovery: {} });
      if (url.endsWith("/roommates/roommate-1/actions") && init?.method === "POST") {
        return jsonResponse({ action: { action: "LIKE" }, match: null, conversation: null });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<RoommatesExperience />);
    });

    expect(renderer.root.findAllByType("a").some((link) => String(link.props.href).endsWith("/roommates/deck-roommate-1-3"))).toBe(true);
    const like = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("感兴趣"));
    expect(like).toBeDefined();
    await act(async () => like!.props.onClick());

    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/roommates/roommate-1/actions") && (init as RequestInit)?.method === "POST")).toBe(true);
  });
});

function roommateCandidate() {
  return { id: "deck-roommate-1-3", actionTargetId: "roommate-1", name: "Ivy G3", age: 22, role: "UCLA", image: "https://example.com/ivy.jpg", match: 92, budget: "$1,560/月", commute: "Westwood", tags: ["早睡"], reasons: ["预算匹配"] };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : nodeText(child)).join("");
}
