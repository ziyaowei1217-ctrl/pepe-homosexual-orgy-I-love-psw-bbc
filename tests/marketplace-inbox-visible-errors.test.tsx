// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { writeStoredAuthSession } from "../lib/auth-session";

vi.mock("../lib/roommate-realtime", () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));
beforeEach(() => { writeStoredAuthSession("inbox-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const thread = { id: "thread", listingId: "listing", ownerId: "renter", contactName: "测试房东", listingTitle: "测试房源", viewerRole: "renter", messages: [], viewingRequests: [] };

it("places send failures in the active conversation so mobile users can see them and keep their draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/deal-threads")) return Response.json([thread]);
    if (url.endsWith("/roommate-conversations")) return Response.json([]);
    return Response.json({ message: "消息发送失败，请重试。" }, { status: 503 });
  }));
  render(<InboxExperience initialConversationId="thread" />);
  const draft = await screen.findByRole("textbox", { name: "消息内容" });
  fireEvent.change(draft, { target: { value: "保留这条草稿" } });
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await within(screen.getByRole("region", { name: "对话内容" })).findByRole("alert");
  expect((draft as HTMLTextAreaElement).value).toBe("保留这条草稿");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("offers retry when a deep-linked conversation cannot initially load", async () => {
  let failed = true;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/deal-threads")) return failed ? Response.json({}, { status: 503 }) : Response.json([thread]);
    if (url.endsWith("/roommate-conversations")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
  render(<InboxExperience initialConversationId="thread" />);
  await screen.findByRole("alert");
  expect(screen.queryByText("还没有消息")).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载消息" }));
  await screen.findByRole("heading", { name: "测试房东" });
  expect(screen.queryByRole("alert")).toBeNull();
});
