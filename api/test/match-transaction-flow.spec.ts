import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";
import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";
import { RoommatesService } from "../src/roommates/roommates.service";

describe("match transaction flow", () => {
  it("authenticates a user, likes a roommate, fetches the active room, and requests a tour", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const auth = new AuthService(prisma as never, jwt, { nodeEnv: "development" });
    const dealRooms = new DealRoomsService(prisma as never);
    const roommates = new RoommatesService(prisma as never, dealRooms);

    const codeRequest = await auth.requestEmailCode("Student@Northeastern.edu ");
    if (!codeRequest.devCode) throw new Error("Expected development verification code");

    const session = await auth.verifyEmailCode({
      email: "student@northeastern.edu",
      code: codeRequest.devCode
    });
    const payload = await jwt.verifyAsync<{ sub: string; email: string; role: string }>(session.accessToken);
    const userContext = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };

    const match = await roommates.recordAction(userContext.id, "roommate-1", "LIKE");
    const activeRooms = await dealRooms.findActiveForUser(userContext.id);
    const tourRequest = await dealRooms.requestGroupTour(userContext.id, activeRooms[0].id);

    expect(userContext).toEqual({
      id: session.user.id,
      email: "student@northeastern.edu",
      role: "USER"
    });
    expect(match.action.action).toBe("LIKE");
    expect(match.dealRoom?.status).toBe("ACTIVE");
    expect(activeRooms).toHaveLength(1);
    expect(activeRooms[0].id).toBe(match.dealRoom?.id);
    expect(activeRooms[0].canRequestTour).toBe(true);
    expect(tourRequest).toMatchObject({
      dealRoomId: activeRooms[0].id,
      requesterId: userContext.id,
      status: "REQUESTED"
    });
  });
});

type VerificationCodeRecord = {
  id: string;
  email: string;
  codeHash: string;
  attemptCount: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

type UserRecord = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
};

type RoommateRecord = {
  id: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
  localReciprocalLike: boolean;
  createdAt: Date;
};

type ListingRecord = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
};

type RoommateActionRecord = {
  id: string;
  userId: string;
  roommateProfileId: string;
  action: string;
  createdAt: Date;
  updatedAt: Date;
};

type DealRoomRecord = {
  id: string;
  ownerId: string;
  roommateProfileId: string;
  status: "ACTIVE" | "ARCHIVED";
  recommendedHomes: unknown;
  pipeline: unknown;
  trustChecklist: unknown;
  createdAt: Date;
  updatedAt: Date;
  members?: DealRoomMemberRecord[];
  tourRequest?: TourRequestRecord | null;
};

type DealRoomMemberRecord = {
  id: string;
  dealRoomId: string;
  roommateProfileId: string;
  snapshot: RoommateRecord;
  createdAt: Date;
};

type TourRequestRecord = {
  id: string;
  dealRoomId: string;
  requesterId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type VerificationCodeUpdateData =
  | Partial<VerificationCodeRecord>
  | {
      attemptCount: {
        increment: number;
      };
    };

function createPrismaMock() {
  const roommate: RoommateRecord = {
    id: "roommate-1",
    name: "Mia Chen",
    age: 22,
    role: "BU MSBA - Fall",
    image: "https://example.com/mia.jpg",
    match: 94,
    budget: "$1,450/month",
    commute: "Fenway / Back Bay",
    tags: ["quiet", "early sleeper"],
    localReciprocalLike: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  };
  const listing: ListingRecord = {
    id: "listing-1",
    title: "Fenway verified sublet",
    area: "Boston Fenway",
    image: "https://example.com/home.jpg",
    price: 1420,
    originalPrice: 1680,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes to Back Bay",
    trust: ".edu verified",
    tags: ["Group friendly", "video tour"],
    score: 4.92
  };
  const state = {
    codes: [] as VerificationCodeRecord[],
    users: [] as UserRecord[],
    actions: [] as RoommateActionRecord[],
    rooms: [] as DealRoomRecord[],
    members: [] as DealRoomMemberRecord[],
    tours: [] as TourRequestRecord[]
  };

  const mock = {
    $transaction: async (operation: (transaction: object) => Promise<unknown>) =>
      operation({
        ...mock,
        $executeRaw: async () => 1
      }),
    verificationCode: {
      create: async ({ data }: { data: { email: string; codeHash: string; expiresAt: Date; attemptCount: number } }) => {
        const created = {
          id: `code-${state.codes.length + 1}`,
          ...data,
          consumedAt: null,
          createdAt: new Date()
        };
        state.codes.push(created);
        return created;
      },
      findFirst: async ({
        where,
        orderBy
      }: {
        where: { email: string; consumedAt?: null; expiresAt?: { gt: Date } };
        orderBy?: { createdAt: "desc" };
      }) => {
        const matches = state.codes.filter((code) => {
          if (code.email !== where.email) return false;
          if ("consumedAt" in where && code.consumedAt !== where.consumedAt) return false;
          if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });

        if (orderBy?.createdAt === "desc") {
          return matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        }

        return matches[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: VerificationCodeUpdateData }) => {
        const code = state.codes.find((record) => record.id === where.id);
        if (!code) return null;

        if ("attemptCount" in data && typeof data.attemptCount === "object") {
          code.attemptCount += data.attemptCount.increment;
          return code;
        }

        Object.assign(code, data);
        return code;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = state.codes.findIndex((record) => record.id === where.id);
        if (index === -1) return null;
        const [deleted] = state.codes.splice(index, 1);
        return deleted;
      },
      updateMany: async ({
        where,
        data
      }: {
        where: { email: string; consumedAt: null; id?: { not: string } };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const code of state.codes) {
          if (
            code.email === where.email &&
            code.consumedAt === where.consumedAt &&
            code.id !== where.id?.not
          ) {
            code.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      }
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        state.users.find((user) => user.id === where.id || user.email === where.email) ?? null,
      upsert: async ({
        where,
        create
      }: {
        where: { email: string };
        create: { email: string; role?: "USER" | "ADMIN" };
      }) => {
        const existing = state.users.find((user) => user.email === where.email);
        if (existing) return existing;

        const created = {
          id: `user-${state.users.length + 1}`,
          email: create.email,
          role: create.role ?? ("USER" as const),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.users.push(created);
        return created;
      }
    },
    profile: {
      upsert: async ({ where, create }: { where: { email: string }; create: { email: string } }) => ({
        id: "profile-1",
        email: where.email || create.email
      })
    },
    roommateProfile: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === roommate.id ? roommate : null),
      create: async ({ data }: { data: RoommateRecord }) => data
    },
    listing: {
      findMany: async () => [listing]
    },
    roommateAction: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { userId_roommateProfileId: { userId: string; roommateProfileId: string } };
        create: { userId: string; roommateProfileId: string; action: string };
        update: { action: string };
      }) => {
        const existing = state.actions.find(
          (action) =>
            action.userId === where.userId_roommateProfileId.userId &&
            action.roommateProfileId === where.userId_roommateProfileId.roommateProfileId
        );
        if (existing) {
          existing.action = update.action;
          existing.updatedAt = new Date();
          return existing;
        }

        const created = {
          id: `action-${state.actions.length + 1}`,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.actions.push(created);
        return created;
      }
    },
    dealRoom: {
      findUnique: async ({ where }: { where: { ownerId_roommateProfileId: { ownerId: string; roommateProfileId: string } } }) =>
        state.rooms.find(
          (room) =>
            room.ownerId === where.ownerId_roommateProfileId.ownerId &&
            room.roommateProfileId === where.ownerId_roommateProfileId.roommateProfileId
        ) ?? null,
      findFirst: async ({ where }: { where: { id: string; ownerId: string; status: "ACTIVE" } }) =>
        state.rooms.find((room) => room.id === where.id && room.ownerId === where.ownerId && room.status === where.status) ??
        null,
      findMany: async ({ where }: { where: { ownerId: string; status: "ACTIVE" } }) =>
        state.rooms
          .filter((room) => room.ownerId === where.ownerId && room.status === where.status)
          .map((room) => ({
            ...room,
            members: state.members.filter((member) => member.dealRoomId === room.id),
            tourRequest: state.tours.find((tour) => tour.dealRoomId === room.id) ?? null
          })),
      create: async ({
        data
      }: {
        data: {
          ownerId: string;
          roommateProfileId: string;
          status: "ACTIVE";
          recommendedHomes: unknown;
          pipeline: unknown;
          trustChecklist: unknown;
        };
      }) => {
        const created = {
          id: `deal-room-${state.rooms.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.rooms.push(created);
        return created;
      }
    },
    dealRoomMember: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { dealRoomId_roommateProfileId: { dealRoomId: string; roommateProfileId: string } };
        create: { dealRoomId: string; roommateProfileId: string; snapshot: RoommateRecord };
        update: { snapshot: RoommateRecord };
      }) => {
        const existing = state.members.find(
          (member) =>
            member.dealRoomId === where.dealRoomId_roommateProfileId.dealRoomId &&
            member.roommateProfileId === where.dealRoomId_roommateProfileId.roommateProfileId
        );
        if (existing) {
          existing.snapshot = update.snapshot;
          return existing;
        }

        const created = {
          id: `member-${state.members.length + 1}`,
          ...create,
          createdAt: new Date()
        };
        state.members.push(created);
        return created;
      }
    },
    tourRequest: {
      upsert: async ({
        where,
        create
      }: {
        where: { dealRoomId: string };
        create: { dealRoomId: string; requesterId: string; status: string };
        update: Record<string, never>;
      }) => {
        const existing = state.tours.find((tour) => tour.dealRoomId === where.dealRoomId);
        if (existing) return existing;

        const created = {
          id: `tour-${state.tours.length + 1}`,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.tours.push(created);
        return created;
      }
    }
  };

  return mock;
}
