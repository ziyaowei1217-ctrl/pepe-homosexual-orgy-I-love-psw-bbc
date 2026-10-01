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
| Final `pnpm check` | Passed: lint, types, production build; 110 suites / 714 tests | Custom API base `http://localhost:4499/api/v1`; does not connect to a real production API |
| API suite with `RUN_CLI_BUILD_SMOKE=1`, types/build/schema checks | Passed: 82 suites / 700 tests; 25 service-gated suites / 110 cases skipped | API regressions include TLS/authentication, ownership, headers, image parsing/privacy/dimension budgets, sockets, throttling and compiled operator CLIs |
| `pnpm -C api test:cli-build` | Passed: build and 2 compiled CLI tests | Actual compiled artifacts execute with development dependencies blocked |
| JavaScript dependency audit | 0 critical, 0 high, 1 moderate; high-severity production gate passed | Remaining Nest SSE advisory is visible. This pnpm result excludes the archived demo storage service's high advisories; see SEC-011 in the security report |
| Secret/history scan | Gitleaks 8.30.1 scanned 224 commits; 16 candidates classified | Four test-placeholder occurrences and twelve historical generated Next keys; active provider-key reuse was not established |
| Current source secret scan | Five candidates classified | Four existing test placeholders and one false positive in conditional-provider prose; no live provider credential was confirmed |
| `git diff --check` | Passed | Patch whitespace/integrity check |

The overlapping-chat-history regression initially depended on timer scheduling. It now explicitly
commits the newer deferred response before releasing the stale one; 20 consecutive focused runs
(320 test executions) passed, followed by the complete web suite.
This verifies the intended race instead of relying on elapsed wall-clock time.

Windows CI exposed case-insensitive environment collisions in subprocess fixtures and backslash
escaping in preload paths. The task runner now normalizes Windows environment names before
overrides, tests quote preload paths through JSON, and synchronous fixture processes have deadlines.
The final web run includes a regression for uppercase installed `NPM_EXECPATH` overridden by a
lowercase fixture key; the actual Windows acceptance run remains visible in the PR checks.

The production build reports 102 kB shared first-load JavaScript, with static scripts/styles cached
normally. Per-request nonce HTML is dynamic and private. This is a security/performance tradeoff;
synthetic local page timing is not a production throughput measurement.

## Browser acceptance

**69 of 69 checks passed** against the final production standalone server bound to `0.0.0.0`,
accessed at `127.0.0.1`, with a disposable synthetic
public-listing fixture. The fixture contains no user credentials or private records. The versioned
`tools/browser-smoke.mjs` checked seven routes across Chromium, Firefox and WebKit, at 1440×900,
360×800 and 844×390: CSS loaded, hydration script nonces matched the response policy, no CSP
violations or uncaught errors occurred, pages had no horizontal overflow, and normal search-dialog
clicks and Escape dismissal worked.

Six additional actual HTTP requests (absolute and relative API photo URLs in each browser engine)
were rejected by the production optimizer with 400 responses. This prevents its stale-image cache
from bypassing approval checks. Rendered API fixture photos loaded directly without `srcset` and
had positive visible dimensions in all four additional phone profiles below. Static Unsplash images
retain optimizer variants; published uploads have a 2560 px longest-edge limit without enlargement.

Four additional phone interaction profiles passed: Chromium and WebKit at 393×851 and 844×390.
Budget filters applied, invalid dates disabled submission, date/login text computed to 16 px,
dialog focus remained contained and Escape closed it, and signed-out account/inbox/host/admin
gates rendered without overflow or client errors. The WebKit loopback CSS regression was resolved.
These profiles were rerun on the final image-wrapper build, including direct API image visibility.

These are real browser engines with emulated viewports/touch, not physical iPhone/Android devices,
native applications or WeChat runtime certification. Signed-in UI behavior is covered by regression
tests; live database/email/storage/payment journeys require the service acceptance checks below.

## Service and operational gates

Docker, PostgreSQL and Valkey were unavailable on this host, so local results do not establish a
successful fresh database migration, live S3/MinIO/Valkey journey or hardened container run.
Those checks run remotely in GitHub Actions using disposable services. The workflow builds both
application images, checks read-only/nonroot execution and writable image cache, and exercises the
production-mode web image in real browser engines. Acceptance must be tied to the tested source
commit; workflow configuration alone is not a successful execution.

The first remote run passed Linux Node 22/24 and macOS Node 22 checks, but disposable service startup
failed because the historical MinIO image could not be pulled. Local demo storage was changed to
pinned official source builds with mandatory loopback-only ports.
This repairs startup availability; it does not patch known 2026 MinIO CE vulnerabilities. Real records,
direct phone upload, shared/public storage and production require a maintained patched S3 provider.

The [remote run for `3bbb3ec`](https://github.com/ziyaowei1217-ctrl/pepe-homosexual-orgy-I-love-psw-bbc/actions/runs/36812112682)
established these results before the final follow-up changes:

- Linux Node 22/24 and macOS Node 22 jobs passed their web/API/build/compiled-CLI/audit gates.
- Both pinned official Go storage builds succeeded, PostgreSQL/Valkey/MinIO became healthy, and
  the storage client initialized the private bucket. `pnpm release:check`, roommate migration/realtime
  and Valkey distributed messaging journeys passed against these actual services.
- Both application images built; all checked-in migrations applied in the read-only migration
  container. The hardened API became ready, the web health/homepage requests passed, and the
  unprivileged web process wrote to its explicitly writable cache.
- Container browser acceptance failed at the CSS-loading gate. The review reproduced production
  CSP upgrading HTTP loopback assets when Next normalized its URL to a wildcard server bind.
  A targeted incoming-Host correction, 21 new policy cases and the complete local browser gate
  now pass with the same wildcard bind. This earlier run does not establish successful container
  browser acceptance on the final source.
- Windows completed 681 of 682 web tests successfully. Both fixture development processes started and
  the command exited successfully; one assertion expected a POSIX-only pnpm log prefix. That
  assertion has been corrected. Environment collision/preload-path regressions passed on Windows,
  but the complete Windows build/API/CLI/audit gates still require a successful follow-up run.

The container API uses development mode with disposable non-TLS local services; the container web
uses production mode. These checks exercise built artifacts and production isolation controls,
and do not establish real production API TLS, provider configuration or deployment readiness.
Require every gate to pass on the final PR head after the image and CSP follow-ups; do not treat
the earlier service successes as latest-source acceptance.

Before any shared public deployment, complete the [production launch checklist](production-launch-checklist.md):
HTTPS ingress and trusted headers, real provider acceptance and storage CORS, secret custody,
old-image inventory/reupload/cache purge, backup restore, alerts, quotas/resource limits, and rollback.
Ordinary JavaScript-readable bearer sessions and historical generated-key provenance require the
follow-up decisions in the [security review](security-review-2026-09-30.md) and
[threat model](sublet-pipeline-threat-model.md). Store/miniapp delivery has its own
[platform checklist](platform-delivery.md).
