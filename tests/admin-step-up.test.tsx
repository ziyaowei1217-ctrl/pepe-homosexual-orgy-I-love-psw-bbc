import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { AdminStepUpPanel } from "../components/admin-step-up-panel";
import {
  clearStoredAdminStepUpSession,
  getActiveAdminStepUpToken,
  readStoredAdminStepUpSession,
  writeStoredAdminStepUpSession
} from "../lib/admin-step-up";
import { ProductApiError } from "../lib/product-errors";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    requestAdminStepUpCode: vi.fn(),
    verifyAdminStepUpCode: vi.fn()
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("administrator step-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an enhanced token only before its server expiry", () => {
    const session = {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    };

    expect(
      getActiveAdminStepUpToken(
        session,
        Date.parse("2026-08-12T08:00:00.000Z")
      )
    ).toBe("enhanced");
    expect(
      getActiveAdminStepUpToken(
        session,
        Date.parse("2026-08-12T08:30:00.000Z")
      )
    ).toBeNull();
  });

  it("fails closed when a session lacks a usable token or expiry", () => {
    const now = Date.parse("2026-08-12T08:00:00.000Z");

    expect(getActiveAdminStepUpToken(null, now)).toBeNull();
    expect(
      getActiveAdminStepUpToken(
        {
          accessToken: "",
          reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
        },
        now
      )
    ).toBeNull();
    expect(
      getActiveAdminStepUpToken(
        {
          accessToken: "enhanced",
          reauthenticatedUntil: "not-an-expiry"
        },
        now
      )
    ).toBeNull();
  });

  it("restores an unexpired enhanced session only for the same administrator", () => {
    const storage = new MemoryStorage();
    const session = {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    };

    writeStoredAdminStepUpSession(storage, { id: "admin-1", email: "admin@example.com" }, session);

    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-1", email: "admin@example.com" },
      Date.parse("2026-08-12T08:05:00.000Z")
    )).toEqual(session);
    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-2", email: "other@example.com" },
      Date.parse("2026-08-12T08:05:00.000Z")
    )).toBeNull();
  });

  it("removes an expired enhanced session from tab storage", () => {
    const storage = new MemoryStorage();
    writeStoredAdminStepUpSession(storage, { id: "admin-1", email: "admin@example.com" }, {
      accessToken: "enhanced",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    });

    expect(readStoredAdminStepUpSession(
      storage,
      { id: "admin-1", email: "admin@example.com" },
      Date.parse("2026-08-12T08:30:00.000Z")
    )).toBeNull();
    clearStoredAdminStepUpSession(storage);
    expect(storage.length).toBe(0);
  });

  it("hands a verified memory-only enhanced session to the administrator workspace", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockResolvedValue({
      email: "admin@example.com",
      expiresAt: "2026-08-12T08:10:00.000Z",
      devCode: "246810"
    });
    vi.mocked(api.verifyAdminStepUpCode).mockResolvedValue({
      accessToken: "enhanced-token",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    });
    const onVerified = vi.fn();
    const renderer = await renderPanel(onVerified);

    await act(async () => {
      findButton(renderer.root, "发送管理员验证码").props.onClick();
      await flushMicrotasks();
    });

    expect(findInput(renderer.root, "admin-step-up-code").props.value).toBe(
      "246810"
    );

    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn()
      });
    });

    expect(api.verifyAdminStepUpCode).toHaveBeenCalledWith(
      "ordinary-token",
      "246810"
    );
    expect(onVerified).toHaveBeenCalledWith({
      accessToken: "enhanced-token",
      reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
    });
    await unmount(renderer);
  });

  it.each([
    [
      "empty enhanced token",
      { accessToken: "", reauthenticatedUntil: "2026-08-12T08:30:00.000Z" }
    ],
    [
      "malformed enhanced-session expiry",
      { accessToken: "enhanced-token", reauthenticatedUntil: "not-an-expiry" }
    ],
    [
      "past enhanced-session expiry",
      { accessToken: "enhanced-token", reauthenticatedUntil: "2026-08-12T08:00:00.000Z" }
    ]
  ] as const)(
    "does not accept a verified response with %s",
    async (_caseName, invalidSession) => {
      vi.mocked(api.requestAdminStepUpCode).mockResolvedValue({
        email: "admin@example.com",
        expiresAt: "2026-08-12T08:10:00.000Z",
        devCode: "246810"
      });
      vi.mocked(api.verifyAdminStepUpCode).mockResolvedValue(invalidSession);
      const onVerified = vi.fn();
      const renderer = await renderPanel(onVerified);

      await requestAndSubmitCode(renderer);

      expect(onVerified).not.toHaveBeenCalled();
      expect(
        renderer.root.findByProps({ "aria-label": "管理员二次验证" })
      ).toBeDefined();
      expect(findAlert(renderer.root).children.join("")).toBe(
        "操作未完成，请稍后重试。"
      );
      await unmount(renderer);
    }
  );

  it("does not verify a development code when the response expiry is malformed", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockResolvedValue({
      email: "admin@example.com",
      expiresAt: "not-an-expiry",
      devCode: "246810"
    });
    const renderer = await renderPanel(vi.fn());

    await act(async () => {
      findButton(renderer.root, "发送管理员验证码").props.onClick();
      await flushMicrotasks();
    });

    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn()
      });
    });

    expect(api.verifyAdminStepUpCode).not.toHaveBeenCalled();
    expect(findAlert(renderer.root).children.join("")).toBe("验证码已过期，请重新发送。");
    await unmount(renderer);
  });

  it("keeps the request prompt and maps a request failure to a product error", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockRejectedValue(
      new TypeError("Failed to fetch")
    );
    const renderer = await renderPanel(vi.fn());

    await act(async () => {
      findButton(renderer.root, "发送管理员验证码").props.onClick();
      await flushMicrotasks();
    });

    expect(findButton(renderer.root, "发送管理员验证码")).toBeDefined();
    expect(findAlert(renderer.root).children.join("")).toBe(
      "网络连接失败，请检查网络后重试。"
    );
    await unmount(renderer);
  });

  it("delegates a normalized request 401 to application authentication reset", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn((_error: unknown) => true);
    const renderer = await renderPanel(vi.fn(), onAuthenticationError);

    await act(async () => {
      findButton(renderer.root, "发送管理员验证码").props.onClick();
      await flushMicrotasks();
    });

    expect(onAuthenticationError).toHaveBeenCalledTimes(1);
    const normalizedError = onAuthenticationError.mock.calls[0]?.[0];
    expect(normalizedError).toBeInstanceOf(ProductApiError);
    expect(normalizedError).toMatchObject({ status: 401, category: "authentication" });
    expect(findButton(renderer.root, "发送管理员验证码")).toBeDefined();
    expect(findAlerts(renderer.root)).toEqual([]);
    await unmount(renderer);
  });

  it("keeps the verification prompt and maps a verification failure to a product error", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockResolvedValue({
      email: "admin@example.com",
      expiresAt: "2026-08-12T08:10:00.000Z",
      devCode: "246810"
    });
    vi.mocked(api.verifyAdminStepUpCode).mockRejectedValue({ status: 403 });
    const renderer = await renderPanel(vi.fn());

    await act(async () => {
      findButton(renderer.root, "发送管理员验证码").props.onClick();
      await flushMicrotasks();
    });
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn()
      });
    });

    expect(findButton(renderer.root, "完成管理员验证")).toBeDefined();
    expect(findAlert(renderer.root).children.join("")).toBe(
      "你没有权限执行此操作。"
    );
    await unmount(renderer);
  });

  it("delegates a normalized verification 401 without dismissing or replacing the prompt", async () => {
    vi.mocked(api.requestAdminStepUpCode).mockResolvedValue({
      email: "admin@example.com",
      expiresAt: "2026-08-12T08:10:00.000Z",
      devCode: "246810"
    });
    vi.mocked(api.verifyAdminStepUpCode).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn((_error: unknown) => true);
    const renderer = await renderPanel(vi.fn(), onAuthenticationError);

    await requestAndSubmitCode(renderer);

    expect(onAuthenticationError).toHaveBeenCalledTimes(1);
    const normalizedError = onAuthenticationError.mock.calls[0]?.[0];
    expect(normalizedError).toBeInstanceOf(ProductApiError);
    expect(normalizedError).toMatchObject({ status: 401, category: "authentication" });
    expect(findButton(renderer.root, "完成管理员验证")).toBeDefined();
    expect(findAlerts(renderer.root)).toEqual([]);
    await unmount(renderer);
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function renderPanel(
  onVerified: ReturnType<typeof vi.fn>,
  onAuthenticationError?: (error: unknown) => boolean
) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <AdminStepUpPanel
        open
        sessionToken="ordinary-token"
        email="admin@example.com"
        onVerified={onVerified}
        onCancel={vi.fn()}
        onAuthenticationError={onAuthenticationError}
      />
    );
  });
  if (!renderer) throw new Error("Expected renderer");
  return renderer;
}

function findButton(root: ReactTestInstance, label: string) {
  const matches = root.findAll(
    (node) =>
      node.type === "button" &&
      node.children.filter((child) => typeof child === "string").join("") ===
        label
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one button labelled ${label}, found ${matches.length}`);
  }
  return matches[0];
}

function findInput(root: ReactTestInstance, name: string) {
  const matches = root.findAll(
    (node) => node.type === "input" && node.props.name === name
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one input named ${name}, found ${matches.length}`);
  }
  return matches[0];
}

function findAlert(root: ReactTestInstance) {
  const matches = findAlerts(root);
  if (matches.length !== 1) {
    throw new Error(`Expected one alert, found ${matches.length}`);
  }
  return matches[0];
}

function findAlerts(root: ReactTestInstance) {
  return root.findAll(
    (node) => node.type === "p" && node.props.role === "alert"
  );
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function requestAndSubmitCode(renderer: ReactTestRenderer) {
  await act(async () => {
    findButton(renderer.root, "发送管理员验证码").props.onClick();
    await flushMicrotasks();
  });
  await act(async () => {
    await renderer.root.findByType("form").props.onSubmit({
      preventDefault: vi.fn()
    });
  });
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}
