type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ACCEPTED"
  | "CANCELLATION_PENDING"
  | "REJECTED"
  | "WITHDRAWN"
  | "CANCELLED"
  | "COMPLETED";

export type MarketplaceApplicationRecord = {
  id: string;
  listingId: string;
  listingOwnerId: string;
  submitterId: string;
  teamId: string | null;
  scope: "SOLO" | "TEAM";
  status: ApplicationStatus;
  activeKey: string | null;
  acceptedListingKey: string | null;
  memberSnapshots: unknown;
  moveIn: Date;
  moveOut: Date;
  schoolOrOccupation: string;
  incomeBand: string;
  guarantorStatus: string;
  note: string;
  createKey: string;
  submitKey: string | null;
  withdrawKey: string | null;
  decisionKey: string | null;
  cancelKey: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decisionById: string | null;
  decisionReason: string | null;
  withdrawnAt: Date | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DemoPaymentRecord = {
  id: string;
  applicationId: string;
  payerId: string;
  payeeId: string;
  amountCents: number;
  currency: string;
  status: "AWAITING_ATTEMPT" | "HELD" | "REFUNDED" | "RELEASED" | "CLOSED";
  createdAt: Date;
  updatedAt: Date;
};

type DemoPaymentAttemptRecord = {
  id: string;
  paymentId: string;
  actorId: string;
  idempotencyKey: string;
  outcome: "SUCCEEDED" | "FAILED";
  applied: boolean;
  createdAt: Date;
};

type DemoHeldFundRecord = {
  id: string;
  paymentId: string;
  amountCents: number;
  status: "HELD" | "REFUNDED" | "RELEASED";
  renterConfirmedAt: Date | null;
  ownerConfirmedAt: Date | null;
  renterConfirmationKey: string | null;
  ownerConfirmationKey: string | null;
  refundKey: string | null;
  releaseKey: string | null;
  refundedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DemoLedgerRecord = {
  id: string;
  transactionId: string;
  paymentId: string;
  heldFundId: string;
  event: "HOLD" | "REFUND" | "RELEASE";
  account: "RENTER_CLEARING" | "HELD_FUNDS" | "HOST_CLEARING";
  direction: "DEBIT" | "CREDIT";
  amountCents: number;
  idempotencyKey: string;
  createdAt: Date;
};

export function createMarketplaceDemoPrismaMock() {
  const users = [
    { id: "owner-1", email: "owner@example.com", role: "USER" },
    { id: "renter-1", email: "renter@example.com", role: "USER" },
    { id: "renter-2", email: "teammate@example.com", role: "USER" },
    { id: "stranger-1", email: "stranger@example.com", role: "USER" }
  ];
  const profiles = [
    { email: "owner@example.com", displayName: "Host Chen", school: null, role: "lister" },
    { email: "renter@example.com", displayName: "Lin", school: "UCLA", role: "renter" },
    { email: "teammate@example.com", displayName: "Mia", school: "USC", role: "renter" },
    { email: "stranger@example.com", displayName: "Sam", school: null, role: "renter" }
  ];
  const roommateProfiles = [
    { id: "profile-renter-1", ownerId: "renter-1", name: "Lin", role: "UCLA student" },
    { id: "profile-renter-2", ownerId: "renter-2", name: "Mia", role: "USC student" }
  ];
  const listings = [
    {
      id: "listing-1",
      ownerId: "owner-1",
      title: "Westwood room",
      area: "Westwood",
      price: 1850,
      status: "APPROVED",
      availableFrom: new Date("2026-09-01T00:00:00.000Z"),
      availableTo: new Date("2027-01-01T00:00:00.000Z")
    }
  ];
  const teams = [
    {
      id: "team-1",
      status: "ACTIVE",
      members: [
        {
          id: "team-member-2",
          teamId: "team-1",
          userId: "renter-2",
          active: true,
          snapshot: { id: "profile-renter-2", name: "Mia" }
        },
        {
          id: "team-member-1",
          teamId: "team-1",
          userId: "renter-1",
          active: true,
          snapshot: { id: "profile-renter-1", name: "Lin" }
        }
      ]
    }
  ];
  const applications: MarketplaceApplicationRecord[] = [];
  const demoPayments: DemoPaymentRecord[] = [];
  const demoPaymentAttempts: DemoPaymentAttemptRecord[] = [];
  const demoHeldFunds: DemoHeldFundRecord[] = [];
  const demoLedgerEntries: DemoLedgerRecord[] = [];

  const prisma = {
    state: {
      users,
      profiles,
      roommateProfiles,
      listings,
      teams,
      applications,
      demoPayments,
      demoPaymentAttempts,
      demoHeldFunds,
      demoLedgerEntries
    },
    $transaction: async (operation: (transaction: Record<string, unknown>) => Promise<unknown>) => operation(prisma),
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((record) => record.id === where.id || record.email === where.email) ?? null
    },
    profile: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        profiles.find((record) => record.email === where.email) ?? null
    },
    roommateProfile: {
      findUnique: async ({ where }: { where: { ownerId?: string; id?: string } }) =>
        roommateProfiles.find((record) => record.ownerId === where.ownerId || record.id === where.id) ?? null
    },
    listing: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        listings.find((record) => record.id === where.id) ?? null
    },
    roommateTeam: {
      findUnique: async ({ where }: { where: { id: string }; include?: unknown }) =>
        teams.find((record) => record.id === where.id) ?? null
    },
    rentalApplication: {
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        const [field, value] = Object.entries(where)[0] ?? [];
        return applications.find((record) => record[field as keyof MarketplaceApplicationRecord] === value) ?? null;
      },
      findFirst: async ({ where }: { where: Record<string, any> }) =>
        applications.find((record) => matchesApplication(record, where, teams)) ?? null,
      findMany: async ({ where = {}, include }: { where?: Record<string, any>; orderBy?: unknown; include?: { listing?: unknown } }) => {
        const matched = applications
          .filter((record) => matchesApplication(record, where, teams))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (!include?.listing) return matched;
        return matched.map((record) => ({
          ...record,
          listing: {
            title: listings.find((listing) => listing.id === record.listingId)?.title ?? "房源"
          }
        }));
      },
      create: async ({ data }: { data: Omit<MarketplaceApplicationRecord, "id" | "createdAt" | "updatedAt"> }) => {
        if (applications.some((record) => record.createKey === data.createKey || (data.activeKey && record.activeKey === data.activeKey))) {
          throw uniqueConflict();
        }
        const now = new Date();
        const created: MarketplaceApplicationRecord = {
          id: `application-${applications.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now
        };
        applications.push(created);
        return created;
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<MarketplaceApplicationRecord> }) => {
        const matched = applications.filter((record) => matchesApplication(record, where, teams));
        if (data.acceptedListingKey && applications.some((record) =>
          record.acceptedListingKey === data.acceptedListingKey && !matched.includes(record)
        )) throw uniqueConflict();
        for (const record of matched) Object.assign(record, data, { updatedAt: new Date() });
        return { count: matched.length };
      }
    },
    demoPayment: {
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        const [field, value] = Object.entries(where)[0] ?? [];
        return demoPayments.find((record) => record[field as keyof DemoPaymentRecord] === value) ?? null;
      },
      create: async ({ data }: { data: Omit<DemoPaymentRecord, "id" | "createdAt" | "updatedAt"> }) => {
        if (demoPayments.some((record) => record.applicationId === data.applicationId)) throw uniqueConflict();
        const now = new Date();
        const created: DemoPaymentRecord = {
          id: `payment-${demoPayments.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now
        };
        demoPayments.push(created);
        return created;
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<DemoPaymentRecord> }) => {
        const matched = demoPayments.filter((record) => {
          if (where.id && record.id !== where.id) return false;
          if (where.applicationId && record.applicationId !== where.applicationId) return false;
          if (where.status && record.status !== where.status) return false;
          return true;
        });
        for (const record of matched) Object.assign(record, data, { updatedAt: new Date() });
        return { count: matched.length };
      }
    },
    demoPaymentAttempt: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        demoPaymentAttempts.find((record) => record.idempotencyKey === where.idempotencyKey) ?? null,
      findMany: async ({ where }: { where: { paymentId: string } }) =>
        demoPaymentAttempts.filter((record) => record.paymentId === where.paymentId),
      create: async ({ data }: { data: Omit<DemoPaymentAttemptRecord, "id" | "createdAt"> }) => {
        if (demoPaymentAttempts.some((record) => record.idempotencyKey === data.idempotencyKey)) throw uniqueConflict();
        const created: DemoPaymentAttemptRecord = {
          id: `attempt-${demoPaymentAttempts.length + 1}`,
          ...data,
          createdAt: new Date()
        };
        demoPaymentAttempts.push(created);
        return created;
      }
    },
    demoHeldFund: {
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        const [field, value] = Object.entries(where)[0] ?? [];
        return demoHeldFunds.find((record) => record[field as keyof DemoHeldFundRecord] === value) ?? null;
      },
      create: async ({ data }: { data: Omit<DemoHeldFundRecord, "id" | "createdAt" | "updatedAt"> }) => {
        if (demoHeldFunds.some((record) => record.paymentId === data.paymentId)) throw uniqueConflict();
        const now = new Date();
        const created: DemoHeldFundRecord = {
          id: `fund-${demoHeldFunds.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now
        };
        demoHeldFunds.push(created);
        return created;
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<DemoHeldFundRecord> }) => {
        const matched = demoHeldFunds.filter((record) => {
          if (where.id && record.id !== where.id) return false;
          if (where.paymentId && record.paymentId !== where.paymentId) return false;
          if (where.status && record.status !== where.status) return false;
          return true;
        });
        for (const record of matched) Object.assign(record, data, { updatedAt: new Date() });
        return { count: matched.length };
      }
    },
    demoLedgerEntry: {
      findMany: async ({ where }: { where: Record<string, string> }) =>
        demoLedgerEntries.filter((record) =>
          Object.entries(where).every(([field, value]) => record[field as keyof DemoLedgerRecord] === value)
        ),
      createMany: async ({ data }: { data: Array<Omit<DemoLedgerRecord, "id" | "createdAt">> }) => {
        if (data.some((entry) => demoLedgerEntries.some((record) =>
          record.idempotencyKey === entry.idempotencyKey && record.account === entry.account && record.direction === entry.direction
        ))) throw uniqueConflict();
        for (const entry of data) {
          demoLedgerEntries.push({
            id: `ledger-${demoLedgerEntries.length + 1}`,
            ...entry,
            createdAt: new Date()
          });
        }
        return { count: data.length };
      }
    }
  };

  return prisma;
}

function matchesApplication(
  application: MarketplaceApplicationRecord,
  where: Record<string, any>,
  teams: Array<{ id: string; members: Array<{ userId: string }> }>
): boolean {
  if (where.OR) return where.OR.some((clause: Record<string, any>) => matchesApplication(application, clause, teams));
  if (where.id && application.id !== where.id) return false;
  if (where.listingId && application.listingId !== where.listingId) return false;
  if (where.listingOwnerId && application.listingOwnerId !== where.listingOwnerId) return false;
  if (where.submitterId && application.submitterId !== where.submitterId) return false;
  if (where.teamId && application.teamId !== where.teamId) return false;
  if (where.status) {
    if (typeof where.status === "string" && application.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(application.status)) return false;
  }
  if (where.team?.members?.some?.userId) {
    const team = teams.find((record) => record.id === application.teamId);
    if (!team?.members.some((member) => member.userId === where.team.members.some.userId)) return false;
  }
  return true;
}

function uniqueConflict() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}
