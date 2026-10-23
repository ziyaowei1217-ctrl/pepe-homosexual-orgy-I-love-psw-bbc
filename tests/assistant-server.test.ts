import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/assistant/route";
import { defaultGateDeps } from "../lib/assistant/server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("assistant server gate", () => {
  it("reports whether a key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "  ");
    expect(await GET().json()).toEqual({ enabled: false });
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(await GET().json()).toEqual({ enabled: true });
  });

  it("claims quota from the API and maps its answers", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://api:4000/api/v1");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(Response.json({ userId: "user-1" }));
    expect(await defaultGateDeps.claimQuota("token-1", "chat")).toBe("user-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:4000/api/v1/assistant/quota/chat");
    expect(init?.headers).toEqual({ Authorization: "Bearer token-1" });

    fetchMock.mockResolvedValueOnce(Response.json({ code: "AUTH" }, { status: 401 }));
    expect(((await defaultGateDeps.claimQuota("t", "chat")) as Response).status).toBe(401);

    fetchMock.mockResolvedValueOnce(Response.json({ code: "ASSISTANT_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "90" } }));
    const limited = (await defaultGateDeps.claimQuota("t", "listing-copy")) as Response;
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("90");

    // An API outage is "unavailable", never "signed out".
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(((await defaultGateDeps.claimQuota("t", "chat")) as Response).status).toBe(503);
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 500 }));
    expect(((await defaultGateDeps.claimQuota("t", "chat")) as Response).status).toBe(503);
  });
});
