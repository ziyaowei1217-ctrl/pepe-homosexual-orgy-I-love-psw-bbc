import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/audit/audit.service";

describe("AuditService", () => {
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

  it("normalizes a valid actor email at the audit boundary", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "OPERATOR",
      actorEmail: "  Operator@Example.COM  ",
      action: "BETA_INVITE_CREATED",
      targetType: "BetaInvite",
      targetId: "invite-1",
      outcome: "SUCCESS",
      metadata: { reason: "Founding beta cohort" }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorEmail: "operator@example.com",
        metadata: { reason: "Founding beta cohort" }
      })
    });
  });

  it.each([
    "not-an-email",
    "operator@example",
    "operator @example.com",
    "operator@example.com second@example.com"
  ])("rejects malformed actor attribution before persistence: %s", async (actorEmail) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await expect(
      audit.append({ auditEvent: { create } } as never, {
        actorType: "OPERATOR",
        actorEmail,
        action: "BETA_INVITE_CREATED",
        targetType: "BetaInvite",
        targetId: "invite-1",
        outcome: "SUCCESS"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("removes unknown metadata keys before appending an audit event", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: { reason: "approved", requestBody: "private request body" } as never
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { reason: "approved" } })
    });
  });

  it("redacts an entire reason when it contains sensitive substrings", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: {
        reason:
          "Verification 123456; contact admin@example.com; Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0xIn0.signature"
      }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { reason: "[REDACTED]" }
      })
    });
  });

  it.each([
    "password=hunter2",
    "token=short-token-value",
    "secret=correct-horse-battery-staple",
    "api_key=sk_live_51Q6v9N2D7m4P8r1",
    "Cookie: session=private-session-value",
    "Authorization Bearer private-token-value",
    "Opaque key q7Vn2Lx9Pz4Rm8Tw6Yk3Hs5D",
    "Opaque key q7Vn2Lx9Pz4Rm8Tw6Yk3Hs5D, retained",
    "Contact 用户@例子.广告",
    "Jane Doe <jane@example.com>",
    "Verification code 123456",
    "Verification code 123-456",
    "Verification code 12-34-56",
    "Verification code 12/34/56",
    "Verification code 12 /  34 /  56",
    "Verification code ١٢٣٤٥٦",
    "apikey shortvalue",
    "api key shortvalue",
    "api.key shortvalue",
    "api-key shortvalue",
    "password_value hunter2",
    "password.value hunter2",
    "password-value hunter2",
    "setcookie sessionvalue",
    "Cookies session identifier",
    "Opaque key abcdefghijklmnopqrstuvwx",
    "body={\"email\":\"private@example.com\"}",
    "email body contains a private token"
  ])("redacts a credential or body-like audit reason: %s", async (reason) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_REJECTED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: { reason }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { reason: "[REDACTED]" } })
    });
  });

  it.each([
    "victim@example.com",
    "Bearer private-access-token",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0xIn0.signature",
    "123456",
    "12-34-56",
    "q7Vn2Lx9Pz4Rm8Tw6Yk3Hs5D",
    "Subject: private body",
    "first line\nsecond line"
  ])("redacts a sensitive audit target identifier: %s", async (targetId) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "ADMIN_WRITE_BLOCKED",
      targetType: "HTTP_ROUTE",
      targetId,
      outcome: "BLOCKED"
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetId: "[REDACTED]" })
    });
  });

  it.each([
    "cm4w7x8h90000u9p4gn5n7v2a",
    "c123456abcdefghijklmnopqr",
    "00000000-0000-4000-8000-000000000001",
    "AdminListingsController.approve"
  ])("preserves an explicitly supported audit target identifier: %s", async (targetId) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "ADMIN_WRITE_BLOCKED",
      targetType: "HTTP_ROUTE",
      targetId,
      outcome: "BLOCKED"
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetId })
    });
  });

  it.each([
    "First line\nSecond line",
    "Subject: audit update",
    "Subject : audit update",
    "Reply-To: operator",
    "Content-Type: text/html",
    "<p>email body</p>",
    "<p email body",
    "x".repeat(241)
  ])("redacts a body-like reason before appending an audit event", async (reason) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: { reason }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { reason: "[REDACTED]" } })
    });
  });

  it("redacts invalid code and method metadata before appending an audit event", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: { code: "VERIFICATION_CODE_123456", method: "OPTIONS" }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { code: "[REDACTED]", method: "[REDACTED]" } })
    });
  });

  it("preserves benign metadata values before appending an audit event", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: {
        reason: "  Approved after review; no escalation.  ",
        code: "ADMIN_REAUTH_REQUIRED",
        method: "PATCH"
      }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { reason: "Approved after review; no escalation.", code: "ADMIN_REAUTH_REQUIRED", method: "PATCH" }
      })
    });
  });

  it.each([
    ["  Founding beta cohort  ", "Founding beta cohort"],
    ["Primary reviewer rotation complete", "Primary reviewer rotation complete"],
    ["manual_review_approved", "manual_review_approved"],
    ["ADMIN_REAUTH_REQUIRED", "ADMIN_REAUTH_REQUIRED"],
    ["  Please add clearer bedroom photos.  ", "Please add clearer bedroom photos."]
  ])("preserves the approved bounded audit summary %s", async (reason, expectedReason) => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_REJECTED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: { reason }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { reason: expectedReason } })
    });
  });
});
