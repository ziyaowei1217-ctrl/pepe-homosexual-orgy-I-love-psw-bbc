import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";

describe("AuthService", () => {
  it("stores hashed verification codes and verifies them into JWT sessions", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const service = new AuthService(prisma as never, jwt, { nodeEnv: "development" });

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
    const service = new AuthService(prisma as never, jwt, { nodeEnv: "production" });

    const request = await service.requestEmailCode("student@northeastern.edu");

    expect(request).toEqual({
      email: "student@northeastern.edu",
      expiresAt: prisma.verificationCode.state.code?.expiresAt
    });
  });

  it("rejects verification after five failed attempts", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const service = new AuthService(prisma as never, jwt, { nodeEnv: "development" });

    await service.requestEmailCode("student@northeastern.edu");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.verifyEmailCode({
          email: "student@northeastern.edu",
          code: "000000"
        })
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    await expect(
      service.verifyEmailCode({
        email: "student@northeastern.edu",
        code: prisma.verificationCode.state.devCode!
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.verificationCode.state.code?.attemptCount).toBe(5);
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

function createPrismaMock() {
  const state = {
    code: undefined as VerificationCodeRecord | undefined,
    devCode: undefined as string | undefined,
    user: undefined as { id: string; email: string; role: string; createdAt: Date } | undefined
  };

  const mock = {
    verificationCode: {
      state,
      updateCalls: [] as Array<{ where: { id: string }; data: VerificationCodeUpdateData }>,
      create: async ({ data }: { data: { email: string; code?: string; codeHash?: string; expiresAt: Date; attemptCount?: number } }) => {
        if (data.code) state.devCode = data.code;
        state.code = {
          id: "code-1",
          email: data.email,
          code: data.code,
          codeHash: data.codeHash,
          attemptCount: data.attemptCount ?? 0,
          expiresAt: data.expiresAt,
          consumedAt: null,
          createdAt: new Date()
        };
        return state.code;
      },
      findFirst: async ({ where }: { where: { email: string; consumedAt: null; expiresAt: { gt: Date } } }) => {
        if (!state.code) return null;
        if (state.code.email !== where.email) return null;
        if (state.code.consumedAt !== where.consumedAt) return null;
        if (state.code.expiresAt <= where.expiresAt.gt) return null;
        return state.code;
      },
      update: async (args: { where: { id: string }; data: VerificationCodeUpdateData }) => {
        if (!state.code || state.code.id !== args.where.id) return null;

        if (isAttemptIncrement(args.data)) {
          state.code.attemptCount = (state.code.attemptCount ?? 0) + args.data.attemptCount.increment;
        } else {
          state.code = { ...state.code, ...args.data };
        }

        mock.verificationCode.updateCalls.push(args);
        return state.code;
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
