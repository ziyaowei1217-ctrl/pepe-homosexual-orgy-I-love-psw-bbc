// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminShell, HostShell } from "../components/marketplace/workspace-shells";

describe("role workspace shells", () => {
  it("gives hosts a task-specific workspace instead of renter discovery navigation", () => {
    const html = renderToStaticMarkup(<HostShell active="applications"><main>申请审核</main></HostShell>);

    for (const label of ["房东工作台", "概览", "房源", "申请", "消息"]) expect(html).toContain(label);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="打开账户"');
    expect(html).not.toContain("找室友");
  });

  it("keeps administrator operations in a separate high-density shell", () => {
    const html = renderToStaticMarkup(<AdminShell active="trust"><main>信任审核</main></AdminShell>);

    for (const label of ["运营后台", "审核概览", "信任审核", "室友资料"]) expect(html).toContain(label);
    expect(html).not.toContain("收藏");
  });
});
