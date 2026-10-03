# Delivery path: web demo first, mobile distributions later

The deliverable today is a Next.js responsive web client plus the NestJS/PostgreSQL API. The web
client has a mobile viewport and safe-area layouts. It can be demonstrated in phone and desktop
browsers. The repository contains no Xcode project, Android release bundle or WeChat miniapp.
No native wrapper or new product feature was added during this hardening pass.

## Immediate demo criteria

Use the setup and private-LAN steps in [`demo-and-operations.md`](demo-and-operations.md). A public
demo additionally needs HTTPS, provider credentials, a private upload bucket and the production
configuration gate. Local email codes and simulated payments must remain visibly identified as
demo behavior; they do not prove real email or payment acceptance.

Require successful login/profile completion, browse/filter/detail, listing upload, application and
message recovery at 360–430 px phone widths and a desktop width. Check keyboard visibility, modal
focus/escape, touch targets, portrait/landscape, slow requests, expired sessions and reconnects.
Before sharing outside the development team, test Safari on a real iPhone and Chrome on a real
Android phone; browser emulation alone does not certify device behavior.

## API reuse and client boundaries

Existing `/api/v1` JSON endpoints and bearer authorization provide a starting contract for new
clients. Roommate realtime events accelerate the durable HTTP history and unread/read APIs; a
new client must also refresh authoritative state after reconnect. Preserve idempotent mutation
requests, server validation and ownership checks in every client. Keep email, storage, payment and
signing credentials on the server or in the release secret manager.

React DOM components, Next.js routing/middleware, browser `sessionStorage` and the browser upload
picker are client-specific. They cannot simply be copied into a native or miniapp runtime. Design
platform token storage and account/session recovery separately, and never pass bearer tokens in
web-view URLs, deep-link query strings or diagnostics. No WeChat identity-to-account binding or
native credential-storage implementation is included today.

## iOS / App Store

Choose a native client or a carefully evaluated web wrapper after the demo is accepted. A wrapper
does not by itself establish store readiness: Apple guideline 4.2 expects useful app behavior beyond
a repackaged website. Its review guidance also requires complete, stable builds and reviewer access
to account-based functionality. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

Release criteria: a signed and versioned app, reachable production backend, on-device test results,
safe-area/keyboard/background recovery, deliberate deep-link handling and secure credential storage.
This app contains user-generated listings and messaging, so review its moderation, reporting,
blocking and support-contact behavior against guideline 1.2 before submission; do not assume the
existing administrator UI satisfies every requirement. [Apple user-generated-content guidance](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)

## Android / Google Play

Evaluate a native client or owned-site wrapper against the actual product experience. Google Play's
WebView policy prohibits displaying another site's content without permission; its quality policy
requires stable, responsive, useful behavior. Owning this website does not certify the packaged
app's quality. [Google Play WebViews policy](https://support.google.com/googleplay/android-developer/answer/9899034?hl=en),
[Google Play functionality and experience policy](https://support.google.com/googleplay/android-developer/answer/9898783?hl=en)

Release criteria: a signed Android App Bundle, current target-platform requirements checked in Play
Console, real-device tests for back navigation, permissions, uploads, keyboard, deep links and
network recovery, accurate listing/privacy disclosures and a maintained backend. Account setup
includes identity verification; additional testing/device-verification requirements can apply to
new personal accounts. [Play Console account setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en),
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)

## WeChat miniapp

Decide between a native miniapp client and an eligible account's `web-view` route. The official
component documentation requires configuring business domains for `web-view` and currently states
that personal-type miniapps cannot use it. The component also has its own communication constraints;
it is not equivalent to running a normal browser tab. [WeChat web-view documentation](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)

Release criteria: account eligibility confirmed in the platform console, required request/upload/
download/socket and business-domain configurations, trusted HTTPS/WSS endpoints, a separately
designed login/account binding and client session lifecycle, and real-device upload/reconnect tests.
Use the existing API authorization and business rules; do not embed provider secrets or rely on
development-tool domain-check bypasses in a release. [WeChat network documentation](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

These platform documents were checked during this review. Recheck the current official requirements
when a store or miniapp release becomes concrete; this repository review does not certify submission
acceptance.
