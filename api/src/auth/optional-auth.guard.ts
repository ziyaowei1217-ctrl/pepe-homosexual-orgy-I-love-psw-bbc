import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedRequest } from "./auth.guard";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest> & { headers: { authorization?: string } }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) return true;

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
      if (!payload.sub) return true;

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return true;

      request.user = { id: user.id, email: user.email, role: user.role };
    } catch {
      return true;
    }

    return true;
  }
}
