import { describe, expect, it, vi } from "vitest";

import { closeOwnedNestLifecycle } from "./support/owned-nest-lifecycle";

describe("Nest smoke lifecycle ownership", () => {
  it("lets the application exclusively close its container", async () => {
    const applicationClose = vi.fn().mockResolvedValue(undefined);
    const moduleClose = vi.fn().mockResolvedValue(undefined);

    await closeOwnedNestLifecycle({
      application: { close: applicationClose },
      module: { close: moduleClose }
    });

    expect(applicationClose).toHaveBeenCalledOnce();
    expect(moduleClose).not.toHaveBeenCalled();
  });

  it("closes the compiled module when application creation never completed", async () => {
    const moduleClose = vi.fn().mockResolvedValue(undefined);

    await closeOwnedNestLifecycle({ module: { close: moduleClose } });

    expect(moduleClose).toHaveBeenCalledOnce();
  });
});
