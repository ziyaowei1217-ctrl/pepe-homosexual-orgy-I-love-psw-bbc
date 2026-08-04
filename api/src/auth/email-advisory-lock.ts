import { Prisma } from "@prisma/client";

type EmailLockDatabase = Pick<Prisma.TransactionClient, "$executeRaw">;

export async function acquireNormalizedEmailAdvisoryLock(database: EmailLockDatabase, normalizedEmail: string) {
  await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}::text, 0))`;
}
