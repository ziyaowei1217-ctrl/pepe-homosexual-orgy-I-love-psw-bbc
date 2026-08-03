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

export function getJwtSecret(input: JwtSecretInput = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const jwtSecret = input.jwtSecret ?? process.env.JWT_SECRET;

  if (nodeEnv === "production") {
    if (!jwtSecret || jwtSecret === developmentJwtSecret) {
      throw new Error("JWT_SECRET is required in production");
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
