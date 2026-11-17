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

import {
  AccountDocumentSync,
  feedSignalsAdapter,
  releaseDeviceDocuments,
  renterPreferencesAdapter,
  savedCollectionsAdapter,
  type AccountSyncStatus
} from "@/lib/account-documents";
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

/** "device": a guest's saves, kept in this browser only. The others describe copying a signed-in renter's saves to the account. */
export type SavedListingsSyncStatus = "device" | AccountSyncStatus;

const guestLabel = "访客收藏只保存在这台设备上，登录后保存到账户";
const syncLabels: Record<AccountSyncStatus, string> = {
  syncing: "收藏会保存到账户，换设备登录也能看到",
  synced: "收藏已保存到账户，换设备登录也能看到",
  offline: "收藏先保存在这台设备上，联网后同步到账户"
};

type SavedListingsContextValue = {
  state: SavedCollectionsState;
  savedIds: ReadonlySet<string>;
  hydrated: boolean;
  accountLabel: string;
  syncStatus: SavedListingsSyncStatus;
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
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SavedListingsSyncStatus>("device");
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const guestMigration = useRef<{ raw: string | null; legacyRaw: string | null } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sync = useRef<AccountDocumentSync | null>(null);

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
      } else if (!token) {
        // Nobody is signed in: preferences and feed signals copied from an account leave this browser.
        releaseDeviceDocuments(null);
      }

      setState(next);
      setStorageKey(key);
      setAccountUserId(userId);
    }

    void hydrate().catch(() => {
      if (!cancelled) setStorageProblem("设备存储暂不可用，请稍后重试");
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
      setStorageProblem("收藏暂存于当前页面，设备存储暂不可用");
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
    setStorageProblem(null);
    sync.current?.localChanged("saved-collections");
  }, [state, storageKey, token]);

  // Another tab changed this account's saves: show the same list here, so neither tab sends an older copy.
  useEffect(() => {
    if (!storageKey) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) return;
      const next = normalizeSavedCollectionsState(safelyParse(event.newValue));
      if (JSON.stringify(next) !== JSON.stringify(stateRef.current)) setState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  // Signed in: copy saves, match preferences and feed signals to the account and keep them in step.
  useEffect(() => {
    if (!token || !accountUserId || !storageKey) return;
    releaseDeviceDocuments(accountUserId);
    const engine = new AccountDocumentSync(token, accountUserId, [
      savedCollectionsAdapter(() => stateRef.current, (value) => {
        stateRef.current = value;
        setState(value);
      }),
      renterPreferencesAdapter,
      feedSignalsAdapter
    ], setSyncStatus);
    sync.current = engine;
    void engine.start();
    return () => {
      engine.stop();
      if (sync.current === engine) sync.current = null;
    };
  }, [accountUserId, storageKey, token]);

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

  const accountLabel = storageProblem ?? (accountUserId ? syncLabels[syncStatus === "device" ? "syncing" : syncStatus] : guestLabel);
  const value = useMemo<SavedListingsContextValue>(() => ({
    state,
    savedIds,
    hydrated: Boolean(storageKey),
    accountLabel,
    syncStatus: accountUserId ? syncStatus : "device",
    toggleSaved,
    toggleInCollection,
    createCollection,
    setNote
  }), [accountLabel, accountUserId, createCollection, savedIds, setNote, state, storageKey, syncStatus, toggleInCollection, toggleSaved]);

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
