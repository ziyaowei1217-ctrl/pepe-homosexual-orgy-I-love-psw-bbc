# Netlify demonstration

This deployment uses the existing Next.js pages and responsive components with a separate,
explicit build flag: `NEXT_PUBLIC_WEBSITE_DEMO=true`. It is a read-only public demonstration,
not the completed NestJS marketplace deployment. No real provider credentials, database,
MinIO instance, payment adapter, email sender or account records are required or connected.

The demonstration supports browsing, search and date filters, listing details, the map,
fictional roommate examples, and the existing device-local saved lists. Every page explains
that the data is fictional. Roommate photos are interior illustrations, not real people;
matching is not calculated. Listing prices, locations and availability are examples only.
Saved lists and notes remain on the browser/device, so visitors should not enter sensitive
information. Image and map requests use the existing public Unsplash and OpenStreetMap
providers, with map attribution preserved. Those providers and Netlify receive ordinary
web requests; this is not a promise that hosting has no request logs.

Login, application, host/admin, messaging, uploads and payments are unavailable. Private
pages show the explanatory demo page. All non-GET/HEAD application requests are rejected;
public data reads use an allowlisted in-process synthetic dispatcher rather than an upstream
API. The API client, moderator downloads, upload transport and realtime transport refuse
real service access. Stored authentication is neither read nor written. CSP keeps script
nonces and restricts connection destinations to this website; no real backend or upload
origin is allowed. The demo page and all Netlify responses discourage search indexing.

## Build and update

`netlify.toml` supplies the pinned Node/pnpm build settings and demonstration variables.
Netlify's maintained OpenNext adapter is needed for App Router server rendering and the
nonce middleware. Deploy the Next project, not `.next/standalone` as a static upload.
No secrets belong in the configuration or source archive.

1. Use the reviewed source branch `hardening-release-2026-09-30`, not the older `main`.
2. Run the normal `pnpm check` with the demo flag unset and the focused demo boundary tests.
3. Build a separate demo with the exact public values in `netlify.toml`. Run it in production
   mode locally, then verify public/private paths, no upstream transports and browser journeys.
4. Deploy only the committed revision. Keep the Netlify site ID in untracked `.netlify/state.json`
   and record the deployed source revision and URL in the handoff outside the source tree.
5. Confirm the actual Netlify deployment preserves CSP nonce/hydration, `private, no-store`
   HTML, security headers, blocked writes, the demo warning and mobile layout. A successful
   local Next build does not certify Netlify adapter behavior.

Update the same Netlify project from later reviewed commits; keep prior deploys available for
rollback. A manual CLI deployment does not by itself configure Git-triggered continuous
deployment. Netlify project/account visibility, plan and usage limits remain provider settings.
Do not enable paid upgrades or add-ons as part of this demonstration.

## Full website later

Render uses its own committed Blueprint and the original Next.js/NestJS structure.
For the full website, leave `NEXT_PUBLIC_WEBSITE_DEMO` unset and rebuild the web app.
The existing production configuration, private provider, payment, recovery and physical-device
acceptance gates still apply. Publishing this demonstration does not satisfy those gates or
prove account, payment, upload or realtime behavior in a real hosting environment.

Official references: [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[deployment methods](https://docs.netlify.com/deploy/create-deploys/).
