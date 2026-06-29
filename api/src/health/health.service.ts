import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  health() {
    return { status: "ok" };
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        checks: {
          database: "ok"
        }
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        checks: {
          database: "error"
        }
      });
    }
  }
}
