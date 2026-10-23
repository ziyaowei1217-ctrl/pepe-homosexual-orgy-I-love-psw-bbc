import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { DealThreadsService } from "../src/deal-threads/deal-threads.service";
import { LocalRoommateMessageRateLimiter } from "../src/roommate-conversations/roommate-message-rate-limit";

describe("DealThreadsService", () => {
  it("limits new messages while allowing committed retries and preserving sender quotas", async () => {
    const prisma = createPrismaMock();
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => 1_000, limit: 1 });
    const service = new DealThreadsService(prisma as never, limiter);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const message = { body: "Hello host", clientMessageId: randomUUID() };
    await service.sendMessage("renter-1", thread.id, message);
    await expect(service.sendMessage("renter-1", thread.id, message)).resolves.toMatchObject({ id: thread.id });
    await expect(service.sendMessage("renter-1", thread.id, { body: "Spam", clientMessageId: randomUUID() }))
      .rejects.toMatchObject({ status: 429 });
    await expect(service.sendMessage("host-1", thread.id, { body: "Hello renter", clientMessageId: randomUUID() }))
      .resolves.toMatchObject({ id: thread.id });
    const saved = await service.listMessages("renter-1", thread.id);
    expect(saved.messages.map((item: any) => item.body)).toEqual(["Hello host", "Hello renter"]);
  });

  it("separates deal-message quotas from roommate-message quotas", async () => {
    const prisma = createPrismaMock();
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => 1_000, limit: 1 });
    const service = new DealThreadsService(prisma as never, limiter);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    await limiter.consume({ userId: "renter-1", conversationId: thread.id });
    await expect(service.sendMessage("renter-1", thread.id, { body: "Hello host", clientMessageId: randomUUID() }))
      .resolves.toMatchObject({ id: thread.id });
  });

  it("shares quota between messages and changed viewings while exact replay preserves confirmation", async () => {
    const prisma = createPrismaMock();
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => 1_000, limit: 1, actorLimit: 1 });
    const consume = vi.spyOn(limiter, "consume");
    const service = new DealThreadsService(prisma as never, limiter);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const payload = { iso: "2026-08-21T12:00:00.000Z", mode: "video" as const,
      participantNames: ["Renter Riley"], timeLabel: "Aug 21 12:00" };

    await expect(service.createViewingRequest("other-1", thread.id, payload)).rejects.toBeInstanceOf(NotFoundException);
    expect(consume).not.toHaveBeenCalled();
    const requested = await service.createViewingRequest("renter-1", thread.id, payload);
    const requestId = requested.viewingRequests[0].id;
    await service.confirmViewingRequest("host-1", thread.id, requestId, 1);
    const replay = await service.createViewingRequest("renter-1", thread.id, payload);
    expect(replay.viewingRequests).toMatchObject([{ id: requestId, status: "CONFIRMED", revision: 2 }]);
    expect(replay.messages).toHaveLength(2);
    expect(consume).toHaveBeenCalledTimes(2);
    await expect(service.createViewingRequest("renter-1", thread.id, { ...payload, timeLabel: "Aug 21 13:00" }))
      .rejects.toMatchObject({ status: 429 });
    await expect(service.sendMessage("renter-1", thread.id, { body: "More", clientMessageId: randomUUID() }))
      .rejects.toMatchObject({ status: 429 });
    await expect(service.sendMessage("host-1", thread.id, { body: "More", clientMessageId: randomUUID() }))
      .rejects.toMatchObject({ status: 429 });
    expect(prisma.state.requests[0]).toMatchObject({ status: "CONFIRMED", revision: 2, timeLabel: payload.timeLabel });
    expect(prisma.state.messages).toHaveLength(2);
  });

  it("charges viewing decisions to ordinary message quota only after ownership and revision checks", async () => {
    const prisma = createPrismaMock();
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => 1_000, limit: 1 });
    const consume = vi.spyOn(limiter, "consume");
    const service = new DealThreadsService(prisma as never, limiter);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const requested = await service.createViewingRequest("renter-1", thread.id, {
      iso: "2026-08-21T12:00:00.000Z", mode: "video", participantNames: ["Renter Riley"], timeLabel: "Aug 21 12:00"
    });
    const requestId = requested.viewingRequests[0].id;
    await service.sendMessage("host-1", thread.id, { body: "Hello", clientMessageId: randomUUID() });
    const before = consume.mock.calls.length;
    await expect(service.confirmViewingRequest("other-1", thread.id, requestId, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.confirmViewingRequest("host-1", thread.id, requestId, 2)).rejects.toBeInstanceOf(ConflictException);
    expect(consume).toHaveBeenCalledTimes(before);
    await expect(service.confirmViewingRequest("host-1", thread.id, requestId, 1)).rejects.toMatchObject({ status: 429 });
    expect(prisma.state.requests[0]).toMatchObject({ status: "REQUESTED", revision: 1 });
  });

  it("bounds thread history and recovers all older messages with tied timestamps", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    for (let index = 0; index < 125; index += 1) {
      prisma.state.messages.push({ id: `message-${String(index).padStart(3, "0")}`, threadId: thread.id,
        senderId: index % 2 ? "host-1" : "renter-1", body: String(index), createdAt });
      prisma.state.requests.push({ id: `viewing-${String(index).padStart(3, "0")}`, threadId: thread.id,
        status: index === 124 ? "REQUESTED" : "CANCELLED", mode: "VIDEO", createdAt });
    }
    const [preview] = await service.findForUser("renter-1");
    expect(preview.messages).toHaveLength(1);
    expect(preview.messages[0].body).toBe("124");
    expect(preview.messagePageInfo).toMatchObject({ hasMore: true, nextCursor: expect.any(String) });
    expect(preview.viewingRequests).toHaveLength(50);
    expect(preview.viewingRequests.at(-1)?.status).toBe("REQUESTED");
    const detail = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    expect(detail.messages).toHaveLength(50);
    expect(detail.messages[0].body).toBe("75");
    const first = await service.listMessages("host-1", thread.id, { limit: "50" });
    const second = await service.listMessages("host-1", thread.id, { cursor: first.nextCursor, limit: "50" });
    const third = await service.listMessages("host-1", thread.id, { cursor: second.nextCursor, limit: "50" });
    const messages = [...third.messages, ...second.messages, ...first.messages];
    expect(messages.map(message => message.body)).toEqual(Array.from({ length: 125 }, (_, index) => String(index)));
    expect(new Set(messages.map(message => message.id)).size).toBe(125);
    expect(third.nextCursor).toBeNull();
    expect(first.messages.at(-1)?.align).toBe("left");
    expect(prisma.state.historyReads).toEqual([51, 51, 51]);
  });

  it("authorizes history before parsing cursors and limits before reading messages", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    await expect(service.listMessages("other-1", thread.id, { cursor: "invalid", limit: "100000" }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessages("renter-1", thread.id, { cursor: "invalid" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listMessages("renter-1", thread.id, { limit: "101" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listMessages("renter-1", thread.id, { limit: ["1", "100"] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listMessages("renter-1", thread.id, { extra: "1" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.state.historyReads).toEqual([]);
  });

  it("retains the latest updated active viewing beyond the history window using one batched inbox read", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    for (let index = 0; index < 100; index += 1) {
      prisma.state.requests.push({ id: `closed-${index}`, threadId: thread.id, status: "CANCELLED", mode: "VIDEO",
        createdAt: new Date(2026, 1, index + 1), updatedAt: new Date(2026, 1, index + 1) });
    }
    const active = { id: "old-active", threadId: thread.id, status: "CONFIRMED", mode: "VIDEO",
      createdAt: new Date(2020, 1, 1), updatedAt: new Date(2025, 1, 1) };
    prisma.state.requests.push({ ...active, id: "older-active", updatedAt: new Date(2024, 1, 1) }, active);
    const [preview] = await service.findForUser("renter-1");
    expect(preview.viewingRequests).toHaveLength(50);
    expect(preview.viewingRequests.find((request: { id: string }) => request.id === active.id)).toMatchObject({ status: "CONFIRMED" });
    expect(prisma.state.currentViewingBatchReads).toBe(1);
    const detail = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    expect(detail.viewingRequests).toHaveLength(50);
    expect(detail.viewingRequests.find((request: { id: string }) => request.id === active.id)).toMatchObject({ status: "CONFIRMED" });
    const secondThread = await service.createOrFindThread("other-1", { listingId: "listing-1" });
    prisma.state.requests.push({ ...active, id: "second-active", threadId: secondThread.id });
    const singleRead = vi.spyOn(prisma.viewingRequest, "findFirst");
    const before = prisma.state.currentViewingBatchReads;
    const hostInbox = await service.findForUser("host-1");
    expect(hostInbox).toHaveLength(2);
    expect(prisma.state.currentViewingBatchReads - before).toBe(1);
    expect(singleRead).not.toHaveBeenCalled();
  });
  it("derives listing ownership and context instead of trusting the client", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);

    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });

    expect(thread).toMatchObject({
      ownerId: "renter-1",
      listingOwnerId: "host-1",
      listingId: "listing-1",
      listingTitle: "Database listing",
      area: "LA · Westwood",
      contactName: "Host Taylor",
      participantNames: ["Renter Riley"],
      viewerRole: "renter"
    });
  });

  it("shows the same thread to renter and host with viewer-relative identity and alignment", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const created = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    await service.sendMessage("renter-1", created.id, { body: "Hello host", clientMessageId: randomUUID() });
    await service.sendMessage("host-1", created.id, { body: "Hello renter", clientMessageId: randomUUID() });

    const [renterThread] = await service.findForUser("renter-1");
    const [hostThread] = await service.findForUser("host-1");

    expect(renterThread).toMatchObject({ viewerRole: "renter", contactName: "Host Taylor" });
    expect(renterThread.messages.map((message: any) => message.align)).toEqual(["left"]);
    expect(hostThread).toMatchObject({ viewerRole: "host", contactName: "Renter Riley" });
    expect(hostThread.messages.map((message: any) => message.align)).toEqual(["right"]);
  });

  it("hides a conversation from unrelated users", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });

    await expect(service.sendMessage("other-1", thread.id, { body: "hello", clientMessageId: randomUUID() })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("rejects a different deal-room binding on an existing thread", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    await service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "room-1" });

    await expect(
      service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "room-2" })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns existing threads for unavailable listings while enforcing requested deal-room ownership and binding", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const original = await service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "room-1" });
    prisma.state.listings[0]!.status = "SUBMITTED";
    await expect(service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "room-1" }))
      .resolves.toMatchObject({ id: original.id, dealRoomId: "room-1" });
    await expect(service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "room-2" }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.createOrFindThread("renter-1", { listingId: "listing-1", dealRoomId: "not-owned" }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it("allows only the renter to create or adjust a viewing request", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const payload = {
      iso: "2026-08-21T12:00:00.000Z",
      mode: "in-person" as const,
      participantNames: ["Renter Riley"],
      timeLabel: "Aug 21 12:00"
    };

    await expect(service.createViewingRequest("host-1", thread.id, payload)).rejects.toBeInstanceOf(
      NotFoundException
    );
    const updated = await service.createViewingRequest("renter-1", thread.id, payload);
    expect(updated.viewingRequests).toMatchObject([{ status: "REQUESTED" }]);
    expect(updated.messages.at(-1)?.body).toContain("Aug 21 12:00");
  });

  it("lets the listing owner confirm and decline valid viewing requests", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const withRequest = await service.createViewingRequest("renter-1", thread.id, {
      iso: "2026-08-21T12:00:00.000Z",
      mode: "video",
      participantNames: ["Renter Riley"],
      timeLabel: "Aug 21 12:00"
    });
    const requestId = withRequest.viewingRequests[0].id;

    const confirmed = await service.confirmViewingRequest("host-1", thread.id, requestId, 1);
    expect(confirmed.viewingRequests[0].status).toBe("CONFIRMED");
    expect(confirmed.messages.at(-1)?.body).toContain("已确认");
    const declined = await service.declineViewingRequest("host-1", thread.id, requestId, 2);
    expect(declined.viewingRequests[0].status).toBe("CANCELLED");
    expect(declined.messages.at(-1)?.body).toContain("已拒绝");
  });

  it("rejects invalid host viewing transitions", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("renter-1", { listingId: "listing-1" });
    const withRequest = await service.createViewingRequest("renter-1", thread.id, {
      iso: "2026-08-21T12:00:00.000Z",
      mode: "video",
      participantNames: ["Renter Riley"],
      timeLabel: "Aug 21 12:00"
    });
    const requestId = withRequest.viewingRequests[0].id;

    await expect(service.confirmViewingRequest("renter-1", thread.id, requestId, 1)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await service.declineViewingRequest("host-1", thread.id, requestId, 1);
    await expect(service.confirmViewingRequest("host-1", thread.id, requestId, 2)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

function createPrismaMock() {
  const users = [
    { id: "renter-1", email: "renter@example.com" },
    { id: "host-1", email: "host@example.com" },
    { id: "other-1", email: "other@example.com" }
  ];
  const profiles = [
    { email: "renter@example.com", displayName: "Renter Riley" },
    { email: "host@example.com", displayName: "Host Taylor" }
  ];
  const listings = [
    {
      id: "listing-1",
      ownerId: "host-1",
      title: "Database listing",
      area: "LA · Westwood",
      status: "APPROVED"
    }
  ];
  const rooms = [
    { id: "room-1", ownerId: "renter-1", status: "ACTIVE" },
    { id: "room-2", ownerId: "renter-1", status: "ACTIVE" }
  ];
  const threads: any[] = [];
  const messages: any[] = [];
  const requests: any[] = [];
  let clock = 0;
  const now = () => new Date(2026, 0, 1, 0, 0, ++clock);
  const include = (thread: any) => ({
    ...thread,
    messages: messages.filter((item) => item.threadId === thread.id),
    viewingRequests: requests.filter((item) => item.threadId === thread.id)
  });

  const mock = {
    $queryRaw: async (query: { sql?: string; values?: string[] }) => {
      if (!query?.sql?.includes('FROM "ViewingRequest"')) return [];
      mock.state.currentViewingBatchReads += 1;
      const current = new Map<string, any>();
      for (const request of [...requests].sort((left, right) => (right.updatedAt ?? right.createdAt).getTime() - (left.updatedAt ?? left.createdAt).getTime() || right.id.localeCompare(left.id))) {
        if (query.values?.includes(request.threadId) && ["REQUESTED", "CONFIRMED"].includes(request.status) && !current.has(request.threadId)) current.set(request.threadId, request);
      }
      return [...current.values()];
    },
    $transaction: async (operation: (transaction: any) => Promise<unknown>): Promise<any> => operation(mock),
    state: { listings, messages, requests, historyReads: [] as number[], currentViewingBatchReads: 0 },
    user: {
      findUnique: async ({ where }: any) => users.find((user) => user.id === where.id) ?? null
    },
    profile: {
      findUnique: async ({ where }: any) => profiles.find((profile) => profile.email === where.email) ?? null
    },
    listing: {
      findFirst: async ({ where }: any) =>
        listings.find((listing) => listing.id === where.id && listing.status === where.status) ?? null
    },
    dealRoom: {
      findFirst: async ({ where }: any) =>
        rooms.find((room) => room.id === where.id && room.ownerId === where.ownerId && room.status === where.status) ??
        null
    },
    dealThread: {
      findUnique: async ({ where }: any) =>
        threads.find(
          (thread) =>
            thread.ownerId === where.ownerId_listingId.ownerId &&
            thread.listingId === where.ownerId_listingId.listingId
        )
          ? include(
              threads.find(
                (thread) =>
                  thread.ownerId === where.ownerId_listingId.ownerId &&
                  thread.listingId === where.ownerId_listingId.listingId
              )
            )
          : null,
      upsert: async ({ where, create, update }: any) => {
        const existing = threads.find(
          (thread) =>
            thread.ownerId === where.ownerId_listingId.ownerId &&
            thread.listingId === where.ownerId_listingId.listingId
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: now() });
          return include(existing);
        }
        const created = { id: `thread-${threads.length + 1}`, ...create, createdAt: now(), updatedAt: now() };
        threads.push(created);
        return include(created);
      },
      findMany: async ({ where }: any) =>
        threads
          .filter((thread) =>
            where.OR.some((clause: any) =>
              clause.ownerId ? thread.ownerId === clause.ownerId : thread.listingOwnerId === clause.listingOwnerId
            )
          )
          .map(include),
      findFirst: async ({ where }: any) => {
        const thread = threads.find(
          (item) =>
            item.id === where.id &&
            where.OR.some((clause: any) =>
              clause.ownerId ? item.ownerId === clause.ownerId : item.listingOwnerId === clause.listingOwnerId
            )
        );
        return thread ? include(thread) : null;
      }
    },
    dealMessage: {
      findMany: async ({ where, take }: any) => {
        mock.state.historyReads.push(take);
        return messages.filter(message => message.threadId === where.threadId && (!where.OR || where.OR.some((clause: any) =>
          clause.createdAt instanceof Date ? message.createdAt.getTime() === clause.createdAt.getTime() && message.id < clause.id.lt
            : message.createdAt < clause.createdAt.lt)))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? 1 : -1)).slice(0, take);
      },
      findUnique: async ({ where }: any) => messages.find(message =>
        message.senderId === where.senderId_clientMessageId.senderId && message.clientMessageId === where.senderId_clientMessageId.clientMessageId) ?? null,
      create: async ({ data }: any) => {
        const created = { id: `message-${messages.length + 1}`, ...data, createdAt: now() };
        messages.push(created);
        return created;
      }
    },
    viewingRequest: {
      updateMany: async ({ where, data }: any) => {
        const request = requests.find(item => Object.entries(where).every(([key, value]) => item[key] === value));
        if (!request) return { count: 0 };
        Object.assign(request, data, { revision: request.revision + data.revision.increment });
        return { count: 1 };
      },
      findFirst: async ({ where }: any) =>
        requests.filter(request => request.threadId === where.threadId && where.status.in.includes(request.status))
          .sort((left, right) => (right.updatedAt ?? right.createdAt).getTime() - (left.updatedAt ?? left.createdAt).getTime() || right.id.localeCompare(left.id))[0] ?? null,
      findUnique: async ({ where }: any) => requests.find((request) => request.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const created = {
          id: `viewing-${requests.length + 1}`,
          revision: 1,
          ...data,
          createdAt: now(),
          updatedAt: now()
        };
        requests.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const request = requests.find((item) => item.id === where.id);
        Object.assign(request, data, { revision: request.revision + (data.revision?.increment ?? 0), updatedAt: now() });
        return request;
      }
    }
  };
  return mock;
}
