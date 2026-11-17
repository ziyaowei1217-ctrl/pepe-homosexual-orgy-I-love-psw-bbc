# Backend setup for test users

The backend runs on free plans: the API on Render, the database and sign-in (Neon Auth) on Neon, the website on Netlify, rate limits and chat on Upstash Redis. This page lists what an owner has to set up in those accounts. Nothing here can be done from the repository.

## What it costs

| Item | Cost |
| --- | --- |
| Render API, Neon database and Auth, Netlify site, Upstash Redis, GitHub Actions keep-alive | $0 on the free plans |
| Google and email sign-in | $0 |
| Apple sign-in | Apple Developer Program, $99 a year |
| Phone sign-in | Twilio Verify, about $0.05 per verification plus about $0.008 per text; Twilio asks for a prepaid balance (about $20) when you upgrade from the trial |

Free-plan limits that matter during testing:

- Render free web service: sleeps after 15 minutes without requests and takes about a minute to wake. `.github/workflows/keep-api-awake.yml` pings `/api/v1/health` every 10 minutes from 7 AM to 1 AM US Eastern (8 AM to 2 AM during daylight saving time). A workspace gets 750 instance hours a month for all its free services, and the keep-alive uses about 560 in a 31-day month, so keep only this one free web service in the Render workspace. If the hours run out, Render suspends the free services until the next month.
- Neon free: 100 compute hours a month (the database sleeps after 5 minutes idle and does not count while asleep), 5 GB data transfer a month. Render's health check must use `/api/v1/health`: `/api/v1/ready` queries the database, and Render checks every few seconds, which would keep the database awake whenever the API is up and use up the compute hours in under three weeks.
- Upstash free: 500,000 commands a month.

## 1. Database (Neon), before deploying the API

1. Open the Neon console, project psw, branch main, database neondb, then SQL Editor.
2. Paste all of [backend-database-update.sql](backend-database-update.sql) and press Run. It adds the phone-number and account-document tables, gives the API's `psw_runtime` login access, and records both migrations. It skips anything already in place, so it is safe to run again.
3. The last two results should show both migrations as `t` and `runtime_can_write` as `t`.

With an owner connection string in a private shell, `pnpm -C api exec prisma migrate deploy` does the same.

## 2. API (Render)

In the Render dashboard, service psw-connected-api:

1. Settings → Build & Deploy → Branch: `main`.
2. Settings → Health Check Path: `/api/v1/health`.
3. Manual Deploy → Deploy latest commit. Then open `https://psw-connected-api.onrender.com/api/v1/ready`; it should show `"status":"ok"` with the database check `ok`.

## 3. Website (Netlify)

Rebuild and publish with `NEXT_PUBLIC_AUTH_METHODS` listing only the methods that are configured, for example `google,email` now and `google,apple,email,phone` after steps 4 and 5. The build and publish commands are in [connected-demo-deployment.md](connected-demo-deployment.md). A button for a method whose provider is not set up fails when people press it, so add each name only after its provider works.

## 4. Apple sign-in

1. Enroll in the Apple Developer Program (developer.apple.com/programs, $99 a year; approval can take a day or two).
2. Certificates, Identifiers & Profiles → Identifiers → add an App ID with "Sign in with Apple" turned on.
3. Identifiers → add a Services ID (for example `com.psw.web`). Turn on "Sign in with Apple", choose the App ID from step 2, and add:
   - Domain: the host of `NEON_AUTH_BASE_URL` (the `ep-….neonauth….neon.tech` part, without `https://` or a path).
   - Return URL: `NEON_AUTH_BASE_URL` followed by `/callback/apple`.
4. Keys → add a key with "Sign in with Apple" turned on, linked to the App ID. Download the `.p8` file (Apple lets you download it once) and note the Key ID. Your Team ID is shown at the top right of the developer site.
5. Neon console → Auth → OAuth providers → Apple: enter the Services ID, Team ID, Key ID and the contents of the `.p8` file.
6. Add `apple` to `NEXT_PUBLIC_AUTH_METHODS` and republish the website (step 3).

## 5. Phone sign-in and sign-up (Twilio Verify)

1. Sign up at twilio.com and upgrade from the trial (the trial only texts numbers you verify in Twilio).
2. Console → Verify → Services → create a service. Copy its Service SID (starts with `VA`).
3. Console → Account → API keys → create a Standard key. Copy the key SID (starts with `SK`) and the secret (shown once). Copy the Account SID (starts with `AC`) from the console home page.
4. Render → psw-connected-api → Environment: set `PHONE_AUTH_PROVIDER` to `twilio-verify`, add `TWILIO_ACCOUNT_SID`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`, keep `PHONE_AUTH_REGIONS` as `US_CA` (add `,CN` for mainland China mobile numbers), save, and deploy.
5. Add `phone` to `NEXT_PUBLIC_AUTH_METHODS` and republish the website.

New numbers create an account while `PUBLIC_BETA_SIGNUP` is `true` on Render. Sign-up texts are capped at 100 a day for the whole site (`api/src/auth/auth-rate-limit.ts`), which caps the cost at about $6 a day, and one network (for example one campus Wi-Fi address) can use 30 of them. Past either cap a new number gets no text and no error message, and the Render log shows `Phone sign-up code not sent`. If many people will sign up from one place on the same day, ask some of them to use Google or email. Someone sending requests from four or more networks can use up the whole day's 100; the same log line shows it, and phone sign-up recovers as those texts become a day old.

A phone account cannot remove its number (it is the only way to sign in), but it can change to another number in 账户 → 身份与认证 within 15 minutes of signing in. Phone accounts cannot be made administrators.

### If someone takes over a phone account

Someone who has the account open within 15 minutes of its sign-in, for example on a phone the owner lent them, can change its number. The owner's number then no longer reaches the account (signing in with it creates a new, empty account). The website has no way back, so you fix it in the Neon SQL Editor. Find the account's id (`User.id`) from what the owner can tell you, such as the display name or applications; `AuditEvent` rows with action `PHONE_LINKED` show when an account's number changed. Then, with the owner's number in E.164 form (`+1` and ten digits for the US and Canada, `+86` for mainland China):

```sql
-- 1. Free the owner's number. It may belong to the new, empty account now.
DELETE FROM "PhoneIdentity" WHERE "phoneNumber" = '+14155550142';
-- 2. Put it back on the taken account. This also removes the other person's number.
UPDATE "PhoneIdentity" SET "phoneNumber" = '+14155550142', "verifiedAt" = now() WHERE "userId" = 'the account id';
```

Step 2 fails while another account still holds the number, so run step 1 first. The other person's session keeps working until it expires, up to 7 days after it was issued: sessions cannot be ended one at a time. To end it sooner, change `JWT_SECRET` on Render (any new long random value) and deploy; that signs everyone out.

## 6. Email codes and Google (optional before recruiting)

- Email codes come from Neon's shared sender, which Neon describes as meant for development. To send from your own address, choose a custom SMTP provider in the Neon console's Auth settings. A Gmail account with 2-step verification and an app password works for testing: host `smtp.gmail.com`, port 465, the Gmail address as user and sender, the app password as password. Gmail allows about 500 messages a day.
- Google sign-in uses Neon's shared development credentials, so Google's screen does not show the psw name. For your own: Google Cloud console → APIs & Services → OAuth consent screen (External, publish it), then Credentials → OAuth client ID (Web application) with the authorized redirect URI `NEON_AUTH_BASE_URL/callback/google`. Enter the client ID and secret in Neon console → Auth → OAuth providers → Google.

## What is stored for each account

- Saved homes and lists, match preferences, and recently opened homes with the last search are saved to the account (`/api/v1/me/documents`) and follow the user to another device. Guests keep them in the browser; signing in adds a guest's saves to the account. When someone signs out, preference and history changes that have not reached the account yet are sent one more time (if that fails, for example offline, they are lost), and those copies are removed from the browser at once. Saved homes and lists stay in that browser under the account and are sent the next time it signs in there.
- An account keeps up to 50 lists (全部收藏 included), 500 homes in one list and 500 notes of up to 2,000 characters, in at most 64 KB. Past a limit, new changes stay on that device and the saved page says so until the renter deletes some lists, homes or notes.
- Applications, messages, roommate profiles and matches, listings and trips were already stored in the database.
