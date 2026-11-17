import { Injectable } from "@nestjs/common";

/**
 * Caps document writes per key (the controller uses account and kind) on this instance. The web app batches
 * changes a couple of seconds apart, so normal use stays far below the limit; this only stops a runaway client.
 * It is in memory on purpose: counting every write in Redis would spend the free Upstash command quota.
 */
@Injectable()
export class UserDocumentWriteLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = 120,
    private readonly windowMs = 10 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  /** Counts a write and returns 0, or the seconds to wait when the key is over the limit. */
  take(key: string): number {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      if (this.windows.size >= 10_000) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    if (window.count >= this.limit) return Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000));
    window.count += 1;
    return 0;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
