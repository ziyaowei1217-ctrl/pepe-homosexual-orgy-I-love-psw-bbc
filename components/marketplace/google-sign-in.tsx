"use client";

import { useRef, useState } from "react";
import { startGoogleSignIn } from "@/lib/neon-auth-client";

export function GoogleSignIn({ returnTo, disabled = false }: { returnTo: string | null; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function signIn() {
    if (busy.current || disabled) return;
    busy.current = true; setPending(true); setError(null);
    try { await startGoogleSignIn(returnTo); }
    catch { setError("暂时无法登录。请检查网络并允许本站存储登录状态后重试。"); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="mt-6 max-w-md">
    <button type="button" disabled={pending || disabled} onClick={signIn} className="primary-action w-full disabled:opacity-60">{pending ? "正在连接…" : "使用 Google 登录"}</button>
    <p className="mt-3 text-m-footnote leading-5 text-ink-secondary">使用 Google 账户登录。账户与消息由服务器保存，可在不同设备上使用。</p>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-danger-text">{error}</p> : null}
  </div>;
}
