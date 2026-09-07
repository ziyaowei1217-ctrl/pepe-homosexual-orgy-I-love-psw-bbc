import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  adminReauthenticatedAt?: number;
};

@Injectable()
export class AuthenticatedUserService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async fromBearerToken(token: string): Promise<AuthenticatedUser> {
    let payload: { sub?: string; adminReauthenticatedAt?: unknown };
    try {
      payload = await this.jwt.verifyAsync<typeof payload>(token);
      if (!payload || typeof payload.sub !== "string" || !payload.sub) throw new UnauthorizedException("Invalid bearer token");
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("Invalid bearer token");

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(Number.isSafeInteger(payload.adminReauthenticatedAt)
        ? { adminReauthenticatedAt: payload.adminReauthenticatedAt as number }
        : {})
    };
  }
}
