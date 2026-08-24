import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTrustScreen } from "../components/admin-trust-screen";
import * as api from "../lib/api";
import type { ApiListing, SessionUser } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    approveAdminListing: vi.fn(),
    getAdminListingMediaContent: vi.fn(),
    getAdminListingReviewQueue: vi.fn(),
    rejectAdminListing: vi.fn()
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const admin: SessionUser = {
  id: "admin-0812",
  email: "trust-admin@example.edu",
  role: "ADMIN"
};

const ordinaryUser: SessionUser = {
  id: "user-0812",
  email: "renter@example.edu",
  role: "USER"
};

const queuedListing: ApiListing = {
  id: "listing-codex-0812",
  title: "Codex 浏览验收测试房源 0812",
  area: "Westwood",
  image: "https://images.example.test/listing-cover.jpg",
  price: 1820,
  originalPrice: 1950,
  beds: 1,
  baths: 1,
  commute: "12 min to UCLA",
  transit: "Big Blue Bus 1",
  trust: "待审核",
  tags: ["带家具", "近校园"],
  score: 86,
  ownerId: "owner-0812",
  status: "SUBMITTED",
  submittedAt: "2026-08-12T08:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  updatedAt: "2026-08-12T08:00:00.000Z",
  media: [
    {
      id: "media-0812",
      url: "https://images.example.test/listing-media.jpg",
      kind: "image",
      sortOrder: 0
    }
  ],
  availableFrom: "2026-09-01",
  availableTo: "2027-06-30"
};

describe("AdminTrustScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAdminListingReviewQueue).mockResolvedValue([queuedListing]);
    vi.mocked(api.getAdminListingMediaContent).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    vi.mocked(api.approveAdminListing).mockResolvedValue({
      ...queuedListing,
      status: "APPROVED"
    });
    vi.mocked(api.rejectAdminListing).mockResolvedValue({
      ...queuedListing,
      status: "REJECTED"
    });
  });

  it("gates signed-out and ordinary users before loading the administrator queue", async () => {
    const renderedSignedOut = await renderScreen({ token: null, user: null });
    expect(renderedText(renderedSignedOut.root)).toContain("请登录管理员账户");
    expect(api.getAdminListingReviewQueue).not.toHaveBeenCalled();
    await unmount(renderedSignedOut);

    const renderedOrdinaryUser = await renderScreen({ token: "ordinary-token", user: ordinaryUser });
    expect(renderedText(renderedOrdinaryUser.root)).toContain("需要管理员权限");
    expect(api.getAdminListingReviewQueue).not.toHaveBeenCalled();
    await unmount(renderedOrdinaryUser);
  });

  it("renders submitted listings from the ordinary administrator session", async () => {
    const renderer = await renderScreen({
      trustMetrics: [{ id: "metric-0812", label: "待审核", value: 1, variant: "warning" }]
    });

    const text = renderedText(renderer.root);
    expect(text).toContain("Codex 浏览验收测试房源 0812");
    expect(text).toContain("Westwood");
    expect(text).toContain("$1820/月");
    expect(text).toContain("提交于");
    expect(text).toContain("带家具");
    expect(text).toContain("近校园");
    expect(text).toContain("发布者编号owner-0812");
    expect(text).toContain("信任声明待审核");
    expect(text).toContain("待审核1");
    expect(reviewMediaBackgrounds(renderer.root)).toEqual([
      'url("https://images.example.test/listing-cover.jpg")',
      'url("https://images.example.test/listing-media.jpg")'
    ]);
    expect(api.getAdminListingReviewQueue).toHaveBeenCalledWith("ordinary-token");
    await unmount(renderer);
  });

  it("shows explicit fallbacks and refuses unsafe review media", async () => {
    vi.mocked(api.getAdminListingReviewQueue).mockResolvedValue([
      {
        ...queuedListing,
        id: "listing-missing-review-fields",
        ownerId: "   ",
        trust: "   ",
        tags: [],
        image: "",
        submittedAt: "not-a-timestamp",
        media: [
          {
            id: "unsafe-media",
            url: "javascript:alert('review')",
            kind: "image",
            sortOrder: 0
          }
        ]
      }
    ]);

    const renderer = await renderScreen();
    const text = renderedText(renderer.root);

    expect(text).toContain("发布者编号未提供");
    expect(text).toContain("信任声明未提供信任声明");
    expect(text).toContain("未知时间");
    expect(text).toContain("暂无标签");
    expect(text).toContain("未提供可安全预览的房源图片");
    expect(reviewMediaBackgrounds(renderer.root)).toEqual([]);
    await unmount(renderer);
  });

  it("loads ready review media with the administrator session and releases its object URL", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:admin-review-media");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(api.getAdminListingReviewQueue).mockResolvedValue([
      {
        ...queuedListing,
        image: null,
        media: [
          {
            id: "ready-media",
            reviewContentUrl: "/api/v1/admin/listings/listing-codex-0812/media/ready-media/content",
            kind: "卧室",
            sortOrder: 0
          }
        ]
      }
    ]);

    const renderer = await renderScreen();

    expect(api.getAdminListingMediaContent).toHaveBeenCalledWith(
      "ordinary-token",
      "/api/v1/admin/listings/listing-codex-0812/media/ready-media/content"
    );
    expect(reviewMediaBackgrounds(renderer.root)).toEqual(['url("blob:admin-review-media")']);

    await unmount(renderer);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:admin-review-media");
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("requires step-up and confirmation before approving, then removes only after server success", async () => {
    const approval = deferred<ApiListing>();
    vi.mocked(api.approveAdminListing).mockReturnValue(approval.promise);
    vi.mocked(api.getAdminListingReviewQueue)
      .mockResolvedValueOnce([queuedListing])
      .mockResolvedValueOnce([]);
    const onStepUpRequired = vi.fn();
    const renderer = await renderScreen({ onStepUpRequired });

    await click(renderer.root, "通过");
    expect(renderedText(renderer.root)).toContain("确认通过");

    await click(renderer.root, "确认通过");
    expect(onStepUpRequired).toHaveBeenCalledTimes(1);
    expect(api.approveAdminListing).not.toHaveBeenCalled();

    await update(renderer, {
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });
    await click(renderer.root, "确认通过");

    expect(api.approveAdminListing).toHaveBeenCalledWith("enhanced-token", queuedListing.id);
    expect(renderedText(renderer.root)).toContain(queuedListing.title);

    await act(async () => {
      approval.resolve({ ...queuedListing, status: "APPROVED" });
      await flushMicrotasks();
    });

    expect(renderedText(renderer.root)).not.toContain(queuedListing.title);
    await unmount(renderer);
  });

  it("trims a rejection reason only after confirmation and retains it when the request fails", async () => {
    vi.mocked(api.rejectAdminListing).mockRejectedValue({ status: 503 });
    const renderer = await renderScreen({
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });

    await click(renderer.root, "拒绝");
    await changeInput(renderer.root, "rejection-reason", "   ");
    expect(findButton(renderer.root, "确认拒绝").props.disabled).toBe(true);
    expect(api.rejectAdminListing).not.toHaveBeenCalled();

    await changeInput(renderer.root, "rejection-reason", "  图片无法核验  ");
    await click(renderer.root, "确认拒绝");

    expect(api.rejectAdminListing).toHaveBeenCalledWith(
      "enhanced-token",
      queuedListing.id,
      "图片无法核验"
    );
    expect(renderedText(renderer.root)).toContain(queuedListing.title);
    expect(findInput(renderer.root, "rejection-reason").props.value).toBe("  图片无法核验  ");
    await unmount(renderer);
  });

  it("routes an expired ordinary-session queue read through the authentication handler", async () => {
    vi.mocked(api.getAdminListingReviewQueue).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn();
    const renderer = await renderScreen({ onAuthenticationError });

    expect(onAuthenticationError).toHaveBeenCalledWith({ status: 401 });
    await unmount(renderer);
  });

  it("keeps a selected rejection and reason when enhanced authentication is required without retrying", async () => {
    vi.mocked(api.rejectAdminListing).mockRejectedValue({
      status: 403,
      code: "ADMIN_REAUTH_REQUIRED"
    });
    const onStepUpRequired = vi.fn();
    const renderer = await renderScreen({
      onStepUpRequired,
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });

    await click(renderer.root, "拒绝");
    await changeInput(renderer.root, "rejection-reason", "需要更清晰的所有权证明");
    await click(renderer.root, "确认拒绝");

    expect(onStepUpRequired).toHaveBeenCalledTimes(1);
    expect(api.rejectAdminListing).toHaveBeenCalledTimes(1);
    expect(renderedText(renderer.root)).toContain(queuedListing.title);
    expect(findInput(renderer.root, "rejection-reason").props.value).toBe("需要更清晰的所有权证明");
    await unmount(renderer);
  });

  it("routes a mutation 401 through authentication reset without presenting it as a failed decision", async () => {
    vi.mocked(api.approveAdminListing).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn();
    const onToast = vi.fn();
    const renderer = await renderScreen({
      onAuthenticationError,
      onToast,
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });

    await click(renderer.root, "通过");
    await click(renderer.root, "确认通过");

    expect(onAuthenticationError).toHaveBeenCalledWith({ status: 401 });
    expect(onToast).not.toHaveBeenCalledWith("审核决定已成功，但刷新失败，请重试。");
    await unmount(renderer);
  });

  it("attempts queue and catalog refreshes after a successful decision even when one refresh fails", async () => {
    vi.mocked(api.getAdminListingReviewQueue)
      .mockResolvedValueOnce([queuedListing])
      .mockResolvedValueOnce([]);
    const onCatalogChanged = vi.fn().mockRejectedValue(new Error("catalog unavailable"));
    const onToast = vi.fn();
    const renderer = await renderScreen({
      onCatalogChanged,
      onToast,
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });

    await click(renderer.root, "通过");
    await click(renderer.root, "确认通过");

    expect(api.getAdminListingReviewQueue).toHaveBeenCalledTimes(2);
    expect(onCatalogChanged).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith("审核决定已成功，但刷新失败，请重试。");
    await unmount(renderer);
  });

  it("refreshes queue, catalog, and Trust metrics independently after a successful decision", async () => {
    vi.mocked(api.getAdminListingReviewQueue)
      .mockResolvedValueOnce([queuedListing])
      .mockResolvedValueOnce([]);
    const onCatalogChanged = vi.fn().mockRejectedValue(new Error("catalog unavailable"));
    const onTrustMetricsChanged = vi.fn().mockResolvedValue(undefined);
    const renderer = await renderScreen({
      onCatalogChanged,
      onTrustMetricsChanged,
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    } as Partial<React.ComponentProps<typeof AdminTrustScreen>>);

    await click(renderer.root, "通过");
    await click(renderer.root, "确认通过");

    expect(api.getAdminListingReviewQueue).toHaveBeenCalledTimes(2);
    expect(onCatalogChanged).toHaveBeenCalledTimes(1);
    expect(onTrustMetricsChanged).toHaveBeenCalledTimes(1);
    await unmount(renderer);
  });

  it("forwards the actual 401 refresh failure when an earlier refresh fails for another reason", async () => {
    vi.mocked(api.getAdminListingReviewQueue)
      .mockResolvedValueOnce([queuedListing])
      .mockResolvedValueOnce([]);
    const catalogFailure = { status: 503 };
    const metricsAuthenticationFailure = { status: 401 };
    const onAuthenticationError = vi.fn();
    const renderer = await renderScreen({
      onCatalogChanged: vi.fn().mockRejectedValue(catalogFailure),
      onTrustMetricsChanged: vi.fn().mockRejectedValue(metricsAuthenticationFailure),
      onAuthenticationError,
      stepUpSession: {
        accessToken: "enhanced-token",
        reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
      }
    });

    await click(renderer.root, "通过");
    await click(renderer.root, "确认通过");

    expect(onAuthenticationError).toHaveBeenCalledWith(metricsAuthenticationFailure);
    await unmount(renderer);
  });
});

async function renderScreen(
  overrides: Partial<React.ComponentProps<typeof AdminTrustScreen>> = {}
) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <AdminTrustScreen
        token="ordinary-token"
        user={admin}
        stepUpSession={null}
        onStepUpRequired={vi.fn()}
        onCatalogChanged={async () => undefined}
        onTrustMetricsChanged={async () => undefined}
        onToast={vi.fn()}
        {...overrides}
      />
    );
    await flushMicrotasks();
  });
  if (!renderer) throw new Error("AdminTrustScreen renderer was not created");
  return renderer;
}

async function update(
  renderer: ReactTestRenderer,
  overrides: Partial<React.ComponentProps<typeof AdminTrustScreen>>
) {
  await act(async () => {
    renderer.update(
      <AdminTrustScreen
        token="ordinary-token"
        user={admin}
        stepUpSession={null}
        onStepUpRequired={vi.fn()}
        onCatalogChanged={async () => undefined}
        onTrustMetricsChanged={async () => undefined}
        onToast={vi.fn()}
        {...overrides}
      />
    );
    await flushMicrotasks();
  });
}

async function click(root: ReactTestInstance, label: string) {
  await act(async () => {
    findButton(root, label).props.onClick();
    await flushMicrotasks();
  });
}

async function changeInput(root: ReactTestInstance, name: string, value: string) {
  await act(async () => {
    findInput(root, name).props.onChange({ target: { value } });
    await flushMicrotasks();
  });
}

function findButton(root: ReactTestInstance, label: string) {
  const button = root.findAllByType("button").find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button ${label} was not found`);
  return button;
}

function findInput(root: ReactTestInstance, name: string) {
  const input = root.findAllByType("input").find((candidate) => candidate.props.name === name);
  if (!input) throw new Error(`Input ${name} was not found`);
  return input;
}

function renderedText(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : renderedText(child)).join("");
}

function reviewMediaBackgrounds(root: ReactTestInstance) {
  return root
    .findAll((node) => node.props.role === "img" && node.props.style?.backgroundImage)
    .map((node) => node.props.style.backgroundImage);
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
