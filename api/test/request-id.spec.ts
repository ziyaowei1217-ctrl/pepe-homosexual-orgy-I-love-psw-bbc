import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/http/request-id";

describe("requestIdMiddleware", () => {
  it("replaces an inbound request id with a server-generated id and returns it", () => {
    const request = { headers: { "x-request-id": "attacker-controlled" } } as any;
    const setHeader = vi.fn();
    const next = vi.fn();

    requestIdMiddleware(request, { setHeader } as any, next);

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.requestId).not.toBe("attacker-controlled");
    expect(setHeader).toHaveBeenCalledWith("X-Request-ID", request.requestId);
    expect(next).toHaveBeenCalledOnce();
  });
});
