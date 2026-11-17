import { randomBytes } from "node:crypto";

// Accounts created by phone have no email. User.email stays required and
// unique, so they get a random address under a reserved domain (RFC 2606
// .invalid never delivers mail). The web shows the masked phone instead.
export const PHONE_ACCOUNT_EMAIL_DOMAIN = "phone.psw.invalid";

export function newPhoneAccountEmail() {
  return `phone-${randomBytes(10).toString("hex")}@${PHONE_ACCOUNT_EMAIL_DOMAIN}`;
}

export function isPhoneAccountEmail(email: string) {
  return email.toLowerCase().endsWith(`@${PHONE_ACCOUNT_EMAIL_DOMAIN}`);
}

/**
 * The name other people see for an account that has not set a display name: the part of its email before the @, or
 * for a phone account (whose address is a placeholder) "psw 用户" and four characters of its random address, so two
 * such accounts can be told apart without showing anything about the number.
 */
export function fallbackDisplayName(email: string) {
  const localPart = email.split("@")[0];
  return isPhoneAccountEmail(email) ? `psw 用户 ${localPart.slice(-4)}` : localPart;
}
