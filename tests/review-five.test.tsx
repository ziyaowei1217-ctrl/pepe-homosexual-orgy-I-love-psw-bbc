// @vitest-environment jsdom
// The fifth design review, the signed-in flows in motion: the site's own confirmation dialog, one empty inbox,
// field errors where they belong, retry on load errors and a first-listing guide.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApplicationDetailExperience, ApplicationsExperience } from "../components/marketplace/application-experiences";
import { HostApplicationsExperience, HostDashboardExperience } from "../components/marketplace/host-experiences";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { PublishingFlow } from "../components/sublet-app";
import { writeStoredAuthSession } from "../lib/auth-session";

vi.mock("../lib/roommate-realtime", () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
vi.mock("../components/payment-panel", () => ({ PaymentPanel: () => null }));
beforeEach(() => { writeStoredAuthSession("user-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function api(routes: Record<string, unknown | (() => Response)>) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.endsWith(path) && (!path.startsWith("POST ") || init?.method === "POST"));
    if (!match) return Response.json({}, { status: 404 });
    const value = routes[match];
    return typeof value === "function" ? (value as () => Response)() : Response.json(value);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const submitted = { id: "a-1", listingId: "l-1", listingTitle: "Westwood 主卧", listingOwnerId: "host", submitterId: "renter", teamId: null, scope: "SOLO", status: "SUBMITTED",
  memberSnapshots: [{ userId: "renter", displayName: "Chen Yu" }], contactName: "Chen Yu", contactEmail: "chen@example.test", moveIn: "2026-12-20T00:00:00.000Z", moveOut: "2027-03-15T00:00:00.000Z",
  schoolOrOccupation: "USC", incomeBand: "THREE_TO_FOUR_X", guarantorStatus: "AVAILABLE", note: "" };

it("never uses the browser's own dialogs for decisions", async () => {
  const native = vi.spyOn(window, "confirm"); const prompt = vi.spyOn(window, "prompt");
  api({ "/auth/me": { id: "host", email: "h@example.test", role: "USER" }, "/profiles/me": { id: "host", role: "lister" }, "/applications/host-inbox": [submitted] });
  render(<HostApplicationsExperience />);
  fireEvent.click(await screen.findByRole("button", { name: "不通过" }));
  const dialog = await screen.findByRole("alertdialog", { name: "不通过Chen Yu的申请？" });
  const confirm = within(dialog).getByRole("button", { name: "不通过" }) as HTMLButtonElement;
  // The reason is asked for in the dialog, and the decision waits for it.
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "不通过的原因" }), { target: { value: "日期对不上" } });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "先不" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(native).not.toHaveBeenCalled(); expect(prompt).not.toHaveBeenCalled();
});

it("asks in the site's dialog before withdrawing, and a dismissal keeps the application", async () => {
  const fetcher = api({ "/auth/me": { id: "renter", email: "r@example.test", role: "USER" }, "/applications/mine": [submitted] });
  await act(async () => { render(<ApplicationDetailExperience applicationId="a-1" />); });
  fireEvent.click(await screen.findByRole("button", { name: "撤回申请" }));
  const dialog = await screen.findByRole("alertdialog", { name: "撤回这份申请？" });
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "先不" })); });
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/withdraw"))).toBe(false);
});

it("shows one empty inbox instead of an empty list beside 'choose a conversation'", async () => {
  api({ "/deal-threads": [], "/roommate-conversations": [] });
  await act(async () => { render(<InboxExperience initialConversationId={null} />); });
  expect(await screen.findByText("还没有消息")).toBeTruthy();
  expect(screen.queryByText("选择一条对话")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "搜索消息" })).toBeNull();
});

it("puts publishing errors under their fields", async () => {
  await act(async () => { render(<PublishingFlow initialDraft={null} isPublishing={false} token="owner-token" onSave={vi.fn()} />); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "下一步" })); });
  const title = screen.getByRole("textbox", { name: /房源标题/ });
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(title.getAttribute("aria-describedby") ?? "")?.textContent).toBe("请填写房源标题。");
  expect(screen.getByRole("alert").textContent).toContain("已标在对应的输入框下面");
});

it("offers a retry when applications do not load", async () => {
  let failed = true;
  api({ "/applications/mine": () => failed ? Response.json({}, { status: 503 }) : Response.json([submitted]) });
  await act(async () => { render(<ApplicationsExperience />); });
  const retry = await screen.findByRole("button", { name: "重试" });
  failed = false;
  await act(async () => { fireEvent.click(retry); });
  expect(await screen.findByText("Westwood 主卧")).toBeTruthy();
});

it("guides a 转租人 with no listings to the first one instead of showing zeros", async () => {
  api({ "/auth/me": { id: "host", email: "h@example.test", role: "USER" }, "/profiles/me": { id: "host", role: "both" }, "/listings/mine": [], "/applications/host-inbox": [], "/deal-threads": [] });
  await act(async () => { render(<HostDashboardExperience />); });
  expect(await screen.findByText("发布你的第一间房")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "关键指标" })).toBeNull();
});
