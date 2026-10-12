# Release validation

Use Node 22 and the repository's pinned pnpm version. `pnpm release:check` now rejects absent infrastructure configuration before executing any gates. It runs web checks, API checks/build, then discovers and activates all infrastructure-gated API test files. A selected test that remains skipped fails the release gate. GC's separate child-process wrapper is part of the default API suite.

Start the dedicated disposable services with `docker compose -f compose.test.yml up -d --wait`. Then run `docker compose -f compose.test.yml run --rm minio-init` to provision the private test bucket. These use separate container names, loopback ports and temporary storage; never point them at a production database. Export these test-only values:

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
