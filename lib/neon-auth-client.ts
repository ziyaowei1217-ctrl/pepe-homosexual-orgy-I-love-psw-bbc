"use client";

import { apiPost, type SessionUser } from "./api";
import { getSafeAuthReturnTo } from "./app-routes";
import { readStoredAuthSession } from "./auth-session";
import { ProductApiError } from "./product-errors";
import type { VanillaBetterAuthClient } from "@neondatabase/auth";
import type { BetterAuthVanillaAdapterInstance } from "@neondatabase/auth/vanilla";

const attemptKey = "psw-sign-in-attempt";
export const SIGN_IN_ATTEMPT_TTL_MS = 10 * 60 * 1000;
export type SignInAttempt = { version: 1; id: string; createdAt: number; returnTo: string; sessionHash: string };
let clientPromise: Promise<VanillaBetterAuthClient> | undefined;
export const usesNeonAuth = () => process.env.NEXT_PUBLIC_AUTH_PROVIDER === "neon";
export const PROVIDER_TOKEN_TIMEOUT_MS = 15_000;

const signInErrors = {
  attempt: "登录请求已过期或无法读取。请返回账户页面，在同一浏览器标签页重新登录。",
  changed: "账户已在其他页面改变，请返回账户页面重新登录。",
  provider: "Google 登录会话未能确认。请返回账户页面重新登录。",
  network: "网络连接失败，请检查网络后返回账户页面重试。",
  service: "登录服务暂时无法连接，请稍后返回账户页面重试。"
} as const;
class SignInError extends Error {
  constructor(readonly code: keyof typeof signInErrors) { super(signInErrors[code]); }
}
export function signInFailureMessage(error: unknown) {
  if (error instanceof SignInError) return `${error.message}（${error.code}）`;
  if (error instanceof ProductApiError) {
    if (error.status === 401 || error.status === 403) return "psw 账户验证未能完成，请返回账户页面重新登录。（account）";
    const code = error.category === "network" ? "network" : "service";
    return `${signInErrors[code]}（${code}）`;
  }
  return "登录未完成，请返回账户页面重新尝试。（completion）";
}

async function freshProviderToken() {
  if (!usesNeonAuth() || typeof window === "undefined") throw new SignInError("service");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TOKEN_TIMEOUT_MS);
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  try {
    // SDK 0.7's /token hook can return its cached get-session object. Always
    // obtain the JWT from our fixed, first-party, cookie-authenticated proxy.
    response = await fetch(`${window.location.origin}/api/auth/token`, {
      credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: controller.signal
    });
    if (!response.ok) throw new SignInError(response.status === 401 || response.status === 403 ? "provider" : "service");
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") ?? 0) > 16_384) throw new SignInError("provider");
    reader = response.body?.getReader();
    if (!reader) throw new SignInError("provider");
    controller.signal.addEventListener("abort", cancel, { once: true });
    let body = "";
    let bytes = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (true) {
      if (controller.signal.aborted) throw new SignInError("service");
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw new SignInError("service");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) { await reader.cancel(); throw new SignInError("provider"); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const data: unknown = JSON.parse(body);
    const token = data && typeof data === "object" && "token" in data ? data.token : null;
    if (typeof token !== "string" || !token || token.length > 8192) throw new SignInError("provider");
    return token;
  } catch (error) {
    if (error instanceof SignInError) throw error;
    throw new SignInError(controller.signal.aborted ? "service" : error instanceof TypeError ? "network" : "provider");
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", cancel);
    if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
    else { void response?.body?.cancel().catch(() => undefined); }
  }
}

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
  const token = await freshProviderToken();
  await assertSignInAttemptCurrent(attempt);
  const response = await apiPost<{ accessToken: string; user: SessionUser; isNewUser: boolean }>("/auth/neon/exchange", { token });
  await assertSignInAttemptCurrent(attempt);
  if (typeof response.accessToken !== "string" || !response.accessToken || response.accessToken.length > 8192) throw new Error("登录响应无效，请重新登录。");
  return response;
}

export function consumeSignInAttempt(): SignInAttempt {
  try { return consumeStoredSignInAttempt(); }
  catch { throw new SignInError("attempt"); }
}

function consumeStoredSignInAttempt(): SignInAttempt {
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
  if (!attempt || !Number.isSafeInteger(attempt.createdAt) || attempt.createdAt > now || now - attempt.createdAt > SIGN_IN_ATTEMPT_TTL_MS) throw new SignInError("attempt");
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
  if (sessionHash !== attempt.sessionHash || (readStoredAuthSession()?.accessToken ?? null) !== token) throw new SignInError("changed");
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
