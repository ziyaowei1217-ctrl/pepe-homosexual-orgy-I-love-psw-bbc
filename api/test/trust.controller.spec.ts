import "reflect-metadata";
import { describe, expect, it } from "vitest";

import { AdminGuard } from "../src/auth/admin.guard";
import { AuthGuard } from "../src/auth/auth.guard";
import { TrustController } from "../src/trust/trust.controller";

describe("TrustController guard metadata", () => {
  it("requires an authenticated administrator for Trust queue reads", () => {
    expect(Reflect.getMetadata("__guards__", TrustController) ?? []).toEqual([
      AuthGuard,
      AdminGuard
    ]);
  });
});
