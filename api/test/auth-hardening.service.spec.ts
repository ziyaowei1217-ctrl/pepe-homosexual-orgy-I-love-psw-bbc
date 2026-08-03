import { JwtService } from "@nestjs/jwt";
import { VerificationDeliveryStatus, VerificationPurpose } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";
import type { EmailSender, SendVerificationCodeInput } from "../src/email/email-sender";

describe("AuthService production email issuance", () => {
  it("creates PENDING under the lock, sends outside the transaction, then marks SENT", async () => {
    const prisma = createAuthPrismaMock({ invited: ["student@example.com"] });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, { codeRequestCooldownMs: 0 });

    const response = await service.requestEmailCode(" Student@Example.com ");

    expect(response).toMatchObject({ email: "student@example.com", devCode: expect.stringMatching(/^\d{6}$/) });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].verificationCodeId).toBe(prisma.state.codes[0].id);
    expect(prisma.state.senderObservedTransaction).toBe(false);
    expect(prisma.state.codes[0]).toMatchObject({
      purpose: VerificationPurpose.LOGIN,
      deliveryStatus: VerificationDeliveryStatus.SENT,
      hashVersion: 2,
      codeSalt: expect.stringMatching(/^[0-9a-f]{32}$/),
      sentAt: expect.any(Date),
      providerMessageId: "provider-1",
      consumedAt: null
    });
  });

  it("keeps the previous SENT code valid when the next provider call fails", async () => {
    const prisma = createAuthPrismaMock({ invited: ["student@example.com"] });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, { codeRequestCooldownMs: 0 });
    await service.requestEmailCode("student@example.com");
    const previous = prisma.state.codes[0];
    sender.failure = new Error("provider detail must not escape");

    const accepted = await service.requestEmailCode("student@example.com");

    expect(accepted).toMatchObject({
      email: "student@example.com",
      expiresAt: expect.any(Date),
      devCode: expect.stringMatching(/^\d{6}$/)
    });
    expect(previous.consumedAt).toBeNull();
    expect(prisma.state.codes[1]).toMatchObject({
      deliveryStatus: VerificationDeliveryStatus.FAILED,
      failedAt: expect.any(Date),
      consumedAt: null
    });
  });

  it("generically accepts a provider success when bounded finalization retries fail", async () => {
    const prisma = createAuthPrismaMock({ invited: ["student@example.com"] });
    const sender = createSender(prisma);
    const warnings: unknown[][] = [];
    const service = createService(prisma, sender, {
      codeRequestCooldownMs: 0,
      logger: { warn: (...args: unknown[]) => warnings.push(args) }
    });
    await service.requestEmailCode("student@example.com");
    const previous = prisma.state.codes[0];
    prisma.state.finalizationFailuresRemaining = 2;

    const accepted = await service.requestEmailCode("student@example.com");

    expect(accepted).toMatchObject({
      email: "student@example.com",
      expiresAt: expect.any(Date),
      devCode: expect.stringMatching(/^\d{6}$/)
    });
    expect(sender.sent).toHaveLength(2);
    expect(prisma.state.finalizationAttempts).toBe(3);
    expect(previous).toMatchObject({
      deliveryStatus: VerificationDeliveryStatus.SENT,
      consumedAt: null
    });
    expect(prisma.state.codes[1]).toMatchObject({
      deliveryStatus: VerificationDeliveryStatus.PENDING,
      consumedAt: null
    });
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings)).not.toContain("student@example.com");
    expect(JSON.stringify(warnings)).not.toContain("finalization db detail");
  });

  it("invalidates older SENT codes only after a newer delivery succeeds", async () => {
    const prisma = createAuthPrismaMock({ invited: ["student@example.com"] });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, { codeRequestCooldownMs: 0 });
    await service.requestEmailCode("student@example.com");
    await service.requestEmailCode("student@example.com");

    expect(prisma.state.codes[0].consumedAt).toBeInstanceOf(Date);
    expect(prisma.state.codes[1].consumedAt).toBeNull();
    expect(prisma.state.codes[1].deliveryStatus).toBe(VerificationDeliveryStatus.SENT);
  });

  it("totally orders issuances even when the database would assign the same millisecond timestamp", async () => {
    const sharedTimestamp = new Date("2020-01-01T00:00:00.000Z");
    const prisma = createAuthPrismaMock({
      invited: ["student@example.com"],
      fixedCodeCreatedAt: sharedTimestamp
    });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, {
      codeRequestCooldownMs: 0,
      now: () => sharedTimestamp.getTime()
    });

    await service.requestEmailCode("student@example.com");
    await service.requestEmailCode("student@example.com");

    expect(prisma.state.codes[0].createdAt).toEqual(sharedTimestamp);
    expect(prisma.state.codes[1].createdAt.getTime()).toBe(sharedTimestamp.getTime() + 1);
    expect(prisma.state.codes.filter((record) => record.consumedAt === null)).toHaveLength(1);
    expect(prisma.state.codes[1].consumedAt).toBeNull();
  });

  it("does not disclose invite or registration state while only issuing for invited or existing users", async () => {
    const prisma = createAuthPrismaMock({
      invited: ["invited@example.com"],
      existingUsers: ["member@example.com"]
    });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, { codeRequestCooldownMs: 0 });

    const uninvited = await service.requestEmailCode("stranger@example.com");
    const invited = await service.requestEmailCode("invited@example.com");
    const existing = await service.requestEmailCode("member@example.com");

    expect(Object.keys(uninvited).sort()).toEqual(Object.keys(invited).sort());
    expect(uninvited).toMatchObject({
      email: "stranger@example.com",
      expiresAt: expect.any(Date),
      devCode: expect.stringMatching(/^\d{6}$/)
    });
    expect(sender.sent.map((delivery) => delivery.email)).toEqual(["invited@example.com", "member@example.com"]);
    expect(prisma.state.codes.map((record) => record.email)).toEqual(["invited@example.com", "member@example.com"]);
    expect(existing.devCode).toMatch(/^\d{6}$/);
  });

  it("keeps cooldown responses indistinguishable from generic acceptance", async () => {
    const prisma = createAuthPrismaMock({ invited: ["invited@example.com"] });
    const sender = createSender(prisma);
    const service = createService(prisma, sender, { codeRequestCooldownMs: 60_000 });
    await service.requestEmailCode("invited@example.com");

    const invitedCooldown = await service.requestEmailCode("invited@example.com");
    const uninvited = await service.requestEmailCode("stranger@example.com");

    expect(Object.keys(invitedCooldown).sort()).toEqual(Object.keys(uninvited).sort());
    expect(invitedCooldown).toMatchObject({ expiresAt: expect.any(Date), devCode: expect.stringMatching(/^\d{6}$/) });
    expect(sender.sent).toHaveLength(1);
  });

  it("does not let an older slow delivery invalidate a newer successful code", async () => {
    const sharedTimestamp = new Date("2020-01-01T00:00:00.000Z");
    const prisma = createAuthPrismaMock({
      invited: ["student@example.com"],
      fixedCodeCreatedAt: sharedTimestamp
    });
    let releaseFirst = () => {};
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sent: SendVerificationCodeInput[] = [];
    const sender: EmailSender = {
      async sendVerificationCode(input) {
        sent.push(input);
        if (sent.length === 1) await firstBlocked;
        return { providerMessageId: `provider-${sent.length}` };
      }
    };
    const service = createService(prisma, sender, {
      codeRequestCooldownMs: 0,
      now: () => sharedTimestamp.getTime()
    });

    const olderRequest = service.requestEmailCode("student@example.com");
    while (sent.length === 0) await Promise.resolve();
    const newerResponse = await service.requestEmailCode("student@example.com");
    releaseFirst();
    const olderResponse = await olderRequest;

    const olderRecord = prisma.state.codes.find((record) => record.id === sent[0].verificationCodeId);
    const newerRecord = prisma.state.codes.find((record) => record.id === sent[1].verificationCodeId);
    expect(olderResponse.devCode).not.toBe(newerResponse.devCode);
    expect(olderRecord?.consumedAt).toBeInstanceOf(Date);
    expect(newerRecord?.consumedAt).toBeNull();
  });

  it("does not revive an older slow delivery after the newer SENT code was consumed", async () => {
    const sharedTimestamp = new Date("2020-01-01T00:00:00.000Z");
    const prisma = createAuthPrismaMock({
      invited: ["student@example.com"],
      fixedCodeCreatedAt: sharedTimestamp
    });
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sent: SendVerificationCodeInput[] = [];
    const sender: EmailSender = {
      async sendVerificationCode(input) {
        sent.push(input);
        if (sent.length === 1) await firstBlocked;
        return { providerMessageId: `provider-${sent.length}` };
      }
    };
    const service = createService(prisma, sender, {
      codeRequestCooldownMs: 0,
      now: () => sharedTimestamp.getTime()
    });

    const olderRequest = service.requestEmailCode("student@example.com");
    while (sent.length === 0) await Promise.resolve();
    await service.requestEmailCode("student@example.com");
    const newerRecord = prisma.state.codes.find((record) => record.id === sent[1].verificationCodeId);
    if (!newerRecord) throw new Error("Expected newer verification code");
    const consumedAt = new Date("2020-01-01T00:01:00.000Z");
    newerRecord.consumedAt = consumedAt;
    releaseFirst();
    await olderRequest;

    const olderRecord = prisma.state.codes.find((record) => record.id === sent[0].verificationCodeId);
    expect(newerRecord.consumedAt).toBe(consumedAt);
    expect(olderRecord?.consumedAt).toBeInstanceOf(Date);
  });
});

type CodeRecord = {
  id: string;
  email: string;
  purpose: VerificationPurpose;
  codeHash: string;
  codeSalt: string;
  hashVersion: number;
  attemptCount: number;
  deliveryStatus: VerificationDeliveryStatus;
  sentAt: Date | null;
  failedAt: Date | null;
  providerMessageId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

function createAuthPrismaMock(
  input: { invited?: string[]; existingUsers?: string[]; fixedCodeCreatedAt?: Date } = {}
) {
  const state = {
    codes: [] as CodeRecord[],
    invited: new Set(input.invited ?? []),
    existingUsers: new Set(input.existingUsers ?? []),
    inTransaction: false,
    senderObservedTransaction: undefined as boolean | undefined,
    finalizationFailuresRemaining: 0,
    finalizationAttempts: 0
  };

  const transaction = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        state.existingUsers.has(where.email) ? { id: `user-${where.email}` } : null
    },
    betaInvite: {
      findFirst: async ({ where }: { where: { normalizedEmail: string; revokedAt: null; claimedAt: null } }) =>
        state.invited.has(where.normalizedEmail) ? { id: `invite-${where.normalizedEmail}` } : null
    },
    verificationCode: {
      findFirst: async ({
        where
      }: {
        where: {
          email: string;
          deliveryStatus?: VerificationDeliveryStatus;
          consumedAt?: null;
          createdAt?: { gt: Date };
        };
      }) =>
        [...state.codes].reverse().find(
          (record) =>
            record.email === where.email &&
            (!where.deliveryStatus || record.deliveryStatus === where.deliveryStatus) &&
            (!("consumedAt" in where) || record.consumedAt === where.consumedAt) &&
            (!where.createdAt || record.createdAt > where.createdAt.gt)
        ) ?? null,
      create: async ({
        data
      }: {
        data: Omit<CodeRecord, "id" | "createdAt" | "sentAt" | "failedAt" | "providerMessageId" | "consumedAt"> & {
          createdAt?: Date;
        };
      }) => {
        const record: CodeRecord = {
          ...data,
          id: `code-${state.codes.length + 1}`,
          sentAt: null,
          failedAt: null,
          providerMessageId: null,
          consumedAt: null,
          createdAt: data.createdAt ?? input.fixedCodeCreatedAt ?? new Date(Date.now() + state.codes.length)
        };
        state.codes.push(record);
        return { ...record };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<CodeRecord> }) => {
        const record = state.codes.find((candidate) => candidate.id === where.id);
        if (!record) throw new Error("missing code");
        if (data.deliveryStatus === VerificationDeliveryStatus.SENT) {
          state.finalizationAttempts += 1;
          if (state.finalizationFailuresRemaining > 0) {
            state.finalizationFailuresRemaining -= 1;
            throw new Error("finalization db detail");
          }
        }
        Object.assign(record, data);
        return { ...record };
      },
      updateMany: async ({ where, data }: { where: { email: string; id: { not: string }; deliveryStatus: VerificationDeliveryStatus; consumedAt: null; createdAt?: { lt: Date } }; data: { consumedAt: Date } }) => {
        let count = 0;
        for (const record of state.codes) {
          if (
            record.email === where.email &&
            record.id !== where.id.not &&
            record.deliveryStatus === where.deliveryStatus &&
            record.consumedAt === null &&
            (!where.createdAt || record.createdAt < where.createdAt.lt)
          ) {
            record.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      }
    }
  };

  return {
    state,
    verificationCode: transaction.verificationCode,
    $transaction: async <T>(operation: (client: typeof transaction) => Promise<T>) => {
      state.inTransaction = true;
      try {
        return await operation(transaction);
      } finally {
        state.inTransaction = false;
      }
    }
  };
}

function createSender(prisma: ReturnType<typeof createAuthPrismaMock>) {
  return {
    sent: [] as SendVerificationCodeInput[],
    failure: undefined as Error | undefined,
    async sendVerificationCode(input: SendVerificationCodeInput) {
      prisma.state.senderObservedTransaction = prisma.state.inTransaction;
      this.sent.push(input);
      if (this.failure) throw this.failure;
      return { providerMessageId: `provider-${this.sent.length}` };
    }
  } satisfies EmailSender & { sent: SendVerificationCodeInput[]; failure?: Error };
}

function createService(
  prisma: ReturnType<typeof createAuthPrismaMock>,
  sender: EmailSender,
  options: {
    codeRequestCooldownMs?: number;
    now?: () => number;
    logger?: { warn(...args: unknown[]): unknown };
  } = {}
) {
  return new AuthService(prisma as never, new JwtService({ secret: "test-secret" }), sender, {
    nodeEnv: "development",
    otpHashSecret: "otp-test-secret-that-is-at-least-32-bytes",
    codeTtlMs: 600_000,
    codeMaxAttempts: 5,
    codeRequestCooldownMs: options.codeRequestCooldownMs ?? 60_000,
    localAdminEmails: "",
    responseMinimumMs: 0,
    responseJitterMs: 0,
    now: options.now,
    logger: options.logger ?? { warn: () => undefined }
  });
}
