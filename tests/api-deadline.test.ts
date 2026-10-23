import { afterEach, describe, expect, it, vi } from "vitest";
import { API_REQUEST_TIMEOUT_MS, apiGet, apiPost } from "../lib/api";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("API request deadlines", () => {
  it("aborts the actual stalled transport and reports a retryable timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const assertion = expect(apiGet("/listings")).rejects.toMatchObject({ status: 408, retryable: true });
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("releases deadlines after a successful request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ saved: true })));
    await expect(apiPost("/profiles/me", {})).resolves.toEqual({ saved: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not automatically replay a write after losing its response", async () => {
    const request = vi.fn().mockRejectedValue(new TypeError("connection lost"));
    vi.stubGlobal("fetch", request);
    await expect(apiPost("/applications", {})).rejects.toMatchObject({ retryable: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
