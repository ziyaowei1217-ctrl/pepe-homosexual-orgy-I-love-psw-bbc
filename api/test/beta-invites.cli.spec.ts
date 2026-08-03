import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  parseBetaInviteCommand,
  runBetaInviteCli,
  runBetaInviteCommand,
  runBetaInviteEntrypoint,
  runBetaInviteMain
} from "../src/operations/beta-invites.cli";

describe("beta invite CLI", () => {
  it.each([
    ["add", "--email", "student@example.com", "--reason", "Founding beta cohort"],
    ["revoke", "--email", "student@example.com", "--actor", "operator@example.com"]
  ])("rejects %s without required actor or reason", (...argv) => {
    expect(() => parseBetaInviteCommand(argv)).toThrow("--actor and --reason are required");
  });

  it.each(["add", "revoke"])("rejects %s with a blank actor", (action) => {
    expect(() =>
      parseBetaInviteCommand([action, "--email", "student@example.com", "--actor", "  ", "--reason", "Founding beta cohort"])
    ).toThrow("--actor must not be blank");
  });

  it.each([
    ["--email", "student @example.com", "--actor", "operator@example.com"],
    ["--email", "student@example.com", "--actor", "operator@localhost"]
  ])("rejects malformed target or operator email as a CLI validation error", (...emailOptions) => {
    expect(() =>
      parseBetaInviteCommand(["add", ...emailOptions, "--reason", "Founding beta cohort"])
    ).toThrow(/valid email without whitespace/);
  });

  it("prints only masked email addresses for list", async () => {
    const writes: string[] = [];
    await runBetaInviteCommand(
      { action: "list" },
      { list: async () => [{ id: "invite-1", maskedEmail: "s*****t@example.com", status: "ACTIVE" }] } as never,
      (line) => writes.push(line)
    );

    expect(writes.join("\n")).toContain("s*****t@example.com");
    expect(writes.join("\n")).not.toContain("student@example.com");
  });

  it("redacts unexpected service failures instead of printing exception contents", async () => {
    const errors: string[] = [];
    const leaked = "victim@example.com token=private-token code=123456 body={private}";

    const status = await runBetaInviteCli(
      ["list"],
      {
        list: async () => {
          throw new Error(leaked);
        }
      } as never,
      () => undefined,
      (line) => errors.push(line)
    );

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Invitation command failed"]);
    expect(errors.join("\n")).not.toContain("victim@example.com");
    expect(errors.join("\n")).not.toContain("private-token");
    expect(errors.join("\n")).not.toContain("123456");
    expect(errors.join("\n")).not.toContain("body");
  });

  it("keeps the known operation failure when disconnect also fails", async () => {
    const events: string[] = [];
    const errors: string[] = [];

    const status = await runBetaInviteMain({
      argv: [
        "revoke",
        "--email",
        "student@example.com",
        "--actor",
        "operator@example.com",
        "--reason",
        "Access withdrawn"
      ],
      createPrisma: () => ({
        $connect: async () => {
          events.push("connect");
        },
        $disconnect: async () => {
          events.push("disconnect");
          throw new Error("disconnect token=private-disconnect-token");
        }
      }) as never,
      createService: () => ({
        revoke: async () => {
          events.push("run");
          throw new NotFoundException("Beta invite not found");
        }
      }) as never,
      write: () => undefined,
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(events).toEqual(["connect", "run", "disconnect"]);
    expect(errors).toEqual(["BETA_INVITE_NOT_FOUND: Beta invite not found"]);
    expect(errors.join("\n")).not.toContain("private-disconnect-token");
  });

  it("sanitizes an unexpected executable-level lifecycle rejection", async () => {
    const errors: string[] = [];
    const status = await runBetaInviteEntrypoint({
      runMain: async () => {
        throw new Error("victim@example.com token=private-token code=123456 body={private}");
      },
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(errors).toEqual(["COMMAND_FAILED: Invitation command failed"]);
    expect(errors.join("\n")).not.toMatch(/victim@example\.com|private-token|123456|body/);
  });

  it("sanitizes connection failures and still runs controlled disconnect cleanup", async () => {
    const events: string[] = [];
    const errors: string[] = [];

    const status = await runBetaInviteMain({
      argv: ["list"],
      createPrisma: () => ({
        $connect: async () => {
          events.push("connect");
          throw new Error("connect victim@example.com token=private-connect-token 123456 body={private}");
        },
        $disconnect: async () => {
          events.push("disconnect");
        }
      }) as never,
      createService: () => {
        throw new Error("service construction should not run");
      },
      write: () => undefined,
      writeError: (line) => errors.push(line)
    });

    expect(status).toBe(1);
    expect(events).toEqual(["connect", "disconnect"]);
    expect(errors).toEqual(["COMMAND_FAILED: Invitation command failed"]);
    expect(errors.join("\n")).not.toMatch(/victim@example\.com|private-connect-token|123456|body/);
  });
});
