import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestEmailCode,
  verifyEmailCode,
  type ApiProfile,
  type SessionUser,
  type UpdateProfileInput,
  type VerifyEmailResponse
} from "@/lib/api";
import {
  acquireAuthActionLock,
  getCodeStepVisibleError,
  getResendSeconds,
  getVerificationCodeStatus,
  normalizeVerificationCode,
  releaseAuthActionLock,
  runEmailCodeRequest,
  type OnboardingReason
} from "@/lib/auth-flow";
import { buildProfileUpdateInput, type OnboardingProfileInput } from "@/lib/profile-input";
import { toProductApiError } from "@/lib/product-errors";

import { ProfileOnboarding } from "./profile-onboarding";

export type AuthFlowPanelProps = {
  token: string | null;
  user: SessionUser | null;
  profile: ApiProfile | null;
  apiError: string | null;
  onboardingReason: OnboardingReason | null;
  isPinnedToPublish: boolean;
  onAuthenticated: (response: VerifyEmailResponse) => void;
  onProfileSave: (draft: UpdateProfileInput) => Promise<ApiProfile | null>;
  onOnboardingDismiss: () => void;
  onLogout: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

type GuestAuthStep = "email" | "code";
type PendingAction = "request" | "verify" | "profile" | null;

export function AuthFlowPanel({
  token,
  user,
  profile,
  apiError,
  onboardingReason,
  isPinnedToPublish,
  onAuthenticated,
  onProfileSave,
  onOnboardingDismiss,
  onLogout,
  onClose,
  onToast
}: AuthFlowPanelProps) {
  const panelId = useId();
  const [step, setStep] = useState<GuestAuthStep>("email");
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [code, setCode] = useState("");
  const [showNeutralDevelopmentGuidance, setShowNeutralDevelopmentGuidance] =
    useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [profileDraft, setProfileDraft] = useState<UpdateProfileInput>(() =>
    profileToDraft(profile)
  );
  const authenticated = Boolean(token && user);

  useEffect(() => {
    setProfileDraft(profileToDraft(profile));
  }, [profile]);

  useEffect(() => {
    if (!authenticated) return;

    setStep("email");
    setEmail("");
    setSentEmail("");
    setCode("");
    setShowNeutralDevelopmentGuidance(false);
    setExpiresAt(null);
    setResendAvailableAt(0);
    setNow(Date.now());
    setLocalError(null);
  }, [authenticated]);

  useEffect(() => {
    if (step !== "code") return;

    const timer = globalThis.setInterval(() => setNow(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, [step]);

  async function sendCode(value: string) {
    setLocalError(null);
    const isDevelopment = process.env.NODE_ENV === "development";
    const result = await runEmailCodeRequest(
      {
        email: value,
        currentCode: code,
        isDevelopment
      },
      {
        lock: actionLock,
        request: requestEmailCode,
        now: () => Date.now(),
        onPendingChange: (pending) =>
          setPendingAction(pending ? "request" : null)
      }
    );

    if (result.status === "blocked") return;
    if (result.status === "invalid-email" || result.status === "error") {
      setLocalError(result.error);
      return;
    }

    const shouldShowNeutralDevelopmentGuidance =
      isDevelopment && !result.hasDevelopmentCode;
    setStep(result.transition.step);
    setSentEmail(result.transition.sentEmail);
    setExpiresAt(
      shouldShowNeutralDevelopmentGuidance ? null : result.transition.expiresAt
    );
    setResendAvailableAt(
      shouldShowNeutralDevelopmentGuidance
        ? 0
        : result.transition.resendAvailableAt
    );
    setCode(result.transition.code);
    setShowNeutralDevelopmentGuidance(
      shouldShowNeutralDevelopmentGuidance
    );
    setNow(result.transition.resendAvailableAt - 60_000);
    if (result.hasDevelopmentCode) {
      onToast("本地开发验证码已填入");
    } else if (!isDevelopment) {
      onToast("验证码已发送");
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode(email);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checkedAt = Date.now();
    const verificationStatus = getVerificationCodeStatus(code, expiresAt, checkedAt);
    setNow(checkedAt);
    if (verificationStatus.error) {
      setCode(verificationStatus.normalizedCode);
      setLocalError(verificationStatus.error);
      return;
    }
    if (!acquireAuthActionLock(actionLock)) return;

    setLocalError(null);
    setPendingAction("verify");
    try {
      const response = await verifyEmailCode(
        sentEmail,
        verificationStatus.normalizedCode
      );
      onAuthenticated(response);
      onToast(`已登录：${response.user.email}`);
    } catch (verifyError) {
      setLocalError(toProductApiError(verifyError).message);
    } finally {
      setPendingAction(null);
      releaseAuthActionLock(actionLock);
    }
  }

  function editEmail() {
    setEmail(sentEmail);
    setStep("email");
    setCode("");
    setShowNeutralDevelopmentGuidance(false);
    setExpiresAt(null);
    setResendAvailableAt(0);
    setLocalError(null);
  }

  async function saveProfile(draft: UpdateProfileInput) {
    if (!acquireAuthActionLock(actionLock)) return;
    setLocalError(null);
    setPendingAction("profile");
    try {
      const savedProfile = await onProfileSave(buildProfileUpdateInput(draft));
      if (!savedProfile) {
        setLocalError("资料保存失败，请稍后重试。");
        return;
      }
    } catch (saveError) {
      setLocalError(toProductApiError(saveError).message);
    } finally {
      setPendingAction(null);
      releaseAuthActionLock(actionLock);
    }
  }

  if (token && user && onboardingReason) {
    return (
      <ProfileOnboarding
        reason={onboardingReason}
        profile={profile}
        pending={pendingAction === "profile"}
        error={localError ?? apiError}
        onSave={(draft: OnboardingProfileInput) => saveProfile(draft)}
        onDismiss={onOnboardingDismiss}
      />
    );
  }

  if (token && user) {
    return (
      <AuthenticatedProfilePanel
        panelId={panelId}
        user={user}
        draft={profileDraft}
        pending={pendingAction === "profile"}
        error={localError ?? apiError}
        isPinnedToPublish={isPinnedToPublish}
        onDraftChange={setProfileDraft}
        onSave={() => saveProfile(profileDraft)}
        onLogout={onLogout}
        onClose={onClose}
      />
    );
  }

  const visibleError = localError ?? apiError;
  const resendSeconds = getResendSeconds(resendAvailableAt, now);
  const verificationStatus = getVerificationCodeStatus(code, expiresAt, now);
  const codeStepError = getCodeStepVisibleError({
    localError,
    apiError,
    verificationStatus
  });

  return (
    <section className="border-b border-border bg-background" aria-labelledby={`${panelId}-title`}>
      <div className="app-shell py-4">
        <div className="editorial-panel mx-auto max-w-2xl p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="editorial-kicker">01 / 账户</div>
              <h2 id={`${panelId}-title`} className="text-xl font-black text-primary">
                邮箱登录
              </h2>
            </div>
            {!isPinnedToPublish ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="关闭账户面板"
              >
                关闭
              </Button>
            ) : null}
          </div>

          {step === "email" ? (
            <form className="mt-5 grid gap-3" onSubmit={handleEmailSubmit} noValidate>
              <label
                htmlFor={`${panelId}-email`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                邮箱地址
                <Input
                  id={`${panelId}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="student@ucla.edu"
                  disabled={pendingAction !== null}
                />
              </label>
              {visibleError ? <AuthError message={visibleError} /> : null}
              <Button type="submit" variant="trust" disabled={pendingAction !== null}>
                {pendingAction === "request" ? "发送中…" : "发送验证码"}
              </Button>
            </form>
          ) : (
            <form className="mt-5 grid gap-3" onSubmit={handleCodeSubmit} noValidate>
              {showNeutralDevelopmentGuidance ? (
                <p className="text-sm font-semibold text-muted-foreground">
                  如果该邮箱具备测试资格，请输入收到的验证码；否则请联系测试管理员。
                </p>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">
                  验证码已发送至 <strong className="text-primary">{sentEmail}</strong>
                </p>
              )}
              <label
                htmlFor={`${panelId}-code`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                六位验证码
                <Input
                  id={`${panelId}-code`}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(normalizeVerificationCode(event.target.value))
                  }
                  maxLength={6}
                  disabled={pendingAction !== null}
                />
              </label>
              {expiresAt && !verificationStatus.expired ? (
                <p className="text-xs font-semibold text-muted-foreground">
                  请在验证码过期前完成验证。
                </p>
              ) : null}
              {codeStepError ? <AuthError message={codeStepError} /> : null}
              <Button
                type="submit"
                variant="trust"
                disabled={pendingAction !== null || !verificationStatus.canSubmit}
              >
                {pendingAction === "verify" ? "验证中…" : "验证并登录"}
              </Button>
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={editEmail}
                  disabled={pendingAction !== null}
                >
                  修改邮箱
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sendCode(sentEmail)}
                  disabled={
                    pendingAction !== null ||
                    (resendSeconds > 0 && !verificationStatus.expired)
                  }
                  aria-live="polite"
                >
                  {resendSeconds > 0 && !verificationStatus.expired
                    ? `${resendSeconds} 秒后重新发送`
                    : "重新发送"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm font-semibold text-destructive">
      {message}
    </p>
  );
}

type AuthenticatedProfilePanelProps = {
  panelId: string;
  user: SessionUser;
  draft: UpdateProfileInput;
  pending: boolean;
  error: string | null;
  isPinnedToPublish: boolean;
  onDraftChange: (draft: UpdateProfileInput) => void;
  onSave: () => void;
  onLogout: () => void;
  onClose: () => void;
};

function AuthenticatedProfilePanel({
  panelId,
  user,
  draft,
  pending,
  error,
  isPinnedToPublish,
  onDraftChange,
  onSave,
  onLogout,
  onClose
}: AuthenticatedProfilePanelProps) {
  function updateDraft(field: keyof UpdateProfileInput, value: string) {
    onDraftChange({
      ...draft,
      [field]: value
    });
  }

  return (
    <section className="border-b border-border bg-background" aria-labelledby={`${panelId}-title`}>
      <div className="app-shell py-4">
        <div className="editorial-panel p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="editorial-kicker">01 / 账户</div>
              <h2 id={`${panelId}-title`} className="text-xl font-black text-primary">
                账户与资料
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{user.email}</p>
            </div>
            {!isPinnedToPublish ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="关闭账户面板"
              >
                关闭
              </Button>
            ) : null}
          </div>

          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <ProfileField
                id={`${panelId}-display-name`}
                label="显示名称"
                name="displayName"
                autoComplete="name"
                value={draft.displayName ?? ""}
                onChange={(value) => updateDraft("displayName", value)}
              />
              <ProfileField
                id={`${panelId}-avatar-url`}
                label="头像链接"
                name="avatarUrl"
                type="url"
                value={draft.avatarUrl ?? ""}
                onChange={(value) => updateDraft("avatarUrl", value)}
              />
              <ProfileField
                id={`${panelId}-school`}
                label="学校"
                name="school"
                autoComplete="organization"
                value={draft.school ?? ""}
                onChange={(value) => updateDraft("school", value)}
              />
              <ProfileField
                id={`${panelId}-city`}
                label="城市"
                name="city"
                autoComplete="address-level2"
                value={draft.city ?? ""}
                onChange={(value) => updateDraft("city", value)}
              />
              <label
                htmlFor={`${panelId}-role`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                身份
                <select
                  id={`${panelId}-role`}
                  name="role"
                  className="h-11 rounded-[12px] border border-input bg-card px-3 text-sm font-medium normal-case text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={draft.role ?? "renter"}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      role: event.target.value as UpdateProfileInput["role"]
                    })
                  }
                >
                  <option value="renter">租客</option>
                  <option value="lister">房东</option>
                  <option value="both">租客兼房东</option>
                </select>
              </label>
              <ProfileField
                id={`${panelId}-wechat`}
                label="微信"
                name="wechat"
                value={draft.wechat ?? ""}
                onChange={(value) => updateDraft("wechat", value)}
              />
              <ProfileField
                id={`${panelId}-instagram`}
                label="Instagram"
                name="instagram"
                value={draft.instagram ?? ""}
                onChange={(value) => updateDraft("instagram", value)}
              />
              <label
                htmlFor={`${panelId}-bio`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground md:col-span-2"
              >
                个人简介
                <textarea
                  id={`${panelId}-bio`}
                  name="bio"
                  className="min-h-24 rounded-[12px] border border-input bg-card px-3 py-2 text-sm font-medium normal-case text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={draft.bio ?? ""}
                  onChange={(event) => updateDraft("bio", event.target.value)}
                />
              </label>
            </div>

            {error ? <AuthError message={error} /> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
                退出登录
              </Button>
              <Button type="submit" variant="trust" disabled={pending}>
                {pending ? "保存中…" : "保存资料"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

type ProfileFieldProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  type?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
};

function ProfileField({
  id,
  label,
  name,
  value,
  type = "text",
  autoComplete,
  onChange
}: ProfileFieldProps) {
  return (
    <label
      htmlFor={id}
      className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
    >
      {label}
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function profileToDraft(profile: ApiProfile | null): UpdateProfileInput {
  return {
    displayName: profile?.displayName ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    school: profile?.school ?? "",
    city: profile?.city ?? "",
    role: profile?.role ?? "renter",
    wechat: profile?.wechat ?? "",
    instagram: profile?.instagram ?? "",
    bio: profile?.bio ?? ""
  };
}
