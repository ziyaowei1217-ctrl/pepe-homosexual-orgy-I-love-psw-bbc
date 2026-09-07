// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "./support/dom-test-renderer";
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
import {
  getGuestUiStorageKey,
  getUserUiStorageKey
} from "../lib/user-ui-state";
import type { AuthIntent } from "../lib/app-routes";

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
const sessionStorage = new MemoryStorage();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorage
});
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: sessionStorage
});
Object.defineProperty(window, "requestAnimationFrame", {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }
});
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn()
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
  revision: 4,
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

const headerOffsetListing = {
  ...adminReviewListing,
  id: "header-offset-listing",
  status: "APPROVED" as const,
  trust: "平台已审核"
};

const submittedRentalApplication = {
  id: "application-1",
  listingId: headerOffsetListing.id,
  listingOwnerId: user.id,
  submitterId: "renter-1",
  teamId: null,
  scope: "SOLO" as const,
  status: "SUBMITTED" as const,
  memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
  moveIn: "2026-09-01T00:00:00.000Z",
  moveOut: "2026-12-31T00:00:00.000Z",
  schoolOrOccupation: "UCLA",
  incomeBand: "TWO_TO_THREE_X" as const,
  guarantorStatus: "AVAILABLE" as const,
  note: "安静作息"
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
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
  it("shows explicit guest authentication actions and hides account-only reminders", async () => {
    navigationMock.pathname = "/";
    const renderer = await renderSubletApp("Discover");

    expect(hasButton(renderer.root, "登录 / 注册")).toBe(true);
    expect(renderer.root.findAllByProps({ "aria-label": "本机提醒" })).toHaveLength(0);

    await act(async () => {
      clickButton(renderer.root, "登录 / 注册");
      await flushMicrotasks();
    });
    expect(navigationMock.push).toHaveBeenCalledWith(
      "/account?returnTo=%2F&intent=account"
    );
    await unmount(renderer);
  });

  it("lets a guest save a listing locally without opening or leaving for account auth", async () => {
    navigationMock.pathname = "/";
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/listings" ? [headerOffsetListing] : []
    );
    const renderer = await renderSubletApp("Discover", headerOffsetListing.id);

    await act(async () => {
      clickButton(renderer.root, "收藏房源");
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(navigationMock.push).not.toHaveBeenCalledWith("/account");
    expect(
      JSON.parse(localStorage.getItem(getGuestUiStorageKey()) ?? "null")
        .favoriteListingIds
    ).toEqual([headerOffsetListing.id]);
    await unmount(renderer);
  });

  it("sends a protected listing action to standalone auth with its listing return path", async () => {
    navigationMock.pathname = "/";
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/listings" ? [headerOffsetListing] : []
    );
    const renderer = await renderSubletApp("Discover", headerOffsetListing.id);

    await act(async () => {
      clickButton(renderer.root, "联系房东");
      await flushMicrotasks();
    });

    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(navigationMock.push).toHaveBeenCalledWith(
      "/account?returnTo=%2Flisting%2Fheader-offset-listing&intent=message-host"
    );
    await unmount(renderer);
  });

  it("shows a focused guest gate in Messages instead of an empty inbox", async () => {
    navigationMock.pathname = "/messages";
    const renderer = await renderSubletApp("Messages");

    expect(renderedText(renderer.root)).toContain("登录后查看消息");
    expect(renderedText(renderer.root)).not.toContain("还没有联系人");
    const action = renderer.root.findByProps({ "aria-label": "登录后查看消息" });
    await act(async () => {
      action.props.onClick();
      await flushMicrotasks();
    });
    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(navigationMock.push).toHaveBeenCalledWith(
      "/account?returnTo=%2Finbox&intent=messages"
    );
    await unmount(renderer);
  });

  it("shows a focused guest gate in Trips instead of personal empty records", async () => {
    navigationMock.pathname = "/trips";
    const renderer = await renderSubletApp("Trips");

    expect(renderedText(renderer.root)).toContain("登录后查看行程");
    expect(renderedText(renderer.root)).not.toContain("请先登录查看个人看房记录");
    const action = renderer.root.findByProps({ "aria-label": "登录后查看行程" });
    await act(async () => {
      action.props.onClick();
      await flushMicrotasks();
    });
    expect(hasAuthPanel(renderer.root)).toBe(false);
    expect(navigationMock.push).toHaveBeenCalledWith(
      "/account?returnTo=%2Ftrips&intent=trips"
    );
    await unmount(renderer);
  });

  it("redirects a guest landlord workspace visit to standalone auth", async () => {
    navigationMock.pathname = "/host/listings";
    const renderer = await renderSubletApp("Publish");

    expect(navigationMock.push).toHaveBeenCalledWith(
      "/account?returnTo=%2Fhost%2Flistings&intent=publish"
    );
    expect(hasAuthPanel(renderer.root)).toBe(false);
    await unmount(renderer);
  });

  it("renders account as a standalone authentication page without marketplace content", async () => {
    navigationMock.pathname = "/account";
    const renderer = await renderSubletApp("Discover", undefined, {
      authReturnTo: "/messages",
      authIntent: "messages"
    });

    expect(renderedText(renderer.root)).toContain("登录 Sublet Pipeline");
    expect(renderedText(renderer.root)).toContain("登录后即可查看房东与室友消息");
    expect(renderedText(renderer.root)).not.toContain("查找适合你的短租");
    expect(renderedText(renderer.root)).not.toContain("房东发布");
    expect(api.apiGet).not.toHaveBeenCalledWith(expect.stringMatching(/^\/listings/));
    expect(api.apiGet).not.toHaveBeenCalledWith("/roommates");
    await unmount(renderer);
  });

  it("returns a new user to the original page after profile completion", async () => {
    navigationMock.pathname = "/account";
    vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
    const renderer = await renderSubletApp("Discover", undefined, {
      authReturnTo: "/?listingId=header-offset-listing",
      authIntent: "message-host"
    });

    await authenticate({ accessToken: "new-user-token", user, isNewUser: true });
    expect(navigationMock.push).not.toHaveBeenCalledWith(
      "/?listingId=header-offset-listing"
    );

    await act(async () => {
      await capturedAuthPanel().onProfileSave({
        displayName: "Maya Chen",
        school: "UCLA",
        city: "Los Angeles",
        role: "lister"
      });
      await flushMicrotasks();
    });

    expect(navigationMock.push).toHaveBeenCalledWith(
      "/?listingId=header-offset-listing"
    );
    await unmount(renderer);
  });

  it("merges device-local guest favorites into the authenticated account", async () => {
    localStorage.setItem(
      getGuestUiStorageKey(),
      JSON.stringify({ version: 2, favoriteListingIds: ["guest-home", "shared-home"], notifications: [] })
    );
    localStorage.setItem(
      getUserUiStorageKey(user.id),
      JSON.stringify({ version: 2, favoriteListingIds: ["shared-home", "account-home"], notifications: [] })
    );
    writeStoredAuthSession("stored-user-token");

    const renderer = await renderSubletApp("Discover");
    await act(async () => {
      await flushMicrotasks();
    });

    expect(
      JSON.parse(localStorage.getItem(getUserUiStorageKey(user.id)) ?? "null")
        .favoriteListingIds
    ).toEqual(["guest-home", "shared-home", "account-home"]);
    expect(localStorage.getItem(getGuestUiStorageKey())).toBeNull();
    await unmount(renderer);
  });

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

  it("labels administrator navigation and exposes its active destination", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("stored-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    const renderer = await renderSubletApp("Trust");

    const administratorNavigations = renderer.root.findAllByProps({
      "aria-label": "管理员工具"
    });
    expect(administratorNavigations).toHaveLength(1);
    expect(administratorNavigations[0]?.type).toBe("nav");

    const trustDestination = findButton(renderer.root, "房源审核");
    const roommateDestination = findButton(renderer.root, "室友管理");
    expect(trustDestination.props["aria-current"]).toBe("page");
    expect(roommateDestination.props["aria-current"]).toBeUndefined();
    await unmount(renderer);
  });

  it("keeps the ordinary header offset and expands it for administrators", async () => {
    navigationMock.pathname = "/";
    writeStoredAuthSession("stored-user-token");
    const ordinaryRenderer = await renderSubletApp("Discover");

    expect(ordinaryRenderer.root.findByType("main").props.className).toContain(
      "[--app-header-offset:6rem]"
    );
    await unmount(ordinaryRenderer);

    localStorage.clear();
    writeStoredAuthSession("stored-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    const administratorRenderer = await renderSubletApp("Discover");

    expect(administratorRenderer.root.findByType("main").props.className).toContain(
      "[--app-header-offset:9rem]"
    );
    await unmount(administratorRenderer);
  });

  it("uses the shared header offset for every sticky and scroll-margin consumer", async () => {
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/listings" ? [headerOffsetListing] : []
    );
    navigationMock.pathname = "/";
    const discoverRenderer = await renderSubletApp("Discover");

    expect(
      nodesWithClass(discoverRenderer.root, "top-[var(--app-header-offset)]")
    ).toHaveLength(1);
    expect(
      nodesWithClass(discoverRenderer.root, "scroll-mt-[var(--app-header-offset)]")
    ).toHaveLength(1);
    await unmount(discoverRenderer);

    navigationMock.pathname = "/host/listings";
    const publishRenderer = await renderSubletApp("Publish");
    expect(
      publishRenderer.root.findByProps({ id: "publish-flow" }).props.className
    ).toContain("scroll-mt-[var(--app-header-offset)]");
    await unmount(publishRenderer);

    navigationMock.pathname = "/";
    const detailRenderer = await renderSubletApp(
      "Discover",
      headerOffsetListing.id
    );
    expect(
      nodesWithClass(detailRenderer.root, "xl:top-[var(--app-header-offset)]")
    ).toHaveLength(1);
    await unmount(detailRenderer);
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
    expect(renderedText(renderer.root)).toContain("可入住日期");
    expect(renderedText(renderer.root)).toContain("最晚退租日期");
    await unmount(renderer);
  });

  it("presents date search as available instead of an unreleased capability", async () => {
    navigationMock.pathname = "/";
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/listings"
        ? [
            {
              ...headerOffsetListing,
              status: "APPROVED",
              availableFrom: "2026-08-01",
              availableTo: "2027-08-01"
            }
          ]
        : []
    );

    const renderer = await renderSubletApp("Discover");

    expect(renderedText(renderer.root)).not.toContain("日期筛选暂未开放");
    expect(
      renderer.root
        .findAllByType("button")
        .find((button) => renderedText(button).includes("入住"))?.props.disabled
    ).not.toBe(true);
    await unmount(renderer);
  });

  it("opens the server-backed rental application flow from listing detail", async () => {
    navigationMock.pathname = "/";
    writeStoredAuthSession("stored-renter-token");
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/listings" ? [headerOffsetListing] : []
    );

    const renderer = await renderSubletApp("Discover", headerOffsetListing.id);

    expect(hasButton(renderer.root, "在线申请")).toBe(true);
    await act(async () => {
      clickButton(renderer.root, "在线申请");
      await flushMicrotasks();
    });
    expect(renderer.root.findAllByProps({ "aria-label": "租房申请" })).toHaveLength(1);
    expect(renderedText(renderer.root)).not.toContain("在线申请（暂未开放）");
    await unmount(renderer);
  });

  it("shows server-backed rental applications in Trips", async () => {
    navigationMock.pathname = "/trips";
    writeStoredAuthSession("stored-renter-token");
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/applications/mine" ? [submittedRentalApplication] : []
    );

    const renderer = await renderSubletApp("Trips");

    expect(renderedText(renderer.root)).toContain("租房申请行程");
    expect(renderedText(renderer.root)).toContain("等待房东处理");
    expect(renderedText(renderer.root)).not.toContain("在线申请 · 暂未开放");
    expect(api.apiGet).toHaveBeenCalledWith("/applications/mine", "stored-renter-token");
    await unmount(renderer);
  });

  it("shows the owner application inbox in the landlord workspace", async () => {
    navigationMock.pathname = "/host/listings";
    writeStoredAuthSession("stored-host-token");
    vi.mocked(api.apiGet).mockImplementation(async (path) =>
      path === "/applications/host-inbox" ? [submittedRentalApplication] : []
    );

    const renderer = await renderSubletApp("Publish");

    expect(renderedText(renderer.root)).toContain("房东申请箱");
    expect(renderedText(renderer.root)).toContain("Lin");
    expect(api.apiGet).toHaveBeenCalledWith("/applications/host-inbox", "stored-host-token");
    await unmount(renderer);
  });

  it("refreshes the owner's listing review status when the page regains focus", async () => {
    navigationMock.pathname = "/host/listings";
    writeStoredAuthSession("stored-host-token");
    let ownedListingReads = 0;
    vi.mocked(api.apiGet).mockImplementation(async (path) => {
      if (path !== "/listings/mine") return [];
      ownedListingReads += 1;
      return [{
        ...headerOffsetListing,
        title: "聚焦刷新房源",
        status: ownedListingReads === 1 ? "SUBMITTED" : "APPROVED"
      }];
    });
    const renderer = await renderSubletApp("Publish");
    expect(renderedText(renderer.root)).toContain("审核中");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await flushMicrotasks();
    });

    expect(ownedListingReads).toBeGreaterThanOrEqual(2);
    expect(renderedText(renderer.root)).toContain("已上线");
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
    const getElementByIdSpy = vi
      .spyOn(document, "getElementById")
      .mockImplementation(getElementById as typeof document.getElementById);
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
      getElementByIdSpy.mockRestore();
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
    const getElementByIdSpy = vi
      .spyOn(document, "getElementById")
      .mockImplementation(getElementById as typeof document.getElementById);
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
      getElementByIdSpy.mockRestore();
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
    navigationMock.pathname = "/account";
    const oldProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(oldProfileRequest.promise);
    vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
    const renderer = await renderSubletApp("Discover", undefined, {
      authReturnTo: "/host/listings",
      authIntent: "publish"
    });

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
    expect(navigationMock.push).toHaveBeenCalledWith("/host/listings");

    await act(async () => {
      oldProfileRequest.resolve(incompleteListerProfile);
      await flushMicrotasks();
    });

    expect(capturedAuthPanel().profile).toBe(completeProfile);
    await unmount(renderer);
  });

  it("opens new-user onboarding from the real authenticated callback but not for an existing user", async () => {
    navigationMock.pathname = "/account";
    const newUserProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(newUserProfileRequest.promise);
    const newUserRenderer = await renderSubletApp("Discover", undefined, {
      authReturnTo: "/host/listings",
      authIntent: "publish"
    });

    await authenticate({
      accessToken: "new-user-token",
      user,
      isNewUser: true
    });
    expect(capturedAuthPanel().onboardingReason).toBe("new-user");
    expect(navigationMock.push).not.toHaveBeenCalledWith("/host/listings");
    await unmount(newUserRenderer);

    localStorage.clear();
    navigationMock.push.mockClear();
    authPanelCapture.current = null;
    const existingProfileRequest = deferred<ApiProfile>();
    vi.mocked(api.getMyProfile).mockReturnValue(existingProfileRequest.promise);
    const existingUserRenderer = await renderSubletApp("Discover", undefined, {
      authReturnTo: "/host/listings",
      authIntent: "publish"
    });

    await authenticate({
      accessToken: "existing-user-token",
      user,
      isNewUser: false
    });
    expect(capturedAuthPanel().onboardingReason).toBeNull();
    expect(navigationMock.push).toHaveBeenCalledWith("/host/listings");
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

    expect(renderedText(renderer.root)).toContain("室友资料管理");
    expect(hasButton(renderer.root, "新建资料")).toBe(true);
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

  it("restores administrator step-up verification after an admin route remount", async () => {
    navigationMock.pathname = "/admin/trust";
    writeStoredAuthSession("stored-admin-token");
    vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
    vi.mocked(api.getAdminListingReviewQueue).mockResolvedValue([adminReviewListing]);
    const firstRenderer = await renderSubletApp("Trust");
    const firstStepUpPanel = adminStepUpPanelCapture.current as {
      onVerified: (session: { accessToken: string; reauthenticatedUntil: string }) => void;
    };

    await act(async () => {
      firstStepUpPanel.onVerified({
        accessToken: "enhanced-token",
        reauthenticatedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      });
      await flushMicrotasks();
    });
    await unmount(firstRenderer);

    vi.mocked(api.approveAdminListing).mockClear();
    const secondRenderer = await renderSubletApp("Trust");
    await act(async () => {
      clickButton(secondRenderer.root, "通过");
      await flushMicrotasks();
    });
    await act(async () => {
      clickButton(secondRenderer.root, "确认通过");
      await flushMicrotasks();
    });

    expect(api.approveAdminListing).toHaveBeenCalledWith("enhanced-token", adminReviewListing.id, adminReviewListing.revision);
    await unmount(secondRenderer);
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
  initialSection: "Discover" | "Messages" | "Publish" | "Trips" | "Trust" | "AdminRoommates",
  initialListingId?: string,
  authOptions: { authReturnTo?: string | null; authIntent?: AuthIntent } = {}
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SubletApp
        initialSection={initialSection}
        initialListingId={initialListingId}
        {...authOptions}
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
  findButton(root, label).props.onClick();
}

function findButton(root: ReactTestInstance, label: string) {
  const button = root
    .findAllByType("button")
    .find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button \"${label}\" was not found`);
  return button;
}

function hasAuthPanel(root: ReactTestInstance) {
  return root.findAllByProps({ "data-testid": "auth-flow-panel" }).length > 0;
}

function nodesWithClass(root: ReactTestInstance, className: string) {
  return root.findAll(
    (node) =>
      typeof node.type === "string" &&
      typeof node.props.className === "string" &&
      node.props.className.split(" ").includes(className)
  );
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
