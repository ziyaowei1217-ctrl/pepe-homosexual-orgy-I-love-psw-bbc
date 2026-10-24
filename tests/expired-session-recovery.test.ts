// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, verifyAdminStepUpCode } from "../lib/api";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

beforeEach(() => { localStorage.clear(); writeStoredAuthSession("expired-account-a"); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("expired account navigation recovery", () => {
  it("returns a rejected protected session to the login state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(apiGet("/deal-threads", "expired-account-a")).rejects.toMatchObject({ status: 401 });
    expect(readStoredAuthSession()).toBeNull();
  });
  it("preserves a newly signed-in account when a previous account request finishes late", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const oldRequest = apiGet("/deal-threads", "expired-account-a");
    writeStoredAuthSession("fresh-account-b");
    finish(Response.json({}, { status: 401 }));
    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(readStoredAuthSession()?.accessToken).toBe("fresh-account-b");
  });
  it("preserves the app session when a staff verification code is incorrect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(verifyAdminStepUpCode("expired-account-a", "123456")).rejects.toMatchObject({ status: 401 });
    expect(readStoredAuthSession()?.accessToken).toBe("expired-account-a");
  });
  it("preserves the account during a temporary backend outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 503 })));
    await expect(apiGet("/deal-threads", "expired-account-a")).rejects.toMatchObject({ status: 503 });
    expect(readStoredAuthSession()?.accessToken).toBe("expired-account-a");
  });
});
