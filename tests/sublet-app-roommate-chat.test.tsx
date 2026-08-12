import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  pathname: "/messages",
  push: vi.fn()
}));

const realtimeMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  create: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push })
}));

vi.mock("@/components/auth-flow-panel", () => ({
  AuthFlowPanel: () => <div data-testid="auth-flow-panel" />
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    apiPost: vi.fn(),
    getMyProfile: vi.fn(),
    getSessionUser: vi.fn(),
    updateMyProfile: vi.fn(),
    getRoommateConversations: vi.fn(),
    getRoommateMessages: vi.fn(),
    sendRoommateMessage: vi.fn(),
    markRoommateConversationRead: vi.fn()
  };
});

vi.mock("@/lib/roommate-realtime", () => ({
  createRoommateRealtimeClient: realtimeMock.create
}));

import SubletApp from "../components/sublet-app";
import * as api from "../lib/api";
import type {
  ApiProfile,
  ApiRoommateConversation,
  ApiRoommateConversationReadState,
  ApiRoommateMessage,
  SessionUser
} from "../lib/api";
import { writeStoredAuthSession } from "../lib/auth-session";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const windowListeners = new Map<string, EventListener>();
const documentListeners = new Map<string, EventListener>();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener: vi.fn((name: string, listener: EventListener) => windowListeners.set(name, listener)),
    localStorage,
    removeEventListener: vi.fn((name: string) => windowListeners.delete(name)),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    scrollTo: vi.fn()
  }
});

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    visibilityState: "visible",
    addEventListener: vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => documentListeners.delete(name))
  }
});

const user: SessionUser = {
  id: "user-a",
  email: "maya@example.edu",
  role: "USER"
};

const profile: ApiProfile = {
  id: "profile-a",
  email: user.email,
  displayName: "Maya Chen",
  avatarUrl: null,
  school: "UCLA",
  city: "Los Angeles",
  role: "renter",
  eduEmailVerified: true,
  phoneVerified: false,
  wechat: null,
  instagram: null,
  bio: null
};

const peerMessage: ApiRoommateMessage = {
  id: "message-1",
  conversationId: "conversation-a-b",
  senderRole: "peer",
  clientMessageId: "6bd26a89-51e1-45b4-a441-0cf001bdd467",
  body: "周六一起看房吗？",
  createdAt: "2026-08-12T00:00:01.000Z"
};

const conversation: ApiRoommateConversation = {
  id: "conversation-a-b",
  matchId: "match-a-b",
  peer: {
    id: "profile-b",
    name: "Mia Chen",
    age: 24,
    role: "UCLA MSBA",
    image: "/mia.jpg",
    match: 94,
    budget: "$1,500",
    commute: "15 min",
    tags: ["安静"]
  },
  latestMessage: peerMessage,
  unreadCount: 1,
  lastReadMessageId: null,
  lastReadAt: null,
  peerLastReadMessageId: null,
  peerLastReadAt: null,
  writable: true,
  lastMessageAt: peerMessage.createdAt,
  updatedAt: peerMessage.createdAt
};

const readState: ApiRoommateConversationReadState = {
  conversationId: conversation.id,
  self: { lastReadMessageId: peerMessage.id, lastReadAt: peerMessage.createdAt },
  peer: { lastReadMessageId: null, lastReadAt: null }
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  windowListeners.clear();
  documentListeners.clear();
  navigationMock.pathname = "/messages";
  realtimeMock.create.mockReturnValue({
    connect: realtimeMock.connect,
    disconnect: realtimeMock.disconnect
  });
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn().mockReturnValue("7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b")
  });
  vi.mocked(api.apiGet).mockImplementation(async () => []);
  vi.mocked(api.apiPatch).mockResolvedValue({});
  vi.mocked(api.apiPost).mockResolvedValue({});
  vi.mocked(api.getSessionUser).mockResolvedValue(user);
  vi.mocked(api.getMyProfile).mockResolvedValue(profile);
  vi.mocked(api.updateMyProfile).mockResolvedValue(profile);
  vi.mocked(api.getRoommateConversations).mockResolvedValue([conversation]);
  vi.mocked(api.getRoommateMessages).mockResolvedValue({ messages: [peerMessage], nextCursor: null });
  vi.mocked(api.markRoommateConversationRead).mockResolvedValue(readState);
  vi.mocked(api.sendRoommateMessage).mockImplementation(async (_token, conversationId, input) => ({
    id: "message-2",
    conversationId,
    senderRole: "self",
    clientMessageId: input.clientMessageId,
    body: input.body,
    createdAt: "2026-08-12T00:00:02.000Z"
  }));
  writeStoredAuthSession("stored-token");
});

describe("SubletApp roommate chat", () => {
  it("loads a durable roommate conversation into the unified inbox", async () => {
    const renderer = await renderMessagesApp();

    expect(renderedText(renderer.root)).not.toContain("室友私信暂未开放");
    expect(renderedText(renderer.root)).toContain("Mia Chen");
    expect(renderedText(renderer.root)).toContain(peerMessage.body);
    expect(vi.mocked(api.getRoommateConversations)).toHaveBeenCalledWith("stored-token");
    expect(vi.mocked(api.getRoommateMessages)).toHaveBeenCalledWith("stored-token", conversation.id);
    expect(realtimeMock.connect).toHaveBeenCalledOnce();
    await unmount(renderer);
  });

  it("renders an optimistic outgoing message and reconciles the HTTP acknowledgement", async () => {
    const sendRequest = deferred<ApiRoommateMessage>();
    vi.mocked(api.sendRoommateMessage).mockReturnValue(sendRequest.promise);
    const renderer = await renderMessagesApp();

    await changeTextarea(renderer.root, "  你好 Mia  ");
    await clickButton(renderer.root, "发送消息");

    expect(renderedText(renderer.root)).toContain("你好 Mia");
    expect(renderedText(renderer.root)).toContain("发送中");
    expect(api.sendRoommateMessage).toHaveBeenCalledWith("stored-token", conversation.id, {
      clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      body: "你好 Mia"
    });

    await act(async () => {
      sendRequest.resolve({
        id: "message-2",
        conversationId: conversation.id,
        senderRole: "self",
        clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
        body: "你好 Mia",
        createdAt: "2026-08-12T00:00:02.000Z"
      });
      await flushMicrotasks();
    });

    expect(renderedText(renderer.root)).toContain("已发送");
    expect(renderedText(renderer.root)).not.toContain("发送中");
    await unmount(renderer);
  });

  it("keeps a failed bubble and retries with the original client message id", async () => {
    vi.mocked(api.sendRoommateMessage)
      .mockRejectedValueOnce({ status: 503 })
      .mockImplementationOnce(async (_token, conversationId, input) => ({
        id: "message-2",
        conversationId,
        senderRole: "self",
        clientMessageId: input.clientMessageId,
        body: input.body,
        createdAt: "2026-08-12T00:00:02.000Z"
      }));
    const renderer = await renderMessagesApp();

    await changeTextarea(renderer.root, "重试这条");
    await clickButton(renderer.root, "发送消息");
    expect(renderedText(renderer.root)).toContain("发送失败");

    await clickButton(renderer.root, "重新发送");

    expect(api.sendRoommateMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.sendRoommateMessage).mock.calls.map(([, , input]) => input.clientMessageId)).toEqual([
      "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b"
    ]);
    expect(renderedText(renderer.root)).toContain("已发送");
    await unmount(renderer);
  });

  it("reports the last peer message read only for the visible active conversation", async () => {
    const renderer = await renderMessagesApp();

    expect(api.markRoommateConversationRead).toHaveBeenCalledWith(
      "stored-token",
      conversation.id,
      peerMessage.id
    );
    await unmount(renderer);
  });
});

async function renderMessagesApp(): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SubletApp initialSection="Messages" initialRoommateConversationId={conversation.id} />
    );
    await flushMicrotasks();
  });
  if (!renderer) throw new Error("SubletApp renderer was not created");
  return renderer;
}

async function changeTextarea(root: ReactTestInstance, value: string) {
  const textarea = root.findAllByType("textarea").find((node) =>
    String(node.props.placeholder).includes("室友")
  );
  if (!textarea) throw new Error("Roommate message textarea was not found");
  await act(async () => {
    textarea.props.onChange({ target: { value } });
  });
}

async function clickButton(root: ReactTestInstance, label: string) {
  const button = root.findAllByType("button").find((candidate) => renderedText(candidate) === label);
  if (!button) throw new Error(`Button "${label}" was not found`);
  await act(async () => {
    button.props.onClick();
    await flushMicrotasks();
  });
}

function renderedText(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : renderedText(child))).join("");
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
  await Promise.resolve();
  await Promise.resolve();
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}
