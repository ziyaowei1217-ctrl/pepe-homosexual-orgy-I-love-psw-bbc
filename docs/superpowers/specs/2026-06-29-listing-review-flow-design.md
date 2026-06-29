# Listing Review Flow Design

## Summary

Build the first production-shaped listing publication workflow for Sublet Pipeline. Listings should no longer become publicly visible immediately after creation. Owners create draft listings, submit them for review, and admins approve or reject them before they appear in public listing discovery.

This keeps the current NestJS and Prisma backend structure while adding a focused moderation layer that is small enough to test and ship in one backend slice.

## Confirmed Direction

- User chose the listing publication review flow as the next backend priority.
- Scope is a backend complete loop, not frontend UI.
- Use the existing NestJS, Prisma, PostgreSQL, JWT auth, and Vitest setup.
- Prefer adding review state to `Listing` directly instead of introducing a separate moderation queue table in this pass.
- Keep the design conservative: no full admin console, provider integrations, or multi-step compliance workflow yet.

## Product Behavior

### Owner Flow

Authenticated users can create listings as drafts. Draft listings are private to their owner and admins.

Owners can:

- Create a listing in `DRAFT`.
- Update listings they own while the listing is `DRAFT` or `REJECTED`.
- Submit a `DRAFT` or `REJECTED` listing for review.
- View all of their own listings, including non-public statuses.

Owners cannot:

- Edit listings owned by another user.
- Submit listings owned by another user.
- Directly publish a listing.
- Edit listings while they are `SUBMITTED` or `APPROVED`.

Rejected listings can be edited and resubmitted. Resubmitting clears the prior rejection reason and review metadata.

### Public Discovery

Public listing reads should only expose approved inventory:

- `GET /api/v1/listings` returns approved database listings.
- If the database has no approved listings, it can continue returning seed listings for demo continuity.
- `GET /api/v1/listings/:id` returns an approved database listing or an existing seed listing.
- Non-approved database listings should return `404` through public reads.

### Admin Review Flow

Admins can review submitted listings:

- View the submitted listing queue.
- Approve a submitted listing.
- Reject a submitted listing with a user-safe reason.

Admin actions should record:

- `reviewedAt`
- `reviewerId`
- `rejectionReason` for rejected listings

Only users with role `ADMIN` can use review endpoints. Non-admin users should receive `403 Forbidden`.

## Data Model

Add Prisma enum:

- `ListingStatus`: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`

Add fields to `Listing`:

- `status ListingStatus @default(DRAFT)`
- `submittedAt DateTime?`
- `reviewedAt DateTime?`
- `reviewerId String?`
- `rejectionReason String?`

Indexes:

- `@@index([status, createdAt])` for public listing and review queue reads.
- `@@index([ownerId, status, updatedAt])` for owner dashboards.

No separate review history table in this pass. Current state and last review metadata are enough for the first commercial backend slice.

## API Shape

Implementation note: static listing routes such as `/listings/mine` must be declared before `/:id` routes in the controller so NestJS does not treat `mine` as a listing id.

### Public Listings

`GET /api/v1/listings`

- No auth required.
- Returns approved listings only.
- Keeps seed fallback when no approved rows exist.

`GET /api/v1/listings/:id`

- No auth required.
- Returns the listing only if it is approved.
- Seed listings remain readable for demo IDs.
- Non-approved database listings return `404`.

### Owner Listings

`POST /api/v1/listings`

- Auth required.
- Creates a listing owned by the current user with `status: DRAFT`.
- Ignores any client-provided review status.

`GET /api/v1/listings/mine`

- Auth required.
- Returns all listings owned by the current user ordered by most recently updated.

`PATCH /api/v1/listings/:id`

- Auth required.
- Owner only.
- Allowed only when listing status is `DRAFT` or `REJECTED`.
- Updating a rejected listing should keep it `REJECTED` until the owner explicitly submits it again.

`POST /api/v1/listings/:id/submit`

- Auth required.
- Owner only.
- Allowed when listing status is `DRAFT` or `REJECTED`.
- Sets `status: SUBMITTED`, `submittedAt: now`, and clears `reviewedAt`, `reviewerId`, and `rejectionReason`.

### Admin Listings

Use an admin-scoped route under the existing API prefix:

`GET /api/v1/admin/listings/review-queue`

- Admin only.
- Returns `SUBMITTED` listings ordered by oldest submission first.

`POST /api/v1/admin/listings/:id/approve`

- Admin only.
- Allowed only when the listing is `SUBMITTED`.
- Sets `status: APPROVED`, `reviewedAt: now`, `reviewerId: admin user id`, and clears `rejectionReason`.

`POST /api/v1/admin/listings/:id/reject`

- Admin only.
- Allowed only when the listing is `SUBMITTED`.
- Requires `reason`.
- Sets `status: REJECTED`, `reviewedAt: now`, `reviewerId: admin user id`, and `rejectionReason: reason`.

## Authorization

Add a small `AdminGuard` or equivalent focused role check. The guard should reuse the authenticated request shape set by `AuthGuard`.

Recommended route pattern:

- Owner routes use `AuthGuard`.
- Admin routes use both `AuthGuard` and `AdminGuard`.

Service methods should still validate ownership and status because controller guards alone do not protect direct service usage in tests or future internal calls.

## Error Handling

- Unknown listing: `404 NotFoundException`.
- Non-owner trying to modify or submit a listing: `404 NotFoundException` to avoid leaking existence.
- Invalid owner status transition, such as editing `SUBMITTED`: `BadRequestException`.
- Non-admin review access: `403 ForbiddenException`.
- Admin reviewing a non-submitted listing: `BadRequestException`.
- Reject without a non-empty reason: `BadRequestException`.

## Testing

Add service-level Vitest coverage before implementation:

- Public `findAll()` returns only approved database listings.
- Public `findOne()` hides draft/submitted/rejected database listings.
- Creating a listing stores `DRAFT` regardless of client status.
- Owner can list all their listings with `findMine()`.
- Owner can update `DRAFT` and `REJECTED` listings.
- Owner cannot update `SUBMITTED` or `APPROVED` listings.
- Owner can submit `DRAFT` and `REJECTED` listings.
- Submit clears previous rejection metadata.
- Non-owner update and submit return `NotFoundException`.
- Admin queue returns only submitted listings.
- Admin approve and reject require admin role.
- Admin approve transitions submitted listing to approved.
- Admin reject requires reason and stores it.

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
npm run typecheck
npm run build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

## Out Of Scope

- Full review history table.
- Admin UI.
- Automated fraud, trust, or moderation providers.
- Image upload or media scanning.
- Payment, deposits, escrow, or application workflows.
- Owner notifications on approve/reject.

## Acceptance Criteria

- New listings start as drafts and are not public until approved.
- Public listing endpoints hide non-approved database listings.
- Owners can update and submit only their own eligible listings.
- Admin-only endpoints can view submitted listings and approve/reject them.
- Review metadata is recorded on approval/rejection.
- Service tests, typecheck, build, and Prisma validate pass.
