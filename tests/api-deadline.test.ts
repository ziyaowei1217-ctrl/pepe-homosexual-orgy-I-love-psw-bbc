import { afterEach, describe, expect, it, vi } from "vitest";
import { API_REQUEST_TIMEOUT_MS, NEON_AUTH_EXCHANGE_TIMEOUT_MS, apiGet, apiPost } from "../lib/api";

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
  it("keeps the exact Google exchange live past 45 seconds and aborts once at 75 seconds without replay", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const aborted = vi.fn();
    const request = vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!;
      signal.addEventListener("abort", () => {
        aborted();
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    }));
    vi.stubGlobal("fetch", request);
    const assertion = expect(apiPost("/auth/neon/exchange", { token: "provider-proof" })).rejects.toMatchObject({ status: 408, retryable: true });
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    expect(aborted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(NEON_AUTH_EXCHANGE_TIMEOUT_MS - API_REQUEST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("includes response-body consumption in the extended exchange deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const request = vi.fn((_url, options: RequestInit) => {
      signal = options.signal!;
      const body = new ReadableStream({ start(controller) {
        signal!.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } });
      return Promise.resolve(new Response(body, { headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", request);
    const assertion = expect(apiPost("/auth/neon/exchange", {})).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(NEON_AUTH_EXCHANGE_TIMEOUT_MS - API_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    ["GET", "/auth/neon/exchange"],
    ["POST", "/auth/neon/exchange/"],
    ["POST", "/auth/neon/exchange?unexpected=1"],
    ["POST", "/applications"]
  ])("keeps the 45-second default for %s %s", async (method, path) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const request = vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", request);
    const assertion = expect(method === "GET" ? apiGet(path) : apiPost(path, {})).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not automatically replay a write after losing its response", async () => {
    const request = vi.fn().mockRejectedValue(new TypeError("connection lost"));
    vi.stubGlobal("fetch", request);
    await expect(apiPost("/applications", {})).rejects.toMatchObject({ retryable: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
