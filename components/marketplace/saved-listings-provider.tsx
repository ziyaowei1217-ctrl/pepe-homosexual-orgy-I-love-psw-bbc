"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { getSessionUser } from "@/lib/api";
import { readStoredAuthSession } from "@/lib/auth-session";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import {
  addSavedCollection,
  getSavedCollectionsStorageKey,
  getSavedListingIds,
  mergeSavedCollectionsState,
  normalizeSavedCollectionsState,
  setSavedListingNote,
  toggleListingInCollection,
  type SavedCollectionsState
} from "@/lib/saved-collections";
import {
  getGuestUiStorageKey,
  getUserUiStorageKey,
  normalizeUserUiState
} from "@/lib/user-ui-state";

type SavedListingsContextValue = {
  state: SavedCollectionsState;
  savedIds: ReadonlySet<string>;
  hydrated: boolean;
  accountLabel: string;
  toggleSaved: (listingId: string) => void;
  toggleInCollection: (listingId: string, collectionId: string) => void;
  createCollection: (name: string) => void;
  setNote: (listingId: string, note: string) => void;
};

const SavedListingsContext = createContext<SavedListingsContextValue | null>(null);

export function SavedListingsProvider({ children }: { children: ReactNode }) {
  const token = useAuthSessionToken();
  return <SessionSavedListingsProvider key={token ?? "guest"} token={token}>{children}</SessionSavedListingsProvider>;
}

function SessionSavedListingsProvider({ children, token }: { children: ReactNode; token: string | null }) {
  const [state, setState] = useState(() => normalizeSavedCollectionsState(null));
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("此设备上的访客收藏");
  const guestMigration = useRef<{ raw: string | null; legacyRaw: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let userId: string | null = null;
      if (token) {
        try {
          const user = await getSessionUser(token);
          userId = user.id;
        } catch {
          userId = null;
        }
      }
      if (cancelled || (readStoredAuthSession()?.accessToken ?? null) !== token) return;

      const key = getSavedCollectionsStorageKey(userId);
      const legacyKey = userId ? getUserUiStorageKey(userId) : getGuestUiStorageKey();
      const legacyRaw = window.localStorage.getItem(legacyKey);
      const legacy = normalizeUserUiState(legacyRaw ? safelyParse(legacyRaw) : null);
      const raw = window.localStorage.getItem(key);
      let next = normalizeSavedCollectionsState(raw ? safelyParse(raw) : null, legacy.favoriteListingIds);

      if (userId) {
        const guestKey = getSavedCollectionsStorageKey(null);
        const guestRaw = window.localStorage.getItem(guestKey);
        const guestLegacyRaw = window.localStorage.getItem(getGuestUiStorageKey());
        const guestLegacy = normalizeUserUiState(guestLegacyRaw ? safelyParse(guestLegacyRaw) : null);
        const guest = normalizeSavedCollectionsState(
          guestRaw ? safelyParse(guestRaw) : null,
          guestLegacy.favoriteListingIds
        );
        next = mergeSavedCollectionsState(next, guest);
        guestMigration.current = { raw: guestRaw, legacyRaw: guestLegacyRaw };
        setAccountLabel("此设备上的账号收藏");
      } else {
        setAccountLabel("此设备上的访客收藏");
      }

      setState(next);
      setStorageKey(key);
    }

    void hydrate().catch(() => {
      if (!cancelled) setAccountLabel("设备存储暂不可用，请稍后重试");
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!storageKey || (readStoredAuthSession()?.accessToken ?? null) !== token) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      setAccountLabel("收藏暂存于当前页面，设备存储暂不可用");
      return;
    }
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    const migration = guestMigration.current;
    if (migration) {
      try {
        const guestKey = getSavedCollectionsStorageKey(null);
        if (migration.raw !== null && window.localStorage.getItem(guestKey) === migration.raw) {
          window.localStorage.removeItem(guestKey);
        }
        const legacyKey = getGuestUiStorageKey();
        if (migration.legacyRaw !== null && window.localStorage.getItem(legacyKey) === migration.legacyRaw) {
          const legacy = normalizeUserUiState(safelyParse(migration.legacyRaw));
          window.localStorage.setItem(legacyKey, JSON.stringify({ ...legacy, favoriteListingIds: [] }));
        }
        guestMigration.current = null;
      } catch {
        // The account copy is durable; retain the source for an idempotent retry.
      }
    }
    setAccountLabel(storageKey === getSavedCollectionsStorageKey(null) ? "此设备上的访客收藏" : "此设备上的账号收藏");
  }, [state, storageKey, token]);

  const savedIds = useMemo(() => new Set(getSavedListingIds(state)), [state]);

  const toggleSaved = useCallback((listingId: string) => {
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    setState((current) => {
      const isSaved = getSavedListingIds(current).includes(listingId);
      if (!isSaved) return toggleListingInCollection(current, listingId);

      return current.collections.reduce(
        (next, collection) => collection.listingIds.includes(listingId)
          ? toggleListingInCollection(next, listingId, collection.id)
          : next,
        current
      );
    });
  }, [token]);

  const toggleInCollection = useCallback((listingId: string, collectionId: string) => {
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    setState((current) => toggleListingInCollection(current, listingId, collectionId));
  }, [token]);

  const createCollection = useCallback((name: string) => {
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    setState((current) => addSavedCollection(current, name));
  }, [token]);

  const setNote = useCallback((listingId: string, note: string) => {
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    setState((current) => setSavedListingNote(current, listingId, note));
  }, [token]);

  const value = useMemo<SavedListingsContextValue>(() => ({
    state,
    savedIds,
    hydrated: Boolean(storageKey),
    accountLabel,
    toggleSaved,
    toggleInCollection,
    createCollection,
    setNote
  }), [accountLabel, createCollection, savedIds, setNote, state, storageKey, toggleInCollection, toggleSaved]);

  return <SavedListingsContext.Provider value={value}>{children}</SavedListingsContext.Provider>;
}

export function useSavedListings() {
  const value = useContext(SavedListingsContext);
  if (!value) throw new Error("useSavedListings must be used inside SavedListingsProvider");
  return value;
}

function safelyParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
