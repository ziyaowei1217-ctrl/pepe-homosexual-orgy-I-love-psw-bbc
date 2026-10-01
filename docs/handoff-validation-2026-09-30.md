# Handoff validation — 2026-09-30

## Source and delivery scope

Reviewed the latest `main` fetched at `5996479341d88904f159fe913e4c76b97c9db406`, confirmed unchanged
by a final fetch, on `hardening-release-2026-09-30`. The deliverable is the existing responsive web
application hardened for a controlled demo. No new product workflow, database migration, native
package, provider account or public deployment was introduced.

Use Node 22.13+ or 24 LTS and the repository-pinned pnpm 9.15.4. See
[demo and operations](demo-and-operations.md) for Docker setup, safe LAN exposure and recovery.
The local review host was macOS ARM64 with Node 25.8.0; passing there does not establish LTS or
Windows/Linux acceptance. The GitHub Actions matrix independently checks Node 22/24 on Linux,
Node 22 on macOS/Windows, and disposable service/container integrations on Linux.

## Local results

| Check | Result | Practical scope |
| --- | --- | --- |
| `pnpm check` | Passed: lint, type generation/TypeScript, 109 suites / 681 tests, production build | Final source, custom API base `http://localhost:4499/api/v1`; does not connect to a real production API |
| `RUN_CLI_BUILD_SMOKE=1 pnpm -C api launch:check` | Passed: 82 suites / 696 tests; 25 service-gated suites / 110 cases skipped | API regressions include TLS/authentication, ownership, headers, image parsing/privacy/budgets, sockets, throttling and compiled operator CLIs |
| `pnpm -C api test:cli-build` | Passed: build and 2 compiled CLI tests | Actual compiled artifacts execute with development dependencies blocked |
| JavaScript dependency audit | 0 critical, 0 high, 1 moderate; high-severity production gate passed | Remaining Nest SSE advisory is visible. This pnpm result excludes the archived demo storage service's high advisories; see SEC-011 in the security report |
| Secret/history scan | Gitleaks 8.30.1 scanned 224 commits; 16 candidates classified | Four test-placeholder occurrences and twelve historical generated Next keys; active provider-key reuse was not established |
| Current source secret scan | Five candidates classified | Four existing test placeholders and one false positive in conditional-provider prose; no live provider credential was confirmed |
| `git diff --check` | Passed | Patch whitespace/integrity check |

The overlapping-chat-history regression initially depended on timer scheduling. It now explicitly
commits the newer deferred response before releasing the stale one; 20 consecutive focused runs
(320 test executions) passed, followed by the complete 681-test web run.
This verifies the intended race instead of relying on elapsed wall-clock time.

The production build reports 102 kB shared first-load JavaScript, with static scripts/styles cached
normally. Per-request nonce HTML is dynamic and private. This is a security/performance tradeoff;
synthetic local page timing is not a production throughput measurement.

## Browser acceptance

**63 of 63 checks passed** against the final production standalone server with a disposable synthetic
public-listing fixture. The fixture contains no user credentials or private records. The versioned
`tools/browser-smoke.mjs` checked seven routes across Chromium, Firefox and WebKit, at 1440×900,
360×800 and 844×390: CSS loaded, hydration script nonces matched the response policy, no CSP
violations or uncaught errors occurred, pages had no horizontal overflow, and normal search-dialog
clicks and Escape dismissal worked.

Four additional phone interaction profiles passed: Chromium and WebKit at 393×851 and 844×390.
Budget filters applied, invalid dates disabled submission, date/login text computed to 16 px,
dialog focus remained contained and Escape closed it, and signed-out account/inbox/host/admin
gates rendered without overflow or client errors. The WebKit loopback CSS regression was resolved.

These are real browser engines with emulated viewports/touch, not physical iPhone/Android devices,
native applications or WeChat runtime certification. Signed-in UI behavior is covered by regression
tests; live database/email/storage/payment journeys require the service acceptance checks below.

## Service and operational gates

Docker, PostgreSQL and Valkey were unavailable on this host, so local results do not establish a
successful fresh database migration, live S3/MinIO/Valkey journey or hardened container run. The
committed CI uses disposable services for `pnpm release:check`, roommate and distributed realtime
smokes, builds both application images, checks read-only/nonroot execution and writable image cache,
and runs browser checks against the production-mode web image. Inspect the review's check status;
workflow configuration alone is not a successful execution.

The first remote run passed Linux Node 22/24 and macOS Node 22 checks, but disposable service startup
failed because the historical MinIO image could not be pulled. Local demo storage was changed to
pinned official source builds with mandatory loopback-only ports, and the integration gate is rerun.
This repairs startup availability; it does not patch known 2026 MinIO CE vulnerabilities. Real records,
direct phone upload, shared/public storage and production require a maintained patched S3 provider.

Before any shared public deployment, complete the [production launch checklist](production-launch-checklist.md):
HTTPS ingress and trusted headers, real provider acceptance and storage CORS, secret custody,
old-image inventory/reupload/cache purge, backup restore, alerts, quotas/resource limits, and rollback.
Ordinary JavaScript-readable bearer sessions and historical generated-key provenance require the
follow-up decisions in the [security review](security-review-2026-09-30.md) and
[threat model](sublet-pipeline-threat-model.md). Store/miniapp delivery has its own
[platform checklist](platform-delivery.md).
