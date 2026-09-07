# Four production integrations

The product UI, database workflows, authentication, listing publishing, applications, moderation,
favorites, roommate matching, teams, and message history are implemented in this repository. The
remaining provider work is isolated behind the following four integration points.

## 1. Email

The API sends one-time login and administrator step-up codes through Resend in production.

Set:

```text
EMAIL_SENDER=resend
EMAIL_FROM=verified-sender@your-domain.example
RESEND_API_KEY=...
```

Verify the sender domain in Resend before deployment. Production startup rejects the console sender
and missing credentials. Delivery errors are returned as temporary service failures and never expose
the verification code in logs or responses.

## 2. Payment

The application lifecycle calls a provider-independent HTTPS payment service. Point
`PAYMENT_SERVICE_URL` at the base URL of your payment adapter and set its bearer credential:

```text
PAYMENT_SERVICE_URL=https://payments.your-domain.example
PAYMENT_SERVICE_API_KEY=...
```

The adapter must implement:

```text
POST /applications/:applicationId/accepted
Authorization: Bearer <PAYMENT_SERVICE_API_KEY>
Idempotency-Key: accepted/:applicationId
Content-Type: application/json

{"applicationId":"..."}
```

Return any JSON object with a 2xx status after the order or checkout session is durably created.

The renter's **继续付款** action then calls:

```text
POST /applications/:applicationId/checkout-sessions
Authorization: Bearer <PAYMENT_SERVICE_API_KEY>
Idempotency-Key: <checkout idempotency key>
Content-Type: application/json

{"applicationId":"...","actorId":"..."}
```

Return an HTTPS provider-hosted checkout URL:

```json
{"checkoutUrl":"https://checkout.payment-provider.example/session/..."}
```

```text
POST /applications/:applicationId/cancellations
Authorization: Bearer <PAYMENT_SERVICE_API_KEY>
Idempotency-Key: cancellation/:applicationId
Content-Type: application/json

{"applicationId":"...","actorId":"..."}
```

Return exactly one of:

```json
{"result":"NO_FUNDS"}
{"result":"REFUNDED"}
{"result":"RELEASED"}
```

Requests time out after eight seconds and are idempotent. The checked-in demo ledger remains
available in development and test only; its controllers are not mounted in production.

Payment mode is discovered by the web app through authenticated `GET /api/v1/payments/configuration`.
Production application status uses authenticated `GET /api/v1/payments/applications/:applicationId`,
which reads pending local work and, when synchronized, calls the adapter:

```text
GET /applications/:applicationId/status
Authorization: Bearer <PAYMENT_SERVICE_API_KEY>
```

Return `{"status":"AWAITING_PAYMENT"}` or `PROCESSING`, `PAID`, `REFUNDED`, `RELEASED`, `CANCELLED`.
`PROCESSING` is not a failed payment and must not create another charge. State must come from the
provider's durable records/webhooks, not the browser checkout return URL.

### Required adapter consistency contract

- Persist idempotency keys and their definitive outcomes for the lifetime of the application.
  Concurrent calls and retries after timeout or process restart must replay the same operation.
  Accepted orders use `accepted/:applicationId`; cancellation uses `cancellation/:applicationId`;
  checkout keys are scoped as `checkout/:applicationId/:clientKey`.
- An application has one payable order. Multiple checkout keys/sessions may refer to that order,
  but cannot create duplicate charges after a lost response, browser storage loss, or account refresh.
- Cancellation **atomically disables existing, in-flight, and future checkout/payment attempts**
  for the application before returning `NO_FUNDS` or `REFUNDED`. A concurrent charge must either be
  prevented or included in the refund. An issued checkout URL must not remain payable after cancellation.
  Idempotency alone does not provide this guarantee.
- `NO_FUNDS` means the fenced order has nothing left to refund; `REFUNDED` means the refund is durable;
  `RELEASED` means cancellation is refused and the original accepted application remains in force.
  A pending refund must return a retryable error until it is definitive, rather than false success.
- `accepted` and checkout requests for a cancelled application must never reopen its order.

Order creation is queued in the acceptance database transaction. Cancellation first durably reserves
the application as `CANCELLATION_PENDING` and retains its listing lock, then performs the network call
outside any database transaction. A worker scans every five seconds using expiring claims. Failed
requests or local commits replay the durable provider key. The application becomes `CANCELLED` only
when the definitive result and local transition commit together. The web app shows processing and
provides status refresh while recovery is pending.

Before enabling live payments, run adapter contract tests for lost responses, duplicate requests,
overlapping checkout/cancellation, refund pending/settled outcomes and webhook status. Repository
tests use a controlled adapter boundary and cannot certify an external provider's guarantees.

## 3. Map

The web app uses raster XYZ tiles in search, listing detail, and saved-list maps. Set these values
before building the web image:

```text
NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE=https://maps.example.com/tiles/{z}/{x}/{y}.png?key=...
NEXT_PUBLIC_MAP_ATTRIBUTION=© Your map provider
```

The URL must be HTTPS and contain `{z}`, `{x}`, and `{y}`. These are public build-time values, so use
a browser-restricted map key. The local fallback is OpenStreetMap and is not intended to replace a
production tile plan.

## 4. Messages

The application already exposes authenticated REST message APIs and Socket.IO realtime delivery.
There is no vendor-specific chat SDK in the UI. Production needs a managed Valkey-compatible service
and ingress support for WebSocket upgrades:

```text
VALKEY_URL=rediss://...
```

HTTP paths:

```text
GET  /api/v1/deal-threads
POST /api/v1/deal-threads/:id/messages
GET  /api/v1/roommate-conversations
GET  /api/v1/roommate-conversations/:id/messages
POST /api/v1/roommate-conversations/:id/messages
```

Realtime clients connect to the public API origin at `/roommate-messaging` and authenticate with the
same access token. PostgreSQL history is authoritative; Valkey provides cross-instance fan-out and
shared rate limiting. Your proxy/load balancer must preserve WebSocket upgrades and forward the
configured trusted proxy headers.

## Configuration gate

With the production variables loaded in the shell, run:

```bash
pnpm production:check-config
```

It fails on missing values, insecure public URLs, weak secrets, a non-TLS Valkey URL, or an invalid
map tile template.
