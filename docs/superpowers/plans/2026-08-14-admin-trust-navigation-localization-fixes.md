# Admin Trust, Navigation, and Localization Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make approved public listings display platform-reviewed trust, give administrators two discoverable direct navigation entries, and fully localize the roommate administrator workspace into Chinese.

**Architecture:** Keep the submitted trust declaration unchanged in storage and derive the public trust presentation from the authoritative `APPROVED` status at the API boundary. Add a role-gated administrator tool row to the existing header using the existing route map. Translate only fixed roommate-administration chrome and feedback while preserving profile data and all existing authorization behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript, NestJS 10, Prisma 6, Vitest, react-test-renderer, Tailwind CSS.

## Global Constraints

- Do not add or migrate database fields.
- Do not overwrite the stored publisher trust declaration.
- Do not change administrator authorization or 30-minute step-up behavior.
- Show administrator navigation only when the resolved session user has `role === "ADMIN"`.
- Keep existing roommate profile data unchanged; translate only fixed product chrome and feedback.
- Do not implement date filtering, uploads, applications, payments, escrow, roommate DM, or group confirmation.
- Preserve unrelated working-tree changes and stage only files owned by each task.

---

### Task 1: Normalize Approved Trust at the Public API Boundary

**Files:**
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/src/listings/listings.service.ts`

**Interfaces:**
- Consumes: persisted listing records with `status: "APPROVED"` and a publisher-supplied `trust: string`.
- Produces: `approvedPublicTrust(trust: string): string` and `presentApprovedListing<T extends { trust: string }>(listing: T): T`, used only by `ListingsService.findAll()` and `ListingsService.findOne()`.

- [ ] **Step 1: Write failing public-list trust tests**

Add focused tests next to the existing public discovery test. Each literal expectation must be hand-derived and must prove the public response changes while the source fixture remains unchanged.

```ts
it.each([
  ["房东知情声明 · 待平台审核", "房东知情声明 · 平台已审核"],
  ["待审核", "平台已审核"],
  [".edu verified", ".edu verified · 平台已审核"],
  ["", "平台已审核"],
  ["房东知情 · 平台已审核", "房东知情 · 平台已审核"]
])("presents approved public trust without mutating the stored declaration", async (trust, expectedTrust) => {
  const stored = listingRecord({ id: "approved", status: "APPROVED", trust });
  const prisma = createPrismaMock({ listings: [stored] });
  const service = new ListingsService(prisma as never, new AuditService());

  await expect(service.findAll()).resolves.toMatchObject([
    { id: "approved", status: "APPROVED", trust: expectedTrust }
  ]);
  expect(stored.trust).toBe(trust);
});

it("presents the same approved trust semantics on public detail reads", async () => {
  const prisma = createPrismaMock({
    listings: [listingRecord({
      id: "approved",
      status: "APPROVED",
      trust: "房东知情声明 · 待平台审核"
    })]
  });
  const service = new ListingsService(prisma as never, new AuditService());

  await expect(service.findOne("approved")).resolves.toMatchObject({
    id: "approved",
    trust: "房东知情声明 · 平台已审核"
  });
});
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run:

```bash
pnpm --dir api exec vitest run test/listings.service.spec.ts
```

Expected: the new expectations fail because public reads return the stored pending or declaration-only trust string.

- [ ] **Step 3: Implement the minimal public presentation helpers**

Add pure helpers at the bottom of `api/src/listings/listings.service.ts`:

```ts
function approvedPublicTrust(value: string) {
  const trust = value.trim();
  if (!trust) return "平台已审核";
  if (trust.includes("平台已审核")) return trust;
  if (trust.includes("待平台审核")) {
    return trust.replaceAll("待平台审核", "平台已审核");
  }
  if (trust.includes("待审核")) {
    return trust.replaceAll("待审核", "平台已审核");
  }
  return `${trust} · 平台已审核`;
}

function presentApprovedListing<T extends { trust: string }>(listing: T): T {
  return { ...listing, trust: approvedPublicTrust(listing.trust) };
}
```

Change only the two public readers:

```ts
return records.map(presentApprovedListing);
```

and:

```ts
if (record?.status === "APPROVED") return presentApprovedListing(record);
```

Do not call the helper from `findMine`, `findReviewQueue`, `approve`, or `reject`.

- [ ] **Step 4: Run the focused API test and verify GREEN**

Run:

```bash
pnpm --dir api exec vitest run test/listings.service.spec.ts
```

Expected: all listing service tests pass with zero failures.

- [ ] **Step 5: Commit the API fix**

```bash
git add api/test/listings.service.spec.ts api/src/listings/listings.service.ts
git commit -m "fix: present approved listing trust consistently"
```

---

### Task 2: Add Two Role-Gated Administrator Navigation Entries

**Files:**
- Modify: `tests/sublet-app-auth-state.test.tsx`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: resolved `SessionUser | null`, current `AppSection`, and the existing `onSectionChange(section)` callback.
- Produces: an administrator tool row with direct `Trust` and `AdminRoommates` actions. Existing `routeForSection` continues to map those sections to `/admin/trust` and `/admin/roommates`.

- [ ] **Step 1: Write failing visibility and routing tests**

Add these tests to `SubletApp auth state flow`:

```tsx
it("shows two direct administrator tools and routes each one for an ADMIN session", async () => {
  navigationMock.pathname = "/";
  writeStoredAuthSession("stored-admin-token");
  vi.mocked(api.getSessionUser).mockResolvedValue({ ...user, role: "ADMIN" });
  const renderer = await renderSubletApp("Discover");

  expect(renderedText(renderer.root)).toContain("管理员工具");
  expect(hasButton(renderer.root, "房源审核")).toBe(true);
  expect(hasButton(renderer.root, "室友管理")).toBe(true);

  await act(async () => {
    clickButton(renderer.root, "房源审核");
    await flushMicrotasks();
  });
  expect(navigationMock.push).toHaveBeenCalledWith("/admin/trust");

  await act(async () => {
    clickButton(renderer.root, "室友管理");
    await flushMicrotasks();
  });
  expect(navigationMock.push).toHaveBeenCalledWith("/admin/roommates");
  await unmount(renderer);
});

it("does not expose administrator tools to an ordinary authenticated user", async () => {
  navigationMock.pathname = "/";
  writeStoredAuthSession("stored-user-token");
  vi.mocked(api.getSessionUser).mockResolvedValue(user);
  const renderer = await renderSubletApp("Discover");

  expect(renderedText(renderer.root)).not.toContain("管理员工具");
  expect(hasButton(renderer.root, "房源审核")).toBe(false);
  expect(hasButton(renderer.root, "室友管理")).toBe(false);
  await unmount(renderer);
});
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run:

```bash
pnpm exec vitest run tests/sublet-app-auth-state.test.tsx
```

Expected: the ADMIN test fails because the two direct buttons and administrator tool row do not exist.

- [ ] **Step 3: Implement the role-gated tool row**

Remove `Trust` from the general `navItems` array so ordinary mobile users no longer receive a hidden administrative route. Keep `Publish` as the only secondary general navigation item.

Add a dedicated constant:

```ts
const adminNavItems: Array<{ label: string; section: AppSection }> = [
  { label: "房源审核", section: "Trust" },
  { label: "室友管理", section: "AdminRoommates" }
];
```

Inside `AppHeader`, derive:

```ts
const visibleAdminItems = user?.role === "ADMIN" ? adminNavItems : [];
```

Render the following directly below the main header row and before notification content:

```tsx
{visibleAdminItems.length > 0 ? (
  <div className="border-t border-blue-100 bg-blue-50/70">
    <div className="app-shell flex flex-wrap items-center gap-2 py-2">
      <span className="mr-1 text-xs font-black text-[#006AFF]">管理员工具</span>
      {visibleAdminItems.map((item) => {
        const Icon = navIcons[item.section];
        return (
          <Button
            key={item.section}
            type="button"
            size="sm"
            variant={activeSection === item.section ? "default" : "outline"}
            onClick={() => onSectionChange(item.section)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {item.label}
          </Button>
        );
      })}
    </div>
  </div>
) : null}
```

The row intentionally remains visible at all breakpoints, so no second mobile-only administrator menu is required.

- [ ] **Step 4: Run the focused frontend test and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/sublet-app-auth-state.test.tsx
```

Expected: all auth-state tests pass and both route assertions use the existing router mock.

- [ ] **Step 5: Commit the navigation fix**

```bash
git add tests/sublet-app-auth-state.test.tsx components/sublet-app.tsx
git commit -m "fix: expose administrator workspaces in navigation"
```

---

### Task 3: Localize the Roommate Administrator Workspace

**Files:**
- Modify: `tests/admin-roommates-screen.test.tsx`
- Modify: `tests/sublet-app-auth-state.test.tsx`
- Modify: `components/admin-roommates-screen.tsx`

**Interfaces:**
- Consumes: existing roommate profile values and existing administrator API callbacks.
- Produces: Chinese fixed UI chrome, Chinese status labels, and Chinese success/error feedback without changing API payloads or authorization branches.

- [ ] **Step 1: Change interaction tests to the desired Chinese contract**

Before touching production code, update all button and field references in `tests/admin-roommates-screen.test.tsx` using this literal mapping:

```text
Refresh → 刷新
New profile → 新建资料
Save profile → 保存资料
Archive → 归档
Name → 姓名
Age → 年龄
Base match → 基础匹配度
Role → 身份描述
Image URL → 图片链接
Budget → 预算
Commute → 通勤区域
Tags, comma-separated → 标签（逗号分隔）
```

Update feedback expectations to Chinese and add one complete chrome test:

```tsx
it("renders the roommate administrator workspace in Chinese", async () => {
  vi.mocked(api.getAdminRoommates).mockResolvedValue([existingProfile]);
  const renderer = await renderScreen();
  const text = renderedText(renderer.root);

  expect(text).toContain("室友资料管理");
  expect(text).toContain("新增、调整和归档用于匹配推荐的室友资料。");
  expect(text).toContain("编辑 Avery Chen");
  expect(text).toContain("基础匹配度 92%");
  expect(text).toContain("启用");
  expect(text).not.toContain("Roommate Admin");
  expect(text).not.toContain("Save profile");
  await unmount(renderer);
});
```

Add permission-copy coverage:

```tsx
it("shows Chinese administrator gates", async () => {
  const signedOut = await renderScreen({ token: null, user: null });
  expect(renderedText(signedOut.root)).toContain("请先登录管理员账户");
  await unmount(signedOut);

  const ordinary = await renderScreen({ user: { ...admin, role: "USER" } });
  expect(renderedText(ordinary.root)).toContain("需要管理员权限");
  await unmount(ordinary);
});
```

In `tests/sublet-app-auth-state.test.tsx`, change the existing administrator-roommate mount assertions from `Roommate Admin` and `New profile` to `室友资料管理` and `新建资料`.

- [ ] **Step 2: Run the focused roommate administrator tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/admin-roommates-screen.test.tsx tests/sublet-app-auth-state.test.tsx
```

Expected: tests fail on English production labels and feedback; the failures must identify missing Chinese behavior rather than missing test setup.

- [ ] **Step 3: Translate fixed component chrome and feedback**

Apply these exact production strings in `components/admin-roommates-screen.tsx`:

```text
Roommate Admin → 室友资料管理
Add, tune, and archive profiles used by the swipe deck. → 新增、调整和归档用于匹配推荐的室友资料。
Refresh → 刷新
New profile → 新建资料
Edit {name} → 编辑 {name}
Create roommate profile → 新建室友资料
Saving... → 保存中…
Save profile → 保存资料
Archive → 归档
active → 启用
hidden → 已归档
{match}% base → 基础匹配度 {match}%
```

Use the field-label mapping from Step 1. Change the new-profile default role value to `UCLA · 研究生 · 2026 秋季`.

Use these feedback messages:

```ts
onToastRef.current(`已加载 ${nextProfiles.length} 位室友资料`);
onToastRef.current(`加载室友资料失败：${productError.message}`);
onToast(`${saved.name} 已保存，匹配推荐将使用这份资料。`);
onToast(`保存失败：${productError.message}`);
onToast(`${archived.name} 已归档，已从活跃推荐中移除。`);
onToast(`归档失败：${productError.message}`);
```

Use these gates:

```tsx
<AdminRoommatesGate
  title="请先登录管理员账户"
  detail="登录管理员账户后可以管理室友匹配资料。"
/>

<AdminRoommatesGate
  title="需要管理员权限"
  detail="此工作台只对负责匹配目录的管理员开放。"
/>
```

Do not change `getActiveAdminStepUpToken`, mutation calls, error-code branches, or draft field names.

- [ ] **Step 4: Run the focused frontend tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/admin-roommates-screen.test.tsx tests/sublet-app-auth-state.test.tsx
```

Expected: all tests pass with Chinese labels driving the same real component interactions.

- [ ] **Step 5: Commit the localization fix**

```bash
git add tests/admin-roommates-screen.test.tsx tests/sublet-app-auth-state.test.tsx components/admin-roommates-screen.tsx
git commit -m "fix: localize roommate administration workspace"
```

---

### Task 4: Full Verification and Browser Regression

**Files:**
- Verify only; modify production or test files only if a failure reveals a requirement regression.

**Interfaces:**
- Consumes: all changes from Tasks 1–3.
- Produces: fresh test, typecheck, build, and browser evidence for the three repaired user-visible behaviors.

- [ ] **Step 1: Run complete automated verification**

Run each command separately and require exit code 0:

```bash
pnpm test
pnpm --dir api test
pnpm typecheck
pnpm --dir api typecheck
pnpm build
pnpm --dir api build
```

Expected: zero failed tests, zero TypeScript errors, and successful frontend and API builds.

- [ ] **Step 2: Start the local stack without disturbing unrelated port 3000 services**

Use the existing PostgreSQL service on port 5432, then start the API with a dedicated frontend origin and the frontend on port 3100:

```bash
LOCAL_ADMIN_EMAILS='admin.qa@example.edu' WEB_ORIGIN='http://127.0.0.1:3100' DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api dev
NEXT_PUBLIC_API_BASE_URL='http://localhost:4000/api/v1' pnpm exec next dev -H 127.0.0.1 -p 3100
```

- [ ] **Step 3: Verify the three repaired behaviors in the browser**

Using `admin.qa@example.edu` in the local development login flow:

1. Confirm the header shows “管理员工具”, “房源审核”, and “室友管理”.
2. Open both direct entries and confirm each reaches its existing workspace.
3. In `/admin/roommates`, confirm the workspace chrome, controls, field labels, status labels, gates, and feedback are Chinese.
4. Return to public discovery, search for an approved listing whose stored declaration previously contained “待平台审核”, and confirm its card and detail both show “平台已审核”.
5. Confirm browser console warnings/errors remain empty for these flows.

- [ ] **Step 4: Stop only the temporary API and port-3100 frontend processes**

Leave the pre-existing port 3000 service and PostgreSQL container untouched.

- [ ] **Step 5: Review the final diff and commit any verification-only correction**

Run:

```bash
git diff --check
git status --short
git diff -- api/src/listings/listings.service.ts api/test/listings.service.spec.ts components/sublet-app.tsx components/admin-roommates-screen.tsx tests/sublet-app-auth-state.test.tsx tests/admin-roommates-screen.test.tsx
```

Expected: no whitespace errors, only planned files changed, and unrelated user files remain unstaged.
