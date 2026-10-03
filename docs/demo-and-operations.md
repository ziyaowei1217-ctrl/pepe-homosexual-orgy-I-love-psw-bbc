# Demo setup and operational handoff

The current deliverable is a responsive web application. A browser can run it on a phone or
computer. The repository does not yet contain signed Apple/Android store packages or a WeChat
miniapp. Those are separate delivery targets; completing the web demo does not imply store approval.

## Local demonstration

Install Node.js 22 LTS or 24 LTS, the pinned pnpm version in `package.json`, and Docker Desktop
with Compose v2. On Linux, Docker Engine and the Compose v2 plugin are sufficient. Start Docker,
open a terminal in the extracted source directory, then run the same commands on macOS, Linux,
or Windows PowerShell:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev:local
```

If Corepack is unavailable, install the pnpm version listed in `package.json` using pnpm's official
installation instructions. The setup, release and API task runners use Node rather than POSIX
environment assignments. The database integration tests that directly invoke Docker/pnpm are
validated in Linux CI; the Docker development stack is also available on Windows with WSL2.

Open `http://localhost:3000`. Local setup waits up to 120 seconds for PostgreSQL and MinIO,
creates the private upload bucket, applies migrations and seeds the demo. Existing data is retained.
The first run also compiles the demo storage server/client and can take several minutes before
the health-check wait begins; later runs reuse Docker's build cache.
It refuses a non-loopback `DATABASE_URL` or production mode before starting services, so inherited
production configuration cannot accidentally receive demo seed data. Use the dedicated production
deployment process for remote databases.
Close the development processes with Ctrl+C and stop external services with `docker compose down`.
`docker compose down --volumes` deletes the database and uploaded images; use it only for an
intentionally disposable environment.

Alternatively, run `docker compose up -d --build`, then `docker compose exec api pnpm -C api seed:marketplace`.
These development services bind to loopback by default. PostgreSQL, Valkey, MinIO and
the optional database UI remain accessible only from the host. To open the database UI explicitly,
run `docker compose --profile admin up -d adminer` and visit `http://localhost:8080`.

### Demo storage maintenance limit

The official [MinIO community repository](https://github.com/minio/minio) is archived and describes
a source-only distribution; its former Docker Hub and Quay images were not publicly pullable during
the review. `Dockerfile.demo-storage` builds the official server's
[October 2025 security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z)
and the official [August 2025 client](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z)
from exact release commits, using a pinned supported Go compiler and image digests. Go verifies
module dependencies through its checksum database. The build requires internet access to the
official module proxy and Alpine package repositories; the resulting binary is built locally.

This preserves existing development data volumes and S3 contracts, but does not restore upstream
maintenance or certify every archived dependency. All final community releases have known high
severity vulnerabilities, including authentication bypasses. The local server and its console are
unconditionally bound to `127.0.0.1`, even when application LAN access is enabled. Use only controlled
synthetic data and stop the demo services afterward. Do not expose port 9000 through a tunnel, proxy,
port forwarding or a Compose override. Public or production deployments must use a maintained
private S3-compatible provider with TLS, restricted CORS and least-privilege credentials;
production Compose contains no demo storage server.

The four outstanding high severity official advisories are
[unsigned-trailer authentication bypass, CVE-2026-41145](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw),
[Snowball extraction authentication bypass, CVE-2026-40344](https://github.com/minio/minio/security/advisories/GHSA-9c4q-hq6p-c237),
[S3 Select memory exhaustion, CVE-2026-39414](https://github.com/minio/minio/security/advisories/GHSA-h749-fxx7-pwpg),
and [replication encryption-metadata injection, CVE-2026-34204](https://github.com/minio/minio/security/advisories/GHSA-3rh2-v3gr-35p9).
The October source pin fixes an earlier service-account/STS issue, but does not fix these 2026 issues.

## A phone on the same private network

Use a trusted private LAN for a temporary demo. Find the computer's LAN address and put the
following values in a temporary, uncommitted `.env.mobile` file, replacing the example address:

```dotenv
APP_BIND_HOST=0.0.0.0
NEXT_PUBLIC_API_BASE_URL=http://192.168.1.20:4000/api/v1
WEB_ORIGIN=http://192.168.1.20:3000
```

Start with `docker compose --env-file .env.mobile up -d --build` and open
`http://192.168.1.20:3000` on the phone. Permit ports 3000 and 4000 only on that private
network in the host firewall. Changing these URLs requires restarting the development containers.
This opt-in exposes the web app and API; all storage/database/cache/management ports remain on
loopback. The phone can browse listings and read existing images served through the API. Direct
uploads to the archived local storage server work only from the computer hosting the demo.
For the complete upload journey on a phone, configure a maintained private S3-compatible service:
set its HTTPS `LISTING_MEDIA_STORAGE_ENDPOINT`, browser-reachable `LISTING_MEDIA_UPLOAD_ENDPOINT`,
region/bucket/least-privilege credentials in the API environment, set
`NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` to the upload endpoint's exact origin, and restrict the storage
service's CORS policy to the demonstrated `WEB_ORIGIN`. Use a reviewed development Compose override
for these existing API storage settings; rebuild/restart the web and API to apply them. Do not
publish the archived server's port 9000 to make phone uploads work.
Stop the stack when the demonstration ends. A shared or public demo
must use HTTPS ingress and production credentials as described in the production checklist.

## Production release, recovery and monitoring

Use a TLS reverse proxy or managed HTTPS ingress. Production Compose publishes API/web ports only
on loopback by default. A proxy running in another container should join the application network
and address `api:4000` / `web:3000`, or use a deliberate Compose override. Configure forwarded
headers and `TRUSTED_PROXY_HOPS` together; do not trust client-supplied forwarding headers directly.

Production app containers run as the unprivileged Node user, with a read-only root filesystem,
all capabilities dropped, no privilege escalation, a process init and bounded logs. Only temporary
storage and the web image cache are writable. The 256 MiB image cache is discarded on restart;
an external image CDN/cache can absorb repeated image work at larger scale. Source secrets and
private-key files are excluded from Docker build contexts.

The PostgreSQL URL must include `sslmode=require&sslaccept=strict`, with the provider's CA configured
where required. Prisma 6 defaults to accepting invalid certificates without the explicit strict
setting; `verify-full` is not a supported Prisma 6 `sslmode`. See the
[Prisma 6 PostgreSQL connector documentation](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).
If a provider CA/client-certificate file is necessary, mount it read-only into both the migration
and API containers using a deployment override, and reference the mounted path in the database URL.
Private certificate/key files are excluded from the build context and must not be baked into images.

Set `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` to the exact origin of `LISTING_MEDIA_UPLOAD_ENDPOINT`,
including any non-default port. It is embedded in the web build and permits browser uploads in the
Content Security Policy. Restrict the storage provider's CORS policy to `WEB_ORIGIN`; keep the bucket
private and use a least-privilege object-storage account rather than a root management credential.

Newly finalized images are normalized before publication to remove EXIF/IPTC/XMP metadata,
preserve visible orientation and bound the longest edge to 2560 pixels without upscaling.
Existing uploaded objects are not rewritten and do not receive the new size bound. Before a public release,
inventory existing images, re-upload and review them, retire the old media IDs/object keys, and
invalidate downstream image/CDN caches. Verify the newly served bytes contain no such metadata.
Previously downloaded or immutable browser-cached originals cannot be remotely erased; review
visible image content for private details as well.

For each release:

1. Run `pnpm release:check` against disposable local services and require green CI. The workflow
   runs native macOS/Windows/Linux checks, database/storage/realtime journeys and Linux container
   startup with the production hardening controls. A configured workflow is not evidence that it
   has already passed on GitHub.
2. Record the source commit, migration inventory and immutable API/web image digests. `API_IMAGE`
   and `WEB_IMAGE` can identify release images in Compose. Keep the previous release images.
3. Back up PostgreSQL, verify point-in-time recovery, and retain/version the private uploaded
   objects. Test a restore into an isolated environment, including object references and account
   authorization. Protect backup credentials separately from application credentials.
4. Run the production configuration gate and deploy the migration job before application traffic.
   Serialize deployments to prevent concurrent migration/release jobs. Use additive schema changes
   while old application instances may still serve traffic.
5. Require `/api/v1/ready`, `/api/v1/health` and `/api/health` through the public ingress. Exercise
   authentication, upload, approved-listing rendering and a WebSocket reconnect from a phone and
   a computer. Check request latency, error rate, database pool pressure and upload latency.

Use process liveness for restart decisions and readiness for traffic routing. Inspect the sanitized
readiness components as well as HTTP status: `local-fallback` indicates degraded shared rate limiting
or cross-instance messaging and needs an alert even if the database-backed API remains available.
Set latency/error thresholds and alert ownership before opening access. Do not log tokens, login
codes, payment credentials, private messages or raw provider errors.

For an application rollback, restore the previous immutable `API_IMAGE`/`WEB_IMAGE` values and
run Compose with `--no-build` after verifying compatibility with the current schema. Database
migrations do not have automatic rollback scripts; restoring an earlier application image does
not reverse a migration. For an incompatible schema change, use the documented recovery plan and
restore drill, with a conscious decision about writes since the backup. Never reset the production
database or delete volumes to resolve a deployment failure.

Make CI checks required in branch protection, enable repository secret scanning where available,
and review Dependabot updates. Actions are pinned to commit SHAs and receive read-only repository
access; pull-request verification receives no production secrets. Do not run unreviewed pull-request
code on hosts that contain production credentials.

## Later mobile delivery

An Apple or Android distribution can reuse the current API contracts and account authorization
while introducing a separately tested native client or web wrapper. A WeChat miniapp requires its
own client, domain allowlists and platform authentication/session handling. Before selecting an
approach, validate the store/platform requirements and test uploads, reconnects, safe-area insets,
keyboard handling, deep links and token storage on real devices. Keep provider credentials and
authorization decisions in the API. No store package or new client functionality was introduced
as part of this hardening pass.
