type JwtSecretInput = {
  nodeEnv?: string;
  jwtSecret?: string;
};

type AuthSecurityConfigInput = {
  nodeEnv?: string;
  jwtSecret?: string;
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
const publicDevelopmentSecrets = new Set([
  developmentJwtSecret, developmentOtpHashSecret, developmentIdentifierHashSecret,
  "docker-development-jwt-secret-change-me"
]);
const developmentMfaKey = Buffer.from("development-only-mfa-key-32-byte");

export function assertProductionRuntimeConfig(environment: Record<string, string | undefined> = process.env) {
  if (environment.NODE_ENV !== "production") return;

  const databaseUrl = requiredUrl("DATABASE_URL", environment.DATABASE_URL, ["postgresql:", "postgres:"]);
  if (databaseUrl.searchParams.get("sslmode") !== "require" && databaseUrl.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("DATABASE_URL must require TLS in production");
  }
  const webOrigin = requiredUrl("WEB_ORIGIN", environment.WEB_ORIGIN, ["https:"]);
  if (webOrigin.pathname !== "/" || webOrigin.search || webOrigin.hash) {
    throw new Error("WEB_ORIGIN must be an HTTPS origin without a path");
  }
  rejectUrlCredentials("WEB_ORIGIN", webOrigin);
  requiredUrl("VALKEY_URL", environment.VALKEY_URL, ["rediss:"]);
  if (environment.LOCAL_ADMIN_EMAILS?.trim()) {
    throw new Error("LOCAL_ADMIN_EMAILS must be empty in production");
  }
  getJwtSecret({ nodeEnv: "production", jwtSecret: environment.JWT_SECRET ?? "" });
  getAuthSecurityConfig({
    nodeEnv: "production",
    jwtSecret: environment.JWT_SECRET ?? "",
    otpHashSecret: environment.OTP_HASH_SECRET ?? "",
    securityIdentifierHashSecret: environment.SECURITY_IDENTIFIER_HASH_SECRET ?? "",
    codeTtlSeconds: environment.AUTH_CODE_TTL_SECONDS ?? "600",
    codeMaxAttempts: environment.AUTH_CODE_MAX_ATTEMPTS ?? "5",
    codeCooldownSeconds: environment.AUTH_CODE_COOLDOWN_SECONDS ?? "60",
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS ?? "0"
  });
  const mfaKey = getMfaEncryptionKey({ nodeEnv: "production", mfaEncryptionKey: environment.MFA_ENCRYPTION_KEY ?? "" });
  if ([environment.JWT_SECRET, environment.OTP_HASH_SECRET, environment.SECURITY_IDENTIFIER_HASH_SECRET]
    .some((secret) => secret === environment.MFA_ENCRYPTION_KEY || Buffer.from(secret ?? "").equals(mfaKey))) {
    throw new Error("MFA_ENCRYPTION_KEY and authentication secrets must be distinct");
  }
  const paymentUrl = requiredUrl("PAYMENT_SERVICE_URL", environment.PAYMENT_SERVICE_URL, ["https:"]);
  rejectUrlCredentials("PAYMENT_SERVICE_URL", paymentUrl);
  if (paymentUrl.search || paymentUrl.hash) throw new Error("PAYMENT_SERVICE_URL must not include a query or fragment");
  requiredProductionValue("PAYMENT_SERVICE_API_KEY", environment.PAYMENT_SERVICE_API_KEY);
  if (environment.EMAIL_SENDER !== "resend") throw new Error("EMAIL_SENDER must be resend in production");
  requiredProductionValue("RESEND_API_KEY", environment.RESEND_API_KEY);
  requiredProductionValue("EMAIL_FROM", environment.EMAIL_FROM);
  if (environment.EMAIL_FROM?.trim() === "Sublet Pipeline <no-reply@example.com>") {
    throw new Error("EMAIL_FROM must not use the development default");
  }
  getListingMediaStorageConfig({
    nodeEnv: "production", endpoint: environment.LISTING_MEDIA_STORAGE_ENDPOINT ?? "",
    uploadEndpoint: environment.LISTING_MEDIA_UPLOAD_ENDPOINT ?? "",
    region: environment.LISTING_MEDIA_STORAGE_REGION ?? "", bucket: environment.LISTING_MEDIA_STORAGE_BUCKET ?? "",
    accessKeyId: environment.LISTING_MEDIA_STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: environment.LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY ?? "",
    uploadTtlSeconds: environment.LISTING_MEDIA_UPLOAD_TTL_SECONDS ?? "600"
  });
}

export function getMfaEncryptionKey(input: { nodeEnv?: string; mfaEncryptionKey?: string } = {}): Buffer {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const value = input.mfaEncryptionKey ?? process.env.MFA_ENCRYPTION_KEY;
  if (!value && nodeEnv !== "production") return Buffer.from(developmentMfaKey);
  const bytes = Buffer.from(value ?? "", "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value || new Set(bytes).size < 2 ||
    (nodeEnv === "production" && bytes.equals(developmentMfaKey))) {
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes in canonical base64; public development and uniform-byte keys are prohibited");
  }
  return bytes;
}

export function getJwtSecret(input: JwtSecretInput = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const jwtSecret = input.jwtSecret ?? process.env.JWT_SECRET;

  if (nodeEnv === "production") {
    if (!jwtSecret || publicDevelopmentSecrets.has(jwtSecret.trim())) {
      throw new Error("JWT_SECRET is required in production");
    }
    validateSecretBytes("JWT_SECRET", jwtSecret);
    return jwtSecret;
  }

  return jwtSecret || developmentJwtSecret;
}

export function getAuthSecurityConfig(input: AuthSecurityConfigInput = {}): AuthSecurityConfig {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const otpHashSecret = input.otpHashSecret ?? process.env.OTP_HASH_SECRET;
  const securityIdentifierHashSecret =
    input.securityIdentifierHashSecret ?? process.env.SECURITY_IDENTIFIER_HASH_SECRET;
  const jwtSecret = input.jwtSecret ?? process.env.JWT_SECRET;

  if (nodeEnv === "production" && !otpHashSecret) throw new Error("OTP_HASH_SECRET is required in production");
  if (nodeEnv === "production" && !securityIdentifierHashSecret) {
    throw new Error("SECURITY_IDENTIFIER_HASH_SECRET is required in production");
  }
  if (
    nodeEnv === "production" &&
    (publicDevelopmentSecrets.has(otpHashSecret!.trim()) || publicDevelopmentSecrets.has(securityIdentifierHashSecret!.trim()))
  ) {
    throw new Error("Production auth hash secrets must not use development defaults");
  }
  if (nodeEnv === "production") {
    validateSecretBytes("OTP_HASH_SECRET", otpHashSecret!);
    validateSecretBytes("SECURITY_IDENTIFIER_HASH_SECRET", securityIdentifierHashSecret!);
  }
  if (nodeEnv === "production" && otpHashSecret === securityIdentifierHashSecret) {
    throw new Error("Production auth hash secrets must be distinct");
  }
  if (nodeEnv === "production" && jwtSecret && [otpHashSecret, securityIdentifierHashSecret].includes(jwtSecret)) {
    throw new Error("Production authentication secrets must be distinct");
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

  validateStorageEndpoint("LISTING_MEDIA_STORAGE_ENDPOINT", endpoint);
  validateStorageEndpoint("LISTING_MEDIA_UPLOAD_ENDPOINT", uploadEndpoint);
  if (nodeEnv === "production") {
    const upload = requiredUrl("LISTING_MEDIA_UPLOAD_ENDPOINT", uploadEndpoint, ["https:"]);
    rejectUrlCredentials("LISTING_MEDIA_UPLOAD_ENDPOINT", upload);
    if (upload.search || upload.hash) throw new Error("LISTING_MEDIA_UPLOAD_ENDPOINT must not include a query or fragment");
    const storage = new URL(endpoint);
    rejectUrlCredentials("LISTING_MEDIA_STORAGE_ENDPOINT", storage);
    if (storage.search || storage.hash) throw new Error("LISTING_MEDIA_STORAGE_ENDPOINT must not include a query or fragment");
  }

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

function validateSecretBytes(name: string, value: string) {
  if (Buffer.byteLength(value.trim(), "utf8") < 32) {
    throw new Error(`${name} must be at least 32 bytes in production`);
  }
  if (value !== value.trim()) throw new Error(`${name} must not have surrounding whitespace`);
}

function requiredProductionValue(name: string, value: string | undefined) {
  if (!value?.trim()) throw new Error(`${name} is required in production`);
}

function rejectUrlCredentials(name: string, url: URL) {
  if (url.username || url.password) throw new Error(`${name} must not include credentials`);
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

function validateStorageEndpoint(name: string, value: string) {
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
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
