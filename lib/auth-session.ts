import { isWebsiteDemo } from "./website-demo";

const authSessionKey = "sublet_auth_session";
const legacyTokenKey = "sublet_token";
const authSessionVersion = 1;
export const authSessionChangedEvent = "sublet-auth-session-changed";
// Private browsing and embedded webviews can deny storage. Keep this tab usable
// without making a failed logout restore a previously persisted credential.
let volatileSession: StoredAuthSession | null | undefined;

export type StoredAuthSession = {
  accessToken: string;
};

type StoredAuthSessionEnvelope = StoredAuthSession & {
  version: typeof authSessionVersion;
};

export function readStoredAuthSession(): StoredAuthSession | null {
  if (isWebsiteDemo()) return null;
  if (typeof window === "undefined") return null;

  if (volatileSession !== undefined) return volatileSession;

  try {
    const raw = window.localStorage.getItem(authSessionKey);
    if (!raw) {
      const legacyToken = window.localStorage.getItem(legacyTokenKey);
      return legacyToken ? { accessToken: legacyToken } : null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredAuthSessionEnvelope>;
    if (parsed.version !== authSessionVersion || typeof parsed.accessToken !== "string" || !parsed.accessToken) {
      return null;
    }

    return { accessToken: parsed.accessToken };
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(accessToken: string) {
  if (isWebsiteDemo()) return;
  if (typeof window === "undefined") return;

  const envelope: StoredAuthSessionEnvelope = {
    version: authSessionVersion,
    accessToken
  };
  try {
    window.localStorage.setItem(authSessionKey, JSON.stringify(envelope));
    window.localStorage.removeItem(legacyTokenKey);
    volatileSession = undefined;
  } catch {
    volatileSession = { accessToken };
  }
  window.dispatchEvent?.(new Event(authSessionChangedEvent));
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;

  volatileSession = null;
  try {
    window.localStorage.removeItem(authSessionKey);
    window.localStorage.removeItem(legacyTokenKey);
    volatileSession = undefined;
  } catch {
    // Fail closed in this tab even if the browser refuses to delete old storage.
  }
  window.dispatchEvent?.(new Event(authSessionChangedEvent));
}

export function assertCurrentAuthSession(token: string | null): asserts token is string {
  if (!token || readStoredAuthSession()?.accessToken !== token) {
    throw new Error("登录状态已改变，请重新登录后继续。");
  }
}
