import { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AuditService } from "../src/audit/audit.service";
import { AdminListingsController } from "../src/listings/admin-listings.controller";

describe("AdminStepUpGuard", () => {
  it.each([1_999_000, 1_400_001])("allows matching independent verification within ten minutes (%s)",async(mfaVerifiedAt)=>{
    const {guard}=createGuard({nowSeconds:2000,mfaVerifiedAt});
    await expect(guard.canActivate(contextFor({role:"ADMIN",mfaVerifiedAt}))).resolves.toBe(true);
  });
  it.each([undefined,1_400_000,2_000_001])("blocks missing, expired and future verification (%s)",async(mfaVerifiedAt)=>{
    const {guard,prisma}=createGuard({nowSeconds:2000,mfaVerifiedAt});
    await expect(guard.canActivate(contextFor({role:"ADMIN",mfaVerifiedAt}))).rejects.toMatchObject({status:403,response:{code:"MFA_VERIFICATION_REQUIRED"}});
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({action:"ADMIN_WRITE_BLOCKED",outcome:"BLOCKED"});
  });
  it("rejects an email-only step-up even when fresh",async()=>{
    const {guard}=createGuard({nowSeconds:2000});
    await expect(guard.canActivate(contextFor({role:"ADMIN",adminReauthenticatedAt:2000}))).rejects.toMatchObject({status:403});
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
        code: "MFA_VERIFICATION_REQUIRED",
        message: "Independent administrator verification is required"
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

  it("records the authenticated actor while redacting token-like route identifiers", async () => {
    const { guard, prisma } = createGuard({ nowSeconds: 2_001 });
    const context = contextFor({ role: "ADMIN" });
    const controller = function Controller() {};
    Object.defineProperty(controller, "name", { value: "Controller".repeat(30) });
    context.getClass = () => controller as never;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      actorType: "USER", actorUserId: "admin-1", actorEmail: "admin@example.com",
      targetType: "HTTP_ROUTE", requestId: "request-1", outcome: "BLOCKED"
    });
    const route = prisma.auditEvent.rows.at(-1)?.targetId;
    expect(typeof route).toBe("string");
    expect(route).toBe("[REDACTED]");
  });

  it("retains a usable audit route identity when controller and handler names are absent", async () => {
    const { guard, prisma } = createGuard({ nowSeconds: 2_001 });
    const context = contextFor({ role: "ADMIN" });
    const anonymous = function () {};
    Object.defineProperty(anonymous, "name", { value: "" });
    context.getClass = () => anonymous as never;
    context.getHandler = () => anonymous;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      targetId: "UnknownController.unknownHandler", targetType: "HTTP_ROUTE"
    });
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
        code: "MFA_VERIFICATION_REQUIRED",
        message: "Independent administrator verification is required"
      }
    });
    expect(prisma.auditEvent.rows).toHaveLength(1);
  });
});

function createGuard({ nowSeconds, auditRelease, mfaVerifiedAt }: { nowSeconds: number; auditRelease?: Promise<void>; mfaVerifiedAt?:number }) {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    userMfa:{findUnique:async()=>({enabledAt:new Date(0)})},
    authSession:{findUnique:async()=>({id:"session-1",userId:"admin-1",revokedAt:null,expiresAt:new Date(9_000_000),mfaVerifiedAt:mfaVerifiedAt===undefined?null:new Date(mfaVerifiedAt)})},
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
  user: { role: string; adminReauthenticatedAt?: number; mfaVerifiedAt?:number },
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
          sessionId:"session-1",
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
