import { HttpException, HttpStatus } from "@nestjs/common";

export type RoommateMessageRateLimitRequest = {
  userId: string;
  conversationId: string;
  now?: Date;
};

export abstract class RoommateMessageRateLimiter {
  abstract consume(request: RoommateMessageRateLimitRequest): Promise<void>;
}

type LocalRoommateMessageRateLimiterOptions = {
  now?: () => number;
  limit?: number;
  windowMs?: number;
};

export class LocalRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private readonly timestamps = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(options: LocalRoommateMessageRateLimiterOptions = {}) {
    super();
    this.now = options.now ?? Date.now;
    this.limit = options.limit ?? 20;
    this.windowMs = options.windowMs ?? 60_000;
  }

  async consume(request: RoommateMessageRateLimitRequest) {
    const now = request.now?.getTime() ?? this.now();
    const key = `${request.userId}:${request.conversationId}`;
    const active = (this.timestamps.get(key) ?? []).filter((timestamp) => timestamp > now - this.windowMs);

    if (active.length >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((active[0] + this.windowMs - now) / 1000));
      this.timestamps.set(key, active);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Roommate message rate limit exceeded", retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    active.push(now);
    this.timestamps.set(key, active);
  }
}

