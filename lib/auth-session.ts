const authSessionKey = "sublet_auth_session";
const legacyTokenKey = "sublet_token";
const authSessionVersion = 1;
export const authSessionChangedEvent = "sublet-auth-session-changed";

export type StoredAuthSession = {
  accessToken: string;
};

type StoredAuthSessionEnvelope = StoredAuthSession & {
  version: typeof authSessionVersion;
};

export function readStoredAuthSession(): StoredAuthSession | null {
  if (typeof window === "undefined") return null;

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
  if (typeof window === "undefined") return;

  const envelope: StoredAuthSessionEnvelope = {
    version: authSessionVersion,
    accessToken
  };
  window.localStorage.setItem(authSessionKey, JSON.stringify(envelope));
  window.localStorage.removeItem(legacyTokenKey);
  window.dispatchEvent?.(new Event(authSessionChangedEvent));
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(authSessionKey);
  window.localStorage.removeItem(legacyTokenKey);
  window.dispatchEvent?.(new Event(authSessionChangedEvent));
}

/**
 * The account id in an application session token (its `sub` claim), read without checking the signature. It only
 * chooses which of this browser's stores to open; the API checks the token on every request.
 */
export function sessionUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const subject = typeof claims === "object" && claims !== null ? (claims as { sub?: unknown }).sub : undefined;
    return typeof subject === "string" && subject.trim() ? subject : null;
  } catch {
    return null;
  }
}

export function assertCurrentAuthSession(token: string | null): asserts token is string {
  if (!token || readStoredAuthSession()?.accessToken !== token) {
    throw new Error("登录状态已改变，请重新登录后继续。");
  }
}
