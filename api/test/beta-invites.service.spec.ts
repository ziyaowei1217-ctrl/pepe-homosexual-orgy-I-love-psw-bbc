import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { BetaInvitesService } from "../src/operations/beta-invites.service";

type InviteRecord = {
  id: string;
  normalizedEmail: string;
  createdBy: string;
  reason: string | null;
  invitedAt: Date;
  claimedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
};

function createPrismaMock() {
  const betaInvite = {
    rows: [] as InviteRecord[],
    async findUnique({ where }: { where: { normalizedEmail: string } }) {
      return betaInvite.rows.find((row) => row.normalizedEmail === where.normalizedEmail) ?? null;
    },
    async create({ data }: { data: Pick<InviteRecord, "normalizedEmail" | "createdBy" | "reason"> }) {
      const row: InviteRecord = {
        id: `invite-${betaInvite.rows.length + 1}`,
        ...data,
        invitedAt: new Date(),
        claimedAt: null,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null
      };
      betaInvite.rows.push(row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Partial<InviteRecord> }) {
      const row = betaInvite.rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("invite not found");
      Object.assign(row, data);
      return row;
    },
    async findMany() {
      return [...betaInvite.rows].sort((left, right) => right.invitedAt.getTime() - left.invitedAt.getTime());
    }
  };
  const verificationCode = {
    rows: [{ email: "student@example.com", purpose: "LOGIN", consumedAt: null as Date | null }],
    async updateMany({ where, data }: { where: { email: string; purpose: string; consumedAt: null }; data: { consumedAt: Date } }) {
      const matches = verificationCode.rows.filter(
        (row) => row.email === where.email && row.purpose === where.purpose && row.consumedAt === where.consumedAt
      );
      matches.forEach((row) => (row.consumedAt = data.consumedAt));
      return { count: matches.length };
    }
  };
  const auditEvent = {
    rows: [] as Array<Record<string, unknown>>,
    failNextCreate: false,
    async create({ data }: { data: Record<string, unknown> }) {
      if (auditEvent.failNextCreate) {
        auditEvent.failNextCreate = false;
        throw new Error("audit append failed");
      }
      const row = { id: `audit-${auditEvent.rows.length + 1}`, ...data };
      auditEvent.rows.push(row);
      return row;
    }
  };
  const prisma = {
    betaInvite,
    verificationCode,
    auditEvent,
    user: { async findUnique() { return null; } }
  };
  return Object.assign(prisma, {
    $transaction: async <T>(operation: (transaction: typeof prisma) => Promise<T>) => {
      const inviteSnapshot = betaInvite.rows.map((row) => ({ ...row }));
      const codeSnapshot = verificationCode.rows.map((row) => ({ ...row }));
      const auditSnapshot = auditEvent.rows.map((row) => ({ ...row }));
      try {
        return await operation(prisma);
      } catch (error) {
        betaInvite.rows.splice(0, betaInvite.rows.length, ...inviteSnapshot);
        verificationCode.rows.splice(0, verificationCode.rows.length, ...codeSnapshot);
        auditEvent.rows.splice(0, auditEvent.rows.length, ...auditSnapshot);
        throw error;
      }
    }
  });
}

describe("BetaInvitesService", () => {
  const input = { email: "student@example.com", actorEmail: "operator@example.com", reason: "Founding beta cohort" };

  it("adds one normalized invite and audits it", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    const result = await service.add({ ...input, email: " Student@Example.com " });

    expect(result.maskedEmail).toBe("s*****t@example.com");
    expect(prisma.betaInvite.rows).toHaveLength(1);
    expect(prisma.auditEvent.rows[0]).toMatchObject({
      action: "BETA_INVITE_CREATED",
      targetType: "BetaInvite",
      outcome: "SUCCESS"
    });
  });

  it("returns the active invite without duplicating it", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    await service.add(input);
    await service.add(input);

    expect(prisma.betaInvite.rows).toHaveLength(1);
    expect(prisma.auditEvent.rows.at(-1)?.outcome).toBe("NOOP");
  });

  it("revokes an invite and consumes its in-flight login codes atomically", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    await service.add(input);
    await service.revoke({ ...input, reason: "Access withdrawn" });

    expect(prisma.betaInvite.rows[0].revokedAt).toBeInstanceOf(Date);
    expect(prisma.verificationCode.rows[0].consumedAt).toBeInstanceOf(Date);
    expect(prisma.auditEvent.rows.at(-1)?.action).toBe("BETA_INVITE_REVOKED");
  });

  it("rejects blank reasons without changing invite state", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    await expect(service.add({ ...input, reason: "  " })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.betaInvite.rows).toHaveLength(0);
  });

  it("rejects a blank normalized operator identity without changing invite state", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    await expect(service.add({ ...input, actorEmail: "  " })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.betaInvite.rows).toHaveLength(0);
    expect(prisma.auditEvent.rows).toHaveLength(0);
  });

  it("does not reveal normalized emails from list results", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());
    await service.add(input);

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({ maskedEmail: "s*****t@example.com", status: "ACTIVE" })
    ]);
    expect(JSON.stringify(await service.list())).not.toContain("student@example.com");
  });

  it("rejects revocation of an invite that does not exist", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());

    await expect(service.revoke(input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rolls back invite revocation and login-code consumption when audit append fails", async () => {
    const prisma = createPrismaMock();
    const service = new BetaInvitesService(prisma as never, new AuditService());
    await service.add(input);
    prisma.auditEvent.failNextCreate = true;

    await expect(service.revoke({ ...input, reason: "Access withdrawn" })).rejects.toThrow("audit append failed");

    expect(prisma.betaInvite.rows[0].revokedAt).toBeNull();
    expect(prisma.verificationCode.rows[0].consumedAt).toBeNull();
    expect(prisma.auditEvent.rows).toHaveLength(1);
    expect(prisma.auditEvent.rows[0]).toMatchObject({ action: "BETA_INVITE_CREATED" });
  });
});
