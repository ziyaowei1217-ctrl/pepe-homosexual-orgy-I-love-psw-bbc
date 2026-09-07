import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error JavaScript release utility is executed directly by Node.
import { validateProductionConfig } from "../tools/production-config.mjs";

const scriptPath = fileURLToPath(new URL("../tools/production-config.mjs", import.meta.url));
const temporaryDirectories: string[] = [];

function validEnvironment() {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BASE_URL: "https://api.example.com/api/v1",
    NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE: "https://maps.example.com/{z}/{x}/{y}.png?key=public-map-key",
    NEXT_PUBLIC_MAP_ATTRIBUTION: "Example Maps",
    DATABASE_URL: "postgresql://app:database-password@db.example.com/app?sslmode=verify-full",
    WEB_ORIGIN: "https://app.example.com",
    JWT_SECRET: "jwt-production-secret-with-more-than-32-bytes",
    OTP_HASH_SECRET: "otp-production-secret-with-more-than-32-bytes",
    SECURITY_IDENTIFIER_HASH_SECRET: "identifier-production-secret-with-more-than-32-bytes",
    EMAIL_SENDER: "resend",
    EMAIL_FROM: "Sublet <login@example.com>",
    RESEND_API_KEY: "resend-production-key",
    PAYMENT_SERVICE_URL: "https://payments.example.com",
    PAYMENT_SERVICE_API_KEY: "payment-production-key",
    VALKEY_URL: "rediss://cache-user:cache-password@cache.example.com:6379",
    LISTING_MEDIA_STORAGE_ENDPOINT: "http://private-storage:9000",
    LISTING_MEDIA_UPLOAD_ENDPOINT: "https://uploads.example.com",
    LISTING_MEDIA_STORAGE_REGION: "us-west-2",
    LISTING_MEDIA_STORAGE_BUCKET: "listing-media",
    LISTING_MEDIA_STORAGE_ACCESS_KEY_ID: "storage-access-key",
    LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY: "storage-secret-key"
  };
}

function writeEnvironmentFile(directory: string, name: string, environment: Record<string, string>) {
  const path = join(directory, name);
  writeFileSync(path, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"));
  return path;
}

function runCli(arguments_: string[], environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--", scriptPath, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment as NodeJS.ProcessEnv
  });
}

function effectiveComposeConfig(apiOverrides: Record<string, string> = {}) {
  const {
    NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE,
    NEXT_PUBLIC_MAP_ATTRIBUTION,
    ...apiEnvironment
  } = validEnvironment();
  return {
    services: {
      api: { environment: { ...apiEnvironment, ...apiOverrides } },
      web: {
        build: {
          args: {
            NEXT_PUBLIC_API_BASE_URL,
            NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE,
            NEXT_PUBLIC_MAP_ATTRIBUTION
          }
        }
      }
    }
  };
}

function installFakeDocker(directory: string, output: string, exitCode = 0) {
  const outputPath = join(directory, "docker-output.txt");
  const argumentsPath = join(directory, "docker-arguments.json");
  const dockerPath = join(directory, "docker");
  writeFileSync(outputPath, output);
  writeFileSync(dockerPath, `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync(process.env.FAKE_DOCKER_ARGUMENTS_PATH, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(fs.readFileSync(process.env.FAKE_DOCKER_OUTPUT_PATH, "utf8"));\nprocess.stderr.write(process.env.FAKE_DOCKER_STDERR || "");\nprocess.exit(Number(process.env.FAKE_DOCKER_EXIT_CODE || 0));\n`);
  chmodSync(dockerPath, 0o755);
  return {
    argumentsPath,
    environment: {
      PATH: directory,
      FAKE_DOCKER_ARGUMENTS_PATH: argumentsPath,
      FAKE_DOCKER_OUTPUT_PATH: outputPath,
      FAKE_DOCKER_EXIT_CODE: String(exitCode)
    }
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("production configuration gate", () => {
  it("accepts a complete production configuration and omitted runtime defaults", () => {
    expect(validateProductionConfig(validEnvironment())).toEqual([]);
  });

  it("reports missing external integrations before deployment", () => {
    expect(validateProductionConfig({})).toEqual(expect.arrayContaining([
      "RESEND_API_KEY is required",
      "PAYMENT_SERVICE_URL is required",
      "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE is required",
      "VALKEY_URL is required"
    ]));
  });

  it.each([
    ["malformed API URL", "NEXT_PUBLIC_API_BASE_URL", "https://"],
    ["wrong API base path", "NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/v1"],
    ["API credentials", "NEXT_PUBLIC_API_BASE_URL", "https://user:password@api.example.com/api/v1"],
    ["API fragment", "NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/api/v1#secret"],
    ["API query", "NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/api/v1?tenant=one"],
    ["non-origin web URL", "WEB_ORIGIN", "https://app.example.com/account"],
    ["web URL query", "WEB_ORIGIN", "https://app.example.com/?preview=true"],
    ["database without TLS", "DATABASE_URL", "postgresql://db.example.com/app?sslmode=disable"],
    ["non-TLS Valkey", "VALKEY_URL", "redis://cache.example.com:6379"],
    ["insecure browser upload", "LISTING_MEDIA_UPLOAD_ENDPOINT", "http://uploads.example.com"],
    ["malformed payment URL", "PAYMENT_SERVICE_URL", "https://"],
    ["payment service query", "PAYMENT_SERVICE_URL", "https://payments.example.com?tenant=one"]
  ])("rejects %s", (_caseName, name, value) => {
    expect(validateProductionConfig({ ...validEnvironment(), [name]: value })).not.toEqual([]);
  });

  it("rejects development defaults and reused authentication secrets", () => {
    const sharedSecret = "shared-production-secret-with-more-than-32-bytes";
    expect(validateProductionConfig({
      ...validEnvironment(),
      JWT_SECRET: "dev-change-me",
      OTP_HASH_SECRET: sharedSecret,
      SECURITY_IDENTIFIER_HASH_SECRET: sharedSecret,
      EMAIL_FROM: "Sublet Pipeline <no-reply@example.com>",
      LOCAL_ADMIN_EMAILS: "admin@example.com"
    })).toEqual(expect.arrayContaining([
      "JWT_SECRET must not use a development default",
      "Authentication secrets must be distinct",
      "EMAIL_FROM must not use the development default",
      "LOCAL_ADMIN_EMAILS must be empty in production"
    ]));
  });

  it.each([
    ["AUTH_CODE_TTL_SECONDS", "601"],
    ["AUTH_CODE_MAX_ATTEMPTS", "6"],
    ["AUTH_CODE_COOLDOWN_SECONDS", "not-a-number"],
    ["TRUSTED_PROXY_HOPS", "-1"],
    ["LISTING_MEDIA_UPLOAD_TTL_SECONDS", "601"]
  ])("rejects an invalid configured %s", (name, value) => {
    expect(validateProductionConfig({ ...validEnvironment(), [name]: value })).not.toEqual([]);
  });

  it("rejects development runtime and email modes", () => {
    expect(validateProductionConfig({
      ...validEnvironment(),
      NODE_ENV: "development",
      EMAIL_SENDER: "console"
    })).toEqual(expect.arrayContaining([
      "NODE_ENV must be production",
      "EMAIL_SENDER must be resend"
    ]));
  });
});

describe("production configuration CLI", () => {
  it("loads repeated environment files in order and lets the process environment win", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-"));
    temporaryDirectories.push(directory);
    const first = writeEnvironmentFile(directory, "first.env", {
      ...validEnvironment(),
      EMAIL_SENDER: "console"
    });
    const second = writeEnvironmentFile(directory, "second.env", {
      EMAIL_SENDER: "resend",
      JWT_SECRET: "dev-change-me"
    });

    const result = runCli(["--env-file", first, `--env-file=${second}`], {
      JWT_SECRET: validEnvironment().JWT_SECRET
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Production configuration is complete.");
    expect(result.stderr).toBe("");
  });

  it("does not evaluate shell syntax in environment files", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-"));
    temporaryDirectories.push(directory);
    const marker = join(directory, "should-not-exist");
    const file = writeEnvironmentFile(directory, "literal.env", {
      ...validEnvironment(),
      PAYMENT_SERVICE_API_KEY: `$(touch ${marker})`
    });

    const result = runCli(["--env-file", file]);

    expect(result.status).toBe(0);
    expect(() => rmSync(marker)).toThrow();
  });

  it("rejects unsupported arguments without echoing their contents", () => {
    const result = runCli(["--unknown=credential-that-must-stay-secret"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unsupported argument.");
    expect(result.stderr).not.toContain("credential-that-must-stay-secret");
  });

  it("reports a missing environment file without exposing its path", () => {
    const result = runCli(["--env-file", "/missing/credential-that-must-stay-secret.env"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unable to read environment file.");
    expect(result.stderr).not.toContain("credential-that-must-stay-secret");
  });

  it("reports incomplete configuration without exposing configured values", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-"));
    temporaryDirectories.push(directory);
    const secret = "credential-that-must-stay-secret";
    const file = writeEnvironmentFile(directory, "incomplete.env", {
      PAYMENT_SERVICE_API_KEY: secret
    });

    const result = runCli([`--env-file=${file}`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production configuration is incomplete:");
    expect(result.stderr).not.toContain(secret);
  });

  it("validates resolved Compose values and forwards every environment file in order", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-compose-"));
    temporaryDirectories.push(directory);
    const first = writeEnvironmentFile(directory, "first.env", { API_ENV_FILE: "api/first.env" });
    const second = writeEnvironmentFile(directory, "second.env", { API_ENV_FILE: "api/second.env" });
    const fakeDocker = installFakeDocker(directory, JSON.stringify(effectiveComposeConfig({ JWT_SECRET: "" })));
    const ambientSecret = "ambient-jwt-secret-that-is-valid-but-must-not-win";

    const result = runCli(["--compose", "--env-file", first, `--env-file=${second}`], {
      ...fakeDocker.environment,
      JWT_SECRET: ambientSecret
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("JWT_SECRET is required");
    expect(result.stderr).not.toContain(ambientSecret);
    expect(JSON.parse(readFileSync(fakeDocker.argumentsPath, "utf8"))).toEqual([
      "compose",
      "--env-file",
      first,
      "--env-file",
      second,
      "-f",
      "compose.production.yml",
      "config",
      "--format",
      "json"
    ]);
  });

  it("accepts a valid effective Compose API environment and web build arguments", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-compose-"));
    temporaryDirectories.push(directory);
    const fakeDocker = installFakeDocker(directory, JSON.stringify(effectiveComposeConfig()));

    const result = runCli(["--compose"], fakeDocker.environment);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Production configuration is complete.");
    expect(result.stderr).toBe("");
  });

  it("sanitizes Docker Compose failures", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-compose-"));
    temporaryDirectories.push(directory);
    const secret = "credential-that-must-stay-secret";
    const fakeDocker = installFakeDocker(directory, secret, 17);

    const result = runCli(["--compose"], {
      ...fakeDocker.environment,
      FAKE_DOCKER_STDERR: secret
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unable to resolve production Compose configuration.");
    expect(result.stderr).not.toContain(secret);
    expect(result.stdout).toBe("");
  });

  it("sanitizes invalid Docker Compose JSON", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-config-compose-"));
    temporaryDirectories.push(directory);
    const secret = "credential-that-must-stay-secret";
    const fakeDocker = installFakeDocker(directory, `{not-json:${secret}}`);

    const result = runCli(["--compose"], fakeDocker.environment);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unable to read production Compose configuration.");
    expect(result.stderr).not.toContain(secret);
    expect(result.stdout).toBe("");
  });
});
