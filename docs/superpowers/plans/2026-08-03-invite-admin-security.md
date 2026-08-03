# Invite-Only Beta Admin Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the first production-hardening batch by making invitations and administrator roles operable only through audited server commands, requiring a fresh administrator email verification for every administrator write, and recording review or blocked-write audit events atomically.

**Architecture:** Keep the existing `BetaInvite`, `AuditEvent`, and `VerificationPurpose.ADMIN_STEP_UP` database foundations. Add small operations services and CLIs for invitation and role changes, generalize the existing HMAC email-code lifecycle for administrator step-up, attach only a verified step-up timestamp from JWTs to authenticated requests, and protect write handlers with a dedicated guard. A focused audit service appends immutable events through the same Prisma transaction as successful domain mutations; rejected step-up writes append a separate blocked event because the domain mutation never begins.

**Tech Stack:** Node.js 22, pnpm 9, NestJS 10, Prisma 6, PostgreSQL 16, TypeScript 5.7, Vitest 2, Resend-backed `EmailSender`, JWT.

## Global Constraints

- Keep login codes at 6 digits, 10 minutes, at most 5 attempts, and a 60-second send cooldown.
- Administrator step-up is valid for exactly 30 minutes from successful `ADMIN_STEP_UP` verification.
- Production must reject `LOCAL_ADMIN_EMAILS`; non-production local development may retain the existing allowlist convenience.
- Invitations and administrator roles have no public or administrator HTTP management endpoints.
- Invitation and role commands require an operator identity and a non-empty reason, are idempotent, and mask email addresses in output.
- A role command must never revoke the final administrator, including under concurrent command execution.
- Successful grants, revocations, approvals, and rejections, plus administrator writes blocked for missing or stale step-up, append immutable `AuditEvent` rows.
- Never log verification codes, bearer tokens, full email addresses, request bodies, or email bodies.
- Existing migrations remain immutable; any database change must be an additive migration.

---

## File Structure

- Create `api/src/audit/audit.service.ts`: typed append-only audit writer that accepts either `PrismaService` or `Prisma.TransactionClient`.
- Create `api/src/audit/audit.module.ts`: exports `AuditService` to authentication, listing, and operations code.
- Create `api/src/http/request-id.ts`: server-generated request ID middleware and request type extension.
- Create `api/src/operations/beta-invites.service.ts`: idempotent invite add/list/revoke behavior and masked results.
- Create `api/src/operations/beta-invites.cli.ts`: parses and runs `add`, `list`, and `revoke` server commands.
- Create `api/src/operations/admin-roles.service.ts`: grant/revoke behavior with the final-admin lock and audited outcomes.
- Create `api/src/operations/admin-roles.cli.ts`: parses and runs `grant` and `revoke` server commands.
- Create `api/src/auth/admin-step-up.guard.ts`: 30-minute administrator write boundary and blocked-write audit.
- Modify `api/src/auth/auth.tokens.ts`: define the injectable step-up clock used by the guard.
- Modify `api/src/auth/auth.service.ts`: share the current code lifecycle between `LOGIN` and `ADMIN_STEP_UP` without weakening invitation checks.
- Modify `api/src/auth/auth.controller.ts`: add authenticated administrator step-up request and verify routes.
- Modify `api/src/auth/auth.guard.ts`: propagate only the verified numeric `adminReauthenticatedAt` JWT claim.
- Modify `api/src/auth/auth.module.ts`: register/export the step-up guard and import the audit module.
- Modify `api/src/listings/admin-listings.controller.ts`: leave the review queue role-gated and add step-up to approve/reject only.
- Modify `api/src/listings/listings.service.ts`: update each reviewed listing and append its audit event in one transaction.
- Modify `api/src/roommates/admin-roommates.controller.ts`: require step-up for create/update/archive while leaving reads role-gated.
- Modify `api/src/app.module.ts`, `api/src/main.ts`, and `api/package.json`: wire audit, request IDs, and operations commands.
- Modify focused unit, controller, HTTP, migration-smoke, and launch-smoke tests listed per task.

### Task 1: Fail Fast on Production Local Administrator Allowlists

**Files:**
- Modify: `api/src/auth/auth.module.ts`
- Modify: `api/src/auth/auth.service.ts`
- Modify: `api/test/auth.module.spec.ts`
- Modify: `api/test/auth.service.spec.ts`
- Test: `api/test/auth.module.spec.ts`
- Test: `api/test/auth.service.spec.ts`

**Interfaces:**
- Consumes: `createAuthServiceOptions(securityConfig, nodeEnv, localAdminEmails)`.
- Produces: production startup rejection for any non-empty `LOCAL_ADMIN_EMAILS`; unchanged development-only allowlist assignment.

- [ ] **Step 1: Add the production configuration regression**

Add this case to `api/test/auth.module.spec.ts`:

```ts
it("rejects local administrator allowlists in production", () => {
  expect(() =>
    createAuthServiceOptions(securityConfig, "production", "admin@example.com")
  ).toThrow("LOCAL_ADMIN_EMAILS is not allowed in production");
});
```

Keep the existing development allowlist test, and add this service-level assertion to `api/test/auth.service.spec.ts`:

```ts
it("creates production users as USER when no local allowlist exists", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = createAuthService(prisma, jwt, {
    nodeEnv: "production",
    localAdminEmails: "",
    emailSender: sender
  });
  const request = await service.requestEmailCode("student@northeastern.edu");
  const code = sender.sentCodes[0].code;

  const session = await service.verifyEmailCode({ email: request.email, code });

  expect(session.user.role).toBe("USER");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/auth.module.spec.ts test/auth.service.spec.ts
```

Expected: the production configuration case fails because `createAuthServiceOptions` currently accepts the allowlist.

- [ ] **Step 3: Reject the unsafe production option before constructing `AuthService`**

At the start of `createAuthServiceOptions`, add:

```ts
const normalizedLocalAdminEmails = localAdminEmails.trim();
if (nodeEnv === "production" && normalizedLocalAdminEmails) {
  throw new Error("LOCAL_ADMIN_EMAILS is not allowed in production");
}
```

Return `localAdminEmails: normalizedLocalAdminEmails` in the options object. Keep `AuthService` role assignment unchanged for non-production use.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/auth.module.spec.ts test/auth.service.spec.ts
```

Expected: both files pass, proving production fails closed while development behavior remains available.

- [ ] **Step 5: Commit the production allowlist boundary**

```bash
git add api/src/auth/auth.module.ts api/src/auth/auth.service.ts api/test/auth.module.spec.ts api/test/auth.service.spec.ts
git commit -m "fix: forbid production local admin escalation"
```

### Task 2: Add Server Request IDs and a Typed Append-Only Audit Writer

**Files:**
- Create: `api/src/http/request-id.ts`
- Create: `api/src/audit/audit.service.ts`
- Create: `api/src/audit/audit.module.ts`
- Create: `api/test/request-id.spec.ts`
- Create: `api/test/audit.service.spec.ts`
- Modify: `api/src/main.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/test/request-id.spec.ts`
- Test: `api/test/audit.service.spec.ts`

**Interfaces:**
- Produces: `RequestWithId.requestId: string`, `requestIdMiddleware(request, response, next): void`.
- Produces: `AuditService.append(database, event): Promise<AuditEvent>` where `database` exposes `auditEvent.create`.
- Produces: `AuditActor = { actorType; actorUserId?; actorEmail?; requestId? }` and stable action names used by later tasks.

- [ ] **Step 1: Write failing request-ID and audit tests**

Create `api/test/request-id.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/http/request-id";

describe("requestIdMiddleware", () => {
  it("replaces an inbound request id with a server-generated id and returns it", () => {
    const request = { headers: { "x-request-id": "attacker-controlled" } } as any;
    const setHeader = vi.fn();
    const next = vi.fn();

    requestIdMiddleware(request, { setHeader } as any, next);

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.requestId).not.toBe("attacker-controlled");
    expect(setHeader).toHaveBeenCalledWith("X-Request-ID", request.requestId);
    expect(next).toHaveBeenCalledOnce();
  });
});
```

Create `api/test/audit.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/audit/audit.service";

it("appends the exact immutable audit payload through the supplied transaction", async () => {
  const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
  const audit = new AuditService();
  await audit.append({ auditEvent: { create } } as never, {
    actorType: "USER",
    actorUserId: "admin-1",
    action: "LISTING_APPROVED",
    targetType: "Listing",
    targetId: "listing-1",
    outcome: "SUCCESS",
    requestId: "request-1",
    metadata: { reason: "approved" }
  });

  expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "LISTING_APPROVED" }) });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/request-id.spec.ts test/audit.service.spec.ts
```

Expected: both files fail to resolve the new modules.

- [ ] **Step 3: Implement the request-ID middleware**

Create `api/src/http/request-id.ts`:

```ts
import { randomUUID } from "node:crypto";

export type RequestWithId = {
  requestId: string;
  method?: string;
  originalUrl?: string;
};

export function requestIdMiddleware(
  request: Partial<RequestWithId>,
  response: { setHeader(name: string, value: string): unknown },
  next: () => void
) {
  request.requestId = randomUUID();
  response.setHeader("X-Request-ID", request.requestId);
  next();
}
```

Register `app.use(requestIdMiddleware)` before the security-header middleware in `api/src/main.ts`.

- [ ] **Step 4: Implement the typed audit writer and module**

Create `api/src/audit/audit.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AuditActor = {
  actorType: "USER" | "OPERATOR" | "SYSTEM";
  actorUserId?: string;
  actorEmail?: string;
  requestId?: string;
};

export type AuditInput = AuditActor & {
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "SUCCESS" | "BLOCKED" | "NOOP";
  metadata?: Prisma.InputJsonObject;
};

type AuditDatabase = Pick<Prisma.TransactionClient, "auditEvent">;

@Injectable()
export class AuditService {
  append(database: AuditDatabase, input: AuditInput) {
    return database.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        outcome: input.outcome,
        requestId: input.requestId,
        metadata: input.metadata ?? {}
      }
    });
  }
}
```

Create `api/src/audit/audit.module.ts` with `providers: [AuditService]` and `exports: [AuditService]`, then import `AuditModule` in `AppModule`.

- [ ] **Step 5: Run focused and type tests**

```bash
pnpm --filter sublet-pipeline-api test -- test/request-id.spec.ts test/audit.service.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit the shared audit boundary**

```bash
git add api/src/http/request-id.ts api/src/audit api/src/main.ts api/src/app.module.ts api/test/request-id.spec.ts api/test/audit.service.spec.ts
git commit -m "feat: add immutable audit writer and request ids"
```

### Task 3: Add Idempotent Invitation Operations Commands

**Files:**
- Create: `api/src/operations/beta-invites.service.ts`
- Create: `api/src/operations/beta-invites.cli.ts`
- Create: `api/test/beta-invites.service.spec.ts`
- Create: `api/test/beta-invites.cli.spec.ts`
- Modify: `api/package.json`
- Test: `api/test/beta-invites.service.spec.ts`
- Test: `api/test/beta-invites.cli.spec.ts`

**Interfaces:**
- Produces: `BetaInvitesService.add({ email, actorEmail, reason })`.
- Produces: `BetaInvitesService.list()` returning only `{ id, maskedEmail, status, invitedAt, claimedAt, revokedAt }`.
- Produces: `BetaInvitesService.revoke({ email, actorEmail, reason })` and consumes every unconsumed `LOGIN` code in the same transaction.
- Consumes: `AuditService.append(transaction, input)` from Task 2.

- [ ] **Step 1: Write failing service tests for add, idempotency, masking, and revoke**

Create `api/test/beta-invites.service.spec.ts` with a transactional Prisma mock and these assertions:

```ts
it("adds one normalized invite and audits it", async () => {
  const result = await service.add({
    email: " Student@Example.com ",
    actorEmail: "operator@example.com",
    reason: "Founding beta cohort"
  });
  expect(result.maskedEmail).toBe("s*****t@example.com");
  expect(prisma.betaInvite.rows).toHaveLength(1);
  expect(prisma.auditEvent.rows[0]).toMatchObject({
    action: "BETA_INVITE_CREATED",
    targetType: "BetaInvite",
    outcome: "SUCCESS"
  });
});

it("returns the active invite without duplicating it", async () => {
  await service.add(input);
  await service.add(input);
  expect(prisma.betaInvite.rows).toHaveLength(1);
  expect(prisma.auditEvent.rows.at(-1)?.outcome).toBe("NOOP");
});

it("revokes an invite and consumes its in-flight login codes atomically", async () => {
  await service.add(input);
  await service.revoke({ ...input, reason: "Access withdrawn" });
  expect(prisma.betaInvite.rows[0].revokedAt).toBeInstanceOf(Date);
  expect(prisma.verificationCode.rows[0].consumedAt).toBeInstanceOf(Date);
  expect(prisma.auditEvent.rows.at(-1)?.action).toBe("BETA_INVITE_REVOKED");
});
```

- [ ] **Step 2: Run the service test and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/beta-invites.service.spec.ts
```

Expected: module resolution fails for `beta-invites.service.ts`.

- [ ] **Step 3: Implement invitation operations in one database transaction**

Implement these public methods in `api/src/operations/beta-invites.service.ts`:

```ts
export class BetaInvitesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  add(input: InviteMutationInput) {
    return this.prisma.$transaction(async (transaction) => {
      const email = normalizeEmail(input.email);
      const existingUser = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) throw new BadRequestException("Registered users do not need beta invites");
      const existing = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      const invite = existing?.revokedAt
        ? await transaction.betaInvite.update({
            where: { id: existing.id },
            data: { createdBy: normalizeEmail(input.actorEmail), reason: requireReason(input.reason), invitedAt: new Date(), claimedAt: null, revokedAt: null, revokedBy: null, revocationReason: null }
          })
        : existing ?? await transaction.betaInvite.create({ data: { normalizedEmail: email, createdBy: normalizeEmail(input.actorEmail), reason: requireReason(input.reason) } });
      await this.audit.append(transaction, {
        actorType: "OPERATOR",
        actorEmail: normalizeEmail(input.actorEmail),
        action: "BETA_INVITE_CREATED",
        targetType: "BetaInvite",
        targetId: invite.id,
        outcome: existing && !existing.revokedAt ? "NOOP" : "SUCCESS",
        metadata: { reason: requireReason(input.reason) }
      });
      return toMaskedInvite(invite);
    });
  }

  list() {
    return this.prisma.betaInvite.findMany({ orderBy: { invitedAt: "desc" } })
      .then((rows) => rows.map(toMaskedInvite));
  }

  revoke(input: InviteMutationInput) {
    return this.prisma.$transaction(async (transaction) => {
      const email = normalizeEmail(input.email);
      const invite = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      if (!invite) throw new NotFoundException("Beta invite not found");
      const revokedAt = invite.revokedAt ?? new Date();
      const result = invite.revokedAt ? invite : await transaction.betaInvite.update({
        where: { id: invite.id },
        data: { revokedAt, revokedBy: normalizeEmail(input.actorEmail), revocationReason: requireReason(input.reason) }
      });
      await transaction.verificationCode.updateMany({
        where: { email, purpose: "LOGIN", consumedAt: null },
        data: { consumedAt: revokedAt }
      });
      await this.audit.append(transaction, {
        actorType: "OPERATOR", actorEmail: normalizeEmail(input.actorEmail),
        action: "BETA_INVITE_REVOKED", targetType: "BetaInvite", targetId: invite.id,
        outcome: invite.revokedAt ? "NOOP" : "SUCCESS", metadata: { reason: requireReason(input.reason) }
      });
      return toMaskedInvite(result);
    });
  }
}
```

`toMaskedInvite` must expose no full email, and `requireReason` must trim and reject empty values.

Define their contracts in the same file:

```ts
type InviteMutationInput = { email: string; actorEmail: string; reason: string };

function requireReason(input: string) {
  const reason = input.trim();
  if (!reason) throw new BadRequestException("Reason is required");
  return reason;
}

export function maskEmail(input: string) {
  const [local, domain] = normalizeEmail(input).split("@");
  const visibleLocal = local.length <= 2
    ? `${local[0]}*`
    : `${local[0]}${"*".repeat(local.length - 2)}${local.at(-1)}`;
  return `${visibleLocal}@${domain}`;
}

function toMaskedInvite(invite: BetaInvite) {
  return {
    id: invite.id,
    maskedEmail: maskEmail(invite.normalizedEmail),
    status: invite.revokedAt ? "REVOKED" : invite.claimedAt ? "CLAIMED" : "ACTIVE",
    invitedAt: invite.invitedAt,
    claimedAt: invite.claimedAt,
    revokedAt: invite.revokedAt
  } as const;
}
```

- [ ] **Step 4: Add the CLI parser regression and implementation**

Create `api/test/beta-invites.cli.spec.ts` to prove missing `--actor` or `--reason` exits with a validation error and that `list` never prints `student@example.com`.

Export `parseBetaInviteCommand(argv)` and `runBetaInviteCommand(command, service, write)` from `api/src/operations/beta-invites.cli.ts`. Support exactly:

```bash
pnpm --filter sublet-pipeline-api beta:invites -- add --email student@example.com --actor operator@example.com --reason "Founding beta cohort"
pnpm --filter sublet-pipeline-api beta:invites -- list
pnpm --filter sublet-pipeline-api beta:invites -- revoke --email student@example.com --actor operator@example.com --reason "Access withdrawn"
```

Add this script to `api/package.json`:

```json
"beta:invites": "ts-node -r tsconfig-paths/register src/operations/beta-invites.cli.ts"
```

- [ ] **Step 5: Run invitation tests and typecheck**

```bash
pnpm --filter sublet-pipeline-api test -- test/beta-invites.service.spec.ts test/beta-invites.cli.spec.ts test/auth.service.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: the invitation service, CLI, and existing login revocation behavior pass.

- [ ] **Step 6: Commit the invitation operations slice**

```bash
git add api/src/operations/beta-invites.service.ts api/src/operations/beta-invites.cli.ts api/test/beta-invites.service.spec.ts api/test/beta-invites.cli.spec.ts api/package.json
git commit -m "feat: add audited beta invite commands"
```

### Task 4: Add Audited Administrator Role Commands with Final-Admin Protection

**Files:**
- Create: `api/src/operations/admin-roles.service.ts`
- Create: `api/src/operations/admin-roles.cli.ts`
- Create: `api/test/admin-roles.service.spec.ts`
- Create: `api/test/admin-roles.cli.spec.ts`
- Create: `api/test/admin-roles.integration.spec.ts`
- Modify: `api/package.json`
- Test: `api/test/admin-roles.service.spec.ts`
- Test: `api/test/admin-roles.cli.spec.ts`

**Interfaces:**
- Produces: `AdminRolesService.grant({ email, actorEmail, reason })`.
- Produces: `AdminRolesService.revoke({ email, actorEmail, reason })`.
- Consumes: `AuditService.append(transaction, input)` from Task 2.

- [ ] **Step 1: Write failing service regressions**

Create `api/test/admin-roles.service.spec.ts` with these cases:

```ts
it("grants an existing user ADMIN and audits the operator and reason", async () => {
  const result = await service.grant({ email: "user@example.com", actorEmail: "ops@example.com", reason: "Primary reviewer" });
  expect(result).toEqual({ maskedEmail: "u**r@example.com", role: "ADMIN", outcome: "SUCCESS" });
  expect(prisma.auditEvent.rows.at(-1)).toMatchObject({ action: "ADMIN_ROLE_GRANTED", outcome: "SUCCESS" });
});

it("treats a repeated grant as an audited no-op", async () => {
  await service.grant(input);
  const result = await service.grant(input);
  expect(result.outcome).toBe("NOOP");
  expect(prisma.auditEvent.rows.at(-1)?.outcome).toBe("NOOP");
});

it("commits a blocked audit event before rejecting revocation of the final admin", async () => {
  await expect(service.revoke({ email: "last-admin@example.com", actorEmail: "ops@example.com", reason: "Rotation" }))
    .rejects.toMatchObject({ response: expect.objectContaining({ code: "LAST_ADMIN_REQUIRED" }) });
  expect(prisma.user.rows[0].role).toBe("ADMIN");
  expect(prisma.auditEvent.rows.at(-1)).toMatchObject({ action: "ADMIN_ROLE_REVOKE_BLOCKED", outcome: "BLOCKED" });
});
```

- [ ] **Step 2: Run the service test and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/admin-roles.service.spec.ts
```

Expected: the operations service does not exist.

- [ ] **Step 3: Implement serialized role changes and post-transaction rejection**

Implement `revoke` so the database lock, count, optional update, and audit append happen in one committed transaction:

```ts
async revoke(input: RoleMutationInput) {
  const result = await this.prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
    const email = normalizeEmail(input.email);
    const reason = requireReason(input.reason);
    const user = await transaction.user.findUnique({ where: { email } });
    if (!user) return this.auditBlocked(transaction, input, "USER_NOT_FOUND");
    if (user.role !== "ADMIN") return this.auditNoop(transaction, input, user);
    const adminCount = await transaction.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) return this.auditBlocked(transaction, input, "LAST_ADMIN_REQUIRED", user.id);
    const updated = await transaction.user.update({ where: { id: user.id }, data: { role: "USER" } });
    await this.audit.append(transaction, roleAudit(input, updated, "ADMIN_ROLE_REVOKED", "SUCCESS"));
    return { status: "ok" as const, user: updated, outcome: "SUCCESS" as const };
  });
  if (result.status === "blocked") {
    throw new ConflictException({ statusCode: 409, code: result.code, message: result.message });
  }
  return toMaskedRoleResult(result.user, result.outcome);
}
```

Use the same table lock for `grant` so concurrent grant/revoke commands have a single role-change order. The command result must return only a masked email.

Define the shared input and result helpers in `admin-roles.service.ts`:

```ts
type RoleMutationInput = { email: string; actorEmail: string; reason: string };
type RoleOutcome = "SUCCESS" | "NOOP";

function roleAudit(input: RoleMutationInput, user: User, action: string, outcome: RoleOutcome): AuditInput {
  return {
    actorType: "OPERATOR",
    actorEmail: normalizeEmail(input.actorEmail),
    action,
    targetType: "User",
    targetId: user.id,
    outcome,
    metadata: { reason: requireReason(input.reason) }
  };
}

function toMaskedRoleResult(user: User, outcome: RoleOutcome) {
  return { maskedEmail: maskEmail(user.email), role: user.role, outcome } as const;
}
```

`auditBlocked` must append `ADMIN_ROLE_REVOKE_BLOCKED` with `outcome: "BLOCKED"`, `metadata.reason`, and `metadata.code`, then return `{ status: "blocked", code, message }` without throwing inside the transaction. `auditNoop` must append `ADMIN_ROLE_REVOKED` with `outcome: "NOOP"` and return the unchanged user.

- [ ] **Step 4: Implement and test the exact CLI surface**

Export a pure parser/runner from `api/src/operations/admin-roles.cli.ts` and support exactly:

```bash
pnpm --filter sublet-pipeline-api admin:roles -- grant --email reviewer@example.com --actor operator@example.com --reason "Primary reviewer"
pnpm --filter sublet-pipeline-api admin:roles -- revoke --email reviewer@example.com --actor operator@example.com --reason "Rotation complete"
```

Add:

```json
"admin:roles": "ts-node -r tsconfig-paths/register src/operations/admin-roles.cli.ts"
```

The CLI tests must assert required flags, non-zero failures, and absence of the full target email from success output.

- [ ] **Step 5: Prove concurrent revocations retain an administrator in PostgreSQL 16**

Create `api/test/admin-roles.integration.spec.ts`, gated by `RUN_DB_SMOKE=1`. Following `production-database-foundations.migration.spec.ts`, create a uniquely named disposable PostgreSQL database in `beforeAll`, run `prisma migrate deploy` against it, and construct a `PrismaClient` with that database URL. Insert two administrator users, call `service.revoke` for both concurrently, and assert one operation succeeds, one returns `LAST_ADMIN_REQUIRED`, and one administrator remains:

```ts
const results = await Promise.allSettled([
  service.revoke({ email: firstEmail, actorEmail: "ops@example.com", reason: "Concurrent rotation A" }),
  service.revoke({ email: secondEmail, actorEmail: "ops@example.com", reason: "Concurrent rotation B" })
]);
expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
expect(await prisma.auditEvent.count({
  where: { action: "ADMIN_ROLE_REVOKE_BLOCKED", outcome: "BLOCKED" }
})).toBe(1);
```

Disconnect Prisma and drop the disposable database with `DROP DATABASE ... WITH (FORCE)` in `afterAll`. Do not try to truncate `AuditEvent`, because the database correctly forbids it.

- [ ] **Step 6: Run role-command tests and typecheck**

```bash
pnpm --filter sublet-pipeline-api test -- test/admin-roles.service.spec.ts test/admin-roles.cli.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: idempotent grants/revokes, blocked final-admin revocation, masked output, and typed builds all pass.

- [ ] **Step 7: Run the PostgreSQL concurrency test**

```bash
RUN_DB_SMOKE=1 pnpm --filter sublet-pipeline-api test -- test/admin-roles.integration.spec.ts
```

Expected: of two simultaneous revocations, exactly one succeeds and one is blocked, leaving one administrator.

- [ ] **Step 8: Commit the administrator role operations slice**

```bash
git add api/src/operations/admin-roles.service.ts api/src/operations/admin-roles.cli.ts api/test/admin-roles.service.spec.ts api/test/admin-roles.cli.spec.ts api/test/admin-roles.integration.spec.ts api/package.json
git commit -m "feat: add audited admin role commands"
```

### Task 5: Add Administrator Step-Up Email Verification and JWT Claims

**Files:**
- Modify: `api/src/auth/dto.ts`
- Modify: `api/src/auth/auth.service.ts`
- Modify: `api/src/auth/auth.controller.ts`
- Modify: `api/src/auth/auth.guard.ts`
- Modify: `api/src/auth/auth.module.ts`
- Modify: `api/test/auth-hardening.service.spec.ts`
- Modify: `api/test/auth.controller.spec.ts` or create it if absent
- Modify: `api/test/auth.guard.spec.ts`
- Test: `api/test/auth-hardening.service.spec.ts`
- Test: `api/test/auth.controller.spec.ts`
- Test: `api/test/auth.guard.spec.ts`

**Interfaces:**
- Produces: `AuthService.requestAdminStepUpCode(adminEmail)`.
- Produces: `AuthService.verifyAdminStepUpCode({ userId, email, code })` returning `{ accessToken, reauthenticatedUntil }`.
- Produces: `AuthenticatedRequest.user.adminReauthenticatedAt?: number` sourced only from a verified JWT.
- Produces HTTP: `POST /api/v1/auth/admin-step-up/email-code` and `POST /api/v1/auth/admin-step-up/verify`.

- [ ] **Step 1: Write failing service and guard cases**

Add to `api/test/auth-hardening.service.spec.ts`:

```ts
it("uses a separate ADMIN_STEP_UP code and returns a 30-minute JWT claim", async () => {
  const requested = await service.requestAdminStepUpCode("admin@example.com");
  const code = sender.sentCodes.at(-1)?.code;
  const result = await service.verifyAdminStepUpCode({ userId: "admin-1", email: "admin@example.com", code: code! });
  const payload = await jwt.verifyAsync<{ sub: string; adminReauthenticatedAt: number }>(result.accessToken);
  expect(payload.sub).toBe("admin-1");
  expect(payload.adminReauthenticatedAt).toBe(Math.floor(now / 1000));
  expect(new Date(result.reauthenticatedUntil).getTime()).toBe(now + 30 * 60 * 1000);
  expect(prisma.verificationCode.rows.at(-1)?.purpose).toBe("ADMIN_STEP_UP");
});

it("does not accept a LOGIN code for ADMIN_STEP_UP", async () => {
  const login = await service.requestEmailCode("admin@example.com");
  await expect(service.verifyAdminStepUpCode({ userId: "admin-1", email: "admin@example.com", code: login.devCode! }))
    .rejects.toBeInstanceOf(UnauthorizedException);
});
```

Add to `api/test/auth.guard.spec.ts`:

```ts
it("copies a verified numeric administrator reauthentication timestamp", async () => {
  const token = await jwt.signAsync({ sub: "admin-1", adminReauthenticatedAt: 1_912_345_600 });
  const request = requestWithHeader(`Bearer ${token}`);
  await guard.canActivate(contextFor(request));
  expect(request.user.adminReauthenticatedAt).toBe(1_912_345_600);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/auth-hardening.service.spec.ts test/auth.guard.spec.ts
```

Expected: the step-up service methods and request property are missing.

- [ ] **Step 3: Generalize the code lifecycle by purpose**

Extract private methods without changing the public login behavior. The public wrappers must be exactly:

```ts
requestEmailCode(email: string) {
  return this.requestVerificationCode({
    emailInput: email,
    purpose: VerificationPurpose.LOGIN,
    requireExistingUserOrInvite: true
  });
}

requestAdminStepUpCode(email: string) {
  return this.requestVerificationCode({
    emailInput: email,
    purpose: VerificationPurpose.ADMIN_STEP_UP,
    requireExistingUserOrInvite: false
  });
}
```

Move the current `requestEmailCode` body into `requestVerificationCode(input)` and make these exact substitutions: normalize `input.emailInput`; use `input.purpose` in every `VerificationCode` query/create and HMAC input; run the existing user/invite eligibility query only when `input.requireExistingUserOrInvite` is true; pass `input.purpose` into `finalizeSuccessfulDelivery`; and scope its newer/older-code queries by that same purpose.

Preserve login atomicity by extracting verification as a transaction callback, not as an independently committed consume step:

```ts
private async verifyCode<T>(input: {
  emailInput: string;
  codeInput: string;
  purpose: VerificationPurpose;
  onVerified: (transaction: Prisma.TransactionClient, email: string) => Promise<T>;
}) {
  const email = normalizeEmail(input.emailInput);
  const code = input.codeInput.trim();
  if (!/^\d{6}$/.test(code)) throw new BadRequestException("Verification code must be 6 digits");
  const outcome = await this.withSerializedEmail(email, async (transaction) => {
    const record = await transaction.verificationCode.findFirst({
      where: {
        email,
        purpose: input.purpose,
        deliveryStatus: VerificationDeliveryStatus.SENT,
        consumedAt: null,
        expiresAt: { gt: new Date(this.now()) }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!record || record.attemptCount >= this.codeMaxAttempts || record.hashVersion !== 2 || !record.codeSalt) {
      return { status: "invalid" as const };
    }
    const valid = verifyEmailCodeHash({
      email, purpose: input.purpose, salt: record.codeSalt, code,
      secret: this.otpHashSecret, codeHash: record.codeHash
    });
    if (!valid) {
      await transaction.verificationCode.update({ where: { id: record.id }, data: { attemptCount: { increment: 1 } } });
      return { status: "invalid" as const };
    }
    const result = await input.onVerified(transaction, email);
    await transaction.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date(this.now()) } });
    return { status: "verified" as const, value: result };
  });
  if (outcome.status === "invalid") throw new UnauthorizedException("Invalid or expired verification code");
  return outcome.value;
}
```

`verifyEmailCode` supplies an `onVerified` callback containing the current invite claim, user upsert, and profile upsert, so a profile failure still rolls back the account and code consumption. `verifyAdminStepUpCode` supplies `async () => undefined`, so it never creates a user, claims an invite, or writes a profile.

- [ ] **Step 4: Issue a fresh step-up JWT after consuming the administrator code**

Add:

```ts
async verifyAdminStepUpCode(input: { userId: string; email: string; code: string }) {
  await this.verifyCode({
    emailInput: input.email,
    codeInput: input.code,
    purpose: VerificationPurpose.ADMIN_STEP_UP,
    onVerified: async () => undefined
  });
  const adminReauthenticatedAt = Math.floor(this.now() / 1000);
  return {
    accessToken: await this.jwt.signAsync({
      sub: input.userId,
      email: normalizeEmail(input.email),
      role: "ADMIN",
      adminReauthenticatedAt
    }),
    reauthenticatedUntil: new Date((adminReauthenticatedAt + 30 * 60) * 1000)
  };
}
```

Update `AuthGuard`'s verified payload type and attach `adminReauthenticatedAt` only when `Number.isSafeInteger(payload.adminReauthenticatedAt)` is true. Continue loading role/email from Prisma.

- [ ] **Step 5: Add authenticated administrator controller routes**

Add `AdminStepUpCodeDto` containing a trimmed six-digit `code`. Implement:

```ts
@UseGuards(AuthGuard, AdminGuard)
@Post("admin-step-up/email-code")
async requestAdminStepUp(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
  await this.enforceRateLimit("send", request.user.email, request, response);
  return this.auth.requestAdminStepUpCode(request.user.email);
}

@UseGuards(AuthGuard, AdminGuard)
@Post("admin-step-up/verify")
async verifyAdminStepUp(
  @Req() request: AuthenticatedRequest,
  @Body(adminStepUpBodyPipe) dto: AdminStepUpCodeDto,
  @Res({ passthrough: true }) response: HeaderResponse
) {
  await this.enforceRateLimit("verify", request.user.email, request, response);
  return this.auth.verifyAdminStepUpCode({ userId: request.user.id, email: request.user.email, code: dto.code });
}
```

Controller tests must prove the body cannot choose another email and that both routes use the authenticated administrator email.

- [ ] **Step 6: Run authentication tests and typecheck**

```bash
pnpm --filter sublet-pipeline-api test -- test/auth-hardening.service.spec.ts test/auth.service.spec.ts test/auth.controller.spec.ts test/auth.guard.spec.ts test/auth-rate-limit.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: login and step-up purpose isolation, JWT claim propagation, rate limiting, and existing login behavior all pass.

- [ ] **Step 7: Commit administrator step-up verification**

```bash
git add api/src/auth api/test/auth-hardening.service.spec.ts api/test/auth.service.spec.ts api/test/auth.controller.spec.ts api/test/auth.guard.spec.ts
git commit -m "feat: add admin email step-up verification"
```

### Task 6: Require Fresh Step-Up on Every Administrator Write

**Files:**
- Create: `api/src/auth/admin-step-up.guard.ts`
- Create: `api/test/admin-step-up.guard.spec.ts`
- Modify: `api/src/auth/auth.tokens.ts`
- Modify: `api/src/auth/auth.module.ts`
- Modify: `api/src/listings/admin-listings.controller.ts`
- Modify: `api/src/listings/listings.module.ts`
- Modify: `api/src/roommates/admin-roommates.controller.ts`
- Modify: `api/test/listings.controller.spec.ts`
- Modify: `api/test/admin-roommates.controller.spec.ts`
- Test: `api/test/admin-step-up.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthenticatedRequest.user.adminReauthenticatedAt` and `RequestWithId.requestId`.
- Produces: `AdminStepUpGuard.canActivate(context): Promise<boolean>`.
- Produces error: HTTP 403 with stable code `ADMIN_REAUTH_REQUIRED`.

- [ ] **Step 1: Write the guard regressions**

Create `api/test/admin-step-up.guard.spec.ts`:

```ts
it("allows a step-up completed exactly within the 30-minute window", async () => {
  const guard = createGuard({ nowSeconds: 2_000 });
  await expect(guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 201 }))).resolves.toBe(true);
});

it.each([undefined, 200])("blocks missing or expired step-up and audits the route", async (adminReauthenticatedAt) => {
  const { guard, prisma } = createGuard({ nowSeconds: 2_001 });
  await expect(guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt })))
    .rejects.toMatchObject({ response: expect.objectContaining({ code: "ADMIN_REAUTH_REQUIRED" }) });
  expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
    action: "ADMIN_WRITE_BLOCKED",
    targetType: "HTTP_ROUTE",
    outcome: "BLOCKED",
    requestId: "request-1"
  });
});

it("rejects a claim more than 60 seconds in the future", async () => {
  const guard = createGuard({ nowSeconds: 2_000 });
  await expect(guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 2_061 })))
    .rejects.toMatchObject({ response: expect.objectContaining({ code: "ADMIN_REAUTH_REQUIRED" }) });
});
```

- [ ] **Step 2: Run the guard test and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/admin-step-up.guard.spec.ts
```

Expected: the guard module is missing.

- [ ] **Step 3: Implement the 30-minute guard and blocked audit**

Create `api/src/auth/admin-step-up.guard.ts`:

```ts
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ADMIN_STEP_UP_OPTIONS) private readonly options: { now: () => number }
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & RequestWithId>();
    const verifiedAt = request.user.adminReauthenticatedAt;
    const nowSeconds = Math.floor(this.options.now() / 1000);
    const valid = Number.isSafeInteger(verifiedAt) && verifiedAt! <= nowSeconds + 60 && nowSeconds - verifiedAt! <= 30 * 60;
    if (valid) return true;
    await this.audit.append(this.prisma, {
      actorType: "USER", actorUserId: request.user.id, actorEmail: request.user.email,
      action: "ADMIN_WRITE_BLOCKED", targetType: "HTTP_ROUTE",
      targetId: stripQuery(request.originalUrl), outcome: "BLOCKED", requestId: request.requestId,
      metadata: { method: request.method ?? "UNKNOWN", reason: "ADMIN_REAUTH_REQUIRED" }
    });
    throw new ForbiddenException({ statusCode: 403, code: "ADMIN_REAUTH_REQUIRED", message: "Administrator verification is required" });
  }
}

function stripQuery(path = "unknown") {
  return path.split("?", 1)[0].slice(0, 200);
}
```

Define `export const ADMIN_STEP_UP_OPTIONS = Symbol("ADMIN_STEP_UP_OPTIONS")` in `auth.tokens.ts`. Register `{ provide: ADMIN_STEP_UP_OPTIONS, useValue: { now: Date.now } }` plus `AdminGuard` and `AdminStepUpGuard` in `AuthModule`, export both guards, and import `AuditModule`. Tests override the clock token or instantiate the guard with a fixed clock.

- [ ] **Step 4: Apply the guard only to write handlers**

Keep `@UseGuards(AuthGuard, AdminGuard)` at both controller classes. Add `@UseGuards(AdminStepUpGuard)` to:

```ts
AdminListingsController.approve
AdminListingsController.reject
AdminRoommatesController.create
AdminRoommatesController.update
AdminRoommatesController.archive
```

Do not add step-up to `findReviewQueue` or `findAll`. Extend controller metadata tests using `Reflect.getMetadata("__guards__", method)` to prove reads omit and writes include `AdminStepUpGuard`.

Import `AuthModule` in `ListingsModule` so Nest can resolve `AuthGuard`, `AdminGuard`, and `AdminStepUpGuard`; `RoommatesModule` already imports it.

- [ ] **Step 5: Run guard/controller tests and typecheck**

```bash
pnpm --filter sublet-pipeline-api test -- test/admin-step-up.guard.spec.ts test/listings.controller.spec.ts test/admin-roommates.controller.spec.ts test/admin.guard.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: reads remain role-gated, writes require fresh step-up, and blocked writes create an audit event.

- [ ] **Step 6: Commit the administrator write boundary**

```bash
git add api/src/auth/admin-step-up.guard.ts api/src/auth/auth.tokens.ts api/src/auth/auth.module.ts api/src/listings/admin-listings.controller.ts api/src/listings/listings.module.ts api/src/roommates/admin-roommates.controller.ts api/test/admin-step-up.guard.spec.ts api/test/listings.controller.spec.ts api/test/admin-roommates.controller.spec.ts
git commit -m "feat: require step-up for admin writes"
```

### Task 7: Audit Listing Approvals and Rejections in the Mutation Transaction

**Files:**
- Modify: `api/src/listings/admin-listings.controller.ts`
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/src/listings/listings.module.ts`
- Modify: `api/test/listings.controller.spec.ts`
- Modify: `api/test/listings.service.spec.ts`
- Test: `api/test/listings.service.spec.ts`

**Interfaces:**
- Consumes: `AuditActor` from Task 2.
- Changes: `ListingsService.approve(id, actor)` and `ListingsService.reject(id, actor, reason)`.
- Produces: listing mutation and matching `LISTING_APPROVED` or `LISTING_REJECTED` audit row committed atomically.

- [ ] **Step 1: Write failing atomic audit regressions**

Update `api/test/listings.service.spec.ts`:

```ts
it("approves and audits in the same transaction", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
  const service = new ListingsService(prisma as never, new AuditService());
  const approved = await service.approve("listing-1", auditActor);
  expect(approved.status).toBe("APPROVED");
  expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
    action: "LISTING_APPROVED", targetId: "listing-1", actorUserId: "admin-1", requestId: "request-1"
  });
  expect(prisma.transactionCount).toBe(1);
});

it("rolls back approval when audit persistence fails", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })], failAuditCreate: true });
  const service = new ListingsService(prisma as never, new AuditService());
  await expect(service.approve("listing-1", auditActor)).rejects.toThrow("audit create failed");
  expect(prisma.listing.rows[0].status).toBe("SUBMITTED");
});
```

Add the equivalent reason assertion for `LISTING_REJECTED` with `metadata.reason` equal to the trimmed rejection reason.

- [ ] **Step 2: Run the listing service test and verify RED**

```bash
pnpm --filter sublet-pipeline-api test -- test/listings.service.spec.ts
```

Expected: constructor and method signatures do not yet accept `AuditService`/`AuditActor`, and no audit row exists.

- [ ] **Step 3: Make each review decision a single transaction**

Inject `AuditService`, and replace the direct updates with:

```ts
async approve(id: string, actor: AuditActor) {
  return this.prisma.$transaction(async (transaction) => {
    await this.requireSubmittedListing(id, transaction);
    const listing = await transaction.listing.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewerId: actor.actorUserId, rejectionReason: null }
    });
    await this.audit.append(transaction, {
      ...actor, action: "LISTING_APPROVED", targetType: "Listing", targetId: id,
      outcome: "SUCCESS", metadata: { reason: "manual_review_approved" }
    });
    return listing;
  });
}
```

Implement `reject` with `action: "LISTING_REJECTED"` and `metadata: { reason: rejectionReason }`. Change `requireSubmittedListing` to accept `Pick<Prisma.TransactionClient, "listing">` so its read participates in the same transaction.

- [ ] **Step 4: Pass the authenticated request audit actor from the controller**

Add a helper:

```ts
function requestAuditActor(request: AuthenticatedRequest & RequestWithId): AuditActor {
  return {
    actorType: "USER",
    actorUserId: request.user.id,
    actorEmail: request.user.email,
    requestId: request.requestId
  };
}
```

Pass it to `approve` and `reject`. Import `AuditModule` in `ListingsModule`.

- [ ] **Step 5: Run listing tests and typecheck**

```bash
pnpm --filter sublet-pipeline-api test -- test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: successful decisions and audit rows commit together, audit failure rolls back the listing, and rejection reasons remain validated and trimmed.

- [ ] **Step 6: Commit atomic listing audit events**

```bash
git add api/src/listings api/test/listings.service.spec.ts api/test/listings.controller.spec.ts api/test/listings-validation.e2e.spec.ts
git commit -m "feat: audit listing review decisions atomically"
```

### Task 8: Update End-to-End Fixtures, Documentation, and Full Verification

**Files:**
- Modify: `api/test/deal-threads.e2e.spec.ts`
- Modify: `api/test/http-launch-readiness.e2e.spec.ts`
- Modify: `api/test/listings-validation.e2e.spec.ts`
- Modify: `api/test/launch-smoke.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`
- Modify: `api/test/production-database-foundations.migration.spec.ts`
- Modify: `api/.env.example`
- Modify: `README.md`
- Test: all API tests and launch smoke tests

**Interfaces:**
- Consumes: JWT claim `adminReauthenticatedAt` from Task 5.
- Produces: test helpers that deliberately mint or obtain a fresh step-up token before administrator writes.
- Produces: documented invitation, role, and step-up operational procedures with masked-output examples.

- [ ] **Step 1: Update administrator-write test tokens explicitly**

For tests whose purpose is not the step-up flow, sign administrator tokens with a fresh claim:

```ts
const adminToken = await jwt.signAsync({
  sub: adminId,
  email: adminEmail,
  role: "ADMIN",
  adminReauthenticatedAt: Math.floor(Date.now() / 1000)
});
```

For `http-launch-readiness.e2e.spec.ts`, exercise the real step-up flow instead: request `/auth/admin-step-up/email-code`, verify its development code through `/auth/admin-step-up/verify`, and use the returned token for approval.

- [ ] **Step 2: Add a production-environment acceptance case**

Extend `api/test/auth.module.spec.ts` or `api/test/env.spec.ts`:

```ts
it("fails production startup configuration when LOCAL_ADMIN_EMAILS is populated", () => {
  expect(() => createAuthServiceOptions(securityConfig, "production", "admin@example.com"))
    .toThrow("LOCAL_ADMIN_EMAILS is not allowed in production");
});
```

Update the database smoke test to insert a successful `ADMIN_ROLE_GRANTED`, attempt update/delete/truncate, and confirm the existing immutability triggers still reject every mutation.

- [ ] **Step 3: Document the secure operator workflow**

Replace the README instruction that recommends `LOCAL_ADMIN_EMAILS` with development-only language and document these production commands:

```bash
pnpm --filter sublet-pipeline-api beta:invites -- add --email user@example.com --actor operator@example.com --reason "Founding beta cohort"
pnpm --filter sublet-pipeline-api beta:invites -- list
pnpm --filter sublet-pipeline-api beta:invites -- revoke --email user@example.com --actor operator@example.com --reason "Access withdrawn"
pnpm --filter sublet-pipeline-api admin:roles -- grant --email reviewer@example.com --actor operator@example.com --reason "Primary reviewer"
pnpm --filter sublet-pipeline-api admin:roles -- revoke --email reviewer@example.com --actor operator@example.com --reason "Rotation complete"
```

State that production commands run only in the server environment with `DATABASE_URL`, their output is masked, and administrator writes require a step-up token from the two `/auth/admin-step-up/*` routes.

- [ ] **Step 4: Run focused security regression tests**

```bash
pnpm --filter sublet-pipeline-api test -- \
  test/auth.module.spec.ts \
  test/auth.service.spec.ts \
  test/auth-hardening.service.spec.ts \
  test/auth.guard.spec.ts \
  test/admin-step-up.guard.spec.ts \
  test/beta-invites.service.spec.ts \
  test/admin-roles.service.spec.ts \
  test/listings.service.spec.ts \
  test/listings.controller.spec.ts \
  test/http-launch-readiness.e2e.spec.ts
```

Expected: every focused security test passes.

- [ ] **Step 5: Run the complete local verification**

```bash
pnpm --filter sublet-pipeline-api test
pnpm --filter sublet-pipeline-api typecheck
pnpm --filter sublet-pipeline-api build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all API and web tests, both typechecks, lint, and both builds pass.

- [ ] **Step 6: Run PostgreSQL 16 migration and launch smoke verification**

With the existing local PostgreSQL 16 service running:

```bash
RUN_DB_SMOKE=1 pnpm --filter sublet-pipeline-api test -- test/production-database-foundations.migration.spec.ts
RUN_DB_SMOKE=1 pnpm --filter sublet-pipeline-api test -- test/admin-roles.integration.spec.ts
RUN_DB_SMOKE=1 pnpm --filter sublet-pipeline-api launch:smoke
```

Expected: the additive schema deploy is current, audit rows remain immutable, concurrent revocations retain one administrator, and the owner-to-step-up-admin approval launch journey passes.

- [ ] **Step 7: Commit documentation and acceptance coverage**

```bash
git add README.md api/.env.example api/test
git commit -m "test: verify invite-only admin security"
```

- [ ] **Step 8: Compare the implementation to the approved first-batch acceptance gate**

Confirm all of the following from test output and command behavior:

```text
invited new user can register
revoked invite cannot finish registration
existing user can still log in without an active invite
production local allowlist fails startup
grant and revoke commands are audited and masked
the final administrator cannot be revoked
administrator write without fresh step-up returns ADMIN_REAUTH_REQUIRED
administrator write with a fresh step-up succeeds
approval and rejection audit events commit atomically with the listing
AuditEvent rejects update, delete, and truncate
```

If any line is unproven, do not mark the implementation complete; add a focused regression before handoff.
