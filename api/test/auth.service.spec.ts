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
    expect(prisma.verificationCode.state.code?.consumedAt).toBeInstanceOf(Date);
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
    get code() {
      return this.codes.at(-1);
    },
    user: undefined as { id: string; email: string; role: string; createdAt: Date } | undefined
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
          return matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        }

        return matches[0] ?? null;
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
      upsert: async ({ where, create }: { where: { email: string }; create: { email: string } }) => {
        state.user ??= {
          id: "user-1",
          email: where.email || create.email,
          role: "USER",
          createdAt: new Date()
        };
        return state.user;
      }
    }
  };

  return mock;
}

function isAttemptIncrement(data: VerificationCodeUpdateData): data is VerificationCodeAttemptUpdate {
  return "attemptCount" in data && typeof data.attemptCount === "object";
}
