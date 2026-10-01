import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { MessagingInfrastructureHealth } from "./messaging-infrastructure-health";
import { AuthInfrastructureHealth } from "./auth-infrastructure-health";

@Injectable()
export class HealthService {
  private inFlightCheck?: Promise<unknown>;
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
    if (!this.inFlightCheck) {
      this.inFlightCheck = this.checkDependencies().finally(() => { this.inFlightCheck = undefined; });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.inFlightCheck,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new ServiceUnavailableException({
            status: "error", checks: { database: "error", readiness: "timeout", ...this.messagingInfrastructure.snapshot() }
          })), 3_500);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async checkDependencies() {
    // One underlying check survives caller timeouts until the actual driver
    // socket deadline releases the query. Repeated health requests cannot
    // accumulate accepted queries on a stalled database connection.
    const production = process.env.NODE_ENV === "production";
    const infrastructure = production ? Promise.all([
      this.authInfrastructure.check(), this.messagingInfrastructure.refresh()
    ]) : Promise.resolve(undefined);
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
    if (production) {
      const [authentication] = (await infrastructure)!;
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
