export type AuthProvider = "email" | "neon";
export type NeonAuthConfig = { baseUrl: string; jwksUrl: string; issuer: string; audience: string; publicSignup: boolean };

export function getAuthProvider(environment: Record<string, string | undefined> = process.env): AuthProvider {
  const value = environment.AUTH_PROVIDER ?? "email";
  if (value !== "email" && value !== "neon") throw new Error("AUTH_PROVIDER must be email or neon");
  return value;
}

export function getNeonAuthConfig(environment: Record<string, string | undefined> = process.env): NeonAuthConfig | undefined {
  const provider = getAuthProvider(environment);
  const signup = environment.PUBLIC_BETA_SIGNUP;
  if (signup !== undefined && signup !== "false" && signup !== "true") throw new Error("PUBLIC_BETA_SIGNUP must be true or false");
  if (provider !== "neon") {
    if (signup === "true") throw new Error("PUBLIC_BETA_SIGNUP requires AUTH_PROVIDER=neon");
    return undefined;
  }
  const raw = environment.NEON_AUTH_BASE_URL;
  if (!raw || raw.length > 2048) throw new Error("NEON_AUTH_BASE_URL is required for Neon authentication");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("NEON_AUTH_BASE_URL must be a valid managed Neon Auth URL"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
      !/^ep-[a-z0-9-]+\.neonauth\.(?:c-[0-9]{1,3}\.)?[a-z0-9-]+\.aws\.neon\.tech$/.test(url.hostname) ||
      !/^\/[a-zA-Z0-9_-]+\/auth\/?$/.test(url.pathname)) {
    throw new Error("NEON_AUTH_BASE_URL must be an HTTPS managed Neon Auth project endpoint without credentials or overrides");
  }
  const baseUrl = url.href.replace(/\/$/, "");
  const jwksUrl = `${baseUrl}/.well-known/jwks.json`;
  if (environment.NEON_AUTH_JWKS_URL !== undefined && environment.NEON_AUTH_JWKS_URL !== jwksUrl) {
    throw new Error("NEON_AUTH_JWKS_URL must exactly match the configured Neon Auth project's JWKS endpoint");
  }
  return { baseUrl, jwksUrl, issuer: url.origin, audience: url.origin, publicSignup: signup === "true" };
}
