# Render deployment

The checked-in [`render.yaml`](../render.yaml) prepares the existing API and Next.js Docker images
for Render. It does not provision providers, contain credentials, or establish that a public demo
is ready. Reviewed against official documentation on **2026-10-01**; validate again before creating
resources. Creating a Blueprint starts paid provisioning and can start deployment.

Preparation validation: YAML parsing and validation against Render's published JSON Schema passed
on the review date; whitespace checks also passed. No Render resources, Docker containers, real
provider connections, migrations, or public acceptance runs were executed for this preparation.

A complete public synthetic demo uses `NODE_ENV=production` and the same security gates as the
eventual live service. Production excludes the repository's demo payment controllers and requires
an external HTTPS payment adapter. A provider sandbox can satisfy the existing contract without
changing application routes, but that adapter must first exist and pass its consistency checks.
A placeholder URL or API key cannot deliver the checkout, cancellation, and recovery flows. Until
the providers, budget, adapter, public ingress checks, and release review are complete, this is a
deployment preparation, not a launch-ready demo.

## Architecture and budget

Use one workspace and the `virginia` region initially. Confirm region and data residency before
resource creation; keep the API and datastores near each other. These are initial sizing choices,
not a measured capacity guarantee:

| Resource | Initial choice | Role |
| --- | --- | --- |
| API | One paid Docker web service, `1c-2g` | Nest API, background payment recovery, Socket.IO |
| Web | One paid Docker web service, `0.5c-512mb` | Next.js server rendering and browser assets |
| Database | Separate paid Render Postgres, `0.5c-1g`, dedicated demo database | Authoritative records and migrations |
| Shared state | Separate **new** paid Render Key Value, `256mb` | Valkey scripts, quotas, realtime Pub/Sub |
| Media | Maintained managed private S3-compatible bucket | Presigned browser uploads and API-mediated reads |
| Email | Verified Resend sender and scoped key | Real login and administrator verification messages |
| Payments | Independently hosted HTTPS adapter using a provider sandbox | Existing payment contract with durable fake-money state |
| Maps | Production-authorized HTTPS XYZ tile provider | Tiles and required attribution |

Illustrative Render compute prices checked on **2026-10-01**:

| Resource | Monthly compute price |
| --- | ---: |
| API `1c-2g` | $25 |
| Web `0.5c-512mb` | $7 |
| Postgres `0.5c-1g` | $19 |
| Key Value `256mb` | $10 |
| Hobby workspace | $0 |
| **Baseline compute total** | **$61** |

These are [published Render prices](https://render.com/pricing), not an approved spending ceiling
or a complete quote. Storage, bandwidth, build/pipeline usage, provider charges, domains, adapter
hosting, monitoring, restore instances, taxes, and any workspace upgrade are additional. No card is on file, no monthly spending ceiling has been supplied, and no paid resources or public
deployment have been created.

The app services are versioned in the Blueprint. Datastores are intentionally prepared separately:
their default Blueprint connection references use internal URLs that do not satisfy this
application's verified TLS requirements. Record their identifiers, plans, network rules, backup
settings, and owner in the operator's infrastructure inventory.

Render's current [compute plan reference](https://render.com/docs/compute-plans) documents these
CPU/memory IDs. Obtain a current [Render pricing](https://render.com/pricing) quote and an approved
monthly ceiling **before provisioning**. Include both app services, Postgres storage/backups,
Key Value, pipeline minutes, bandwidth, domain, S3 storage/requests/egress, email, maps, adapter
hosting, monitoring, and temporary restore resources. An additional workspace plan or dedicated
outbound IPs can add cost. Free services do not replace the required paid migration and recovery
setup. Upgrade sizes only after reviewing CPU, memory, connection usage, latency, and the budget.

## TLS and provider preparation

1. **Postgres:** use the full **external** Render hostname and credentials. Add exactly one
   `sslmode=require` and one `sslaccept=strict` query setting; preserve needed existing query
   settings with the correct `?`/`&` separator. Only `schema`, `connection_limit`, these TLS settings,
   and the three deadline parameters below are supported; duplicate or unknown settings (including
   SSL alias/certificate/options overrides) fail the gate. Use exactly one `connect_timeout=2`, `pool_timeout=2`, and `socket_timeout=3`;
   the configuration gate rejects missing, duplicated, or different values. Start with
   `connection_limit=10`, then measure pool pressure and account for migrations and deploy overlap. Test the actual
   Prisma client in the API image against this endpoint before opening access. The internal
   endpoint uses optional TLS with a self-signed certificate; this deployment has no configured
   trust path for that certificate. Do not change to `sslaccept=accept_invalid_certs` or disable
   certificate verification. External connections require the full hostname for SNI.
   [Render Postgres connection documentation](https://render.com/docs/postgresql-creating-connecting)

2. **Key Value:** provision a new maintained instance, choose `noeviction` and Journal + Snapshot
   persistence, and use its authenticated **external `rediss://`** URL. The internal `redis://`
   reference is insufficient even with internal authentication. Enable external access only for
   the API's outbound CIDRs. Confirm TLS, authentication, `PING`, Lua `EVAL`/`TIME`, sorted sets,
   expiry, and Pub/Sub with the actual clients. Use the standard TCP endpoint, not a REST-only or
   cluster-sharded substitute. New Render instances run Valkey 8; legacy Redis instances are not
   automatically maintained. Persistence can lose the final second of writes, so it is not the
   authoritative message or payment store. Alert on memory approaching capacity; `noeviction`
   intentionally fails writes rather than discarding quota keys.
   [Render Key Value documentation](https://render.com/docs/key-value)

3. **Network rules:** remove Postgres's default world-wide external access and allow only the API's
   region outbound CIDRs plus a narrowly scoped, temporary operator address when needed. Apply
   equivalent restrictions to Key Value. Obtain ranges from the actual service's Connect menu;
   do not copy example addresses or substitute `0.0.0.0/0`. Render shares regional outbound ranges
   among services, so the allowlist supplements credentials and verified TLS. Ensure migration
   instances can reach both endpoints. Remove temporary operator access after use.
   [Render outbound IP documentation](https://render.com/docs/outbound-ip-addresses)

4. **S3, Resend, maps, and adapter:** follow the repository's
   [production checklist](production-launch-checklist.md) and exact
   [integration contracts](external-integrations.md). Use maintained private object storage with
   verified HTTPS endpoints, least-privilege credentials for the listing-media object prefix,
   upload CORS limited to the final web origin, and a tested backup/versioning policy. Permit the
   presigned PUT's actual headers. Keep anonymous bucket reads disabled; test approved-image reads
   through the API and private-image denial. Set `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` to the upload
   endpoint's origin. Verify Resend's sender domain and actual login delivery. Restrict the public
   map key to the deployed origin and supply attribution. Contract-test the sandbox adapter's
   durable idempotency, one payable order, lost responses, checkout/cancellation fencing, and
   pending/final refunds. An HTTPS endpoint alone does not prove these guarantees.

## Environment and ingress

Supply every `sync: false` entry using Render's environment configuration, not committed files.
Generate three distinct high-entropy authentication secrets, each at least 32 bytes. Retain the
fixed authentication/upload timer values and empty `LOCAL_ADMIN_EMAILS` in the Blueprint. Assign
administrators through the audited operator CLI; never enable the development admin allowlist.

| Variable | Required relationship |
| --- | --- |
| `WEB_ORIGIN` | Exact final web HTTPS origin, without path, query, credentials, or fragment |
| `NEXT_PUBLIC_API_BASE_URL` | Actual API HTTPS address ending in `/api/v1` |
| `API_INTERNAL_BASE_URL` | The same public HTTPS API base for this initial deployment |
| `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` | Origin of `LISTING_MEDIA_UPLOAD_ENDPOINT` |
| `TRUSTED_PROXY_HOPS` | Verified non-negative count for the actual API ingress chain |
| Provider URLs and keys | Real reachable providers with the required protocols and permissions |

Use the service URLs assigned by Render or preselected custom domains; service names do not promise
an available `onrender.com` hostname. Render provides managed public TLS for its service hostnames
and configured custom domains. Verify DNS and certificates before the browser checks.
[Render TLS documentation](https://render.com/docs/tls)

The web server uses the public HTTPS API endpoint to preserve transport verification and avoid
manufactured Blueprint string interpolation. This adds a public-network round trip. Render's
[private network](https://render.com/docs/private-network) is available for later deliberate
transport design, but a private hostname is not evidence of certificate verification. Do not add
extra proxy layers or switch endpoints without rechecking trust, CORS, and latency.

Verify the API's socket peer and forwarded-header chain in the real ingress, including an attempt
to spoof `X-Forwarded-For`. Set the minimum trusted-hop count that resolves the genuine client from
that chain; do not guess a universal Render value or trust arbitrary forwarded addresses. A value
of zero can group all clients under a proxy IP; an excessive count can let clients forge their
quota identity. Remove diagnostic logging after validation and never log auth codes or credentials.

The demo supports at most **5,000 active, unarchived, owned roommate profiles**. Discovery reads
at most 5,001 rows and returns `503 DISCOVERY_CAPACITY_EXCEEDED` above that capacity; it does not
publish partial results or drop eligible profiles. Below the limit, ranking and paging cover the
complete eligible catalog. The public raw profile route has the same explicit capacity guard and
one canonical publication per account. Keep the curated demo below the limit and monitor this
error. Anonymous discovery still performs bounded ranking work per request: configure a verified
public ingress request-rate/concurrency limit and test latency and event-loop load on the selected
API size before opening access. An account quota does not bound anonymous traffic.

The four `NEXT_PUBLIC_*` settings are browser-visible Docker build arguments in `Dockerfile.web`;
changing them requires a web rebuild. Provider secrets belong only to the API. Render supplies
environment values as Docker build arguments and runtime variables, so keep secrets out of
Dockerfile `ARG` instructions and build output.
[Render Docker documentation](https://render.com/docs/docker)

Render prompts for `sync: false` values during the first Blueprint setup. Later Blueprint syncs
ignore these entries; add new keys and rotate existing values manually on the services, then
redeploy. Preview environments are disabled to avoid copying production dependencies or incurring
unplanned costs. Validate with the current
[Blueprint schema](https://render.com/schema/render.yaml.json) and, when available, Render CLI
`render blueprints validate render.yaml` (v2.7.0+). A provider API validation response must have
`valid: true`; HTTP 200 alone is insufficient.
[Blueprint reference](https://render.com/docs/blueprint-spec)

## Deployment and acceptance

1. Finish the independent release review, approve the budget, prepare providers and a dedicated
   synthetic database, and load the reviewed values in a controlled local environment. Run
   `pnpm production:check-config` against the **combined actual API and web configuration** using
   the file-based gate or an already-loaded environment. Existing shell variables take precedence
   over env files; avoid stale values. Never print or commit the resulting secret inventory.

2. Require all jobs in `.github/workflows/verify.yml` to succeed for the exact release commit.
   Connect Render through the repository's GitHub integration and retain `branch: main` and
   `autoDeployTrigger: checksPass`. Require the four portable check jobs and the PostgreSQL,
   storage, realtime, and container job in branch protection. Render treats `neutral` and `skipped`
   as passed, so required jobs must actually execute. First creation, manual deployments, Blueprint
   syncs, environment changes, and deploy hooks are not substitutes for reviewing that commit's
   checks. Do not create a bypass deploy hook. Render deploys the two services independently;
   maintain API/web compatibility across consecutive commits.
   [Render CI deployment documentation](https://render.com/docs/deploys#integrating-with-ci)

3. Create the Blueprint only after the operator has approved provisioning. The API's pre-deploy
   command is the Prisma CLI already included in its runtime image:
   `./api/node_modules/.bin/prisma migrate deploy --schema api/prisma/schema.prisma`.
   It runs from `/app`, once per API deploy, before the replacement starts. Do not use `db push`,
   `migrate dev`, or automatic demo seeding. Render runs paid pre-deploy commands on a separate
   instance while the previous release can still run: schema changes must remain compatible with
   that release. Review destructive migrations, take a recovery point, and use staged schema
   changes. The image does not include `tools/production-config.mjs`; that combined configuration
   gate is an operator release step, not a fictitious runtime pre-deploy command.
   [Render pre-deploy documentation](https://render.com/docs/deploys#pre-deploy-command)

   Migration commands use Prisma's native schema engine, not the application's bounded pg driver.
   Retain the validated URL settings; do not weaken runtime deadlines for a long migration. For a
   reviewed slow migration, configure a separate operator session with a finite server
   `statement_timeout`, lock timeout, and process deadline, and monitor/cancel it deliberately.
   The checked-in native `socket_timeout=3` setting alone is not proof that accepted network-blackhole
   work settles: the installed native query engine did not settle that adversarial fixture. Confirm
   migration success and schema compatibility explicitly before allowing the replacement to start.

4. The API must return 200 from public `GET /api/v1/ready` with PostgreSQL, auth quotas, messaging
   quotas, and realtime infrastructure healthy in distributed mode. Render's API health path is
   this readiness endpoint. The web's `GET /api/health` checks its process; it does not certify API,
   email, storage, maps, or payments. Do not open access merely because the frontend is green.
   Render drains services after sustained HTTP health failures and can restart them; recovery
   therefore needs working dependency probes rather than customer requests alone.
   [Render health check documentation](https://render.com/docs/health-checks)

   The API uses the maintained Prisma 6 PostgreSQL driver adapter with a two-second connection/pool
   acquisition timeout and a three-second actual query deadline. A query deadline closes its active
   PostgreSQL socket, settles the query, and retires the connection; readiness shares one query among
   callers and has a 3.5-second total response deadline, below Render's five-second check budget.
   Strict TLS verifies both the certificate chain and the exact external hostname. Driver URL query
   settings are reconstructed explicitly; custom schemas use a quoted startup `search_path` for raw
   SQL as well as Prisma's schema option. Socket-close timeouts leave the commit outcome uncertain;
   existing idempotency/fencing and reconciliation remain necessary before retrying a payment mutation.
   [Prisma 6 driver documentation](https://www.prisma.io/docs/orm/v6/overview/databases/database-drivers),
   [PostgreSQL driver client documentation](https://node-postgres.com/apis/client)

5. Curate and approve synthetic listings, accounts, photographs, and locations before importing
   data once into the dedicated demo database. Do not run the broad existing seed script blindly:
   it upserts inventory, profiles, bookings, and queues and can overwrite matching records.
   The runtime image contains built CLI tools, not the seed TypeScript source or repository
   helper scripts. Use the documented operator tooling from an approved matching checkout or
   appropriate operator image; keep administrative credentials out of browsers. Create the first
   admin and invitations through the audited CLI. Use only controlled email recipients and a
   clearly identified fake-money checkout sandbox during this phase.

6. Record an actual public-browser acceptance run: browse/search/maps, invite and delivered-code
   login, upload/read/private denial, favorites, roommate messages and history, applications and
   sandbox checkout/cancellation, moderator actions, provider interruption/recovery, and reconnects
   across an API deploy. Verify allowed-origin requests and rejected foreign origins. Tests against
   local fixtures and CI's development container configuration do not certify these providers.

## Realtime, operations, and recovery

Keep **one API instance** and no autoscaling. The client permits WebSocket and HTTP polling;
Socket.IO's Redis adapter still requires sticky sessions for polling across servers.
[Socket.IO Redis adapter documentation](https://socket.io/docs/v4/redis-adapter/)
Render documents random assignment of new WebSocket connections and reconnection to another
instance. Valkey supplies fan-out, not polling affinity.
[Render WebSocket documentation](https://render.com/docs/websocket)

Render's deploy sequence retains the old process temporarily while shifting traffic to a new one.
Consequently, `numInstances: 1` is not proof that a polling session survives every deploy. Test an
explicit polling-only browser session and WebSocket reconnect during a real deploy before launch;
resolve failures with documented ingress affinity or an approved transport change. Do not claim
horizontal readiness from the presence of the Redis adapter. The 30-second shutdown grace uses
the existing Nest shutdown hooks; durable PostgreSQL message history and payment operation claims
must recover after forced termination. No persistent disk is attached to app services.

Readiness uses an active, bounded publisher-to-subscriber nonce round trip; connected sockets or
`PING` alone do not certify realtime delivery. A lost Pub/Sub delivery or stuck publication closes
the failing adapter clients and keeps production readiness at 503. Restore Key Value first, then
let Render restart the unhealthy process (or perform a controlled restart); a fresh adapter must
pass the round trip before it enters rotation. The running process does not swap its Socket.IO
adapter, because doing so would discard existing room memberships. Browser reconnect and durable
history reads are part of the required recovery acceptance run.

Normal failed query/transaction operations retire the transport and permit later work on a fresh
connection. Treat process shutdown as terminal: disconnecting during an active interactive
transaction can take about five seconds, and reusing that Prisma instance after terminal shutdown
is unsupported. The configured 30-second Render grace covers this bounded shutdown path; verify
forced termination recovery through durable records in the real deployment.

Alert on public readiness failures, unexpected restarts, error rates, event-loop/CPU pressure,
memory/OOM, database connections/storage, Valkey memory/write errors, storage failures, email
delivery, and stuck payment operations. Preserve request identifiers in centralized logs without
codes, tokens, personal message bodies, or provider credentials. Track errors and latency during
the first synthetic session before increasing traffic.

Paid Render Postgres provides point-in-time recovery; the documented window is three days on
Hobby and seven days on Pro or higher. A restore creates a new instance. Periodic logical exports
have a separate seven-day retention window. Confirm the selected plan's behavior, maintain an
encrypted operator-controlled backup, and drill restoring to a separate database before launch.
Verify rows, schema, media references, and readiness before switching `DATABASE_URL`. Export any
needed backups before deleting a database.
[Render recovery documentation](https://render.com/docs/postgresql-backups)

Restore object storage alongside database references according to its versioning/retention policy.
Do not reset the adapter's durable records or replay charges from a restored database blindly;
reconcile application/payment operations with provider state before enabling writes. Lost quota
state can reduce throttling and Pub/Sub is transient; retain PostgreSQL message history as the
authority. Roll back app code only to a version compatible with the migrated schema and verify
`checksPass` remains enabled after any manual rollback. Record the approved recovery time/data-loss
targets, key rotation owner, and restore evidence in the operator runbook.
