// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountExperience } from "../components/marketplace/account-experience";
import AccountPage from "../app/account/page";
import { writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("account experience", () => {
  it("keeps sign-in focused while showing the account structure", () => {
    const html = renderToStaticMarkup(<AccountExperience mode="overview" />);
    expect(html).toContain("欢迎回来");
    expect(html).toContain("邮箱地址");
    expect(html).toContain("发送验证码");
    expect(html).toContain('href="/account/profile"');
    expect(html).toContain('href="/account/verification"');
    expect(html).toContain('href="/account/settings"');
    expect(html).not.toContain("待审核房源");
  });

  it("labels each account section independently", () => {
    expect(renderToStaticMarkup(<AccountExperience mode="profile" />)).toContain("个人资料");
    expect(renderToStaticMarkup(<AccountExperience mode="verification" />)).toContain("身份与认证");
    expect(renderToStaticMarkup(<AccountExperience mode="settings" />)).toContain("通知与隐私");
  });

  it("keeps the application return action visible when sign-in interrupts an application", async () => {
    const returnTo = "/applications/new?listingId=listing-1";
    const page = await AccountPage({ searchParams: Promise.resolve({ returnTo, intent: "application" }) });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(page); });
    const resume = renderer.root.findAllByType("a").find((node) => text(node) === "返回申请");
    expect(resume?.element.getAttribute("href")).toBe(returnTo);
    expect(text(renderer.root)).toContain("登录后继续申请");
    expect(text(renderer.root)).toContain("尚未提交");
  });

  it("shows application and trip counts from the signed-in renter's server data", async () => {
    writeStoredAuthSession("renter-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "renter-1", email: "lin@example.com", role: "USER" });
      if (url.endsWith("/profiles/me")) return jsonResponse({ id: "profile-1", email: "lin@example.com", displayName: "Lin", avatarUrl: null, school: "UCLA", city: "LA", role: "renter", eduEmailVerified: true, phoneVerified: false, wechat: null, instagram: null, bio: null });
      if (url.endsWith("/applications/mine")) return jsonResponse([
        { id: "draft-1", status: "DRAFT" },
        { id: "accepted-1", status: "ACCEPTED" },
        { id: "completed-1", status: "COMPLETED" }
      ]);
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountExperience mode="overview" />);
    });

    const rendered = text(renderer.root);
    expect(rendered).toContain("1 个进行中");
    expect(rendered).toContain("2 个已接受");
    expect(rendered).not.toContain("2 个进行中");
  });

  it("sends displayed empty profile fields as clear operations when saving a role change", async () => {
    writeStoredAuthSession("owner-token");
    let patchBody: unknown;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "owner-1", email: "owner@example.com", role: "USER" });
      if (url.endsWith("/profiles/me") && init?.method === "GET") return jsonResponse(profile());
      if (url.endsWith("/applications/mine")) return jsonResponse([]);
      if (url.endsWith("/profiles/me") && init?.method === "PATCH") {
        patchBody = JSON.parse(String(init.body));
        return jsonResponse({ ...profile(), role: "lister" });
      }
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountExperience mode="profile" />);
    });

    const role = renderer.root.findByType("select");
    act(() => role.props.onChange({ target: { value: "lister" } }));
    await act(async () => findButton(renderer, "保存资料").props.onClick());

    expect(patchBody).toEqual({ displayName: null, school: null, city: null, bio: null, role: "lister" });
    expect(text(renderer.root)).toContain("个人资料已保存。");
  });

  it("shows a visible error when profile saving fails", async () => {
    writeStoredAuthSession("owner-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return jsonResponse({ id: "owner-1", email: "owner@example.com", role: "USER" });
      if (url.endsWith("/profiles/me") && init?.method === "GET") return jsonResponse(profile());
      if (url.endsWith("/applications/mine")) return jsonResponse([]);
      if (url.endsWith("/profiles/me") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ message: "invalid profile" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      return new Response(null, { status: 404 });
    }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AccountExperience mode="profile" />);
    });

    await act(async () => findButton(renderer, "保存资料").props.onClick());

    expect(text(renderer.root)).toContain("个人资料保存失败，请重试。");
    expect(renderer.root.findByProps({ role: "alert" })).toBeDefined();
  });
});

function profile() {
  return { id: "profile-1", email: "owner@example.com", displayName: null, avatarUrl: null, school: null, city: null, role: "renter" as const, eduEmailVerified: false, phoneVerified: false, wechat: null, instagram: null, bio: null };
}

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.findAllByType("button").find((node) => text(node).includes(label));
  expect(button).toBeDefined();
  return button!;
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
