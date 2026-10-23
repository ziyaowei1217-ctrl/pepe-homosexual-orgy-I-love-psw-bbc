import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthInfrastructureHealth {
  private probe?: () => Promise<void>;

  registerProbe(probe: () => Promise<void>) {
    this.probe = probe;
  }

  async check() {
    if (!this.probe) return { status: "error" as const, mode: "unconfigured" as const };
    try {
      await this.probe();
      return { status: "ok" as const, mode: "distributed" as const };
    } catch {
      return { status: "error" as const, mode: "distributed" as const };
    }
  }
}
