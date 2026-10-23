"use client";

import { apiPost, type SessionUser } from "./api";
import { getSafeAuthReturnTo } from "./app-routes";
import { readStoredAuthSession } from "./auth-session";
import type { VanillaBetterAuthClient } from "@neondatabase/auth";
import type { BetterAuthVanillaAdapterInstance } from "@neondatabase/auth/vanilla";

const attemptKey = "psw-sign-in-attempt";
export const SIGN_IN_ATTEMPT_TTL_MS = 10 * 60 * 1000;
export type SignInAttempt = { version: 1; id: string; createdAt: number; returnTo: string; sessionHash: string };
let clientPromise: Promise<VanillaBetterAuthClient> | undefined;
export const usesNeonAuth = () => process.env.NEXT_PUBLIC_AUTH_PROVIDER === "neon";

function getClient(): Promise<VanillaBetterAuthClient> {
  if (!usesNeonAuth() || typeof window === "undefined") throw new Error("登录服务尚未配置。");
  clientPromise ??= import("@neondatabase/auth").then(({ createAuthClient }) => createAuthClient<BetterAuthVanillaAdapterInstance>(`${window.location.origin}/api/auth`))
    .catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

export async function startGoogleSignIn(returnTo: string | null) {
  if (!usesNeonAuth() || typeof window === "undefined") throw new Error("登录服务尚未配置。");
  const previousToken = readStoredAuthSession()?.accessToken ?? null;
  const sessionHash = await fingerprint(previousToken);
  if ((readStoredAuthSession()?.accessToken ?? null) !== previousToken) throw new Error("账户已改变，请重新登录。");
  const destination = returnTo ? getSafeAuthReturnTo(returnTo) : "/account";
  if (destination.length > 2048) throw new Error("登录目标无效，请返回原页面重新登录。");
  const attempt: SignInAttempt = { version: 1, id: crypto.randomUUID(), createdAt: Date.now(), returnTo: destination, sessionHash };
  // The tab retains only a one-time intent and a hash, never a duplicate bearer token.
  // Check storage before leaving the page so a blocked browser does not lose the flow.
  window.sessionStorage.removeItem("psw-sign-in-return");
  window.sessionStorage.setItem(attemptKey, JSON.stringify(attempt));
  try {
    const client = await getClient();
    await assertSignInAttemptCurrent(attempt);
    if (JSON.parse(window.sessionStorage.getItem(attemptKey) ?? "null")?.id !== attempt.id) throw new Error("登录请求已改变，请重试。");
    const result = await client.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/api/auth/complete` });
    if (result.error) throw new Error("登录服务暂时无法连接，请稍后重试。");
  } catch (error) {
    try { if (JSON.parse(window.sessionStorage.getItem(attemptKey) ?? "null")?.id === attempt.id) window.sessionStorage.removeItem(attemptKey); } catch { /* Storage can become unavailable during navigation. */ }
    throw error;
  }
}

export async function exchangeGoogleSession(attempt: SignInAttempt) {
  await assertSignInAttemptCurrent(attempt);
  const result = await (await getClient()).token();
  if (result.error || !result.data?.token) throw new Error("登录未完成或已过期，请重新登录。");
  await assertSignInAttemptCurrent(attempt);
  const response = await apiPost<{ accessToken: string; user: SessionUser; isNewUser: boolean }>("/auth/neon/exchange", { token: result.data.token });
  await assertSignInAttemptCurrent(attempt);
  if (typeof response.accessToken !== "string" || !response.accessToken || response.accessToken.length > 8192) throw new Error("登录响应无效，请重新登录。");
  return response;
}

export function consumeSignInAttempt(): SignInAttempt {
  const raw = window.sessionStorage.getItem(attemptKey);
  window.sessionStorage.removeItem(attemptKey);
  if (!raw || raw.length > 4096) throw new Error("登录请求不存在或已过期，请重新登录。");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("登录请求无效。");
  const attempt = value as SignInAttempt;
  if (Object.keys(attempt).some(key => !["version", "id", "createdAt", "returnTo", "sessionHash"].includes(key)) || attempt.version !== 1 ||
      typeof attempt.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attempt.id) ||
      typeof attempt.sessionHash !== "string" || !/^[0-9a-f]{64}$/.test(attempt.sessionHash) ||
      typeof attempt.returnTo !== "string" || attempt.returnTo.length > 2048 || (attempt.returnTo !== "/account" && getSafeAuthReturnTo(attempt.returnTo) !== attempt.returnTo)) throw new Error("登录请求无效。");
  assertAttemptFresh(attempt);
  return attempt;
}

function assertAttemptFresh(attempt: SignInAttempt) {
  const now = Date.now();
  if (!attempt || !Number.isSafeInteger(attempt.createdAt) || attempt.createdAt > now || now - attempt.createdAt > SIGN_IN_ATTEMPT_TTL_MS) throw new Error("登录请求已过期，请重新登录。");
}

async function fingerprint(token: string | null) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(token)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function assertSignInAttemptCurrent(attempt: SignInAttempt) {
  assertAttemptFresh(attempt);
  const token = readStoredAuthSession()?.accessToken ?? null;
  const sessionHash = await fingerprint(token);
  assertAttemptFresh(attempt);
  if (sessionHash !== attempt.sessionHash || (readStoredAuthSession()?.accessToken ?? null) !== token) throw new Error("账户已在其他页面改变，请重新登录。");
  return token;
}

export function discardSignInAttempt() {
  try {
    window.sessionStorage.removeItem(attemptKey);
    window.sessionStorage.removeItem("psw-sign-in-return");
  } catch { /* Provider logout must still work if browser storage is unavailable. */ }
}

export async function endGoogleSession() {
  if (typeof window !== "undefined") discardSignInAttempt();
  if (!usesNeonAuth()) return;
  const result = await (await getClient()).signOut();
  if (result.error) throw new Error("退出未完成，请检查网络后重试。");
}
