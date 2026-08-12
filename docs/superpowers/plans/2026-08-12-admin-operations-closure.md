# Administrator Operations Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the host-to-administrator listing publication loop, restore the roommate administrator page, protect internal Trust metrics, and remove misleading invite-only development codes.

**Architecture:** Keep `/admin/trust` as the administrator operations route and extract its real review UI into a focused component. The main app owns one memory-only administrator step-up session shared by administrator screens; ordinary tokens perform reads, while only a live enhanced token performs writes. Backend changes preserve enumeration-resistant response shapes while returning `devCode` only for a usable verification record.

**Tech Stack:** Next.js 15, React 19, TypeScript, NestJS 10, Prisma 6, Vitest, react-test-renderer

## Global Constraints

- Do not add a database migration.
- Keep administrator step-up tokens in React memory only; never write them to browser storage.
- Keep `AdminStepUpGuard` on listing and roommate administrator writes.
- Do not reveal whether a login email exists, is invited, or is cooling down.
- Preserve unrelated user changes and avoid broad refactors of `components/sublet-app.tsx`.
- All behavior changes follow a witnessed red-green TDD cycle.

---

### Task 1: Backend authentication and Trust authorization contracts

**Files:**
- Modify: `api/src/auth/auth.service.ts`
- Modify: `api/src/trust/trust.controller.ts`
- Modify: `api/src/trust/trust.module.ts`
- Modify: `api/test/auth.service.spec.ts`
- Modify: `api/test/auth-hardening.service.spec.ts`
- Create: `api/test/trust.controller.spec.ts`

**Interfaces:**
- Consumes: existing `AuthGuard`, `AdminGuard`, `AuthModule`, and `AuthService.requestVerificationCode` behavior.
- Produces: `EmailCodeResponse.devCode` only when the response corresponds to a persisted, sent, usable development code; class-level Trust guards `[AuthGuard, AdminGuard]`.

- [ ] **Step 1: Write failing authentication response tests**

Change the cooldown and invite-enumeration cases to assert literal response keys and the absence of a development code:

```ts
const cooldown = await service.requestEmailCode("student@northeastern.edu");
expect(cooldown).toEqual({
  email: "student@northeastern.edu",
  expiresAt: expect.any(Date)
});

const uninvited = await service.requestEmailCode("stranger@example.com");
expect(uninvited).toEqual({
  email: "stranger@example.com",
  expiresAt: expect.any(Date)
});
expect(invited.devCode).toMatch(/^\d{6}$/);
```

These tests catch the bug where a random, unverifiable code is exposed as though it were usable.

- [ ] **Step 2: Write the failing Trust authorization metadata test**

Create `api/test/trust.controller.spec.ts`:

```ts
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AdminGuard } from "../src/auth/admin.guard";
import { AuthGuard } from "../src/auth/auth.guard";
import { TrustController } from "../src/trust/trust.controller";

it("requires an authenticated administrator for Trust queue reads", () => {
  expect(Reflect.getMetadata("__guards__", TrustController) ?? []).toEqual([
    AuthGuard,
    AdminGuard
  ]);
});
```

This test catches accidental public exposure of internal Trust queues.

- [ ] **Step 3: Run the targeted tests and verify RED**

Run:

```bash
pnpm -C api vitest run test/auth.service.spec.ts test/auth-hardening.service.spec.ts test/trust.controller.spec.ts
```

Expected: authentication expectations fail because generic responses still contain `devCode`; Trust metadata fails because the controller has no guards.

- [ ] **Step 4: Implement precise development-code exposure**

Split the accepted response helper so generic acceptance omits the optional code:

```ts
private acceptedResponse(email: string, expiresAt: Date, code?: string) {
  const response: { email: string; expiresAt: Date; devCode?: string } = {
    email,
    expiresAt
  };
  if (this.nodeEnv !== "production" && code) response.devCode = code;
  return response;
}
```

Unknown-email and cooldown branches call the timing-budget helper without a code. Successfully delivered real records keep passing `pending.code`.

- [ ] **Step 5: Protect Trust queues**

Apply guards at the controller and import the module that exports them:

```ts
@UseGuards(AuthGuard, AdminGuard)
@Controller("trust")
export class TrustController {}
```

```ts
@Module({
  imports: [AuthModule],
  controllers: [TrustController],
  providers: [TrustService]
})
export class TrustModule {}
```

- [ ] **Step 6: Run targeted backend tests and verify GREEN**

Run the Step 3 command. Expected: all targeted tests pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add api/src/auth/auth.service.ts api/src/trust/trust.controller.ts api/src/trust/trust.module.ts api/test/auth.service.spec.ts api/test/auth-hardening.service.spec.ts api/test/trust.controller.spec.ts
git commit -m "fix: secure invite codes and trust queues"
```

---

### Task 2: Frontend administrator step-up foundation

**Files:**
- Modify: `lib/api.ts`
- Modify: `lib/product-errors.ts`
- Create: `lib/admin-step-up.ts`
- Create: `components/admin-step-up-panel.tsx`
- Create: `tests/admin-step-up.test.tsx`
- Modify: `tests/product-errors.test.ts`

**Interfaces:**
- Produces: `AdminStepUpSession`, `getActiveAdminStepUpToken(session, now)`, `requestAdminStepUpCode(token)`, `verifyAdminStepUpCode(token, code)`, and `AdminStepUpPanel`.
- `AdminStepUpPanel` props: ordinary `sessionToken`, administrator `email`, `open`, `onVerified(session)`, and `onCancel()`.
- `ProductApiError.code?: string` preserves safe backend error codes such as `ADMIN_REAUTH_REQUIRED`.

- [ ] **Step 1: Write failing active-session tests**

Create pure assertions:

```ts
expect(getActiveAdminStepUpToken({
  accessToken: "enhanced",
  reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
}, Date.parse("2026-08-12T08:00:00.000Z"))).toBe("enhanced");

expect(getActiveAdminStepUpToken({
  accessToken: "enhanced",
  reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
}, Date.parse("2026-08-12T08:30:00.000Z"))).toBeNull();
```

- [ ] **Step 2: Write failing API-error-code test**

Add a test showing a parsed `403` with `{ code: "ADMIN_REAUTH_REQUIRED" }` produces a permission error retaining that code, without retaining the raw response body.

- [ ] **Step 3: Write failing step-up panel test**

Mock only the two HTTP helpers. Render the real panel, request a code, verify the auto-filled development code, submit it, and assert the real `onVerified` callback receives:

```ts
{
  accessToken: "enhanced-token",
  reauthenticatedUntil: "2026-08-12T08:30:00.000Z"
}
```

The test catches panels that display a code but fail to hand the enhanced token to the workspace.

- [ ] **Step 4: Run frontend foundation tests and verify RED**

Run:

```bash
pnpm vitest run tests/admin-step-up.test.tsx tests/product-errors.test.ts
```

Expected: imports or assertions fail because the helpers, component, and error code do not exist.

- [ ] **Step 5: Implement the typed API and safe error parsing**

Add:

```ts
export type AdminStepUpResponse = {
  accessToken: string;
  reauthenticatedUntil: string;
};

export function requestAdminStepUpCode(token: string) {
  return apiPost<EmailCodeResponse>("/auth/admin-step-up/email-code", {}, token);
}

export function verifyAdminStepUpCode(token: string, code: string) {
  return apiPost<AdminStepUpResponse>("/auth/admin-step-up/verify", { code }, token);
}
```

On non-OK responses, parse only the bounded JSON `code` string and pass it to `productErrorForStatus(status, code)`. Do not expose arbitrary backend messages.

- [ ] **Step 6: Implement memory-only step-up session validation and panel**

`getActiveAdminStepUpToken` returns the token only when the expiry parses and `now < expiry`. The panel uses the existing six-digit normalization and product-error mapping, keeps the code in local component state, and never touches browser storage.

- [ ] **Step 7: Run frontend foundation tests and verify GREEN**

Run the Step 4 command. Expected: all targeted tests pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add lib/api.ts lib/product-errors.ts lib/admin-step-up.ts components/admin-step-up-panel.tsx tests/admin-step-up.test.tsx tests/product-errors.test.ts
git commit -m "feat: add administrator step-up flow"
```

---

### Task 3: Real listing-review workspace on `/admin/trust`

**Files:**
- Create: `components/admin-trust-screen.tsx`
- Create: `tests/admin-trust-screen.test.tsx`
- Modify: `lib/api.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Produces: `getAdminListingReviewQueue(token)`, `approveAdminListing(token, id)`, `rejectAdminListing(token, id, reason)`.
- `AdminTrustScreen` consumes ordinary session token/user, `AdminStepUpSession | null`, `onStepUpRequired`, `onCatalogChanged`, and `onToast`.
- The screen performs admin reads with the ordinary token and writes with `getActiveAdminStepUpToken`.

- [ ] **Step 1: Write failing gate and queue-render tests**

Render the real component in three states:

```ts
expect(renderedSignedOut).toContain("请登录管理员账户");
expect(renderedOrdinaryUser).toContain("需要管理员权限");
expect(renderedAdmin).toContain("Codex 浏览验收测试房源 0812");
```

Use a complete `ApiListing` fixture, including status, tags, media, timestamps, and owner reference.

- [ ] **Step 2: Write failing approval and rejection behavior tests**

For approval, the first click without an enhanced token calls `onStepUpRequired` and does not call the API. With a live session, require explicit confirmation, then assert the item disappears only after `approveAdminListing` resolves.

For rejection, assert whitespace blocks the action, a trimmed literal reason is sent after explicit confirmation, and failed requests preserve both the queue item and reason.

- [ ] **Step 3: Write failing main-app administrator rendering test**

Extend `tests/sublet-app-auth-state.test.tsx` with an administrator session and `/admin/trust`; assert the real screen heading `房源审核队列` appears and `apiGet("/trust/queues", "stored-token")` is called only after the current user resolves as `ADMIN`.

- [ ] **Step 4: Run Trust workspace tests and verify RED**

Run:

```bash
pnpm vitest run tests/admin-trust-screen.test.tsx tests/sublet-app-auth-state.test.tsx
```

Expected: the new component/API helpers are missing and the old static Trust screen cannot satisfy the tests.

- [ ] **Step 5: Implement review API helpers and component**

Use exact endpoints:

```ts
apiGet<ApiListing[]>("/admin/listings/review-queue", token)
apiPost<ApiListing>(`/admin/listings/${encodeURIComponent(id)}/approve`, {}, token)
apiPost<ApiListing>(`/admin/listings/${encodeURIComponent(id)}/reject`, { reason }, token)
```

Keep confirmation and rejection reason in per-selected-listing component state. On `ADMIN_REAUTH_REQUIRED`, retain state and call `onStepUpRequired`.

- [ ] **Step 6: Integrate the workspace and administrator-only queue loading**

In `SubletApp`, remove the public mount-time Trust request. Add an effect that clears queue state unless `token && user?.role === "ADMIN"`, then calls `apiGet("/trust/queues", token)`. Render `AdminTrustScreen` for `Trust`, pass the step-up session, and refresh public listings after successful decisions.

- [ ] **Step 7: Run Trust workspace tests and verify GREEN**

Run the Step 4 command. Expected: all targeted tests pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add components/admin-trust-screen.tsx tests/admin-trust-screen.test.tsx lib/api.ts components/sublet-app.tsx tests/sublet-app-auth-state.test.tsx
git commit -m "feat: add administrator listing review workspace"
```

---

### Task 4: Mount and secure the roommate administrator workspace

**Files:**
- Modify: `components/admin-roommates-screen.tsx`
- Modify: `components/sublet-app.tsx`
- Create: `tests/admin-roommates-screen.test.tsx`
- Modify: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- `AdminRoommatesScreen` additionally consumes `stepUpSession: AdminStepUpSession | null` and `onStepUpRequired()`.
- Reads use the ordinary `token`; create/update/archive use only the active enhanced token.

- [ ] **Step 1: Write failing main-render regression test**

With `initialSection="AdminRoommates"`, an administrator stored session, and a successful profile fetch, assert that the real `Roommate Admin` heading and `New profile` button render. This catches the header-only blank page.

- [ ] **Step 2: Write failing protected-write tests**

Render `AdminRoommatesScreen` with complete administrator props. Without step-up, clicking Save calls `onStepUpRequired` and performs no mutation. With a live enhanced session, Save calls `createAdminRoommate("enhanced-token", completeDraft)`.

Add an error case where the API rejects with `ProductApiError.code === "ADMIN_REAUTH_REQUIRED"`; assert the draft text remains and `onStepUpRequired` fires.

- [ ] **Step 3: Run roommate administrator tests and verify RED**

Run:

```bash
pnpm vitest run tests/admin-roommates-screen.test.tsx tests/sublet-app-auth-state.test.tsx
```

Expected: the main render test fails because `AdminRoommates` has no branch, and protected writes still use the ordinary token.

- [ ] **Step 4: Mount the screen and route writes through step-up**

Add the missing main render branch:

```tsx
{activeSection === "AdminRoommates" ? (
  <AdminRoommatesScreen
    token={token}
    user={user}
    stepUpSession={adminStepUpSession}
    onStepUpRequired={() => setAdminStepUpOpen(true)}
    onToast={setToast}
  />
) : null}
```

Update create/update/archive handlers to require `getActiveAdminStepUpToken`. Preserve selected ID and draft on all failures.

- [ ] **Step 5: Run roommate administrator tests and verify GREEN**

Run the Step 3 command. Expected: all targeted tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add components/admin-roommates-screen.tsx components/sublet-app.tsx tests/admin-roommates-screen.test.tsx tests/sublet-app-auth-state.test.tsx
git commit -m "fix: restore roommate administrator workspace"
```

---

### Task 5: Neutral login guidance and complete verification

**Files:**
- Modify: `components/auth-flow-panel.tsx`
- Modify: `tests/auth-flow-panel.test.tsx`
- Modify: any file above only when fresh verification exposes a defect within this specification.

**Interfaces:**
- A successful code-request response without `devCode` enters the code step with an empty field and neutral invite-only guidance.
- A response with a real development code continues to auto-fill it.

- [ ] **Step 1: Write the failing neutral-guidance test**

Mock a development response with no `devCode`, submit an email, and assert:

```ts
expect(findInput(renderer.root, "code").props.value).toBe("");
expect(renderedText(renderer.root)).toContain(
  "如果该邮箱具备测试资格，请输入收到的验证码；否则请联系测试管理员。"
);
expect(onToast).not.toHaveBeenCalledWith("本地开发验证码已填入");
```

This catches regression to an auto-filled unusable code or account-enumerating copy.

- [ ] **Step 2: Run the auth panel test and verify RED**

Run:

```bash
pnpm vitest run tests/auth-flow-panel.test.tsx
```

Expected: the neutral guidance assertion fails.

- [ ] **Step 3: Add neutral guidance**

Render the approved neutral sentence only in the code step when development mode is active and `devCode` was absent. Keep the normal production text unchanged.

- [ ] **Step 4: Run targeted frontend and backend suites**

Run:

```bash
pnpm vitest run tests/admin-step-up.test.tsx tests/admin-trust-screen.test.tsx tests/admin-roommates-screen.test.tsx tests/auth-flow-panel.test.tsx tests/sublet-app-auth-state.test.tsx tests/product-errors.test.ts
pnpm -C api vitest run test/auth.service.spec.ts test/auth-hardening.service.spec.ts test/trust.controller.spec.ts test/listings.controller.spec.ts test/admin-roommates.controller.spec.ts
```

Expected: all targeted tests pass with zero failures.

- [ ] **Step 5: Run full static and test verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm -C api test
pnpm -C api typecheck
pnpm -C api build
```

Expected: every command exits 0.

- [ ] **Step 6: Repeat the three-role browser acceptance pass**

Start an isolated local API/web stack, seed the catalog, and use fresh invited renter, host, and administrator emails. Verify the five browser acceptance cases in the design, including an administrator step-up approval and a roommate write prompt. Check console warnings/errors and confirm the approved listing becomes public.

- [ ] **Step 7: Request independent code review and address findings**

Provide the reviewer the approved specification, plan, base SHA, and final SHA. Fix all Critical and Important findings, rerun the affected tests, then rerun the full verification gate.

- [ ] **Step 8: Commit final verification fixes**

```bash
git add components/auth-flow-panel.tsx tests/auth-flow-panel.test.tsx
git commit -m "fix: clarify invite-only verification guidance"
```

If the review required additional scoped fixes, include those exact files in the same final commit only after their regression tests pass.
