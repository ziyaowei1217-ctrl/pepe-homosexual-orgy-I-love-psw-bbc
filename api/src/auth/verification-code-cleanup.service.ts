import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { getAuthProvider } from "./auth-provider";

const retentionMs = 24 * 60 * 60 * 1000;

// Email codes are only created when the API sends its own codes. With Neon Auth (which sends sign-in emails
// itself) a daily pass is enough, and each pass wakes the scale-to-zero Neon database once instead of hourly.
export function verificationCodeCleanupIntervalMs(environment: Record<string, string | undefined> = process.env) {
  return getAuthProvider(environment) === "neon" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

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
    }, verificationCodeCleanupIntervalMs());
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
