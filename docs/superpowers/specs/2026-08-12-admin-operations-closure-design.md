# Administrator Operations Closure Design

## Goal

Complete the local host-to-administrator publication loop and repair the existing administrator roommate workspace without weakening the invite-only login model or administrator step-up controls.

## Confirmed Problems

The browser acceptance pass identified four related gaps:

1. A host can submit a listing, but the website has no usable interface for an administrator to review, approve, or reject it.
2. `/admin/roommates` resolves to the `AdminRoommates` application section, but the main render tree never mounts the existing `AdminRoommatesScreen`, leaving only the global header visible.
3. Invite-only email-code requests intentionally conceal account existence, but development responses currently include an unusable random `devCode` for unknown emails and cooldown requests. The frontend auto-fills that value, creating a misleading verification failure.
4. `/api/v1/trust/queues` exposes internal queue metrics without authentication or administrator authorization.

## Scope

### In scope

- Upgrade `/admin/trust` from a static preview into the administrator operations workspace.
- Display the real submitted-listing review queue.
- Allow an administrator to approve or reject a submitted listing.
- Require a fresh administrator email step-up before every protected administrator write session.
- Keep the step-up token only in component memory and respect the backend's 30-minute validity window.
- Mount the existing roommate administrator screen for `AdminRoommates`.
- Reuse the same step-up flow for roommate create, update, and archive operations.
- Restrict Trust queue metrics to authenticated administrators.
- Stop returning fake development codes when no deliverable login code was created.
- Show neutral invite-only login copy without revealing whether an email is registered or invited.
- Add frontend and backend regression coverage and repeat the three-role browser acceptance pass.

### Out of scope

- Administrator invitation or role management through HTTP or the browser.
- New moderation domains, reporting workflows, payment operations, or production deployment.
- Persisting administrator step-up tokens across reloads or browser sessions.
- Redesigning unrelated marketplace, roommate matching, messaging, or host publishing screens.

## Architecture

### Administrator step-up boundary

A focused reusable frontend component owns the administrator reauthentication state. It receives the ordinary administrator session token and exposes the temporary step-up token only to its administrator workspace children.

The flow is:

1. The administrator logs in through the existing invite-only email-code flow.
2. The administrator opens an administrator workspace and can perform administrator reads with the ordinary session token.
3. Before a protected write, the interface requests an `ADMIN_STEP_UP` email code using the ordinary token.
4. The administrator verifies the code and receives an enhanced access token.
5. Protected writes use the enhanced token until the returned `reauthenticatedUntil` time.
6. Reloading, logging out, changing users, or reaching the expiry clears the enhanced token.

The ordinary session token remains the source for profile/session loading. The enhanced token is never written to `localStorage`.

### Listing review workspace

`/admin/trust` remains the canonical administrator operations route. Its Trust queue cards remain visible, but the page gains a real listing-review section driven by:

- `GET /api/v1/admin/listings/review-queue`
- `POST /api/v1/admin/listings/:id/approve`
- `POST /api/v1/admin/listings/:id/reject`

The review list shows the listing title, area, price, owner reference, trust statement, tags, media, and submission time already returned by the API. Approval uses an explicit confirmation. Rejection requires a trimmed non-empty reason and an explicit confirmation. Successful decisions remove the item from the pending queue and refresh the public catalog. Failed decisions leave the item and form state visible and show an actionable error.

Non-admin users see an administrator-access gate instead of queue data. Signed-out users see a sign-in gate.

### Roommate administrator workspace

The main application render tree mounts `AdminRoommatesScreen` when `activeSection === "AdminRoommates"`. The screen keeps its existing list/editor behavior, but protected create, update, and archive callbacks receive the current in-memory step-up token. Reads continue to use the ordinary administrator session token.

If a write receives `ADMIN_REAUTH_REQUIRED`, the screen retains its draft/selection and opens the step-up prompt. After successful verification, the user explicitly retries the write; the UI does not silently repeat a mutation.

### Trust queue authorization

`TrustController` uses `AuthGuard` and `AdminGuard` for all routes. `TrustModule` imports `AuthModule` so Nest can resolve those guards through the existing shared providers. The frontend only requests Trust queues after loading a current administrator session.

### Invite-only development login

The backend preserves enumeration resistance: requesting a login code returns the same accepted response shape whether the email is eligible or not. The difference is that `devCode` is included only when a real verification record was created and successfully made usable.

Unknown emails and cooldown-suppressed requests return no `devCode`. The frontend therefore does not auto-fill a code in those cases and displays neutral copy: if the address is eligible, use the delivered code; otherwise contact the beta administrator. This copy does not confirm invitation state.

## Data and API Changes

Frontend API helpers will provide typed functions for:

- requesting and verifying administrator step-up;
- reading the administrator listing review queue;
- approving or rejecting a listing with an enhanced token.

The existing `ApiListing` type remains the listing-review representation unless an actually missing returned field requires a small additive type change.

The email-code response keeps `devCode?: string`; its semantics become precise: presence means the returned code corresponds to a usable development verification record.

No database migration is required.

## Error Handling

- `401`: clear the ordinary session through the existing authentication-error path.
- ordinary administrator `403`: show the administrator-access gate.
- `ADMIN_REAUTH_REQUIRED`: preserve the pending UI state and request administrator step-up.
- invalid or expired step-up code: keep the prompt open with the mapped product error.
- invalid rejection reason: prevent submission locally and retain the reason.
- review or roommate mutation failure: retain the selected record/draft and show an error; never display optimistic success.
- listing review refresh failure after a successful mutation: show that the decision succeeded but the view needs a manual refresh.

## Security Requirements

- All Trust queue reads require current administrator authorization.
- Listing and roommate administrator writes continue to require `AdminStepUpGuard`.
- Step-up tokens remain memory-only and are cleared on logout, user change, reload, and expiry.
- No code, access token, authorization header, email delivery secret, or sensitive response body is logged or rendered outside the intended development code field.
- Login copy must not reveal whether an email exists, is invited, or is cooling down.

## Testing

### Backend

- Controller metadata proves Trust queues require `AuthGuard` and `AdminGuard`.
- Unknown and cooldown-suppressed login requests omit `devCode` while preserving the accepted response shape.
- Eligible development login requests still return a usable `devCode`.
- Existing administrator step-up and listing review authorization tests remain green.

### Frontend

- The main application renders `AdminRoommatesScreen` for `AdminRoommates`.
- Signed-out and non-admin users see gates for administrator screens.
- The Trust workspace loads submitted listings for an administrator.
- Approve and reject require a valid step-up token and update the queue only after server success.
- Rejection blocks empty reasons.
- Roommate writes use the enhanced token and preserve drafts on step-up-required errors.
- A development email response without `devCode` does not auto-fill the code field and displays neutral invite-only guidance.

### Browser acceptance

Run the local application and verify:

1. A normal invited user can log in, complete a renter profile, browse listings and roommates, and open a landlord conversation.
2. A host can log in, complete a host profile, submit a listing, and see it as under review but not public.
3. An administrator can log in, view the submitted listing, complete step-up, approve or reject it, and observe the correct public/host status.
4. The administrator roommate page renders profiles and prompts for step-up before a write.
5. Signed-out and ordinary users cannot read Trust queue data or use administrator workspaces.

## Acceptance Criteria

- The host-to-admin-to-public listing journey can be completed entirely through the website.
- `/admin/roommates` never renders a header-only blank page.
- Protected administrator writes cannot succeed with only an ordinary login token.
- Trust queue metrics are not readable without current administrator authorization.
- Unknown or cooldown-suppressed email requests never produce an auto-filled unusable development code.
- All targeted tests, type checks, builds, and three-role browser checks pass without new console errors.
