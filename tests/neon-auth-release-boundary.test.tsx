// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AccountExperience } from "../components/marketplace/account-experience";
import { SignInCompletion } from "../components/marketplace/sign-in-completion";
import { getSafeAuthReturnTo } from "../lib/app-routes";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";
import { startGoogleSignIn } from "../lib/neon-auth-client";

const provider = vi.hoisted(() => ({ create: vi.fn(), social: vi.fn(), token: vi.fn(), signOut: vi.fn() }));
vi.mock("@neondatabase/auth", () => ({ createAuthClient: provider.create }));
const navigation = vi.fn();
let backend: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function profile(token: string) {
  return { id: `profile-${token}`, email: `${token}@example.com`, displayName: `Private ${token}`, avatarUrl: null, school: "UCLA", city: "Los Angeles", role: "renter", eduEmailVerified: false, phoneVerified: false, wechat: null, instagram: null, bio: null };
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon");
  vi.stubGlobal("crypto", webcrypto);
  // Keep actual DOM/events and storage, replacing only browser navigation.
  vi.stubGlobal("window", new Proxy(window, { get(target, property) {
    return property === "location" ? { origin: target.location.origin, replace: navigation } : Reflect.get(target, property, target);
  } }));
  provider.create.mockReturnValue({ signIn: { social: provider.social }, token: provider.token, signOut: provider.signOut });
  provider.social.mockResolvedValue({ data: {}, error: null });
  provider.token.mockResolvedValue({ data: { token: "signed-provider-proof" }, error: null });
  provider.signOut.mockResolvedValue({ data: {}, error: null });
  backend = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "guest";
    if (url.endsWith("/auth/neon/exchange")) return Response.json({ accessToken: "new-app-session", user: { id: "new-user", email: "new@example.com", role: "USER" }, isNewUser: false });
    if (url.endsWith("/auth/me")) return Response.json({ id: token, email: `${token}@example.com`, role: "USER" });
    if (url.endsWith("/profiles/me")) return Response.json(profile(token));
    return Response.json([]);
  });
  vi.stubGlobal("fetch", backend);
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const exchanges = () => backend.mock.calls.filter(([url]) => String(url).endsWith("/auth/neon/exchange"));

describe("OAuth completion safety", () => {
  it("does not exchange a lingering provider cookie when no sign-in was started in this tab", async () => {
    writeStoredAuthSession("existing-account");
    render(<SignInCompletion />);
    await screen.findByRole("alert");
    expect(provider.token).not.toHaveBeenCalled(); expect(exchanges()).toHaveLength(0);
    expect(readStoredAuthSession()?.accessToken).toBe("existing-account"); expect(navigation).not.toHaveBeenCalled();
  });

  it("does not overwrite an account changed in another tab while Google was open", async () => {
    writeStoredAuthSession("account-before-google");
    await startGoogleSignIn("/inbox");
    writeStoredAuthSession("different-account-before-callback");
    render(<SignInCompletion />);
    await screen.findByRole("alert");
    expect(provider.token).not.toHaveBeenCalled(); expect(exchanges()).toHaveLength(0);
    expect(readStoredAuthSession()?.accessToken).toBe("different-account-before-callback");
  });

  it("rechecks the active account before sending the provider proof to the backend", async () => {
    const proof = deferred<{ data: { token: string }; error: null }>();
    await startGoogleSignIn("/inbox");
    provider.token.mockReturnValueOnce(proof.promise);
    render(<SignInCompletion />);
    await waitFor(() => expect(provider.token).toHaveBeenCalledOnce());
    act(() => writeStoredAuthSession("new-account-during-provider-check"));
    await act(async () => proof.resolve({ data: { token: "old-provider-proof" }, error: null }));
    await screen.findByRole("alert");
    expect(exchanges()).toHaveLength(0);
    expect(readStoredAuthSession()?.accessToken).toBe("new-account-during-provider-check");
  });

  it("expires an abandoned attempt after ten minutes", async () => {
    const time = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    await startGoogleSignIn("/inbox");
    time.mockReturnValue(1_800_000_600_001);
    render(<SignInCompletion />);
    await screen.findByRole("alert");
    expect(provider.token).not.toHaveBeenCalled(); expect(exchanges()).toHaveLength(0);
    time.mockRestore();
  });

  it("keeps an account selected while the application exchange was in flight", async () => {
    const result = deferred<Response>();
    const normalFetch = backend.getMockImplementation()!;
    backend.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/auth/neon/exchange") ? result.promise : normalFetch(input, init));
    await startGoogleSignIn("/inbox");
    render(<SignInCompletion />);
    await waitFor(() => expect(exchanges()).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toContain("首次连接可能需要约一分钟");
    act(() => writeStoredAuthSession("account-selected-during-exchange"));
    await act(async () => result.resolve(Response.json({ accessToken: "late-old-app-session", user: { id: "old" }, isNewUser: false })));
    await screen.findByRole("alert");
    expect(readStoredAuthSession()?.accessToken).toBe("account-selected-during-exchange");
    expect(navigation).not.toHaveBeenCalled();
  });

  it("completes one attempt exactly once under Strict Mode and rejects replay after remount", async () => {
    await startGoogleSignIn("/inbox?listingId=listing-1");
    const view = render(<StrictMode><SignInCompletion /></StrictMode>);
    await waitFor(() => expect(navigation).toHaveBeenCalledWith("/inbox?listingId=listing-1"));
    expect(exchanges()).toHaveLength(1); expect(provider.token).toHaveBeenCalledOnce();
    expect(readStoredAuthSession()?.accessToken).toBe("new-app-session");
    view.unmount();
    render(<SignInCompletion />);
    await screen.findByRole("alert");
    expect(exchanges()).toHaveLength(1); expect(navigation).toHaveBeenCalledOnce();
  });

  it("discards a cancelled OAuth attempt instead of accepting an older provider cookie on a later visit", async () => {
    await startGoogleSignIn("/inbox");
    const view = render(<SignInCompletion failed />);
    await screen.findByRole("alert");
    view.unmount();
    render(<SignInCompletion />);
    await screen.findByRole("alert");
    expect(provider.token).not.toHaveBeenCalled(); expect(exchanges()).toHaveLength(0);
    expect(readStoredAuthSession()).toBeNull();
  });

  it.each(["/auth/complete", "/auth/complete?error=oauth", "/api/auth/token", "/api/auth/complete", "/%61uth/complete", "/%2561uth/complete"])("rejects auth/API return destinations: %s", path => {
    expect(getSafeAuthReturnTo(path)).toBe("/");
  });
});

describe("local logout safety", () => {
  it("clears private data before provider logout settles and preserves a retryable failure after remount", async () => {
    writeStoredAuthSession("private-account");
    const signOut = deferred<{ error: { message: string } }>();
    provider.signOut.mockReturnValueOnce(signOut.promise);
    render(<AccountExperience mode="overview" />);
    await screen.findAllByText("private-account@example.com");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(readStoredAuthSession()).toBeNull();
    expect(screen.queryAllByText("private-account@example.com")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "使用 Google 登录" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => signOut.resolve({ error: { message: "provider offline" } }));
    expect((await screen.findByRole("alert")).textContent).toContain("已退出此设备");
    expect(readStoredAuthSession()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试结束登录会话" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(provider.signOut).toHaveBeenCalledTimes(2);
  });

  it("allows local logout even while the account service is unavailable", async () => {
    writeStoredAuthSession("unavailable-account");
    backend.mockImplementation(async () => Response.json({}, { status: 503 }));
    render(<AccountExperience mode="overview" />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(readStoredAuthSession()).toBeNull();
    expect(await screen.findByRole("button", { name: "使用 Google 登录" })).toBeTruthy();
  });

  it("does not clear a new account when an earlier provider logout fails late", async () => {
    writeStoredAuthSession("account-A");
    const signOut = deferred<{ error: { message: string } }>();
    provider.signOut.mockReturnValueOnce(signOut.promise);
    render(<AccountExperience mode="overview" />);
    await screen.findAllByText("account-A@example.com");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    act(() => writeStoredAuthSession("account-B"));
    await screen.findAllByText("account-B@example.com");
    await act(async () => signOut.resolve({ error: { message: "old provider logout failed" } }));
    expect(readStoredAuthSession()?.accessToken).toBe("account-B");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
