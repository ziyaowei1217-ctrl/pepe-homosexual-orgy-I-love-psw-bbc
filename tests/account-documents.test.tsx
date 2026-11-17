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
  renterPreferencesAdapter,
  type AccountDocument,
  type AccountDocumentKind,
  type AccountDocuments
} from "../lib/account-documents";
import { clearStoredAuthSession, writeStoredAuthSession } from "../lib/auth-session";
import { readFeedSignals, rememberListingView } from "../lib/feed-signals";
import { ProductApiError } from "../lib/product-errors";
import { emptyRenterPreferences, readRenterPreferences, writeRenterPreferences } from "../lib/renter-preferences";
import { normalizeSavedCollectionsState, type SavedCollectionsState } from "../lib/saved-collections";

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

  function engine(server: ReturnType<typeof memoryServer>, onStatus = vi.fn()) {
    return new AccountDocumentSync("token-a", "user-a", [renterPreferencesAdapter, feedSignalsAdapter], onStatus, {
      get: async () => server.list(),
      put: async (_token, kind, value, baseRevision) => {
        const result = server.put(kind, value, baseRevision);
        if (!result) throw new ProductApiError({ category: "validation", message: "conflict", retryable: false, status: 409 });
        return result;
      }
    });
  }

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
    await vi.advanceTimersByTimeAsync(2_500);
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 1, value: { viewedIds: ["home-1"] } });

    server.documents.set("feed-signals", { revision: 2, value: { viewedIds: ["home-9", "home-1"], lastSearch: "" } });
    rememberListingView("home-2");
    await vi.advanceTimersByTimeAsync(2_500);
    expect(server.puts.at(-1)).toMatchObject({ baseRevision: 2 });
    expect(server.documents.get("feed-signals")).toMatchObject({ revision: 3, value: { viewedIds: ["home-2", "home-1", "home-9"] } });
    expect(readFeedSignals().viewedIds).toEqual(["home-2", "home-1", "home-9"]);
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

  function stubApi(server: ReturnType<typeof memoryServer>, userFor: (token: string) => string) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const token = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace("Bearer ", "");
      if (url.endsWith("/auth/me")) return Response.json({ id: userFor(token), email: `${userFor(token)}@example.com`, role: "USER" });
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
