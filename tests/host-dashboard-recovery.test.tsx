// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostDashboardExperience } from "../components/marketplace/host-experiences";
import { readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

beforeEach(() => { writeStoredAuthSession("host-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

function setup(options: { listings?: () => Response | Promise<Response>; profile?: () => Response; threads?: unknown[] } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "host", email: "host@example.test", role: "USER" });
    if (url.endsWith("/profiles/me")) return options.profile?.() ?? Response.json({ id: "profile", displayName: "Host", role: "both" });
    if (url.endsWith("/listings/mine")) return options.listings?.() ?? Response.json([{ id: "listing", status: "APPROVED" }]);
    if (url.endsWith("/applications/host-inbox")) return Response.json([{ id: "app", status: "SUBMITTED" }]);
    if (url.endsWith("/deal-threads")) return Response.json(options.threads ?? []);
    return Response.json({}, { status: 404 });
  }));
}
function metric(label: string) {
  return within(screen.getByRole("region", { name: "关键指标" })).getByRole("link", { name: new RegExp(label) });
}

it("does not display zero work before dashboard requests finish", async () => {
  let finish!: (response: Response) => void;
  setup({ listings: () => new Promise<Response>((resolve) => { finish = resolve; }) });
  await act(async () => { render(<HostDashboardExperience />); });
  expect(metric("待处理申请").textContent).toContain("—");
  expect(metric("在线房源").textContent).toContain("—");
  await act(async () => { finish(Response.json([{ id: "listing", status: "APPROVED" }])); });
  expect(metric("待处理申请").textContent).toContain("1");
});

it("keeps failed dashboard totals unknown and recovers them with retry", async () => {
  let failed = true;
  setup({ listings: () => failed ? Response.json({}, { status: 503 }) : Response.json([{ id: "listing", status: "APPROVED" }]) });
  render(<HostDashboardExperience />);
  await screen.findByRole("alert");
  expect(metric("待处理申请").textContent).toContain("—");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载工作台" }));
  await within(metric("在线房源")).findByText("1");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("counts only viewing requests the host can handle, excluding their own requests as a renter", async () => {
  setup({ threads: [
    { id: "host-thread", viewerRole: "host", viewingRequests: [{ id: "incoming", status: "REQUESTED" }, { id: "confirmed", status: "CONFIRMED" }] },
    { id: "renter-thread", viewerRole: "renter", viewingRequests: [{ id: "outgoing-1", status: "REQUESTED" }, { id: "outgoing-2", status: "REQUESTED" }] }
  ] });
  await act(async () => { render(<HostDashboardExperience />); });
  expect(metric("预约").textContent).toMatch(/预约1$/);
});

it("retries a profile outage together with dashboard data without discarding a valid login", async () => {
  let failed = true;
  setup({ profile: () => failed ? Response.json({}, { status: 503 }) : Response.json({ id: "profile", role: "both" }) });
  render(<HostDashboardExperience />);
  await screen.findByRole("alert");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载工作台" }));
  await within(metric("在线房源")).findByText("1");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(readStoredAuthSession()?.accessToken).toBe("host-token");
});
