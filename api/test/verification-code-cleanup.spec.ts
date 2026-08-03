import { describe, expect, it, vi } from "vitest";

import { VerificationCodeCleanupService } from "../src/auth/verification-code-cleanup.service";

describe("VerificationCodeCleanupService", () => {
  it("deletes only terminal or expired codes older than 24 hours while holding the advisory lock", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [{ acquired: true }],
          verificationCode: { deleteMany }
        })
    };
    const now = new Date("2030-01-02T12:00:00.000Z");
    const service = new VerificationCodeCleanupService(prisma as never, () => now);

    await expect(service.cleanup()).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { failedAt: { lt: new Date("2030-01-01T12:00:00.000Z") } },
          { consumedAt: { lt: new Date("2030-01-01T12:00:00.000Z") } },
          { expiresAt: { lt: new Date("2030-01-01T12:00:00.000Z") } }
        ]
      }
    });
  });

  it("does nothing when another instance holds the advisory lock", async () => {
    const deleteMany = vi.fn();
    const prisma = {
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [{ acquired: false }],
          verificationCode: { deleteMany }
        })
    };
    const service = new VerificationCodeCleanupService(prisma as never);

    await expect(service.cleanup()).resolves.toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
