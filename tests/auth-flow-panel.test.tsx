import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthFlowPanel } from "../components/auth-flow-panel";
import { ProfileOnboarding } from "../components/profile-onboarding";
import {
  acquireAuthActionLock,
  getEmailCodeRequestTransition,
  getVerificationCodeStatus,
  reduceOnboardingProfileState,
  releaseAuthActionLock
} from "../lib/auth-flow";

describe("progressive email auth UI", () => {
  it("renders the email step with an accessible email field", () => {
    const html = renderToStaticMarkup(
      <AuthFlowPanel
        token={null}
        user={null}
        profile={null}
        apiError={null}
        onboardingReason={null}
        isPinnedToPublish={false}
        onAuthenticated={vi.fn()}
        onProfileSave={vi.fn()}
        onOnboardingDismiss={vi.fn()}
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onToast={vi.fn()}
      />
    );

    expect(html).toContain("邮箱登录");
    expect(html).toContain('type="email"');
    expect(html).toContain("发送验证码");
  });

  it("renders the four required onboarding fields and skip action", () => {
    const html = renderToStaticMarkup(
      <ProfileOnboarding
        reason="new-user"
        profile={null}
        pending={false}
        error={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(html).toContain("显示名称");
    expect(html).toContain("身份");
    expect(html).toContain("学校");
    expect(html).toContain("城市");
    expect(html).toContain("稍后完善");
  });
});

describe("auth panel state transitions", () => {
  it("records the server email, expiry, and resend window after requesting a code", () => {
    expect(
      getEmailCodeRequestTransition({
        currentCode: "",
        response: {
          email: "maya@example.edu",
          expiresAt: "2026-07-29T01:10:00.000Z"
        },
        requestedAt: 1_000,
        isDevelopment: false
      })
    ).toEqual({
      sentEmail: "maya@example.edu",
      expiresAt: "2026-07-29T01:10:00.000Z",
      resendAvailableAt: 61_000,
      code: ""
    });
  });

  it("clears an old verification code after a successful production resend", () => {
    expect(
      getEmailCodeRequestTransition({
        currentCode: "123456",
        response: {
          email: "maya@example.edu",
          expiresAt: "2026-07-29T01:12:00.000Z"
        },
        requestedAt: 10_000,
        isDevelopment: false
      }).code
    ).toBe("");
  });

  it("blocks an expired verification code with a Chinese resend prompt", () => {
    expect(
      getVerificationCodeStatus(
        "123456",
        "2026-07-29T01:10:00.000Z",
        Date.parse("2026-07-29T01:10:00.000Z")
      )
    ).toEqual({
      normalizedCode: "123456",
      expired: true,
      canSubmit: false,
      error: "验证码已过期，请重新发送。"
    });
  });

  it("allows only one auth action to acquire the shared pending lock", () => {
    const lock = { current: false };

    expect(acquireAuthActionLock(lock)).toBe(true);
    expect(acquireAuthActionLock(lock)).toBe(false);

    releaseAuthActionLock(lock);
    expect(acquireAuthActionLock(lock)).toBe(true);
  });

  it("retains the onboarding draft when saving fails", () => {
    const draft = {
      displayName: "Maya Chen",
      role: "lister" as const,
      school: "UCLA",
      city: "Los Angeles"
    };

    const next = reduceOnboardingProfileState(
      { draft, error: null },
      { type: "set-error", error: "资料保存失败，请稍后重试。" }
    );

    expect(next.draft).toBe(draft);
    expect(next.error).toBe("资料保存失败，请稍后重试。");
  });
});
