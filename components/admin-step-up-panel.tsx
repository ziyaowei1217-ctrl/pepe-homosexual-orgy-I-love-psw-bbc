"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestAdminStepUpCode,
  verifyAdminStepUpCode
} from "@/lib/api";
import {
  getActiveAdminStepUpToken,
  type AdminStepUpSession
} from "@/lib/admin-step-up";
import { normalizeVerificationCode } from "@/lib/auth-flow";
import { toProductApiError } from "@/lib/product-errors";

export function AdminStepUpPanel({
  open,
  sessionToken,
  email,
  onVerified,
  onCancel,
  onAuthenticationError
}: {
  open: boolean;
  sessionToken: string;
  email: string;
  onVerified: (session: AdminStepUpSession) => void;
  onCancel: () => void;
  onAuthenticationError?: (error: unknown) => boolean;
}) {
  const panelId = useId();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep("request");
    setCode("");
    setExpiresAt(null);
    setPending(false);
    setError(null);
  }, [email, open, sessionToken]);

  if (!open) return null;

  async function sendCode() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await requestAdminStepUpCode(sessionToken);
      setExpiresAt(response.expiresAt);
      setCode(response.devCode ? normalizeVerificationCode(response.devCode) : "");
      setStep("verify");
    } catch (requestError) {
      const productError = toProductApiError(requestError);
      if (productError.status === 401 && onAuthenticationError?.(productError)) return;
      setError(productError.message);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = normalizeVerificationCode(code);
    if (normalizedCode.length !== 6) {
      setError("请输入六位验证码。");
      return;
    }
    const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isFinite(expiry) || Date.now() >= expiry) {
      setError("验证码已过期，请重新发送。");
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const session = await verifyAdminStepUpCode(sessionToken, normalizedCode);
      if (!getActiveAdminStepUpToken(session)) {
        setError("操作未完成，请稍后重试。");
        return;
      }
      onVerified(session);
    } catch (verifyError) {
      const productError = toProductApiError(verifyError);
      if (productError.status === 401 && onAuthenticationError?.(productError)) return;
      setError(productError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      aria-label="管理员二次验证"
      className="app-shell py-4"
    >
      <div className="editorial-panel mx-auto max-w-xl p-4 md:p-6">
        <div className="editorial-kicker">管理员安全验证</div>
        <h2 id={`${panelId}-title`} className="mt-2 text-xl font-black text-primary">
          再次验证管理员邮箱
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {email} · 验证后 30 分钟内可执行审核或资料变更。
        </p>

        {step === "request" ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" variant="trust" disabled={pending} onClick={() => void sendCode()}>
              {pending ? "发送中…" : "发送管理员验证码"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
              取消
            </Button>
          </div>
        ) : (
          <form className="mt-5 grid gap-3" onSubmit={verifyCode} noValidate>
            <label htmlFor={`${panelId}-code`} className="grid gap-1 text-xs font-black uppercase text-muted-foreground">
              六位管理员验证码
              <Input
                id={`${panelId}-code`}
                name="admin-step-up-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={6}
                disabled={pending}
                onChange={(event) => setCode(normalizeVerificationCode(event.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="trust" disabled={pending || code.length !== 6}>
                {pending ? "验证中…" : "完成管理员验证"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void sendCode()}>
                重新发送
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
                取消
              </Button>
            </div>
          </form>
        )}

        {error ? <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
