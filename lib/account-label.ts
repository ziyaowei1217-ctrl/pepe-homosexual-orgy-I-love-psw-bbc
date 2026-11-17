/**
 * Accounts created by phone sign-up have no email address. The API gives them a placeholder under this reserved
 * domain (api/src/auth/phone-auth.service.ts), which is never shown or emailed.
 */
export const phoneAccountEmailDomain = "phone.psw.invalid";

export function isPhoneAccountEmail(email: string) {
  return email.toLowerCase().endsWith(`@${phoneAccountEmailDomain}`);
}

export function accountEmailLabel(email: string) {
  return isPhoneAccountEmail(email) ? "手机号登录的账户" : email;
}

/** The name to greet: the profile name, else the part of a real email address before the @, else nothing. */
export function accountGreetingName(email: string, displayName?: string | null) {
  return displayName?.trim() || (isPhoneAccountEmail(email) ? "" : email.split("@")[0]);
}
