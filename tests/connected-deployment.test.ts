import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error The deploy preflight is a directly executed JavaScript module.
import { validateNetlifyBuildConfig } from "../tools/netlify-build-config.mjs";

const valid = () => ({
  NEXT_PUBLIC_API_BASE_URL: "https://psw-api.onrender.com/api/v1",
  API_INTERNAL_BASE_URL: "https://psw-api.onrender.com/api/v1",
  NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN: "https://psw-media.s3.amazonaws.com"
});

// ESLint already declares js-yaml; resolve its parser from that dependency so
// these configuration tests do not add an application/runtime dependency.
const require = createRequire(import.meta.url);
const yaml = createRequire(require.resolve("eslint/package.json"))("js-yaml") as { load: (text: string) => unknown };

describe("connected Netlify build preflight", () => {
  it("uses a real API and the default public map without exposing backend credentials", () => {
    expect(validateNetlifyBuildConfig(valid())).toEqual([]);
    const { API_INTERNAL_BASE_URL: _optional, ...browserOnly } = valid();
    expect(validateNetlifyBuildConfig(browserOnly)).toEqual([]);
  });

  it.each([
    "", "http://api.psw.com/api/v1", "https://demo.invalid/api/v1", "https://api.example.com/api/v1",
    "https://localhost/api/v1", "https://127.0.0.1/api/v1", "https://[::1]/api/v1", "https://10.0.0.1/api/v1",
    "https://api:4000/api/v1", "https://api.internal/api/v1", "https://user:secret@api.psw.com/api/v1",
    "https://api.psw.com/api/v1?token=secret", "https://api.psw.com/api/v1#secret", "https://api.psw.com/wrong"
  ])("refuses an unconfigured or unsafe API base", value => {
    const errors = validateNetlifyBuildConfig({ ...valid(), NEXT_PUBLIC_API_BASE_URL: value });
    expect(errors.some((error: string) => error.startsWith("NEXT_PUBLIC_API_BASE_URL"))).toBe(true);
    expect(errors.join(" ")).not.toContain("secret");
    expect(errors.join(" ")).not.toContain(value || "unconfigured-value");
  });

  it("rejects a Compose-only internal address and a media URL containing a path", () => {
    expect(validateNetlifyBuildConfig({ ...valid(), API_INTERNAL_BASE_URL: "http://api:4000/api/v1" })).not.toEqual([]);
    expect(validateNetlifyBuildConfig({ ...valid(), NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN: "https://psw-media.s3.amazonaws.com/bucket" })).not.toEqual([]);
  });

  it("requires the server-side auth proxy inputs only when real Neon sign-in is selected", () => {
    const neon = { ...valid(), NEXT_PUBLIC_AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: "https://ep-psw-test.neonauth.us-east-1.aws.neon.tech/neondb/auth", NEON_AUTH_COOKIE_SECRET: "n".repeat(40), NEON_AUTH_APP_ORIGIN: "https://sublet-pipeline-demo-zihao.netlify.app" };
    expect(validateNetlifyBuildConfig(neon)).toEqual([]);
    expect(validateNetlifyBuildConfig({ ...neon, NEON_AUTH_BASE_URL: "https://ep-red-shadow-b4rrx7ym.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth" })).toEqual([]);
    for (const field of ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "NEON_AUTH_APP_ORIGIN"]) expect(validateNetlifyBuildConfig({ ...neon, [field]: "" }).join(" ")).toContain(field);
    expect(validateNetlifyBuildConfig({ ...neon, NEON_AUTH_APP_ORIGIN: "https://127.0.0.1" })).not.toEqual([]);
    expect(validateNetlifyBuildConfig({ ...neon, NEON_AUTH_BASE_URL: "https://attacker.com/auth" })).not.toEqual([]);
  });

  it.each(["NEXT_PUBLIC_WEBSITE_DEMO", "NEXT_PUBLIC_ENABLE_PREVIEW_DATA"])("fails closed if %s enables synthetic behavior", name => {
    expect(validateNetlifyBuildConfig({ ...valid(), [name]: "true" })).not.toEqual([]);
    expect(validateNetlifyBuildConfig({ ...valid(), [name]: "false" })).toEqual([]);
  });

  it("prints only required field names when prebuild configuration is missing", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/netlify-build-config.mjs", import.meta.url))], { env: { NODE_ENV: "production" }, encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_API_BASE_URL is required");
    expect(result.stderr).toContain("NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN is required");
  });

  it("makes the existing Netlify site run its gate before building without supplying fake endpoints", () => {
    const config = readFileSync("netlify.toml", "utf8");
    expect(config).toContain('command = "node tools/netlify-build-config.mjs && npx --yes pnpm@9.15.4 build"');
    expect(config).not.toMatch(/NEXT_PUBLIC_WEBSITE_DEMO|demo\.invalid/);
    expect(config).not.toMatch(/NEXT_PUBLIC_API_BASE_URL\s*=/);
  });

  it("defines a manually deployed, reviewed API branch without creating databases or embedding provider credentials", () => {
    const config = yaml.load(readFileSync("render.yaml", "utf8")) as {
      databases?: unknown; previews: { generation: string };
      services: Array<Record<string, unknown> & { envVars: Array<{ key: string; value?: string; sync?: boolean; generateValue?: boolean }> }>;
    };
    expect(config.databases).toBeUndefined();
    expect(config.previews.generation).toBe("off");
    expect(config.services).toHaveLength(1);
    const [service] = config.services;
    expect(service).toMatchObject({ type: "web", runtime: "docker", branch: "connected-demo-2026-10-22", region: "ohio", plan: "free", autoDeployTrigger: "off", healthCheckPath: "/api/v1/ready", numInstances: 1 });
    expect(service.preDeployCommand).toBeUndefined();
    const environment = new Map(service.envVars.map(entry => [entry.key, entry]));
    expect(environment.size).toBe(service.envVars.length);
    expect(environment.get("PAYMENT_MODE")?.value).toBe("demo");
    expect(environment.get("AUTH_PROVIDER")?.value).toBe("neon");
    expect(environment.get("PUBLIC_BETA_SIGNUP")?.value).toBe("true");
    expect(environment.has("RESEND_API_KEY")).toBe(false);
    for (const key of ["DATABASE_URL", "VALKEY_URL", "NEON_AUTH_BASE_URL", "LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY"]) {
      expect(environment.get(key)).toEqual({ key, sync: false });
    }
    for (const key of ["JWT_SECRET", "OTP_HASH_SECRET", "SECURITY_IDENTIFIER_HASH_SECRET"]) expect(environment.get(key)).toEqual({ key, generateValue: true });
  });
});
