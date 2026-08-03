import { BadRequestException } from "@nestjs/common";
import { UserRole, type User } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { AdminRolesService } from "../src/operations/admin-roles.service";

function user(id: string, email: string, role: UserRole): User {
  const timestamp = new Date("2026-08-03T00:00:00.000Z");
  return { id, email, role, createdAt: timestamp, updatedAt: timestamp };
}

function createPrismaMock(initialUsers: User[]) {
  const users = initialUsers.map((row) => ({ ...row }));
  const auditRows: Array<Record<string, unknown>> = [];
  const userStore = {
    rows: users,
    async findUnique({ where }: { where: { email: string } }) {
      return userStore.rows.find((row) => row.email === where.email) ?? null;
    },
    async count({ where }: { where: { role: UserRole } }) {
      return userStore.rows.filter((row) => row.role === where.role).length;
    },
    async update({ where, data }: { where: { id: string }; data: { role: UserRole } }) {
      const row = userStore.rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("user not found");
      row.role = data.role;
      row.updatedAt = new Date();
      return row;
    }
  };
  const auditEvent = {
    rows: auditRows,
    failNextCreate: false,
    async create({ data }: { data: Record<string, unknown> }) {
      if (auditEvent.failNextCreate) {
        auditEvent.failNextCreate = false;
        throw new Error("audit append failed");
      }
      const row = { id: `audit-${auditRows.length + 1}`, ...data };
      auditRows.push(row);
      return row;
    }
  };
  const transaction = {
    user: userStore,
    auditEvent,
    async $executeRaw() {
      return 0;
    }
  };
  const prisma = Object.assign(transaction, {
    $transaction: async <T>(operation: (database: typeof transaction) => Promise<T>) => {
      const userSnapshot = userStore.rows.map((row) => ({ ...row }));
      const auditSnapshot = auditRows.map((row) => ({ ...row }));
      try {
        return await operation(transaction);
      } catch (error) {
        userStore.rows.splice(0, userStore.rows.length, ...userSnapshot);
        auditRows.splice(0, auditRows.length, ...auditSnapshot);
        throw error;
      }
    }
  });
  return prisma;
}

describe("AdminRolesService", () => {
  const input = { email: "user@example.com", actorEmail: "ops@example.com", reason: "Primary reviewer" };

  it("grants an existing user ADMIN and audits the operator and reason", async () => {
    const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    const result = await service.grant(input);

    expect(result).toEqual({ maskedEmail: "u**r@example.com", role: "ADMIN", outcome: "SUCCESS" });
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      actorEmail: "ops@example.com",
      action: "ADMIN_ROLE_GRANTED",
      outcome: "SUCCESS",
      metadata: { reason: "Primary reviewer" }
    });
  });

  it("treats a repeated grant as an audited no-op", async () => {
    const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    await service.grant(input);
    const result = await service.grant(input);

    expect(result.outcome).toBe("NOOP");
    expect(prisma.auditEvent.rows.at(-1)?.outcome).toBe("NOOP");
  });

  it("commits a blocked audit event before rejecting revocation of the final admin", async () => {
    const finalAdminId = "cm4w7x8h90001u9p4gn5n7v2b";
    const prisma = createPrismaMock([user(finalAdminId, "last-admin@example.com", UserRole.ADMIN)]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    await expect(
      service.revoke({ email: "last-admin@example.com", actorEmail: "ops@example.com", reason: "Rotation" })
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "LAST_ADMIN_REQUIRED" }) });
    expect(prisma.user.rows[0].role).toBe("ADMIN");
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      actorEmail: "ops@example.com",
      action: "ADMIN_ROLE_REVOKE_BLOCKED",
      targetId: finalAdminId,
      outcome: "BLOCKED",
      metadata: { reason: "Rotation", code: "LAST_ADMIN_REQUIRED" }
    });
  });

  it("treats revocation of a non-admin as an audited no-op", async () => {
    const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    const result = await service.revoke({ ...input, reason: "Already removed" });

    expect(result).toEqual({ maskedEmail: "u**r@example.com", role: "USER", outcome: "NOOP" });
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({ action: "ADMIN_ROLE_REVOKED", outcome: "NOOP" });
  });

  it.each(["grant", "revoke"] as const)("rejects blank operator identities and reasons for %s before changing state", async (action) => {
    const prisma = createPrismaMock([
      user("user-1", input.email, action === "grant" ? UserRole.USER : UserRole.ADMIN),
      user("admin-2", "other-admin@example.com", UserRole.ADMIN)
    ]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    await expect(service[action]({ ...input, actorEmail: "  " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service[action]({ ...input, reason: "  " })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.rows[0].role).toBe(action === "grant" ? "USER" : "ADMIN");
    expect(prisma.auditEvent.rows).toHaveLength(0);
  });

  it("normalizes valid target and operator casing and trims the audited reason", async () => {
    const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    await service.grant({ email: "User@Example.com", actorEmail: "OPS@Example.com", reason: "  Primary reviewer  " });

    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      actorEmail: "ops@example.com",
      metadata: { reason: "Primary reviewer" }
    });
  });

  it.each([" user@example.com", "user@example.com ", "user @example.com", "user@example", "user@localhost"])(
    "rejects an unusable direct target email before changing role state: %s",
    async (email) => {
      const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
      const service = new AdminRolesService(prisma as never, new AuditService());

      await expect(service.grant({ ...input, email })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.rows[0].role).toBe(UserRole.USER);
      expect(prisma.auditEvent.rows).toHaveLength(0);
    }
  );

  it.each([" ops@example.com", "ops@example.com ", "ops @example.com", "ops@example", "ops@localhost"])(
    "rejects an unusable direct operator email before changing role state: %s",
    async (actorEmail) => {
      const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
      const service = new AdminRolesService(prisma as never, new AuditService());

      await expect(service.grant({ ...input, actorEmail })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.rows[0].role).toBe(UserRole.USER);
      expect(prisma.auditEvent.rows).toHaveLength(0);
    }
  );

  it("validates target and operator emails before direct role revocation", async () => {
    const prisma = createPrismaMock([
      user("user-1", input.email, UserRole.ADMIN),
      user("admin-2", "other-admin@example.com", UserRole.ADMIN)
    ]);
    const service = new AdminRolesService(prisma as never, new AuditService());

    await expect(service.revoke({ ...input, email: "user @example.com" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.revoke({ ...input, actorEmail: "ops@localhost" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.user.rows[0].role).toBe(UserRole.ADMIN);
    expect(prisma.auditEvent.rows).toHaveLength(0);
  });

  it("rolls back the role change when the audit append fails", async () => {
    const prisma = createPrismaMock([user("user-1", input.email, UserRole.USER)]);
    const service = new AdminRolesService(prisma as never, new AuditService());
    prisma.auditEvent.failNextCreate = true;

    await expect(service.grant(input)).rejects.toThrow("audit append failed");

    expect(prisma.user.rows[0].role).toBe("USER");
    expect(prisma.auditEvent.rows).toHaveLength(0);
  });
});
