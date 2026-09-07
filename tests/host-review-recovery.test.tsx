// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostApplicationsExperience } from "../components/marketplace/host-experiences";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { ApiRentalApplication } from "../lib/rental-applications";

vi.mock("../components/payment-panel", () => ({ PaymentPanel: () => null }));
beforeEach(() => { writeStoredAuthSession("host-token"); vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "prompt").mockReturnValue("入住时间不合适"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function application(id = "app-1", status: ApiRentalApplication["status"] = "SUBMITTED"): ApiRentalApplication {
  return { id, listingId: `listing-${id}`, listingTitle: `房源 ${id}`, listingOwnerId: "host", submitterId: `renter-${id}`, teamId: null, scope: "SOLO", status,
    memberSnapshots: [{ userId: `renter-${id}`, displayName: "Lin" }], contactName: "Lin", contactEmail: "lin@example.test",
    moveIn: "2027-01-01T00:00:00.000Z", moveOut: "2027-06-01T00:00:00.000Z", schoolOrOccupation: "UCLA", incomeBand: "THREE_TO_FOUR_X", guarantorStatus: "AVAILABLE", note: "希望周末看房" };
}
function setup(options: { load?: () => Response | Promise<Response>; decision?: (url: string, init: RequestInit) => Response | Promise<Response> } = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "host", email: "host@example.test", role: "USER" });
    if (url.endsWith("/profiles/me")) return Response.json({ id: "profile", displayName: "Host", role: "lister" });
    if (url.endsWith("/applications/host-inbox")) return options.load?.() ?? Response.json([application()]);
    if (init?.method === "POST") return options.decision?.(url, init) ?? Response.json(application("app-1", "ACCEPTED"));
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const row = (id = "app-1") => within(screen.getByRole("heading", { name: `房源 ${id}` }).closest("article")!);

it("shows a pending load instead of a false empty application inbox", async () => {
  let finish!: (response: Response) => void;
  setup({ load: () => new Promise<Response>((resolve) => { finish = resolve; }) });
  await act(async () => { render(<HostApplicationsExperience />); });
  expect(screen.queryByText("暂时没有租房申请。")).toBeNull();
  await screen.findByText("正在加载申请…");
  await act(async () => { finish(Response.json([])); });
  await screen.findByText("暂时没有租房申请。");
});

it("recovers a failed review list with an explicit retry", async () => {
  let failed = true;
  setup({ load: () => failed ? Response.json({}, { status: 503 }) : Response.json([application()]) });
  render(<HostApplicationsExperience />);
  await screen.findByRole("alert");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载申请" }));
  await screen.findByRole("heading", { name: "房源 app-1" });
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
  ["accept", "接受申请", "ACCEPTED", "申请已接受"],
  ["reject", "不通过", "REJECTED", "申请未通过"]
] as const)("keeps a successful %s visible when refreshing the list fails", async (decision, label, status, copy) => {
  let committed = false;
  setup({ load: () => committed ? Response.json({}, { status: 503 }) : Response.json([application()]), decision: (url) => {
    expect(url.endsWith(`/${decision}`)).toBe(true);
    committed = true;
    // Decision responses may omit the presentation-only listing title.
    return Response.json({ ...application("app-1", status), listingTitle: undefined });
  } });
  render(<HostApplicationsExperience />);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await row().findByText(copy);
  expect(row().queryByRole("button", { name: "接受申请" })).toBeNull();
  expect(row().queryByRole("button", { name: "不通过" })).toBeNull();
  await screen.findByRole("button", { name: "重新加载申请" });
});

it.each([
  ["accept", "接受申请", "ACCEPTED", "申请已接受"],
  ["reject", "不通过", "REJECTED", "申请未通过"]
] as const)("retries a lost %s response with the same command and records one decision", async (decision, label, status, copy) => {
  let saved: ApiRentalApplication | null = null;
  let firstKey: string | null = null;
  let attempts = 0;
  let writes = 0;
  setup({ load: () => Response.json([saved ?? application()]), decision: (url, init) => {
    expect(url.endsWith(`/${decision}`)).toBe(true);
    const key = new Headers(init.headers).get("Idempotency-Key");
    attempts++;
    if (!saved) {
      writes++;
      firstKey = key;
      saved = application("app-1", status);
      throw new TypeError("response lost after commit");
    }
    return key === firstKey ? Response.json(saved) : Response.json({}, { status: 409 });
  } });
  render(<HostApplicationsExperience />);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await screen.findByRole("alert");
  await waitFor(() => expect((row().getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(row().getByRole("button", { name: label }));
  await row().findByText(copy);
  expect(attempts).toBe(2);
  expect(writes).toBe(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("disables all review actions while a decision is running, then enables the next candidate", async () => {
  let finish!: (response: Response) => void;
  let accepted = false;
  const fetcher = setup({ load: () => Response.json([application("app-1", accepted ? "ACCEPTED" : "SUBMITTED"), application("app-2")]),
    decision: () => new Promise<Response>((resolve) => { finish = resolve; }) });
  render(<HostApplicationsExperience />);
  await screen.findByRole("heading", { name: "房源 app-2" });
  fireEvent.click(row().getByRole("button", { name: "接受申请" }));
  const secondAccept = row("app-2").getByRole("button", { name: "接受申请" }) as HTMLButtonElement;
  expect(secondAccept.disabled).toBe(true);
  fireEvent.click(secondAccept);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  accepted = true;
  await act(async () => { finish(Response.json(application("app-1", "ACCEPTED"))); });
  await waitFor(() => expect(secondAccept.disabled).toBe(false));
});

it("refreshes a conflicting decision so a withdrawn application cannot still be accepted", async () => {
  let withdrawn = false;
  setup({ load: () => Response.json([application("app-1", withdrawn ? "WITHDRAWN" : "SUBMITTED")]), decision: () => {
    withdrawn = true;
    return Response.json({}, { status: 409 });
  } });
  render(<HostApplicationsExperience />);
  fireEvent.click(await screen.findByRole("button", { name: "接受申请" }));
  await row().findByText("申请已撤回");
  expect(row().queryByRole("button", { name: "接受申请" })).toBeNull();
});

it("uses separate commands when the rejection reason or decision changes after a failed attempt", async () => {
  const commands: Array<{ key: string | null; body: unknown }> = [];
  let accepted = false;
  setup({ load: () => Response.json([application("app-1", accepted ? "ACCEPTED" : "SUBMITTED")]), decision: (url, init) => {
    commands.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: JSON.parse(String(init.body)) });
    if (url.endsWith("/reject")) return Response.json({}, { status: 503 });
    accepted = true;
    return Response.json(application("app-1", "ACCEPTED"));
  } });
  render(<HostApplicationsExperience />);
  fireEvent.click(await screen.findByRole("button", { name: "不通过" }));
  await row().findByRole("alert");
  vi.mocked(window.prompt).mockReturnValue("租期不匹配");
  fireEvent.click(row().getByRole("button", { name: "不通过" }));
  await row().findByRole("alert");
  fireEvent.click(row().getByRole("button", { name: "接受申请" }));
  await row().findByText("申请已接受");
  expect(commands.map((command) => command.body)).toEqual([{ reason: "入住时间不合适" }, { reason: "租期不匹配" }, {}]);
  expect(new Set(commands.map((command) => command.key)).size).toBe(3);
});
