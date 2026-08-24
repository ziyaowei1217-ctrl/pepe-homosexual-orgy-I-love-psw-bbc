# Production launch checklist

The repository can verify the application and its PostgreSQL/MinIO journey locally. A public
deployment still requires operator-owned infrastructure and credentials. Never commit a populated
`.env` file.

## 1. Build-time web configuration

Copy `.env.example` into the deployment provider's secret/configuration system and replace the
example API host. `NEXT_PUBLIC_API_BASE_URL` must be the public HTTPS API URL ending in `/api/v1`.
Because this value is embedded in the browser bundle, rebuild the web application after changing it.

## 2. API runtime configuration

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
- configure `VALKEY_URL` when running more than one API instance so realtime delivery and rate
  limiting are shared.

Apply checked-in migrations with `pnpm -C api prisma migrate deploy`; do not use `db push` against a
production database.

## 3. Release gates

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
```

## 4. Operator-owned gates

Before opening access, the operator must also:

- verify database point-in-time recovery and perform a restore drill;
- configure centralized logs, uptime/error alerts, and secret rotation ownership;
- create the first administrator and beta invitations through the audited CLI commands;
- verify email delivery, CORS, image upload, and image retrieval on the public domains;
- publish counsel-reviewed privacy, service, moderation, refund, and data-retention policies.

The current payment flow is an explicit simulation. It must remain labeled as such and must not
collect payment credentials. Real-money launch requires a separate payment-provider, refund,
identity, tax, and regulatory project.
