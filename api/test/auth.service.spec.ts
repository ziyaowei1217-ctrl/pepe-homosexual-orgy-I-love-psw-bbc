import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { VerificationDeliveryStatus, VerificationPurpose } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { AuthService, type AuthServiceOptions } from "../src/auth/auth.service";
import { createEmailSender, type EmailSender } from "../src/email/email-sender";

describe("AuthService", () => {
  it("stores hashed verification codes and verifies them into JWT sessions", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });

    const request = await service.requestEmailCode("Student@Northeastern.edu ");
    const devCode = request.devCode;

    expect(request.email).toBe("student@northeastern.edu");
    expect(devCode).toMatch(/^\d{6}$/);
    expect(prisma.verificationCode.state.code?.code).toBeUndefined();
    expect(prisma.verificationCode.state.code?.codeHash).not.toBe(devCode);
    if (!devCode) throw new Error("Expected development verification code");

    const session = await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: devCode
    });

    expect(session.accessToken).toBeTruthy();
    expect(session.user.email).toBe("student@northeastern.edu");
    expect(session.isNewUser).toBe(true);
    expect(prisma.profile.state.profile?.email).toBe("student@northeastern.edu");
    expect(prisma.verificationCode.state.code?.consumedAt).toBeInstanceOf(Date);
  });

  it("marks a returning email login as an existing user", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 0
    });

    const first = await service.requestEmailCode("student@northeastern.edu");
    if (!first.devCode) throw new Error("Expected development verification code");
    await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: first.devCode
    });

    const second = await service.requestEmailCode("student@northeastern.edu");
    if (!second.devCode) throw new Error("Expected development verification code");
    const session = await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: second.devCode
    });

    expect(session.isNewUser).toBe(false);
  });

  it("does not create a new account when its invite is revoked after code delivery", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });
    const request = await service.requestEmailCode("student@northeastern.edu");
    if (!request.devCode) throw new Error("Expected development verification code");
    prisma.verificationCode.state.inviteActive = false;

    await expect(
      service.verifyEmailCode({ email: "student@northeastern.edu", code: request.devCode })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.verificationCode.state.user).toBeUndefined();
  });

  it("lets invite revocation consume an in-flight LOGIN code without finalization reviving it", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    let releaseDelivery: () => void = () => undefined;
    const deliveryBlocked = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    const sender: EmailSender = {
      async sendVerificationCode() {
        await deliveryBlocked;
        return { providerMessageId: "provider-after-revocation" };
      }
    };
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender
    });

    const request = service.requestEmailCode("student@northeastern.edu");
    while (prisma.verificationCode.state.codes.length === 0) await Promise.resolve();
    const revokedAt = new Date("2030-01-01T00:00:00.000Z");
    await service.consumeLoginCodesForInviteRevocation(
      prisma as never,
      " Student@Northeastern.edu ",
      revokedAt
    );
    releaseDelivery();
    await request;

    expect(prisma.verificationCode.state.code).toMatchObject({
      purpose: VerificationPurpose.LOGIN,
      deliveryStatus: VerificationDeliveryStatus.SENT,
      consumedAt: revokedAt
    });
  });

  it("allows one successful verification when the same valid code is replayed concurrently", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender
    });
    const request = await service.requestEmailCode("student@northeastern.edu");
    if (!request.devCode) throw new Error("Expected development verification code");

    const results = await Promise.allSettled([
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: request.devCode
      }),
      service.verifyEmailCode({
        email: "STUDENT@NORTHEASTERN.EDU",
        code: request.devCode
      })
    ]);

    const successful = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.verifyEmailCode>>> =>
        result.status === "fulfilled"
    );
    const rejected = results.filter((result) => result.status === "rejected");
    expect(successful).toHaveLength(1);
    expect(successful[0].value.isNewUser).toBe(true);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(UnauthorizedException);
  });

  it("rolls back account persistence when verification profile creation fails", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender
    });
    const request = await service.requestEmailCode("student@northeastern.edu");
    if (!request.devCode) throw new Error("Expected development verification code");
    prisma.verificationCode.state.failProfileUpsert = true;

    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: request.devCode
      })
    ).rejects.toThrow("profile upsert failed");

    expect(prisma.verificationCode.state.user).toBeUndefined();
    expect(prisma.verificationCode.state.profile).toBeUndefined();
    expect(prisma.verificationCode.state.code?.consumedAt).toBeNull();

    prisma.verificationCode.state.failProfileUpsert = false;
    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: request.devCode
      })
    ).resolves.toMatchObject({
      isNewUser: true,
      user: { email: "student@northeastern.edu" }
    });
  });

  it("assigns the administrator role from the normalized local allowlist", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      localAdminEmails: " OTHER@example.com, Admin@Example.com "
    });

    const request = await service.requestEmailCode("admin@example.com");
    if (!request.devCode) throw new Error("Expected development verification code");
    const session = await service.verifyEmailCode({ email: "ADMIN@example.com", code: request.devCode });

    expect(session.user.role).toBe("ADMIN");
  });

  it("creates production users as USER when no local allowlist exists", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "production",
      localAdminEmails: "",
      emailSender: sender
    });
    const request = await service.requestEmailCode("student@northeastern.edu");
    const code = sender.sentCodes[0].code;

    const session = await service.verifyEmailCode({ email: request.email, code });

    expect(session.user.role).toBe("USER");
  });

  it("never demotes an existing administrator who is absent from the local allowlist", async () => {
    const prisma = createPrismaMock();
    prisma.verificationCode.state.user = {
      id: "user-1",
      email: "admin@example.com",
      role: "ADMIN",
      createdAt: new Date()
    };
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      localAdminEmails: ""
    });

    const request = await service.requestEmailCode("admin@example.com");
    if (!request.devCode) throw new Error("Expected development verification code");
    const session = await service.verifyEmailCode({ email: "admin@example.com", code: request.devCode });

    expect(session.user.role).toBe("ADMIN");
  });

  it("does not return dev codes in production", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "production", emailSender: sender });

    const request = await service.requestEmailCode("student@northeastern.edu");

    expect(request).toEqual({
      email: "student@northeastern.edu",
      expiresAt: prisma.verificationCode.state.code?.expiresAt
    });
  });

  it("rejects verification after five failed attempts", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });

    await service.requestEmailCode("student@northeastern.edu");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.verifyEmailCode({
          email: "student@northeastern.edu",
          code: "000000"
        })
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(sender.sentCodes).toHaveLength(1);
    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: sender.sentCodes[0].code
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.verificationCode.state.code?.attemptCount).toBe(5);
  });

  it("serializes concurrent invalid attempts at the five-attempt cap", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender
    });

    await service.requestEmailCode("student@northeastern.edu");
    await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.verifyEmailCode({
          email: "student@northeastern.edu",
          code: "000000"
        })
      )
    );

    expect(prisma.verificationCode.state.code?.attemptCount).toBe(5);
  });

  it("rejects malformed direct verification codes without consuming attempts", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });

    await service.requestEmailCode("student@northeastern.edu");

    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: "abc123"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.verificationCode.state.code?.attemptCount).toBe(0);
    expect(prisma.verificationCode.updateCalls.filter((call) => isAttemptIncrement(call.data))).toHaveLength(0);
  });

  it("generically accepts a second code request inside the cooldown without sending", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 60_000
    });

    await service.requestEmailCode("student@northeastern.edu");

    await expect(service.requestEmailCode("student@northeastern.edu")).resolves.toEqual({
      email: "student@northeastern.edu",
      expiresAt: expect.any(Date)
    });
    expect(sender.sentCodes).toHaveLength(1);
  });

  it("sends exactly one of two concurrent code requests during cooldown", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 60_000
    });

    const results = await Promise.allSettled([
      service.requestEmailCode(" Student@Northeastern.edu "),
      service.requestEmailCode("student@northeastern.edu")
    ]);

    const successful = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.requestEmailCode>>> =>
        result.status === "fulfilled"
    );
    expect(successful).toHaveLength(2);
    expect(sender.sentCodes).toHaveLength(1);

    const deliveredCode = sender.sentCodes[0].code;
    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: deliveredCode
      })
    ).resolves.toMatchObject({
      user: { email: "student@northeastern.edu" }
    });
  });

  it("keeps cooldown active but generic after a code is consumed", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 60_000
    });

    const request = await service.requestEmailCode("student@northeastern.edu");
    if (!request.devCode) throw new Error("Expected development verification code");
    await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: request.devCode
    });

    await expect(service.requestEmailCode("student@northeastern.edu")).resolves.toEqual({
      email: "student@northeastern.edu",
      expiresAt: expect.any(Date)
    });
    expect(sender.sentCodes).toHaveLength(1);
  });

  it("invalidates older active codes when issuing a newer code after cooldown", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 0
    });

    await service.requestEmailCode("student@northeastern.edu");
    expect(sender.sentCodes).toHaveLength(1);
    const oldCode = sender.sentCodes[0].code;
    await service.requestEmailCode("student@northeastern.edu");
    expect(sender.sentCodes).toHaveLength(2);
    const newCode = sender.sentCodes[1].code;

    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: oldCode
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const session = await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: newCode
    });

    expect(session.user.email).toBe("student@northeastern.edu");
  });

  it("sends production codes through the configured sender without returning devCode", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "production", emailSender: sender });

    const request = await service.requestEmailCode("student@northeastern.edu");

    expect(request.devCode).toBeUndefined();
    expect(sender.sentCodes).toHaveLength(1);
    expect(sender.sentCodes[0]).toMatchObject({
      email: "student@northeastern.edu",
      code: expect.stringMatching(/^\d{6}$/),
      verificationCodeId: expect.any(String)
    });
    expect(prisma.verificationCode.state.codes.at(-1)?.codeHash).not.toBe(sender.sentCodes[0].code);
  });

  it("does not disclose a development code after provider failure", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const fixedNow = 1_800_000_000_000;
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 0,
      now: () => fixedNow
    });
    const successfulAcceptance = await service.requestEmailCode("student@northeastern.edu");
    const existingCode = prisma.verificationCode.state.codes[0];
    const warnings: unknown[][] = [];

    const failingSender: EmailSender = {
      async sendVerificationCode() {
        throw new Error("provider detail with student@northeastern.edu and 123456");
      }
    };
    const failingService = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: failingSender,
      codeRequestCooldownMs: 0,
      now: () => fixedNow,
      logger: { warn: (...args: unknown[]) => warnings.push(args) }
    });

    const failedAcceptance = await failingService.requestEmailCode("student@northeastern.edu");

    expect(successfulAcceptance).toMatchObject({
      email: "student@northeastern.edu",
      expiresAt: new Date(fixedNow + 600_000),
      devCode: expect.stringMatching(/^\d{6}$/)
    });
    expect(failedAcceptance).toEqual({
      email: "student@northeastern.edu",
      expiresAt: new Date(fixedNow + 600_000)
    });
    expect(prisma.verificationCode.state.codes).toHaveLength(2);
    expect(existingCode.consumedAt).toBeNull();
    expect(prisma.verificationCode.state.codes[1].deliveryStatus).toBe(VerificationDeliveryStatus.FAILED);
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings)).not.toContain("student@northeastern.edu");
    expect(JSON.stringify(warnings)).not.toContain("123456");
    expect(JSON.stringify(warnings)).not.toContain("provider detail");
  });

  it("applies a testable minimum response budget with jitter to every accepted LOGIN issuance branch", async () => {
    const delays: number[] = [];
    const timing = {
      responseMinimumMs: 250,
      responseJitterMs: 50,
      now: () => 1_000,
      random: () => 0.5,
      delay: async (milliseconds: number) => {
        delays.push(milliseconds);
      }
    };

    const invitedPrisma = createPrismaMock();
    await createAuthService(invitedPrisma, new JwtService({ secret: "test-secret" }), {
      nodeEnv: "development",
      emailSender: createEmailSenderMock(),
      ...timing
    }).requestEmailCode("invited@example.com");

    const uninvitedPrisma = createPrismaMock();
    uninvitedPrisma.verificationCode.state.inviteActive = false;
    await createAuthService(uninvitedPrisma, new JwtService({ secret: "test-secret" }), {
      nodeEnv: "development",
      emailSender: createEmailSenderMock(),
      ...timing
    }).requestEmailCode("uninvited@example.com");

    const unavailableSender: EmailSender = {
      async sendVerificationCode() {
        throw new Error("unavailable");
      }
    };
    await createAuthService(createPrismaMock(), new JwtService({ secret: "test-secret" }), {
      nodeEnv: "development",
      emailSender: unavailableSender,
      logger: { warn: () => undefined },
      ...timing
    }).requestEmailCode("provider-failed@example.com");

    expect(delays).toEqual([275, 275, 275]);
  });

  it("does not send a code when storing the code fails", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });
    prisma.verificationCode.state.failCreate = true;

    await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toThrow("create failed");

    expect(sender.sentCodes).toHaveLength(0);
    expect(prisma.verificationCode.state.codes).toHaveLength(0);
  });

  it("fails production requests when the default production sender is not configured", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    expect(() => createAuthService(prisma, jwt, { nodeEnv: "production" })).toThrow(
      "Production email sender must be resend"
    );
  });
});

type VerificationCodeRecord = {
  id: string;
  email: string;
  purpose: VerificationPurpose;
  code?: string;
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

type VerificationCodeAttemptUpdate = {
  attemptCount: {
    increment: number;
  };
};

type VerificationCodeUpdateData = Partial<VerificationCodeRecord> | VerificationCodeAttemptUpdate;

function createEmailSenderMock(): EmailSender & {
  sentCodes: Array<{ email: string; code: string; verificationCodeId: string }>;
} {
  return {
    sentCodes: [],
    async sendVerificationCode(input) {
      this.sentCodes.push(input);
      return { providerMessageId: "provider-message" };
    }
  };
}

type AuthServiceTestOptions = Partial<AuthServiceOptions> & {
  emailSender?: EmailSender;
};

function createAuthService(
  prisma: ReturnType<typeof createPrismaMock>,
  jwt: JwtService,
  options: AuthServiceTestOptions
) {
  const { emailSender, ...optionOverrides } = options;
  const nodeEnv = optionOverrides.nodeEnv ?? "development";
  return new AuthService(prisma as never, jwt, emailSender ?? createEmailSender({ nodeEnv }), {
    nodeEnv,
    otpHashSecret: "otp-test-secret-that-is-at-least-32-bytes",
    codeTtlMs: 600_000,
    codeMaxAttempts: 5,
    codeRequestCooldownMs: 60_000,
    localAdminEmails: "",
    responseMinimumMs: 0,
    responseJitterMs: 0,
    ...optionOverrides
  });
}

function createPrismaMock() {
  const state = {
    codes: [] as VerificationCodeRecord[],
    failCreate: false,
    failProfileUpsert: false,
    inviteActive: true,
    get code() {
      return this.codes.at(-1);
    },
    user: undefined as { id: string; email: string; role: string; createdAt: Date } | undefined,
    profile: undefined as { id: string; email: string } | undefined
  };

  const mock = {
    verificationCode: {
      state,
      updateCalls: [] as Array<{ where: { id: string }; data: VerificationCodeUpdateData }>,
      create: async ({
        data
      }: {
        data: Omit<
          VerificationCodeRecord,
          "id" | "sentAt" | "failedAt" | "providerMessageId" | "consumedAt"
        >;
      }) => {
        if (state.failCreate) throw new Error("create failed");

        const created = {
          id: `code-${state.codes.length + 1}`,
          email: data.email,
          codeHash: data.codeHash,
          codeSalt: data.codeSalt,
          hashVersion: data.hashVersion,
          purpose: data.purpose,
          attemptCount: data.attemptCount,
          deliveryStatus: data.deliveryStatus,
          sentAt: null,
          failedAt: null,
          providerMessageId: null,
          expiresAt: data.expiresAt,
          consumedAt: null,
          createdAt: data.createdAt
        };
        state.codes.push(created);
        return created;
      },
      findFirst: async ({
        where,
        orderBy
      }: {
        where: {
          email: string;
          purpose?: VerificationPurpose;
          deliveryStatus?: VerificationDeliveryStatus;
          consumedAt?: null;
          expiresAt?: { gt: Date };
          createdAt?: { gt: Date };
        };
        orderBy?: { createdAt: "desc" };
      }) => {
        const matches = state.codes.filter((code) => {
          if (code.email !== where.email) return false;
          if (where.purpose && code.purpose !== where.purpose) return false;
          if (where.deliveryStatus && code.deliveryStatus !== where.deliveryStatus) return false;
          if ("consumedAt" in where && code.consumedAt !== where.consumedAt) return false;
          if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) return false;
          if (where.createdAt && code.createdAt <= where.createdAt.gt) return false;
          return true;
        });

        if (orderBy?.createdAt === "desc") {
          const match = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          return match ? { ...match } : null;
        }

        return matches[0] ? { ...matches[0] } : null;
      },
      update: async (args: { where: { id: string }; data: VerificationCodeUpdateData }) => {
        const code = state.codes.find((record) => record.id === args.where.id);
        if (!code) return null;

        if (isAttemptIncrement(args.data)) {
          code.attemptCount = (code.attemptCount ?? 0) + args.data.attemptCount.increment;
        } else {
          Object.assign(code, args.data);
        }

        mock.verificationCode.updateCalls.push(args);
        return code;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = state.codes.findIndex((record) => record.id === where.id);
        if (index === -1) return null;
        const [deleted] = state.codes.splice(index, 1);
        return deleted;
      },
      updateMany: async ({
        where,
        data
      }: {
        where: {
          email: string;
          purpose?: VerificationPurpose;
          deliveryStatus?: VerificationDeliveryStatus;
          consumedAt: null;
          id?: { not: string };
          createdAt?: { lt: Date };
        };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const code of state.codes) {
          if (
            code.email === where.email &&
            (!where.purpose || code.purpose === where.purpose) &&
            (!where.deliveryStatus || code.deliveryStatus === where.deliveryStatus) &&
            code.consumedAt === where.consumedAt &&
            (!where.createdAt || code.createdAt < where.createdAt.lt) &&
            code.id !== where.id?.not
          ) {
            code.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      }
    },
    betaInvite: {
      findFirst: async () => (state.inviteActive ? { id: "invite-1" } : null),
      updateMany: async () => ({ count: state.inviteActive ? 1 : 0 })
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        if (state.user?.email === where.email) return state.user;
        return null;
      },
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { email: string };
        create: { email: string; role?: string };
        update?: { role?: string };
      }) => {
        state.user ??= {
          id: "user-1",
          email: where.email || create.email,
          role: create.role ?? "USER",
          createdAt: new Date()
        };
        if (update?.role) state.user.role = update.role;
        return state.user;
      }
    },
    profile: {
      state,
      upsert: async ({ where, create }: { where: { email: string }; create: { email: string } }) => {
        if (state.failProfileUpsert) throw new Error("profile upsert failed");
        state.profile ??= {
          id: "profile-1",
          email: where.email || create.email
        };
        return state.profile;
      }
    }
  };

  type TestTransaction = typeof mock & {
    $executeRaw: (_query: TemplateStringsArray, email: string) => Promise<number>;
  };
  const transactionalMock = Object.assign(mock, {
    $transaction: async <T>(operation: (transaction: TestTransaction) => Promise<T>) => {
      let releaseLock: (() => void) | undefined;
      let snapshot: ReturnType<typeof snapshotState> | undefined;
      const transaction: TestTransaction = {
        ...mock,
        $executeRaw: async (_query: TemplateStringsArray, email: string) => {
          releaseLock = await acquireEmailLock(email);
          snapshot = snapshotState();
          return 1;
        }
      };

      try {
        return await operation(transaction);
      } catch (error) {
        if (snapshot) restoreState(snapshot);
        throw error;
      } finally {
        releaseLock?.();
      }
    }
  });

  const emailLockTails = new Map<string, Promise<void>>();

  async function acquireEmailLock(email: string) {
    const previous = emailLockTails.get(email) ?? Promise.resolve();
    let releaseCurrent = () => {};
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    emailLockTails.set(email, tail);
    await previous;

    return () => {
      releaseCurrent();
      if (emailLockTails.get(email) === tail) emailLockTails.delete(email);
    };
  }

  function snapshotState() {
    return {
      codes: state.codes.map((record) => ({ ...record })),
      user: state.user ? { ...state.user } : undefined,
      profile: state.profile ? { ...state.profile } : undefined
    };
  }

  function restoreState(snapshot: ReturnType<typeof snapshotState>) {
    state.codes.splice(0, state.codes.length, ...snapshot.codes);
    state.user = snapshot.user;
    state.profile = snapshot.profile;
  }

  return transactionalMock;
}

function isAttemptIncrement(data: VerificationCodeUpdateData): data is VerificationCodeAttemptUpdate {
  return "attemptCount" in data && typeof data.attemptCount === "object";
}
