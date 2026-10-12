import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./authenticated-user.service";
import type { AuthenticatedRequest } from "./auth.guard";
import { mfaVerifiedUntil } from "./mfa.service";
export async function hasRecentMfa(prisma: PrismaService, user: AuthenticatedUser, now = Date.now()) {
  if (!mfaVerifiedUntil(user.mfaVerifiedAt, now)) return false;
  const [factor, session] = await Promise.all([
    prisma.userMfa.findUnique({ where: { userId: user.id } }),
    prisma.authSession.findUnique({ where: { id: user.sessionId } })
  ]);
  return Boolean(factor?.enabledAt && session && session.userId === user.id && !session.revokedAt && session.expiresAt.getTime() > now && session.mfaVerifiedAt?.getTime() === user.mfaVerifiedAt);
}
@Injectable()
export class MfaGuard implements CanActivate {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async canActivate(context: ExecutionContext) {
   const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
   if (await hasRecentMfa(this.prisma, user)) return true;
   throw new ForbiddenException({ code: "MFA_VERIFICATION_REQUIRED", message: "Verify an independent factor before this operation" });
 }
}
