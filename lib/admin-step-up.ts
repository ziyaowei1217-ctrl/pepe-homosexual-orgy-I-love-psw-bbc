import type { AdminStepUpResponse } from "./api";

export type AdminStepUpSession = AdminStepUpResponse;

export function getActiveAdminStepUpToken(
  session: AdminStepUpSession | null,
  now = Date.now()
) {
  if (!session || session.accessToken.trim().length === 0) return null;
  const expiresAt = Date.parse(session.reauthenticatedUntil);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return null;
  return session.accessToken;
}
