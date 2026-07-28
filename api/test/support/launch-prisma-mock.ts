type UserRole = "USER" | "ADMIN";
type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type RoommateActionType = "LIKE" | "PASS" | "LATER";
type DealRoomStatus = "ACTIVE" | "ARCHIVED";
type TourRequestStatus = "REQUESTED" | "SCHEDULED" | "CANCELLED";
type ViewingMode = "IN_PERSON" | "VIDEO";
type ViewingRequestStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

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

type ListingMediaRecord = {
  id: string;
  listingId: string;
  url: string;
  kind: string;
  sortOrder: number;
  createdAt: Date;
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
  status?: string;
  archivedAt?: Date | null;
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

type DealThreadRecord = {
  id: string;
  ownerId: string;
  dealRoomId: string | null;
  listingId: string;
  listingTitle: string;
  area: string;
  contactName: string;
  participantNames: string[];
  createdAt: Date;
  updatedAt: Date;
};

type DealMessageRecord = {
  id: string;
  threadId: string;
  senderId: string | null;
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
  timeLabel: string;
  iso: Date;
  mode: ViewingMode;
  participantNames: string[];
  status: ViewingRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

type GroupRecord = {
  id: string;
  name: string;
  budget: string;
  members: unknown;
  createdAt: Date;
};

type BookingRecord = {
  id: string;
  listingId: string;
  title: string;
  amount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type TrustQueueItemRecord = {
  id: string;
  label: string;
  value: number;
  variant: string;
  createdAt: Date;
  updatedAt: Date;
};

type ProfileRecord = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  school: string | null;
  city: string | null;
  role: string;
  eduEmailVerified: boolean;
  phoneVerified: boolean;
  wechat: string | null;
  instagram: string | null;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoommateMatchingProfileRecord = {
  id: string;
  userId: string;
  school: string | null;
  city: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInDate: Date | null;
  moveOutDate: Date | null;
  preferredNeighborhoods: string[];
  roomType: string | null;
  cleanliness: string | null;
  sleepSchedule: string | null;
  smoking: string | null;
  pets: string | null;
  guests: string | null;
  intro: string | null;
  lookingFor: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type HousingListingRecord = {
  id: string;
  ownerId: string;
  title: string;
  listingType: string;
  propertyType: string;
  roomType: string;
  priceMonthly: number;
  depositAmount: number | null;
  city: string;
  neighborhood: string | null;
  schoolNearby: string | null;
  addressApprox: string | null;
  lat: number | null;
  lng: number | null;
  moveInDate: Date;
  moveOutDate: Date | null;
  flexibleDates: boolean;
  bedrooms: number;
  bathrooms: number;
  furnished: boolean;
  utilitiesIncluded: boolean;
  laundry: boolean;
  parking: boolean;
  petsAllowed: boolean;
  leaseApproved: boolean;
  description: string | null;
  photoUrls: string[];
  status: string;
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

type ListingInclude = {
  media?: {
    orderBy?: {
      sortOrder?: "asc" | "desc";
    };
  };
};

type DealThreadInclude = {
  messages?: {
    orderBy?: {
      createdAt?: "asc" | "desc";
    };
  };
  viewingRequests?: {
    orderBy?: {
      createdAt?: "asc" | "desc";
    };
  };
};

export function createLaunchPrismaMock() {
  const state = {
    codes: [] as VerificationCodeRecord[],
    users: [] as UserRecord[],
    listings: [] as ListingRecord[],
    listingMedia: [] as ListingMediaRecord[],
    roommates: [] as RoommateRecord[],
    actions: [] as RoommateActionRecord[],
    rooms: [] as DealRoomRecord[],
    members: [] as DealRoomMemberRecord[],
    tours: [] as TourRequestRecord[],
    dealThreads: [] as DealThreadRecord[],
    dealMessages: [] as DealMessageRecord[],
    viewingRequests: [] as ViewingRequestRecord[],
    groups: [] as GroupRecord[],
    bookings: [] as BookingRecord[],
    trustQueueItems: [] as TrustQueueItemRecord[],
    profiles: [] as ProfileRecord[],
    roommateMatchingProfiles: [] as RoommateMatchingProfileRecord[],
    housingListings: [] as HousingListingRecord[]
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
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.users.find((user) => user.id === where.id) ?? null,
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
    profile: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        state.profiles.find((profile) => profile.id === where.id || profile.email === where.email) ?? null,
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { email: string };
        create: Pick<ProfileRecord, "email"> & Partial<ProfileRecord>;
        update: Partial<ProfileRecord>;
      }) => {
        const existing = state.profiles.find((profile) => profile.email === where.email);
        if (existing) {
          Object.assign(existing, definedData(update), { updatedAt: new Date() });
          return existing;
        }

        const created: ProfileRecord = {
          id: `profile-${state.profiles.length + 1}`,
          email: create.email,
          displayName: create.displayName ?? null,
          avatarUrl: create.avatarUrl ?? null,
          school: create.school ?? null,
          city: create.city ?? null,
          role: create.role ?? "renter",
          eduEmailVerified: create.eduEmailVerified ?? false,
          phoneVerified: create.phoneVerified ?? false,
          wechat: create.wechat ?? null,
          instagram: create.instagram ?? null,
          bio: create.bio ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.profiles.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ProfileRecord> }) => {
        const profile = state.profiles.find((record) => record.id === where.id);
        if (!profile) throw new Error(`Missing profile ${where.id}`);

        Object.assign(profile, definedData(data), { updatedAt: new Date() });
        return profile;
      }
    },
    roommateMatchingProfile: {
      create: async ({
        data
      }: {
        data: Pick<RoommateMatchingProfileRecord, "userId"> & Partial<RoommateMatchingProfileRecord>;
      }) => {
        const created: RoommateMatchingProfileRecord = {
          id: `roommate-profile-${state.roommateMatchingProfiles.length + 1}`,
          userId: data.userId,
          school: data.school ?? null,
          city: data.city ?? null,
          budgetMin: data.budgetMin ?? null,
          budgetMax: data.budgetMax ?? null,
          moveInDate: data.moveInDate ?? null,
          moveOutDate: data.moveOutDate ?? null,
          preferredNeighborhoods: data.preferredNeighborhoods ?? [],
          roomType: data.roomType ?? null,
          cleanliness: data.cleanliness ?? null,
          sleepSchedule: data.sleepSchedule ?? null,
          smoking: data.smoking ?? null,
          pets: data.pets ?? null,
          guests: data.guests ?? null,
          intro: data.intro ?? null,
          lookingFor: data.lookingFor ?? null,
          status: data.status ?? "active",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.roommateMatchingProfiles.push(created);
        return created;
      },
      findMany: async ({ where }: { where?: Partial<RoommateMatchingProfileRecord> } = {}) =>
        state.roommateMatchingProfiles.filter((profile) => matchesPartial(profile, where)),
      findFirst: async ({ where }: { where: Partial<RoommateMatchingProfileRecord> }) =>
        state.roommateMatchingProfiles.find((profile) => matchesPartial(profile, where)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<RoommateMatchingProfileRecord> }) => {
        const profile = state.roommateMatchingProfiles.find((record) => record.id === where.id);
        if (!profile) throw new Error(`Missing roommate matching profile ${where.id}`);

        Object.assign(profile, definedData(data), { updatedAt: new Date() });
        return profile;
      }
    },
    housingListing: {
      create: async ({ data }: { data: Pick<HousingListingRecord, "ownerId" | "title"> & Partial<HousingListingRecord> }) => {
        const created: HousingListingRecord = {
          id: `housing-listing-${state.housingListings.length + 1}`,
          ownerId: data.ownerId,
          title: data.title,
          listingType: data.listingType ?? "sublet",
          propertyType: data.propertyType ?? "apartment",
          roomType: data.roomType ?? "private_room",
          priceMonthly: data.priceMonthly ?? 1,
          depositAmount: data.depositAmount ?? null,
          city: data.city ?? "",
          neighborhood: data.neighborhood ?? null,
          schoolNearby: data.schoolNearby ?? null,
          addressApprox: data.addressApprox ?? null,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          moveInDate: data.moveInDate ?? new Date(),
          moveOutDate: data.moveOutDate ?? null,
          flexibleDates: data.flexibleDates ?? false,
          bedrooms: data.bedrooms ?? 0,
          bathrooms: data.bathrooms ?? 0,
          furnished: data.furnished ?? false,
          utilitiesIncluded: data.utilitiesIncluded ?? false,
          laundry: data.laundry ?? false,
          parking: data.parking ?? false,
          petsAllowed: data.petsAllowed ?? false,
          leaseApproved: data.leaseApproved ?? false,
          description: data.description ?? null,
          photoUrls: data.photoUrls ?? [],
          status: data.status ?? "draft",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.housingListings.push(created);
        return created;
      },
      findMany: async ({ where }: { where?: Partial<HousingListingRecord> } = {}) =>
        state.housingListings.filter((listing) => matchesPartial(listing, where)),
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.housingListings.find((listing) => listing.id === where.id) ?? null,
      findFirst: async ({ where }: { where: Partial<HousingListingRecord> }) =>
        state.housingListings.find((listing) => matchesPartial(listing, where)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<HousingListingRecord> }) => {
        const listing = state.housingListings.find((record) => record.id === where.id);
        if (!listing) throw new Error(`Missing housing listing ${where.id}`);

        Object.assign(listing, definedData(data), { updatedAt: new Date() });
        return listing;
      }
    },
    listing: {
      findMany: async ({
        where,
        orderBy,
        take,
        include
      }: {
        where?: ListingWhere;
        orderBy?: ListingOrderBy;
        take?: number;
        include?: ListingInclude;
      } = {}) => {
        const filtered = state.listings.filter((listing) => matchesListing(listing, where));
        const sorted = sortListings(filtered, orderBy);
        const records = typeof take === "number" ? sorted.slice(0, take) : sorted;
        return records.map((listing) => withListingIncludes(listing, state.listingMedia, include));
      },
      findUnique: async ({ where, include }: { where: { id: string }; include?: ListingInclude }) => {
        const listing = state.listings.find((record) => record.id === where.id);
        return listing ? withListingIncludes(listing, state.listingMedia, include) : null;
      },
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
    listingMedia: {
      create: async ({
        data
      }: {
        data: Pick<ListingMediaRecord, "listingId" | "url" | "kind" | "sortOrder">;
      }) => {
        const created: ListingMediaRecord = {
          id: `media-${state.listingMedia.length + 1}`,
          ...data,
          createdAt: new Date()
        };
        state.listingMedia.push(created);
        return created;
      }
    },
    roommateProfile: {
      findMany: async ({ where }: { where?: { status?: string } } = {}) =>
        state.roommates.length > 0
          ? [...state.roommates]
              .filter((roommate) => !where?.status || (roommate.status ?? "active") === where.status)
              .sort((a, b) => b.match - a.match)
          : [],
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.roommates.find((roommate) => roommate.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<RoommateRecord, "createdAt"> }) => {
        const created: RoommateRecord = {
          status: "active",
          archivedAt: null,
          ...data,
          createdAt: new Date()
        };
        state.roommates.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RoommateRecord> }) => {
        const existing = state.roommates.find((roommate) => roommate.id === where.id);
        if (!existing) throw new Error("Roommate profile not found");
        Object.assign(existing, data);
        return existing;
      }
    },
    roommateAction: {
      findMany: async ({ where }: { where: { userId: string }; select?: { roommateProfileId: true } }) =>
        state.actions
          .filter((action) => action.userId === where.userId)
          .map((action) => ({ roommateProfileId: action.roommateProfileId })),
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
    },
    dealThread: {
      upsert: async ({
        where,
        create,
        update,
        include
      }: {
        where: { ownerId_listingId: { ownerId: string; listingId: string } };
        create: Pick<DealThreadRecord, "ownerId" | "listingId" | "listingTitle" | "area" | "contactName"> &
          Partial<Pick<DealThreadRecord, "dealRoomId" | "participantNames">>;
        update: Partial<Pick<DealThreadRecord, "dealRoomId" | "listingTitle" | "area" | "contactName" | "participantNames">>;
        include?: DealThreadInclude;
      }) => {
        const existing = state.dealThreads.find(
          (thread) =>
            thread.ownerId === where.ownerId_listingId.ownerId && thread.listingId === where.ownerId_listingId.listingId
        );
        if (existing) {
          Object.assign(existing, definedData(update), { updatedAt: new Date() });
          return withDealThreadIncludes(existing, state.dealMessages, state.viewingRequests, include);
        }

        const created: DealThreadRecord = {
          id: `deal-thread-${state.dealThreads.length + 1}`,
          ownerId: create.ownerId,
          dealRoomId: create.dealRoomId ?? null,
          listingId: create.listingId,
          listingTitle: create.listingTitle,
          area: create.area,
          contactName: create.contactName,
          participantNames: create.participantNames ?? [],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.dealThreads.push(created);
        return withDealThreadIncludes(created, state.dealMessages, state.viewingRequests, include);
      },
      findFirst: async ({
        where,
        include
      }: {
        where: { id?: string; ownerId?: string };
        include?: DealThreadInclude;
      }) => {
        const thread =
          state.dealThreads.find(
            (record) =>
              (where.id === undefined || record.id === where.id) &&
              (where.ownerId === undefined || record.ownerId === where.ownerId)
          ) ?? null;
        return thread ? withDealThreadIncludes(thread, state.dealMessages, state.viewingRequests, include) : null;
      },
      findMany: async ({
        where,
        include,
        orderBy
      }: {
        where?: { ownerId?: string };
        include?: DealThreadInclude;
        orderBy?: { updatedAt?: "asc" | "desc" };
      } = {}) => {
        const filtered = state.dealThreads.filter(
          (thread) => where?.ownerId === undefined || thread.ownerId === where.ownerId
        );
        return sortByDate(filtered, "updatedAt", orderBy?.updatedAt).map((thread) =>
          withDealThreadIncludes(thread, state.dealMessages, state.viewingRequests, include)
        );
      }
    },
    dealMessage: {
      create: async ({
        data
      }: {
        data: Omit<DealMessageRecord, "id" | "createdAt">;
      }) => {
        const created: DealMessageRecord = {
          id: `deal-message-${state.dealMessages.length + 1}`,
          ...data,
          senderId: data.senderId ?? null,
          align: data.align ?? "right",
          status: data.status ?? "sent",
          createdAt: new Date()
        };
        state.dealMessages.push(created);
        const thread = state.dealThreads.find((record) => record.id === data.threadId);
        if (thread) thread.updatedAt = new Date();
        return created;
      }
    },
    viewingRequest: {
      findFirst: async ({
        where,
        orderBy
      }: {
        where: { threadId?: string; status?: { in?: ViewingRequestStatus[] } };
        orderBy?: { updatedAt?: "asc" | "desc"; createdAt?: "asc" | "desc" };
      }) => {
        const matches = state.viewingRequests.filter(
          (request) =>
            (where.threadId === undefined || request.threadId === where.threadId) &&
            (where.status?.in === undefined || where.status.in.includes(request.status))
        );
        const sorted = orderBy?.updatedAt
          ? sortByDate(matches, "updatedAt", orderBy.updatedAt)
          : sortByDate(matches, "createdAt", orderBy?.createdAt);

        return sorted[0] ?? null;
      },
      create: async ({
        data
      }: {
        data: Omit<ViewingRequestRecord, "id" | "createdAt" | "updatedAt">;
      }) => {
        const created: ViewingRequestRecord = {
          id: `viewing-request-${state.viewingRequests.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.viewingRequests.push(created);
        const thread = state.dealThreads.find((record) => record.id === data.threadId);
        if (thread) thread.updatedAt = new Date();
        return created;
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<Omit<ViewingRequestRecord, "id" | "createdAt" | "updatedAt">>;
      }) => {
        const request = state.viewingRequests.find((record) => record.id === where.id);
        if (!request) throw new Error(`Missing viewing request ${where.id}`);

        Object.assign(request, definedData(data), { updatedAt: new Date() });
        const thread = state.dealThreads.find((record) => record.id === request.threadId);
        if (thread) thread.updatedAt = new Date();
        return request;
      }
    },
    group: {
      findMany: async ({ orderBy }: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) =>
        sortByDate(state.groups, "createdAt", orderBy?.createdAt)
    },
    booking: {
      findMany: async ({ orderBy }: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) =>
        sortByDate(state.bookings, "createdAt", orderBy?.createdAt)
    },
    trustQueueItem: {
      findMany: async ({ orderBy }: { orderBy?: { updatedAt?: "asc" | "desc" } } = {}) =>
        sortByDate(state.trustQueueItems, "updatedAt", orderBy?.updatedAt)
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

function sortListingMedia(media: ListingMediaRecord[], direction: "asc" | "desc" = "asc") {
  return [...media].sort((first, second) =>
    direction === "desc" ? second.sortOrder - first.sortOrder : first.sortOrder - second.sortOrder
  );
}

function orderValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function definedData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function matchesPartial<T extends Record<string, unknown>>(record: T, where: Partial<T> = {}) {
  return Object.entries(where).every(([key, value]) => value === undefined || record[key] === value);
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

function withDealThreadIncludes(
  thread: DealThreadRecord,
  messages: DealMessageRecord[],
  viewingRequests: ViewingRequestRecord[],
  include: DealThreadInclude = {}
) {
  return {
    ...thread,
    ...(include.messages
      ? {
          messages: sortByDate(
            messages.filter((message) => message.threadId === thread.id),
            "createdAt",
            include.messages.orderBy?.createdAt
          )
        }
      : {}),
    ...(include.viewingRequests
      ? {
          viewingRequests: sortByDate(
            viewingRequests.filter((request) => request.threadId === thread.id),
            "createdAt",
            include.viewingRequests.orderBy?.createdAt
          )
        }
      : {})
  };
}

function withListingIncludes(listing: ListingRecord, media: ListingMediaRecord[], include: ListingInclude = {}) {
  if (!include.media) return listing;

  return {
    ...listing,
    media: sortListingMedia(
      media.filter((item) => item.listingId === listing.id),
      include.media.orderBy?.sortOrder
    )
  };
}

function sortByDate<T extends Record<K, Date>, K extends keyof T>(records: T[], field: K, direction: "asc" | "desc" = "desc") {
  return [...records].sort((first, second) => {
    const firstTime = first[field].getTime();
    const secondTime = second[field].getTime();
    return direction === "asc" ? firstTime - secondTime : secondTime - firstTime;
  });
}
