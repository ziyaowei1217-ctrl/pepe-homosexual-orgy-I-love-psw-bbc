# Optional Neon identity bridge

This mode connects real managed Neon Auth identities to the existing application accounts and shared database. It does not create browser-local test users or synthetic conversations.

## Explicit deployment configuration

The default is `AUTH_PROVIDER=email`; existing email OTP and invitation policy remain unchanged. To opt in, configure:

- Backend `AUTH_PROVIDER=neon` and `NEON_AUTH_BASE_URL` from the selected managed Neon Auth project/branch.
- Optional `NEON_AUTH_JWKS_URL`, which must exactly equal the configured base URL plus `/.well-known/jwks.json`.
- `PUBLIC_BETA_SIGNUP=true` only when new verified users should be admitted without an existing invitation. Otherwise an existing account or an active invitation is required.
- Frontend `NEXT_PUBLIC_AUTH_PROVIDER=neon` and its separately validated server-side provider configuration.

The backend accepts only HTTPS managed `ep-*.neonauth.[c-<cluster>.]<region>.aws.neon.tech/<database>/auth` (an optional numeric cluster label, such as `c-6`) endpoints. Client requests cannot supply an issuer, audience, key endpoint, role or signup policy. JWT, auth hashing, verified database TLS and distributed quota infrastructure remain mandatory in production. No development-mode authentication fallback is enabled.

Apply the additive `ExternalAuthIdentity` and `PhoneIdentity` migrations before deploying an API that includes them. Its two unique constraints bind one provider issuer/subject to one local user and prevent a different subject from claiming an already bound user's recycled email address. A changed provider email does not remap an existing subject to another application account; it requires an operator-supported account recovery process.

## Protocol and session behavior

Google returns through the fixed first-party `/api/auth/complete` callback. The state-bound verifier is exchanged by the real Neon server toolkit; secure, HttpOnly, host-only cookies are preserved individually. The completion redirect uses the explicit non-secret query `flow=google` so a hosting redirect layer cannot inherit the incoming verifier. This marker never authenticates a request. The browser still requires its one-time, ten-minute tab intent and unchanged application account.

Token retrieval uses an uncached, same-origin, cookie-authenticated `GET /api/auth/token`, with redirects refused, a 15-second whole-response deadline and a 16 KiB streamed body limit. The installed Neon SDK 0.7.0-beta shares its `/token` hook with the `get-session` cache, which can otherwise return account/session data instead of a JWT. A regression exercises that behavior using the real installed SDK. Opaque session cookies and cached account data are never accepted as JWT substitutes. Completion errors use fixed messages that distinguish tab intent, account changes, transport and provider/application verification without exposing raw errors or tokens.

The frontend sends a managed Neon access JWT to `POST /api/v1/auth/neon/exchange` as `{ "token": "..." }`. The backend verifies its signature using bounded, cached public-key retrieval from the configured project only. It requires EdDSA/Ed25519, a known key ID, exact issuer and audience equal to the Auth URL origin, required current `iat`/`exp` claims with a maximum 15-minute token lifetime, a stable nonempty subject, and boolean `emailVerified: true`. Explicit bans and inconsistent user IDs are rejected.

The issuer/audience use the origin; the JWKS URL retains the full `/database/auth` path. This distinction follows [Neon's JWT documentation](https://neon.com/docs/auth/guides/plugins/jwt). Key downloads have a two-second transport timeout and 128 KiB response limit; redirects, private keys and unexpected key types fail closed. Key rotation uses the library's cache and cooldown rather than an endpoint from the token header.

The public exchange is limited by distributed IP/device/global quotas before verification. A second distributed issuer/subject quota runs after verification and before database writes. Quota outages fail closed.

Identity binding, invitation claiming, local account creation and initial profile creation run in one transaction with subject/email locks and uniqueness constraints. New accounts always receive local role `USER`. Existing local roles are reloaded and preserved. Provider `role` and administrator step-up claims are never copied. Email verification does not mark education or phone verification complete.

Successful exchange returns the existing login response shape and a separately issued HS256 application session valid for one hour. This session can outlive the provider's 15-minute access JWT; upstream logout/revocation is not immediate application-session revocation. Existing socket authentication disconnects at the application token's expiry. The frontend must clear the app session and disconnect sockets on local logout.

The managed JWT describes a verified Neon identity; it does not identify the original social provider. Operators must manage which methods are enabled in Neon rather than treating an unverified frontend provider label as proof.

## Sign-in methods

The build-time flag `NEXT_PUBLIC_AUTH_METHODS` (comma list of `google`, `github`, `email`, `phone`) chooses what the sign-in screen offers. Unset means Google only, which is the screen used before this flag existed. The flag is presentation only: the server-side proxy allowlist follows the same list, so a hidden method's Neon route is also refused at `/api/auth/*`, and `tools/production-config.mjs` rejects unknown names, non-Neon builds and a list without an account-creating method (`google`, `github` or `email`).

- **Google / GitHub** use Neon's social sign-in and the same fixed `/api/auth/complete` callback. GitHub needs a GitHub OAuth app whose ID and secret are entered in the Neon console (Auth → OAuth providers); the button must stay off until that is done.
- **Email code** uses Neon's Email OTP plugin (`/email-otp/send-verification-otp` and `/sign-in/email-otp`). The proxy accepts only the canonical bodies (`{email,type:"sign-in"}` and `{email,otp}` with a six-digit code), lowercases the address, never returns Neon's token JSON to the browser, and maps provider errors to fixed codes. A successful code sets the same first-party Neon cookies as Google, then the normal JWT exchange runs. Neon's built-in delivery uses its shared sender `auth@mail.myneon.app`; Neon describes it as suitable for development, so a production launch should configure a custom SMTP sender in the Neon console.
- **Phone (SMS code)** is implemented in this API, not in Neon. Neon's phone plugin can only sign in already linked numbers and requires a `send.otp` webhook, which also turns off Neon's built-in email-code delivery, so it is not used.

## Phone linking and SMS sign-in

Accounts stay email-anchored. A signed-in user links a number in 账户 → 身份与认证 (`POST /auth/phone/link/code` then `/auth/phone/link/verify`); after that the number can sign in (`POST /auth/phone/sign-in/code` then `/sign-in/verify`), which returns the same one-hour application session as the Neon exchange. There is no phone-only sign-up.

- Numbers are normalized to E.164 and limited to `PHONE_AUTH_REGIONS` (`US_CA`: NANP excluding Caribbean and N11 area codes; `CN`: mainland mobile). Phone data lives in the separate `PhoneIdentity` table (unique per user and per number) so existing user queries cannot return it; the UI only ever shows a masked number.
- Codes are sent only to linked numbers (sign-in) or to numbers not linked to another account (linking), but the response is identical either way: texts go out in the background and Twilio responses are padded to a fixed 1.2-second floor. Codes are checked with the provider only for a number that could succeed (linked non-administrator for sign-in, free or own number for linking), so guesses from one flow cannot use up a code sent for another, such as an administrator's pending step-up code.
- Quotas (distributed, fail closed): per number 3 sends/hour and 6/day, per device 5/hour, per IP 15/hour (an IPv6 /64 counts as one address), per account 10/day; verification 10 attempts per number per 15 minutes plus device/IP caps. Separately, actual texts have a per-purpose budget (sign-in and linking 20/minute and 200/day each, administrator step-up 10/minute and 50/day), charged only when a text is really sent, so a flood of requests for unlinked numbers costs nothing and never blocks step-up. Twilio Verify adds its own per-number limits and the 10-minute code expiry.
- Linking, replacing or removing a phone needs an application session issued in the last 15 minutes (`RECENT_SIGN_IN_REQUIRED` otherwise), so an older stolen session cannot add the thief's phone as a lasting way back in. A link change takes a per-account lock. Unlinking clears the phone-verified badge.
- Administrators cannot use phone sign-in. An administrator may add a first number but cannot replace or remove it from the website. Granting the administrator role with `admin:roles grant` deletes any phone linked before promotion; to reset an administrator's phone, an operator revokes and re-grants the role, and the administrator links again (usable for step-up after 24 hours).
- Provider: `PHONE_AUTH_PROVIDER=twilio-verify` with `TWILIO_ACCOUNT_SID`, `TWILIO_VERIFY_SERVICE_SID` and either `TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET` (preferred) or `TWILIO_AUTH_TOKEN`. `disabled` (default) hides phone routes; `development` returns codes in responses and is refused in production. Twilio Verify avoids US A2P 10DLC sender registration. A Twilio trial account only texts numbers verified in that Twilio account; real use is paid per verification.
- Known residual risks: (1) someone holding a user's fresh session or Neon cookie could still link their own phone; the masked number is visible on the account page and can be removed there, but there is no email notice because Neon mode has no email sender. (2) Phone sign-in does not consult Neon, so banning or deleting a user in the Neon console does not stop SMS sign-in; remove the user's `PhoneIdentity` row (or demote and re-grant an administrator) as part of any ban.

## Staff moderation remains protected

In Neon mode, the API's own email-code and email administrator step-up routes return unavailable, and creating the application does not require a Resend transport. This is a disabled transport, never a successful fake email delivery.

A Neon sign-in does not assert `adminReauthenticatedAt`. Existing administrators may read queues where their database role permits it, but listing approval/rejection and other protected writes still require the administrator step-up guard.

In Neon mode the step-up proof is an SMS code to the administrator's own linked phone (`POST /auth/admin-step-up/phone-code` and `/phone-verify`), which issues a session with `adminReauthenticatedAt` valid for 30 minutes. It requires phone auth to be configured, and the number must have been linked for at least 24 hours, so a freshly stolen session cannot link a phone and immediately step up. Without a configured provider the guard stays closed and approvals remain blocked. A refreshed token's `iat` does not prove reauthentication and never substitutes for step-up.

New submitted listings remain private and pending review; this mode does not approve them automatically.

## Provider branding and release limits

[Neon's OAuth guide](https://neon.com/docs/auth/guides/setup-oauth) documents shared Google credentials for development/testing. The consent screen identifies Neon. Use the product's own Google OAuth credentials and branding before describing this as a production-owned sign-in application.

Local tests cover real Ed25519/JWKS verification, malicious claims and URL overrides, invitation policy, immutable identity binding, recycled-email rejection, quota failure, disabled email transport, and HTTP login integration. The PostgreSQL concurrency/migration suite requires `RUN_DB_SMOKE=1` and disposable database infrastructure. A successful local suite does not establish that a live Neon project, redirect configuration or Google consent flow has been verified; those require separate deployment acceptance.
