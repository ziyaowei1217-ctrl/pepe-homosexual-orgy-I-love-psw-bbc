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
    expect(dockerfile).toContain("--from=production-install /prod/node_modules ./api/node_modules");
    expect(dockerfile).not.toContain("--from=build /app/node_modules ./node_modules");
    expect(dockerfile).toContain("ln -s \"../${prisma_cli#/app/api/node_modules/}\"");
    expect(compose).toMatch(/migrate:[\s\S]*?target: migration/);
    expect(compose).toMatch(/api:[\s\S]*?target: runtime/);
  });

  it("updates Alpine packages and strips package managers from final runtime images", () => {
    const apiDockerfile = readFileSync("Dockerfile.api", "utf8");
    const webDockerfile = readFileSync("Dockerfile.web", "utf8");

    expect(apiDockerfile.match(/apk upgrade --no-cache/g)).toHaveLength(2);
    expect(webDockerfile.match(/apk upgrade --no-cache/g)).toHaveLength(1);
    for (const dockerfile of [apiDockerfile, webDockerfile]) {
      expect(dockerfile).toContain("/usr/local/lib/node_modules/npm");
      expect(dockerfile).toContain("/usr/local/lib/node_modules/corepack");
      expect(dockerfile).toContain("/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack");
    }
  });

  it("removes build-only compiler packages conservatively traced into the web runtime", () => {
    const dockerfile = readFileSync("Dockerfile.web", "utf8");
    const runtime = dockerfile.slice(dockerfile.indexOf(" AS runtime"));

    for (const buildOnlyPackage of [
      "node_modules/typescript",
      "node_modules/.pnpm/node_modules/esbuild",
      "node_modules/.pnpm/node_modules/webpack",
      "node_modules/.pnpm/@esbuild+*",
      "node_modules/.pnpm/esbuild@*",
      "node_modules/.pnpm/typescript@*",
      "node_modules/.pnpm/webpack@*",
      "node_modules/.pnpm/browserslist@*",
      "node_modules/.pnpm/baseline-browser-mapping@*",
      "node_modules/.pnpm/fast-uri@*"
    ]) {
      expect(runtime).toContain(buildOnlyPackage);
    }
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
