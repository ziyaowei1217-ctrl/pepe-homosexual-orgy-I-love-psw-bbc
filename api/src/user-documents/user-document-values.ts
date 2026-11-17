import { UserDocumentKind } from "@prisma/client";

/**
 * Per-account copies of what the web app used to keep only in the browser: saved homes and lists,
 * match preferences and the feed signals (recently opened homes, last search). The web app's own
 * normalizers (lib/saved-collections.ts, lib/renter-preferences.ts, lib/feed-signals.ts) decide what
 * the values mean; this file only keeps them to a known shape and bounded size.
 */
export const userDocumentSlugs = ["saved-collections", "renter-preferences", "feed-signals"] as const;
export type UserDocumentSlug = (typeof userDocumentSlugs)[number];

const kindsBySlug: Record<UserDocumentSlug, UserDocumentKind> = {
  "saved-collections": UserDocumentKind.SAVED_COLLECTIONS,
  "renter-preferences": UserDocumentKind.RENTER_PREFERENCES,
  "feed-signals": UserDocumentKind.FEED_SIGNALS
};

export const MAX_USER_DOCUMENT_BYTES = 64 * 1024;

/**
 * Saved lists past these limits are refused rather than cut: the web app adopts whatever the server stores,
 * so a cut copy would silently delete saves or notes from the renter's browser as well.
 */
export const SAVED_COLLECTION_LIMITS = { collections: 50, listingsPerCollection: 500, notes: 500, noteLength: 2000 } as const;

/** Thrown when a document is over a limit; the service answers 413 DOCUMENT_TOO_LARGE. */
export class UserDocumentTooLargeError extends Error {
  constructor(detail: string) {
    super(`Document is too large: ${detail}`);
  }
}

export function userDocumentKind(slug: string): UserDocumentKind | null {
  return (userDocumentSlugs as readonly string[]).includes(slug) ? kindsBySlug[slug as UserDocumentSlug] : null;
}

export function userDocumentSlug(kind: UserDocumentKind): UserDocumentSlug {
  return userDocumentSlugs.find((slug) => kindsBySlug[slug] === kind)!;
}

export function normalizeUserDocument(kind: UserDocumentKind, value: unknown): Record<string, unknown> {
  switch (kind) {
    case UserDocumentKind.SAVED_COLLECTIONS:
      return normalizeSavedCollections(value);
    case UserDocumentKind.RENTER_PREFERENCES:
      return normalizeRenterPreferences(value);
    case UserDocumentKind.FEED_SIGNALS:
      return normalizeFeedSignals(value);
  }
}

function normalizeSavedCollections(value: unknown) {
  const input = record(value);
  const seen = new Set<string>();
  const collections = (Array.isArray(input.collections) ? input.collections : []).flatMap((item) => {
    const collection = record(item);
    const id = text(collection.id, 200);
    const name = typeof collection.name === "string" ? cut(clean(collection.name).trim(), 60) : "";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const listingIds = ids(collection.listingIds, Number.POSITIVE_INFINITY);
    if (listingIds.length > SAVED_COLLECTION_LIMITS.listingsPerCollection) {
      throw new UserDocumentTooLargeError(`more than ${SAVED_COLLECTION_LIMITS.listingsPerCollection} homes in one list`);
    }
    return [{ id, name, listingIds }];
  });
  if (collections.length > SAVED_COLLECTION_LIMITS.collections) {
    throw new UserDocumentTooLargeError(`more than ${SAVED_COLLECTION_LIMITS.collections} lists`);
  }
  const notes = Object.entries(record(input.notes)).flatMap(([listingId, note]) => {
    const id = text(listingId, 100);
    const body = typeof note === "string" ? clean(note).trim() : "";
    if (body.length > SAVED_COLLECTION_LIMITS.noteLength) {
      throw new UserDocumentTooLargeError(`a note longer than ${SAVED_COLLECTION_LIMITS.noteLength} characters`);
    }
    return id && body ? [[id, body] as const] : [];
  });
  if (notes.length > SAVED_COLLECTION_LIMITS.notes) {
    throw new UserDocumentTooLargeError(`more than ${SAVED_COLLECTION_LIMITS.notes} notes`);
  }
  return { version: 1, collections, notes: Object.fromEntries(notes) };
}

function normalizeRenterPreferences(value: unknown) {
  const input = record(value);
  const moveIn = date(input.moveIn);
  const moveOut = moveIn ? date(input.moveOut) : "";
  return {
    destination: typeof input.destination === "string" ? cut(clean(input.destination).trim(), 80) : "",
    budgetMax: wholeNumber(input.budgetMax, 1_000_000),
    moveIn,
    moveOut: moveOut > moveIn ? moveOut : "",
    beds: wholeNumber(input.beds, 10),
    mustHave: ids(input.mustHave, 20).map((amenity) => cut(amenity, 20))
  };
}

function normalizeFeedSignals(value: unknown) {
  const input = record(value);
  const lastSearch = typeof input.lastSearch === "string" && input.lastSearch.startsWith("/search?") && input.lastSearch.length <= 2000
    ? clean(input.lastSearch)
    : "";
  return { viewedIds: ids(input.viewedIds, 30), lastSearch };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const trimmed = clean(value).trim();
  return trimmed.length <= maxLength ? trimmed : "";
}

/**
 * Postgres refuses JSON text holding a NUL character or half of a UTF-16 surrogate pair, so a document carrying one
 * would fail to save on every retry. NULs are dropped and an unpaired half becomes U+FFFD.
 */
function clean(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

/** Cuts text to `max` UTF-16 units without splitting an emoji or another surrogate pair. */
function cut(value: string, max: number) {
  if (value.length <= max) return value;
  return value.slice(0, /[\uD800-\uDBFF]/.test(value.charAt(max - 1)) ? max - 1 : max);
}

function ids(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 100)).filter(Boolean))].slice(0, max);
}

function date(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : "";
}

function wholeNumber(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : 0;
}
