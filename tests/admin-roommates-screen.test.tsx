import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminRoommatesScreen } from "../components/admin-roommates-screen";
import * as api from "../lib/api";
import type { ApiRoommate, SessionUser, UpsertAdminRoommateInput } from "../lib/api";
import { ProductApiError } from "../lib/product-errors";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    archiveAdminRoommate: vi.fn(),
    createAdminRoommate: vi.fn(),
    getAdminRoommates: vi.fn(),
    updateAdminRoommate: vi.fn()
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const admin: SessionUser = {
  id: "admin-roommates-0812",
  email: "roommates-admin@example.edu",
  role: "ADMIN"
};

const existingProfile: ApiRoommate = {
  id: "roommate-profile-0812",
  name: "Avery Chen",
  age: 25,
  role: "UCLA · Graduate student",
  image: "https://images.example.test/avery.jpg",
  match: 92,
  budget: "$1,750/月",
  commute: "Westwood",
  tags: ["早睡", "安静"],
  status: "active"
};

const completeDraft: UpsertAdminRoommateInput = {
  name: "Lina Park",
  age: 23,
  role: "UCLA · Grad student · Fall 2026",
  image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  match: 90,
  budget: "$1,650/月",
  commute: "Westwood / Sawtelle",
  tags: ["早睡", "安静", "爱干净"]
};

const enhancedSession = {
  accessToken: "enhanced-token",
  reauthenticatedUntil: "2099-08-12T08:30:00.000Z"
};

describe("AdminRoommatesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAdminRoommates).mockResolvedValue([]);
    vi.mocked(api.createAdminRoommate).mockResolvedValue({
      ...completeDraft,
      id: "created-roommate-0812",
      status: "active"
    });
    vi.mocked(api.updateAdminRoommate).mockResolvedValue(existingProfile);
    vi.mocked(api.archiveAdminRoommate).mockResolvedValue({
      ...existingProfile,
      status: "hidden"
    });
  });

  it("delegates an initial ordinary-session read 401 as a normalized authentication error", async () => {
    vi.mocked(api.getAdminRoommates).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn();
    const onToast = vi.fn();
    const renderer = await renderScreen({ onAuthenticationError, onToast });

    expect(api.getAdminRoommates).toHaveBeenCalledWith("ordinary-token");
    expect(onAuthenticationError).toHaveBeenCalledTimes(1);
    const normalizedError = onAuthenticationError.mock.calls[0]?.[0];
    expect(normalizedError).toBeInstanceOf(ProductApiError);
    expect(normalizedError).toMatchObject({ status: 401, category: "authentication" });
    expect(onToast).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("delegates a manual-refresh 401 and keeps the already loaded profiles visible", async () => {
    vi.mocked(api.getAdminRoommates)
      .mockResolvedValueOnce([existingProfile])
      .mockRejectedValueOnce({ status: 401 });
    const onAuthenticationError = vi.fn();
    const onToast = vi.fn();
    const renderer = await renderScreen({ onAuthenticationError, onToast });
    onAuthenticationError.mockClear();
    onToast.mockClear();

    await click(renderer.root, "Refresh");

    expect(api.getAdminRoommates).toHaveBeenNthCalledWith(2, "ordinary-token");
    expect(onAuthenticationError).toHaveBeenCalledTimes(1);
    expect(onAuthenticationError.mock.calls[0]?.[0]).toMatchObject({
      status: 401,
      category: "authentication"
    });
    expect(onToast).not.toHaveBeenCalled();
    expect(renderedText(renderer.root)).toContain(existingProfile.name);
    await unmount(renderer);
  });

  it("keeps non-authentication read failures in the roommate workspace toast", async () => {
    vi.mocked(api.getAdminRoommates).mockRejectedValue({ status: 503 });
    const onAuthenticationError = vi.fn();
    const onToast = vi.fn();
    const renderer = await renderScreen({ onAuthenticationError, onToast });

    expect(onAuthenticationError).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("Failed to load roommate profiles"));
    await unmount(renderer);
  });

  it("requires an active step-up session before creating and leaves the draft untouched", async () => {
    const onStepUpRequired = vi.fn();
    const renderer = await renderScreen({ onStepUpRequired });

    await changeInput(renderer.root, "Name", completeDraft.name);
    await click(renderer.root, "Save profile");

    expect(onStepUpRequired).toHaveBeenCalledTimes(1);
    expect(api.createAdminRoommate).not.toHaveBeenCalled();
    expect(inputValue(renderer.root, "Name")).toBe(completeDraft.name);
    await unmount(renderer);
  });

  it("creates a roommate profile with the live enhanced token", async () => {
    const renderer = await renderScreen({ stepUpSession: enhancedSession });

    await changeInput(renderer.root, "Name", completeDraft.name);
    await click(renderer.root, "Save profile");

    expect(api.createAdminRoommate).toHaveBeenCalledWith("enhanced-token", completeDraft);
    await unmount(renderer);
  });

  it("preserves the complete create draft and asks for step-up again when the server requires reauthentication", async () => {
    vi.mocked(api.createAdminRoommate).mockRejectedValue(new ProductApiError({
      category: "permission",
      code: "ADMIN_REAUTH_REQUIRED",
      message: "需要再次验证管理员邮箱。",
      retryable: false,
      status: 403
    }));
    const onStepUpRequired = vi.fn();
    const renderer = await renderScreen({
      onStepUpRequired,
      stepUpSession: enhancedSession
    });

    await changeInput(renderer.root, "Name", completeDraft.name);
    await click(renderer.root, "Save profile");

    expect(api.createAdminRoommate).toHaveBeenCalledWith("enhanced-token", completeDraft);
    expect(onStepUpRequired).toHaveBeenCalledTimes(1);
    expect(inputValue(renderer.root, "Name")).toBe(completeDraft.name);
    await unmount(renderer);
  });

  it("routes an expired enhanced-session mutation through application authentication reset", async () => {
    vi.mocked(api.createAdminRoommate).mockRejectedValue({ status: 401 });
    const onAuthenticationError = vi.fn();
    const renderer = await renderScreen({
      onAuthenticationError,
      stepUpSession: enhancedSession
    });

    await changeInput(renderer.root, "Name", completeDraft.name);
    await click(renderer.root, "Save profile");

    expect(onAuthenticationError).toHaveBeenCalledWith({ status: 401 });
    expect(inputValue(renderer.root, "Name")).toBe(completeDraft.name);
    await unmount(renderer);
  });

  it("updates and archives a selected profile only with the live enhanced token", async () => {
    vi.mocked(api.getAdminRoommates).mockResolvedValue([existingProfile]);
    const renderer = await renderScreen({ stepUpSession: enhancedSession });

    await changeInput(renderer.root, "Name", "Avery Chen Updated");
    await click(renderer.root, "Save profile");

    expect(api.updateAdminRoommate).toHaveBeenCalledWith(
      "enhanced-token",
      existingProfile.id,
      {
        name: "Avery Chen Updated",
        age: existingProfile.age,
        role: existingProfile.role,
        image: existingProfile.image,
        match: existingProfile.match,
        budget: existingProfile.budget,
        commute: existingProfile.commute,
        tags: existingProfile.tags
      }
    );

    await click(renderer.root, "Archive");

    expect(api.archiveAdminRoommate).toHaveBeenCalledWith("enhanced-token", existingProfile.id);
    await unmount(renderer);
  });
});

async function renderScreen(
  overrides: Partial<React.ComponentProps<typeof AdminRoommatesScreen>> = {}
) {
  const props: React.ComponentProps<typeof AdminRoommatesScreen> = {
    token: "ordinary-token",
    user: admin,
    stepUpSession: null,
    onStepUpRequired: vi.fn(),
    onToast: vi.fn(),
    ...overrides
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<AdminRoommatesScreen {...props} />);
    await flushMicrotasks();
  });
  if (!renderer) throw new Error("AdminRoommatesScreen renderer was not created");
  return renderer;
}

async function click(root: ReactTestInstance, label: string) {
  await act(async () => {
    findButton(root, label).props.onClick();
    await flushMicrotasks();
  });
}

async function changeInput(root: ReactTestInstance, label: string, value: string) {
  await act(async () => {
    findInput(root, label).props.onChange({ target: { value } });
    await flushMicrotasks();
  });
}

function findButton(root: ReactTestInstance, label: string) {
  const button = root.findAllByType("button").find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button ${label} was not found`);
  return button;
}

function findInput(root: ReactTestInstance, label: string) {
  const input = root.findAllByType("input").find((candidate) => {
    const labelElement = candidate.parent?.parent;
    return labelElement?.type === "label" && renderedText(labelElement).startsWith(label);
  });
  if (!input) throw new Error(`Input ${label} was not found`);
  return input;
}

function inputValue(root: ReactTestInstance, label: string) {
  return findInput(root, label).props.value;
}

function renderedText(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : renderedText(child)).join("");
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
