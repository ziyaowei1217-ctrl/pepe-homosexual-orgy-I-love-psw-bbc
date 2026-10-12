# Audit Remediation and Revalidation Plan

> Implement with systematic debugging, test-driven development and parallel agents. The user has authorized fixes and the same validation, so proceed without another plan approval.

**Goal:** Repair confirmed findings from the 30180a6 audit, preserve existing behavior, and rerun the same local release checks with explicit production limitations.

**Architecture:** Durable server-side session invalidation shared by HTTP and realtime; strict JWT purpose/issuer/audience. Reject non-image magic bytes before expensive parsing. Align runtime secret policy with deployment tooling. Repair accessibility names/contrast and application state merging. Upgrade vulnerable packages and make infrastructure gates runnable and mandatory in release validation.

**Tech stack:** Next/React, Nest, Prisma/PostgreSQL, MinIO, Valkey, Node 22, Vitest, Playwright/axe, k6, Docker, Trivy.

**Spec:** Prior durable audit at /Users/a1-6/Desktop/pepe homosexual orgy I love psw bbc/output/strict-audit-2026-10-12/REPORT.md and its linked evidence.

## Constraints
- Start at main 30180a6 in this isolated worktree. Preserve the original checkout and test evidence.
- Never count overlapping tests twice or turn missing production credentials into a PASS.
- Real third-party transactions, emails and deployment are outside local test execution.
- Use Node 22 and dedicated databases/ports/containers. Preserve existing sublet-pipeline services.
- Each security fix needs a regression that fails on the baseline and passes after the fix.
- Dependency edits/lockfile/install belong exclusively to dependency agent; auth owns API auth + Prisma and frontend logout; UI agent avoids concurrent logout edits.

## Review Focus
- Revoked tokens in existing WebSocket connections and simultaneous logout/step-up.
- Stale tokens issued before migration and independent sessions belonging to another device.
- Truncated/forged image magic bytes, decompression and pixel amplification.
- Runtime startup bypass of the separate production CLI, whitespace and reused secrets.
- UI dynamic accessible names, low contrast tinted backgrounds, withdrawal state and hydration determinism.

## Tasks
- [ ] 1. Authentication: reproduce logout and wrong-audience acceptance; implement persistent revocation and token scope, API logout and client awaiting/error handling; test HTTP/realtime and migration. Assess stronger authentication gap explicitly.
- [ ] 2. Media/supply chain: replay bounded ZIP; reject unsupported magic before general parsing; upgrade affected dependency branches, prune runtime Docker dependencies; test image formats, parsing budgets, build and audit.
- [ ] 3. UI: reproduce axe and application title failures; correct contrast/names and response merging; investigate hydration with evidence; rerun original browser matrix and authenticated journey.
- [ ] 4. Production config/release: failing weak/shared-secret tests first; enforce runtime key validation, add regression tests. Parameterize disposable DB fixture routing; enforce complete infrastructure/CLI gates in CI and release scripts with fail-closed missing dependencies.
- [ ] 5. Integration: run lint/typecheck/web and API suites/builds, all PG/MinIO/Valkey/CLI gates, Docker builds/smoke, security negative tests/OTP races, browser/axe, same mutation scope, source/dependency scans, 405-second k6 profile and backup/interruption drills.
- [ ] 6. Independent review; repair important findings; record exact code hash, commands, exit codes, changed coverage, remaining limitations and final release decision.

## Coordination ledger
- Baseline was verified in the preceding turn on this exact SHA; reuse its red reproductions rather than duplicate unchanged full builds before fixes.
- Worktree initially detached; create codex/strict-release-fixes before commit.
- Shared interfaces: auth agent owns logout section of account component; UI agent handles account names after coordinating. Dependency agent owns both package manifests/lockfile and Dockerfiles. Root owns runtime env policy, release runner/CI and test fixture routing.

- Progress: root runtime key and CLI policies RED -> GREEN (32 API config/fixture checks and 37 web CLI/release checks); explicit isolated DB routing and fail-closed infrastructure runner/CI implemented. Actual combined infrastructure execution remains pending final code freeze.
- Scope ruling: independent TOTP and recovery codes protect sensitive operations. Ordinary email login remains available, so full-site ASVS L2/L3 is not claimed; MFA UI must state sensitive-operation scope. Disabling/rotating an existing factor requires that factor, not just email.
- Added prior audit ledger/date boundary tests to normal API suite so improvements are retained by CI.
- Dedicated compose.test services are healthy; initial 24 migrations applied. Runtime local HTTPS proxy prepared to test original CSP in WebKit.
