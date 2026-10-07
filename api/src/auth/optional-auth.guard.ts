import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedRequest } from "./auth.guard";
import { MAX_BEARER_TOKEN_LENGTH } from "./authenticated-user.service";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest> & { headers: { authorization?: string } }>();
    const header = request.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) return true;

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown; iat?: number }>(token, { algorithms: ["HS256"], maxAge: "7d" });
      if (typeof payload.sub !== "string" || !payload.sub || !Number.isSafeInteger(payload.iat) ||
          payload.iat! > Math.floor(Date.now() / 1000) + 60) return true;

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return true;

      request.user = { id: user.id, email: user.email, role: user.role };
    } catch {
      return true;
    }

    return true;
  }
}
