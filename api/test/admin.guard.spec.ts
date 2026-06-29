import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AdminGuard } from "../src/auth/admin.guard";

describe("AdminGuard", () => {
  it("allows admin users", () => {
    const guard = new AdminGuard();

    expect(guard.canActivate(contextForRole("ADMIN"))).toBe(true);
  });

  it("rejects non-admin users", () => {
    const guard = new AdminGuard();

    expect(() => guard.canActivate(contextForRole("USER"))).toThrow(ForbiddenException);
  });
});

function contextForRole(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          id: "user-1",
          email: "user@example.com",
          role
        }
      })
    })
  } as unknown as ExecutionContext;
}
