import { describe, expect, it } from "vitest";

import {
  disposeDetachedSocketAdapter,
  installSocketAdapter,
  isolatedValkeySmokeFailureMessage,
  type DisposableSocketAdapter
} from "./support/roommate-valkey-realtime-smoke";

describe("Valkey smoke socket adapter ownership", () => {
  it("does not dispose an adapter after installation transfers ownership to Nest", async () => {
    let disposed = 0;
    let installed: DisposableSocketAdapter | undefined;
    const adapter: DisposableSocketAdapter = {
      dispose: async () => {
        disposed += 1;
      }
    };
    const ownership: { detachedSocketAdapter?: DisposableSocketAdapter } = {};

    installSocketAdapter(
      (selected) => {
        installed = selected;
      },
      ownership,
      adapter
    );
    await disposeDetachedSocketAdapter(ownership);

    expect(installed).toBe(adapter);
    expect(disposed).toBe(0);
  });

  it("disposes an adapter that installation never transferred to Nest", async () => {
    let disposed = 0;
    const adapter: DisposableSocketAdapter = {
      dispose: async () => {
        disposed += 1;
      }
    };
    const ownership: { detachedSocketAdapter?: DisposableSocketAdapter } = {};

    expect(() =>
      installSocketAdapter(
        () => {
          throw new Error("installation failed");
        },
        ownership,
        adapter
      )
    ).toThrow("installation failed");
    await disposeDetachedSocketAdapter(ownership);

    expect(disposed).toBe(1);
  });
});

describe("isolated Valkey smoke child diagnostics", () => {
  it("reports status, signal, error, stderr, and stdout together", () => {
    const message = isolatedValkeySmokeFailureMessage({
      status: null,
      signal: "SIGKILL",
      error: new Error("spawn timed out"),
      stderr: "child warning",
      stdout: "child assertion failed"
    });

    expect(message).toBe(
      [
        "isolated Valkey realtime smoke failed (status=null, signal=SIGKILL)",
        "spawn timed out",
        "child warning",
        "child assertion failed"
      ].join("\n")
    );
  });
});
