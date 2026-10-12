// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminStepUpPanel } from "../components/admin-step-up-panel";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
function setup(response: { accessToken: string; verifiedUntil: string } | { status: number }, enabled = true) {
  writeStoredAuthSession("ordinary-token");
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/auth/mfa")) return Response.json({ enabled, recoveryCodesRemaining: 10, verifiedUntil: null });
    expect(String(input)).toMatch(/\/auth\/mfa\/verify$/);
    expect(JSON.parse(String(init?.body))).toEqual({ code: "123456" });
    return "status" in response ? Response.json({}, { status: response.status }) : Response.json(response);
  });
  vi.stubGlobal("fetch", fetcher);
  const onVerified = vi.fn(); const onAuthenticationError = vi.fn(() => true);
  render(<AdminStepUpPanel open sessionToken="ordinary-token" email="admin@example.test" onVerified={onVerified} onCancel={vi.fn()} onAuthenticationError={onAuthenticationError} />);
  return { fetcher, onVerified, onAuthenticationError };
}
it("uses an independent factor, accepts valid proof, and rotates the current token", async () => {
  const verifiedUntil = new Date(Date.now() + 600_000).toISOString();
  const { onVerified } = setup({ accessToken: "verified-token", verifiedUntil });
  fireEvent.change(await screen.findByLabelText("验证器验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "完成管理员验证" }));
  await waitFor(() => expect(onVerified).toHaveBeenCalledWith({ accessToken: "verified-token", reauthenticatedUntil: verifiedUntil }));
  expect(readStoredAuthSession()?.accessToken).toBe("verified-token");
});
it.each([
  { accessToken: "", verifiedUntil: new Date(Date.now() + 600_000).toISOString() },
  { accessToken: "invalid", verifiedUntil: "not-a-date" },
  { accessToken: "expired", verifiedUntil: "2020-01-01T00:00:00Z" }
])("rejects invalid or expired enhanced proof %#", async response => {
  const { onVerified } = setup(response);
  fireEvent.change(await screen.findByLabelText("验证器验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "完成管理员验证" }));
  await screen.findByRole("alert");
  expect(onVerified).not.toHaveBeenCalled();
  expect(readStoredAuthSession()?.accessToken).toBe("ordinary-token");
});
it("guides an administrator without MFA to enrollment without offering email as a second factor", async () => {
  setup({ status: 403 }, false);
  expect((await screen.findByRole("link", { name: "前往绑定验证器" })).getAttribute("href")).toBe("/account/verification");
  expect(screen.queryByRole("button", { name: "发送管理员验证码" })).toBeNull();
  expect(screen.queryByLabelText("验证器验证码")).toBeNull();
});
it("delegates verification 401 to the existing authentication handler", async () => {
  const { onAuthenticationError } = setup({ status: 401 });
  fireEvent.change(await screen.findByLabelText("验证器验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "完成管理员验证" }));
  await waitFor(() => expect(onAuthenticationError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 })));
});
