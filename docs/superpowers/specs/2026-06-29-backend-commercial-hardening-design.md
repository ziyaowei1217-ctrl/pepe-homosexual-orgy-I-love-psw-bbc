# Backend Commercial Hardening Design

## Summary

Harden the NestJS API from alpha demo toward a commercial-ready backend baseline. This sprint covers authentication safety, production configuration, database migration delivery, API request hardening, and end-to-end coverage for the existing matching transaction loop.

## Confirmed Direction

The user approved continuing backend work toward commercial readiness. The highest-impact first slice is not payments or chat; it is making the current API safe enough to run in a real environment.

## Scope

### Authentication Safety

- Store email verification codes as hashes, not plaintext.
- Return `devCode` only outside production.
- Avoid logging verification codes in production.
- Track verification attempts and reject after a small limit.
- Prevent repeated email-code requests from creating unlimited active codes.

### Production Configuration

- Production must fail fast if `JWT_SECRET` is missing or still set to the development default.
- Development can continue using `dev-change-me` for local convenience.
- `.env.example` should make production requirements explicit.

### API Hardening

- Enable stricter validation with `forbidNonWhitelisted`.
- Add basic security headers without adding a new dependency in this sprint.
- Keep CORS origin explicit and configurable.

### Database Delivery

- Add a Prisma migration for the current schema so a new database can be provisioned repeatably.
- Keep Prisma validation in the final verification path.

### Backend Coverage

- Extend auth tests to cover hashed codes, attempt limits, and production-safe response behavior.
- Add an end-to-end style service/controller test for auth -> roommate like -> active deal room -> tour request.

## Out Of Scope

- Stripe, escrow, or payment processing.
- Real email provider integration.
- Redis or distributed rate limiting.
- Real-time chat.
- Full multi-user deal-room invitations.
- Admin review console.

## Acceptance Criteria

- Auth tests prove codes are not stored or returned unsafely in production mode.
- Production config throws when `JWT_SECRET` is missing or default.
- Prisma migration exists under `api/prisma/migrations`.
- API tests, typecheck, build, and Prisma validate pass.
