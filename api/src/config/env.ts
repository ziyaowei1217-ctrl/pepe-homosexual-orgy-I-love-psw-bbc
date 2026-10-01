type JwtSecretInput = {
  nodeEnv?: string;
  jwtSecret?: string;
};

type AuthSecurityConfigInput = {
  nodeEnv?: string;
  otpHashSecret?: string;
  securityIdentifierHashSecret?: string;
  codeTtlSeconds?: string;
  codeMaxAttempts?: string;
  codeCooldownSeconds?: string;
  trustedProxyHops?: string;
};

export type ListingMediaStorageConfigInput = {
  nodeEnv?: string;
  endpoint?: string;
  uploadEndpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  uploadTtlSeconds?: string;
};

export type ListingMediaStorageConfig = {
  endpoint: string;
  uploadEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  uploadTtlSeconds: number;
  forcePathStyle: true;
};

export type AuthSecurityConfig = {
  otpHashSecret: string;
  securityIdentifierHashSecret: string;
  codeTtlMs: number;
  codeMaxAttempts: number;
  codeCooldownMs: number;
  trustedProxyHops: number;
};

const developmentJwtSecret = "dev-change-me";
const developmentOtpHashSecret = "development-otp-hash-secret";
const developmentIdentifierHashSecret = "development-identifier-hash-secret";

export function assertProductionRuntimeConfig(environment: Record<string, string | undefined> = process.env) {
  if (environment.NODE_ENV !== "production") return;

  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("NODE_TLS_REJECT_UNAUTHORIZED must not disable TLS verification in production");
  }

  const databaseUrl = requiredUrl("DATABASE_URL", environment.DATABASE_URL, ["postgresql:", "postgres:"]);
  if (databaseUrl.searchParams.getAll("sslmode").length !== 1 || databaseUrl.searchParams.get("sslmode") !== "require") {
    throw new Error("DATABASE_URL must require TLS in production");
  }
  // Prisma 6 defaults sslaccept to accept_invalid_certs; encryption alone is insufficient.
  if (databaseUrl.searchParams.getAll("sslaccept").length !== 1 || databaseUrl.searchParams.get("sslaccept") !== "strict") {
    throw new Error("DATABASE_URL must use sslaccept=strict in production");
  }
  validateDatabaseTimeouts(databaseUrl);
  validateDatabaseDriverSettings(databaseUrl);
  const webOrigin = requiredUrl("WEB_ORIGIN", environment.WEB_ORIGIN, ["https:"]);
  if (webOrigin.pathname !== "/" || webOrigin.search || webOrigin.hash || webOrigin.username || webOrigin.password) {
    throw new Error("WEB_ORIGIN must be an HTTPS origin without a path");
  }
  assertProductionValkeyUrl(environment.VALKEY_URL);
  if (environment.LOCAL_ADMIN_EMAILS?.trim()) {
    throw new Error("LOCAL_ADMIN_EMAILS must be empty in production");
  }
}

export function assertProductionValkeyUrl(value: string | undefined) {
  const url = requiredUrl("VALKEY_URL", value, ["rediss:"]);
  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error("VALKEY_URL must use valid encoded credentials");
  }
  const database = url.pathname.slice(1);
  if (!url.hostname || (url.port && Number(url.port) < 1) || url.search || url.hash ||
      (url.pathname && url.pathname !== "/" && (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))))) {
    throw new Error("VALKEY_URL must include a host and an optional non-negative database number without a query or fragment");
  }
}

export function getJwtSecret(input: JwtSecretInput = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const jwtSecret = input.jwtSecret ?? process.env.JWT_SECRET;

  if (nodeEnv === "production") {
    if (!jwtSecret || jwtSecret === developmentJwtSecret) {
      throw new Error("JWT_SECRET is required in production");
    }
    if (Buffer.byteLength(jwtSecret.trim(), "utf8") < 32) {
      throw new Error("JWT_SECRET must be at least 32 bytes in production");
    }

    return jwtSecret;
  }

  return jwtSecret || developmentJwtSecret;
}

export function getAuthSecurityConfig(input: AuthSecurityConfigInput = {}): AuthSecurityConfig {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const otpHashSecret = input.otpHashSecret ?? process.env.OTP_HASH_SECRET;
  const securityIdentifierHashSecret =
    input.securityIdentifierHashSecret ?? process.env.SECURITY_IDENTIFIER_HASH_SECRET;

  if (nodeEnv === "production" && !otpHashSecret) throw new Error("OTP_HASH_SECRET is required in production");
  if (nodeEnv === "production" && !securityIdentifierHashSecret) {
    throw new Error("SECURITY_IDENTIFIER_HASH_SECRET is required in production");
  }
  if (
    nodeEnv === "production" &&
    (otpHashSecret === developmentOtpHashSecret || securityIdentifierHashSecret === developmentIdentifierHashSecret)
  ) {
    throw new Error("Production auth hash secrets must not use development defaults");
  }
  if (nodeEnv === "production" && Buffer.byteLength(otpHashSecret!, "utf8") < 32) {
    throw new Error("OTP_HASH_SECRET must be at least 32 bytes in production");
  }
  if (nodeEnv === "production" && Buffer.byteLength(securityIdentifierHashSecret!, "utf8") < 32) {
    throw new Error("SECURITY_IDENTIFIER_HASH_SECRET must be at least 32 bytes in production");
  }
  if (nodeEnv === "production" && otpHashSecret === securityIdentifierHashSecret) {
    throw new Error("Production auth hash secrets must be distinct");
  }

  const codeTtlSeconds = parsePositiveInteger(
    "AUTH_CODE_TTL_SECONDS",
    input.codeTtlSeconds ?? process.env.AUTH_CODE_TTL_SECONDS,
    600
  );
  const codeMaxAttempts = parsePositiveInteger(
    "AUTH_CODE_MAX_ATTEMPTS",
    input.codeMaxAttempts ?? process.env.AUTH_CODE_MAX_ATTEMPTS,
    5
  );
  const codeCooldownSeconds = parsePositiveInteger(
    "AUTH_CODE_COOLDOWN_SECONDS",
    input.codeCooldownSeconds ?? process.env.AUTH_CODE_COOLDOWN_SECONDS,
    60
  );
  if (nodeEnv === "production") {
    requireProductionValue("AUTH_CODE_TTL_SECONDS", codeTtlSeconds, 600);
    requireProductionValue("AUTH_CODE_MAX_ATTEMPTS", codeMaxAttempts, 5);
    requireProductionValue("AUTH_CODE_COOLDOWN_SECONDS", codeCooldownSeconds, 60);
  }

  return {
    otpHashSecret: otpHashSecret || developmentOtpHashSecret,
    securityIdentifierHashSecret: securityIdentifierHashSecret || developmentIdentifierHashSecret,
    codeTtlMs: codeTtlSeconds * 1000,
    codeMaxAttempts,
    codeCooldownMs: codeCooldownSeconds * 1000,
    trustedProxyHops: parseNonNegativeInteger(
      "TRUSTED_PROXY_HOPS",
      input.trustedProxyHops ?? process.env.TRUSTED_PROXY_HOPS,
      0
    )
  };
}

export function getListingMediaStorageConfig(
  input: ListingMediaStorageConfigInput = {}
): ListingMediaStorageConfig {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const endpoint = storageValue(
    "LISTING_MEDIA_STORAGE_ENDPOINT",
    input.endpoint ?? process.env.LISTING_MEDIA_STORAGE_ENDPOINT,
    "http://localhost:9000",
    nodeEnv
  );
  const uploadEndpoint = storageValue(
    "LISTING_MEDIA_UPLOAD_ENDPOINT",
    input.uploadEndpoint ?? process.env.LISTING_MEDIA_UPLOAD_ENDPOINT,
    endpoint,
    nodeEnv
  );
  const region = storageValue(
    "LISTING_MEDIA_STORAGE_REGION",
    input.region ?? process.env.LISTING_MEDIA_STORAGE_REGION,
    "us-east-1",
    nodeEnv
  );
  const bucket = storageValue(
    "LISTING_MEDIA_STORAGE_BUCKET",
    input.bucket ?? process.env.LISTING_MEDIA_STORAGE_BUCKET,
    "listing-media",
    nodeEnv
  );
  const accessKeyId = storageValue(
    "LISTING_MEDIA_STORAGE_ACCESS_KEY_ID",
    input.accessKeyId ?? process.env.LISTING_MEDIA_STORAGE_ACCESS_KEY_ID,
    "minio",
    nodeEnv
  );
  const secretAccessKey = storageValue(
    "LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY",
    input.secretAccessKey ?? process.env.LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY,
    "minio-development",
    nodeEnv
  );
  const uploadTtlSeconds = parsePositiveInteger(
    "LISTING_MEDIA_UPLOAD_TTL_SECONDS",
    input.uploadTtlSeconds ?? process.env.LISTING_MEDIA_UPLOAD_TTL_SECONDS,
    600
  );
  if (uploadTtlSeconds !== 600) {
    throw new Error("LISTING_MEDIA_UPLOAD_TTL_SECONDS must be 600");
  }

  validateStorageEndpoint("LISTING_MEDIA_STORAGE_ENDPOINT", endpoint, nodeEnv);
  validateStorageEndpoint("LISTING_MEDIA_UPLOAD_ENDPOINT", uploadEndpoint, nodeEnv);

  return {
    endpoint,
    uploadEndpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    uploadTtlSeconds,
    forcePathStyle: true
  };
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive safe integer`);
  return parsed;
}

function parseNonNegativeInteger(name: string, value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative safe integer`);
  return parsed;
}

function requireProductionValue(name: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${name} must be ${expected} in production`);
}

function storageValue(name: string, value: string | undefined, developmentDefault: string, nodeEnv: string) {
  const normalized = value?.trim();
  if (nodeEnv === "production" && !normalized) throw new Error(`${name} is required in production`);
  return normalized || developmentDefault;
}

function validateStorageEndpoint(name: string, value: string, nodeEnv: string) {
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (nodeEnv === "production" && parsedEndpoint.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  if (parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search || parsedEndpoint.hash) {
    throw new Error(`${name} must not contain credentials, a query, or a fragment`);
  }
}

function requiredUrl(name: string, value: string | undefined, protocols: string[]) {
  if (!value?.trim()) throw new Error(`${name} is required in production`);
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error(`${name} must be a valid URL`); }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} must use ${protocols.join(" or ")}`);
  return parsed;
}

// The application driver enforces these deadlines independently of native URL
// handling; the matching URL settings also keep operational tooling explicit.
export const DATABASE_TIMEOUT_SECONDS = { connect_timeout: 2, pool_timeout: 2, socket_timeout: 3 } as const;

function validateDatabaseTimeouts(url: URL) {
  for (const [name, seconds] of Object.entries(DATABASE_TIMEOUT_SECONDS)) {
    if (url.searchParams.getAll(name).length !== 1 || url.searchParams.get(name) !== String(seconds)) {
      throw new Error(`DATABASE_URL must use one ${name}=${seconds} setting`);
    }
  }
}

function validateDatabaseDriverSettings(url: URL) {
  const supported = new Set(["schema", "connection_limit", "sslmode", "sslaccept", ...Object.keys(DATABASE_TIMEOUT_SECONDS)]);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error("DATABASE_URL must use PostgreSQL with a host and no fragment");
  }
  for (const name of url.searchParams.keys()) {
    if (!supported.has(name)) throw new Error("DATABASE_URL contains an unsupported driver setting");
    if (url.searchParams.getAll(name).length !== 1) throw new Error("DATABASE_URL contains an ambiguous driver setting");
  }
  const maximum = url.searchParams.get("connection_limit");
  if (maximum !== null && (!/^[1-9]\d*$/.test(maximum) || Number(maximum) > 10)) {
    throw new Error("DATABASE_URL connection_limit must be an integer from 1 to 10");
  }
  const schema = url.searchParams.get("schema") ?? "public";
  if (!schema || ["$user", "pg_temp"].includes(schema) || schema.includes("\0") || Buffer.byteLength(schema) > 63) {
    throw new Error("DATABASE_URL schema must be a non-empty literal PostgreSQL identifier of at most 63 bytes");
  }
}

export function getDatabaseClientUrl(environment: Record<string, string | undefined> = process.env) {
  const value = environment.DATABASE_URL;
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("DATABASE_URL must be a valid URL"); }
  validateDatabaseDriverSettings(url);
  if (environment.NODE_ENV === "production") {
    if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0" || url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict") {
      throw new Error("DATABASE_URL must require verified TLS in production");
    }
    validateDatabaseTimeouts(url);
  }
  else {
    for (const [name, seconds] of Object.entries(DATABASE_TIMEOUT_SECONDS)) url.searchParams.set(name, String(seconds));
  }
  return url.href;
}
