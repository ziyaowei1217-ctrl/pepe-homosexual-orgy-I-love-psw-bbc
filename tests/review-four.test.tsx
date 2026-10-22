// @vitest-environment jsdom
// The fourth design review, signed-in pages: the host sees the actual things waiting for them, and an application
// shows what its dates cost in the site's date format.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApplicationDetailExperience } from "../components/marketplace/application-experiences";
import { HostDashboardExperience } from "../components/marketplace/host-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";

beforeEach(() => { writeStoredAuthSession("user-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

function api(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.endsWith(path));
    return match ? Response.json(routes[match]) : Response.json({}, { status: 404 });
  }));
}

it("lists what is waiting for the host, each with where to handle it", async () => {
  api({
    "/auth/me": { id: "host", email: "host@example.test", role: "USER" },
    "/profiles/me": { id: "host", displayName: "Lin", role: "both" },
    "/listings/mine": [{ id: "l-2", title: "Koreatown 寒假转租一居", status: "SUBMITTED" }],
    "/applications/host-inbox": [{ id: "a-1", status: "SUBMITTED", contactName: "Chen Yu", listingTitle: "Westwood 主卧", moveIn: "2026-12-20T00:00:00.000Z", moveOut: "2027-03-15T00:00:00.000Z", memberSnapshots: [] }],
    "/deal-threads": [{ id: "t-2", viewerRole: "host", contactName: "Chen Yu", listingTitle: "Westwood 主卧", viewingRequests: [{ id: "v-2", status: "REQUESTED", mode: "in-person", timeLabel: "10月30日 18:30" }] }]
  });
  await act(async () => { render(<HostDashboardExperience />); });
  expect((await screen.findByRole("link", { name: /Chen Yu申请了「Westwood 主卧」/ })).getAttribute("href")).toBe("/host/applications");
  expect(screen.getByRole("link", { name: /Chen Yu想线下看房/ }).getAttribute("href")).toBe("/inbox/t-2");
  expect(screen.getByText("「Koreatown 寒假转租一居」在等平台审核")).toBeTruthy();
});

it("shows an application's dates in the site's format and what they cost", async () => {
  api({
    "/auth/me": { id: "user-lin", email: "lin@example.test", role: "USER" },
    "/applications/mine": [{ id: "app-1", listingId: "preview-02", listingTitle: "Koreatown 地铁口安静次卧", listingOwnerId: "u-maya", submitterId: "user-lin", teamId: null, scope: "SOLO", status: "SUBMITTED",
      memberSnapshots: [], moveIn: "2026-11-01T00:00:00.000Z", moveOut: "2026-12-01T00:00:00.000Z", schoolOrOccupation: "UCLA", incomeBand: "THREE_TO_FOUR_X", guarantorStatus: "AVAILABLE", note: "" }]
  });
  vi.stubEnv("NEXT_PUBLIC_ENABLE_PREVIEW_DATA", "true");
  await act(async () => { render(<ApplicationDetailExperience applicationId="app-1" />); });
  await screen.findByRole("heading", { level: 1, name: "Koreatown 地铁口安静次卧" });
  expect(document.body.textContent).toContain("11月1日 – 12月1日");
  expect(document.body.textContent).not.toContain("2026-11-01");
  expect(await screen.findByText("房租总价")).toBeTruthy();
  expect(document.body.textContent).toContain("· 1 个月");
  vi.unstubAllEnvs();
});
