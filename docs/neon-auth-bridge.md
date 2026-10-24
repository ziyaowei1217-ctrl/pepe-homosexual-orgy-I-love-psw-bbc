# Optional Neon identity bridge

This mode connects real managed Neon Auth identities to the existing application accounts and shared database. It does not create browser-local test users or synthetic conversations.

## Explicit deployment configuration

The default is `AUTH_PROVIDER=email`; existing email OTP and invitation policy remain unchanged. To opt in, configure:

- Backend `AUTH_PROVIDER=neon` and `NEON_AUTH_BASE_URL` from the selected managed Neon Auth project/branch.
- Optional `NEON_AUTH_JWKS_URL`, which must exactly equal the configured base URL plus `/.well-known/jwks.json`.
- `PUBLIC_BETA_SIGNUP=true` only when new verified users should be admitted without an existing invitation. Otherwise an existing account or an active invitation is required.
- Frontend `NEXT_PUBLIC_AUTH_PROVIDER=neon` and its separately validated server-side provider configuration.

The backend accepts only HTTPS managed `ep-*.neonauth.[c-<cluster>.]<region>.aws.neon.tech/<database>/auth` (an optional numeric cluster label, such as `c-6`) endpoints. Client requests cannot supply an issuer, audience, key endpoint, role or signup policy. JWT, auth hashing, verified database TLS and distributed quota infrastructure remain mandatory in production. No development-mode authentication fallback is enabled.

Apply the additive `ExternalAuthIdentity` migration before enabling the bridge. Its two unique constraints bind one provider issuer/subject to one local user and prevent a different subject from claiming an already bound user's recycled email address. A changed provider email does not remap an existing subject to another application account; it requires an operator-supported account recovery process.

## Protocol and session behavior

Google returns through the fixed first-party `/api/auth/complete` callback. The state-bound verifier is exchanged by the real Neon server toolkit; secure, HttpOnly, host-only cookies are preserved individually. The completion redirect uses the explicit non-secret query `flow=google` so a hosting redirect layer cannot inherit the incoming verifier. This marker never authenticates a request. The browser still requires its one-time, ten-minute tab intent and unchanged application account.

Token retrieval uses an uncached, same-origin, cookie-authenticated `GET /api/auth/token`, with redirects refused, a 15-second whole-response deadline and a 16 KiB streamed body limit. The installed Neon SDK 0.7.0-beta shares its `/token` hook with the `get-session` cache, which can otherwise return account/session data instead of a JWT. A regression exercises that behavior using the real installed SDK. Opaque session cookies and cached account data are never accepted as JWT substitutes. Completion errors use fixed messages that distinguish tab intent, account changes, transport and provider/application verification without exposing raw errors or tokens.

The frontend sends a managed Neon access JWT to `POST /api/v1/auth/neon/exchange` as `{ "token": "..." }`. The backend verifies its signature using bounded, cached public-key retrieval from the configured project only. It requires EdDSA/Ed25519, a known key ID, exact issuer and audience equal to the Auth URL origin, required current `iat`/`exp` claims with a maximum 15-minute token lifetime, a stable nonempty subject, and boolean `emailVerified: true`. Explicit bans and inconsistent user IDs are rejected.

The issuer/audience use the origin; the JWKS URL retains the full `/database/auth` path. This distinction follows [Neon's JWT documentation](https://neon.com/docs/auth/guides/plugins/jwt). Key downloads have a two-second transport timeout and 128 KiB response limit; redirects, private keys and unexpected key types fail closed. Key rotation uses the library's cache and cooldown rather than an endpoint from the token header.

The public exchange is limited by distributed IP/device/global quotas before verification. A second distributed issuer/subject quota runs after verification and before database writes. Quota outages fail closed.

Identity binding, invitation claiming, local account creation and initial profile creation run in one transaction with subject/email locks and uniqueness constraints. New accounts always receive local role `USER`. Existing local roles are reloaded and preserved. Provider `role` and administrator step-up claims are never copied. Email verification does not mark education or phone verification complete.

Successful exchange returns the existing login response shape and a separately issued HS256 application session valid for one hour. This session can outlive the provider's 15-minute access JWT; upstream logout/revocation is not immediate application-session revocation. Existing socket authentication disconnects at the application token's expiry. The frontend must clear the app session and disconnect sockets on local logout.

The managed JWT describes a verified Neon identity; it does not identify the original social provider. The demo frontend offers Google sign-in. Operators must manage which methods are enabled in Neon rather than treating an unverified frontend provider label as proof.

## Staff moderation remains protected

In Neon mode, all email-code and email administrator step-up routes return unavailable, and creating the application does not require a Resend transport. This is a disabled transport, never a successful fake email delivery.

A Neon sign-in does not assert `adminReauthenticatedAt`. Existing administrators may read queues where their database role permits it, but listing approval/rejection and other protected writes still require the existing administrator step-up guard. Those writes remain blocked. The existing operator CLIs manage invitations and administrator roles; there is no listing-review CLI.

New submitted listings remain private and pending review; this mode does not approve them automatically. Staff can inspect queues, but approvals require a separately implemented, verified step-up path. A future option is an explicitly configured real email step-up transport alongside customer Google sign-in. Another option requires a provider-supported fresh reauthentication proof. A refreshed token's `iat` does not prove that the administrator reauthenticated and must not substitute for step-up.

## Provider branding and release limits

[Neon's OAuth guide](https://neon.com/docs/auth/guides/setup-oauth) documents shared Google credentials for development/testing. The consent screen identifies Neon. Use the product's own Google OAuth credentials and branding before describing this as a production-owned sign-in application.

Local tests cover real Ed25519/JWKS verification, malicious claims and URL overrides, invitation policy, immutable identity binding, recycled-email rejection, quota failure, disabled email transport, and HTTP login integration. The PostgreSQL concurrency/migration suite requires `RUN_DB_SMOKE=1` and disposable database infrastructure. A successful local suite does not establish that a live Neon project, redirect configuration or Google consent flow has been verified; those require separate deployment acceptance.
