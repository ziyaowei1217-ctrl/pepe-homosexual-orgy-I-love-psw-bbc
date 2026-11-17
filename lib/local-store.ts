"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * JSON values this browser keeps for the renter (match preferences, feed signals). Reads go through `normalize`,
 * so a missing, blocked or malformed value reads as its empty state. Every open tab sees a write. While someone is
 * signed in, lib/account-documents.ts copies these values to their account.
 */
export const localStoreChangedEvent = "sublet:local-store-changed";
const changedEvent = localStoreChangedEvent;

export function useLocalStore<T>(key: string, normalize: (value: unknown) => T): T {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  return useMemo(() => normalize(parse(raw)), [normalize, raw]);
}

export function readLocalStore<T>(key: string, normalize: (value: unknown) => T): T {
  return normalize(parse(readRaw(key)));
}

export function writeLocalStore(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private sessions may deny storage; the page keeps working without it.
  }
  window.dispatchEvent(new Event(changedEvent));
}

export function removeLocalStore(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove when storage is blocked.
  }
  window.dispatchEvent(new Event(changedEvent));
}

function subscribe(onChange: () => void) {
  window.addEventListener(changedEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(changedEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
