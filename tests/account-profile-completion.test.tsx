// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountExperience } from "../components/marketplace/account-experience";
import { writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
function setup(profile: Record<string, unknown>) {
  writeStoredAuthSession("account-token");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "user", email: "lin@example.test", role: "USER" });
    if (url.endsWith("/profiles/me")) return Response.json({ id: "profile", role: "renter", ...profile });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
}

it.each([
  [{}, 0],
  [{ displayName: "Lin", school: "UCLA", city: " ", bio: null }, 50],
  [{ displayName: "Lin", school: "UCLA", city: "Los Angeles", bio: "爱好阅读" }, 100]
])("reflects the saved profile's completeness: %j", async (profile, percent) => {
  setup(profile);
  render(<AccountExperience mode="overview" />);
  const progress = await screen.findByRole("progressbar", { name: "资料完成度" });
  expect(progress.getAttribute("aria-valuenow")).toBe(String(percent));
  expect(screen.getByRole("link", { name: percent === 100 ? "编辑资料" : "完善资料" }).getAttribute("href")).toBe("/account/profile");
});

it("offers working notification destinations without switches that cannot save or control delivery", async () => {
  setup({});
  render(<AccountExperience mode="settings" />);
  expect((await screen.findByRole("link", { name: "查看申请进度" })).getAttribute("href")).toBe("/applications");
  expect(screen.getByRole("link", { name: "查看新消息" }).getAttribute("href")).toBe("/inbox");
  expect(screen.queryByRole("button", { name: /已开启|已关闭/ })).toBeNull();
});

it("shows verified states and explains why unavailable verification cannot be started", async () => {
  setup({ eduEmailVerified: true, phoneVerified: false });
  render(<AccountExperience mode="verification" />);
  await screen.findByText("手机号认证暂未开放。");
  expect(screen.getByText("教育邮箱已验证")).toBeTruthy();
  expect(screen.queryByText("去认证")).toBeNull();
});
