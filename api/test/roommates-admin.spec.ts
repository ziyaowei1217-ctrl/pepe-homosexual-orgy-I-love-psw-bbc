import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AdminRoommatesController } from "../src/roommates/admin-roommates.controller";
import { RoommatesService } from "../src/roommates/roommates.service";
import { seedRoommates } from "../src/seed-data";

describe("AdminRoommatesController", () => {
  it("delegates profile management calls to RoommatesService", async () => {
    const roommates = createRoommatesServiceMock();
    const controller = new AdminRoommatesController(roommates as never);
    const createDto = roommateProfilePayload();
    const updateDto = { match: 96, tags: ["早睡", "安静"] };

    await expect(controller.findAll()).resolves.toEqual([{ id: "roommate-1" }]);
    await expect(controller.create(createDto)).resolves.toEqual({ id: "created-roommate" });
    await expect(controller.update("roommate-1", updateDto)).resolves.toEqual({ id: "roommate-1", ...updateDto });
    await expect(controller.archive("roommate-1")).resolves.toEqual({ id: "roommate-1", status: "hidden" });

    expect(roommates.findAdminProfilesCalls).toBe(1);
    expect(roommates.createAdminProfileCalls).toEqual([createDto]);
    expect(roommates.updateAdminProfileCalls).toEqual([
      { id: "roommate-1", dto: updateDto },
      { id: "roommate-1", dto: { status: "hidden" } }
    ]);
  });
});

describe("RoommatesService admin profile management", () => {
  it("materializes seed profiles into the database when an admin edits them", async () => {
    const prisma = createPrismaMock();
    const service = new RoommatesService(prisma as never, {} as never);
    const seedProfile = seedRoommates[0]!;

    await expect(service.updateAdminProfile(seedProfile.id, { match: 99, tags: ["早睡", "安静", "超爱干净"] }))
      .resolves
      .toMatchObject({
        id: seedProfile.id,
        match: 99,
        tags: ["早睡", "安静", "超爱干净"]
      });

    expect(prisma.roommateProfile.createCalls).toHaveLength(1);
    expect(prisma.roommateProfile.createCalls[0].data).toMatchObject({
      id: seedProfile.id,
      name: seedProfile.name,
      match: 99,
      tags: ["早睡", "安静", "超爱干净"]
    });
  });

  it("throws when an admin updates an unknown roommate profile", async () => {
    const prisma = createPrismaMock();
    const service = new RoommatesService(prisma as never, {} as never);

    await expect(service.updateAdminProfile("missing-roommate", { match: 70 })).rejects.toThrow(NotFoundException);
  });

  it("excludes inactive and already-actioned profiles from authenticated decks", async () => {
    const prisma = createPrismaMock();
    await prisma.roommateProfile.create({ data: { ...roommateProfilePayload(), id: "active-roommate" } });
    await prisma.roommateProfile.create({
      data: {
        ...roommateProfilePayload(),
        id: "hidden-roommate",
        name: "Hidden Roomie",
        status: "hidden",
        archivedAt: new Date()
      }
    });
    prisma.roommateAction.records.push({
      userId: "user-1",
      roommateProfileId: "active-roommate"
    });
    const service = new RoommatesService(prisma as never, {} as never);

    await expect(service.findDeck({ limit: 5 }, "user-1")).resolves.toMatchObject({
      items: [],
      pageInfo: {
        returned: 0,
        totalCandidates: 0
      }
    });
  });
});

function roommateProfilePayload() {
  return {
    name: "Taylor Kim",
    age: 23,
    role: "UCLA · Grad student",
    image: "https://example.com/taylor.jpg",
    match: 91,
    budget: "$1,680/月",
    commute: "Westwood / Sawtelle",
    tags: ["早睡", "安静", "爱干净"]
  };
}

function createRoommatesServiceMock() {
  const service = {
    findAdminProfilesCalls: 0,
    createAdminProfileCalls: [] as Array<ReturnType<typeof roommateProfilePayload>>,
    updateAdminProfileCalls: [] as Array<{ id: string; dto: { match?: number; tags?: string[]; status?: string } }>,
    findAdminProfiles: async () => {
      service.findAdminProfilesCalls += 1;
      return [{ id: "roommate-1" }];
    },
    createAdminProfile: async (dto: ReturnType<typeof roommateProfilePayload>) => {
      service.createAdminProfileCalls.push(dto);
      return { id: "created-roommate" };
    },
    updateAdminProfile: async (id: string, dto: { match?: number; tags?: string[]; status?: string }) => {
      service.updateAdminProfileCalls.push({ id, dto });
      return { id, ...dto };
    }
  };

  return service;
}

function createPrismaMock() {
  type RoommateTestRecord = ReturnType<typeof roommateProfilePayload> & {
    id: string;
    status?: string;
    archivedAt?: Date | null;
    createdAt?: Date;
  };
  const records: RoommateTestRecord[] = [];

  const mock = {
    roommateProfile: {
      createCalls: [] as Array<{ data: RoommateTestRecord }>,
      updateCalls: [] as Array<{ where: { id: string }; data: Partial<RoommateTestRecord> }>,
      findMany: async ({ where }: { where?: { status?: string } } = {}) =>
        records.filter((record) => !where?.status || record.status === where.status),
      findUnique: async ({ where }: { where: { id: string } }) =>
        records.find((record) => record.id === where.id) ?? null,
      create: async ({ data }: { data: RoommateTestRecord }) => {
        mock.roommateProfile.createCalls.push({ data });
        const created = { status: "active", archivedAt: null, createdAt: new Date(), ...data, id: data.id ?? "created-roommate" };
        records.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RoommateTestRecord> }) => {
        mock.roommateProfile.updateCalls.push({ where, data });
        const existing = records.find((record) => record.id === where.id);
        if (!existing) throw new Error("Missing test record");
        Object.assign(existing, data);
        return existing;
      }
    },
    roommateAction: {
      records: [] as Array<{ userId: string; roommateProfileId: string }>,
      findMany: async ({ where }: { where: { userId: string }; select: { roommateProfileId: true } }) =>
        mock.roommateAction.records
          .filter((record) => record.userId === where.userId)
          .map((record) => ({ roommateProfileId: record.roommateProfileId }))
    }
  };

  return mock;
}
