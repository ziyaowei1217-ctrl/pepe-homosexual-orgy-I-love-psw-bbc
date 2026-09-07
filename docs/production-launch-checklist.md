# Production launch checklist

The repository can verify the application and its PostgreSQL/MinIO journey locally. A public
deployment still requires operator-owned infrastructure and credentials. Never commit a populated
`.env` file.

## 1. Complete the four integrations

Follow [`external-integrations.md`](external-integrations.md) for the exact email, payment, map, and
message contracts. With the deployment variables loaded, run `pnpm production:check-config`; any
error blocks deployment.

## 2. Build-time web configuration

Copy `.env.production.example` into the deployment provider's secret/configuration system and replace the
example API and map hosts. `NEXT_PUBLIC_API_BASE_URL` must be the public HTTPS API URL ending in
`/api/v1`. Public map settings and the API URL are embedded in the browser bundle, so rebuild the web
application after changing them.

Compose separately supplies `API_INTERNAL_BASE_URL=http://api:4000/api/v1` to the web server at
runtime. Server-rendered pages use that container-network address; browsers use
`NEXT_PUBLIC_API_BASE_URL`. Other hosting platforms should set the server-only internal variable to
their reachable API address, or omit it when the public API URL is reachable from the web server.

## 3. API runtime configuration

Use `api/.env.production.example` as the production variable inventory. Leave secrets in the
deployment provider's secret manager rather than writing a populated file into the repository. For
production:

- set `NODE_ENV=production`;
- use a dedicated PostgreSQL database with TLS and backups;
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
production database.

## 4. Release gates

Start the local PostgreSQL and MinIO services, then run the complete gate from the repository root:

```bash
docker compose up -d db minio minio-init
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
