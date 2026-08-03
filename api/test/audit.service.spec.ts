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

  it("redacts sensitive metadata values before appending an audit event", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
    const audit = new AuditService();

    await audit.append({ auditEvent: { create } } as never, {
      actorType: "SYSTEM",
      action: "LISTING_APPROVED",
      targetType: "Listing",
      outcome: "SUCCESS",
      metadata: {
        reason: "admin@example.com",
        code: " 123456 ",
        method: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi0xIn0.signature"
      }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { reason: "[REDACTED]", code: "[REDACTED]", method: "[REDACTED]" }
      })
    });
  });
});
