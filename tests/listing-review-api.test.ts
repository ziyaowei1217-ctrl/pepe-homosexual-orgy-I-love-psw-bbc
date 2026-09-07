import { afterEach, describe, expect, it, vi } from "vitest";

import { approveAdminListing, rejectAdminListing } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("listing review API", () => {
  it.each(["approve", "reject"])("sends the reviewed snapshot revision with %s", async (decision) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "listing-1" }), {
      status: 201, headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    if (decision === "approve") await approveAdminListing("admin-token", "listing-1", 7);
    else await rejectAdminListing("admin-token", "listing-1", "Needs changes", 7);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(decision === "approve"
      ? { revision: 7 }
      : { reason: "Needs changes", revision: 7 });
  });
});
