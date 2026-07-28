import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthFlowPanel } from "../components/auth-flow-panel";
import { ProfileOnboarding } from "../components/profile-onboarding";
import {
  getCodeStepVisibleError,
  getVerificationCodeStatus,
  reduceOnboardingProfileState,
  runEmailCodeRequest
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
  it("enters the code step after a successful request", async () => {
    const request = vi.fn().mockResolvedValue({
      email: "maya@example.edu",
      expiresAt: "2026-07-29T01:10:00.000Z"
    });
    const pendingStates: boolean[] = [];

    const result = await runEmailCodeRequest(
      {
        email: " Maya@Example.edu ",
        currentCode: "",
        isDevelopment: false
      },
      {
        lock: { current: false },
        request,
        now: () => 1_000,
        onPendingChange: (pending) => pendingStates.push(pending)
      }
    );

    expect(request).toHaveBeenCalledWith("maya@example.edu");
    expect(pendingStates).toEqual([true, false]);
    expect(result).toEqual({
      status: "success",
      transition: {
        step: "code",
        sentEmail: "maya@example.edu",
        expiresAt: "2026-07-29T01:10:00.000Z",
        resendAvailableAt: 61_000,
        code: ""
      },
      hasDevelopmentCode: false
    });
  });

  it("blocks a repeated request while the first request is pending", async () => {
    let resolveRequest:
      | ((response: { email: string; expiresAt: string }) => void)
      | undefined;
    const request = vi.fn(
      () =>
        new Promise<{ email: string; expiresAt: string }>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const lock = { current: false };
    const dependencies = {
      lock,
      request,
      now: () => 1_000,
      onPendingChange: vi.fn()
    };

    const firstRequest = runEmailCodeRequest(
      {
        email: "maya@example.edu",
        currentCode: "",
        isDevelopment: false
      },
      dependencies
    );
    const repeatedRequest = await runEmailCodeRequest(
      {
        email: "maya@example.edu",
        currentCode: "",
        isDevelopment: false
      },
      dependencies
    );

    expect(repeatedRequest).toEqual({ status: "blocked" });
    expect(request).toHaveBeenCalledTimes(1);

    resolveRequest?.({
      email: "maya@example.edu",
      expiresAt: "2026-07-29T01:10:00.000Z"
    });
    await firstRequest;
  });

  it("starts a fresh 60-second cooldown at resend success and clears the old code", async () => {
    let completedAt = 1_000;
    const request = vi.fn(async () => {
      completedAt = 10_000;
      return {
        email: "maya@example.edu",
        expiresAt: "2026-07-29T01:12:00.000Z"
      };
    });

    const result = await runEmailCodeRequest(
      {
        email: "maya@example.edu",
        currentCode: "123456",
        isDevelopment: false
      },
      {
        lock: { current: false },
        request,
        now: () => completedAt,
        onPendingChange: vi.fn()
      }
    );

    expect(result).toMatchObject({
      status: "success",
      transition: {
        step: "code",
        resendAvailableAt: 70_000,
        code: ""
      }
    });
  });

  it("keeps a resend API error visible when the old code is expired", async () => {
    const result = await runEmailCodeRequest(
      {
        email: "maya@example.edu",
        currentCode: "123456",
        isDevelopment: false
      },
      {
        lock: { current: false },
        request: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
        now: () => Date.parse("2026-07-29T01:11:00.000Z"),
        onPendingChange: vi.fn()
      }
    );
    const verificationStatus = getVerificationCodeStatus(
      "123456",
      "2026-07-29T01:10:00.000Z",
      Date.parse("2026-07-29T01:11:00.000Z")
    );

    expect(result).toEqual({
      status: "error",
      error: "网络连接失败，请检查网络后重试。"
    });
    expect(
      getCodeStepVisibleError({
        localError: result.status === "error" ? result.error : null,
        apiError: null,
        verificationStatus
      })
    ).toBe("网络连接失败，请检查网络后重试。");
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
