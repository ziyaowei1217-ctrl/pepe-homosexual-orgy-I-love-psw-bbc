import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const required = [
  "NODE_ENV",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE",
  "NEXT_PUBLIC_MAP_ATTRIBUTION",
  "DATABASE_URL",
  "WEB_ORIGIN",
  "JWT_SECRET",
  "OTP_HASH_SECRET",
  "SECURITY_IDENTIFIER_HASH_SECRET",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "PAYMENT_SERVICE_URL",
  "PAYMENT_SERVICE_API_KEY",
  "VALKEY_URL",
  "LISTING_MEDIA_STORAGE_ENDPOINT",
  "LISTING_MEDIA_UPLOAD_ENDPOINT",
  "LISTING_MEDIA_STORAGE_REGION",
  "LISTING_MEDIA_STORAGE_BUCKET",
  "LISTING_MEDIA_STORAGE_ACCESS_KEY_ID",
  "LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY"
];

const authenticationSecrets = ["JWT_SECRET", "OTP_HASH_SECRET", "SECURITY_IDENTIFIER_HASH_SECRET"];
const developmentAuthenticationSecrets = new Map([
  ["JWT_SECRET", "dev-change-me"],
  ["OTP_HASH_SECRET", "development-otp-hash-secret"],
  ["SECURITY_IDENTIFIER_HASH_SECRET", "development-identifier-hash-secret"]
]);

export function validateProductionConfig(environment) {
  const errors = required
    .filter((name) => typeof environment[name] !== "string" || !environment[name].trim())
    .map((name) => `${name} is required`);

  if (environment.NODE_ENV && environment.NODE_ENV !== "production") errors.push("NODE_ENV must be production");

  const publicApiUrl = requireUrl(environment, "NEXT_PUBLIC_API_BASE_URL", ["https:"], errors);
  rejectPublicUrlComponents(publicApiUrl, "NEXT_PUBLIC_API_BASE_URL", errors);
  rejectBaseUrlQuery(publicApiUrl, "NEXT_PUBLIC_API_BASE_URL", errors);
  if (publicApiUrl && !publicApiUrl.pathname.endsWith("/api/v1")) {
    errors.push("NEXT_PUBLIC_API_BASE_URL must end with /api/v1");
  }

  const mapTileUrl = requireUrl(environment, "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE", ["https:"], errors);
  rejectPublicUrlComponents(mapTileUrl, "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE", errors);
  if (environment.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE && !["{z}", "{x}", "{y}"].every((token) => environment.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE.includes(token))) {
    errors.push("NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE must include {z}, {x}, and {y}");
  }

  const webOrigin = requireUrl(environment, "WEB_ORIGIN", ["https:"], errors);
  rejectPublicUrlComponents(webOrigin, "WEB_ORIGIN", errors);
  if (webOrigin && (webOrigin.pathname !== "/" || webOrigin.search || webOrigin.hash)) {
    errors.push("WEB_ORIGIN must be an HTTPS origin without a path, query, or fragment");
  }

  requireUrl(environment, "DATABASE_URL", ["postgresql:", "postgres:"], errors, (url) => {
    if (url.searchParams.get("sslmode") !== "require" && url.searchParams.get("sslmode") !== "verify-full") {
      errors.push("DATABASE_URL must require TLS");
    }
  });

  const paymentServiceUrl = requireUrl(environment, "PAYMENT_SERVICE_URL", ["https:"], errors);
  rejectPublicUrlComponents(paymentServiceUrl, "PAYMENT_SERVICE_URL", errors);
  rejectBaseUrlQuery(paymentServiceUrl, "PAYMENT_SERVICE_URL", errors);

  requireUrl(environment, "VALKEY_URL", ["rediss:"], errors);

  requireUrl(environment, "LISTING_MEDIA_STORAGE_ENDPOINT", ["http:", "https:"], errors);
  const uploadUrl = requireUrl(environment, "LISTING_MEDIA_UPLOAD_ENDPOINT", ["https:"], errors);
  rejectPublicUrlComponents(uploadUrl, "LISTING_MEDIA_UPLOAD_ENDPOINT", errors);

  if (environment.EMAIL_SENDER !== "resend") errors.push("EMAIL_SENDER must be resend");
  if (environment.EMAIL_FROM?.trim() === "Sublet Pipeline <no-reply@example.com>") {
    errors.push("EMAIL_FROM must not use the development default");
  }
  if (environment.LOCAL_ADMIN_EMAILS?.trim()) {
    errors.push("LOCAL_ADMIN_EMAILS must be empty in production");
  }

  for (const name of authenticationSecrets) {
    if (environment[name] && Buffer.byteLength(environment[name], "utf8") < 32) errors.push(`${name} must be at least 32 bytes`);
    if (environment[name] === developmentAuthenticationSecrets.get(name)) {
      errors.push(`${name} must not use a development default`);
    }
  }
  const configuredAuthenticationSecrets = authenticationSecrets.map((name) => environment[name]).filter(Boolean);
  if (new Set(configuredAuthenticationSecrets).size !== configuredAuthenticationSecrets.length) {
    errors.push("Authentication secrets must be distinct");
  }

  requireFixedPositiveInteger(environment, "AUTH_CODE_TTL_SECONDS", 600, errors);
  requireFixedPositiveInteger(environment, "AUTH_CODE_MAX_ATTEMPTS", 5, errors);
  requireFixedPositiveInteger(environment, "AUTH_CODE_COOLDOWN_SECONDS", 60, errors);
  requireNonNegativeInteger(environment, "TRUSTED_PROXY_HOPS", errors);
  requireFixedPositiveInteger(environment, "LISTING_MEDIA_UPLOAD_TTL_SECONDS", 600, errors);

  return errors;
}

function requireUrl(environment, name, protocols, errors, validate) {
  const value = environment[name];
  if (typeof value !== "string" || !value.trim()) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} must be a valid URL`);
    return null;
  }

  if (!url.hostname) errors.push(`${name} must include a host`);
  if (!protocols.includes(url.protocol)) {
    const protocolDescription = protocols.length === 1 && protocols[0] === "https:"
      ? "HTTPS"
      : protocols.map((protocol) => protocol.slice(0, -1)).join(" or ");
    errors.push(`${name} must use ${protocolDescription}`);
    return url;
  }

  validate?.(url);
  return url;
}

function rejectPublicUrlComponents(url, name, errors) {
  if (!url) return;
  if (url.username || url.password) errors.push(`${name} must not include credentials`);
  if (url.hash) errors.push(`${name} must not include a fragment`);
}

function rejectBaseUrlQuery(url, name, errors) {
  if (url?.search) errors.push(`${name} must not include a query`);
}

function requireFixedPositiveInteger(environment, name, expected, errors) {
  if (environment[name] === undefined) return;
  const value = Number(environment[name]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${name} must be a positive safe integer`);
  } else if (value !== expected) {
    errors.push(`${name} must be ${expected} in production`);
  }
}

function requireNonNegativeInteger(environment, name, errors) {
  if (environment[name] === undefined) return;
  const value = Number(environment[name]);
  if (!Number.isSafeInteger(value) || value < 0) {
    errors.push(`${name} must be a non-negative safe integer`);
  }
}

function parseArguments(arguments_) {
  const environmentFiles = [];
  let compose = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--compose") {
      compose = true;
      continue;
    }

    let path;
    if (argument === "--env-file") {
      path = arguments_[index + 1];
      index += 1;
    } else if (argument.startsWith("--env-file=")) {
      path = argument.slice("--env-file=".length);
    } else {
      throw new Error("Unsupported argument.");
    }

    if (!path || path.startsWith("--")) throw new Error("Environment file path is required.");
    environmentFiles.push(path);
  }
  return { compose, environmentFiles };
}

function environmentFromFiles(environmentFiles, processEnvironment) {
  const fileEnvironment = {};
  for (const path of environmentFiles) {
    let contents;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      throw new Error("Unable to read environment file.");
    }

    try {
      Object.assign(fileEnvironment, parseEnv(contents));
    } catch {
      throw new Error("Unable to parse environment file.");
    }
  }
  return { ...fileEnvironment, ...processEnvironment };
}

function environmentFromCompose(environmentFiles, processEnvironment) {
  const composeArguments = ["compose"];
  for (const path of environmentFiles) composeArguments.push("--env-file", path);
  composeArguments.push("-f", "compose.production.yml", "config", "--format", "json");

  const result = spawnSync("docker", composeArguments, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: processEnvironment
  });
  if (result.error || result.status !== 0) {
    throw new Error("Unable to resolve production Compose configuration.");
  }

  let configuration;
  try {
    configuration = JSON.parse(result.stdout);
  } catch {
    throw new Error("Unable to read production Compose configuration.");
  }

  try {
    const apiEnvironment = stringEnvironment(configuration.services.api.environment);
    const webBuildArguments = stringEnvironment(configuration.services.web.build.args);
    return { ...apiEnvironment, ...webBuildArguments };
  } catch {
    throw new Error("Unable to read production Compose configuration.");
  }
}

function stringEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid environment");
  return Object.fromEntries(Object.entries(value).map(([name, configuredValue]) => [
    name,
    configuredValue === null || configuredValue === undefined ? "" : String(configuredValue)
  ]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { compose, environmentFiles } = parseArguments(process.argv.slice(2));
    const environment = compose
      ? environmentFromCompose(environmentFiles, process.env)
      : environmentFromFiles(environmentFiles, process.env);
    const errors = validateProductionConfig(environment);
    if (errors.length) {
      console.error(`Production configuration is incomplete:\n- ${errors.join("\n- ")}`);
      process.exitCode = 1;
    } else {
      console.log("Production configuration is complete.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Configuration check failed.");
    process.exit(1);
  }
}
