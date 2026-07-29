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

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>(
    "../lib/api"
  );

  return {
    ...actual,
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    apiPost: vi.fn(),
    getMyProfile: vi.fn(),
    getSessionUser: vi.fn(),
    updateMyProfile: vi.fn()
  };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  navigationMock.pathname = "/host/listings";
  authPanelCapture.current = null;
  vi.mocked(api.apiGet).mockImplementation(async () => []);
  vi.mocked(api.apiPatch).mockResolvedValue({});
  vi.mocked(api.apiPost).mockResolvedValue({});
  vi.mocked(api.getSessionUser).mockResolvedValue(user);
  vi.mocked(api.getMyProfile).mockResolvedValue(completeProfile);
  vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
});

describe("SubletApp auth state flow", () => {
  it("keeps onboarding closed while a stored session profile loads and after a complete existing profile arrives", async () => {
    writeStoredAuthSession("stored-token");
    const profileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(profileRequest.promise);
    const renderer = await renderSubletApp("Publish");

    expect(capturedAuthPanel().token).toBe("stored-token");
    expect(capturedAuthPanel().onboardingReason).toBeNull();

    await act(async () => {
      profileRequest.resolve(completeProfile);
      await flushMicrotasks();
    });

    expect(capturedAuthPanel().profile).toBe(completeProfile);
    expect(capturedAuthPanel().onboardingReason).toBeNull();
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
    const renderer = await renderSubletApp("Publish");
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
    await unmount(renderer);
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
    expect(capturedAuthPanel().profile).toBe(completeProfile);

    await act(async () => {
      oldProfileRequest.resolve(incompleteListerProfile);
      await flushMicrotasks();
    });

    expect(capturedAuthPanel().profile).toBe(completeProfile);
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
  initialSection: "Discover" | "Publish"
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<SubletApp initialSection={initialSection} />);
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
