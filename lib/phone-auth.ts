import { apiGet, apiPost, type AdminStepUpResponse, type SessionUser } from "./api";

export type PhoneCodeResponse = { phoneNumber: string; expiresInSeconds: number; devCode?: string };
export type PhoneStatus = { enabled: boolean; regions: string[]; linked: boolean; phoneNumber: string | null; verifiedAt: string | null };
export type PhoneSignInResponse = { accessToken: string; user: SessionUser; isNewUser: boolean };

// Accepts digits with common punctuation; the API re-validates and owns the rules.
export function normalizePhoneInput(value: string) {
  return value.replace(/[^\d+\s().-]/g, "").slice(0, 24);
}

export function looksLikePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export const requestPhoneSignInCode = (phoneNumber: string) => apiPost<PhoneCodeResponse>("/auth/phone/sign-in/code", { phoneNumber });
export const verifyPhoneSignInCode = (phoneNumber: string, code: string) => apiPost<PhoneSignInResponse>("/auth/phone/sign-in/verify", { phoneNumber, code });
export const getPhoneStatus = (token: string) => apiGet<PhoneStatus>("/auth/phone", token);
export const requestPhoneLinkCode = (token: string, phoneNumber: string) => apiPost<PhoneCodeResponse>("/auth/phone/link/code", { phoneNumber }, token);
export const verifyPhoneLinkCode = (token: string, phoneNumber: string, code: string) =>
  apiPost<{ linked: true; phoneNumber: string; verifiedAt: string }>("/auth/phone/link/verify", { phoneNumber, code }, token);
export const unlinkPhone = (token: string) => apiPost<{ linked: false }>("/auth/phone/unlink", {}, token);
export const requestAdminPhoneStepUpCode = (token: string) => apiPost<PhoneCodeResponse>("/auth/admin-step-up/phone-code", {}, token);
export const verifyAdminPhoneStepUpCode = (token: string, code: string) => apiPost<AdminStepUpResponse>("/auth/admin-step-up/phone-verify", { code }, token);
