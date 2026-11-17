// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SavedListingsProvider, useSavedListings } from "../components/marketplace/saved-listings-provider";
import {
  AccountDocumentSync,
  feedSignalsAdapter,
  mergeFeedSignals,
  mergeRenterPreferences,
  mergeSavedCollections,
  releaseDeviceDocuments,
  renterPreferencesAdapter,
  savedCollectionsAdapter,
  type AccountDocument,
  type AccountDocumentKind,
  type AccountDocuments
} from "../lib/account-documents";
import { clearStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";
import { readFeedSignals, rememberListingView } from "../lib/feed-signals";
import { ProductApiError } from "../lib/product-errors";
import { emptyRenterPreferences, readRenterPreferences, writeRenterPreferences } from "../lib/renter-preferences";
import {
  MAX_SAVED_COLLECTIONS,
  normalizeSavedCollectionsState,
  removeSavedCollection,
  type SavedCollectionsState
} from "../lib/saved-collections";

const saved = (all: string[], extra: SavedCollectionsState["collections"] = [], notes: Record<string, string> = {}) =>
  normalizeSavedCollectionsState({ version: 1, collections: [{ id: "all", name: "全部收藏", listingIds: all }, ...extra], notes });

describe("account document merges", () => {
  it("keeps additions and removals from both sides of saved lists", () => {
    const base = saved(["a", "b"], [{ id: "trip", name: "Trip", listingIds: ["a"] }], { a: "old" });
    const local = saved(["a", "c"], [{ id: "trip", name: "Trip", listingIds: ["a", "c"] }], { a: "mine" });
    const remote = saved(["a", "b", "d"], [{ id: "trip", name: "Road trip", listingIds: [] }, { id: "new", name: "New", listingIds: ["d"] }], { a: "old", d: "theirs" });
    expect(mergeSavedCollections(base, local, remote)).toEqual(saved(
      ["a", "d", "c"],
      [{ id: "trip", name: "Road trip", listingIds: ["c"] }, { id: "new", name: "New", listingIds: ["d"] }],
      { a: "mine", d: "theirs" }
    ));
  });

  it("unions both sides the first time a browser syncs an account", () => {
    const merged = mergeSavedCollections(null, saved(["guest"], [], { guest: "note" }), saved(["account"], [{ id: "x", name: "X", listingIds: ["account"] }]));
    expect(merged.collections[0].listingIds).toEqual(["account", "guest"]);
    expect(merged.collections).toContainEqual({ id: "x", name: "X", listingIds: ["account"] });
    expect(merged.notes).toEqual({ guest: "note" });
  });

  it("takes the side that changed for preferences, and the account's on a new browser", () => {
    const ucla = { ...emptyRenterPreferences, destination: "UCLA" };
    const usc = { ...emptyRenterPreferences, destination: "USC" };
    expect(mergeRenterPreferences(ucla, usc, ucla)).toEqual(usc);
    expect(mergeRenterPreferences(ucla, ucla, usc)).toEqual(usc);
    expect(mergeRenterPreferences(null, usc, ucla)).toEqual(ucla);
    expect(mergeRenterPreferences(null, usc, emptyRenterPreferences)).toEqual(usc);
  });

  it("keeps views from both devices but not ones cleared here", () => {
    expect(mergeFeedSignals({ viewedIds: ["a", "b"], lastSearch: "" }, { viewedIds: ["c"], lastSearch: "/search?q=LA" }, { viewedIds: ["d", "a", "b"], lastSearch: "/search?q=SF" }))
      .toEqual({ viewedIds: ["c", "d"], lastSearch: "/search?q=LA" });
  });
});

type ServerDocument = { revision: number; value: unknown };

function memoryServer() {
  const documents = new Map<AccountDocumentKind, ServerDocument>();
  const present = (kind: AccountDocumentKind): AccountDocument | null => {
    const document = documents.get(kind);
    return document ? { ...document, updatedAt: "2026-11-17T00:00:00.000Z" } : null;
  };
  const list = (): AccountDocuments => ({ "saved-collections": present("saved-collections"), "renter-preferences": present("renter-preferences"), "feed-signals": present("feed-signals") });
  const puts: { kind: AccountDocumentKind; value: unknown; baseRevision: number }[] = [];
  const put = (kind: AccountDocumentKind, value: unknown, baseRevision: number) => {
    puts.push({ kind, value, baseRevision });
    const current = documents.get(kind);
    if ((current?.revision ?? 0) !== baseRevision) return null;
    documents.set(kind, { revision: baseRevision + 1, value });
    return present(kind)!;
  };
  return { documents, list, put, puts };
}

describe("account document sync", () => {
  beforeEach(() => writeStoredAuthSession("token-a"));
  afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function engine(server: ReturnType<typeof memoryServer>, onStatus = vi.fn(), token = "token-a", userId = "user-a") {
    return new AccountDocumentSync(token, userId, [renterPreferencesAdapter, feedSignalsAdapter], onStatus, {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        const result = server.put(kind, value, baseRevision);
        if (!result) throw new ProductApiError({ category: "validation", message: "conflict", retryable: false, status: 409 });
        return result;
      }
    });
  }

  async function signInAndSync(server: ReturnType<typeof memoryServer>, token: string, userId: string) {
    writeStoredAuthSession(token);
    releaseDeviceDocuments(userId);
    const sync = engine(server, vi.fn(), token, userId);
    await sync.start();
    sync.stop();
  }

  it("gives the account's preferences back after the same renter signs out and in again", async () => {
    const server = memoryServer();
    releaseDeviceDocuments("user-a");
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    await signInAndSync(server, "token-a", "user-a");
    expect(server.documents.get("renter-preferences")).toMatchObject({ revision: 1, value: { destination: "UCLA" } });

    // Signing out clears the copy on this browser; that must not read as the renter clearing their preferences.
    releaseDeviceDocuments(null);
    expect(readRenterPreferences()).toEqual(emptyRenterPreferences);
    await signInAndSync(server, "token-a", "user-a");
    expect(readRenterPreferences()).toMatchObject({ destination: "UCLA" });
    expect(server.documents.get("renter-preferences")).toMatchObject({ revision: 1, value: { destination: "UCLA" } });
  });

  it("gives each account its own preferences when accounts take turns on one browser", async () => {
    const serverA = memoryServer();
    const serverB = memoryServer();
    serverA.documents.set("renter-preferences", { revision: 3, value: { ...emptyRenterPreferences, destination: "UCLA" } });
    serverB.documents.set("renter-preferences", { revision: 5, value: { ...emptyRenterPreferences, destination: "USC" } });
    await signInAndSync(serverA, "token-a", "user-a");
    expect(readRenterPreferences().destination).toBe("UCLA");
    await signInAndSync(serverB, "token-b", "user-b");
    expect(readRenterPreferences().destination).toBe("USC");
    await signInAndSync(serverA, "token-a", "user-a");
    expect(readRenterPreferences().destination).toBe("UCLA");
    expect(serverA.puts).toEqual([]);
    expect(serverB.puts).toEqual([]);
  });

  it("keeps a document the account refuses as too large on this browser, and does not send it again", async () => {
    vi.useFakeTimers();
    const server = memoryServer();
    const status = vi.fn();
    let refused = 0;
    const sync = new AccountDocumentSync("token-a", "user-a", [renterPreferencesAdapter], status, {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        if ((value as { destination?: string }).destination === "Huge") {
          refused += 1;
          throw new ProductApiError({ category: "service", message: "too large", retryable: false, status: 413 });
        }
        return server.put(kind, value, baseRevision)!;
      }
    });
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "Huge" });
    await sync.start();
    expect(refused).toBe(1);
    expect(status).toHaveBeenLastCalledWith("too-large");
    await sync.pull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refused).toBe(1);
    expect(status).toHaveBeenLastCalledWith("too-large");
    expect(readRenterPreferences().destination).toBe("Huge");

    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(server.documents.get("renter-preferences")).toMatchObject({ revision: 1, value: { destination: "UCLA" } });
    expect(status).toHaveBeenLastCalledWith("synced");
    sync.stop();
  });

  it("still syncs the other documents when one of them fails", async () => {
    const server = memoryServer();
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    rememberListingView("home-1");
    const status = vi.fn();
    const sync = new AccountDocumentSync("token-a", "user-a", [renterPreferencesAdapter, feedSignalsAdapter], status, {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        if (kind === "renter-preferences") throw new ProductApiError({ category: "service", message: "down", retryable: true, status: 503 });
        return server.put(kind, value, baseRevision)!;
      }
    });
    await sync.start();
    sync.stop();
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 1, value: { viewedIds: ["home-1"] } });
    expect(server.documents.has("renter-preferences")).toBe(false);
    expect(status).toHaveBeenLastCalledWith("offline");
  });

  it("sends this browser's values to an empty account and loads them on another browser", async () => {
    const server = memoryServer();
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA", budgetMax: 1800 });
    const first = engine(server);
    await first.start();
    first.stop();
    expect(server.documents.get("renter-preferences")?.value).toMatchObject({ destination: "UCLA", budgetMax: 1800 });
    expect(server.documents.has("feed-signals")).toBe(false);

    localStorage.clear();
    writeStoredAuthSession("token-a");
    const second = engine(server);
    await second.start();
    second.stop();
    expect(readRenterPreferences()).toMatchObject({ destination: "UCLA", budgetMax: 1800 });
  });

  it("writes local changes a moment later, and merges when another device wrote first", async () => {
    vi.useFakeTimers();
    const server = memoryServer();
    const sync = engine(server);
    await sync.start();
    rememberListingView("home-1");
    await vi.advanceTimersByTimeAsync(30_500);
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 1, value: { viewedIds: ["home-1"] } });

    server.documents.set("feed-signals", { revision: 2, value: { viewedIds: ["home-9", "home-1"], lastSearch: "" } });
    rememberListingView("home-2");
    await vi.advanceTimersByTimeAsync(30_500);
    expect(server.puts.at(-1)).toMatchObject({ baseRevision: 2 });
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 3, value: { viewedIds: ["home-2", "home-1", "home-9"] } });
    expect(readFeedSignals().viewedIds).toEqual(["home-2", "home-1", "home-9"]);
    sync.stop();
  });

  it("sends preferences once edits pause, opened homes at most twice a minute, and both when the page is left", async () => {
    vi.useFakeTimers();
    const server = memoryServer();
    const sync = engine(server);
    await sync.start();
    for (const id of ["home-1", "home-2", "home-3"]) {
      rememberListingView(id);
      await vi.advanceTimersByTimeAsync(5_000);
    }
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(server.documents.get("renter-preferences")).toMatchObject({ value: { destination: "UCLA" } });
    expect(server.documents.has("feed-signals")).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.puts.filter((entry) => entry.kind === "feed-signals")).toEqual([
      expect.objectContaining({ value: expect.objectContaining({ viewedIds: ["home-3", "home-2", "home-1"] }) })
    ]);

    rememberListingView("home-4");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 2, value: { viewedIds: ["home-4", "home-3", "home-2", "home-1"] } });
    sync.stop();
  });

  it("sends changes still waiting when the session ends, before the next screen clears this browser's copies", async () => {
    const server = memoryServer();
    server.documents.set("feed-signals", { revision: 1, value: { viewedIds: ["home-9"], lastSearch: "" } });
    releaseDeviceDocuments("user-a");
    const sync = engine(server);
    await sync.start();
    rememberListingView("home-1");
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    // Another device opened a home meanwhile, so the last push has to merge with it.
    server.documents.set("feed-signals", { revision: 2, value: { viewedIds: ["home-8", "home-9"], lastSearch: "" } });
    expect(server.puts).toEqual([]);

    // Signing out: the session goes, the engine stops, then the guest screen clears the device copies at once.
    clearStoredAuthSession();
    sync.stop();
    releaseDeviceDocuments(null);
    await vi.waitFor(() => expect(server.documents.get("feed-signals")).toMatchObject({
      revision: 3,
      value: { viewedIds: ["home-1", "home-9", "home-8"] }
    }));
    expect(server.documents.get("renter-preferences")).toMatchObject({ revision: 1, value: { destination: "UCLA" } });
    // The last push leaves this browser alone: no copies come back and no snapshot is written for the next sign-in.
    expect(readFeedSignals().viewedIds).toEqual([]);
    expect(readRenterPreferences()).toEqual(emptyRenterPreferences);
    expect(JSON.parse(localStorage.getItem("sublet_account_documents_v1:user-a") ?? "{}")).toEqual({});
  });

  it("sends a change whose push failed one last time when the session ends, and nothing that is already synced", async () => {
    const server = memoryServer();
    server.documents.set("feed-signals", { revision: 4, value: { viewedIds: ["home-1"], lastSearch: "" } });
    let down = true;
    const sync = new AccountDocumentSync("token-a", "user-a", [renterPreferencesAdapter, feedSignalsAdapter], vi.fn(), {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        if (down) throw new ProductApiError({ category: "service", message: "waking up", retryable: true, status: 503 });
        return server.put(kind, value, baseRevision)!;
      }
    });
    releaseDeviceDocuments("user-a");
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    await sync.start();
    expect(server.documents.has("renter-preferences")).toBe(false);

    down = false;
    sync.stop();
    sync.stop();
    await vi.waitFor(() => expect(server.documents.get("renter-preferences")).toMatchObject({ revision: 1, value: { destination: "UCLA" } }));
    expect(server.puts.map((entry) => entry.kind)).toEqual(["renter-preferences"]);
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 4 });
  });

  it("sends nothing from a tab that stops after another tab handed this browser's copies to someone else", async () => {
    const server = memoryServer();
    server.documents.set("feed-signals", { revision: 1, value: { viewedIds: ["a-home"], lastSearch: "" } });
    releaseDeviceDocuments("user-a");
    const lateTab = engine(server);
    await lateTab.start();

    // Another tab signs A out; a guest browses, then B signs in and gets B's own copies.
    clearStoredAuthSession();
    releaseDeviceDocuments(null);
    rememberListingView("guest-home");
    writeStoredAuthSession("token-b");
    releaseDeviceDocuments("user-b");
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "B's school" });
    rememberListingView("b-home");

    // The late tab wakes and ends A's session: none of that may reach A's account.
    lateTab.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.puts).toEqual([]);
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 1, value: { viewedIds: ["a-home"] } });
  });

  it("keeps a saved-list change made just before signing out for this browser's next sign-in, merged with later edits", async () => {
    const server = memoryServer();
    server.documents.set("saved-collections", { revision: 1, value: saved(["a"]) });
    let state = saved(["a"]);
    const lists = savedCollectionsAdapter(() => state, (value) => { state = value; });
    const api = (token: string) => new AccountDocumentSync(token, "user-a", [lists], vi.fn(), {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        const result = server.put(kind, value, baseRevision);
        if (!result) throw new ProductApiError({ category: "validation", message: "conflict", retryable: false, status: 409 });
        return result;
      }
    });
    releaseDeviceDocuments("user-a");
    const laptop = api("token-a");
    await laptop.start();
    state = saved(["a", "y"]);
    laptop.localChanged("saved-collections");
    clearStoredAuthSession();
    laptop.stop();
    releaseDeviceDocuments(null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Saved lists stay in this browser under the account, so nothing is sent with the ended session.
    expect(server.puts).toEqual([]);

    // Another device removes "a" meanwhile; signing in here again adds "y" on top of that.
    server.documents.set("saved-collections", { revision: 2, value: saved([]) });
    writeStoredAuthSession("token-a2");
    releaseDeviceDocuments("user-a");
    const again = api("token-a2");
    await again.start();
    again.stop();
    expect(server.puts).toEqual([expect.objectContaining({ kind: "saved-collections", baseRevision: 2 })]);
    expect(server.documents.get("saved-collections")).toMatchObject({ revision: 3, value: saved(["y"]) });
    expect(state).toEqual(saved(["y"]));
  });

  it("syncs saved lists again once the renter deletes enough of them after a merge went over the account's limit", async () => {
    vi.useFakeTimers();
    const lists = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}`, listingIds: [] }));
    const server = memoryServer();
    server.documents.set("saved-collections", { revision: 3, value: saved([], lists("account", 45)) });
    // A guest's lists on this browser join the account's at sign-in: 56 lists with 全部收藏.
    let state = saved([], lists("guest", 10));
    const status = vi.fn();
    const sync = new AccountDocumentSync("token-a", "user-a", [savedCollectionsAdapter(() => state, (value) => { state = value; })], status, {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        if ((value as SavedCollectionsState).collections.length > MAX_SAVED_COLLECTIONS) {
          throw new ProductApiError({ category: "validation", message: "too large", retryable: false, status: 413 });
        }
        const result = server.put(kind, value, baseRevision);
        if (!result) throw new ProductApiError({ category: "validation", message: "conflict", retryable: false, status: 409 });
        return result;
      }
    });
    await sync.start();
    expect(state.collections).toHaveLength(56);
    expect(status).toHaveBeenLastCalledWith("too-large");

    // Another device deletes one of the account's lists, and the renter deletes six others here.
    const remote = server.documents.get("saved-collections")!.value as SavedCollectionsState;
    server.documents.set("saved-collections", { revision: 4, value: removeSavedCollection(remote, "account-10") });
    for (let index = 0; index < 6; index += 1) state = removeSavedCollection(state, `account-${index}`);
    sync.localChanged("saved-collections");
    await vi.advanceTimersByTimeAsync(2_500);

    expect(status).toHaveBeenLastCalledWith("synced");
    const stored = server.documents.get("saved-collections")!;
    const ids = (stored.value as SavedCollectionsState).collections.map((collection) => collection.id);
    expect(stored.revision).toBe(5);
    expect(ids).toHaveLength(MAX_SAVED_COLLECTIONS - 1);
    // Neither the lists deleted here nor the one deleted on the other device come back.
    expect(ids.filter((id) => ["account-0", "account-5", "account-10"].includes(id))).toEqual([]);
    expect(ids).toContain("guest-9");
    expect(state.collections.map((collection) => collection.id)).toEqual(ids);
    sync.stop();
  });

  it("never replaces local values with an unexpected answer, and reports being offline", async () => {
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    const status = vi.fn();
    const sync = new AccountDocumentSync("token-a", "user-a", [renterPreferencesAdapter], status, {
      get: async () => { throw new ProductApiError({ category: "service", message: "down", retryable: true, status: 503 }); },
      put: async () => { throw new Error("not reached"); }
    });
    await sync.start();
    sync.stop();
    expect(status).toHaveBeenLastCalledWith("offline");
    expect(readRenterPreferences().destination).toBe("UCLA");
  });
});

function Probe() {
  const { state, hydrated, accountLabel } = useSavedListings();
  return <><output data-testid="ids">{hydrated ? state.collections[0].listingIds.join(",") : "loading"}</output><p>{accountLabel}</p></>;
}

describe("signed-in saves", () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function stubApi(server: ReturnType<typeof memoryServer>, userFor: (token: string) => string, me?: () => Response | null) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const token = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace("Bearer ", "");
      if (url.endsWith("/auth/me")) return me?.() ?? Response.json({ id: userFor(token), email: `${userFor(token)}@example.com`, role: "USER" });
      if (url.endsWith("/me/documents") && init?.method === "GET") return Response.json(server.list());
      const kind = url.match(/\/me\/documents\/([a-z-]+)$/)?.[1] as AccountDocumentKind | undefined;
      if (kind && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { value: unknown; baseRevision: number };
        const result = server.put(kind, body.value, body.baseRevision);
        return result ? Response.json(result) : Response.json({ code: "DOCUMENT_CONFLICT" }, { status: 409 });
      }
      return Response.json({ message: "Unexpected path" }, { status: 404 });
    }));
  }

  it("loads an account's saves on a new browser and keeps guest saves made before signing in", async () => {
    const server = memoryServer();
    server.documents.set("saved-collections", { revision: 4, value: saved(["from-phone"]) });
    localStorage.setItem("sublet-saved-collections-v1:guest", JSON.stringify(saved(["from-guest"])));
    stubApi(server, () => "renter");
    writeStoredAuthSession("renter-token");
    render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("from-phone,from-guest"));
    await waitFor(() => expect(server.documents.get("saved-collections")).toMatchObject({ revision: 5 }));
    expect((server.documents.get("saved-collections")!.value as SavedCollectionsState).collections[0].listingIds).toEqual(["from-phone", "from-guest"]);
    await screen.findByText("收藏已保存到账户，换设备登录也能看到");
  });

  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  it("files saves under the account named in the session token without waiting for the API", async () => {
    const server = memoryServer();
    server.documents.set("saved-collections", { revision: 2, value: saved(["from-phone"]) });
    localStorage.setItem("sublet-saved-collections-v1:guest", JSON.stringify(saved(["from-guest"])));
    stubApi(server, () => "renter", () => Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }));
    writeStoredAuthSession(`${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "renter", role: "USER" })}.signature`);
    render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("from-phone,from-guest"));
    expect(JSON.parse(localStorage.getItem("sublet-saved-collections-v1:renter")!).collections[0].listingIds).toEqual(["from-phone", "from-guest"]);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/auth/me"))).toBe(false);
  });

  it("waits for a slow API instead of filing a signed-in account's saves as a guest's", async () => {
    const server = memoryServer();
    server.documents.set("saved-collections", { revision: 2, value: saved(["from-phone"]) });
    const guestRaw = JSON.stringify(saved(["from-guest"]));
    localStorage.setItem("sublet-saved-collections-v1:guest", guestRaw);
    let meCalls = 0;
    stubApi(server, () => "renter", () => (meCalls += 1) === 1 ? Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }) : null);
    writeStoredAuthSession("renter-token");
    render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await waitFor(() => expect(meCalls).toBe(1));
    expect(screen.getByTestId("ids").textContent).toBe("loading");
    expect(localStorage.getItem("sublet-saved-collections-v1:guest")).toBe(guestRaw);
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("from-phone,from-guest"), { timeout: 6_000 });
    expect(meCalls).toBe(2);
  });

  it("sends homes opened just before signing out to the account, then clears them from the browser", async () => {
    const server = memoryServer();
    stubApi(server, () => "renter");
    writeStoredAuthSession("renter-token");
    render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await screen.findByText(/^收藏已保存到账户/);

    act(() => rememberListingView("home-x"));
    await act(async () => clearStoredAuthSession());
    await waitFor(() => expect(server.documents.get("feed-signals")?.value).toMatchObject({ viewedIds: ["home-x"] }));
    expect(readFeedSignals().viewedIds).toEqual([]);
  });

  it("removes an account's preferences from the browser on sign-out and never gives them to the next account", async () => {
    const server = memoryServer();
    stubApi(server, (token) => token === "first-token" ? "first" : "second");
    writeStoredAuthSession("first-token");
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    const view = render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await waitFor(() => expect(server.documents.get("renter-preferences")?.value).toMatchObject({ destination: "UCLA" }));

    await act(async () => clearStoredAuthSession());
    await waitFor(() => expect(readRenterPreferences()).toEqual(emptyRenterPreferences));
    view.unmount();

    // The first account's values left on a browser (for example after its session expired) stay out of the second.
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "Stale" });
    localStorage.setItem("sublet_account_documents_owner_v1", "first");
    const second = memoryServer();
    stubApi(second, () => "second");
    writeStoredAuthSession("second-token");
    render(<SavedListingsProvider><Probe /></SavedListingsProvider>);
    await waitFor(() => expect(localStorage.getItem("sublet_account_documents_owner_v1")).toBe("second"));
    await screen.findByText(/^收藏已保存到账户/);
    expect(readRenterPreferences()).toEqual(emptyRenterPreferences);
    expect(second.documents.has("renter-preferences")).toBe(false);
  });
});
