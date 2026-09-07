// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicShell } from "../components/marketplace/public-shell";

describe("public marketplace shell", () => {
  it("keeps the renter navigation focused on five independent destinations", () => {
    const html = renderToStaticMarkup(
      <PublicShell active="saved">
        <main>收藏内容</main>
      </PublicShell>
    );

    for (const label of ["找房", "室友", "收藏", "消息", "我的"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('href="/saved"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(">管理后台<");
    expect(html).toContain("收藏内容");
    expect(html).toContain('aria-label="手机导航"');
  });

  it("keeps discovery, saved listings and account reachable from the header when a page owns the bottom actions", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PublicShell active="discover" mobileNavigation="header">
        <main>房源详情</main>
      </PublicShell>
    );

    expect(container.querySelector('nav[aria-label="手机导航"]')).toBeNull();
    const header = container.querySelector("header")!;
    const quickNavigation = header.querySelector('nav[aria-label="手机快捷导航"]')!;
    expect(quickNavigation).not.toBeNull();
    expect(quickNavigation.querySelector('a[href="/search"]')?.textContent).toContain("找房");
    expect(quickNavigation.querySelector('a[href="/saved"]')?.textContent).toContain("收藏");
    expect(header.querySelector('a[aria-label="打开账户"]')?.getAttribute("href")).toBe("/account");
    expect(container.textContent).toContain("房源详情");
  });
});
