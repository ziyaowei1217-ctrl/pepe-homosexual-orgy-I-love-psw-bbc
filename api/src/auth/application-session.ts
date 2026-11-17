/**
 * How long a sign-in lasts. Renters and hosts stay signed in for a week, so test users are not sent back to
 * the sign-in screen (and phone users are not texted again) every hour. A session whose account is an
 * administrator, when issued or since, lasts one hour: administrator step-up trusts a phone only after it has
 * been linked for a day (ADMIN_STEP_UP_PHONE_MIN_AGE_MS), which holds only while a stolen session expires first.
 */
export const USER_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_SESSION_SECONDS = 60 * 60;

export function applicationSessionSeconds(role: string) {
  return role === "ADMIN" ? ADMIN_SESSION_SECONDS : USER_SESSION_SECONDS;
}
