# Listing Media Metadata Design

## Summary

Activate the existing `ListingMedia` Prisma model by adding owner-managed listing media metadata. This slice lets listers attach categorized media URLs to draft or rejected listings, returns sorted media with owner/admin/detail listing reads, and keeps uploads/object storage out of scope.

## Confirmed Direction

- Continue backend-first launch hardening.
- Use the existing `ListingMedia` table instead of adding schema.
- Store media metadata only: URL, category/kind, and sort order.
- Keep listing ownership and review-state safeguards consistent with existing listing edits.
- Do not add real file uploads, S3/R2, image processing, or moderation providers in this slice.

## Goals

- `POST /api/v1/listings/:id/media` lets the listing owner add media metadata.
- Media creation is allowed only for listings in `DRAFT` or `REJECTED`.
- Non-owners receive `404 Not Found`, matching existing listing update behavior.
- `SUBMITTED` and `APPROVED` listings reject media creation with `400 Bad Request`.
- Media payloads reject malformed URLs, empty kinds, overlong kinds, extra fields, and invalid sort orders.
- `GET /api/v1/listings/:id` returns approved database listings with `media` sorted by `sortOrder` ascending.
- `GET /api/v1/listings/mine` returns owner listings with sorted `media`.
- `GET /api/v1/admin/listings/review-queue` returns submitted listings with sorted `media`.

## Architecture

Add a `CreateListingMediaDto` in `api/src/listings/dto.ts` with trimmed `url` and `kind` fields plus optional integer `sortOrder`. Add `ListingsService.addMedia(ownerId, listingId, dto)` that first loads the listing, enforces ownership and editable states, then creates a `listingMedia` row.

Update listing read queries that need media to use Prisma `include: { media: { orderBy: { sortOrder: "asc" } } }`. Public list discovery stays lightweight and does not include media in this slice.

## Data Flow

1. Authenticated owner posts media metadata to `/listings/:id/media`.
2. Controller validates the request body with an explicit `ValidationPipe`.
3. Service checks listing ownership and status.
4. Service creates the `ListingMedia` row.
5. Subsequent owner/detail/admin review reads include sorted media.

## Error Handling

- Missing listing or non-owner listing: `NotFoundException("Listing not found")`.
- Non-editable listing status: `BadRequestException("Listing cannot accept media in its current status")`.
- HTTP validation failures: Nest validation returns `400 Bad Request`.
- Prisma failures propagate through Nest's normal exception handling.

## Testing

Add service tests for owner creation, non-owner rejection, status rejection, and sorted media on reads. Add controller tests proving `addMedia()` delegates with current user identity. Add HTTP validation coverage for bad media payloads using the existing in-memory launch Prisma mock.

## Out Of Scope

- Binary uploads.
- External object storage.
- Moderation provider integration.
- Media delete/reorder endpoints.
- Including media in public listing discovery arrays.
- New Prisma migrations.

## Acceptance Criteria

- Focused listing media tests pass.
- Existing listing, launch readiness, auth, and validation tests pass.
- `npm run launch:check` from `api` passes.
- Real Postgres smoke passes when Docker Postgres is available.
