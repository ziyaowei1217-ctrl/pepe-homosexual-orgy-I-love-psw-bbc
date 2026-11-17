"use client";

import { apiGet, apiPut } from "./api";
import { readStoredAuthSession } from "./auth-session";
import { clearFeedSignals, normalizeFeedSignals, readFeedSignals, writeFeedSignals, type FeedSignals } from "./feed-signals";
import { localStoreChangedEvent } from "./local-store";
import { ProductApiError } from "./product-errors";
import {
  clearRenterPreferences,
  hasRenterPreferences,
  normalizeRenterPreferences,
  readRenterPreferences,
  writeRenterPreferences,
  type RenterPreferences
} from "./renter-preferences";
import {
  getSavedListingIds,
  normalizeSavedCollectionsState,
  type SavedCollection,
  type SavedCollectionsState
} from "./saved-collections";

/**
 * Copies what the renter keeps in this browser (saved lists, match preferences, feed signals) to their account
 * (api/src/user-documents), so it survives a new device or a cleared browser. This browser stays the working copy:
 * pages read and write it as before. Saves and preferences go to the server two seconds after the last edit, feed
 * signals at most every 30 seconds; hiding the page or signing out sends whatever is still waiting.
 *
 * Each document has a revision. A write names the revision it started from; if another device wrote in between,
 * the server answers 409 and this side reloads and merges three ways: the copy last synced from this browser
 * (kept in localStorage) is the common ancestor, so a removal on one device is not undone by the other.
 */
export type AccountDocumentKind = "saved-collections" | "renter-preferences" | "feed-signals";
export type AccountDocument = { revision: number; value: unknown; updatedAt: string };
export type AccountDocuments = Record<AccountDocumentKind, AccountDocument | null>;
/** "too-large": the account refused a document over its size limits (413); this browser keeps it until it fits. */
export type AccountSyncStatus = "syncing" | "synced" | "offline" | "too-large";

const kinds: AccountDocumentKind[] = ["saved-collections", "renter-preferences", "feed-signals"];

/** Rejects a response that is not a list of documents, so a wrong answer can never replace the renter's saves. */
export async function getAccountDocuments(token: string): Promise<AccountDocuments> {
  const documents = await apiGet<unknown>("/me/documents", token);
  if (!isRecord(documents) || !kinds.every((kind) => documents[kind] === null || isAccountDocument(documents[kind]))) {
    throw new Error("Unexpected account documents response");
  }
  return documents as AccountDocuments;
}

export async function putAccountDocument(token: string, kind: AccountDocumentKind, value: unknown, baseRevision: number) {
  const saved = await apiPut<unknown>(`/me/documents/${kind}`, { value, baseRevision }, token);
  if (!isAccountDocument(saved)) throw new Error("Unexpected account document response");
  return saved;
}

function isAccountDocument(value: unknown): value is AccountDocument {
  return isRecord(value) && Number.isInteger(value.revision) && (value.revision as number) > 0 && isRecord(value.value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AccountDocumentAdapter<T> = {
  kind: AccountDocumentKind;
  normalize(value: unknown): T;
  /** `base` is the value both sides last agreed on, or null when this browser has never synced this account. */
  merge(base: T | null, local: T, remote: T): T;
  isEmpty(value: T): boolean;
  read(): T;
  write(value: T): void;
};

export type AnyAccountDocumentAdapter =
  | AccountDocumentAdapter<SavedCollectionsState>
  | AccountDocumentAdapter<RenterPreferences>
  | AccountDocumentAdapter<FeedSignals>;

export function mergeSavedCollections(
  base: SavedCollectionsState | null,
  local: SavedCollectionsState,
  remote: SavedCollectionsState
): SavedCollectionsState {
  const byId = (state: SavedCollectionsState | null) => new Map((state?.collections ?? []).map((collection) => [collection.id, collection]));
  const baseCollections = byId(base);
  const localCollections = byId(local);
  const remoteCollections = byId(remote);
  const ids = unique([...remoteCollections.keys(), ...localCollections.keys()]);
  const collections = ids.flatMap((id): SavedCollection[] => {
    const before = baseCollections.get(id);
    const mine = localCollections.get(id);
    const theirs = remoteCollections.get(id);
    // A list that existed when the two last agreed and is gone from one side was removed there.
    if (before && (!mine || !theirs)) return [];
    if (!mine) return theirs ? [theirs] : [];
    if (!theirs) return [mine];
    const beforeIds = before?.listingIds ?? [];
    const added = mine.listingIds.filter((listingId) => !beforeIds.includes(listingId));
    const removed = new Set(beforeIds.filter((listingId) => !mine.listingIds.includes(listingId)));
    return [{
      id,
      name: before && mine.name !== before.name ? mine.name : theirs.name,
      listingIds: unique([...theirs.listingIds.filter((listingId) => !removed.has(listingId)), ...added])
    }];
  });
  const notes: Record<string, string> = {};
  for (const listingId of unique([...Object.keys(remote.notes), ...Object.keys(local.notes), ...Object.keys(base?.notes ?? {})])) {
    const mine = local.notes[listingId];
    const note = mine !== base?.notes[listingId] ? mine : remote.notes[listingId];
    if (note) notes[listingId] = note;
  }
  return normalizeSavedCollectionsState({ version: 1, collections, notes });
}

export function mergeRenterPreferences(base: RenterPreferences | null, local: RenterPreferences, remote: RenterPreferences) {
  // Signing in on a new browser loads the account's preferences; a guest's take over only when the account has none.
  if (!base) return hasRenterPreferences(remote) ? remote : local;
  return sameValue(local, base) ? remote : local;
}

export function mergeFeedSignals(base: FeedSignals | null, local: FeedSignals, remote: FeedSignals): FeedSignals {
  const removed = new Set((base?.viewedIds ?? []).filter((listingId) => !local.viewedIds.includes(listingId)));
  return normalizeFeedSignals({
    viewedIds: unique([...local.viewedIds, ...remote.viewedIds.filter((listingId) => !removed.has(listingId))]),
    lastSearch: base ? (local.lastSearch !== base.lastSearch ? local.lastSearch : remote.lastSearch) : local.lastSearch || remote.lastSearch
  });
}

export function savedCollectionsAdapter(read: () => SavedCollectionsState, write: (value: SavedCollectionsState) => void): AccountDocumentAdapter<SavedCollectionsState> {
  return {
    kind: "saved-collections",
    normalize: (value) => normalizeSavedCollectionsState(value),
    merge: mergeSavedCollections,
    isEmpty: (value) => getSavedListingIds(value).length === 0 && value.collections.length <= 1 && Object.keys(value.notes).length === 0,
    read,
    write
  };
}

export const renterPreferencesAdapter: AccountDocumentAdapter<RenterPreferences> = {
  kind: "renter-preferences",
  normalize: (value) => normalizeRenterPreferences(value),
  merge: mergeRenterPreferences,
  isEmpty: (value) => !hasRenterPreferences(value),
  read: readRenterPreferences,
  write: writeRenterPreferences
};

export const feedSignalsAdapter: AccountDocumentAdapter<FeedSignals> = {
  kind: "feed-signals",
  normalize: normalizeFeedSignals,
  merge: mergeFeedSignals,
  isEmpty: (value) => value.viewedIds.length === 0 && !value.lastSearch,
  read: readFeedSignals,
  write: writeFeedSignals
};

const ownerKey = "sublet_account_documents_owner_v1";
const baseKey = (userId: string) => `sublet_account_documents_v1:${userId}`;
const deviceWideKinds: AccountDocumentKind[] = ["renter-preferences", "feed-signals"];
const pushDelayMs = 2_000;
// Every opened home and every search changes the feed signals. Sending them at most every 30 seconds keeps them well
// inside their own write limit on the account (120 writes per 10 minutes for each kind, see the API's
// user-documents.controller.ts). Fast browsing could otherwise reach it, and a refused write marks the sync offline.
const feedSignalsPushDelayMs = 30_000;
const pullIntervalMs = 60_000;
const retryDelayMs = 30_000;

/**
 * Preferences and feed signals live under one device-wide key each. Once they belong to an account they are removed
 * when nobody is signed in, and they never carry over into a different account.
 */
export function releaseDeviceDocuments(nextUserId: string | null) {
  let owner: string | null = null;
  try {
    owner = window.localStorage.getItem(ownerKey);
  } catch {
    return;
  }
  if (owner && owner !== nextUserId) {
    // Forget what this browser last synced for the copies being cleared. Otherwise the next sign-in to that account
    // would read the empty copies as the renter clearing them and overwrite the account's preferences and history.
    forgetSnapshots(owner, deviceWideKinds);
    clearRenterPreferences();
    clearFeedSignals();
  }
  try {
    if (nextUserId) window.localStorage.setItem(ownerKey, nextUserId);
    else window.localStorage.removeItem(ownerKey);
  } catch {
    // Storage is blocked; there is nothing on this device to protect.
  }
}

function forgetSnapshots(userId: string, forget: AccountDocumentKind[]) {
  const key = baseKey(userId);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return;
    const parsed = safelyParseJson(raw);
    if (isRecord(parsed)) {
      for (const kind of forget) delete parsed[kind];
      try {
        window.localStorage.setItem(key, JSON.stringify(parsed));
        return;
      } catch {
        // Fall through: without any snapshot the next sync is a first sync, which keeps the account's copies.
      }
    }
    window.localStorage.removeItem(key);
  } catch {
    // Storage is blocked entirely, so the device copies can be neither read nor cleared.
  }
}

function safelyParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

type Api = { get: typeof getAccountDocuments; put: typeof putAccountDocument };
type Snapshot = { revision: number; value: unknown };
/** A change the account does not have yet, read when the session ended; `base` is the normalized last synced copy. */
type UnsentDocument = { adapter: AccountDocumentAdapter<unknown>; local: unknown; base: Snapshot | null };

/**
 * The value both copies should hold. A side that still matches the last synced copy takes the other side's value;
 * when both changed, the adapter merges them three ways.
 */
function mergeDocument(adapter: AccountDocumentAdapter<unknown>, local: unknown, baseValue: unknown, remoteValue: unknown) {
  if (remoteValue === null) return local;
  if (baseValue !== null && sameValue(local, baseValue)) return remoteValue;
  if (baseValue !== null && sameValue(remoteValue, baseValue)) return local;
  return adapter.merge(baseValue, local, remoteValue);
}

export class AccountDocumentSync {
  private readonly adapters: AccountDocumentAdapter<unknown>[];
  private readonly timers = new Map<AccountDocumentKind, ReturnType<typeof setTimeout>>();
  private readonly lastSeen = new Map<AccountDocumentKind, string>();
  /** Documents the account refused as too large, with the value it refused, so the same value is not sent again. */
  private readonly tooLarge = new Map<AccountDocumentKind, string>();
  private queue: Promise<void> = Promise.resolve();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPullAt = 0;
  private stopped = false;
  private failures = 0;

  constructor(
    private readonly token: string,
    private readonly userId: string,
    adapters: AnyAccountDocumentAdapter[],
    private readonly onStatus: (status: AccountSyncStatus) => void = () => undefined,
    private readonly api: Api = { get: getAccountDocuments, put: putAccountDocument }
  ) {
    this.adapters = adapters as unknown as AccountDocumentAdapter<unknown>[];
  }

  /** Loads the account's documents, merges them with this browser's copies and listens for later changes. */
  start() {
    for (const adapter of this.adapters) this.lastSeen.set(adapter.kind, stableJson(adapter.read()));
    window.addEventListener(localStoreChangedEvent, this.onLocalStore);
    window.addEventListener("focus", this.onFocus);
    document.addEventListener("visibilitychange", this.onVisibility);
    return this.pull();
  }

  /**
   * Ends this session's syncing. Changes the account does not have yet (waiting for their push, or for a retry after a
   * failed one) are sent one last time with this session's token. They are read here, before anything else runs:
   * after a sign-out or an account switch, the next screen removes this browser's copies of the preferences and feed
   * signals straight away.
   */
  stop() {
    if (this.stopped) return;
    const unsent = this.unsentDocuments();
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    window.removeEventListener(localStoreChangedEvent, this.onLocalStore);
    window.removeEventListener("focus", this.onFocus);
    document.removeEventListener("visibilitychange", this.onVisibility);
    // After any request still running, so the two do not race for the same revision.
    if (unsent.length > 0) void this.queue.catch(() => undefined).then(() => this.sendUnsent(unsent)).catch(() => undefined);
  }

  /** Call after this browser's copy of `kind` changed; it is written to the account shortly after. */
  localChanged(kind: AccountDocumentKind) {
    const adapter = this.adapters.find((candidate) => candidate.kind === kind);
    if (!adapter || this.stopped) return;
    const current = stableJson(adapter.read());
    if (this.lastSeen.get(kind) === current) return;
    this.lastSeen.set(kind, current);
    const existing = this.timers.get(kind);
    // Feed signals wait for the pending push, which sends the latest copy; other kinds go out once edits pause.
    if (existing && kind === "feed-signals") return;
    if (existing) clearTimeout(existing);
    this.timers.set(kind, setTimeout(() => {
      this.timers.delete(kind);
      void this.run(() => this.sync(adapter, this.snapshotAsRemote(kind), 0));
    }, kind === "feed-signals" ? feedSignalsPushDelayMs : pushDelayMs));
  }

  pull() {
    this.lastPullAt = Date.now();
    return this.run(async () => {
      const documents = await this.api.get(this.token);
      const failures: unknown[] = [];
      for (const adapter of this.adapters) {
        try {
          await this.sync(adapter, documents[adapter.kind], 0);
        } catch (error) {
          // One document failing must not keep the others from syncing; the first failure still sets the status.
          failures.push(error);
        }
      }
      if (failures.length > 0) throw failures[0];
    });
  }

  private readonly onLocalStore = () => {
    for (const adapter of this.adapters) {
      if (adapter.kind !== "saved-collections") this.localChanged(adapter.kind);
    }
  };

  private readonly onFocus = () => {
    if (Date.now() - this.lastPullAt >= pullIntervalMs) void this.pull();
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === "visible") {
      this.onFocus();
      return;
    }
    // Leaving the page: send what is waiting now instead of after the delay.
    for (const [kind, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(kind);
      const adapter = this.adapters.find((candidate) => candidate.kind === kind);
      if (adapter) void this.run(() => this.sync(adapter, this.snapshotAsRemote(kind), 0));
    }
  };

  private run(operation: () => Promise<void>) {
    const next = this.queue.then(async () => {
      if (!this.current()) return;
      this.onStatus("syncing");
      try {
        await operation();
        this.failures = 0;
        if (this.current()) this.onStatus(this.tooLarge.size > 0 ? "too-large" : "synced");
      } catch (error) {
        if (!this.current()) return;
        this.onStatus("offline");
        if (error instanceof ProductApiError && error.category === "authentication") return;
        // Free-tier API instances sleep when idle and take about a minute to wake; try again later.
        this.failures += 1;
        if (!this.retryTimer && this.failures <= 5) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.pull();
          }, retryDelayMs * this.failures);
        }
      }
    });
    this.queue = next;
    return next;
  }

  /** Merges the account's copy into this browser's and writes the result back when the two differ. */
  private async sync(adapter: AccountDocumentAdapter<unknown>, remote: AccountDocument | null, attempt: number): Promise<void> {
    if (!this.current()) return;
    const local = adapter.read();
    const base = this.readSnapshot(adapter.kind);
    const baseValue = base ? adapter.normalize(base.value) : null;
    const remoteValue = remote ? adapter.normalize(remote.value) : null;
    const merged = mergeDocument(adapter, local, baseValue, remoteValue);

    if (!sameValue(merged, local)) this.writeLocal(adapter, merged);
    if (remote && remoteValue !== null && sameValue(merged, remoteValue)) {
      this.tooLarge.delete(adapter.kind);
      this.writeSnapshot(adapter.kind, { revision: remote.revision, value: remoteValue });
      return;
    }
    if (!remote && adapter.isEmpty(merged)) {
      this.tooLarge.delete(adapter.kind);
      return;
    }
    const mergedJson = stableJson(merged);
    if (this.tooLarge.get(adapter.kind) === mergedJson) return;

    let saved: AccountDocument;
    try {
      saved = await this.api.put(this.token, adapter.kind, merged, remote?.revision ?? 0);
    } catch (error) {
      if (error instanceof ProductApiError && error.status === 409 && attempt < 3) {
        const documents = await this.api.get(this.token);
        return this.sync(adapter, documents[adapter.kind], attempt + 1);
      }
      if (error instanceof ProductApiError && error.status === 413) {
        // Sending it again cannot help until something is removed. This browser keeps its copy, and the status says why.
        if (this.current()) this.tooLarge.set(adapter.kind, mergedJson);
        return;
      }
      throw error;
    }
    if (!this.current()) return;
    this.tooLarge.delete(adapter.kind);
    const savedValue = adapter.normalize(saved.value);
    this.writeSnapshot(adapter.kind, { revision: saved.revision, value: savedValue });
    // The server stores its normalized copy (for example trimmed text); adopt it unless the page changed meanwhile.
    if (!sameValue(savedValue, merged) && sameValue(adapter.read(), merged)) this.writeLocal(adapter, savedValue);
  }

  /** Documents whose copy here differs from what the account last confirmed, except copies it refused as too large. */
  private unsentDocuments(): UnsentDocument[] {
    return this.adapters.flatMap((adapter) => {
      const local = adapter.read();
      const snapshot = this.readSnapshot(adapter.kind);
      const base = snapshot ? { revision: snapshot.revision, value: adapter.normalize(snapshot.value) } : null;
      const unchanged = base ? sameValue(local, base.value) : adapter.isEmpty(local);
      return unchanged || this.tooLarge.get(adapter.kind) === stableJson(local) ? [] : [{ adapter, local, base }];
    });
  }

  /**
   * The last push of a session that has ended: the same merge as sync(), with the copies read when it ended. It never
   * writes this browser's copies or snapshots, which now belong to whoever is signed in next. A failure is dropped,
   * because nobody is signed in here to retry it for.
   */
  private async sendUnsent(unsent: UnsentDocument[]) {
    for (const { adapter, local, base } of unsent) {
      let remote = base;
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        const merged = mergeDocument(adapter, local, base?.value ?? null, remote?.value ?? null);
        if (remote ? sameValue(merged, remote.value) : adapter.isEmpty(merged)) break;
        if (this.tooLarge.get(adapter.kind) === stableJson(merged)) break;
        try {
          await this.api.put(this.token, adapter.kind, merged, remote?.revision ?? 0);
          break;
        } catch (error) {
          if (!(error instanceof ProductApiError && error.status === 409) || attempt === 3) break;
        }
        // Another device wrote first: merge with its copy and try again.
        const latest = await this.api.get(this.token).then((documents) => documents[adapter.kind], () => undefined);
        if (latest === undefined) break;
        remote = latest ? { revision: latest.revision, value: adapter.normalize(latest.value) } : null;
      }
    }
  }

  /** What this browser last synced, used as the server's copy when only local changes need sending. */
  private snapshotAsRemote(kind: AccountDocumentKind): AccountDocument | null {
    const snapshot = this.readSnapshot(kind);
    return snapshot ? { revision: snapshot.revision, value: snapshot.value, updatedAt: "" } : null;
  }

  private writeLocal(adapter: AccountDocumentAdapter<unknown>, value: unknown) {
    this.lastSeen.set(adapter.kind, stableJson(value));
    adapter.write(value);
  }

  private current() {
    return !this.stopped && readStoredAuthSession()?.accessToken === this.token;
  }

  private readSnapshot(kind: AccountDocumentKind): Snapshot | null {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(baseKey(this.userId)) ?? "{}") as Record<string, Snapshot | undefined>;
      const snapshot = parsed[kind];
      return snapshot && Number.isInteger(snapshot.revision) && snapshot.revision > 0 ? snapshot : null;
    } catch {
      return null;
    }
  }

  private writeSnapshot(kind: AccountDocumentKind, snapshot: Snapshot) {
    try {
      const key = baseKey(this.userId);
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, Snapshot>;
      window.localStorage.setItem(key, JSON.stringify({ ...parsed, [kind]: snapshot }));
    } catch {
      // Without storage every sync is a first sync, which merges by union and loses nothing.
    }
  }
}

export function sameValue(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : item);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
