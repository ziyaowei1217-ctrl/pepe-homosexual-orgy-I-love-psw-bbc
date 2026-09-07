// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { writeStoredAuthSession } from "../lib/auth-session";
import { PaymentPanel } from "../components/payment-panel";
import type { ApiRentalApplication } from "../lib/rental-applications";
const application = { id: "a-1", submitterId: "payer", status: "ACCEPTED" } as ApiRentalApplication;
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("rejects unsafe checkout destinations and preserves the checkout key after remount", async () => {
  writeStoredAuthSession("t");
  const keys: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/configuration")) return Response.json({ mode: "production" });
    if (url.endsWith("/checkout")) { keys.push((init.headers as Record<string,string>)["Idempotency-Key"]); return Response.json({ checkoutUrl: "javascript:alert(1)" }); }
    return Response.json({ status: "AWAITING_PAYMENT" });
  }));
  const first = render(<PaymentPanel application={application} token="t" currentUserId="payer" />);
  fireEvent.click(await screen.findByRole("button", { name: "继续付款" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("付款链接无效"));
  first.unmount();
  writeStoredAuthSession("rotated");
  render(<PaymentPanel application={application} token="rotated" currentUserId="payer" />);
  fireEvent.click(await screen.findByRole("button", { name: "继续付款" }));
  await screen.findByRole("alert");
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});
it.each(["PROCESSING", "PAID", "REFUNDED", "RELEASED", "CANCELLED"])("shows %s without another checkout and refreshes status", async (status) => {
  let current = status;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/configuration") ? { mode: "production" } : { status: current })));
  render(<PaymentPanel application={application} token="t" currentUserId="payer" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).not.toContain("读取"));
  expect(screen.queryByRole("button", { name: "继续付款" })).toBeNull();
  current = "AWAITING_PAYMENT";
  fireEvent.click(screen.getByRole("button", { name: "刷新付款状态" }));
  await screen.findByRole("button", { name: "继续付款" });
});
it("never offers checkout to the host or during pending cancellation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/configuration") ? { mode: "production" } : { status: "AWAITING_PAYMENT" })));
  const result = render(<PaymentPanel application={application} token="t" currentUserId="host" />);
  await screen.findByText("等待申请人完成付款。");
  expect(screen.queryByRole("button", { name: "继续付款" })).toBeNull();
  result.rerender(<PaymentPanel application={{ ...application, status: "CANCELLATION_PENDING" }} token="t" currentUserId="payer" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("等待付款"));
  expect(screen.queryByRole("button", { name: "继续付款" })).toBeNull();
});
it("refreshes payment status when the application enters cancellation recovery", async () => {
  let status = "AWAITING_PAYMENT";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/configuration") ? { mode: "production" } : { status })));
  const view = render(<PaymentPanel application={application} token="t" currentUserId="payer" />);
  await screen.findByRole("button", { name: "继续付款" });
  status = "PROCESSING";
  view.rerender(<PaymentPanel application={{ ...application, status: "CANCELLATION_PENDING" }} token="t" currentUserId="payer" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("处理中"));
});

it("ignores an older payment read after cancellation recovery refresh completes", async () => {
  let finishOld!: (response: Response) => void;
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/configuration")) return Response.json({ mode: "production" });
    reads++;
    if (reads === 1) return new Promise<Response>((resolve) => { finishOld = resolve; });
    return Response.json({ status: "PROCESSING" });
  }));
  const view = render(<PaymentPanel application={application} token="t" currentUserId="payer" />);
  await waitFor(() => expect(reads).toBe(1));
  view.rerender(<PaymentPanel application={{ ...application, status: "CANCELLATION_PENDING" }} token="t" currentUserId="payer" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("处理中"));
  await act(async () => finishOld(Response.json({ status: "AWAITING_PAYMENT" })));
  expect(screen.getByRole("status").textContent).toContain("处理中");
});
it("ignores the previous account's delayed payment response after account replacement", async () => {
  let finishOld!: (response: Response) => void;
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/configuration")) return Response.json({ mode: "production" });
    reads++;
    if (reads === 1) return new Promise<Response>((resolve) => { finishOld = resolve; });
    return Response.json({ status: "PAID" });
  }));
  const view = render(<PaymentPanel application={application} token="old" currentUserId="payer" />);
  await waitFor(() => expect(reads).toBe(1));
  view.rerender(<PaymentPanel application={application} token="new" currentUserId="host" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("已付款"));
  await act(async () => finishOld(Response.json({ status: "AWAITING_PAYMENT" })));
  expect(screen.getByRole("status").textContent).toBe("已付款");
  expect(screen.queryByRole("button", { name: "继续付款" })).toBeNull();
});
