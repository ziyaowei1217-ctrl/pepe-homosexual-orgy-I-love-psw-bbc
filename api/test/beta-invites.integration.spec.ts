import { PrismaClient, VerificationPurpose } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { BetaInvitesService } from "../src/operations/beta-invites.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres("beta_invites_concurrency");

describeDatabase("beta invite PostgreSQL transitions", () => {
  let firstClient: PrismaClient | undefined;
  let secondClient: PrismaClient | undefined;
  let firstService: BetaInvitesService;
  let secondService: BetaInvitesService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    firstClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    secondClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
    firstService = new BetaInvitesService(firstClient as never, new AuditService());
    secondService = new BetaInvitesService(secondClient as never, new AuditService());
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([firstClient?.$disconnect(), secondClient?.$disconnect()]);
    database.drop();
  });

  it("serializes concurrent add/add into one invite, one success audit, and one no-op audit", async () => {
    if (!firstClient) throw new Error("test database was not initialized");
    const email = "concurrent-add@example.com";

    const results = await Promise.allSettled([
      firstService.add({ email, actorEmail: "first-operator@example.com", reason: "Founding cohort A" }),
      secondService.add({ email, actorEmail: "second-operator@example.com", reason: "Founding cohort B" })
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const invite = await firstClient.betaInvite.findUniqueOrThrow({ where: { normalizedEmail: email } });
    expect(await firstClient.betaInvite.count({ where: { normalizedEmail: email } })).toBe(1);
    const audits = await firstClient.auditEvent.findMany({
      where: { targetType: "BetaInvite", targetId: invite.id, action: "BETA_INVITE_CREATED" }
    });
    expect(audits.map((event) => event.outcome).sort()).toEqual(["NOOP", "SUCCESS"]);
  });

  it("serializes concurrent add/revoke into a coherent final state and non-contradictory audits", async () => {
    if (!firstClient) throw new Error("test database was not initialized");
    const email = "concurrent-transition@example.com";
    await firstService.add({ email, actorEmail: "initial-operator@example.com", reason: "Initial cohort" });
    await firstService.revoke({ email, actorEmail: "initial-operator@example.com", reason: "Initial revoke" });

    const results = await Promise.allSettled([
      firstService.add({ email, actorEmail: "add-operator@example.com", reason: "Concurrent add" }),
      secondService.revoke({ email, actorEmail: "revoke-operator@example.com", reason: "Concurrent revoke" })
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const invite = await firstClient.betaInvite.findUniqueOrThrow({ where: { normalizedEmail: email } });
    const audits = await firstClient.auditEvent.findMany({
      where: {
        targetId: invite.id,
        actorEmail: { in: ["add-operator@example.com", "revoke-operator@example.com"] }
      }
    });
    expect(audits).toHaveLength(2);
    const addAudit = audits.find((event) => event.actorEmail === "add-operator@example.com");
    const revokeAudit = audits.find((event) => event.actorEmail === "revoke-operator@example.com");
    expect(addAudit).toMatchObject({ action: "BETA_INVITE_CREATED", outcome: "SUCCESS" });
    expect(["NOOP", "SUCCESS"]).toContain(revokeAudit?.outcome);
    expect(invite.revokedAt === null ? "ACTIVE" : "REVOKED").toBe(
      revokeAudit?.outcome === "SUCCESS" ? "REVOKED" : "ACTIVE"
    );
  });

  it("consumes codes only for ACTIVE to REVOKED and blocks CLAIMED revocation", async () => {
    if (!firstClient) throw new Error("test database was not initialized");
    const revokedEmail = "repeated-revoke@example.com";
    await firstService.add({ email: revokedEmail, actorEmail: "operator@example.com", reason: "Initial invite" });
    const activeCode = await firstClient.verificationCode.create({
      data: {
        email: revokedEmail,
        purpose: VerificationPurpose.LOGIN,
        codeHash: "first-code-hash",
        expiresAt: new Date(Date.now() + 600_000)
      }
    });
    await firstService.revoke({ email: revokedEmail, actorEmail: "operator@example.com", reason: "First revoke" });
    expect((await firstClient.verificationCode.findUniqueOrThrow({ where: { id: activeCode.id } })).consumedAt).toBeInstanceOf(Date);
    const postRevokeCode = await firstClient.verificationCode.create({
      data: {
        email: revokedEmail,
        purpose: VerificationPurpose.LOGIN,
        codeHash: "post-revoke-code-hash",
        expiresAt: new Date(Date.now() + 600_000)
      }
    });
    await firstService.revoke({ email: revokedEmail, actorEmail: "operator@example.com", reason: "Repeated revoke" });
    expect((await firstClient.verificationCode.findUniqueOrThrow({ where: { id: postRevokeCode.id } })).consumedAt).toBeNull();
    const revokedInvite = await firstClient.betaInvite.findUniqueOrThrow({ where: { normalizedEmail: revokedEmail } });
    expect(
      (
        await firstClient.auditEvent.findMany({
          where: { targetType: "BetaInvite", targetId: revokedInvite.id, action: "BETA_INVITE_REVOKED" }
        })
      ).map((event) => event.outcome).sort()
    ).toEqual(["NOOP", "SUCCESS"]);

    const claimedEmail = "claimed-invite@example.com";
    await firstClient.user.create({ data: { email: claimedEmail } });
    const claimedInvite = await firstClient.betaInvite.create({
      data: {
        normalizedEmail: claimedEmail,
        createdBy: "[REDACTED]",
        reason: "Claimed invite",
        claimedAt: new Date()
      }
    });
    const claimedCode = await firstClient.verificationCode.create({
      data: {
        email: claimedEmail,
        purpose: VerificationPurpose.LOGIN,
        codeHash: "claimed-code-hash",
        expiresAt: new Date(Date.now() + 600_000)
      }
    });

    await expect(
      secondService.revoke({ email: claimedEmail, actorEmail: "operator@example.com", reason: "Claimed revoke" })
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "BETA_INVITE_ALREADY_CLAIMED" }) });
    expect((await firstClient.betaInvite.findUniqueOrThrow({ where: { id: claimedInvite.id } })).revokedAt).toBeNull();
    expect((await firstClient.verificationCode.findUniqueOrThrow({ where: { id: claimedCode.id } })).consumedAt).toBeNull();
    expect(
      await firstClient.auditEvent.count({
        where: { targetId: claimedInvite.id, action: "BETA_INVITE_REVOKE_BLOCKED", outcome: "BLOCKED" }
      })
    ).toBe(1);
  });
});
