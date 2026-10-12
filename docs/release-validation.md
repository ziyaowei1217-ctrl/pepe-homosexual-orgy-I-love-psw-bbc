# Release validation

Use Node 22 and the repository's pinned pnpm version. `pnpm release:check` now rejects absent infrastructure configuration before executing any gates. It runs web checks, API checks/build, then discovers and activates all infrastructure-gated API test files. A selected test that remains skipped fails the release gate. GC's separate child-process wrapper is part of the default API suite.

Build the dedicated storage images first with `docker compose -f compose.test.yml build --pull minio minio-init`. Start the dedicated disposable services with `docker compose -f compose.test.yml up -d --wait`. Then run `docker compose -f compose.test.yml run --rm minio-init` to provision the private test bucket. These use separate container names, loopback ports and temporary storage; never point them at a production database. Export these test-only values:

```sh
export DATABASE_URL='postgresql://sublet:release-test-only@localhost:15432/release_test?schema=public'
export TEST_DATABASE_URL='postgresql://sublet:release-test-only@localhost:15432/postgres?schema=public'
export TEST_DATABASE_CONTAINER='sublet-release-test-postgres'
export VALKEY_URL='redis://localhost:16379'
export LISTING_MEDIA_STORAGE_ENDPOINT='http://localhost:19000'
export LISTING_MEDIA_UPLOAD_ENDPOINT='http://localhost:19000'
export LISTING_MEDIA_STORAGE_REGION='us-east-1'
export LISTING_MEDIA_STORAGE_BUCKET='release-test-media'
export LISTING_MEDIA_STORAGE_ACCESS_KEY_ID='release-test'
export LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY='release-test-only'
pnpm install --frozen-lockfile
pnpm -C api prisma migrate deploy
pnpm release:check
docker compose -f compose.test.yml down -v
```

The GitHub workflow performs this sequence, the production dependency audit and Docker builds for pushes to main and pull requests. Before building, it creates short-lived random authentication keys and fictional HTTPS service URLs, resolves `compose.production.yml`, and runs the production configuration checker against the effective API environment and all three public web build arguments. The files are mode `0600` and removed at the end of the step. This is a configuration-contract test: it does not connect to a database, cache, storage, email or payment provider and is not production credential or provider acceptance.

The web image build receives the same three synthetic public values explicitly through Docker build arguments. Production provider contracts, real email delivery, deployed HTTPS, long-duration capacity tests and the full ASVS/WCAG assessment require additional evidence. Passing this workflow alone does not certify those requirements.

## Test object-storage source builds

The previous official `minio/minio` and `minio/mc` container tags became unavailable to clean CI runners. `Dockerfile.minio` therefore builds the same server and client releases directly from official GitHub source. Both test and development Compose use its `server` / `client` targets; they do not pull a replacement third-party MinIO image.

| Component | Release | Official commit | Source archive SHA-256 |
| --- | --- | --- | --- |
| MinIO server | RELEASE.2025-09-07T16-13-09Z | 07c3a429bfed433e49018cb0f78a52145d4bedeb | 8819e3e7817e46b7b3798f8f200ead208562e571563c2e040352378031abe9f2 |
| MinIO client | RELEASE.2025-08-13T08-35-41Z | 7394ce0dd2a80935aded936b09fa12cbb3cb8096 | 95cd293c7119f16921a6dc515a1fb74a2227f19fd994b9c8b770a154e802ac44 |

The official Go and Alpine base images are pinned by multi-platform manifest digest. Go 1.24.13 satisfies the server's Go 1.24 requirement and the client's Go 1.23 requirement; automatic toolchain replacement is disabled. Builds verify the source archive and upstream Go module checksums, use read-only module resolution, and retain the upstream LICENSE, NOTICE and CREDITS files in `/licenses`. An archive or checksum failure stops the build. Initializer commands remain chained with `&&`, so alias, bucket or access-policy failures fail CI. Runtime images contain curl for the existing health checks.

To verify without an existing build cache, run `docker compose -f compose.test.yml build --pull --no-cache minio minio-init` before starting services. These are local/test infrastructure builds, not a claim that the pinned upstream releases or an actual production object-storage deployment have passed a current vulnerability assessment. Changing the release requires updating the commit, archive digest and embedded version together.
