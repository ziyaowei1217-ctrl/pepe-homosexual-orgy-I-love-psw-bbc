import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const required = [
  "NODE_ENV",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN",
  "DATABASE_URL",
  "WEB_ORIGIN",
  "JWT_SECRET",
  "OTP_HASH_SECRET",
  "SECURITY_IDENTIFIER_HASH_SECRET",
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
  errors.push(...validateAuthProviderConfig(environment));
  errors.push(...validateAuthProviderConfig(environment, true));
  if ((environment.AUTH_PROVIDER ?? "email") !== (environment.NEXT_PUBLIC_AUTH_PROVIDER ?? "email")) errors.push("AUTH_PROVIDER and NEXT_PUBLIC_AUTH_PROVIDER must select the same authentication provider");
  if (environment.NEXT_PUBLIC_WEBSITE_DEMO && environment.NEXT_PUBLIC_WEBSITE_DEMO !== "false") {
    errors.push("NEXT_PUBLIC_WEBSITE_DEMO must be unset or false for the full marketplace deployment");
  }
  if (environment.NEXT_PUBLIC_ENABLE_PREVIEW_DATA && environment.NEXT_PUBLIC_ENABLE_PREVIEW_DATA !== "false") {
    errors.push("NEXT_PUBLIC_ENABLE_PREVIEW_DATA must be unset or false for the connected deployment");
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    errors.push("NODE_TLS_REJECT_UNAUTHORIZED must not disable TLS verification");
  }

  const publicApiUrl = requireUrl(environment, "NEXT_PUBLIC_API_BASE_URL", ["https:"], errors);
  rejectPublicUrlComponents(publicApiUrl, "NEXT_PUBLIC_API_BASE_URL", errors);
  rejectBaseUrlQuery(publicApiUrl, "NEXT_PUBLIC_API_BASE_URL", errors);
  if (publicApiUrl && !publicApiUrl.pathname.endsWith("/api/v1")) {
    errors.push("NEXT_PUBLIC_API_BASE_URL must end with /api/v1");
  }

  errors.push(...validateMapConfig(environment));

  const webOrigin = requireUrl(environment, "WEB_ORIGIN", ["https:"], errors);
  rejectPublicUrlComponents(webOrigin, "WEB_ORIGIN", errors);
  if (webOrigin && (webOrigin.pathname !== "/" || webOrigin.search || webOrigin.hash)) {
    errors.push("WEB_ORIGIN must be an HTTPS origin without a path, query, or fragment");
  }

  requireUrl(environment, "DATABASE_URL", ["postgresql:", "postgres:"], errors, (url) => {
    if (url.searchParams.get("sslmode") !== "require" || url.searchParams.getAll("sslmode").length !== 1) {
      errors.push("DATABASE_URL must use one sslmode=require setting supported by Prisma 6");
    }
    if (url.searchParams.get("sslaccept") !== "strict" || url.searchParams.getAll("sslaccept").length !== 1) {
      errors.push("DATABASE_URL must use one sslaccept=strict setting for certificate verification");
    }
    for (const [name, seconds] of Object.entries({ connect_timeout: 2, pool_timeout: 2, socket_timeout: 3 })) {
      if (url.searchParams.getAll(name).length !== 1 || url.searchParams.get(name) !== String(seconds)) {
        errors.push(`DATABASE_URL must use one ${name}=${seconds} setting`);
      }
    }
    const supported = new Set(["schema", "connection_limit", "sslmode", "sslaccept", "connect_timeout", "pool_timeout", "socket_timeout"]);
    for (const name of url.searchParams.keys()) {
      if (!supported.has(name)) errors.push("DATABASE_URL contains an unsupported driver setting");
      if (url.searchParams.getAll(name).length !== 1) errors.push("DATABASE_URL contains an ambiguous driver setting");
    }
    const maximum = url.searchParams.get("connection_limit");
    if (maximum !== null && (!/^[1-9]\d*$/.test(maximum) || Number(maximum) > 10)) {
      errors.push("DATABASE_URL connection_limit must be an integer from 1 to 10");
    }
    const schema = url.searchParams.get("schema") ?? "public";
    if (!schema || ["$user", "pg_temp"].includes(schema) || schema.includes("\0") || Buffer.byteLength(schema) > 63) {
      errors.push("DATABASE_URL schema must be a non-empty literal PostgreSQL identifier of at most 63 bytes");
    }
    if (url.hash) errors.push("DATABASE_URL must not include a fragment");
  });

  const paymentMode = environment.PAYMENT_MODE ?? "production";
  if (!["production", "demo"].includes(paymentMode)) errors.push("PAYMENT_MODE must be production or demo");
  if (paymentMode !== "demo") {
    for (const name of ["PAYMENT_SERVICE_URL", "PAYMENT_SERVICE_API_KEY"]) {
      if (typeof environment[name] !== "string" || !environment[name].trim()) errors.push(`${name} is required`);
    }
    const paymentServiceUrl = requireUrl(environment, "PAYMENT_SERVICE_URL", ["https:"], errors);
    rejectPublicUrlComponents(paymentServiceUrl, "PAYMENT_SERVICE_URL", errors);
    rejectBaseUrlQuery(paymentServiceUrl, "PAYMENT_SERVICE_URL", errors);
  }

  requireUrl(environment, "VALKEY_URL", ["rediss:"], errors, (url) => {
    const database = url.pathname.slice(1);
    if ((url.port && Number(url.port) < 1) || url.search || url.hash ||
        (url.pathname && url.pathname !== "/" && (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))))) {
      errors.push("VALKEY_URL must use an optional non-negative database number without a query or fragment");
    }
    try {
      decodeURIComponent(url.username);
      decodeURIComponent(url.password);
    } catch {
      errors.push("VALKEY_URL must use valid encoded credentials");
    }
  });

  const storageUrl = requireUrl(environment, "LISTING_MEDIA_STORAGE_ENDPOINT", ["https:"], errors);
  rejectPublicUrlComponents(storageUrl, "LISTING_MEDIA_STORAGE_ENDPOINT", errors);
  rejectBaseUrlQuery(storageUrl, "LISTING_MEDIA_STORAGE_ENDPOINT", errors);
  const uploadUrl = requireUrl(environment, "LISTING_MEDIA_UPLOAD_ENDPOINT", ["https:"], errors);
  rejectPublicUrlComponents(uploadUrl, "LISTING_MEDIA_UPLOAD_ENDPOINT", errors);
  rejectBaseUrlQuery(uploadUrl, "LISTING_MEDIA_UPLOAD_ENDPOINT", errors);
  const publicUploadOrigin = requireUrl(environment, "NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN", ["https:"], errors);
  rejectPublicUrlComponents(publicUploadOrigin, "NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN", errors);
  if (publicUploadOrigin && (publicUploadOrigin.pathname !== "/" || publicUploadOrigin.search || publicUploadOrigin.hash)) {
    errors.push("NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN must be an HTTPS origin without a path, query, or fragment");
  }
  if (publicUploadOrigin && uploadUrl && publicUploadOrigin.origin !== uploadUrl.origin) {
    errors.push("NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN must match the LISTING_MEDIA_UPLOAD_ENDPOINT origin");
  }

  if ((environment.AUTH_PROVIDER ?? "email") === "email" && environment.EMAIL_FROM?.trim() === "Sublet Pipeline <no-reply@example.com>") {
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
  for (const name of [...authenticationSecrets, "RESEND_API_KEY", "PAYMENT_SERVICE_API_KEY", "LISTING_MEDIA_STORAGE_ACCESS_KEY_ID", "LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY"]) {
    if (typeof environment[name] === "string" && isPlaceholder(environment[name])) {
      errors.push(`${name} must not use a placeholder`);
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

/** Shared provider gate; Neon uses real Google identity instead of email transport. */
export function validateAuthProviderConfig(environment, frontend = false) {
  const errors = [];
  const field = frontend ? "NEXT_PUBLIC_AUTH_PROVIDER" : "AUTH_PROVIDER";
  const provider = environment[field] ?? "email";
  if (!["email", "neon"].includes(provider)) errors.push(`${field} must be email or neon`);
  if (!frontend && environment.PUBLIC_BETA_SIGNUP !== undefined && !["true", "false"].includes(environment.PUBLIC_BETA_SIGNUP)) errors.push("PUBLIC_BETA_SIGNUP must be true or false");
  if (!frontend && environment.PUBLIC_BETA_SIGNUP === "true" && provider !== "neon") errors.push("PUBLIC_BETA_SIGNUP requires AUTH_PROVIDER=neon");
  if (provider === "neon") {
    const raw = environment.NEON_AUTH_BASE_URL;
    let url;
    try { url = new URL(raw); } catch { /* Report only the field name below. */ }
    if (!raw || raw.length > 2048 || !url || url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
        !/^ep-[a-z0-9-]+\.neonauth\.(?:c-[0-9]{1,3}\.)?[a-z0-9-]+\.aws\.neon\.tech$/.test(url.hostname) || !/^\/[a-zA-Z0-9_-]+\/auth\/?$/.test(url.pathname)) {
      errors.push("NEON_AUTH_BASE_URL must be a configured HTTPS managed Neon Auth project endpoint");
    } else if (!frontend && environment.NEON_AUTH_JWKS_URL !== undefined && environment.NEON_AUTH_JWKS_URL !== `${url.href.replace(/\/$/, "")}/.well-known/jwks.json`) {
      errors.push("NEON_AUTH_JWKS_URL must match the configured Neon Auth project");
    }
    if (frontend) {
      const secret = environment.NEON_AUTH_COOKIE_SECRET;
      if (!secret || secret.length < 32 || isPlaceholder(secret)) errors.push("NEON_AUTH_COOKIE_SECRET must be a strong server-only secret of at least 32 characters");
      const app = requireUrl(environment, "NEON_AUTH_APP_ORIGIN", ["https:"], errors);
      if (!environment.NEON_AUTH_APP_ORIGIN?.trim()) errors.push("NEON_AUTH_APP_ORIGIN is required");
      rejectPublicUrlComponents(app, "NEON_AUTH_APP_ORIGIN", errors);
      if (app && (app.port || app.pathname !== "/" || app.search || !app.hostname.includes(".") || /^[\d.]+$/.test(app.hostname) || app.hostname.includes(":") ||
          /(?:^|\.)(?:localhost|local|internal|invalid|test|example|example\.com|example\.org|example\.net)$/.test(app.hostname))) errors.push("NEON_AUTH_APP_ORIGIN must be the configured public HTTPS website origin");
    }
  } else if (!frontend) {
    for (const name of ["EMAIL_FROM", "RESEND_API_KEY"]) if (!environment[name]?.trim()) errors.push(`${name} is required`);
    if (environment.EMAIL_SENDER !== "resend") errors.push("EMAIL_SENDER must be resend");
  }
  return errors;
}

// MapLibre uses the public OpenFreeMap vector style by default. A custom vector
// style does not need a legacy raster template or an invented public key.
export function validateMapConfig(environment) {
  const errors = [];
  const style = requireUrl(environment, "NEXT_PUBLIC_MAP_STYLE_URL", ["https:"], errors);
  rejectPublicUrlComponents(style, "NEXT_PUBLIC_MAP_STYLE_URL", errors);
  const tiles = requireUrl(environment, "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE", ["https:"], errors);
  rejectPublicUrlComponents(tiles, "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE", errors);
  if (environment.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE && !["{z}", "{x}", "{y}"].every(token => environment.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE.includes(token))) {
    errors.push("NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE must include {z}, {x}, and {y}");
  }
  if (tiles && !environment.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim()) errors.push("NEXT_PUBLIC_MAP_ATTRIBUTION is required for a custom raster basemap");
  for (const [name, url] of [["NEXT_PUBLIC_MAP_STYLE_URL", style], ["NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE", tiles]]) {
    if (url && [...url.searchParams.values()].some(isPlaceholder)) errors.push(`${name} must not contain placeholder credentials`);
  }
  return errors;
}

function isPlaceholder(value) {
  return /^(?:replace[-_ ]?me|change[-_ ]?me|your[-_ ](?:.*)|todo|example)$/i.test(value.trim());
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
    const webEnvironment = configuration.services.web.environment ? stringEnvironment(configuration.services.web.environment) : {};
    const webAuth = Object.fromEntries(Object.entries(webEnvironment).filter(([name]) => ["NEON_AUTH_BASE_URL", "NEON_AUTH_APP_ORIGIN", "NEON_AUTH_COOKIE_SECRET"].includes(name)));
    if (apiEnvironment.AUTH_PROVIDER === "neon" && webAuth.NEON_AUTH_BASE_URL && webAuth.NEON_AUTH_BASE_URL !== apiEnvironment.NEON_AUTH_BASE_URL) {
      throw new Error("Neon authentication must use the same managed project on web and API services.");
    }
    return { ...apiEnvironment, ...webBuildArguments, ...webAuth };
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
