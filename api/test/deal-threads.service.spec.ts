import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DealThreadsService } from "../src/deal-threads/deal-threads.service";

describe("DealThreadsService", () => {
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
    expect(renterThread.messages.map((message: any) => message.align)).toEqual(["right", "left"]);
    expect(hostThread).toMatchObject({ viewerRole: "host", contactName: "Renter Riley" });
    expect(hostThread.messages.map((message: any) => message.align)).toEqual(["left", "right"]);
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
    $queryRaw: async () => [],
    $transaction: async (operation: (transaction: any) => Promise<unknown>): Promise<any> => operation(mock),
    state: { listings },
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
        requests.find(
          (request) => request.threadId === where.threadId && where.status.in.includes(request.status)
        ) ?? null,
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
