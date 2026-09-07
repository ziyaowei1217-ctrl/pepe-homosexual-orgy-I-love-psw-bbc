// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountExperience } from "../components/marketplace/account-experience";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("persists an explicitly cleared biography without clearing fields absent from the editor", async () => {
  writeStoredAuthSession("profile-token");
  let stored = {
    id: "profile", email: "user@example.com", displayName: "Lin", avatarUrl: "https://example.com/avatar.jpg",
    school: "UCLA", city: "LA", role: "renter", bio: "Old biography", wechat: "private-contact",
    instagram: null, eduEmailVerified: false, phoneVerified: false
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "user", email: stored.email, role: "USER" });
    if (url.endsWith("/applications/mine")) return Response.json([]);
    if (url.endsWith("/profiles/me")) {
      if (init?.method === "PATCH") stored = { ...stored, ...JSON.parse(String(init.body)) };
      return Response.json(stored);
    }
    return Response.json({}, { status: 404 });
  }));
  const first = render(<AccountExperience mode="profile" />);
  fireEvent.change(await screen.findByLabelText("个人简介"), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  await screen.findByText("个人资料已保存。");
  first.unmount();
  render(<AccountExperience mode="profile" />);
  expect((await screen.findByLabelText("个人简介") as HTMLTextAreaElement).value).toBe("");
  expect(stored.wechat).toBe("private-contact");
  expect(stored.avatarUrl).toBe("https://example.com/avatar.jpg");
});

it("does not log in from a verification response after leaving the login page", async () => {
  let completeVerification!: (response: Response) => void;
  const verification = new Promise<Response>((resolve) => { completeVerification = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/email-code")) return Response.json({ email: "user@example.com", expiresAt: "2099-01-01T00:00:00Z" });
    if (url.endsWith("/auth/verify-email")) return verification;
    return Response.json({}, { status: 404 });
  }));
  const page = render(<AccountExperience mode="overview" />);
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "user@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
  fireEvent.change(await screen.findByLabelText("验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
  page.unmount();
  await act(async () => { completeVerification(Response.json({ accessToken: "abandoned-token", user: { id: "user", email: "user@example.com", role: "USER" } })); });
  expect(readStoredAuthSession()).toBeNull();
});

it("keeps one verification in flight and prevents editing its email until it completes", async () => {
  let completeVerification!: (response: Response) => void;
  const verification = new Promise<Response>((resolve) => { completeVerification = resolve; });
  const attempts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/email-code")) return Response.json({ email: "user@example.com", expiresAt: "2099-01-01T00:00:00Z" });
    if (url.endsWith("/auth/verify-email")) { attempts.push(String(init?.body)); return verification; }
    return Response.json({}, { status: 404 });
  }));
  render(<AccountExperience mode="overview" />);
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "user@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
  const code = await screen.findByLabelText("验证码");
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.submit(code.closest("form")!);
  fireEvent.submit(code.closest("form")!);
  expect(attempts).toHaveLength(1);
  expect((screen.getByRole("button", { name: "修改邮箱" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { completeVerification(Response.json({}, { status: 400 })); });
  fireEvent.click(screen.getByRole("button", { name: "修改邮箱" }));
  expect(screen.getByLabelText("邮箱地址")).toBeDefined();
});
