import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithDeadline } from "./support/bounded-operation";

describe("bounded test cleanup", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects a cleanup operation that never settles at its explicit deadline", async () => {
    vi.useFakeTimers();
    const stuckCleanup = runWithDeadline("Nest application close", () => new Promise<void>(() => undefined), 100);
    const observed = Promise.race([
      stuckCleanup.then(
        () => "cleanup resolved",
        (error: unknown) => (error instanceof Error ? error.message : String(error))
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("outer test deadline elapsed"), 200))
    ]);

    await vi.advanceTimersByTimeAsync(200);

    expect(await observed).toBe("Nest application close timed out after 100ms");
  });
});
