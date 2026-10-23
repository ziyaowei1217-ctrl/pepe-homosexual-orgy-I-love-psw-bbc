import type { ApiProfile, EmailCodeResponse } from "./api";
import type { OnboardingProfileInput } from "./profile-input";
import { toProductApiError } from "./product-errors";

export type ProfileField = "displayName" | "role" | "school" | "city";

export type PublishGateInput = {
  authenticated: boolean;
  profile: Partial<ApiProfile> | null;
};

export type PublishGateResult =
  | { status: "needs-auth"; message: string }
  | { status: "needs-profile"; message: string; missing: ProfileField[] }
  | { status: "needs-role"; message: string }
  | { status: "allowed"; message: "" };

export type ProfileLoadStatus = "idle" | "loading" | "loaded" | "error";

export type PublishAccessInput = PublishGateInput & {
  profileStatus: ProfileLoadStatus;
};

export type PublishAccessResult =
  | PublishGateResult
  | { status: "profile-loading"; message: string }
  | { status: "profile-error"; message: string };

type NewUserOnboardingInput = {
  isNewUser: boolean;
  profile: Partial<ApiProfile> | null;
};

export type LatestRequestGuard = {
  current: number;
};

type AuthActionLock = {
  current: boolean;
};

type EmailCodeRequestTransitionInput = {
  currentCode: string;
  response: EmailCodeResponse;
  succeededAt: number;
  isDevelopment: boolean;
};

export type EmailCodeRequestResult =
  | { status: "blocked" }
  | { status: "invalid-email"; error: string }
  | { status: "error"; error: string }
  | {
      status: "success";
      transition: {
        step: "code";
        sentEmail: string;
        expiresAt: string;
        resendAvailableAt: number;
        code: string;
      };
      hasDevelopmentCode: boolean;
    };

export type OnboardingProfileState = {
  draft: OnboardingProfileInput;
  error: string | null;
  dirtyFields?: ProfileField[];
};

type OnboardingProfileChange = {
  [Field in keyof OnboardingProfileInput]: {
    type: "change";
    field: Field;
    value: OnboardingProfileInput[Field];
  };
}[keyof OnboardingProfileInput];

export type OnboardingProfileAction =
  | OnboardingProfileChange
  | { type: "set-error"; error: string | null }
  | { type: "hydrate-profile"; profile: Partial<ApiProfile> | null };

const profileFields: ProfileField[] = ["displayName", "role", "school", "city"];
const validRoles = new Set<ApiProfile["role"]>(["renter", "lister", "both"]);

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidAuthEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthEmail(value));
}

export function normalizeVerificationCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function getResendSeconds(availableAt: number, now: number) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

export function getEmailCodeRequestTransition({
  currentCode: _currentCode,
  response,
  succeededAt,
  isDevelopment: _isDevelopment
}: EmailCodeRequestTransitionInput) {
  return {
    step: "code" as const,
    sentEmail: response.email,
    expiresAt: response.expiresAt,
    resendAvailableAt: succeededAt + 60_000,
    code: response.devCode ? normalizeVerificationCode(response.devCode) : ""
  };
}

export function getVerificationCodeStatus(
  code: string,
  expiresAt: string | null,
  now: number
) {
  const normalizedCode = normalizeVerificationCode(code);
  const expirationTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expired =
    expiresAt !== null &&
    (!Number.isFinite(expirationTime) || now >= expirationTime);
  const error = expired
    ? "验证码已过期，请重新发送。"
    : normalizedCode.length !== 6
      ? "请输入六位验证码。"
      : null;

  return {
    normalizedCode,
    expired,
    canSubmit: error === null,
    error
  };
}

export function acquireAuthActionLock(lock: AuthActionLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseAuthActionLock(lock: AuthActionLock) {
  lock.current = false;
}

export function getOnboardingProfileDraft(
  profile: Partial<ApiProfile> | null
): OnboardingProfileInput {
  return {
    displayName: profile?.displayName ?? "",
    school: profile?.school ?? "",
    city: profile?.city ?? "",
    role: profile?.role ?? "renter"
  };
}

export function getMissingProfileFields(profile: Partial<ApiProfile> | null): ProfileField[] {
  return profileFields.filter((field) => {
    const value = profile?.[field];

    if (field === "role") return !validRoles.has(value as ApiProfile["role"]);
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function isProfileComplete(profile: Partial<ApiProfile> | null) {
  return getMissingProfileFields(profile).length === 0;
}

export function getPublishGate(input: PublishGateInput): PublishGateResult {
  if (!input.authenticated) {
    return { status: "needs-auth", message: "请先登录后再发布房源。" };
  }

  const missing = getMissingProfileFields(input.profile);
  if (missing.length > 0) {
    return { status: "needs-profile", message: "请先完善资料后再发布房源。", missing };
  }

  if (input.profile?.role !== "lister" && input.profile?.role !== "both") {
    return { status: "needs-role", message: "请切换为房东身份后再发布房源。" };
  }

  return { status: "allowed", message: "" };
}

export function getPublishAccess(
  input: PublishAccessInput
): PublishAccessResult {
  if (!input.authenticated) return getPublishGate(input);

  if (input.profileStatus === "error") {
    return {
      status: "profile-error",
      message: "身份资料暂时无法读取，请稍后重试。"
    };
  }

  if (input.profileStatus !== "loaded") {
    return {
      status: "profile-loading",
      message: "正在读取身份资料。"
    };
  }

  return getPublishGate(input);
}

export function shouldOpenNewUserOnboarding(input: NewUserOnboardingInput) {
  return input.isNewUser && !isProfileComplete(input.profile);
}

export function shouldClearAuthSession(error: unknown) {
  return toProductApiError(error).category === "authentication";
}
