import { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AuditService } from "../src/audit/audit.service";
import { AdminListingsController } from "../src/listings/admin-listings.controller";

describe("AdminStepUpGuard", () => {
  it("allows a step-up completed exactly within the 30-minute window", async () => {
    const { guard } = createGuard({ nowSeconds: 2_000 });

    await expect(
      guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 201 }))
    ).resolves.toBe(true);
  });

  it("allows a step-up completed exactly 30 minutes ago", async () => {
    const { guard } = createGuard({ nowSeconds: 2_000 });

    await expect(
      guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 200 }))
    ).resolves.toBe(true);
  });

  it.each([undefined, 200])(
    "blocks missing or expired step-up and audits the route",
    async (adminReauthenticatedAt) => {
      const { guard, prisma } = createGuard({ nowSeconds: 2_001 });

      await expect(
        guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt }))
      ).rejects.toMatchObject({
        status: 403,
        response: {
          statusCode: 403,
          code: "ADMIN_REAUTH_REQUIRED",
          message: "Administrator verification is required"
        }
      });
      expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
        actorType: "USER",
        actorUserId: "admin-1",
        actorEmail: "admin@example.com",
        action: "ADMIN_WRITE_BLOCKED",
        targetType: "HTTP_ROUTE",
        targetId: "AdminListingsController.approve",
        outcome: "BLOCKED",
        requestId: "request-1",
        metadata: {
          method: "POST",
          reason: "ADMIN_REAUTH_REQUIRED"
        }
      });
    }
  );

  it("rejects a claim more than 60 seconds in the future", async () => {
    const { guard } = createGuard({ nowSeconds: 2_000 });

    await expect(
      guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 2_061 }))
    ).rejects.toMatchObject({
      status: 403,
      response: {
        statusCode: 403,
        code: "ADMIN_REAUTH_REQUIRED",
        message: "Administrator verification is required"
      }
    });
  });

  it("allows a claim exactly 60 seconds in the future", async () => {
    const { guard } = createGuard({ nowSeconds: 2_000 });

    await expect(
      guard.canActivate(contextFor({ role: "ADMIN", adminReauthenticatedAt: 2_060 }))
    ).resolves.toBe(true);
  });

  it("uses static handler identity without persisting sensitive request path values", async () => {
    const { guard, prisma } = createGuard({ nowSeconds: 2_001 });
    const pathEmail = "victim@example.com";
    const pathToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

    await expect(
      guard.canActivate(
        contextFor(
          { role: "ADMIN" },
          { originalUrl: `/admin/listings/${pathEmail}/${pathToken}/approve`, method: undefined }
        )
      )
    ).rejects.toMatchObject({
      status: 403,
      response: {
        statusCode: 403,
        code: "ADMIN_REAUTH_REQUIRED",
        message: "Administrator verification is required"
      }
    });
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      targetId: "AdminListingsController.approve",
      metadata: {
        method: "[REDACTED]",
        reason: "ADMIN_REAUTH_REQUIRED"
      }
    });
    const auditPayload = JSON.stringify(prisma.auditEvent.rows.at(-1));
    expect(auditPayload).not.toContain(pathEmail);
    expect(auditPayload).not.toContain(pathToken);
  });

  it("waits for the blocked-write audit to persist before throwing HTTP 403", async () => {
    let releaseAudit!: () => void;
    const auditRelease = new Promise<void>((resolve) => {
      releaseAudit = resolve;
    });
    const { guard, prisma } = createGuard({ nowSeconds: 2_001, auditRelease });
    let settled = false;

    const activation = guard.canActivate(contextFor({ role: "ADMIN" }));
    void activation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.auditEvent.createCalls).toBe(1);
    expect(settled).toBe(false);

    releaseAudit();
    await expect(activation).rejects.toMatchObject({
      status: 403,
      response: {
        statusCode: 403,
        code: "ADMIN_REAUTH_REQUIRED",
        message: "Administrator verification is required"
      }
    });
    expect(prisma.auditEvent.rows).toHaveLength(1);
  });
});

function createGuard({ nowSeconds, auditRelease }: { nowSeconds: number; auditRelease?: Promise<void> }) {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    auditEvent: {
      rows,
      createCalls: 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        prisma.auditEvent.createCalls += 1;
        await auditRelease;
        rows.push(data);
        return { id: `audit-${rows.length}`, ...data };
      }
    }
  };
  const guard = new AdminStepUpGuard(
    prisma as never,
    new AuditService(),
    { now: () => nowSeconds * 1_000 }
  );

  return { guard, prisma };
}

function contextFor(
  user: { role: string; adminReauthenticatedAt?: number },
  request: { originalUrl?: string; method?: string } = {}
): ExecutionContext {
  return {
    getClass: () => AdminListingsController,
    getHandler: () => AdminListingsController.prototype.approve,
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        user: {
          id: "admin-1",
          email: "admin@example.com",
          ...user
        },
        requestId: "request-1",
        originalUrl: request.originalUrl ?? "/admin/listings/listing-1/approve?from=queue",
        method: Object.prototype.hasOwnProperty.call(request, "method") ? request.method : "POST"
      })
    })
  } as unknown as ExecutionContext;
}
