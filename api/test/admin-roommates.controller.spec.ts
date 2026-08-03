import "reflect-metadata";
import { describe, expect, it } from "vitest";

import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AdminRoommatesController } from "../src/roommates/admin-roommates.controller";

describe("AdminRoommatesController guard metadata", () => {
  it("requires administrator step-up for writes but not reads", () => {
    expect(guardsFor(AdminRoommatesController.prototype.findAll)).not.toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.create)).toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.update)).toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.archive)).toContain(AdminStepUpGuard);
  });
});

function guardsFor(handler: (...args: never[]) => unknown) {
  return (Reflect.getMetadata("__guards__", handler) ?? []) as unknown[];
}
