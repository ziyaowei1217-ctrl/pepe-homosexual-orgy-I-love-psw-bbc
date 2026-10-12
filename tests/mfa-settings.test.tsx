// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountExperience } from "../components/marketplace/account-experience";
import { MfaSettings } from "../components/mfa-settings";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const future = new Date(Date.now() + 600_000).toISOString();
function mockApi(handler: (path: string, body: Record<string, string>) => Response | Promise<Response>) {
  writeStoredAuthSession("ordinary-token");
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname.replace("/api/v1", "");
    if (path === "/auth/me") return Response.json({ id: "u", email: "u@example.test", role: "USER" });
    if (path === "/profiles/me") return Response.json({ id: "p", role: "renter" });
    if (path === "/applications/mine") return Response.json([]);
    return handler(path, JSON.parse(String(init?.body ?? "{}")));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("keeps one-time recovery codes visible in the real root provider, then rotates the token after acknowledgement", async () => {
  let enabled = false;
  const secret = "EXAMPLESETUPSECRET";
  const recovery = "ONLY-ONCE-RECOVERY";
  mockApi((path, body) => {
    if (path === "/auth/mfa") return Response.json({ enabled, recoveryCodesRemaining: enabled ? 10 : 0, verifiedUntil: null });
    if (path === "/auth/mfa/enrollment") return Response.json({ secret, otpauthUri: "otpauth://totp/Sublet?secret=EXAMPLESETUPSECRET" });
    if (path === "/auth/mfa/enrollment/confirm") {
      expect(body).toEqual({ code: "123456" }); enabled = true;
      return Response.json({ accessToken: "verified-token", recoveryCodes: [recovery], verifiedUntil: future });
    }
    return Response.json({}, { status: 404 });
  });
  render(<SavedListingsProvider><AccountExperience mode="verification" /></SavedListingsProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "绑定验证器" }));
  const secretField = await screen.findByLabelText("验证器设置密钥");
  expect(secretField.getAttribute("type")).toBe("password");
  fireEvent.change(screen.getByLabelText("验证器验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "确认启用" }));
  await screen.findByText(recovery);
  expect(readStoredAuthSession()?.accessToken).toBe("ordinary-token");
  expect(JSON.stringify(localStorage)).not.toContain(recovery);
  expect(JSON.stringify(localStorage)).not.toContain(secret);
  expect(screen.queryByLabelText("验证器设置密钥")).toBeNull();
  expect((screen.getByRole("button", { name: "完成并隐藏恢复码" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("我已将恢复码保存在安全的位置"));
  fireEvent.click(screen.getByRole("button", { name: "完成并隐藏恢复码" }));
  expect(screen.queryByText(recovery)).toBeNull();
  expect(readStoredAuthSession()?.accessToken).toBe("verified-token");
});

it("offers email reauthentication when enrollment requires a recent login", async () => {
  const reauthenticate = vi.fn();
  mockApi((path) => path === "/auth/mfa" ? Response.json({ enabled: false, recoveryCodesRemaining: 0, verifiedUntil: null })
    : Response.json({ code: "AUTH_RECENT_LOGIN_REQUIRED" }, { status: 403 }));
  render(<MfaSettings token="ordinary-token" onEnrolled={vi.fn()} onReauthenticate={reauthenticate} />);
  fireEvent.click(await screen.findByRole("button", { name: "绑定验证器" }));
  fireEvent.click(await screen.findByRole("button", { name: "重新登录邮箱" }));
  expect(reauthenticate).toHaveBeenCalledOnce();
});

it("verifies with exactly one recovery code and does not discard input on retryable errors", async () => {
  let attempts = 0;
  mockApi((path, body) => {
    if (path === "/auth/mfa") return Response.json({ enabled: true, recoveryCodesRemaining: 8, verifiedUntil: null });
    expect(path).toBe("/auth/mfa/verify"); expect(body).toEqual({ recoveryCode: "RECOVERY-CODE" });
    if (++attempts === 1) throw new TypeError("Failed to fetch");
    return Response.json({ accessToken: "verified-token", verifiedUntil: future });
  });
  render(<MfaSettings token="ordinary-token" onEnrolled={vi.fn()} onReauthenticate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "验证敏感操作" }));
  fireEvent.click(screen.getByRole("button", { name: "使用恢复码" }));
  fireEvent.change(screen.getByLabelText("恢复码"), { target: { value: "RECOVERY-CODE" } });
  fireEvent.click(screen.getByRole("button", { name: "确认验证" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("恢复码") as HTMLInputElement).value).toBe("RECOVERY-CODE");
  fireEvent.click(screen.getByRole("button", { name: "确认验证" }));
  await waitFor(() => expect(readStoredAuthSession()?.accessToken).toBe("verified-token"));
});

it("requires a factor to disable and refreshes the disabled state", async () => {
  let enabled = true;
  mockApi((path, body) => {
    if (path === "/auth/mfa") return Response.json({ enabled, recoveryCodesRemaining: 10, verifiedUntil: null });
    expect(path).toBe("/auth/mfa/disable"); expect(body).toEqual({ code: "654321" });
    enabled = false; return Response.json({ disabled: true });
  });
  render(<MfaSettings token="ordinary-token" onEnrolled={vi.fn()} onReauthenticate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "停用双重验证" }));
  expect((screen.getByRole("button", { name: "确认停用" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("验证器验证码"), { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
  await screen.findByRole("button", { name: "绑定验证器" });
});

it("does not restore a stale token or disclose enrollment results after another account becomes active", async () => {
  let resolve!: (response: Response) => void;
  const onEnrolled = vi.fn();
  mockApi(path => path === "/auth/mfa" ? Response.json({ enabled: false, recoveryCodesRemaining: 0, verifiedUntil: null })
    : new Promise<Response>(done => { resolve = done; }));
  render(<MfaSettings token="ordinary-token" onEnrolled={onEnrolled} onReauthenticate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "绑定验证器" }));
  await act(async () => { writeStoredAuthSession("another-account"); resolve(Response.json({ secret: "DO-NOT-SHOW", otpauthUri: "otpauth://totp/test" })); });
  expect(screen.queryByLabelText("验证器设置密钥")).toBeNull();
  expect(readStoredAuthSession()?.accessToken).toBe("another-account");
  expect(onEnrolled).not.toHaveBeenCalled();
});
