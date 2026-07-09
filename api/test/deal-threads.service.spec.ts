import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { DealThreadsService } from "../src/deal-threads/deal-threads.service";

describe("DealThreadsService", () => {
  it("creates and reuses a listing deal thread for the current user", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);

    const first = await service.createOrFindThread("user-1", threadInput());
    const second = await service.createOrFindThread("user-1", {
      ...threadInput(),
      participantNames: ["Mia Chen", "You", "Mia Chen"]
    });

    expect(first.id).toBe(second.id);
    expect(second.participantNames).toEqual(["Mia Chen", "You"]);
    expect(second.listingTitle).toBe("El Segundo 海边通勤 2B2B");
    expect(prisma.dealThread.upsertCalls).toHaveLength(2);
  });

  it("stores trimmed outgoing DM messages on owned threads", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("user-1", threadInput());

    const updated = await service.sendMessage("user-1", thread.id, {
      body: "  Hi, can we tour after class today?  "
    });

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toMatchObject({
      body: "Hi, can we tour after class today?",
      senderName: "You",
      align: "right",
      status: "sent"
    });
  });

  it("rejects empty DM messages and hides threads owned by someone else", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("user-1", threadInput());

    await expect(service.sendMessage("user-1", thread.id, { body: "   " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sendMessage("user-2", thread.id, { body: "hello" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates viewing requests and appends a scheduling message", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("user-1", threadInput());

    const updated = await service.createViewingRequest("user-1", thread.id, {
      iso: "2026-08-21T12:00:00.000Z",
      mode: "in-person",
      participantNames: ["Mia Chen", "You"],
      timeLabel: "8月21日 周五 12:00"
    });

    expect(updated.viewingRequests).toHaveLength(1);
    expect(updated.viewingRequests[0]).toMatchObject({
      listingId: "listing-1",
      listingTitle: "El Segundo 海边通勤 2B2B",
      mode: "in-person",
      participantNames: ["Mia Chen", "You"],
      status: "REQUESTED",
      timeLabel: "8月21日 周五 12:00"
    });
    expect(updated.messages.at(-1)?.body).toContain("我想预约 8月21日 周五 12:00");
  });

  it("updates an existing active viewing request when the user adjusts time", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const thread = await service.createOrFindThread("user-1", threadInput());

    await service.createViewingRequest("user-1", thread.id, {
      iso: "2026-08-21T12:00:00.000Z",
      mode: "in-person",
      participantNames: ["Mia Chen", "You"],
      timeLabel: "8月21日 周五 12:00"
    });
    const updated = await service.createViewingRequest("user-1", thread.id, {
      iso: "2026-08-22T11:00:00.000Z",
      mode: "video",
      participantNames: ["Mia Chen", "You"],
      timeLabel: "8月22日 周六 11:00"
    });

    expect(updated.viewingRequests).toHaveLength(1);
    expect(updated.viewingRequests[0]).toMatchObject({
      mode: "video",
      timeLabel: "8月22日 周六 11:00"
    });
    expect(updated.messages.at(-1)?.body).toContain("我想调整看房到 8月22日 周六 11:00");
  });

  it("rejects deal rooms not owned by the current user and empty viewing participants", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);

    await expect(
      service.createOrFindThread("user-1", {
        ...threadInput(),
        dealRoomId: "deal-room-other"
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    const thread = await service.createOrFindThread("user-1", threadInput());
    await expect(
      service.createViewingRequest("user-1", thread.id, {
        iso: "2026-08-21T12:00:00.000Z",
        mode: "in-person",
        participantNames: [],
        timeLabel: "8月21日 周五 12:00"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists user threads with messages and viewing requests newest first", async () => {
    const prisma = createPrismaMock();
    const service = new DealThreadsService(prisma as never);
    const first = await service.createOrFindThread("user-1", threadInput({ listingId: "listing-1" }));
    const second = await service.createOrFindThread("user-1", threadInput({ listingId: "listing-2", listingTitle: "Westwood 主卧" }));
    await service.sendMessage("user-1", first.id, { body: "First thread message" });
    await service.sendMessage("user-1", second.id, { body: "Second thread message" });

    const threads = await service.findForUser("user-1");

    expect(threads.map((thread) => thread.id)).toEqual([second.id, first.id]);
    expect(threads[0].messages[0].body).toBe("Second thread message");
  });
});

function threadInput(overrides: Partial<ThreadInput> = {}) {
  return {
    area: "Los Angeles · El Segundo",
    contactName: "Alex",
    listingId: "listing-1",
    listingTitle: "El Segundo 海边通勤 2B2B",
    participantNames: ["Mia Chen", "You"],
    ...overrides
  };
}

type ThreadInput = {
  area: string;
  contactName: string;
  dealRoomId?: string;
  listingId: string;
  listingTitle: string;
  participantNames: string[];
};

type DealThreadRecord = ThreadInput & {
  id: string;
  ownerId: string;
  dealRoomId?: string;
  createdAt: Date;
  updatedAt: Date;
};

type DealMessageRecord = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  align: string;
  status: string;
  createdAt: Date;
};

type ViewingRequestRecord = {
  id: string;
  threadId: string;
  requesterId: string;
  listingId: string;
  listingTitle: string;
  area: string;
  iso: Date;
  mode: string;
  participantNames: string[];
  status: string;
  timeLabel: string;
  createdAt: Date;
  updatedAt: Date;
};

function createPrismaMock() {
  const state = {
    threads: [] as DealThreadRecord[],
    messages: [] as DealMessageRecord[],
    requests: [] as ViewingRequestRecord[],
    rooms: [
      {
        id: "deal-room-1",
        ownerId: "user-1",
        status: "ACTIVE"
      }
    ]
  };
  let tick = 0;

  function now() {
    tick += 1;
    return new Date(`2026-07-09T12:00:${tick.toString().padStart(2, "0")}.000Z`);
  }

  function includeThread(thread: DealThreadRecord) {
    return {
      ...thread,
      messages: state.messages
        .filter((message) => message.threadId === thread.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      viewingRequests: state.requests
        .filter((request) => request.threadId === thread.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    };
  }

  const mock = {
    dealRoom: {
      findFirst: async (args: { where: { id: string; ownerId: string; status: string } }) =>
        state.rooms.find(
          (room) =>
            room.id === args.where.id &&
            room.ownerId === args.where.ownerId &&
            room.status === args.where.status
        ) ?? null
    },
    dealThread: {
      upsertCalls: [] as unknown[],
      findFirstCalls: [] as unknown[],
      findManyCalls: [] as unknown[],
      upsert: async (args: {
        where: { ownerId_listingId: { ownerId: string; listingId: string } };
        create: ThreadInput & { ownerId: string };
        update: Partial<ThreadInput>;
      }) => {
        mock.dealThread.upsertCalls.push(args);
        const existing = state.threads.find(
          (thread) =>
            thread.ownerId === args.where.ownerId_listingId.ownerId &&
            thread.listingId === args.where.ownerId_listingId.listingId
        );
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: now() });
          return includeThread(existing);
        }

        const created = {
          id: `thread-${state.threads.length + 1}`,
          ...args.create,
          createdAt: now(),
          updatedAt: now()
        };
        state.threads.push(created);
        return includeThread(created);
      },
      findFirst: async (args: { where: { id: string; ownerId: string } }) => {
        mock.dealThread.findFirstCalls.push(args);
        const thread = state.threads.find(
          (record) => record.id === args.where.id && record.ownerId === args.where.ownerId
        );
        return thread ? includeThread(thread) : null;
      },
      findMany: async (args: { where: { ownerId: string }; orderBy: { updatedAt: "desc" } }) => {
        mock.dealThread.findManyCalls.push(args);
        return state.threads
          .filter((thread) => thread.ownerId === args.where.ownerId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map(includeThread);
      }
    },
    dealMessage: {
      create: async (args: { data: Omit<DealMessageRecord, "id" | "createdAt"> }) => {
        const message = {
          id: `message-${state.messages.length + 1}`,
          ...args.data,
          createdAt: now()
        };
        state.messages.push(message);
        const thread = state.threads.find((record) => record.id === args.data.threadId);
        if (thread) thread.updatedAt = now();
        return message;
      }
    },
    viewingRequest: {
      findFirst: async (args: {
        where: { threadId: string; status: { in: string[] } };
        orderBy: { updatedAt: "desc" };
      }) =>
        state.requests
          .filter(
            (request) =>
              request.threadId === args.where.threadId && args.where.status.in.includes(request.status)
          )
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null,
      create: async (args: { data: Omit<ViewingRequestRecord, "id" | "createdAt" | "updatedAt"> }) => {
        const request = {
          id: `viewing-${state.requests.length + 1}`,
          ...args.data,
          createdAt: now(),
          updatedAt: now()
        };
        state.requests.push(request);
        const thread = state.threads.find((record) => record.id === args.data.threadId);
        if (thread) thread.updatedAt = now();
        return request;
      },
      update: async (args: {
        where: { id: string };
        data: Partial<Omit<ViewingRequestRecord, "id" | "createdAt" | "updatedAt">>;
      }) => {
        const request = state.requests.find((record) => record.id === args.where.id);
        if (!request) throw new Error(`Missing request ${args.where.id}`);
        Object.assign(request, args.data, { updatedAt: now() });
        const thread = state.threads.find((record) => record.id === request.threadId);
        if (thread) thread.updatedAt = now();
        return request;
      }
    }
  };

  return mock;
}
