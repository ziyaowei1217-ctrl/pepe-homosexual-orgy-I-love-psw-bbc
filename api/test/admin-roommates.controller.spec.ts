import "reflect-metadata";
import { describe, expect, it } from "vitest";

import { AdminGuard } from "../src/auth/admin.guard";
import { AdminStepUpGuard } from "../src/auth/admin-step-up.guard";
import { AuthGuard } from "../src/auth/auth.guard";
import { AdminRoommatesController } from "../src/roommates/admin-roommates.controller";

describe("AdminRoommatesController guard metadata", () => {
  it("pins class-level authentication and administrator guards", () => {
    expect(guardsFor(AdminRoommatesController)).toEqual([AuthGuard, AdminGuard]);
  });

  it("requires administrator step-up for writes but not reads", () => {
    expect(guardsFor(AdminRoommatesController.prototype.findAll)).not.toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.create)).toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.update)).toContain(AdminStepUpGuard);
    expect(guardsFor(AdminRoommatesController.prototype.archive)).toContain(AdminStepUpGuard);
  });
});

function guardsFor(target: object) {
  return (Reflect.getMetadata("__guards__", target) ?? []) as unknown[];
}
