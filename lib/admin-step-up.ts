import type { AdminStepUpResponse } from "./api";

export type AdminStepUpSession = AdminStepUpResponse;
type AdminStepUpIdentity = { id: string; email: string };
const adminStepUpStorageKey = "sublet:admin-step-up:v1";

export function getActiveAdminStepUpToken(
  session: AdminStepUpSession | null,
  now = Date.now()
) {
  if (!session || session.accessToken.trim().length === 0) return null;
  const expiresAt = Date.parse(session.reauthenticatedUntil);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return null;
  return session.accessToken;
}

export function writeStoredAdminStepUpSession(
  storage: Storage,
  identity: AdminStepUpIdentity,
  session: AdminStepUpSession,
  now = Date.now()
) {
  if (!getActiveAdminStepUpToken(session, now)) {
    clearStoredAdminStepUpSession(storage);
    return;
  }
  storage.setItem(adminStepUpStorageKey, JSON.stringify({ identity, session }));
}

export function readStoredAdminStepUpSession(
  storage: Storage,
  identity: AdminStepUpIdentity,
  now = Date.now()
): AdminStepUpSession | null {
  try {
    const raw = storage.getItem(adminStepUpStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      identity?: Partial<AdminStepUpIdentity>;
      session?: Partial<AdminStepUpSession>;
    };
    const session = parsed.session;
    if (
      parsed.identity?.id !== identity.id ||
      parsed.identity?.email !== identity.email ||
      typeof session?.accessToken !== "string" ||
      typeof session.reauthenticatedUntil !== "string" ||
      !getActiveAdminStepUpToken(session as AdminStepUpSession, now)
    ) {
      clearStoredAdminStepUpSession(storage);
      return null;
    }
    return session as AdminStepUpSession;
  } catch {
    clearStoredAdminStepUpSession(storage);
    return null;
  }
}

export function clearStoredAdminStepUpSession(storage: Storage) {
  storage.removeItem(adminStepUpStorageKey);
}
