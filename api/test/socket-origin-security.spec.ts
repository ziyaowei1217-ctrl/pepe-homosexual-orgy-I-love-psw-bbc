import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { RoommateConversationGateway, SOCKET_AUTH_TIMEOUT_MS } from "../src/roommate-conversations/roommate-conversations.gateway";
import { isAllowedSocketOrigin } from "../src/roommate-conversations/socket-origin";

const production = { NODE_ENV: "production", WEB_ORIGIN: "https://psw.example" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("private messaging socket boundary", () => {
  it("accepts only exact configured browser origins in production", () => {
    expect(isAllowedSocketOrigin("https://psw.example", production)).toBe(true);
    for (const value of [undefined, null, ["https://psw.example"], "null", "https://psw.example/", "https://psw.example.evil.test", "https://psw.example@evil.test", "http://psw.example", "https://psw.example/path", "https://psw.example?query", "https://psw.example#fragment"]) {
      expect(isAllowedSocketOrigin(value, production)).toBe(false);
    }
    expect(isAllowedSocketOrigin(undefined, { NODE_ENV: "test" })).toBe(true);
    expect(isAllowedSocketOrigin("http://localhost:3000", { NODE_ENV: "development" })).toBe(true);
    expect(isAllowedSocketOrigin("http://localhost:3000.evil.test", { NODE_ENV: "development" })).toBe(false);
  });
  it("rejects a foreign browser before token verification or private room membership", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WEB_ORIGIN", "https://psw.example");
    const verify = vi.fn(); const gateway = new RoommateConversationGateway({ fromBearerTokenWithExpiry: verify } as unknown as AuthenticatedUserService);
    const client = socket("https://foreign.example");
    await gateway.handleConnection(client as never);
    expect(verify).not.toHaveBeenCalled(); expect(client.join).not.toHaveBeenCalled(); expect(client.disconnect).toHaveBeenCalledWith(true);
  });
  it("bounds stalled token/database verification and never joins after a late resolution", async () => {
    vi.useFakeTimers();
    let resolve!: (value: { user: { id: string }; expiresAt: number }) => void;
    const verify = vi.fn(() => new Promise<{ user: { id: string }; expiresAt: number }>(done => { resolve = done; }));
    const gateway = new RoommateConversationGateway({ fromBearerTokenWithExpiry: verify } as unknown as AuthenticatedUserService);
    const client = socket(undefined);
    const pending = gateway.handleConnection(client as never);
    await vi.advanceTimersByTimeAsync(SOCKET_AUTH_TIMEOUT_MS);
    await pending;
    expect(client.disconnect).toHaveBeenCalledWith(true); expect(client.join).not.toHaveBeenCalled();
    resolve({ user: { id: "user" }, expiresAt: Date.now() + 60_000 });
    await Promise.resolve();
    expect(client.join).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
function socket(origin: string | undefined) {
  return { handshake: { auth: { token: "test-token" }, headers: { origin } }, join: vi.fn(async () => undefined), disconnect: vi.fn(), once: vi.fn() };
}
