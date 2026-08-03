import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseAdminRoleCommand,
  runAdminRoleCli,
  runAdminRoleCommand,
  runAdminRoleEntrypoint,
  runAdminRoleMain
} from "../src/operations/admin-roles.cli";
import { CliValidationError } from "../src/operations/cli-runtime";

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

  it.each([
    ["--email", "reviewer @example.com", "--actor", "operator@example.com"],
    ["--email", "reviewer@example.com", "--actor", "operator@localhost"]
  ])("rejects malformed target or operator email as a CLI validation error", (...emailOptions) => {
    expect(() =>
      parseAdminRoleCommand(["grant", ...emailOptions, "--reason", "Primary reviewer"])
    ).toThrow(/valid email without whitespace/);
  });

  it("returns a stable known domain failure without exposing unexpected details", async () => {
    const errors: string[] = [];
    const status = await runAdminRoleCli(
      ["revoke", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      {
        grant: async () => ({ maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const }),
        revoke: async () => {
          throw new ConflictException({
            statusCode: 409,
            code: "LAST_ADMIN_REQUIRED",
            message: "At least one administrator is required"
          });
        }
      },
      () => undefined,
      (line) => errors.push(line)
    );

    expect(status).toBe(1);
    expect(errors).toEqual(["LAST_ADMIN_REQUIRED: At least one administrator is required"]);
  });

  it("redacts unexpected service failures instead of printing exception contents", async () => {
    const errors: string[] = [];
    const leaked = "victim@example.com token=private-token code=123456 body={private}";

    const status = await runAdminRoleCli(
      ["revoke", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      {
        grant: async () => ({ maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const }),
        revoke: async () => {
          throw new Error(leaked);
        }
      },
      () => undefined,
      (line) => errors.push(line)
    );

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Administrator role command failed"]);
    expect(errors.join("\n")).not.toContain("victim@example.com");
    expect(errors.join("\n")).not.toContain("private-token");
    expect(errors.join("\n")).not.toContain("123456");
    expect(errors.join("\n")).not.toContain("body");
  });

  it("does not trust a validation-shaped exception thrown by the service", async () => {
    const errors: string[] = [];
    const status = await runAdminRoleCli(
      ["revoke", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      {
        grant: async () => ({ maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const }),
        revoke: async () => {
          throw new CliValidationError("victim@example.com token=private-token 123456 body={private}");
        }
      },
      () => undefined,
      (line) => errors.push(line)
    );

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Administrator role command failed"]);
  });

  it("sanitizes construction failures inside the top-level lifecycle", async () => {
    const errors: string[] = [];
    const status = await runAdminRoleMain({
      argv: ["grant", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      createPrisma: () => {
        throw new Error("constructor victim@example.com token=private 123456 body={private}");
      },
      createService: () => {
        throw new Error("service construction should not run");
      },
      write: () => undefined,
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Administrator role command failed"]);
    expect(errors.join("\n")).not.toMatch(/victim@example\.com|private|123456|body/);
  });

  it("sanitizes an unexpected executable-level lifecycle rejection", async () => {
    const errors: string[] = [];
    const status = await runAdminRoleEntrypoint({
      runMain: async () => {
        throw new Error("victim@example.com token=private-token code=123456 body={private}");
      },
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Administrator role command failed"]);
    expect(errors.join("\n")).not.toMatch(/victim@example\.com|private-token|123456|body/);
  });

  it("treats a disconnect failure after success as a sanitized command failure", async () => {
    const events: string[] = [];
    const errors: string[] = [];
    const status = await runAdminRoleMain({
      argv: ["grant", "--email", "reviewer@example.com", "--actor", "operator@example.com", "--reason", "Rotation"],
      createPrisma: () => ({
        $connect: async () => {
          events.push("connect");
        },
        $disconnect: async () => {
          events.push("disconnect");
          throw new Error("disconnect secret=private-disconnect-secret");
        }
      }) as never,
      createService: () => ({
        grant: async () => {
          events.push("run");
          return { maskedEmail: "r******r@example.com", role: "ADMIN", outcome: "SUCCESS" as const };
        }
      }) as never,
      write: () => undefined,
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(events).toEqual(["connect", "run", "disconnect"]);
    expect(errors).toEqual(["COMMAND_FAILED: Administrator role command failed"]);
    expect(errors.join("\n")).not.toContain("private-disconnect-secret");
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
