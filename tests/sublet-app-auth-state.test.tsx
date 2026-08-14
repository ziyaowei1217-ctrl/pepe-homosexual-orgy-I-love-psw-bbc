import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  pathname: "/host/listings",
  push: vi.fn()
}));

const authPanelCapture = vi.hoisted(() => ({
  current: null as unknown
}));

const adminStepUpPanelCapture = vi.hoisted(() => ({
  current: null as unknown
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push })
}));

vi.mock("@/components/auth-flow-panel", () => ({
  AuthFlowPanel: (props: unknown) => {
    authPanelCapture.current = props;
    return <div data-testid="auth-flow-panel" />;
  }
}));

vi.mock("@/components/admin-step-up-panel", () => ({
  AdminStepUpPanel: (props: unknown) => {
    adminStepUpPanelCapture.current = props;
    return <div data-testid="admin-step-up-panel" />;
  }
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>(
    "../lib/api"
  );

  return {
    ...actual,
    approveAdminListing: vi.fn(),
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    apiPost: vi.fn(),
    getAdminRoommates: vi.fn(),
    getMyProfile: vi.fn(),
    getAdminListingReviewQueue: vi.fn(),
    getRoommateConversations: vi.fn(),
    getSessionUser: vi.fn(),
    updateMyProfile: vi.fn()
  };
});

vi.mock("@/lib/roommate-realtime", () => ({
  createRoommateRealtimeClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
}));

import type { AuthFlowPanelProps } from "../components/auth-flow-panel";
import SubletApp from "../components/sublet-app";
import * as api from "../lib/api";
import type {
  ApiProfile,
  SessionUser,
  VerifyEmailResponse
} from "../lib/api";
import {
  readStoredAuthSession,
  writeStoredAuthSession
} from "../lib/auth-session";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener: vi.fn(),
    localStorage,
    removeEventListener: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    scrollTo: vi.fn()
  }
});

const user: SessionUser = {
  id: "user-1",
  email: "maya@example.edu",
  role: "USER"
};

const completeProfile: ApiProfile = {
  id: "profile-1",
  email: user.email,
  displayName: "Maya Chen",
  avatarUrl: null,
  school: "UCLA",
  city: "Los Angeles",
  role: "lister",
  eduEmailVerified: true,
  phoneVerified: false,
  wechat: null,
  instagram: null,
  bio: null
};

const incompleteListerProfile: ApiProfile = {
  ...completeProfile,
  displayName: null,
  school: null,
  city: null
};

const adminReviewListing = {
  id: "admin-review-listing",
  title: "管理员刷新验收房源",
  area: "Westwood",
  image: "https://images.example.test/admin-review.jpg",
  price: 1800,
  originalPrice: 1900,
  beds: 1,
  baths: 1,
  commute: "12 min",
  transit: "Bus 1",
  trust: "待审核",
  tags: ["带家具"],
  score: 80,
  status: "SUBMITTED" as const,
  submittedAt: "2026-08-12T08:00:00.000Z",
  media: []
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  navigationMock.pathname = "/host/listings";
  authPanelCapture.current = null;
  adminStepUpPanelCapture.current = null;
  vi.mocked(api.apiGet).mockImplementation(async () => []);
  vi.mocked(api.apiPatch).mockResolvedValue({});
  vi.mocked(api.apiPost).mockResolvedValue({});
  vi.mocked(api.getAdminRoommates).mockResolvedValue([]);
  vi.mocked(api.approveAdminListing).mockResolvedValue(adminReviewListing);
  vi.mocked(api.getSessionUser).mockResolvedValue(user);
  vi.mocked(api.getMyProfile).mockResolvedValue(completeProfile);
  vi.mocked(api.getAdminListingReviewQueue).mockResolvedValue([]);
  vi.mocked(api.getRoommateConversations).mockResolvedValue([]);
  vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
});

describe("SubletApp auth state flow", () => {
  it("shows two direct administrator tools and routes each one for an ADMIN session", async () => {
    navigationMock.pathname = "/";
    writeStoredAuthSession("stored-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    const renderer = await renderSubletApp("Discover");

    expect(renderedText(renderer.root)).toContain("管理员工具");
    expect(hasButton(renderer.root, "房源审核")).toBe(true);
    expect(hasButton(renderer.root, "室友管理")).toBe(true);

    await act(async () => {
      clickButton(renderer.root, "房源审核");
      await flushMicrotasks();
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/admin/trust");

    await act(async () => {
      clickButton(renderer.root, "室友管理");
      await flushMicrotasks();
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/admin/roommates");
    await unmount(renderer);
  });

  it("does not expose administrator tools to an ordinary authenticated user", async () => {
    navigationMock.pathname = "/";
    writeStoredAuthSession("stored-user-token");
    vi.mocked(api.getSessionUser).mockResolvedValue(user);
    const renderer = await renderSubletApp("Discover");

    expect(renderedText(renderer.root)).not.toContain("管理员工具");
    expect(hasButton(renderer.root, "房源审核")).toBe(false);
    expect(hasButton(renderer.root, "室友管理")).toBe(false);
    await unmount(renderer);
  });

  it("keeps listing-detail placeholder rows free of duplicate React keys", async () => {
    navigationMock.pathname = "/";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer: ReactTestRenderer | null = null;

    try {
      renderer = await renderSubletApp("Discover", "seed-listing-1");

      const duplicateKeyErrors = consoleError.mock.calls.filter(([message]) =>
        String(message).includes("Encountered two children with the same key")
      );
      expect(duplicateKeyErrors).toEqual([]);
    } finally {
      consoleError.mockRestore();
      if (renderer) await unmount(renderer);
    }
  });

  it("hides the identity panel when a stored complete landlord profile finishes loading", async () => {
    writeStoredAuthSession("stored-token");
    const profileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(profileRequest.promise);
    const renderer = await renderSubletApp("Publish");

    expect(capturedAuthPanel().token).toBe("stored-token");
    expect(capturedAuthPanel().onboardingReason).toBeNull();
    expect(hasAuthPanel(renderer.root)).toBe(true);

    await act(async () => {
      profileRequest.resolve(completeProfile);
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(hasButton(renderer.root, "保存草稿")).toBe(true);
    await unmount(renderer);
  });

  it("opens publish-required for an incomplete lister without rendering a publish submit control", async () => {
    writeStoredAuthSession("stored-token");
    const profileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(profileRequest.promise);
    const renderer = await renderSubletApp("Publish");

    await act(async () => {
      profileRequest.resolve(incompleteListerProfile);
      await flushMicrotasks();
    });

    expect(capturedAuthPanel().onboardingReason).toBe("publish-required");
    expect(hasButton(renderer.root, "保存草稿")).toBe(false);
    expect(hasButton(renderer.root, "提交审核")).toBe(false);
    await unmount(renderer);
  });

  it("hands a completed landlord profile from identity saving into the publish form", async () => {
    writeStoredAuthSession("stored-token");
    vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
    vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn((id: string) =>
      id === "publish-flow" ? { scrollIntoView } : null
    );
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document"
    );
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { getElementById }
    });
    let renderer: ReactTestRenderer | null = null;
    try {
      renderer = await renderSubletApp("Publish");
      const saveProfile = capturedAuthPanel().onProfileSave;

      expect(hasAuthPanel(renderer.root)).toBe(true);
      expect(hasButton(renderer.root, "保存草稿")).toBe(false);

      await act(async () => {
        await saveProfile({
          displayName: "Maya Chen",
          school: "UCLA",
          city: "Los Angeles",
          role: "lister"
        });
        await flushMicrotasks();
      });

      expect(hasAuthPanel(renderer.root)).toBe(false);
      expect(hasButton(renderer.root, "保存草稿")).toBe(true);
      expect(renderedText(renderer.root)).toContain("身份已保存，可以开始填写房源");
      expect(getElementById).toHaveBeenCalledWith("publish-flow");
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start"
      });
    } finally {
      if (renderer) await unmount(renderer);
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });

  it("does not apply publish handoff feedback after navigation away during an identity save", async () => {
    writeStoredAuthSession("stored-token");
    const saveRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
    vi.mocked(api.updateMyProfile).mockReturnValue(saveRequest.promise);
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn((id: string) =>
      id === "publish-flow" ? { scrollIntoView } : null
    );
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document"
    );
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { getElementById }
    });
    let renderer: ReactTestRenderer | null = null;
    try {
      renderer = await renderSubletApp("Publish");
      const activeRenderer = renderer;
      const saveProfile = capturedAuthPanel().onProfileSave;

      await act(async () => {
        void saveProfile({
          displayName: "Maya Chen",
          school: "UCLA",
          city: "Los Angeles",
          role: "lister"
        });
        await flushMicrotasks();
      });

      await act(async () => {
        clickButton(activeRenderer.root, "找房");
        await flushMicrotasks();
      });

      await act(async () => {
        saveRequest.resolve(completeProfile);
        await flushMicrotasks();
      });

      expect(hasAuthPanel(activeRenderer.root)).toBe(true);
      expect(renderedText(activeRenderer.root)).toContain("资料已保存");
      expect(renderedText(activeRenderer.root)).not.toContain("身份已保存，可以开始填写房源");
      expect(getElementById).not.toHaveBeenCalled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (renderer) await unmount(renderer);
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });

  it("keeps identity visible when the saved profile still lacks publish access", async () => {
    writeStoredAuthSession("stored-token");
    vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
    vi.mocked(api.updateMyProfile).mockResolvedValue(incompleteListerProfile);
    const renderer = await renderSubletApp("Publish");
    const saveProfile = capturedAuthPanel().onProfileSave;

    await act(async () => {
      await saveProfile({
        displayName: "",
        school: "",
        city: "",
        role: "lister"
      });
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(true);
    expect(hasButton(renderer.root, "保存草稿")).toBe(false);
    await unmount(renderer);
  });

  it("keeps identity visible when profile saving fails", async () => {
    writeStoredAuthSession("stored-token");
    vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
    vi.mocked(api.updateMyProfile).mockRejectedValue({ status: 503 });
    const renderer = await renderSubletApp("Publish");
    const saveProfile = capturedAuthPanel().onProfileSave;

    await act(async () => {
      await saveProfile({
        displayName: "Maya Chen",
        school: "UCLA",
        city: "Los Angeles",
        role: "lister"
      });
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(true);
    expect(hasButton(renderer.root, "保存草稿")).toBe(false);
    await unmount(renderer);
  });

  it("keeps a newly saved profile when the older profile request resolves later", async () => {
    const oldProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(oldProfileRequest.promise);
    vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
    const renderer = await renderSubletApp("Publish");

    await authenticate({
      accessToken: "fresh-token",
      user,
      isNewUser: true
    });

    let savedProfile: ApiProfile | null = null;
    await act(async () => {
      savedProfile = await capturedAuthPanel().onProfileSave({
        displayName: completeProfile.displayName ?? "",
        school: completeProfile.school ?? "",
        city: completeProfile.city ?? "",
        role: completeProfile.role
      });
    });

    expect(savedProfile).toBe(completeProfile);
    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(hasButton(renderer.root, "保存草稿")).toBe(true);

    await act(async () => {
      oldProfileRequest.resolve(incompleteListerProfile);
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(hasButton(renderer.root, "保存草稿")).toBe(true);
    await unmount(renderer);
  });

  it("opens new-user onboarding from the real authenticated callback but not for an existing user", async () => {
    const newUserProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(newUserProfileRequest.promise);
    const newUserRenderer = await renderSubletApp("Publish");

    await authenticate({
      accessToken: "new-user-token",
      user,
      isNewUser: true
    });
    expect(capturedAuthPanel().onboardingReason).toBe("new-user");
    await unmount(newUserRenderer);

    localStorage.clear();
    authPanelCapture.current = null;
    const existingProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(existingProfileRequest.promise);
    const existingUserRenderer = await renderSubletApp("Publish");

    await authenticate({
      accessToken: "existing-user-token",
      user,
      isNewUser: false
    });
    expect(capturedAuthPanel().onboardingReason).toBeNull();
    await unmount(existingUserRenderer);
  });

  it("clears a stored 401 session and opens auth on an ordinary route", async () => {
    navigationMock.pathname = "/";
    writeStoredAuthSession("expired-token");
    vi.mocked(api.getSessionUser).mockRejectedValue({ status: 401 });
    const renderer = await renderSubletApp("Discover");

    expect(readStoredAuthSession()).toBeNull();
    expect(capturedAuthPanel().token).toBeNull();
    expect(capturedAuthPanel().user).toBeNull();
    await unmount(renderer);
  });

  it("loads the administrator review workspace only after the current user resolves as ADMIN", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("stored-token");
    const currentUser = deferred<SessionUser>();
    vi.mocked(api.getSessionUser).mockReturnValue(currentUser.promise);
    const renderer = await renderSubletApp("Trust");

    expect(renderedText(renderer.root)).toContain("需要管理员权限");
    expect(api.apiGet).not.toHaveBeenCalledWith("/trust/queues", "stored-token");

    await act(async () => {
      currentUser.resolve({ ...user, role: "ADMIN" });
      await flushMicrotasks();
    });

    expect(renderedText(renderer.root)).toContain("房源审核队列");
    expect(api.apiGet).toHaveBeenCalledWith("/trust/queues", "stored-token");
    await unmount(renderer);
  });

  it("mounts the roommate administrator workspace for a stored administrator session", async () => {
    navigationMock.pathname = "/admin/roommates";
    writeStoredAuthSession("stored-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    vi.mocked(api.getAdminRoommates).mockResolvedValue([]);
    const renderer = await renderSubletApp("AdminRoommates");

    expect(renderedText(renderer.root)).toContain("Roommate Admin");
    expect(hasButton(renderer.root, "New profile")).toBe(true);
    expect(api.getAdminRoommates).toHaveBeenCalledWith("stored-admin-token");
    await unmount(renderer);
  });

  it("clears the stored administrator session when the initial roommate read returns 401", async () => {
    navigationMock.pathname = "/admin/roommates";
    writeStoredAuthSession("expired-roommate-read-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    vi.mocked(api.getAdminRoommates).mockRejectedValue({ status: 401 });
    const renderer = await renderSubletApp("AdminRoommates");

    expect(api.getAdminRoommates).toHaveBeenCalledWith("expired-roommate-read-token");
    expect(readStoredAuthSession()).toBeNull();
    expect(capturedAuthPanel().token).toBeNull();
    expect(capturedAuthPanel().user).toBeNull();
    await unmount(renderer);
  });

  it("clears an administrator session when the Trust metrics read returns 401", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("expired-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    vi.mocked(api.apiGet).mockImplementation(async (path) => {
      if (path === "/trust/queues") throw { status: 401 };
      return [];
    });
    const renderer = await renderSubletApp("Trust");

    expect(readStoredAuthSession()).toBeNull();
    expect(capturedAuthPanel().token).toBeNull();
    await unmount(renderer);
  });

  it("wires administrator step-up authentication failures to the application session reset", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("expired-step-up-session");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    const renderer = await renderSubletApp("Trust");
    const stepUpPanel = adminStepUpPanelCapture.current as {
      onAuthenticationError?: (error: unknown) => boolean;
    };

    expect(typeof stepUpPanel.onAuthenticationError).toBe("function");
    let handled = false;
    await act(async () => {
      handled = stepUpPanel.onAuthenticationError?.({ status: 401 }) ?? false;
      await flushMicrotasks();
    });

    expect(handled).toBe(true);
    expect(readStoredAuthSession()).toBeNull();
    expect(capturedAuthPanel().token).toBeNull();
    expect(capturedAuthPanel().user).toBeNull();
    await unmount(renderer);
  });

  it("clears the application-owned administrator session when metrics 401 follows a catalog refresh 503", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("mixed-refresh-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    vi.mocked(api.getAdminListingReviewQueue)
      .mockResolvedValueOnce([adminReviewListing])
      .mockResolvedValueOnce([]);
    let listingsReadCount = 0;
    let metricsReadCount = 0;
    vi.mocked(api.apiGet).mockImplementation(async (path) => {
      if (path === "/listings") {
        listingsReadCount += 1;
        if (listingsReadCount > 1) throw { status: 503 };
      }
      if (path === "/trust/queues") {
        metricsReadCount += 1;
        if (metricsReadCount > 1) throw { status: 401 };
      }
      return [];
    });
    const renderer = await renderSubletApp("Trust");

    await act(async () => {
      clickButton(renderer.root, "通过");
      await flushMicrotasks();
    });
    await act(async () => {
      clickButton(renderer.root, "确认通过");
      await flushMicrotasks();
    });
    const stepUpPanel = adminStepUpPanelCapture.current as {
      onVerified: (session: { accessToken: string; reauthenticatedUntil: string }) => void;
    };
    await act(async () => {
      stepUpPanel.onVerified({
        accessToken: "enhanced-token",
        reauthenticatedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      });
      await flushMicrotasks();
    });
    await act(async () => {
      clickButton(renderer.root, "确认通过");
      await flushMicrotasks();
    });

    expect(readStoredAuthSession()).toBeNull();
    expect(capturedAuthPanel().token).toBeNull();
    expect(api.apiGet).toHaveBeenCalledWith("/listings");
    expect(api.apiGet).toHaveBeenCalledWith("/trust/queues", "mixed-refresh-token");
    await unmount(renderer);
  });

  it.each([
    ["503", { status: 503 }],
    ["network failure", new TypeError("Failed to fetch")]
  ])("retains the stored token after a %s profile recovery error", async (_label, error) => {
    writeStoredAuthSession("retryable-token");
    vi.mocked(api.getSessionUser).mockRejectedValue(error);
    const renderer = await renderSubletApp("Publish");

    expect(readStoredAuthSession()).toEqual({
      accessToken: "retryable-token"
    });
    expect(capturedAuthPanel().token).toBe("retryable-token");
    await unmount(renderer);
  });
});

async function renderSubletApp(
  initialSection: "Discover" | "Publish" | "Trust" | "AdminRoommates",
  initialListingId?: string
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SubletApp
        initialSection={initialSection}
        initialListingId={initialListingId}
      />
    );
    await flushMicrotasks();
  });
  if (!renderer) throw new Error("SubletApp renderer was not created");
  return renderer;
}

async function authenticate(response: VerifyEmailResponse) {
  await act(async () => {
    capturedAuthPanel().onAuthenticated(response);
    await flushMicrotasks();
  });
}

function capturedAuthPanel() {
  if (!authPanelCapture.current) {
    throw new Error("AuthFlowPanel has not rendered");
  }
  return authPanelCapture.current as AuthFlowPanelProps;
}

function hasButton(root: ReactTestInstance, label: string) {
  return root
    .findAllByType("button")
    .some((button) => renderedText(button) === label);
}

function clickButton(root: ReactTestInstance, label: string) {
  const button = root
    .findAllByType("button")
    .find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button \"${label}\" was not found`);
  button.props.onClick();
}

function hasAuthPanel(root: ReactTestInstance) {
  return root.findAllByProps({ "data-testid": "auth-flow-panel" }).length > 0;
}

function renderedText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : renderedText(child)
    )
    .join("");
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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}
