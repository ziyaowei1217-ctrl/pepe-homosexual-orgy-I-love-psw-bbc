// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { RoommateLikesExperience } from "../components/marketplace/roommate-experiences";
import { SavedMap } from "../components/marketplace/saved-page-experience";
import { writeStoredAuthSession } from "../lib/auth-session";
import { createPreviewListings } from "../lib/preview-data";
import type { ApiDealThread } from "../lib/api";

vi.mock("../lib/roommate-realtime", () => ({ createRoommateRealtimeClient: () => ({ connect() {}, disconnect() {} }) }));

afterEach(() => { cleanup(); localStorage.clear(); document.body.style.overflow = ""; vi.unstubAllGlobals(); });

it("makes both colocated saved homes selectable and returns focus after closing their picker", () => {
  const listings = createPreviewListings().slice(0, 2).map((listing, index) => ({ ...listing, id: `same-location-${index}`, title: `Saved home ${index}`, latitude: 42.3, longitude: -71.1 }));
  render(<SavedMap listings={listings} />);
  const opener = screen.getByRole("button", { name: "查看此区域 2 套收藏房源" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "此区域的 2 套收藏房源" });
  expect(dialog.contains(document.activeElement)).toBe(true);
  for (const listing of listings) {
    expect(within(dialog).getByRole("link", { name: new RegExp(listing.title) }).getAttribute("href")).toBe(`/listing/${listing.id}`);
  }
  const links = within(dialog).getAllByRole("link");
  links.at(-1)!.focus();
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "关闭区域收藏房源" }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("shows likes loading and retries a failed read without changing the selected tab", async () => {
  writeStoredAuthSession("likes-session");
  let complete!: (response: Response) => void;
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }))
    .mockResolvedValueOnce(Response.json({ inbound: [], outbound: [{ action: "LIKE", profile: { id: "peer", name: "Pat", age: 24, role: "Student", image: "", match: 90, budget: "$1500", commute: "Boston", tags: [] } }], matchedProfileIds: [] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<RoommateLikesExperience />);
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "正在加载喜欢与匹配…");
  fireEvent.click(screen.getByRole("button", { name: "我喜欢的" }));
  await act(async () => complete(Response.json({}, { status: 503 })));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("服务暂时不可用"));
  fireEvent.click(screen.getByRole("button", { name: "重新加载喜欢与匹配" }));
  expect(await screen.findByRole("heading", { name: "Pat, 24" })).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("discards a late likes response after the account changes", async () => {
  writeStoredAuthSession("old-likes-session");
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }))
    .mockResolvedValueOnce(Response.json({ inbound: [], outbound: [], matchedProfileIds: [] })));
  render(<RoommateLikesExperience />);
  await screen.findByRole("status");
  act(() => writeStoredAuthSession("new-likes-session"));
  await screen.findByText("这里还没有记录。");
  await act(async () => complete(Response.json({ inbound: [{ action: "LIKE", profile: { id: "private-peer", name: "Old account private peer", age: 24, role: "Student", image: "", match: 90, budget: "$1500", commute: "Boston", tags: [] } }], outbound: [], matchedProfileIds: [] })));
  expect(screen.queryByText(/Old account private peer/)).toBeNull();
});

function thread(id: string): ApiDealThread {
  return { id, ownerId: "renter", listingOwnerId: "host", viewerRole: "renter", listingId: id, listingTitle: `${id} home`, area: "Boston", contactName: `${id} host`, participantNames: [], messages: [], viewingRequests: [], createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z" };
}
function inboxFixture(desktop: boolean) {
  writeStoredAuthSession("inbox-session");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: desktop })));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/deal-threads") ? Response.json([thread("first"), thread("second")]) : Response.json([])));
}

it("returns from a mobile conversation route to a stable list that exposes both conversations", async () => {
  inboxFixture(false);
  const view = render(<InboxExperience initialConversationId="second" />);
  await screen.findByRole("heading", { name: "second host" });
  view.rerender(<InboxExperience initialConversationId={null} />);
  await waitFor(() => expect(screen.getByRole("region", { name: "会话列表" }).className).not.toContain("hidden"));
  expect(screen.queryByRole("textbox", { name: "消息内容" })).toBeNull();
  const list = screen.getByRole("region", { name: "会话列表" });
  expect(within(list).getByRole("link", { name: /first host/ }).getAttribute("href")).toBe("/inbox/first");
  expect(within(list).getByRole("link", { name: /second host/ }).getAttribute("href")).toBe("/inbox/second");
  const nextThread = within(list).getByRole("link", { name: /first host/ });
  nextThread.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(nextThread);
  expect(list.className).not.toContain("hidden");
  expect(screen.queryByRole("textbox", { name: "消息内容" })).toBeNull();
});

it("still selects the first conversation on a desktop base inbox route", async () => {
  inboxFixture(true);
  render(<InboxExperience initialConversationId={null} />);
  expect(await screen.findByRole("heading", { name: "first host" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "消息内容" })).toBeTruthy();
});
