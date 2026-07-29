import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";
import type { EmailSender } from "../src/email/email-sender";

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
    expect(prisma.verificationCode.updateCalls).toHaveLength(0);
  });

  it("rejects a second code request inside the cooldown window", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 60_000
    });

    await service.requestEmailCode("student@northeastern.edu");

    await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toBeInstanceOf(BadRequestException);
    expect(sender.sentCodes).toHaveLength(1);
  });

  it("allows exactly one concurrent code request per normalized email during cooldown", async () => {
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
    const rejected = results.filter((result) => result.status === "rejected");
    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(sender.sentCodes).toHaveLength(1);

    const deliveredCode = successful[0].value.devCode;
    if (!deliveredCode) throw new Error("Expected development verification code");
    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: deliveredCode
      })
    ).resolves.toMatchObject({
      user: { email: "student@northeastern.edu" }
    });
  });

  it("keeps cooldown active after a code is consumed", async () => {
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

    await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toBeInstanceOf(BadRequestException);
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
    expect(sender.sentCodes[0]).toEqual({
      email: "student@northeastern.edu",
      code: expect.stringMatching(/^\d{6}$/)
    });
    expect(prisma.verificationCode.state.codes.at(-1)?.codeHash).not.toBe(sender.sentCodes[0].code);
  });

  it("leaves stored codes unchanged when sending fails", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const sender = createEmailSenderMock();
    const service = createAuthService(prisma, jwt, {
      nodeEnv: "development",
      emailSender: sender,
      codeRequestCooldownMs: 0
    });
    await service.requestEmailCode("student@northeastern.edu");
    const existingCode = prisma.verificationCode.state.codes[0];

    const failingSender: EmailSender = {
      async sendVerificationCode() {
        throw new Error("email send failed");
      }
    };
    const failingService = createAuthService(prisma, jwt, {
      nodeEnv: "production",
      emailSender: failingSender,
      codeRequestCooldownMs: 0
    });

    await expect(failingService.requestEmailCode("student@northeastern.edu")).rejects.toThrow("email send failed");

    expect(prisma.verificationCode.state.codes).toEqual([existingCode]);
    expect(existingCode.consumedAt).toBeNull();
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
    const service = createAuthService(prisma, jwt, { nodeEnv: "production" });

    await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toThrow(
      "Production email sender is not configured"
    );
  });
});

type VerificationCodeRecord = {
  id: string;
  email: string;
  code?: string;
  codeHash?: string;
  attemptCount?: number;
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

function createEmailSenderMock(): EmailSender & { sentCodes: Array<{ email: string; code: string }> } {
  return {
    sentCodes: [],
    async sendVerificationCode(input) {
      this.sentCodes.push(input);
    }
  };
}

type AuthServiceTestOptions = ConstructorParameters<typeof AuthService>[2] & {
  emailSender?: EmailSender;
  codeRequestCooldownMs?: number;
  localAdminEmails?: string;
};

function createAuthService(
  prisma: ReturnType<typeof createPrismaMock>,
  jwt: JwtService,
  options: AuthServiceTestOptions
) {
  return new AuthService(prisma as never, jwt, options);
}

function createPrismaMock() {
  const state = {
    codes: [] as VerificationCodeRecord[],
    failCreate: false,
    failProfileUpsert: false,
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
      create: async ({ data }: { data: { email: string; codeHash?: string; expiresAt: Date; attemptCount?: number } }) => {
        if (state.failCreate) throw new Error("create failed");

        const created = {
          id: `code-${state.codes.length + 1}`,
          email: data.email,
          codeHash: data.codeHash,
          attemptCount: data.attemptCount ?? 0,
          expiresAt: data.expiresAt,
          consumedAt: null,
          createdAt: new Date(Date.now() + state.codes.length)
        };
        state.codes.push(created);
        return created;
      },
      findFirst: async ({
        where,
        orderBy
      }: {
        where: { email: string; consumedAt?: null; expiresAt?: { gt: Date } };
        orderBy?: { createdAt: "desc" };
      }) => {
        const matches = state.codes.filter((code) => {
          if (code.email !== where.email) return false;
          if ("consumedAt" in where && code.consumedAt !== where.consumedAt) return false;
          if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) return false;
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
        where: { email: string; consumedAt: null; id?: { not: string } };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const code of state.codes) {
          if (
            code.email === where.email &&
            code.consumedAt === where.consumedAt &&
            code.id !== where.id?.not
          ) {
            code.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      }
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
    $queryRawUnsafe: (_query: string, email: string) => Promise<unknown[]>;
  };
  const transactionalMock = Object.assign(mock, {
    $transaction: async <T>(operation: (transaction: TestTransaction) => Promise<T>) => {
      let releaseLock: (() => void) | undefined;
      let snapshot: ReturnType<typeof snapshotState> | undefined;
      const transaction: TestTransaction = {
        ...mock,
        $queryRawUnsafe: async (_query: string, email: string) => {
          releaseLock = await acquireEmailLock(email);
          snapshot = snapshotState();
          return [];
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
