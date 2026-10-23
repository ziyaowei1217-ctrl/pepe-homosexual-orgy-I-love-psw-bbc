// @vitest-environment jsdom
// The sixth round: dates read 「11月1日」 in every date field, the payment panel says what is paid and where it goes,
// the last browser confirm()/prompt() calls are gone, and nearby transit and the original rent are optional.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DemoPaymentPanel } from "../components/demo-payment-panel";
import { HostApplicationInbox } from "../components/host-application-inbox";
import { PaymentPanel } from "../components/payment-panel";
import { PublishingFlow } from "../components/sublet-app";
import { DateInput } from "../components/ui/date-input";
import { writeStoredAuthSession } from "../lib/auth-session";

vi.mock("../lib/roommate-realtime", () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
beforeEach(() => { writeStoredAuthSession("token-1"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const accepted = { id: "application-1", listingId: "listing-1", listingTitle: "Westwood 阳光主卧", listingOwnerId: "owner-1", submitterId: "renter-1", teamId: null,
  scope: "SOLO" as const, status: "ACCEPTED" as const, memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }], contactName: "Lin",
  moveIn: "2026-11-01T00:00:00.000Z", moveOut: "2027-01-15T00:00:00.000Z", schoolOrOccupation: "UCLA", incomeBand: "TWO_TO_THREE_X" as const, guarantorStatus: "AVAILABLE" as const, note: "" };

it("shows a chosen date in the site's format and a prompt before one is chosen", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  const onChange = vi.fn();
  const { rerender } = render(<label>入住日期<DateInput aria-label="入住日期" value="" onChange={onChange} /></label>);
  const input = screen.getByLabelText("入住日期") as HTMLInputElement;
  expect(input.type).toBe("date");
  expect(document.body.textContent).toContain("选择日期");
  fireEvent.change(input, { target: { value: "2026-11-01" } });
  expect(onChange).toHaveBeenCalled();
  rerender(<label>入住日期<DateInput aria-label="入住日期" value="2026-11-01" onChange={onChange} /></label>);
  expect(document.body.textContent).toContain("11月1日");
  expect(document.body.textContent).not.toContain("2026-11-01");
  // A date in another year carries the year, as everywhere else on the site.
  rerender(<label>入住日期<DateInput aria-label="入住日期" value="2027-01-15" onChange={onChange} /></label>);
  expect(document.body.textContent).toContain("2027年1月15日");
});

it("opens the browser's picker when the field is clicked, and still works where there is none", () => {
  render(<DateInput aria-label="退租日期" name="moveOut" />);
  const input = screen.getByLabelText("退租日期") as HTMLInputElement;
  const showPicker = vi.fn();
  Object.defineProperty(input, "showPicker", { value: showPicker, configurable: true });
  fireEvent.click(input);
  expect(showPicker).toHaveBeenCalledOnce();
  Object.defineProperty(input, "showPicker", { value: () => { throw new Error("not allowed"); }, configurable: true });
  expect(() => fireEvent.click(input)).not.toThrow();
  // Uncontrolled (the home search form reads it from FormData) and still shows what was picked.
  fireEvent.change(input, { target: { value: "2026-12-20" } });
  expect(document.body.textContent).toMatch(/12月20日/);
});

it("says how much a demo payment is and that the platform holds it until both sides confirm", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ disclaimer: "演示模式，不会真实扣款", payment: { id: "p-1", applicationId: "application-1", amountCents: 185000, currency: "USD", status: "AWAITING_ATTEMPT" },
    application: accepted, attempts: [], heldFund: null, ledgerEntries: [] })));
  await act(async () => { render(<DemoPaymentPanel application={accepted} token="token-1" currentUserId="renter-1" />); });
  const panel = await screen.findByRole("region", { name: "付款状态" });
  expect(within(panel).getByRole("heading", { level: 2, name: "付款" })).toBeTruthy();
  expect(panel.textContent).toContain("$1,850");
  expect(panel.textContent).toContain("你和转租人都确认入住后才转给转租人");
  expect(panel.textContent).toContain("演示模式，不会真实扣款");
  expect(panel.textContent).not.toContain("房东");
  // One primary action.
  expect(within(panel).getAllByRole("button").filter((button) => button.className.includes("primary-action"))).toHaveLength(1);
});

it("does not invent an amount for a real payment, which only the payment page knows", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/payments/configuration")) return Response.json({ mode: "production" });
    return Response.json({ status: "AWAITING_PAYMENT" });
  }));
  await act(async () => { render(<PaymentPanel application={accepted} token="token-1" currentUserId="renter-1" />); });
  expect((await screen.findByRole("status")).textContent).toBe("等待付款");
  expect(screen.getByRole("region", { name: "付款状态" }).textContent).toContain("金额以付款页为准");
  expect(screen.getByRole("button", { name: "继续付款" })).toBeTruthy();
});

it("asks in the site's dialog in the older host inbox too, with the reason in the same dialog", async () => {
  const native = vi.spyOn(window, "confirm"); const prompt = vi.spyOn(window, "prompt");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...accepted, status: "SUBMITTED" }])));
  await act(async () => { render(<HostApplicationInbox token="token-1" currentUserId="owner-1" />); });
  fireEvent.click(await screen.findByRole("button", { name: "不通过" }));
  const dialog = await screen.findByRole("alertdialog", { name: "不通过Lin的申请？" });
  expect((within(dialog).getByRole("button", { name: "不通过" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: "先不" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(native).not.toHaveBeenCalled(); expect(prompt).not.toHaveBeenCalled();
});

it("marks nearby transit optional and uses the site date fields when publishing", async () => {
  await act(async () => { render(<PublishingFlow initialDraft={null} isPublishing={false} token="owner-token" onSave={vi.fn()} />); });
  expect(screen.getByRole("textbox", { name: /附近交通（选填）/ })).toBeTruthy();
  // The availability fields are site date fields.
  expect(screen.getByLabelText("可入住日期").getAttribute("type")).toBe("date");
  expect(document.body.textContent).toContain("选择日期");
});
