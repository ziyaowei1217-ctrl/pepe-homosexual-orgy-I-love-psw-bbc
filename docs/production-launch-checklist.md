# Production launch checklist

The repository can verify the application and its PostgreSQL/MinIO journey locally. Public
deployment still requires operator-owned infrastructure and credentials. Never commit a populated
`.env` file.

Public deployment must use a maintained private S3-compatible service. The archived source-built local
MinIO server has known high severity upstream advisories and is restricted to loopback synthetic
demos; it is not a production storage option. See [the storage maintenance limit](demo-and-operations.md#demo-storage-maintenance-limit).

## 1. Complete the four integrations

Follow [`external-integrations.md`](external-integrations.md) for the exact email, payment, map, and
message contracts. With the deployment variables loaded, run `pnpm production:check-config`; any
error blocks deployment.

## 2. Build-time web configuration

Copy `.env.production.example` into the deployment provider's secret/configuration system and replace the
example API and map hosts. `NEXT_PUBLIC_API_BASE_URL` must be the public HTTPS API URL ending in
`/api/v1`. Public map settings and the API URL are embedded in the browser bundle, so rebuild the web
application after changing them.

Set `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` to the HTTPS origin of `LISTING_MEDIA_UPLOAD_ENDPOINT`.
The production gate checks that they match so the browser Content Security Policy permits
presigned uploads. Private provider credentials must never be a `NEXT_PUBLIC_*` value; any public
map token embedded in the tile URL must be restricted appropriately by the map provider.

Compose separately supplies `API_INTERNAL_BASE_URL=http://api:4000/api/v1` to the web server at
runtime. Server-rendered pages use that container-network address; browsers use
`NEXT_PUBLIC_API_BASE_URL`. Other hosting platforms should set the server-only internal variable to
their reachable API address, or omit it when the public API URL is reachable from the web server.

## 3. API runtime configuration

Use `api/.env.production.example` as the production variable inventory. Leave secrets in the
deployment provider's secret manager rather than writing a populated file into the repository. For
production:

- set `NODE_ENV=production`;
- use a dedicated PostgreSQL database with verified TLS and backups. Set exactly one each of
  `sslmode=require`, `sslaccept=strict`, `connect_timeout=2`, `pool_timeout=2`, and `socket_timeout=3`
  in `DATABASE_URL`. Optional supported keys are `schema` (a literal nonempty identifier) and
  `connection_limit` (1–10). Unknown/duplicate settings, SSL aliases/certificate overrides, and
  arbitrary `options` fail the gate. The API uses the official Prisma 6 PostgreSQL adapter with
  two-second connection/acquisition and three-second actual socket-close query deadlines, strict
  platform CA-chain verification, and exact URL-host identity. The provider certificate must chain
  to the platform trust store; private CA/client-certificate support requires a reviewed extension.
  Native `socket_timeout` alone is not proof of accepted query cancellation;
- generate distinct high-entropy values for `JWT_SECRET`, `OTP_HASH_SECRET`, and
  `SECURITY_IDENTIFIER_HASH_SECRET`;
- set `EMAIL_SENDER=resend`, a verified `EMAIL_FROM`, and a valid `RESEND_API_KEY`;
- set `WEB_ORIGIN` to the exact public web origin and configure `TRUSTED_PROXY_HOPS` for the chosen
  ingress;
- set every `LISTING_MEDIA_*` value to private S3-compatible storage. The upload endpoint must be
  public HTTPS and the bucket must not allow anonymous reads;
- keep `LOCAL_ADMIN_EMAILS` empty. Create production administrators with the audited
  `pnpm -C api admin:roles` command;
- set `VALKEY_URL` to a TLS `rediss://` endpoint. Production startup requires it so realtime delivery
  and rate limiting work across instances.

Apply checked-in migrations with `pnpm -C api prisma migrate deploy`; do not use `db push` against a
production database. The migration CLI uses a separate native schema engine rather than the
application's bounded driver. Configure reviewed finite server statement/lock and process deadlines,
monitor cancellation, and confirm migration success; do not weaken app deadlines for a long migration.

## 4. Release gates

Start the local PostgreSQL and MinIO services, then run the complete gate from the repository root:

```bash
docker compose up -d --build db minio minio-init
pnpm release:check
```

The command runs the web lint/type/test/build checks, all API tests/type/build/schema checks, and the
isolated PostgreSQL/MinIO marketplace journey. A non-zero result blocks release.

After deployment, require both endpoints to succeed through the public HTTPS ingress:

```text
GET /api/v1/health
GET /api/v1/ready
GET /api/health
```

The production containers are defined in `compose.production.yml`. Create a populated
`api/.env.production` and a root `.env.production` from the corresponding examples, then check and deploy with:

```bash
pnpm production:check-config --compose --env-file .env.production
docker compose --env-file .env.production -f compose.production.yml up --build -d --wait
```

The `--compose` check validates the effective API environment and web build arguments resolved by
the same Compose configuration used to deploy. This avoids ambient API secrets masking blank values
in the API env file. For other hosting providers, the original file-based check accepts repeated
`--env-file` arguments as dotenv data, with existing process environment taking precedence. Do not
copy the local-development `.env.example` for a production deployment.

The migration job must finish successfully before the API starts, and the API must become ready
before the web container starts.

Production host bindings default to `127.0.0.1`; use HTTPS ingress in front of the application.
Containers drop all capabilities, prevent privilege escalation and mount their root filesystem
read-only, with bounded temporary storage and an ephemeral web image cache. See
[`demo-and-operations.md`](demo-and-operations.md) for proxy/network setup, immutable image
references, database/object recovery, readiness alerts and schema-aware rollback.

## 5. Operator-owned gates

Before opening access, the operator must also:

- verify database point-in-time recovery and perform a restore drill;
- configure centralized logs, uptime/error alerts, and secret rotation ownership;
- create the first administrator and beta invitations through the audited CLI commands;
- verify email delivery, CORS, image upload/retrieval, map tiles, payment idempotency, and WebSocket
  reconnects on the public domains;
- publish counsel-reviewed privacy, service, moderation, refund, and data-retention policies.

The demo payment module remains available for local development and automated tests, but production
does not mount it. Production refuses to start without the HTTPS payment adapter settings. The
operator is still responsible for provider onboarding, refund policy, identity, tax, and regulatory
requirements applicable to the chosen markets.
