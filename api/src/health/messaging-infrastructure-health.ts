import { Injectable } from "@nestjs/common";

export type MessagingInfrastructureComponent = "realtime" | "messageRateLimit";
export type MessagingInfrastructureMode = "single-instance" | "distributed" | "local-fallback";
export type MessagingInfrastructureReason = "connection" | "timeout" | "protocol" | "runtime";

type HealthyComponent = { status: "ok"; mode: Exclude<MessagingInfrastructureMode, "local-fallback"> };
type DegradedComponent = {
  status: "degraded";
  mode: "local-fallback";
  reason: MessagingInfrastructureReason;
  changedAt: string;
};
export type MessagingInfrastructureComponentHealth = HealthyComponent | DegradedComponent;

@Injectable()
export class MessagingInfrastructureHealth {
  private readonly probes = new Map<MessagingInfrastructureComponent, () => Promise<void>>();
  private readonly state: Record<MessagingInfrastructureComponent, MessagingInfrastructureComponentHealth> = {
    realtime: { status: "ok", mode: "single-instance" },
    messageRateLimit: { status: "ok", mode: "single-instance" }
  };

  constructor(private readonly now: () => Date = () => new Date()) {}

  registerProbe(component: MessagingInfrastructureComponent, probe: () => Promise<void>) {
    this.probes.set(component, probe);
  }

  async refresh() {
    await Promise.all([...this.probes.entries()].map(async ([component, probe]) => {
      try { await probe(); }
      catch { this.markLocalFallback(component, "runtime"); }
    }));
  }

  markSingleInstance(component: MessagingInfrastructureComponent) {
    this.state[component] = { status: "ok", mode: "single-instance" };
  }

  markDistributed(component: MessagingInfrastructureComponent) {
    this.state[component] = { status: "ok", mode: "distributed" };
  }

  markLocalFallback(component: MessagingInfrastructureComponent, reason: MessagingInfrastructureReason) {
    this.state[component] = {
      status: "degraded",
      mode: "local-fallback",
      reason,
      changedAt: this.now().toISOString()
    };
  }

  snapshot() {
    return { realtime: { ...this.state.realtime }, messageRateLimit: { ...this.state.messageRateLimit } };
  }
}
