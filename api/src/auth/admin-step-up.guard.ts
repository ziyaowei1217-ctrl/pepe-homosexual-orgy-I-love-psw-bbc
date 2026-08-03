import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { RequestWithId } from "../http/request-id";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedRequest } from "./auth.guard";
import { ADMIN_STEP_UP_OPTIONS } from "./auth.tokens";

@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ADMIN_STEP_UP_OPTIONS) private readonly options: { now: () => number }
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & RequestWithId>();
    const verifiedAt = request.user.adminReauthenticatedAt;
    const nowSeconds = Math.floor(this.options.now() / 1_000);
    const valid =
      Number.isSafeInteger(verifiedAt) &&
      verifiedAt! <= nowSeconds + 60 &&
      nowSeconds - verifiedAt! <= 30 * 60;

    if (valid) return true;

    await this.audit.append(this.prisma, {
      actorType: "USER",
      actorUserId: request.user.id,
      actorEmail: request.user.email,
      action: "ADMIN_WRITE_BLOCKED",
      targetType: "HTTP_ROUTE",
      targetId: routeIdentifier(context),
      outcome: "BLOCKED",
      requestId: request.requestId,
      metadata: {
        method: request.method ?? "UNKNOWN",
        reason: "ADMIN_REAUTH_REQUIRED"
      }
    });

    throw new ForbiddenException({
      statusCode: 403,
      code: "ADMIN_REAUTH_REQUIRED",
      message: "Administrator verification is required"
    });
  }
}

function routeIdentifier(context: ExecutionContext) {
  const controllerName = context.getClass().name || "UnknownController";
  const handlerName = context.getHandler().name || "unknownHandler";
  return `${controllerName}.${handlerName}`.slice(0, 200);
}
