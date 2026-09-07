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

  const raw = window.localStorage.getItem(authSessionKey);
  if (!raw) {
    const legacyToken = window.localStorage.getItem(legacyTokenKey);
    return legacyToken ? { accessToken: legacyToken } : null;
  }

  try {
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

export function assertCurrentAuthSession(token: string | null): asserts token is string {
  if (!token || readStoredAuthSession()?.accessToken !== token) {
    throw new Error("登录状态已改变，请重新登录后继续。");
  }
}
