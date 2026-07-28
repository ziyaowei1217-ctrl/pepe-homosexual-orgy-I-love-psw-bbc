import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "components/sublet-app.tsx"),
  "utf8"
);

describe("sublet auth integration", () => {
  it("delegates authentication UI to focused components", () => {
    expect(source).toContain(
      'import { AuthFlowPanel } from "@/components/auth-flow-panel"'
    );
    expect(source).toContain("<AuthFlowPanel");
    expect(source).not.toContain("function AuthStrip(");
  });

  it("tracks onboarding reason and handles expired sessions explicitly", () => {
    expect(source).toContain("setOnboardingReason");
    expect(source).toContain("shouldOpenNewUserOnboarding");
    expect(source).toContain("shouldClearAuthSession");
  });

  it("keeps guests on the publish route while opening authentication", () => {
    expect(source).toContain(
      'if (capability !== "publish-listing") router.push("/account")'
    );
  });
});
