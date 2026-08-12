import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ValkeyOperationTimeoutError,
  ValkeyRoommateMessageRateLimiter
} from "../src/roommate-conversations/roommate-message-rate-limit";

const runRetentionChild = process.env.RUN_ROOMMATE_LIMITER_RETENTION_CHILD === "1";
const describeParent = runRetentionChild ? describe.skip : describe;
const describeChild = runRetentionChild ? describe : describe.skip;

describeParent("roommate message limiter retired-client retention", () => {
  it("releases timeout-invalidated clients from a long-lived limiter", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--expose-gc",
        require.resolve("vitest/vitest.mjs"),
        "run",
        "test/roommate-message-rate-limit-retention.spec.ts",
        "--pool=threads",
        "--poolOptions.threads.singleThread"
      ],
      {
        cwd: join(__dirname, ".."),
        encoding: "utf8",
        env: { ...process.env, RUN_ROOMMATE_LIMITER_RETENTION_CHILD: "1" },
        timeout: 15_000,
        killSignal: "SIGKILL"
      }
    );

    expect(
      {
        status: result.status,
        signal: result.signal,
        error: result.error?.message,
        stderr: result.stderr,
        stdout: result.stdout
      },
      "retention child must prove retired clients are collectible"
    ).toEqual(
      expect.objectContaining({
        status: 0,
        signal: null,
        error: undefined
      })
    );
  }, 20_000);
});

describeChild("roommate message limiter retired-client retention child", () => {
  it("does not keep timeout-invalidated clients strongly reachable", async () => {
    const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
    expect(gc).toBeTypeOf("function");

    const { limiter, retiredClients } = await createRetiredClients();
    expect(limiter).toBeInstanceOf(ValkeyRoommateMessageRateLimiter);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      Array.from({ length: 2_000 }, () => ({ payload: new Uint8Array(1_024) }));
      gc?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    const released = retiredClients.filter((reference) => reference.deref() === undefined);
    expect(released.length).toBeGreaterThan(retiredClients.length / 2);
  }, 10_000);
});

async function createRetiredClients() {
  const retiredClients: WeakRef<object>[] = [];
  const settleEvaluations: Array<() => void> = [];
  const createClient = () => {
    const client = {
      isOpen: true,
      isReady: true,
      async connect() {},
      eval: () =>
        new Promise<unknown>((resolve) => {
          settleEvaluations.push(() => resolve([1, 0]));
        }),
      destroy() {}
    };
    retiredClients.push(new WeakRef(client));
    return client;
  };
  const limiter = new ValkeyRoommateMessageRateLimiter(createClient(), {
    operationTimeoutMs: 1,
    clientFactory: createClient
  });

  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      await limiter.consume({
        userId: `retention-user-${attempt}`,
        conversationId: "retention-conversation"
      });
      throw new Error("expected the Valkey evaluation to time out");
    } catch (error) {
      if (!(error instanceof ValkeyOperationTimeoutError)) throw error;
    }
  }

  settleEvaluations.forEach((settle) => settle());
  await new Promise<void>((resolve) => setImmediate(resolve));

  return { limiter, retiredClients };
}
