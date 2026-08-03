import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserDeviceId } from "../lib/device-id";
import { requestEmailCode, verifyEmailCode } from "../lib/api";

describe("authentication device identifier", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key)
        }
      },
      configurable: true
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("550e8400-e29b-41d4-a716-446655440000") });
  });

  it("generates and persists one random UUID", () => {
    expect(getBrowserDeviceId()).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(getBrowserDeviceId()).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(storage.get("sublet_device_id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("sends the persisted UUID on both auth requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ email: "student@example.com", expiresAt: "2030-01-01T00:00:00.000Z" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestEmailCode("student@example.com");
    await verifyEmailCode("student@example.com", "123456");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(init.headers).toMatchObject({ "X-Device-ID": "550e8400-e29b-41d4-a716-446655440000" });
    }
  });
});
