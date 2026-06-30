# Auth Input Contract Hardening Design

## Summary

Harden authentication HTTP input validation so malformed email and verification-code payloads are rejected before they reach auth service logic. Listing endpoints already use explicit body validation pipes; auth endpoints should follow the same pattern.

## Confirmed Direction

- Continue backend launch hardening on the existing branch.
- Scope is backend-only.
- Keep the current email-code login flow.
- Avoid adding new auth domains such as passwords, refresh tokens, or session tables.

## Recommended Approach

Use explicit route-level `ValidationPipe` instances for `EmailCodeDto` and `VerifyEmailDto`, with `expectedType` set. Add DTO transforms and constraints so emails are trimmed before validation and verification codes must be exactly six digits.

Keep service-level normalization in place. Add a service-level malformed-code guard so direct service calls do not consume verification attempts for inputs that are not six-digit codes.

## Goals

- `POST /auth/email-code` rejects invalid emails and extra fields with 400.
- `POST /auth/verify-email` rejects invalid emails, non-numeric codes, overlong codes, underlength codes, and extra fields with 400.
- Email and code inputs are trimmed before validation.
- Malformed verification codes do not increment `attemptCount`.
- Existing valid auth flows remain unchanged.

## Tests

Add HTTP e2e tests proving:

- Invalid email-code payloads return 400.
- Extra email-code fields return 400.
- Invalid verify-email code formats return 400.
- A malformed code attempt does not prevent the next valid code from succeeding.

Add service tests proving:

- Direct malformed code verification rejects with `BadRequestException`.
- Direct malformed code verification does not increment the stored code attempt count.

## Out Of Scope

- Rate-limit redesign.
- CAPTCHA or abuse scoring.
- Refresh tokens.
- Session revocation.
- Email provider integration.

## Acceptance Criteria

- Auth HTTP validation tests pass.
- Existing auth service tests pass.
- Existing launch-readiness flow passes.
- `npm run launch:check` from `api` passes.
- Real Postgres smoke passes when Docker Postgres is available.
