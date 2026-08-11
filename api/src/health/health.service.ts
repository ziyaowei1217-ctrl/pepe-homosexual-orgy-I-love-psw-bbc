import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { MessagingInfrastructureHealth } from "./messaging-infrastructure-health";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingInfrastructureHealth)
    private readonly messagingInfrastructure: MessagingInfrastructureHealth
  ) {}

  health() {
    return { status: "ok" };
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const messaging = this.messagingInfrastructure.snapshot();
      return {
        status: Object.values(messaging).some((check) => check.status === "degraded") ? "degraded" : "ok",
        checks: {
          database: "ok",
          ...messaging
        }
      };
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
  }
}
