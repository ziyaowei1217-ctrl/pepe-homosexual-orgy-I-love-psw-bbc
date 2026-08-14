# MinIO Listing Media Lifecycle Design

**Date:** 2026-08-14
**Status:** Approved for implementation planning

## Goal

Replace the host publish wizard's image-URL entry with a persistent, recoverable image-upload workflow backed by MinIO. A host can select or drop files, upload them directly with short-lived presigned URLs, finalize server-verified objects, reorder them, choose the first image as cover, remove images, and recover the saved state after refresh.

The completed slice must be independently demonstrable from draft creation through approved public image delivery. It must not expose MinIO object keys, endpoints, credentials, raw storage errors, or privileged draft media to unauthorized users.

## Current State

The canonical `ListingMedia` model already contains object-storage, review, ordering, and publication fields, but the application uses only `url`, `kind`, and `sortOrder`. The current API creates URL-backed rows through `POST /listings/:id/media`, and the publish wizard asks the host to type image URLs. `Listing.image` is client supplied. Docker Compose does not start MinIO, and the API has no object-storage boundary.

The implementation will preserve approved seed listings and existing public URL images while making MinIO uploads mandatory for new editable drafts that proceed to submission.

## Product Boundaries

This slice includes:

- JPEG, PNG, and WebP image uploads;
- 10 MB per image and 12 images per listing;
- drag-and-drop and file selection;
- local previews and per-image upload progress;
- upload retry, refresh recovery, ordering, cover selection, and deletion;
- owner-only draft media reads;
- published public image delivery through the API;
- Docker-backed MinIO development and integration coverage.

This slice does not include:

- thumbnails, resizing, compression, or format conversion;
- automated moderation, malware scanning, or EXIF processing;
- background orphan cleanup or scheduled upload expiry processing;
- CDN integration;
- editing media on submitted or approved listings;
- importing arbitrary remote image URLs into MinIO.

## Architecture

### Backend boundaries

Add a focused listing-media unit instead of expanding `ListingsService`:

1. `ListingMediaService` owns authorization, listing-state checks, media state transitions, ordering, cover selection, deletion, and listing submission requirements.
2. `ObjectStorage` is a narrow interface for presigning PUTs, reading object metadata and content, deleting objects, and streaming objects for delivery.
3. `MinioObjectStorage` implements that interface with the official MinIO Node SDK.
4. A fake object-storage implementation keeps service and HTTP tests deterministic.
5. `ListingMediaController` exposes owned-listing commands and the stable content-delivery boundary.

`ListingsService` continues to own the listing lifecycle. It delegates media submission validation and publication to `ListingMediaService` so media rules have one source of truth.

### Storage topology

Use one private MinIO bucket. Browser uploads use a presigner configured with the externally reachable upload endpoint, while server reads, validation, deletion, and delivery use the Docker-network endpoint. Separating these endpoints avoids producing URLs containing the unreachable `minio` container hostname.

Local configuration uses:

- `MINIO_INTERNAL_ENDPOINT=http://minio:9000` for API operations;
- `MINIO_UPLOAD_ENDPOINT=http://localhost:9000` for browser PUT URLs;
- `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` for the local development account;
- `MINIO_BUCKET=sublet-listing-media`;
- `PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` for stable public media responses.

Docker Compose adds MinIO plus an initialization service that creates the private bucket and applies CORS allowing PUT from the configured Web origin. Production provisioning remains an operational responsibility; the API fails safely if its configured bucket is absent.

## Data Model And Compatibility

Reuse the existing `ListingMedia` fields:

- `originalKey` stores the server-generated object key;
- `mimeType`, `sizeBytes`, and `checksum` store verified values;
- `uploadExpiresAt` records the presigned PUT expiry;
- `storageStatus` moves through `PENDING`, `READY`, `PUBLISHED`, or `FAILED`;
- `reviewStatus` remains `PENDING` until listing approval, then becomes `APPROVED`;
- `finalizedAt` and `publishedAt` record successful transitions;
- `sortOrder` is a dense zero-based ordering within the listing.

Add a nullable canonical cover-media reference to `Listing`, backed by a foreign key that becomes null when the referenced media is deleted. The first ordered media item becomes `coverMediaId`. Public listing presenters derive the existing `image` response field from the stable API delivery URL for that media. Environment-specific absolute URLs are never stored in PostgreSQL. Legacy listings without a cover-media reference continue to return their existing `Listing.image` value.

New listing create and update DTOs no longer accept `image`. New drafts store an empty compatibility value until media exists. Existing approved URL-backed rows remain visible, but URL-only media cannot satisfy the submission requirement for a newly edited draft.

No migration attempts to fetch third-party image URLs or manufacture MinIO objects.

## Media State Machine

The normal path is:

```text
PENDING -> READY -> PUBLISHED
       \-> FAILED
```

- Initialization creates `PENDING`.
- A successful finalize changes `PENDING` to `READY`.
- A validation or storage-integrity failure changes `PENDING` to `FAILED` and removes the invalid object when possible.
- Listing approval changes every ordered `READY` row to `PUBLISHED` and sets `reviewStatus=APPROVED` in the same database transaction as the listing approval.
- `READY` and `PUBLISHED` finalize retries return the current representation without duplicating state.
- `FAILED` cannot be finalized again. The host must retry with a new initialization, or reselect the file after refresh.

An expired presigned URL does not itself mutate the row. The owner media response presents an expired `PENDING` row as retryable. The host may remove it or initialize a replacement. A later finalize may succeed if the object exists and passes validation, even when the PUT URL has since expired.

## Upload Validation

An initialization request includes the display category, original filename, declared MIME type, and declared byte size. The original filename is used only for client feedback and validation; it is not persisted in the object key.

Initialization requires:

- MIME type `image/jpeg`, `image/png`, or `image/webp`;
- declared size from 1 byte through 10 MB;
- a host-owned listing in `DRAFT` or `REJECTED`;
- fewer than 12 current media rows for the listing;
- a publish-capable host profile.

The object key uses the listing ID plus a server-generated random identifier and a type-derived extension. It never contains user-controlled path segments or the original filename. The presigned PUT expires after 10 minutes and binds the allowed content type.

Finalize streams at most 10 MB plus one byte from MinIO while computing SHA-256 and reading the file signature. It requires agreement between the declared type, stored object metadata, and magic bytes. Oversized, empty, truncated, or mismatched objects fail safely. The client cannot supply verified size, checksum, storage status, finalization timestamps, or object keys.

## API

All owned-listing routes require authentication. Non-owners receive the same 404 response as missing resources.

```text
POST   /listings/:id/media/uploads
POST   /listings/:id/media/:mediaId/finalize
GET    /listings/:id/media
PATCH  /listings/:id/media/order
DELETE /listings/:id/media/:mediaId
GET    /listing-media/:mediaId/content
```

### Initialize

`POST /listings/:id/media/uploads` accepts:

```json
{
  "filename": "bedroom.webp",
  "mimeType": "image/webp",
  "sizeBytes": 842116,
  "kind": "卧室"
}
```

It returns the safe media representation plus `uploadUrl`, `uploadExpiresAt`, and the exact PUT headers. No storage key appears in the response.

### Finalize

`POST /listings/:id/media/:mediaId/finalize` accepts no storage metadata. The API reads the object, validates it, and returns the resulting media representation. The operation is idempotent for an already `READY` item.

### Owner list

`GET /listings/:id/media` returns safe state, ordering, category, verified metadata, and timestamps. A content URL is present only for `READY` media. Draft content requires an authenticated fetch, so the frontend converts the response to a local Blob URL for display. `PENDING` and `FAILED` rows never expose unverified stored bytes.

### Ordering and cover

`PATCH /listings/:id/media/order` accepts the complete ordered list of current media IDs. It rejects duplicates, omissions, foreign IDs, or stale listing state. A transaction rewrites dense `sortOrder` values and updates `coverMediaId` to the first `READY` item. Submission later guarantees that every remaining item is `READY`.

### Deletion

Deletion is available only for editable listings. The service removes the object first and then the database row. A missing object is treated as already removed. If the database delete fails after object removal, a retry completes the stale-row cleanup. Deleting the cover recomputes the cover from the remaining ordered `READY` rows.

### Content delivery

`GET /listing-media/:mediaId/content` streams bytes from MinIO without redirecting to a storage URL.

- `PUBLISHED` media are public and use immutable cache headers plus a checksum ETag.
- `READY` media require an authenticated listing owner and use private, no-store headers.
- `PENDING` and `FAILED` media have no content response because their bytes are unverified or absent.
- Missing, rejected, foreign, or otherwise inaccessible media return a safe 404.

## Listing Lifecycle Integration

Submitting a `DRAFT` or `REJECTED` listing requires:

- at least one MinIO-backed `READY` media row;
- no `PENDING` or `FAILED` media rows;
- a valid cover selected from the ordered `READY` set.

Approval publishes the media and listing atomically. Rejection leaves finalized media in `READY` with `reviewStatus=PENDING`, allowing the owner to reorder, delete, or replace them before resubmission. Submitted and approved media are locked.

The old `POST /listings/:id/media` URL route is retired after the frontend moves to the new contract. Requests receive a stable retired-capability response rather than silently creating URL media.

## Frontend Experience

Extract `ListingMediaUploader` from `components/sublet-app.tsx`. It owns only media selection, upload state, preview URLs, progress, retry, ordering, and deletion. The existing publish orchestration consumes its server-backed result instead of owning upload details.

Each selected file moves through:

```text
queued -> uploading -> finalizing -> ready
                              \-> failed
```

The browser uses `XMLHttpRequest` for the presigned PUT so each image can report actual upload progress. Initialization and finalize use the existing authenticated API client. At most three files upload concurrently, so one failure does not cancel successful items or create an unbounded request burst.

The component supports:

- drag-and-drop and native file selection;
- immediate local object-URL previews;
- category selection;
- individual progress and safe Chinese status copy;
- in-session retry with the retained `File` object;
- refresh recovery from the owner media endpoint;
- `重新选择文件` when a failed or expired row has no local `File`;
- reorder controls with the first item labelled as cover;
- deletion confirmation and pending-button protection.

The publish wizard blocks advancement from the media step while uploads are pending or failed. It never reports a file as saved before finalize succeeds.

## Error Handling And Concurrency

Stable product errors include:

- invalid or mismatched type: HTTP 415;
- declared or actual object too large: HTTP 413;
- image limit, stale order, or locked listing state: HTTP 409;
- malformed request fields: HTTP 400;
- MinIO unavailable or timed out: HTTP 503;
- inaccessible listing or media: HTTP 404.

Responses contain safe Chinese product messages and stable codes. They do not contain caught SDK errors, bucket names, endpoints, keys, credentials, signatures, or database messages.

Every mutation re-reads ownership and current listing status. Finalize uses a conditional `PENDING` update after validation so overlapping requests cannot publish conflicting metadata. Ordering and cover selection are transactional. Approval conditionally transitions the listing from `SUBMITTED` and publishes its verified media within the same transaction.

MinIO operations cannot participate in a PostgreSQL transaction. The design therefore favors recoverable ordering:

- initialize creates the row only after presigning succeeds;
- invalid finalize removes the object best-effort and records `FAILED`;
- deletion removes storage before the row and treats an absent object idempotently;
- no database path claims `READY` unless object verification completed.

## Testing

### Unit and service tests

- MIME allowlist, declared size, image-count boundary, and generated-key safety;
- JPEG, PNG, and WebP magic-byte detection;
- empty, oversized, truncated, and mismatched object rejection;
- checksum calculation and safe response mapping;
- ownership hiding and editable-status enforcement;
- idempotent finalize and delete recovery;
- full-order validation, dense sorting, cover recomputation, and stale conflicts;
- submission rejection for zero, pending, failed, or URL-only media;
- approval publication and rejection preservation.

### HTTP tests

- authentication, DTO whitelist behavior, and server-owned-field rejection;
- safe 400, 404, 409, 413, 415, and 503 contracts;
- no object key, credential, or raw MinIO error in JSON responses;
- draft content private to the owner and published content public.

### Frontend tests

- multi-file state transitions and bounded concurrency;
- progress updates, successful finalize, and partial failure isolation;
- in-session retry and post-refresh reselect behavior;
- server-state recovery, ordering, cover indication, and deletion;
- wizard blocking for pending or failed media;
- removal of URL-entry copy and controls.

### Real MinIO coverage

An opt-in integration test uses PostgreSQL and MinIO to prove:

1. listing creation;
2. presigned PUT of a real valid image;
3. finalize and metadata verification;
4. order and cover persistence;
5. listing submission and administrator approval;
6. public delivery with matching bytes and MIME type;
7. rejection of a mismatched or oversized object.

The Docker smoke gate extends this to the running API boundary. The full release gate remains frontend lint, typecheck, tests, and production build; API tests, typecheck, and build; Prisma validation; and the opt-in PostgreSQL/MinIO smoke test.

## Success Criteria

The slice is complete when a host can create a draft without an image URL, upload one or more supported files directly to MinIO, recover and manage their finalized order after refresh, submit the listing only when media is valid, and see the approved listing load its cover through the API media boundary. Every unauthorized, invalid, stale, and unavailable-storage path must fail without leaking storage details or manufacturing successful state.
