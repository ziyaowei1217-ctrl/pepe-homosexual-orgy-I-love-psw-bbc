"use client";

import { useCallback, useEffect, useState } from "react";

import { getMyProfile, getSessionUser } from "./api";
import type { ApiProfile, SessionUser } from "./api";
import { readStoredAuthSession } from "./auth-session";
import { useAuthSessionToken } from "./use-auth-session-token";

type SessionState = {
  token: string | null;
  user: SessionUser | null;
  profile: ApiProfile | null;
  loading: boolean;
  error: string | null;
};

function emptySession(token: string | null): SessionState {
  return { token, user: null, profile: null, loading: Boolean(token), error: null };
}

export function useMarketplaceSession() {
  const token = useAuthSessionToken();
  const [state, setState] = useState<SessionState>(() => emptySession(token));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const reload = useCallback(() => {
    if (readStoredAuthSession()?.accessToken !== token) return;
    setState(emptySession(token));
    setLoadAttempt((attempt) => attempt + 1);
  }, [token]);

  useEffect(() => {
    setState(emptySession(token));
    if (!token) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    Promise.all([getSessionUser(token), getMyProfile(token)])
      .then(([nextUser, nextProfile]) => {
        if (!isCurrent()) return;
        setState({ token, user: nextUser, profile: nextProfile, loading: false, error: null });
      })
      .catch((caught) => {
        if (!isCurrent()) return;
        setState({ ...emptySession(token), loading: false, error: caught instanceof Error ? caught.message : "账户信息暂时无法加载。" });
      });
    return () => { cancelled = true; };
  }, [token, loadAttempt]);

  return { ...(state.token === token ? state : emptySession(token)), reload };
}
