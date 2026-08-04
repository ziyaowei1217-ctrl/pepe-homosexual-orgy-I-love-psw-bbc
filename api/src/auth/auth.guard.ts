import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";

type RequestLike = {
  ip?: string;
  headers: {
    [name: string]: string | string[] | undefined;
    authorization?: string;
  };
};

export type AuthenticatedRequest = RequestLike & {
  user: {
    id: string;
    email: string;
    role: string;
    adminReauthenticatedAt?: number;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) throw new UnauthorizedException("Missing bearer token");

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; adminReauthenticatedAt?: unknown }>(token);
      if (!payload.sub) throw new UnauthorizedException("Invalid bearer token");

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException("Invalid bearer token");

      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        ...(Number.isSafeInteger(payload.adminReauthenticatedAt)
          ? { adminReauthenticatedAt: payload.adminReauthenticatedAt as number }
          : {})
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
