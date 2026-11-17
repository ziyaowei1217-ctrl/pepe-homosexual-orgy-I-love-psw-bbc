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
    const name = typeof collection.name === "string" ? collection.name.trim().slice(0, 60) : "";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, listingIds: ids(collection.listingIds, 500) }];
  }).slice(0, 50);
  const notes = Object.fromEntries(
    Object.entries(record(input.notes))
      .flatMap(([listingId, note]) => {
        const id = text(listingId, 100);
        const body = typeof note === "string" ? note.trim().slice(0, 2000) : "";
        return id && body ? [[id, body] as const] : [];
      })
      .slice(0, 500)
  );
  return { version: 1, collections, notes };
}

function normalizeRenterPreferences(value: unknown) {
  const input = record(value);
  const moveIn = date(input.moveIn);
  const moveOut = moveIn ? date(input.moveOut) : "";
  return {
    destination: typeof input.destination === "string" ? input.destination.trim().slice(0, 80) : "",
    budgetMax: wholeNumber(input.budgetMax, 1_000_000),
    moveIn,
    moveOut: moveOut > moveIn ? moveOut : "",
    beds: wholeNumber(input.beds, 10),
    mustHave: ids(input.mustHave, 20).map((amenity) => amenity.slice(0, 20))
  };
}

function normalizeFeedSignals(value: unknown) {
  const input = record(value);
  const lastSearch = typeof input.lastSearch === "string" && input.lastSearch.startsWith("/search?") && input.lastSearch.length <= 2000
    ? input.lastSearch
    : "";
  return { viewedIds: ids(input.viewedIds, 30), lastSearch };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : "";
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
