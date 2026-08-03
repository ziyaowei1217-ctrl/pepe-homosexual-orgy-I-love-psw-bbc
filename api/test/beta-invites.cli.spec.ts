import { describe, expect, it } from "vitest";

import { parseBetaInviteCommand, runBetaInviteCommand } from "../src/operations/beta-invites.cli";

describe("beta invite CLI", () => {
  it.each([
    ["add", "--email", "student@example.com", "--reason", "Founding beta cohort"],
    ["revoke", "--email", "student@example.com", "--actor", "operator@example.com"]
  ])("rejects %s without required actor or reason", (...argv) => {
    expect(() => parseBetaInviteCommand(argv)).toThrow("--actor and --reason are required");
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
});
