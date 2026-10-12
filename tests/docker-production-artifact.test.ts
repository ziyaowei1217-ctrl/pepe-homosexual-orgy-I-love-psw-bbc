import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("API production container dependency boundaries", () => {
  it("keeps root web and development dependencies out of the API runtime stage", () => {
    const dockerfile = readFileSync("Dockerfile.api", "utf8");
    const runtime = dockerfile.slice(dockerfile.indexOf(" AS runtime"));

    expect(dockerfile).toContain("COPY api/package.json package.json");
    expect(dockerfile).toContain('in_importers && $0 == "  api:"');
    expect(dockerfile).toContain("pnpm install --frozen-lockfile --prod");
    expect(dockerfile).toContain("prisma/build/index.js");
    expect(dockerfile).toContain("rm -rf /prod/node_modules/.pnpm/prisma@*");
    expect(runtime).toContain("--from=production-dependencies /prod/node_modules");
    expect(runtime).not.toContain("--from=production-dependencies /app/api/node_modules");
    expect(runtime).not.toContain("--from=build /app/node_modules");
    expect(dockerfile).not.toContain("pnpm deploy");
  });

  it("uses a separate migration target that retains the Prisma CLI", () => {
    const dockerfile = readFileSync("Dockerfile.api", "utf8");
    const compose = readFileSync("compose.production.yml", "utf8");

    expect(dockerfile).toContain(" AS migration");
    expect(dockerfile).toContain("--from=build /app/api/node_modules");
    expect(compose).toMatch(/migrate:[\s\S]*?target: migration/);
    expect(compose).toMatch(/api:[\s\S]*?target: runtime/);
  });

  it("validates a synthetic resolved production contract and passes every web build argument in CI", () => {
    const workflow = readFileSync(".github/workflows/release-validation.yml", "utf8");

    expect(workflow).toContain("pnpm production:check-config --compose --env-file");
    expect(workflow).toContain("randomBytes(32)");
    expect(workflow).toMatch(/docker build[\s\S]*--build-arg NEXT_PUBLIC_API_BASE_URL/);
    expect(workflow).toMatch(/docker build[\s\S]*--build-arg NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE/);
    expect(workflow).toMatch(/docker build[\s\S]*--build-arg NEXT_PUBLIC_MAP_ATTRIBUTION/);
  });
});
