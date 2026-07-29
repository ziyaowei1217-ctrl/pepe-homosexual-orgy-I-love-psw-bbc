import { renderToStaticMarkup } from "react-dom/server";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { AuthFlowPanel } from "../components/auth-flow-panel";
import { ProfileOnboarding } from "../components/profile-onboarding";
import {
  getCodeStepVisibleError,
  getVerificationCodeStatus,
  reduceOnboardingProfileState,
  runEmailCodeRequest
} from "../lib/auth-flow";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn()
  };
});

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

describe("AuthFlowPanel interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T01:00:00.000Z"));
    vi.clearAllMocks();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests once while pending, enters the code step, and verifies the code", async () => {
    const emailCodeRequest = deferred<{
      email: string;
      expiresAt: string;
    }>();
    vi.mocked(api.requestEmailCode).mockReturnValue(emailCodeRequest.promise);
    const verificationResponse = {
      accessToken: "token-1",
      user: {
        id: "user-1",
        email: "maya@example.edu",
        role: "renter"
      },
      isNewUser: true
    };
    vi.mocked(api.verifyEmailCode).mockResolvedValue(verificationResponse);
    const onAuthenticated = vi.fn();
    const renderer = await renderAuthPanel({ onAuthenticated });

    changeInput(renderer.root, "email", " Maya@Example.edu ");
    const emailForm = renderer.root.findByType("form");
    let firstSubmit: Promise<void> | undefined;
    let repeatedSubmit: Promise<void> | undefined;
    act(() => {
      firstSubmit = emailForm.props.onSubmit(submitEvent());
      repeatedSubmit = emailForm.props.onSubmit(submitEvent());
    });
    await flushMicrotasks();

    expect(api.requestEmailCode).toHaveBeenCalledTimes(1);
    expect(api.requestEmailCode).toHaveBeenCalledWith("maya@example.edu");
    expect(findButton(renderer.root, "发送中…").props.disabled).toBe(true);

    await act(async () => {
      emailCodeRequest.resolve({
        email: "maya@example.edu",
        expiresAt: "2026-07-29T01:05:00.000Z"
      });
      await Promise.all([firstSubmit, repeatedSubmit]);
    });

    expect(renderer.root.findByProps({ name: "code" })).toBeDefined();
    expect(renderedText(renderer.root)).toContain(
      "验证码已发送至 maya@example.edu"
    );

    changeInput(renderer.root, "code", "12a3456");
    const verifyButton = findButton(renderer.root, "验证并登录");
    expect(verifyButton.props.disabled).toBe(false);
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit(submitEvent());
    });

    expect(api.verifyEmailCode).toHaveBeenCalledWith(
      "maya@example.edu",
      "123456"
    );
    expect(onAuthenticated).toHaveBeenCalledWith(verificationResponse);
    await unmountRenderer(renderer);
  });

  it("returns to a clean email step when a mounted authenticated panel logs out", async () => {
    vi.mocked(api.requestEmailCode).mockResolvedValueOnce({
      email: "maya@example.edu",
      expiresAt: "2026-07-29T01:05:00.000Z",
      devCode: "123456"
    });
    const verificationResponse = {
      accessToken: "token-1",
      user: {
        id: "user-1",
        email: "maya@example.edu",
        role: "USER"
      },
      isNewUser: false
    };
    vi.mocked(api.verifyEmailCode).mockResolvedValueOnce(verificationResponse);
    const props = authPanelProps({ isPinnedToPublish: true });
    const renderer = await renderAuthPanel(props);

    changeInput(renderer.root, "email", "maya@example.edu");
    await submitCurrentForm(renderer);
    changeInput(renderer.root, "code", "123456");
    expect(findInput(renderer.root, "code").props.value).toBe("123456");
    expect(renderedText(renderer.root)).toContain("maya@example.edu");
    expect(renderedText(renderer.root)).toContain("60 秒后重新发送");

    await submitCurrentForm(renderer);
    await act(async () => {
      renderer.update(
        <AuthFlowPanel
          {...props}
          token={verificationResponse.accessToken}
          user={verificationResponse.user}
        />
      );
    });
    expect(renderedText(renderer.root)).toContain("账户与资料");

    await act(async () => {
      renderer.update(<AuthFlowPanel {...props} token={null} user={null} />);
    });

    expect(findInput(renderer.root, "email").props.value).toBe("");
    expect(renderer.root.findAllByProps({ name: "code" })).toHaveLength(0);
    expect(renderedText(renderer.root)).not.toContain("maya@example.edu");
    expect(renderedText(renderer.root)).not.toContain("重新发送");
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    await unmountRenderer(renderer);
  });

  it("clears the code and starts a new 60-second cooldown when resend succeeds", async () => {
    vi.mocked(api.requestEmailCode).mockResolvedValueOnce({
      email: "maya@example.edu",
      expiresAt: "2026-07-29T01:05:00.000Z"
    });
    const renderer = await renderAuthPanel();
    changeInput(renderer.root, "email", "maya@example.edu");
    await submitCurrentForm(renderer);
    changeInput(renderer.root, "code", "123456");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const resendRequest = deferred<{
      email: string;
      expiresAt: string;
    }>();
    vi.mocked(api.requestEmailCode).mockReturnValueOnce(resendRequest.promise);
    act(() => {
      findButton(renderer.root, "重新发送").props.onClick();
    });
    await flushMicrotasks();
    expect(api.requestEmailCode).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      resendRequest.resolve({
        email: "maya@example.edu",
        expiresAt: "2026-07-29T01:10:00.000Z"
      });
      await Promise.resolve();
    });

    expect(findInput(renderer.root, "code").props.value).toBe("");
    expect(findButton(renderer.root, "60 秒后重新发送").props.disabled).toBe(
      true
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(findButton(renderer.root, "重新发送").props.disabled).toBe(false);
    await unmountRenderer(renderer);
  });

  it("disables expired verification and shows a resend failure instead of the expiry prompt", async () => {
    vi.mocked(api.requestEmailCode).mockResolvedValueOnce({
      email: "maya@example.edu",
      expiresAt: "2026-07-29T01:00:02.000Z"
    });
    const renderer = await renderAuthPanel();
    changeInput(renderer.root, "email", "maya@example.edu");
    await submitCurrentForm(renderer);
    changeInput(renderer.root, "code", "123456");

    expect(findButton(renderer.root, "验证并登录").props.disabled).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(findButton(renderer.root, "验证并登录").props.disabled).toBe(true);
    expect(renderedText(renderer.root.findByProps({ role: "alert" }))).toBe(
      "验证码已过期，请重新发送。"
    );
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit(submitEvent());
    });
    expect(api.verifyEmailCode).not.toHaveBeenCalled();

    vi.mocked(api.requestEmailCode).mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );
    await act(async () => {
      findButton(renderer.root, "重新发送").props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderedText(renderer.root.findByProps({ role: "alert" }))).toBe(
      "网络连接失败，请检查网络后重试。"
    );
    await unmountRenderer(renderer);
  });

  it("leaves successful profile-save feedback to the parent callback", async () => {
    const onProfileSave = vi.fn().mockResolvedValue({ id: "profile-1" });
    const onToast = vi.fn();
    const renderer = await renderAuthPanel({
      token: "token-1",
      user: { id: "user-1", email: "maya@example.edu", role: "USER" },
      onboardingReason: "new-user",
      onProfileSave,
      onToast
    });

    changeInput(renderer.root, "displayName", "Maya Chen");
    changeInput(renderer.root, "school", "UCLA");
    changeInput(renderer.root, "city", "Los Angeles");
    act(() => {
      renderer.root.findByType("select").props.onChange({
        target: { value: "lister" }
      });
    });
    await submitCurrentForm(renderer);

    expect(onProfileSave).toHaveBeenCalledWith({
      displayName: "Maya Chen",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    });
    expect(onToast).not.toHaveBeenCalled();
    await unmountRenderer(renderer);
  });

  it("retains edited onboarding fields after save rejects", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <ProfileOnboarding
          reason="new-user"
          profile={null}
          pending={false}
          error={null}
          onSave={onSave}
          onDismiss={vi.fn()}
        />
      );
    });
    const mounted = requireRenderer(renderer);

    changeInput(mounted.root, "displayName", "  Maya Chen ");
    changeInput(mounted.root, "school", " UCLA ");
    changeInput(mounted.root, "city", " Los Angeles ");
    act(() => {
      mounted.root.findByType("select").props.onChange({
        target: { value: "lister" }
      });
    });
    await act(async () => {
      await mounted.root.findByType("form").props.onSubmit(submitEvent());
    });

    expect(onSave).toHaveBeenCalledWith({
      displayName: "Maya Chen",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    });
    expect(findInput(mounted.root, "displayName").props.value).toBe(
      "  Maya Chen "
    );
    expect(findInput(mounted.root, "school").props.value).toBe(" UCLA ");
    expect(findInput(mounted.root, "city").props.value).toBe(" Los Angeles ");
    expect(mounted.root.findByType("select").props.value).toBe("lister");
    expect(renderedText(mounted.root.findByProps({ role: "alert" }))).toBe(
      "网络连接失败，请检查网络后重试。"
    );
    await unmountRenderer(mounted);
  });
});

async function renderAuthPanel(
  overrides: Partial<React.ComponentProps<typeof AuthFlowPanel>> = {}
) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <AuthFlowPanel {...authPanelProps(overrides)} />
    );
  });
  return requireRenderer(renderer);
}

function authPanelProps(
  overrides: Partial<React.ComponentProps<typeof AuthFlowPanel>> = {}
): React.ComponentProps<typeof AuthFlowPanel> {
  return {
    token: null,
    user: null,
    profile: null,
    apiError: null,
    onboardingReason: null,
    isPinnedToPublish: false,
    onAuthenticated: vi.fn(),
    onProfileSave: vi.fn(),
    onOnboardingDismiss: vi.fn(),
    onLogout: vi.fn(),
    onClose: vi.fn(),
    onToast: vi.fn(),
    ...overrides
  };
}

async function submitCurrentForm(renderer: ReactTestRenderer) {
  await act(async () => {
    await renderer.root.findByType("form").props.onSubmit(submitEvent());
  });
}

function changeInput(
  root: ReactTestInstance,
  name: string,
  value: string
) {
  act(() => {
    findInput(root, name).props.onChange({ target: { value } });
  });
}

function findInput(root: ReactTestInstance, name: string) {
  const input = root
    .findAllByType("input")
    .find((candidate) => candidate.props.name === name);
  if (!input) throw new Error(`Input not found: ${name}`);
  return input;
}

function findButton(root: ReactTestInstance, label: string) {
  const button = root
    .findAllByType("button")
    .find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function renderedText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : renderedText(child)
    )
    .join("");
}

function submitEvent() {
  return { preventDefault: vi.fn() };
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error("Deferred promise is unavailable");
      resolvePromise(value);
    }
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function requireRenderer(
  renderer: ReactTestRenderer | undefined
): ReactTestRenderer {
  if (!renderer) throw new Error("Renderer was not created");
  return renderer;
}

async function unmountRenderer(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}
