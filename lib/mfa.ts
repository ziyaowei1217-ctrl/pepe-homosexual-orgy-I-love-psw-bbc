import { apiGet, apiPost } from "./api";

export type MfaStatus = { enabled: boolean; recoveryCodesRemaining: number; verifiedUntil: string | null };
export type MfaEnrollment = { secret: string; otpauthUri: string };
export type MfaProof = { code: string; recoveryCode?: never } | { recoveryCode: string; code?: never };
export type MfaVerification = { accessToken: string; verifiedUntil: string };
export type MfaEnrollmentConfirmation = MfaVerification & { recoveryCodes: string[] };

export const getMfaStatus = (token: string) => apiGet<MfaStatus>("/auth/mfa", token);
export const beginMfaEnrollment = (token: string) => apiPost<MfaEnrollment>("/auth/mfa/enrollment", {}, token);
export const confirmMfaEnrollment = (token: string, code: string) => apiPost<MfaEnrollmentConfirmation>("/auth/mfa/enrollment/confirm", { code }, token);
export const verifyMfa = (token: string, proof: MfaProof) => apiPost<MfaVerification>("/auth/mfa/verify", proof, token);
export const disableMfa = (token: string, proof: MfaProof) => apiPost<{ disabled: true }>("/auth/mfa/disable", proof, token);
