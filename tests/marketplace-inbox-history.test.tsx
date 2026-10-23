// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { ApiDealMessage, ApiDealThread, ApiRoommateConversation, ApiRoommateMessage } from "../lib/api";
import type { createRoommateRealtimeClient } from "../lib/roommate-realtime";

type Source = "deal" | "roommate";
type RealtimeOptions = Parameters<typeof createRoommateRealtimeClient>[0];
const realtime = vi.hoisted(() => ({ options: null as RealtimeOptions | null }));
vi.mock("../lib/roommate-realtime", () => ({ createRoommateRealtimeClient: (options: RealtimeOptions) => {
  realtime.options = options;
  return { connect() {}, disconnect() {} };
} }));

beforeEach(() => { writeStoredAuthSession("history-token"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); realtime.options = null; });

const olderCursor = "older/page ?+=";
const timestamp = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString();
const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);
const body = (id: string, n: number) => `${id} message ${n}`;
function dealMessage(n: number, id = "deal-A"): ApiDealMessage {
  return { id: `${id}-${n}`, threadId: id, senderName: "Host", body: body(id, n), align: "left", status: "received", createdAt: timestamp(n) };
}
function roommateMessage(n: number, id = "roommate-A"): ApiRoommateMessage {
  return { id: `${id}-${n}`, conversationId: id, clientMessageId: `client-${id}-${n}`, senderRole: "peer", body: body(id, n), createdAt: timestamp(n) };
}
function deal(id = "deal-A", latest = 60): ApiDealThread {
  return { id, ownerId: "renter", listingOwnerId: "host", viewerRole: "renter", listingId: `listing-${id}`, listingTitle: `Room ${id}`, area: "Westwood", contactName: id, participantNames: ["Renter"],
    messages: [dealMessage(latest, id)], messagePageInfo: { nextCursor: "summary-cursor", hasMore: true }, viewingRequests: [], createdAt: timestamp(1), updatedAt: timestamp(latest) };
}
function roommate(id = "roommate-A", latest = 60): ApiRoommateConversation {
  return { id, matchId: `match-${id}`, peer: { id: `peer-${id}`, name: id, age: 22, role: "Student", image: null, match: 90, budget: "$1800", commute: "UCLA", tags: [] }, latestMessage: roommateMessage(latest, id), unreadCount: 0,
    lastReadMessageId: null, lastReadAt: null, peerLastReadMessageId: null, peerLastReadAt: null, writable: true, lastMessageAt: timestamp(latest), updatedAt: timestamp(latest) };
}
function page(source: Source, id: string, first: number, last: number, nextCursor: string | null = null) {
  const indexes = range(first, last);
  return Response.json({ messages: source === "deal" ? indexes.map(n => dealMessage(n, id)) : indexes.reverse().map(n => roommateMessage(n, id)), nextCursor });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function backend(options: {
  deals?: () => ApiDealThread[];
  roommates?: () => ApiRoommateConversation[];
  history: (source: Source, id: string, cursor: string | null) => Response | Promise<Response>;
  send?: (source: Source, id: string, input: { body: string; clientMessageId: string }) => Response | Promise<Response>;
}) {
  const requests: Array<{ source: Source; id: string; cursor: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/deal-threads")) return Response.json(options.deals?.() ?? []);
    if (url.pathname.endsWith("/roommate-conversations")) return Response.json(options.roommates?.() ?? []);
    if (url.pathname.endsWith("/read")) return Response.json({});
    const match = url.pathname.match(/\/(deal-threads|roommate-conversations)\/([^/]+)\/messages$/);
    if (match) {
      const source = match[1] === "deal-threads" ? "deal" : "roommate";
      const id = decodeURIComponent(match[2]);
      if (init?.method === "POST") return options.send!(source, id, JSON.parse(String(init.body)));
      const cursor = url.searchParams.get("cursor");
      requests.push({ source, id, cursor });
      return options.history(source, id, cursor);
    }
    return Response.json({ message: `Unexpected request ${url.pathname}` }, { status: 404 });
  }));
  return requests;
}
const content = () => within(screen.getByRole("region", { name: "对话内容" }));
function viewport() {
  return screen.getByRole("region", { name: "对话内容" }).querySelector<HTMLDivElement>("div.overflow-y-auto")!;
}
function measureViewport() {
  const view = viewport();
  Object.defineProperty(view, "scrollHeight", { configurable: true, get: () => within(view).queryAllByText(/ message \d+$/).length * 40 + 100 });
  Object.defineProperty(view, "clientHeight", { configurable: true, value: 200 });
  return view;
}
function select(id: string) {
  const link = within(screen.getByRole("region", { name: "会话列表" })).getByRole("link", { name: new RegExp(id) });
  // The component's local selection handler runs; jsdom does not implement page navigation.
  link.addEventListener("click", event => event.preventDefault(), { once: true });
  fireEvent.click(link);
}
function expectMessages(id: string, first: number, last: number) {
  const section = content();
  const rendered = within(viewport()).queryAllByText(/ message \d+$/).map(item => item.textContent);
  let previousIndex = -1;
  for (const n of range(first, last)) {
    expect(section.getAllByText(body(id, n))).toHaveLength(1);
    const index = rendered.indexOf(body(id, n));
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}
function send(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "消息内容" }), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
}

describe.each(["deal", "roommate"] as const)("%s bounded Inbox history", source => {
  const id = `${source}-A`;
  it("waits for the initial history page before offering its older-page cursor", async () => {
    const initial = deferred<Response>();
    const requests = backend({ deals: () => source === "deal" ? [deal()] : [], roommates: () => source === "roommate" ? [roommate()] : [], history: () => initial.promise });
    render(<InboxExperience initialConversationId={id} />);
    await content().findByText(body(id, 60));
    // Rendering a summary precedes the separate initial-history effect. Wait
    // for that observable request while its response remains deliberately held.
    await waitFor(() => expect(requests).toEqual([{ source, id, cursor: null }]));
    expect(content().queryByRole("button", { name: "加载较早消息" })).toBeNull();
    await act(async () => initial.resolve(page(source, id, 11, 60, olderCursor)));
    expect(content().getByRole("button", { name: "加载较早消息" })).toBeTruthy();
    expectMessages(id, 11, 60);
  });

  it("opens one bounded page, requests the exact older cursor, and preserves the reader's position", async () => {
    const requests = backend({ deals: () => source === "deal" ? [deal()] : [], roommates: () => source === "roommate" ? [roommate()] : [],
      history: (_source, thread, cursor) => cursor ? page(source, thread, 1, 10) : page(source, thread, 11, 60, olderCursor) });
    render(<InboxExperience initialConversationId={id} />);
    await content().findByText(body(id, 11));
    expect(content().queryByText(body(id, 1))).toBeNull();
    expectMessages(id, 11, 60);
    expect(requests).toEqual([{ source, id, cursor: null }]);
    const view = measureViewport();
    view.scrollTop = 80;
    fireEvent.scroll(view);
    const oldHeight = view.scrollHeight;
    fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
    await content().findByText(body(id, 1));
    expectMessages(id, 1, 60);
    expect(requests.at(-1)).toEqual({ source, id, cursor: olderCursor });
    // Prepending renders before the effect restores the viewport anchor.
    await waitFor(() => expect(view.scrollTop).toBe(80 + view.scrollHeight - oldHeight));
    expect(content().queryByRole("button", { name: "加载较早消息" })).toBeNull();
  });

  it("retains previously loaded pages when summaries refresh and a bounded send response arrives", async () => {
    let latest = 60;
    backend({ deals: () => source === "deal" ? [deal(id, latest)] : [], roommates: () => source === "roommate" ? [roommate(id, latest)] : [],
      history: (_source, thread, cursor) => cursor === olderCursor ? page(source, thread, 1, 10) : page(source, thread, latest - 49, latest, olderCursor),
      send: (_source, thread, input) => source === "deal" ? Response.json({ ...deal(thread, 62), messages: [...range(13, 61).map(n => dealMessage(n, thread)), { ...dealMessage(62, thread), body: input.body, align: "right" }] })
        : Response.json({ ...roommateMessage(62, thread), body: input.body, senderRole: "self", clientMessageId: input.clientMessageId }) });
    render(<InboxExperience initialConversationId={id} />);
    await content().findByText(body(id, 11));
    fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
    await content().findByText(body(id, 1));
    latest = 61;
    await act(async () => {
      if (source === "deal") window.dispatchEvent(new Event("focus"));
      else realtime.options!.onReconnect();
    });
    await content().findByText(body(id, 61));
    expectMessages(id, 1, 61);
    send("New outgoing message");
    await content().findByText("New outgoing message");
    expectMessages(id, 1, 61);
    expect(content().getAllByText("New outgoing message")).toHaveLength(1);
    expect(content().queryByRole("button", { name: "加载较早消息" })).toBeNull();
  });
});

it("fills every missed deal page back to the last completed history anchor without replacing the older cursor", async () => {
  let reconnected = false;
  const requests = backend({ deals: () => [deal("deal-A", reconnected ? 180 : 60)], history: (source, id, cursor) => {
    if (!reconnected) return page(source, id, 11, 60, olderCursor);
    if (cursor === "gap-2") return page(source, id, 31, 80, "gap-3");
    if (cursor === "gap-1") return page(source, id, 81, 130, "gap-2");
    return page(source, id, 131, 180, "gap-1");
  } });
  render(<InboxExperience initialConversationId="deal-A" />);
  await content().findByText(body("deal-A", 11));
  reconnected = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await content().findByText(body("deal-A", 61));
  expectMessages("deal-A", 11, 180);
  expect(requests.map(request => request.cursor)).toEqual([null, null, "gap-1", "gap-2"]);
  expect(content().getByRole("button", { name: "加载较早消息" })).toBeTruthy();
});

it("preserves history and retries the same cursor after an older-page failure", async () => {
  let attempts = 0;
  const requests = backend({ deals: () => [deal()], history: (source, id, cursor) => {
    if (!cursor) return page(source, id, 11, 60, olderCursor);
    return ++attempts === 1 ? Response.json({ message: "History temporarily unavailable" }, { status: 503 }) : page(source, id, 1, 10);
  } });
  render(<InboxExperience initialConversationId="deal-A" />);
  await content().findByText(body("deal-A", 11));
  fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
  await screen.findByRole("alert");
  expectMessages("deal-A", 11, 60);
  fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
  await content().findByText(body("deal-A", 1));
  expect(requests.map(request => request.cursor)).toEqual([null, olderCursor, olderCursor]);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps older requests independent across navigation and never applies another conversation's scroll anchor", async () => {
  const earlierA = deferred<Response>();
  const earlierB = deferred<Response>();
  const requests = backend({ deals: () => [deal(), deal("deal-B")], history: (source, id, cursor) => cursor ? (id === "deal-A" ? earlierA.promise : earlierB.promise) : page(source, id, 11, 60, olderCursor) });
  render(<InboxExperience initialConversationId="deal-A" />);
  await content().findByText(body("deal-A", 11));
  const view = measureViewport();
  view.scrollTop = 80;
  fireEvent.scroll(view);
  fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
  select("deal-B");
  await content().findByText(body("deal-B", 11));
  view.scrollTop = 140;
  fireEvent.scroll(view);
  const bHeight = view.scrollHeight;
  const bEarlier = content().getByRole("button", { name: "加载较早消息" });
  expect((bEarlier as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(bEarlier);
  expect(requests.filter(request => request.cursor === olderCursor).map(request => request.id)).toEqual(["deal-A", "deal-B"]);
  await act(async () => earlierA.resolve(page("deal", "deal-A", 1, 10)));
  expect(view.scrollTop).toBe(140);
  expect((content().getByRole("button", { name: "正在加载…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => earlierB.resolve(page("deal", "deal-B", 1, 10)));
  await waitFor(() => expect(view.scrollTop).toBe(140 + view.scrollHeight - bHeight));
  select("deal-A");
  await content().findByText(body("deal-A", 1));
  await waitFor(() => expect(view.scrollTop).toBe(view.scrollHeight));
  expect(content().queryByText(body("deal-B", 1))).toBeNull();
});

it("keeps the reading position when a live message arrives, and follows messages again at the bottom", async () => {
  backend({ roommates: () => [roommate()], history: (source, id) => page(source, id, 11, 60, olderCursor) });
  render(<InboxExperience initialConversationId="roommate-A" />);
  await content().findByText(body("roommate-A", 11));
  const view = measureViewport();
  view.scrollTop = 120;
  fireEvent.scroll(view);
  act(() => realtime.options!.onEvent({ name: "roommate.message.created", payload: { conversationId: "roommate-A", message: roommateMessage(61) } }));
  await content().findByText(body("roommate-A", 61));
  expect(view.scrollTop).toBe(120);
  view.scrollTop = view.scrollHeight - view.clientHeight;
  fireEvent.scroll(view);
  act(() => realtime.options!.onEvent({ name: "roommate.message.created", payload: { conversationId: "roommate-A", message: roommateMessage(62) } }));
  await content().findByText(body("roommate-A", 62));
  await waitFor(() => expect(view.scrollTop).toBe(view.scrollHeight));
});

it("does not clear an identical new draft in a different conversation when a pending send completes", async () => {
  const outgoing = deferred<Response>();
  backend({ deals: () => [deal(), deal("deal-B")], history: (source, id) => page(source, id, 11, 60), send: () => outgoing.promise });
  render(<InboxExperience initialConversationId="deal-A" />);
  await content().findByText(body("deal-A", 11));
  send("Can we view tomorrow?");
  select("deal-B");
  await content().findByText(body("deal-B", 11));
  fireEvent.change(screen.getByRole("textbox", { name: "消息内容" }), { target: { value: "Can we view tomorrow?" } });
  await act(async () => outgoing.resolve(Response.json({ ...deal(), messages: [{ ...dealMessage(61), body: "Can we view tomorrow?", align: "right" }] })));
  expect((screen.getByRole("textbox", { name: "消息内容" }) as HTMLTextAreaElement).value).toBe("Can we view tomorrow?");
  expect(within(viewport()).queryByText("Can we view tomorrow?")).toBeNull();
});

it("never merges an earlier page from a previous authenticated account", async () => {
  const oldAccountPage = deferred<Response>();
  const requests = backend({ deals: () => [deal()], history: (source, id, cursor) => cursor ? oldAccountPage.promise : page(source, id, 11, 60, olderCursor) });
  render(<InboxExperience initialConversationId="deal-A" />);
  await content().findByText(body("deal-A", 11));
  fireEvent.click(content().getByRole("button", { name: "加载较早消息" }));
  await act(async () => writeStoredAuthSession("second-history-account"));
  await content().findByText(body("deal-A", 11));
  await waitFor(() => expect(requests.filter(request => request.cursor === null)).toHaveLength(2));
  await act(async () => oldAccountPage.resolve(Response.json({ messages: [{ ...dealMessage(1), body: "Previous account private history" }], nextCursor: null })));
  expect(screen.queryByText("Previous account private history")).toBeNull();
  expect(content().queryByText(body("deal-A", 1))).toBeNull();
  expect(content().getByRole("button", { name: "加载较早消息" })).toBeTruthy();
});
