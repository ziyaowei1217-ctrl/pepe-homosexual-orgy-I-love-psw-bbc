import { describe, expect, it } from "vitest";

import { parseAdminRoleCommand, runAdminRoleCli, runAdminRoleCommand } from "../src/operations/admin-roles.cli";

describe("administrator role CLI", () => {
  it.each([
    ["grant", "--actor", "operator@example.com", "--reason", "Primary reviewer"],
    ["grant", "--email", "reviewer@example.com", "--reason", "Primary reviewer"],
    ["revoke", "--email", "reviewer@example.com", "--actor", "operator@example.com"]
  ])("rejects %s when a required flag is absent", (...argv) => {
    expect(() => parseAdminRoleCommand(argv)).toThrow(/required/);
  });

  it.each([
    ["--actor", "  ", "--reason", "Primary reviewer"],
    ["--actor", "operator@example.com", "--reason", "  "]
  ])("rejects a whitespace-only required value", (...options) => {
    expect(() =>
      parseAdminRoleCommand(["grant", "--email", "reviewer@example.com", ...options])
    ).toThrow(/must not be blank/);
  });

  it("returns a non-zero status when command execution fails", async () => {
    const errors: string[] = [];
    const status = await runAdminRoleCli(
      ["revoke", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      {
        grant: async () => ({ maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const }),
        revoke: async () => {
          throw new Error("At least one administrator is required");
        }
      },
      () => undefined,
      (line) => errors.push(line)
    );

    expect(status).toBe(1);
    expect(errors).toEqual(["At least one administrator is required"]);
  });

  it("prints the masked grant result without exposing the target email", async () => {
    const writes: string[] = [];

    await runAdminRoleCommand(
      {
        action: "grant",
        email: "reviewer@example.com",
        actorEmail: "operator@example.com",
        reason: "Primary reviewer"
      },
      {
        grant: async () => ({ maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const })
      } as never,
      (line) => writes.push(line)
    );

    expect(writes.join("\n")).toContain("r******r@example.com");
    expect(writes.join("\n")).not.toContain("reviewer@example.com");
  });
});
