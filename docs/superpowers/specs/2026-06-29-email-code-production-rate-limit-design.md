# Email Code Production Rate Limit Design

## Summary

Productionize the email-code authentication flow without pulling in Redis, queues, or a specific email vendor yet. This slice adds a small email-sending abstraction, request cooldown, old-code invalidation, production fail-fast behavior, and focused Vitest coverage.

The goal is to make the existing NestJS auth flow safe to run in a real environment while preserving the developer-friendly local login path.

## Confirmed Direction

- User selected email-code productionization and rate limiting as the next backend priority.
- Use the existing NestJS, Prisma, PostgreSQL, and Vitest stack.
- Prefer a conservative database-backed implementation over Redis or queue infrastructure in this phase.
- Keep development behavior convenient: local runs can still return `devCode`.
- Keep production behavior strict: production never returns or logs verification codes and must not pretend an email was sent when no sender is configured.

## Scope

### Email Sender Abstraction

Add a focused email sender boundary used by `AuthService`:

- `EmailSender.sendVerificationCode(input)` sends a normalized email address and plaintext one-time code.
- A development implementation can log or no-op in local mode.
- A production implementation must require an explicit provider configuration before sending.

This sprint does not need to integrate a real vendor API. The important production contract is that the app has a clear boundary for a provider and fails fast when production is missing a concrete sender.

### Request Cooldown

Prevent one email from requesting unlimited active codes:

- Before creating a new code, check the most recent verification code for the normalized email.
- If it was created inside the cooldown window, reject the request.
- Default cooldown: 60 seconds.
- Return a user-safe error. The exact exception can be `BadRequestException` for this slice unless the project adds formal `429` throttling later.

The cooldown should be based on database state, not in-memory process state, so it works across local restarts and can be moved to a distributed limiter later.

### Old-Code Invalidation

When a new code is allowed:

- Mark all previous unconsumed codes for the email as consumed or otherwise invalid.
- Create one new `VerificationCode` record containing only `codeHash`, `attemptCount`, `expiresAt`, and metadata.
- Only the latest valid code should verify successfully.

This avoids multiple active login codes for the same email.

### Production Behavior

In production:

- `requestEmailCode()` must not return `devCode`.
- It must not log the plaintext code.
- It must call the configured `EmailSender`.
- If no production sender is configured, the request should fail clearly before a caller believes an email was sent.

Outside production:

- `requestEmailCode()` may return `devCode`.
- The development sender can be console-backed for local debugging.

### Configuration

Add a small helper or provider factory for email sender mode:

- `NODE_ENV=production` requires explicit email sender configuration.
- Development and test can use a local sender.
- `.env.example` should document the expected production email sender setting even if the vendor is not implemented yet.

Use simple environment names that do not lock the app into one vendor prematurely, for example:

- `EMAIL_SENDER=console` for development.
- `EMAIL_SENDER=external` for a concrete production sender registered by deployment code or a later vendor integration.
- `EMAIL_FROM` for future provider wiring.

If `NODE_ENV=production` and the app would fall back to the console sender, it must throw rather than silently continue.

## Out Of Scope

- Real SendGrid, Resend, SES, or Mailgun API integration.
- Redis, distributed token buckets, or queue-backed mail delivery.
- Captcha, device fingerprinting, IP-based abuse scoring, or full fraud controls.
- HTML email templates.
- Password login, social login, or magic-link login.

## Data Model

The existing `VerificationCode` model is sufficient for this slice:

- `email`
- `codeHash`
- `attemptCount`
- `expiresAt`
- `consumedAt`
- `createdAt`

No Prisma schema change is required unless implementation discovers a query that needs a new index. The current `[email, consumedAt, expiresAt]` index supports active-code lookup. Cooldown lookup can order by `createdAt` for one email; this is acceptable for the current scale.

## API Behavior

### `POST /api/v1/auth/email-code`

Input stays unchanged:

```json
{ "email": "student@northeastern.edu" }
```

Development response:

```json
{
  "email": "student@northeastern.edu",
  "expiresAt": "2026-06-29T10:10:00.000Z",
  "devCode": "123456"
}
```

Production response:

```json
{
  "email": "student@northeastern.edu",
  "expiresAt": "2026-06-29T10:10:00.000Z"
}
```

Cooldown response:

- Reject the request with a safe message such as `Please wait before requesting another code`.
- Do not reveal whether an email is registered because email-code login currently creates users on verification.

### `POST /api/v1/auth/verify-email`

Input stays unchanged:

```json
{ "email": "student@northeastern.edu", "code": "123456" }
```

Verification should continue to:

- Reject expired, consumed, invalid, or attempt-capped records.
- Increment attempt count on wrong codes.
- Upsert the user and return a JWT session on success.

## Testing

Add or extend Vitest service tests before implementation:

- Requesting a second code inside the cooldown window is rejected.
- Requesting a second code after cooldown invalidates the previous active code.
- The old code cannot verify after a newer code is issued.
- The newest code verifies and creates a session.
- Production mode does not return `devCode`.
- Production mode calls the configured email sender.
- Production mode fails when no production sender is configured.
- The stored code remains hashed and never equals the sent code.

Run these verification commands:

```bash
./node_modules/.bin/vitest run test/auth.service.spec.ts
npm run typecheck
npm run build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

## Acceptance Criteria

- Email-code requests are cooldown-limited per normalized email.
- A newly issued code invalidates older unconsumed codes for that email.
- Production never exposes plaintext codes in responses or logs.
- Production requires an explicit sender configuration and invokes the sender.
- Development login remains convenient through `devCode`.
- Auth tests, typecheck, build, and Prisma validate pass.
