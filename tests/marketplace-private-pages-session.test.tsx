// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountExperience } from "../components/marketplace/account-experience";
import { AdminDashboardExperience } from "../components/marketplace/admin-experiences";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { RoommateLikesExperience, RoommatesExperience } from "../components/marketplace/roommate-experiences";
import { RoommateTeamExperience } from "../components/marketplace/roommate-team-experience";
import { TripsExperience } from "../components/marketplace/trips-experience";
import { assertCurrentAuthSession, clearStoredAuthSession, readStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";

const privateName = "Only account A";
const profile = { id: "profile-a", email: "a@example.com", displayName: privateName, avatarUrl: null, school: null, city: null, role: "renter", eduEmailVerified: false, phoneVerified: false, wechat: null, instagram: null, bio: null };
const candidate = { id: "roommate-a", name: privateName, age: 22, role: "UCLA", image: "https://example.com/ivy.jpg", match: 92, budget: "$1,560/月", commute: "Westwood", tags: ["早睡"], reasons: ["预算匹配"] };
const thread = { id: "thread-a", ownerId: "a", listingOwnerId: "host-a", viewerRole: "renter", dealRoomId: null, listingId: "listing-a", listingTitle: privateName, area: "Westwood", contactName: "Host", participantNames: ["A"], messages: [], viewingRequests: [], createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-03T10:00:00.000Z" };

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fixture(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input);
  const token = new Headers(init?.headers).get("Authorization");
  const old = token === "Bearer account-a";
  if (url.endsWith("/auth/me")) return json({ id: old ? "a" : "b", email: old ? "a@example.com" : "b@example.com", role: old ? "ADMIN" : "USER" });
  if (url.endsWith("/profiles/me")) return json(old ? profile : { ...profile, id: "profile-b", displayName: "Account B", email: "b@example.com" });
  if (url.endsWith("/applications/mine")) return json(old ? [{ id: "stay-a", listingId: "listing-a", listingTitle: privateName, status: "ACCEPTED", moveIn: "2026-10-01", moveOut: "2027-01-01" }] : []);
  if (url.endsWith("/deal-threads")) return json(old ? [thread] : []);
  if (url.endsWith("/roommate-conversations")) return json([]);
  if (url.includes("/roommates/deck")) return json({ items: old ? [candidate] : [], pageInfo: {}, discovery: {} });
  if (url.endsWith("/roommates/activity")) return json({ inbound: old ? [{ profile: candidate }] : [], outbound: [], matchedProfileIds: [] });
  if (url.endsWith("/roommate-teams/current")) return json(old ? { id: "team-a", status: "ACTIVE", dealRoomId: null, confirmedAt: "2026-09-01", dissolvedAt: null, dissolvedById: null, dissolveReason: null, members: [{ id: "member-a", userId: "a", active: true, snapshot: {} }] } : null);
  if (url.endsWith("/roommate-teams/invites")) return json([]);
  if (url.endsWith("/trust/queues")) return json([{ id: "queue-a", title: "Queue", value: 347 }]);
  if (url.includes("/admin/")) return json([]);
  return new Response(null, { status: 404 });
}

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe("mounted private pages follow the active account", () => {
  it.each([
    { name: "account", page: <AccountExperience mode="overview" />, content: privateName },
    { name: "trips", page: <TripsExperience />, content: privateName },
    { name: "inbox", page: <InboxExperience initialConversationId={null} />, content: privateName },
    { name: "roommate recommendations", page: <RoommatesExperience />, content: privateName },
    { name: "roommate likes", page: <RoommateLikesExperience />, content: privateName },
    { name: "roommate team", page: <RoommateTeamExperience />, content: "已确认小组" },
    { name: "admin overview", page: <AdminDashboardExperience />, content: "347" }
  ])("clears $name data after account replacement and logout", async ({ page, content }) => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => fixture(input, init)));
    writeStoredAuthSession("account-a");
    const view = render(page);
    await waitFor(() => expect(view.container.textContent).toContain(content));
    act(() => writeStoredAuthSession("account-b"));
    expect(view.container.textContent).not.toContain(content);
    await act(async () => undefined);
    expect(view.container.textContent).not.toContain(content);
    act(() => clearStoredAuthSession());
    expect(view.container.textContent).not.toContain(content);
  });

  it("does not send a profile draft after its session changed before the browser event arrives", async () => {
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "PATCH") writes += 1;
      return fixture(input, init);
    }));
    writeStoredAuthSession("account-a");
    render(<AccountExperience mode="profile" />);
    await screen.findByDisplayValue(privateName);
    fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "A private draft" } });
    localStorage.setItem("sublet_auth_session", JSON.stringify({ version: 1, accessToken: "account-b" }));
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await act(async () => undefined);
    expect(writes).toBe(0);
  });

  it("does not let an old account load failure clear a newer login", async () => {
    let rejectOld!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (new Headers(init?.headers).get("Authorization") === "Bearer account-a" && String(input).endsWith("/profiles/me")) await new Promise((_resolve, reject) => { rejectOld = reject; });
      return fixture(input, init);
    }));
    writeStoredAuthSession("account-a");
    const view = render(<AccountExperience mode="overview" />);
    await waitFor(() => expect(rejectOld).toBeTypeOf("function"));
    act(() => writeStoredAuthSession("account-b"));
    await act(async () => rejectOld(new Error("Expired old account")));
    expect(readStoredAuthSession()?.accessToken).toBe("account-b");
    await waitFor(() => expect(view.container.textContent).toContain("Account B"));
  });

  it("does not auto-create a listing conversation from a previous account's delayed inbox load", async () => {
    let resolveOld!: (response: Response) => void;
    let oldWrites = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const old = new Headers(init?.headers).get("Authorization") === "Bearer account-a";
      if (old && init?.method === "POST") oldWrites += 1;
      if (old && String(input).endsWith("/deal-threads") && init?.method === "GET") return new Promise<Response>((resolve) => { resolveOld = resolve; });
      return fixture(input, init);
    }));
    writeStoredAuthSession("account-a");
    render(<InboxExperience initialConversationId={null} initialListingId="listing-a" />);
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    act(() => clearStoredAuthSession());
    await act(async () => resolveOld(json([])));
    expect(oldWrites).toBe(0);
  });
});

describe("saved collection ownership", () => {
  it("switches persisted notes to the active account without overwriting either account's notes", async () => {
    const { SavedListingsProvider, useSavedListings } = await import("../components/marketplace/saved-listings-provider");
    const { getSavedCollectionsStorageKey, normalizeSavedCollectionsState, setSavedListingNote } = await import("../lib/saved-collections");
    localStorage.setItem(getSavedCollectionsStorageKey("a"), JSON.stringify(setSavedListingNote(normalizeSavedCollectionsState(null), "listing-a", "A private note")));
    localStorage.setItem(getSavedCollectionsStorageKey("b"), JSON.stringify(setSavedListingNote(normalizeSavedCollectionsState(null), "listing-b", "B private note")));
    vi.stubGlobal("fetch", vi.fn(async (input, init) => fixture(input, init)));
    function Notes() { const { state } = useSavedListings(); return <p>{JSON.stringify(state)}</p>; }
    writeStoredAuthSession("account-a");
    const view = render(<SavedListingsProvider><Notes /></SavedListingsProvider>);
    await waitFor(() => expect(view.container.textContent).toContain("A private note"));
    act(() => writeStoredAuthSession("account-b"));
    expect(view.container.textContent).not.toContain("A private note");
    await waitFor(() => expect(view.container.textContent).toContain("B private note"));
    act(() => clearStoredAuthSession());
    expect(view.container.textContent).not.toContain("B private note");
    expect(localStorage.getItem(getSavedCollectionsStorageKey("a"))).toContain("A private note");
    expect(localStorage.getItem(getSavedCollectionsStorageKey("b"))).toContain("B private note");
  });
});

describe("administrator session writes", () => {
  it("blocks an enhanced-token roommate edit after the base login changes", async () => {
    const { AdminRoommatesScreen } = await import("../components/admin-roommates-screen");
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST" || init?.method === "PATCH") writes += 1;
      return fixture(input, init);
    }));
    writeStoredAuthSession("account-a");
    render(<AdminRoommatesScreen token="account-a" user={{ id: "a", email: "a@example.com", role: "ADMIN" }} stepUpSession={{ accessToken: "enhanced-a", reauthenticatedUntil: "2099-01-01T00:00:00.000Z" }} onStepUpRequired={() => undefined} onToast={() => undefined} {...{ assertSessionCurrent: () => assertCurrentAuthSession("account-a") }} />);
    await screen.findByRole("button", { name: "保存资料" });
    localStorage.setItem("sublet_auth_session", JSON.stringify({ version: 1, accessToken: "account-b" }));
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await act(async () => undefined);
    expect(writes).toBe(0);
  });

  it("does not request a step-up code for an old base login", async () => {
    const { AdminRoommatesExperience } = await import("../components/marketplace/admin-experiences");
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") writes += 1;
      return fixture(input, init);
    }));
    writeStoredAuthSession("account-a");
    render(<AdminRoommatesExperience />);
    fireEvent.click(await screen.findByRole("button", { name: "保存资料" }));
    const send = await screen.findByRole("button", { name: "发送管理员验证码" });
    localStorage.setItem("sublet_auth_session", JSON.stringify({ version: 1, accessToken: "account-b" }));
    fireEvent.click(send);
    await act(async () => undefined);
    expect(writes).toBe(0);
  });
});
