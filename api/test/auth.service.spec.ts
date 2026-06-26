import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";

describe("AuthService", () => {
  it("creates a verification code and verifies it into a JWT session", async () => {
    const prisma = createPrismaMock();
    const jwt = new JwtService({ secret: "test-secret" });
    const service = new AuthService(prisma as never, jwt);

    const request = await service.requestEmailCode("student@northeastern.edu");

    expect(request.email).toBe("student@northeastern.edu");
    expect(request.devCode).toMatch(/^\d{6}$/);

    const session = await service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: request.devCode
    });

    expect(session.accessToken).toBeTruthy();
    expect(session.user.email).toBe("student@northeastern.edu");
    expect(prisma.verificationCode.updateCalls[0].data.consumedAt).toBeInstanceOf(Date);
  });
});

function createPrismaMock() {
  const state = {
    code: undefined as { id: string; email: string; code: string; expiresAt: Date; consumedAt: Date | null } | undefined,
    user: undefined as { id: string; email: string; role: string; createdAt: Date } | undefined
  };

  const mock = {
    verificationCode: {
      updateCalls: [] as Array<{ where: unknown; data: { consumedAt: Date } }>,
      create: async ({ data }: { data: { email: string; code: string; expiresAt: Date } }) => {
        state.code = { id: "code-1", ...data, consumedAt: null };
        return state.code;
      },
      findFirst: async () => state.code,
      update: async (args: { where: unknown; data: { consumedAt: Date } }) => {
        state.code = { ...state.code!, consumedAt: args.data.consumedAt };
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
