# Account security workflow contract

Scope: the 2026-10-12 readiness fixes preserve ordinary invited-email sign-in. Independent TOTP/recovery proof gates high-risk administrator and production fund operations at the API. Frontend state is guidance; backend authorization remains authoritative.

- `/account/verification` reads current MFA status, offers enrollment when disabled, and displays remaining recovery-code count when enabled.
- Enrollment requires a recent email login. The setup secret remains in component memory, starts masked and may be manually revealed. Confirming a valid TOTP enables MFA and returns an enhanced access token for the same account and session.
- Confirmation returns recovery codes once. The account keeps this memory-only disclosure bound to the current token; it installs the enhanced token only after the user confirms safe storage. This avoids losing recovery codes when the root saved-listings provider remounts on token rotation. Leaving the page, logging out or changing the active token hides the disclosure. Secrets and codes are never logged or written to local/session storage.
- Verification accepts either a six-digit TOTP or one recovery code, never both. A successful recovery proof consumes that code. Switching methods clears the old input.
- Disable requires an explicit inline confirmation and a valid independent proof plus recent email login. Its warning explains that recovery codes expire and sensitive operations require reenrollment.
- Confirming enrollment or disabling MFA revokes other devices' sessions. Both confirmation surfaces announce this; the current device remains signed in.
- Network errors preserve input and offer retry. Expired/recent-login errors offer email reauthentication through the existing revocable logout flow; logout failure retains credentials and shows retry feedback.
- Async responses are ignored after unmount or account/token change. Duplicate mutations are blocked while pending.
- Administrator step-up uses independent MFA; unenrolled accounts are directed to enrollment. Successful proof updates the existing enhanced-token state before ordinary-token rotation. The validity window comes from the server.
- Listing withdrawal merges a sparse mutation response into the current application so listing title and presentation fields remain visible.
- Listing server render and initial hydration share the server LA date snapshot. The client refreshes current date after mounting and when the window regains focus; invalid date choices remain blocked.

Verification evidence belongs in `output/strict-retest-2026-10-12/browser`. Automated accessibility checks and basic keyboard checks are limited evidence, not conformance certification.
