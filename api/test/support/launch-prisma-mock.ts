type UserRole = "USER" | "ADMIN";
type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type RoommateActionType = "LIKE" | "PASS" | "LATER";
type DealRoomStatus = "ACTIVE" | "ARCHIVED";
type TourRequestStatus = "REQUESTED" | "SCHEDULED" | "CANCELLED";

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
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

type ListingRecord = {
  id: string;
  ownerId: string;
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
  status: ListingStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewerId: string | null;
  rejectionReason: string | null;
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
  createdAt: Date;
};

type RoommateActionRecord = {
  id: string;
  userId: string;
  roommateProfileId: string;
  action: RoommateActionType;
  createdAt: Date;
  updatedAt: Date;
};

type DealRoomRecord = {
  id: string;
  ownerId: string;
  roommateProfileId: string;
  status: DealRoomStatus;
  recommendedHomes: unknown;
  pipeline: unknown;
  trustChecklist: unknown;
  createdAt: Date;
  updatedAt: Date;
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
  status: TourRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

type VerificationCodeWhere = {
  email: string;
  consumedAt?: null;
  expiresAt?: { gt: Date };
};

type ListingWhere = {
  id?: string;
  ownerId?: string;
  status?: ListingStatus;
};

type ListingOrderBy = {
  createdAt?: "asc" | "desc";
  updatedAt?: "asc" | "desc";
  submittedAt?: "asc" | "desc";
  score?: "asc" | "desc";
};

export function createLaunchPrismaMock() {
  const state = {
    codes: [] as VerificationCodeRecord[],
    users: [] as UserRecord[],
    listings: [] as ListingRecord[],
    roommates: [] as RoommateRecord[],
    actions: [] as RoommateActionRecord[],
    rooms: [] as DealRoomRecord[],
    members: [] as DealRoomMemberRecord[],
    tours: [] as TourRequestRecord[]
  };

  const mock = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $queryRaw: async () => [{ ok: 1 }],
    verificationCode: {
      create: async ({ data }: { data: Pick<VerificationCodeRecord, "email" | "codeHash" | "expiresAt" | "attemptCount"> }) => {
        const created: VerificationCodeRecord = {
          id: `code-${state.codes.length + 1}`,
          ...data,
          consumedAt: null,
          createdAt: new Date()
        };
        state.codes.push(created);
        return created;
      },
      findFirst: async ({ where, orderBy }: { where: VerificationCodeWhere; orderBy?: { createdAt: "desc" } }) => {
        const matches = state.codes.filter((code) => matchesVerificationCode(code, where));
        if (orderBy?.createdAt === "desc") {
          return [...matches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        }
        return matches[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<VerificationCodeRecord> | { attemptCount: { increment: number } } }) => {
        const code = state.codes.find((record) => record.id === where.id);
        if (!code) return null;

        if ("attemptCount" in data && typeof data.attemptCount === "object") {
          code.attemptCount += data.attemptCount.increment;
          return code;
        }

        Object.assign(code, definedData(data));
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
          if (code.email === where.email && code.consumedAt === where.consumedAt && code.id !== where.id?.not) {
            code.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      }
    },
    user: {
      upsert: async ({ where, create }: { where: { email: string }; create: { email: string } }) => {
        const existing = state.users.find((user) => user.email === where.email);
        if (existing) return existing;

        const created: UserRecord = {
          id: `user-${state.users.length + 1}`,
          email: create.email,
          role: create.email === "admin@example.com" ? "ADMIN" : "USER",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.users.push(created);
        return created;
      }
    },
    listing: {
      findMany: async ({ where, orderBy, take }: { where?: ListingWhere; orderBy?: ListingOrderBy; take?: number } = {}) => {
        const filtered = state.listings.filter((listing) => matchesListing(listing, where));
        const sorted = sortListings(filtered, orderBy);
        return typeof take === "number" ? sorted.slice(0, take) : sorted;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.listings.find((listing) => listing.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<Partial<ListingRecord>, "id" | "createdAt" | "updatedAt"> & Pick<ListingRecord, "ownerId" | "title"> }) => {
        const created: ListingRecord = {
          id: `listing-${state.listings.length + 1}`,
          ownerId: data.ownerId,
          title: data.title,
          area: data.area ?? "",
          image: data.image ?? "",
          price: data.price ?? 0,
          originalPrice: data.originalPrice ?? 0,
          beds: data.beds ?? 0,
          baths: data.baths ?? 0,
          commute: data.commute ?? "",
          transit: data.transit ?? "",
          trust: data.trust ?? "",
          tags: data.tags ?? [],
          score: data.score ?? 4.8,
          status: data.status ?? "DRAFT",
          submittedAt: data.submittedAt ?? null,
          reviewedAt: data.reviewedAt ?? null,
          reviewerId: data.reviewerId ?? null,
          rejectionReason: data.rejectionReason ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.listings.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ListingRecord> }) => {
        const listing = state.listings.find((record) => record.id === where.id);
        if (!listing) throw new Error(`Missing listing ${where.id}`);

        Object.assign(listing, definedData(data), { updatedAt: new Date() });
        return listing;
      }
    },
    roommateProfile: {
      findMany: async () => state.roommates.length > 0 ? [...state.roommates].sort((a, b) => b.match - a.match) : [],
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.roommates.find((roommate) => roommate.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<RoommateRecord, "createdAt"> }) => {
        const created: RoommateRecord = {
          ...data,
          createdAt: new Date()
        };
        state.roommates.push(created);
        return created;
      }
    },
    roommateAction: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { userId_roommateProfileId: { userId: string; roommateProfileId: string } };
        create: Pick<RoommateActionRecord, "userId" | "roommateProfileId" | "action">;
        update: Pick<RoommateActionRecord, "action">;
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

        const created: RoommateActionRecord = {
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
      findUnique: async ({
        where
      }: {
        where: { id?: string; ownerId_roommateProfileId?: { ownerId: string; roommateProfileId: string } };
      }) => {
        if (where.ownerId_roommateProfileId) {
          return state.rooms.find(
            (room) =>
              room.ownerId === where.ownerId_roommateProfileId!.ownerId &&
              room.roommateProfileId === where.ownerId_roommateProfileId!.roommateProfileId
          ) ?? null;
        }
        return state.rooms.find((room) => room.id === where.id) ?? null;
      },
      findFirst: async ({ where }: { where: { id: string; ownerId: string; status: DealRoomStatus } }) =>
        state.rooms.find((room) => room.id === where.id && room.ownerId === where.ownerId && room.status === where.status) ?? null,
      findMany: async ({
        where,
        include
      }: {
        where: { ownerId: string; status: DealRoomStatus };
        include?: { members?: boolean; tourRequest?: boolean };
      }) => {
        const rooms = state.rooms.filter((room) => room.ownerId === where.ownerId && room.status === where.status);
        return rooms.map((room) => withDealRoomIncludes(room, state.members, state.tours, include));
      },
      create: async ({ data }: { data: Omit<DealRoomRecord, "id" | "createdAt" | "updatedAt"> }) => {
        const created: DealRoomRecord = {
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
        create: Pick<DealRoomMemberRecord, "dealRoomId" | "roommateProfileId" | "snapshot">;
        update: Pick<DealRoomMemberRecord, "snapshot">;
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

        const created: DealRoomMemberRecord = {
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
        create: Pick<TourRequestRecord, "dealRoomId" | "requesterId" | "status">;
        update: Record<string, never>;
      }) => {
        const existing = state.tours.find((tour) => tour.dealRoomId === where.dealRoomId);
        if (existing) return existing;

        const created: TourRequestRecord = {
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

function matchesVerificationCode(code: VerificationCodeRecord, where: VerificationCodeWhere) {
  if (code.email !== where.email) return false;
  if ("consumedAt" in where && code.consumedAt !== where.consumedAt) return false;
  if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) return false;
  return true;
}

function matchesListing(listing: ListingRecord, where: ListingWhere = {}) {
  if (where.id && listing.id !== where.id) return false;
  if (where.ownerId && listing.ownerId !== where.ownerId) return false;
  if (where.status && listing.status !== where.status) return false;
  return true;
}

function sortListings(listings: ListingRecord[], orderBy: ListingOrderBy = {}) {
  const [field, direction] = Object.entries(orderBy)[0] ?? [];
  if (!field || !direction) return [...listings];

  return [...listings].sort((first, second) => {
    const firstValue = orderValue(first[field as keyof ListingOrderBy]);
    const secondValue = orderValue(second[field as keyof ListingOrderBy]);
    return direction === "asc" ? firstValue - secondValue : secondValue - firstValue;
  });
}

function orderValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function withDealRoomIncludes(
  room: DealRoomRecord,
  members: DealRoomMemberRecord[],
  tours: TourRequestRecord[],
  include: { members?: boolean; tourRequest?: boolean } = {}
) {
  return {
    ...room,
    ...(include.members ? { members: members.filter((member) => member.dealRoomId === room.id) } : {}),
    ...(include.tourRequest ? { tourRequest: tours.find((tour) => tour.dealRoomId === room.id) ?? null } : {})
  };
}
