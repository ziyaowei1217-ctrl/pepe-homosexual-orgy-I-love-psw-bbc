import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { SESSION_ISSUER, SESSION_AUDIENCE, SESSION_PURPOSE } from "./session-token";
import { PrismaService } from "../prisma/prisma.service";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  sessionId: string;
  adminReauthenticatedAt?: number;
  mfaVerifiedAt?: number;
};

@Injectable()
export class AuthenticatedUserService {
  private readonly revocationListeners = new Set<(id: string) => void | Promise<void>>();
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async fromBearerToken(token: string): Promise<AuthenticatedUser> {
    let payload: { sub?: string; sid?: string; purpose?: string; mfaVerifiedAt?: unknown; adminReauthenticatedAt?: unknown };
    try {
      payload = await this.jwt.verifyAsync<typeof payload>(token, { algorithms: ["HS256"], issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE });
      if (!payload || typeof payload.sub !== "string" || !payload.sub || typeof payload.sid !== "string" || !payload.sid || payload.purpose !== SESSION_PURPOSE) throw new UnauthorizedException("Invalid bearer token");
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid! } });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException("Invalid bearer token");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("Invalid bearer token");

    return {
      id: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
      ...(Number.isSafeInteger(payload.mfaVerifiedAt) && session.mfaVerifiedAt?.getTime() === payload.mfaVerifiedAt ? { mfaVerifiedAt: payload.mfaVerifiedAt as number } : {}),
      ...(Number.isSafeInteger(payload.adminReauthenticatedAt)
        ? { adminReauthenticatedAt: payload.adminReauthenticatedAt as number }
        : {})
    };
  }

  async revoke(user: Pick<AuthenticatedUser, "id" | "sessionId">) {
    await this.prisma.authSession.updateMany({ where: { id: user.sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    // Durable revocation is authoritative. Adapter outage must not undo logout.
    await Promise.allSettled([...this.revocationListeners].map((listener) => Promise.resolve().then(() => listener(user.sessionId))));
  }

  onSessionRevoked(listener: (id: string) => void | Promise<void>) {
    this.revocationListeners.add(listener);
    return () => { this.revocationListeners.delete(listener); };
  }

  async activeSessionIds(userId: string) {
    const rows = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    return rows.map((row) => row.id);
  }
}
