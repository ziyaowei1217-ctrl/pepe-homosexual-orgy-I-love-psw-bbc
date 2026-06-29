type JwtSecretInput = {
  nodeEnv?: string;
  jwtSecret?: string;
};

const developmentJwtSecret = "dev-change-me";

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
