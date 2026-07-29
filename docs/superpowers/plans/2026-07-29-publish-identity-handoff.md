# Publish Identity Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a landlord saves valid identity details on the publish route, close the identity panel and move them directly into the listing form.

**Architecture:** Keep profile persistence and publish access decisions in `SubletApp`. Change the auth-panel visibility rule so the publish route pins the panel only while access is blocked, then add a successful-save handoff that clears the explicit panel state, updates the completion message, and scrolls to a stable publish-flow anchor.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, react-test-renderer, in-app browser.

## Global Constraints

- Do not change profile APIs, listing APIs, publish permission rules, or listing fields.
- Preserve identity form drafts and the visible panel when saving fails.
- Preserve the identity panel when saved data still fails the existing publish gate.
- Do not add partial remote listing drafts or change later publish steps.

---

## File Structure

- Modify `components/sublet-app.tsx`: apply the publish-route visibility rule, successful profile-save handoff, completion copy, and stable publish anchor.
- Modify `tests/sublet-app-auth-state.test.tsx`: render an observable auth-panel marker and cover allowed, blocked, and failed save outcomes.

### Task 1: Add the failing publish identity handoff regression

**Files:**
- Modify: `tests/sublet-app-auth-state.test.tsx`
- Test: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Consumes: `AuthFlowPanelProps.onProfileSave(draft: UpdateProfileInput): Promise<ApiProfile | null>`.
- Produces: Regression coverage proving that successful complete landlord saves remove the identity panel while incomplete and failed saves retain it.

- [ ] **Step 1: Make the mocked auth panel observable**

Change the existing mock so it still captures props and also renders a host marker:

```tsx
vi.mock("@/components/auth-flow-panel", () => ({
  AuthFlowPanel: (props: unknown) => {
    authPanelCapture.current = props;
    return <div data-testid="auth-flow-panel" />;
  }
}));
```

Add this helper near `hasButton`:

```tsx
function hasAuthPanel(root: ReactTestInstance) {
  return root.findAllByProps({ "data-testid": "auth-flow-panel" }).length > 0;
}
```

- [ ] **Step 2: Write the successful-save failing test**

Add a test that starts with an incomplete landlord profile, captures the real parent callback, resolves the save to `completeProfile`, and expects the identity panel to disappear:

```tsx
it("hands a completed landlord profile from identity saving into the publish form", async () => {
  writeStoredAuthSession("stored-token");
  vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
  vi.mocked(api.updateMyProfile).mockResolvedValue(completeProfile);
  const renderer = await renderSubletApp("Publish");
  const saveProfile = capturedAuthPanel().onProfileSave;

  expect(hasAuthPanel(renderer.root)).toBe(true);
  expect(hasButton(renderer.root, "保存草稿")).toBe(false);

  await act(async () => {
    await saveProfile({
      displayName: "Maya Chen",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    });
    await flushMicrotasks();
  });

  expect(hasAuthPanel(renderer.root)).toBe(false);
  expect(hasButton(renderer.root, "保存草稿")).toBe(true);
  await unmount(renderer);
});
```

- [ ] **Step 3: Write the blocked and failed-save regression cases**

Add two focused tests:

```tsx
it("keeps identity visible when the saved profile still lacks publish access", async () => {
  writeStoredAuthSession("stored-token");
  vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
  vi.mocked(api.updateMyProfile).mockResolvedValue(incompleteListerProfile);
  const renderer = await renderSubletApp("Publish");
  const saveProfile = capturedAuthPanel().onProfileSave;

  await act(async () => {
    await saveProfile({
      displayName: "",
      school: "",
      city: "",
      role: "lister"
    });
    await flushMicrotasks();
  });

  expect(hasAuthPanel(renderer.root)).toBe(true);
  expect(hasButton(renderer.root, "保存草稿")).toBe(false);
  await unmount(renderer);
});

it("keeps identity visible when profile saving fails", async () => {
  writeStoredAuthSession("stored-token");
  vi.mocked(api.getMyProfile).mockResolvedValue(incompleteListerProfile);
  vi.mocked(api.updateMyProfile).mockRejectedValue({ status: 503 });
  const renderer = await renderSubletApp("Publish");
  const saveProfile = capturedAuthPanel().onProfileSave;

  await act(async () => {
    await saveProfile({
      displayName: "Maya Chen",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    });
    await flushMicrotasks();
  });

  expect(hasAuthPanel(renderer.root)).toBe(true);
  expect(hasButton(renderer.root, "保存草稿")).toBe(false);
  await unmount(renderer);
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/sublet-app-auth-state.test.tsx
```

Expected: the successful-save case fails because the publish route still renders `AuthFlowPanel` after the profile becomes complete. The blocked and failed cases remain green.

- [ ] **Step 5: Commit the failing regression**

```bash
git add tests/sublet-app-auth-state.test.tsx
git commit -m "test: cover publish identity handoff"
```

### Task 2: Implement the successful identity-to-publish handoff

**Files:**
- Modify: `components/sublet-app.tsx:1695-1730`
- Modify: `components/sublet-app.tsx:3883-3950`
- Test: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Consumes: `getPublishAccess({ authenticated, profile, profileStatus })`.
- Produces: successful profile saves on the publish route close the identity panel, show the completion copy, and reveal `#publish-flow`; blocked or failed saves do not.

- [ ] **Step 1: Add a stable publish-flow anchor**

Change the root section in `PublishScreen`:

```tsx
<section
  id="publish-flow"
  className="app-shell app-grid w-full scroll-mt-24 items-start py-5 md:py-6"
>
```

- [ ] **Step 2: Apply the minimal successful-save handoff**

In `handleSaveProfile`, calculate access from the returned profile. Only when the current section is Publish and access is allowed should the panel close and the page move to the publish anchor:

```tsx
const nextPublishAccess = getPublishAccess({
  authenticated: Boolean(token && user),
  profile: updatedProfile,
  profileStatus: "loaded"
});
const shouldContinuePublishing =
  activeSection === "Publish" && nextPublishAccess.status === "allowed";

if (isProfileComplete(updatedProfile)) setOnboardingReason(null);

if (shouldContinuePublishing) {
  setAuthPanelOpen(false);
  setToast("身份已保存，可以开始填写房源");
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      if (typeof document === "undefined") return;
      document.getElementById("publish-flow")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }
} else {
  setToast("资料已保存");
}
```

Do not close the panel in the catch branch.

- [ ] **Step 3: Stop permanently pinning identity after access is allowed**

Replace the unconditional publish-route visibility condition:

```tsx
const showAuthStrip =
  authPanelOpen ||
  pathname.startsWith("/account") ||
  (activeSection === "Publish" && publishAccess.status !== "allowed");
```

Keep `isPinnedToPublish={activeSection === "Publish"}` unchanged so blocked users cannot dismiss the required identity step.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm test -- tests/sublet-app-auth-state.test.tsx
```

Expected: all auth-state tests pass, including successful, incomplete, and failed identity saves.

- [ ] **Step 5: Run the related auth and publish regression tests**

Run:

```bash
pnpm test -- tests/auth-flow-panel.test.tsx tests/sublet-auth-integration.test.ts tests/publish-listing.test.ts tests/sublet-app-auth-state.test.tsx
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 6: Commit the implementation**

```bash
git add components/sublet-app.tsx tests/sublet-app-auth-state.test.tsx
git commit -m "fix: continue publishing after identity save"
```

### Task 3: Verify the real publish journey

**Files:**
- No production file changes expected.
- Verify: `components/sublet-app.tsx`
- Verify: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Consumes: local web at `http://localhost:3000` and API at `http://localhost:4000/api/v1`.
- Produces: evidence that the compiled application and real browser journey satisfy the design.

- [ ] **Step 1: Run the full frontend quality gate**

Run:

```bash
pnpm check
```

Expected: lint, typecheck, all frontend tests, and production build exit successfully.

- [ ] **Step 2: Restart the frontend development server after production build**

Stop the existing `pnpm dev` process and start a fresh one:

```bash
pnpm dev
```

Expected: Next.js reports `Ready` at `http://localhost:3000`.

- [ ] **Step 3: Run the browser acceptance flow**

In the in-app browser:

1. Open `http://localhost:3000/host/listings`.
2. Use an authenticated user whose profile is missing required publish fields or landlord role.
3. Complete display name, school, city, and select landlord.
4. Click “保存资料”.
5. Verify the identity panel disappears.
6. Verify “身份已保存，可以开始填写房源” appears.
7. Verify the first listing step is visible and “下一步” reaches image classification after valid basic details.

Expected: no manual panel close or route refresh is required.

- [ ] **Step 4: Check service health and working tree**

Run:

```bash
curl -fsS http://localhost:3000/ > /dev/null
curl -fsS http://localhost:4000/api/v1/ready
git status --short --branch
```

Expected: web responds, API reports database `ok`, and only pre-existing untracked directories remain.
