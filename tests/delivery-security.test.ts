import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Use the YAML parser already present in ESLint's dependency tree.
const requireFromTest = createRequire(import.meta.url);
const yaml = createRequire(requireFromTest.resolve("@eslint/eslintrc"))("js-yaml");

function configuration(path: string) {
  return yaml.load(readFileSync(path, "utf8"));
}

describe("delivery security boundaries", () => {
  it("keeps database/cache/management services on loopback when app LAN access is enabled", () => {
    const { services } = configuration("docker-compose.yml");
    for (const name of ["db", "valkey", "adminer"]) {
      expect(services[name].ports.every((port: string) => port.startsWith("127.0.0.1:"))).toBe(true);
    }
    expect(services.minio.ports).toContain("127.0.0.1:9001:9001");
    expect(services.adminer.profiles).toEqual(["admin"]);
    for (const name of ["web", "api"]) {
      expect(services[name].ports[0]).toMatch(/^\$\{APP_BIND_HOST:-127\.0\.0\.1\}/);
    }
  });

  it("applies isolation to every production process, with explicit bounded cache storage", () => {
    const { services } = configuration("compose.production.yml");
    for (const service of Object.values(services) as Array<Record<string, unknown>>) {
      expect(service.read_only).toBe(true);
      expect(service.init).toBe(true);
      expect(service.cap_drop).toEqual(["ALL"]);
      expect(service.security_opt).toContain("no-new-privileges:true");
    }
    expect(services.web.tmpfs).toContain("/app/.next/cache:rw,noexec,nosuid,uid=1000,gid=1000,size=256m");
    expect(services.api.ports[0]).toContain("API_BIND_HOST:-127.0.0.1");
    expect(services.web.ports[0]).toContain("WEB_BIND_HOST:-127.0.0.1");
    expect(readFileSync("Dockerfile.api", "utf8")).toMatch(/^USER node$/m);
    expect(readFileSync("Dockerfile.web", "utf8")).toMatch(/^USER node$/m);
  });

  it("uses immutable actions with read-only access and no persisted checkout credentials", () => {
    const workflow = configuration(".github/workflows/verify.yml");
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(workflow.jobs) as Array<{ steps: Array<{ uses?: string; with?: Record<string, unknown> }> }>) {
      for (const step of job.steps) {
        if (!step.uses) continue;
        expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
        if (step.uses.startsWith("actions/checkout@")) expect(step.with?.["persist-credentials"]).toBe(false);
      }
    }
    expect(workflow.on).not.toHaveProperty("pull_request_target");
  });
});
