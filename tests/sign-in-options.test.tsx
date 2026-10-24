// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AccountExperience } from "../components/marketplace/account-experience";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

const provider = vi.hoisted(() => ({ create: vi.fn(), social: vi.fn(), signOut: vi.fn() }));
vi.mock("@neondatabase/auth", () => ({ createAuthClient: provider.create }));
let backend: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;
let routes: Record<string, (init?: RequestInit) => Promise<Response> | Response>;
const calls = (suffix: string) => backend.mock.calls.filter(([url]) => String(url).endsWith(suffix));
function profile(token: string, phoneVerified = false) {
  return { id: `profile-${token}`, email: `${token}@example.com`, displayName: null, avatarUrl: null, school: null, city: null, role: "renter", eduEmailVerified: false, phoneVerified, wechat: null, instagram: null, bio: null };
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon");
  vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "google,email,phone");
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("scrollTo", vi.fn());
  provider.create.mockReturnValue({ signIn: { social: provider.social }, signOut: provider.signOut });
  provider.social.mockResolvedValue({ data: {}, error: null });
  provider.signOut.mockResolvedValue({ data: {}, error: null });
  routes = {
    "/api/auth/email-otp/send-verification-otp": () => Response.json({ ok: true }),
    "/api/auth/sign-in/email-otp": () => Response.json({ ok: true }),
    "/api/auth/token": () => Response.json({ token: "signed-provider-proof" }),
    "/auth/neon/exchange": () => Response.json({ accessToken: "email-app-session", user: { id: "u1", email: "new@example.com", role: "USER" }, isNewUser: true }),
    "/auth/phone/availability": () => Response.json({ enabled: true, regions: ["US_CA"] }),
    "/auth/phone/sign-in/code": () => Response.json({ phoneNumber: "+1 ••• ••• 2671", expiresInSeconds: 600 }),
    "/auth/phone/sign-in/verify": () => Response.json({ accessToken: "phone-app-session", user: { id: "u2", email: "phone@example.com", role: "USER" }, isNewUser: false })
  };
  backend = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "guest";
    for (const [suffix, handler] of Object.entries(routes)) if (url.endsWith(suffix)) return handler(init);
    if (url.endsWith("/auth/me")) return Response.json({ id: token, email: `${token}@example.com`, role: "USER" });
    if (url.endsWith("/profiles/me")) return Response.json(profile(token));
    return Response.json([]);
  });
  vi.stubGlobal("fetch", backend);
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("account sign-in methods", () => {
  it("shows only the original Google screen when no other method is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "");
    render(<AccountExperience mode="overview" />);
    expect(await screen.findByRole("button", { name: "使用 Google 登录" })).toBeTruthy();
    expect(screen.queryByLabelText("邮箱地址", { selector: "input" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("signs up or in with an emailed code and exchanges a fresh provider proof", async () => {
    render(<AccountExperience mode="overview" />);
    expect(await screen.findByText(/使用 Google、邮箱验证码或手机号登录/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("邮箱地址", { selector: "input" }), { target: { value: " New@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    const codeInput = await screen.findByLabelText("邮箱验证码", { selector: "input" });
    expect(JSON.parse(String(calls("/api/auth/email-otp/send-verification-otp")[0][1]?.body))).toEqual({ email: "new@example.com", type: "sign-in" });
    fireEvent.change(codeInput, { target: { value: "12 34 56" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(readStoredAuthSession()?.accessToken).toBe("email-app-session"));
    expect(JSON.parse(String(calls("/api/auth/sign-in/email-otp")[0][1]?.body))).toEqual({ email: "new@example.com", otp: "123456" });
    expect(JSON.parse(String(calls("/auth/neon/exchange")[0][1]?.body))).toEqual({ token: "signed-provider-proof" });
  });

  it("does not overwrite an account that changed in another tab during email sign-in", async () => {
    let release!: () => void;
    routes["/api/auth/sign-in/email-otp"] = () => new Promise<Response>((resolve) => { release = () => resolve(Response.json({ ok: true })); });
    render(<AccountExperience mode="overview" />);
    fireEvent.change(await screen.findByLabelText("邮箱地址", { selector: "input" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    fireEvent.change(await screen.findByLabelText("邮箱验证码", { selector: "input" }), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(calls("/api/auth/sign-in/email-otp")).toHaveLength(1));
    act(() => writeStoredAuthSession("other-tab-account"));
    await act(async () => release());
    await waitFor(() => expect(calls("/auth/neon/exchange")).toHaveLength(0));
    expect(readStoredAuthSession()?.accessToken).toBe("other-tab-account");
  });

  it("shows fixed messages for wrong codes without exposing provider text", async () => {
    routes["/api/auth/sign-in/email-otp"] = () => Response.json({ code: "EMAIL_CODE_INVALID" }, { status: 400 });
    render(<AccountExperience mode="overview" />);
    fireEvent.change(await screen.findByLabelText("邮箱地址", { selector: "input" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    fireEvent.change(await screen.findByLabelText("邮箱验证码", { selector: "input" }), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    expect((await screen.findByRole("alert")).textContent).toBe("验证码不正确，请检查后重试。");
    expect(readStoredAuthSession()).toBeNull();
    expect(calls("/auth/neon/exchange")).toHaveLength(0);
  });

  it("signs in with a linked phone number", async () => {
    render(<AccountExperience mode="overview" />);
    fireEvent.click(await screen.findByRole("tab", { name: "手机号" }));
    fireEvent.change(await screen.findByLabelText("手机号", { selector: "input" }), { target: { value: "(415) 555-2671" } });
    expect(screen.getByText(/支持美国\/加拿大（\+1）手机号/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "发送短信验证码" }));
    fireEvent.change(await screen.findByLabelText("短信验证码", { selector: "input" }), { target: { value: "654321" } });
    expect(screen.getByText(/如果 \+1 ••• ••• 2671 已绑定 psw 账户/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(readStoredAuthSession()?.accessToken).toBe("phone-app-session"));
    expect(JSON.parse(String(calls("/auth/phone/sign-in/verify")[0][1]?.body))).toEqual({ phoneNumber: "(415) 555-2671", code: "654321" });
  });

  it("hides the phone tab when the API has phone sign-in switched off or lacks it", async () => {
    for (const handler of [() => Response.json({ enabled: false, regions: [] }), () => Response.json({ code: "NOT_FOUND" }, { status: 404 })]) {
      routes["/auth/phone/availability"] = handler;
      render(<AccountExperience mode="overview" />);
      expect(await screen.findByLabelText("邮箱地址", { selector: "input" })).toBeTruthy();
      await waitFor(() => expect(calls("/auth/phone/availability").length).toBeGreaterThan(0));
      await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
      expect(screen.queryByRole("button", { name: "发送短信验证码" })).toBeNull();
      cleanup(); backend.mockClear();
    }
  });

  it("offers a retry when phone availability cannot be reached", async () => {
    routes["/auth/phone/availability"] = () => { throw new TypeError("Failed to fetch"); };
    render(<AccountExperience mode="overview" />);
    fireEvent.click(await screen.findByRole("tab", { name: "手机号" }));
    expect((await screen.findByText(/暂时无法连接服务器/)).textContent).toContain("请检查网络");
    routes["/auth/phone/availability"] = () => Response.json({ enabled: true, regions: ["US_CA"] });
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("button", { name: "发送短信验证码" })).toBeTruthy();
  });

  it("keeps each method's progress when switching tabs, with arrow-key tab navigation", async () => {
    render(<AccountExperience mode="overview" />);
    fireEvent.change(await screen.findByLabelText("邮箱地址", { selector: "input" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    await screen.findByLabelText("邮箱验证码", { selector: "input" });
    const emailTab = screen.getByRole("tab", { name: "邮箱验证码" });
    emailTab.focus();
    fireEvent.keyDown(emailTab, { key: "ArrowRight" });
    const phoneTab = screen.getByRole("tab", { name: "手机号" });
    expect(phoneTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(phoneTab);
    expect(emailTab.tabIndex).toBe(-1);
    fireEvent.keyDown(phoneTab, { key: "ArrowLeft" });
    expect((screen.getByLabelText("邮箱验证码", { selector: "input" }) as HTMLInputElement).closest("[hidden]")).toBeNull();
    expect(calls("/api/auth/email-otp/send-verification-otp")).toHaveLength(1);
  });

  it("retries only the account exchange after the emailed code was accepted", async () => {
    let failures = 1;
    routes["/auth/neon/exchange"] = () => failures-- > 0
      ? Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 })
      : Response.json({ accessToken: "email-app-session", user: { id: "u1", email: "new@example.com", role: "USER" }, isNewUser: true });
    render(<AccountExperience mode="overview" />);
    fireEvent.change(await screen.findByLabelText("邮箱地址", { selector: "input" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    fireEvent.change(await screen.findByLabelText("邮箱验证码", { selector: "input" }), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    expect((await screen.findByRole("alert")).textContent).not.toMatch(/验证码不正确|Error|undefined/);
    fireEvent.click(screen.getByRole("button", { name: "继续登录" }));
    await waitFor(() => expect(readStoredAuthSession()?.accessToken).toBe("email-app-session"));
    expect(calls("/api/auth/sign-in/email-otp")).toHaveLength(1);
  });

  it("waits a minute before another code can be requested", async () => {
    render(<AccountExperience mode="overview" />);
    fireEvent.change(await screen.findByLabelText("邮箱地址", { selector: "input" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    const resend = await screen.findByRole("button", { name: /重新发送（\d+ 秒）/ });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(resend);
    expect(calls("/api/auth/email-otp/send-verification-otp")).toHaveLength(1);
  });

  it("finishes logout of a phone session that has no provider session", async () => {
    provider.signOut.mockResolvedValue({ data: null, error: { status: 400, message: "Failed to get session" } });
    writeStoredAuthSession("phone-app-session");
    render(<AccountExperience mode="overview" />);
    fireEvent.click(await screen.findByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(provider.signOut).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/登录服务尚未完成退出/)).toBeNull());
    expect(readStoredAuthSession()).toBeNull();
  });
});

describe("linking a phone number", () => {
  it("falls back to the read-only row when the API has no phone support", async () => {
    routes["/auth/phone"] = () => Response.json({ code: "NOT_FOUND" }, { status: 404 });
    writeStoredAuthSession("member");
    render(<AccountExperience mode="verification" />);
    expect(await screen.findByText("手机号认证暂未开放。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "绑定手机号" })).toBeNull();
  });

  it("asks for a fresh sign-in instead of signing out when the session is too old to change the phone", async () => {
    routes["/auth/phone"] = () => Response.json({ enabled: true, regions: ["US_CA"], linked: false, phoneNumber: null, verifiedAt: null });
    routes["/auth/phone/link/code"] = () => Response.json({ code: "RECENT_SIGN_IN_REQUIRED" }, { status: 403 });
    writeStoredAuthSession("member");
    render(<AccountExperience mode="verification" />);
    fireEvent.click(await screen.findByRole("button", { name: "绑定手机号" }));
    fireEvent.change(screen.getByLabelText("手机号", { selector: "input" }), { target: { value: "415 555 2671" } });
    fireEvent.click(screen.getByRole("button", { name: "发送短信验证码" }));
    expect((await screen.findByRole("alert")).textContent).toContain("重新登录");
    expect(readStoredAuthSession()?.accessToken).toBe("member");
  });

  beforeEach(() => {
    routes["/auth/phone"] = () => Response.json({ enabled: true, regions: ["US_CA", "CN"], linked: false, phoneNumber: null, verifiedAt: null });
    routes["/auth/phone/link/code"] = () => Response.json({ phoneNumber: "+86 ••• •••• 8000", expiresInSeconds: 600 });
    routes["/auth/phone/link/verify"] = () => Response.json({ code: "INVALID_PHONE_CODE" }, { status: 400 });
  });

  it("keeps the session when a link code is wrong, then links and offers unlinking", async () => {
    writeStoredAuthSession("member");
    render(<AccountExperience mode="verification" />);
    fireEvent.click(await screen.findByRole("button", { name: "绑定手机号" }));
    fireEvent.change(screen.getByLabelText("手机号", { selector: "input" }), { target: { value: "138 0013 8000" } });
    fireEvent.click(screen.getByRole("button", { name: "发送短信验证码" }));
    fireEvent.change(await screen.findByLabelText("短信验证码", { selector: "input" }), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并绑定" }));
    expect((await screen.findByRole("alert")).textContent).toBe("验证码无效或已过期，请重新获取。");
    expect(readStoredAuthSession()?.accessToken).toBe("member");

    routes["/auth/phone/link/verify"] = () => Response.json({ linked: true, phoneNumber: "+86 ••• •••• 8000", verifiedAt: "2026-10-24T00:00:00.000Z" });
    fireEvent.change(screen.getByLabelText("短信验证码", { selector: "input" }), { target: { value: "222222" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并绑定" }));
    expect(await screen.findByText(/已绑定 \+86 ••• •••• 8000/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "解除绑定" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("13800138000");
  });
});
