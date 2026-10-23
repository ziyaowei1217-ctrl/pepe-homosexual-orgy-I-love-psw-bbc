"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readStoredAuthSession, writeStoredAuthSession } from "@/lib/auth-session";
import { assertSignInAttemptCurrent, consumeSignInAttempt, discardSignInAttempt, exchangeGoogleSession, usesNeonAuth, type SignInAttempt } from "@/lib/neon-auth-client";

export function SignInCompletion({ failed = false }: { failed?: boolean }) {
  const [error, setError] = useState<string | null>(failed ? "登录未完成，请返回账户页面重试。" : null);
  const request = useRef<Promise<{ attempt: SignInAttempt; response: Awaited<ReturnType<typeof exchangeGoogleSession>> }> | null>(null);
  useEffect(() => {
    if (failed) { discardSignInAttempt(); return; }
    if (!usesNeonAuth()) { setError("此登录方式尚未开放。"); return; }
    let active = true;
    request.current ??= (async () => {
      const attempt = consumeSignInAttempt();
      return { attempt, response: await exchangeGoogleSession(attempt) };
    })();
    request.current.then(async ({ attempt, response }) => {
      if (!active) return;
      const previousToken = await assertSignInAttemptCurrent(attempt);
      if (!active) return;
      if ((readStoredAuthSession()?.accessToken ?? null) !== previousToken) throw new Error("账户已在其他页面改变，请重新登录。");
      writeStoredAuthSession(response.accessToken);
      window.location.replace(attempt.returnTo);
    }).catch(() => { if (active) setError("登录未完成。请返回账户页面重新尝试；若持续失败，请联系管理员。"); });
    return () => { active = false; };
  }, [failed]);
  return <main className="page-container py-16"><section className="mx-auto max-w-lg rounded-psw-xl bg-surface p-8">
    <h1 className="text-m-title">{error ? "请重新登录" : "正在完成登录"}</h1>
    {error ? <><p role="alert" className="mt-4 text-danger-text">{error}</p><Link href="/account" className="primary-action mt-6">返回账户</Link></> : <p role="status" className="mt-4 text-ink-secondary">正在安全连接你的 psw 账户…</p>}
  </section></main>;
}
