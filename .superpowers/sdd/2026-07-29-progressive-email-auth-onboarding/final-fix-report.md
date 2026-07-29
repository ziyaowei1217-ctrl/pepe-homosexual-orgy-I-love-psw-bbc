# Final review fix report

## Status

`DONE`

Functional fix commit: `18db59c8bc8927611b3549450b22f01792abc387`

## Finding 1 — server-side publish gate

### RED

Command:

```bash
pnpm --dir api test -- listings.service.spec.ts marketplace.service.spec.ts
```

Observed expected failure: exit 1 with 17 failed and 36 passed tests. All four `listings` mutations accepted incomplete or renter-only profiles, while the `housing-listings` paths still reached `profile.upsert` instead of returning `ForbiddenException`.

### GREEN

Command:

```bash
pnpm --dir api test -- listings.service.spec.ts marketplace.service.spec.ts
```

Result: exit 0; 2 test files passed, 53 tests passed.

The shared backend rule now requires non-blank `displayName`, `school`, and `city`, plus role `lister` or `both`. It is used by listing create/update/media/submit and housing-listing create/update. Existing ownership and status checks remain covered, read-only endpoints were not changed, and unauthorized housing publication uses `findUnique` rather than creating a placeholder profile.

## Finding 2 — atomic code verification

### RED

Command:

```bash
pnpm --dir api test -- auth.service.spec.ts
```

First observed failure: exit 1 with 2 failed and 15 passed tests. Both concurrent replays succeeded, and a profile persistence failure left the user record created.

The concurrent-attempt fixture initially returned one aliased record object, which masked the database race. After correcting the test double to return independent query snapshots, with no production change, the same command failed with 3 failed and 14 passed tests:

- concurrent replay produced 2 successes instead of 1;
- failed profile persistence left the user created;
- 10 concurrent invalid attempts produced `attemptCount: 10` instead of the cap of 5.

### GREEN

Command:

```bash
pnpm --dir api test -- auth.service.spec.ts
```

Result after the verification fix: exit 0; 1 test file passed, 17 tests passed.

Verification now runs inside a PostgreSQL transaction guarded by a transaction-scoped advisory lock keyed by normalized email. Invalid-attempt increments commit before the service throws the external 401, while user/profile/code persistence exceptions roll back together. The existing returning-user, admin allowlist, normalization, hashed-code, profile, and JWT coverage remains green.

## Finding 3 — serialized issuance and cooldown

### RED

Command:

```bash
pnpm --dir api test -- auth.service.spec.ts
```

Observed expected failure: exit 1 with 1 failed and 17 passed tests. Two concurrent requests for the same normalized email both fulfilled instead of exactly one receiving the cooldown error.

### GREEN

Command:

```bash
pnpm --dir api test -- auth.service.spec.ts
```

Result: exit 0; 1 test file passed, 18 tests passed.

Issuance now uses the same per-email PostgreSQL advisory-lock transaction. The concurrent test proves one request succeeds, one receives `BadRequestException`, only one code is delivered, and that delivered code still verifies. Existing sender/storage rollback tests remain green. Because the lock key is the normalized email rather than a global lock, different emails are not globally serialized.

## Finding 4 — transient guest auth reset

### RED

Command:

```bash
pnpm test -- tests/auth-flow-panel.test.tsx
```

The first run exposed a test setup mistake: it expected a development auto-filled code while the test environment was not development. The test was corrected before production changes by entering the code directly.

The corrected RED run exited 1 with 1 failed and 12 passed tests. After successful verification, authenticated rerender, and logout rerender on the same mounted pinned panel, the guest email input did not exist because the component remained on the stale code step.

### GREEN

Command:

```bash
pnpm test -- tests/auth-flow-panel.test.tsx
```

Result: exit 0; 1 test file passed, 13 tests passed. The existing `react-test-renderer` deprecation warning remains the deferred test-only observation.

Successful authentication now clears the guest step, email, sent email, code, expiry, resend cooldown, clock baseline, and local error. The mounted logout transition returns to an empty email step without stale credentials or alerts.

## Full verification

### Complete API launch check

Command:

```bash
pnpm --dir api launch:check
```

Result: exit 0.

- API tests: 22 files passed, 1 database-smoke file intentionally skipped; 151 tests passed, 1 skipped.
- API typecheck: exit 0.
- API build: exit 0.
- Prisma schema validation: `The schema at prisma/schema.prisma is valid`.

The real PostgreSQL smoke test remains opt-in and was updated to create and clean up a complete lister profile before its listing flow.

### Complete frontend check

Command:

```bash
pnpm check
```

Result: exit 0.

- ESLint: exit 0 with zero warnings allowed.
- Next/TypeScript typecheck: exit 0.
- Frontend tests: 34 files passed; 144 tests passed.
- Next production build: exit 0.

Existing non-blocking warnings were limited to the deferred `react-test-renderer` deprecation, Vite CJS API deprecation, and Next workspace-root inference caused by multiple lockfiles.

### Explicit API typecheck/build/schema coverage

These ran successfully as part of `pnpm --dir api launch:check`. A separate `pnpm --dir api typecheck` also exited 0 after the shared test fixtures were updated for the transaction boundary.

### Diff and status

```bash
git diff --check
```

Result: exit 0 with no output.

Final `git status --short`: clean; the command produced no output after the functional fix and report were committed.

## Remaining concerns

No blocking functional concern. The real PostgreSQL smoke test was not executed because the required verification contract called for the complete API launch check, where that opt-in test is intentionally skipped. The branch continues to carry the pre-existing test/build deprecation and workspace-root warnings listed above.
