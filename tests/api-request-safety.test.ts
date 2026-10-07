import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, getAdminListingMediaContent } from "../lib/api";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded API transport", () => {
  it("avoids cached private data, cookie attachment, and credential-bearing redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    expect(await apiGet("/profiles/me", "token")).toEqual({ ok: true });
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "omit", redirect: "error", headers: { Authorization: "Bearer token" } });
  });
  it("times out a stalled request without replaying a mutation", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    vi.stubGlobal("fetch", fetch);
    const request = apiPost("/applications", { commandId: "once" }, "token");
    const rejected = expect(request).rejects.toMatchObject({ status: 408, retryable: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the timeout active while a response body is stalled", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => Promise.resolve({ ok: true, json: () => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) })));
    const rejected = expect(apiGet("/listings")).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
  });
  it("applies the same private transport to administrator image review", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("image"));
    vi.stubGlobal("fetch", fetch);
    await getAdminListingMediaContent("token", "/api/v1/admin/listings/l/media/m/content");
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error", headers: { Authorization: "Bearer token" } });
  });
});
