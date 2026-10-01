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
It refuses a non-loopback `DATABASE_URL` or production mode before starting services, so inherited
production configuration cannot accidentally receive demo seed data. Use the dedicated production
deployment process for remote databases.
Close the development processes with Ctrl+C and stop external services with `docker compose down`.
`docker compose down --volumes` deletes the database and uploaded images; use it only for an
intentionally disposable environment.

Alternatively, run `docker compose up -d`, then `docker compose exec api pnpm -C api seed:marketplace`.
These development services bind to loopback by default. PostgreSQL, Valkey, the MinIO console and
the optional database UI remain accessible only from the host. To open the database UI explicitly,
run `docker compose --profile admin up -d adminer` and visit `http://localhost:8080`.

## A phone on the same private network

Use a trusted private LAN for a temporary demo. Find the computer's LAN address and put the
following values in a temporary, uncommitted `.env.mobile` file, replacing the example address:

```dotenv
APP_BIND_HOST=0.0.0.0
NEXT_PUBLIC_API_BASE_URL=http://192.168.1.20:4000/api/v1
NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN=http://192.168.1.20:9000
LISTING_MEDIA_UPLOAD_ENDPOINT=http://192.168.1.20:9000
WEB_ORIGIN=http://192.168.1.20:3000
```

Start with `docker compose --env-file .env.mobile up -d` and open
`http://192.168.1.20:3000` on the phone. Permit ports 3000, 4000 and 9000 only on that private
network in the host firewall. Changing these URLs requires restarting the development containers.
This opt-in exposes the web app, API and browser upload endpoint; infrastructure management ports
keep their loopback bindings. Stop the stack when the demonstration ends. A shared or public demo
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

Newly finalized images are normalized before publication to remove EXIF/IPTC/XMP metadata and
preserve visible orientation. Existing uploaded objects are not rewritten. Before a public release,
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
