import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { MessagingInfrastructureHealth } from "./messaging-infrastructure-health";
import { AuthInfrastructureHealth } from "./auth-infrastructure-health";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingInfrastructureHealth)
    private readonly messagingInfrastructure: MessagingInfrastructureHealth,
    @Optional() @Inject(AuthInfrastructureHealth)
    private readonly authInfrastructure: AuthInfrastructureHealth = new AuthInfrastructureHealth()
  ) {}

  health() {
    return { status: "ok" };
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      const messaging = this.messagingInfrastructure.snapshot();
      throw new ServiceUnavailableException({
        status: "error",
        checks: {
          database: "error",
          ...messaging
        }
      });
    }
    if (process.env.NODE_ENV === "production") {
      const [authentication] = await Promise.all([
        this.authInfrastructure.check(), this.messagingInfrastructure.refresh()
      ]);
      const messaging = this.messagingInfrastructure.snapshot();
      const checks = { database: "ok", ...messaging, authRateLimit: authentication };
      if (authentication.status !== "ok" || Object.values(messaging).some(
        check => check.status !== "ok" || check.mode !== "distributed"
      )) throw new ServiceUnavailableException({ status: "error", checks });
      return { status: "ok", checks };
    }
    const messaging = this.messagingInfrastructure.snapshot();
    return {
      status: Object.values(messaging).some(check => check.status === "degraded") ? "degraded" : "ok",
      checks: { database: "ok", ...messaging }
    };
  }
}
