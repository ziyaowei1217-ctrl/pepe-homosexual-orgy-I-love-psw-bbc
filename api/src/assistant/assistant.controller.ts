import {
  Controller,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";

import type { RateLimitRule, RateLimitStore } from "../auth/auth-rate-limit";
import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { AUTH_RATE_LIMIT_STORE } from "../auth/auth.tokens";

// The web app's AI assistant (app/api/assistant/*) calls the model. Before each call it asks this endpoint,
// which checks the session and counts the request in the shared rate-limit store (Valkey in production),
// so the limits hold across web instances and restarts.
const quotas = {
  chat: { tenMinutes: 20, day: 100, globalHour: 1_000 },
  "listing-copy": { tenMinutes: 10, day: 30, globalHour: 300 }
};

@UseGuards(AuthGuard)
@Controller("assistant")
export class AssistantController {
  constructor(@Inject(AUTH_RATE_LIMIT_STORE) private readonly store: RateLimitStore) {}

  @Post("quota/:kind")
  @HttpCode(200)
  async claimQuota(
    @Param("kind") kind: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): unknown }
  ) {
    if (kind !== "chat" && kind !== "listing-copy") throw new NotFoundException();
    const quota = quotas[kind];
    const userId = request.user.id;
    const rules: RateLimitRule[] = [
      rule(kind, "user-10m", userId, quota.tenMinutes, 600),
      rule(kind, "user-day", userId, quota.day, 86_400),
      rule(kind, "global-hour", "all", quota.globalHour, 3_600)
    ];

    let result: Awaited<ReturnType<RateLimitStore["consume"]>>;
    try {
      result = await this.store.consume(rules);
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        code: "ASSISTANT_UNAVAILABLE",
        message: "Assistant is temporarily unavailable"
      });
    }
    if (!result.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, result.retryAfterSeconds)));
      throw new HttpException(
        { statusCode: 429, error: "Too Many Requests", code: "ASSISTANT_RATE_LIMITED", message: "Too many assistant requests" },
        429
      );
    }
    return { userId };
  }
}

function rule(kind: string, dimension: string, identifier: string, limit: number, windowSeconds: number): RateLimitRule {
  return { key: `assistant:${kind}:${dimension}:${identifier}`, dimension, limit, windowSeconds };
}
