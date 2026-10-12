import type { JwtService } from "@nestjs/jwt";

export const SESSION_ISSUER = "sublet-api";
export const SESSION_AUDIENCE = "sublet-web";
export const SESSION_PURPOSE = "session";
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function signSessionToken(jwt: JwtService, session: { id: string; userId: string; expiresAt: Date }, claims: Record<string, unknown> = {}) {
  return jwt.signAsync({ ...claims, sub: session.userId, sid: session.id, purpose: SESSION_PURPOSE }, {
    algorithm: "HS256", issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE,
    expiresIn: Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
  });
}
