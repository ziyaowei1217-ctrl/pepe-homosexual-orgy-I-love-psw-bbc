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

  it("redacts sensitive substrings embedded in a reason before appending an audit event", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: {
        reason:
          "Verification code: 123456; contact admin@example.com; Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0xIn0.signature"
      }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { reason: "Verification code: [REDACTED]; contact [REDACTED]; [REDACTED]" }
      })
    });
  });

  it.each([
    "First line\nSecond line",
    "Subject: audit update",
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
      metadata: { code: "verification code", method: "OPTIONS" }
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
      metadata: { reason: "  Approved after review  ", code: "LISTING_APPROVED", method: "PATCH" }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { reason: "Approved after review", code: "LISTING_APPROVED", method: "PATCH" }
      })
    });
  });
});
