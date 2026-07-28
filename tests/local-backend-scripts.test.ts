import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local backend scripts", () => {
  it("exposes one-command setup and combined development commands", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["local:setup"]).toBe("sh tools/local-setup.sh");
    expect(packageJson.scripts["dev:local"]).toContain("--parallel");
    expect(packageJson.scripts["dev:local"]).toContain("sublet-pipeline-api");
  });
});
