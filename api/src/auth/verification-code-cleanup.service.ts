import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

const cleanupIntervalMs = 60 * 60 * 1000;
const retentionMs = 24 * 60 * 60 * 1000;

@Injectable()
export class VerificationCodeCleanupService implements OnModuleInit, OnModuleDestroy {
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    private readonly now: () => Date = () => new Date()
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, cleanupIntervalMs);
    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async cleanup() {
    return this.prisma.$transaction(async (transaction) => {
      const [lock] = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(708156872401) AS acquired
      `;
      if (!lock?.acquired) return 0;

      const now = this.now();
      const cutoff = new Date(now.getTime() - retentionMs);
      const result = await transaction.verificationCode.deleteMany({
        where: {
          OR: [
            { failedAt: { lt: cutoff } },
            { consumedAt: { lt: cutoff } },
            { expiresAt: { lt: cutoff } }
          ]
        }
      });
      return result.count;
    });
  }
}
