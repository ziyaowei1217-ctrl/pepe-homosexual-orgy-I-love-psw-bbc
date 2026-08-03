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
});
