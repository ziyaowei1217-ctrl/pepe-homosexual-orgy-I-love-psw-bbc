// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AdminDashboardExperience,
  AdminRoommatesExperience,
  AdminTrustExperience
} from "../components/marketplace/admin-experiences";

describe("admin workspace experiences", () => {
  it("summarizes the review queue without renter discovery content", () => {
    const html = renderToStaticMarkup(<AdminDashboardExperience />);
    expect(html).toContain("审核概览");
    expect(html).toContain("待审核房源");
    expect(html).toContain("风险提醒");
    expect(html).toContain("最近操作");
    expect(html).not.toContain("猜你喜欢");
  });

  it("gives trust reviewers evidence and explicit decisions", () => {
    const html = renderToStaticMarkup(<AdminTrustExperience />);
    expect(html).toContain("信任审核");
    expect(html).toContain("证据清单");
    expect(html).toContain("处理理由");
    expect(html).toContain("通过审核");
    expect(html).toContain("拒绝并退回");
  });

  it("manages roommate profiles separately from trust cases", () => {
    const html = renderToStaticMarkup(<AdminRoommatesExperience />);
    expect(html).toContain("室友资料");
    expect(html).toContain("已展示");
    expect(html).toContain("已隐藏");
    expect(html).toContain("编辑资料");
    expect(html).toContain("归档");
    expect(html).not.toContain("通过审核");
  });
});
