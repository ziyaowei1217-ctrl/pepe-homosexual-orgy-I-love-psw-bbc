"use client";

import { useSyncExternalStore } from "react";

import { authSessionChangedEvent, readStoredAuthSession } from "./auth-session";

function readToken() {
  return readStoredAuthSession()?.accessToken ?? null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(authSessionChangedEvent, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener(authSessionChangedEvent, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

function serverToken() {
  return null;
}

export function useAuthSessionToken(): string | null {
  return useSyncExternalStore(subscribe, readToken, serverToken);
}
