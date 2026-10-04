// @vitest-environment jsdom

import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import DemoNoticePage from "../app/demo/page";
import { websiteDemoNotice, websiteDemoSectionForPath } from "../lib/website-demo-navigation";
import { middleware } from "../middleware";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("demo navigation keeps the intended destination", () => {
  it.each([
    ["/inbox", "inbox"], ["/inbox/thread-id", "inbox"], ["/messages", "inbox"], ["/messages/thread-id", "inbox"],
    ["/account", "account"], ["/account/profile", "account"], ["/account/settings", "account"], ["/trips", "account"], ["/trips/trip-id", "account"],
    ["/host", "host"], ["/host/listings/new", "host"], ["/applications/new", "applications"], ["/applications/application-id", "applications"],
    ["/listing/mine", "account"], ["/listing/%6dine", "account"], ["/roommates/likes", "roommates"], ["/roommates/%6cikes", "roommates"], ["/roommates/teams", "roommates"]
  ])("rewrites %s using only the bounded %s notice context", (pathname, section) => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    const response = middleware(new NextRequest(`https://demo.example${pathname}?section=host&next=https://outside.invalid&email=private-marker&token=private-marker`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://demo.example/demo?section=${section}`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });

  it.each([
    ["inbox", "消息", "/inbox", "消息功能暂未开放"],
    ["account", "我的账户", "/account", "账户功能暂未开放"],
    ["host", "房东中心", "/account", "房东发布暂未开放"],
    ["applications", "转租申请", "/account", "申请功能暂未开放"],
    ["roommates", "室友互动", "/roommates", "室友互动暂未开放"]
  ])("renders %s with its own heading and matching desktop and phone navigation", async (section, heading, href, status) => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(await DemoNoticePage({ searchParams: Promise.resolve({ section }) }));
    expect(container.querySelector("h1")?.textContent).toBe(heading);
    expect(container.textContent).toContain(status);
    for (const label of ["主导航", "手机导航"]) {
      const selected = container.querySelectorAll(`nav[aria-label="${label}"] a[aria-current="page"]`);
      expect(selected).toHaveLength(1);
      expect(selected[0].getAttribute("href")).toBe(href);
    }
    expect(container.querySelector("form, input, textarea")).toBeNull();
    expect(container.querySelector('a[href="/search"]')?.hasAttribute("aria-current")).toBe(false);
    expect(container.textContent).toContain("登录、申请、房东发布、聊天、上传和付款暂未开放");
  });

  it.each([undefined, ["inbox", "account"], "__proto__", "constructor", "<script>private-marker</script>", "https://outside.invalid"])("uses neutral static copy for invalid section %j", async section => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    const html = renderToStaticMarkup(await DemoNoticePage({ searchParams: Promise.resolve({ section }) }));
    expect(html).toContain("这个演示仅供浏览");
    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain("private-marker");
    expect(html).not.toContain("outside.invalid");
    expect(websiteDemoNotice(section).active).toBeUndefined();
  });

  it.each(["/demo", "/admin", "/roommates/likes-extra", "/inbox-extra", "/account-extra", "/inbox/%252fprivate", "/inbox/../account", "/account/%00", "/_next/static/%2e%2e/%2e%2e/account"])("does not infer a private section from unrelated or ambiguous path %s", pathname => {
    expect(websiteDemoSectionForPath(pathname)).toBeNull();
  });

  it("retains normal routing with the demo flag off", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    for (const pathname of ["/inbox", "/account", "/messages", "/host", "/applications/new"]) {
      const response = middleware(new NextRequest(`https://web.example${pathname}?section=inbox`));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
