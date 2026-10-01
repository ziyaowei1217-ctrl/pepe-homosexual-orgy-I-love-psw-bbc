import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  adminReauthenticatedAt?: number;
};

export const MAX_BEARER_TOKEN_LENGTH = 8_192;
export const MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthenticatedUserService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async fromBearerToken(token: string): Promise<AuthenticatedUser> {
    return (await this.fromBearerTokenWithExpiry(token)).user;
  }

  async fromBearerTokenWithExpiry(token: string): Promise<{ user: AuthenticatedUser; expiresAt: number }> {
    let payload: { sub?: string; iat?: number; exp?: number; adminReauthenticatedAt?: unknown };
    try {
      if (typeof token !== "string" || !token || token.length > MAX_BEARER_TOKEN_LENGTH) {
        throw new UnauthorizedException("Invalid bearer token");
      }
      payload = await this.jwt.verifyAsync<typeof payload>(token, { algorithms: ["HS256"], maxAge: "7d" });
      if (!payload || typeof payload.sub !== "string" || !payload.sub) throw new UnauthorizedException("Invalid bearer token");
      if (!Number.isSafeInteger(payload.iat) || payload.iat! > Math.floor(Date.now() / 1000) + 60) {
        throw new UnauthorizedException("Invalid bearer token");
      }
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("Invalid bearer token");

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(Number.isSafeInteger(payload.adminReauthenticatedAt)
        ? { adminReauthenticatedAt: payload.adminReauthenticatedAt as number }
        : {})
    };
    return {
      user: authenticatedUser,
      expiresAt: Math.min(payload.exp ?? Infinity, payload.iat! + MAX_SESSION_AGE_SECONDS) * 1000
    };
  }
}
