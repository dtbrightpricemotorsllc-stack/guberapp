# GUBER — Backup & Restore Guide

Complete instructions for rebuilding GUBER from scratch on a new machine.

---

## Table of Contents

1. [Restore Source Code from GitHub](#1-restore-source-code-from-github)
2. [Restore the Database](#2-restore-the-database)
3. [Required Environment Variables](#3-required-environment-variables)
4. [Firebase Setup](#4-firebase-setup)
5. [Stripe Setup](#5-stripe-setup)
6. [Codemagic Deployment (iOS CI/CD)](#6-codemagic-deployment-ios-cicd)
7. [Android Deployment](#7-android-deployment)
8. [iOS Deployment](#8-ios-deployment)
9. [Post-Restore Verification Checklist](#9-post-restore-verification-checklist)

---

## 1. Restore Source Code from GitHub

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | Bundled with Node.js |
| Git | Any recent | https://git-scm.com |
| PostgreSQL | 14+ | https://postgresql.org (or use cloud provider) |

### Clone the repository

```bash
git clone https://github.com/dtbrightpricemotorsllc-stack/Guber-private-.git guber
cd guber
```

### Install dependencies

```bash
npm install
```

> **Important:** Do not run `npm ci` unless you are on a CI system that has a matching `package-lock.json`. Run `npm install` for first-time local setup.

### Set up environment variables

```bash
cp GUBER_DISASTER_RECOVERY/03-environment-variables.env.example .env
# Edit .env and fill in all REQUIRED values (see Section 3)
```

### Start the server (first boot auto-provisions the database)

```bash
npm run dev
```

On first boot, `server/index.ts` automatically runs all `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements. **No manual migration step is needed.** All provisioning is idempotent.

### Verify it's running

```bash
curl http://localhost:5000/api/health
# → 200 OK
```

### Build for production

```bash
NODE_ENV=production npm run build
npm start
```

Output goes to `dist/public/`. Express serves it automatically.

---

## 2. Restore the Database

### Option A — Restore from a pg_dump backup file

If you have a dump from the old server:

```bash
# Export from old server
pg_dump $OLD_DATABASE_URL -F c -f guber_backup_$(date +%Y%m%d).dump

# Restore to new PostgreSQL instance
pg_restore -d $NEW_DATABASE_URL guber_backup_YYYYMMDD.dump
```

Then set `DATABASE_URL=$NEW_DATABASE_URL` in your environment.

### Option B — Fresh database (no backup)

If no dump exists, the server recreates all tables automatically on first boot:

1. Create a PostgreSQL database (Replit Database panel, Neon, Supabase, Railway, or local Postgres).
2. Set `DATABASE_URL=postgresql://user:password@host:5432/dbname` in your environment.
3. Run `npm run dev` — all tables are created on startup.

No data will be present, but the schema will be complete.

### Option C — Replit (recommended for production)

On Replit, attach a PostgreSQL database via the **Database** panel. `DATABASE_URL` is injected automatically. The database auto-backs up daily; use the Database panel to restore a snapshot.

### Schema reference

The complete schema is in two places:
- **`shared/schema.ts`** — Drizzle ORM source of truth
- **`GUBER_DISASTER_RECOVERY/02-sql-migrations.sql`** — raw SQL for every table (use to manually recreate if needed)

### Important database rules

- `custody_events` is append-only — `UPDATE` and `DELETE` are blocked at the DB level.
- All schema changes are additive (`ADD COLUMN IF NOT EXISTS`). Rolling back a column requires a manual `ALTER TABLE DROP COLUMN`.
- Never run `npm run db:push` in production. It is a development-only tool.

---

## 3. Required Environment Variables

Set all of these in your hosting platform's secrets panel (Replit Secrets, Railway Variables, etc.). Never commit actual values to git.

### Core

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NODE_ENV` | ✅ | Set to `production` in prod |
| `SESSION_SECRET` | ✅ | 64-byte hex — `openssl rand -hex 64` |
| `PORT` | optional | Default: 5000 |
| `APP_BASE_URL` | ✅ | `https://guberapp.app` |
| `APP_URL` | ✅ | Same as `APP_BASE_URL` |

### Stripe

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | ✅ | `sk_live_...` — main account |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `whsec_...` — from Stripe Dashboard |
| `STRIPE_PAYROLL_TRUST_BOX_PRICE_ID` | ✅ | Trust Box recurring price ID |
| `STRIPE_CONNECT_SECRET_KEY` | ✅ | Same as `STRIPE_SECRET_KEY` (set separately for rotation) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | ✅ | `whsec_...` — Connect webhook |

### Google

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | ✅ | Web OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Web OAuth Client Secret |
| `GOOGLE_ANDROID_CLIENT_ID` | ✅ | Android OAuth Client ID |
| `GOOGLE_MAPS_API_KEY` | ✅ | Browser-restricted Maps JS key |
| `VITE_GOOGLE_MAPS_API_KEY` | ✅ | Same as above (for local dev) |
| `GOOGLE_GEOCODING_API_KEY` | ✅ | Server-side key (no HTTP-referer restriction) |
| `VITE_GOOGLE_WEB_CLIENT_ID` | ✅ | Frontend Google Sign-In client ID |

### Apple Push Notifications (APNs)

| Variable | Required | Description |
|----------|----------|-------------|
| `APNS_KEY_ID` | ✅ | 10-character key ID from Apple Developer Portal |
| `APNS_TEAM_ID` | ✅ | 10-character Apple Team ID |
| `APNS_PRIVATE_KEY` | ✅ | Full `.p8` file contents (with `-----BEGIN/END PRIVATE KEY-----`) |
| `APNS_BUNDLE_ID` | ✅ | `com.guber.app` |
| `APPLE_TEAM_ID` | ✅ | Same as `APNS_TEAM_ID` |

### Firebase (Android push)

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Full JSON of Firebase Admin SDK service account key |

### VAPID (Web Push)

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPID_PUBLIC_KEY` | ✅ | Generate once: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | ✅ | Paired with public key above |
| `VAPID_EMAIL` | ✅ | `mailto:support@guberapp.app` |

> **Warning:** VAPID keys must stay stable. Changing them invalidates all existing web push subscriptions — users won't receive notifications until they re-subscribe.

### Cloudinary (media storage)

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDINARY_CLOUD_NAME` | ✅ | From Cloudinary Dashboard |
| `CLOUDINARY_API_KEY` | ✅ | From Cloudinary Dashboard |
| `CLOUDINARY_API_SECRET` | ✅ | From Cloudinary Dashboard |

### AI / Media Generation

| Variable | Required | Description |
|----------|----------|-------------|
| `FAL_KEY` | ✅ for Studio | Without this, all `/api/studio/generate/*` routes return 503 |
| `OPENAI_API_KEY` | ✅ | Content moderation + AI-or-Not detection |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ✅ | Same key via Replit AI integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | ✅ | `https://api.openai.com/v1` |
| `HF_TOKEN` | optional | Hugging Face (some AI-or-Not model calls) |

### Email

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | ✅ | `re_...` from Resend dashboard |
| `RESEND_FROM_DOMAIN` | ✅ | `guberapp.app` (must be verified in Resend) |

### Security & Signing

| Variable | Required | Description |
|----------|----------|-------------|
| `RELEASE_CODE_SECRET` | ✅ | HMAC key for VRS release codes — `openssl rand -hex 64`. **Never change after launch** — changing it invalidates all existing codes |
| `GUBER_SHARED_SECRET` | ✅ | Mobile checkout token bridge + wearable endpoints |
| `JWT_SECRET` | ✅ | Wearable / hands-free token signing |

### Background Jobs & Cron

| Variable | Required | Description |
|----------|----------|-------------|
| `DISABLE_BACKGROUND_JOBS` | ✅ in prod | Set to `true` — disables in-process cron timers |
| `CRON_SECRET` | ✅ | `openssl rand -hex 32` — authenticates cron trigger and Mission Control |

### Production cron trigger

With `DISABLE_BACKGROUND_JOBS=true`, run jobs via external scheduler (every 5–15 min):

```bash
curl -fsS -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://guberapp.app/api/internal/cron/run
```

---

## 4. Firebase Setup

Firebase is used **only for Android push notifications** via FCM. iOS uses APNs directly. Web uses VAPID.

### Step 1 — Create Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `guber-app`
3. Disable Google Analytics (not used)
4. Click **Create project**

### Step 2 — Add Android app

1. In the project → **Add app** → Android
2. Android package name: `com.guber.app`
3. Click **Register app**
4. Download `google-services.json`
5. Place it at `android/app/google-services.json`

> This file is gitignored. Back it up in a secure vault. Without it, Android builds will fail.

### Step 3 — Generate Admin SDK service account

1. Firebase Console → **Project Settings** (gear icon) → **Service accounts** tab
2. Click **Generate new private key** → download the JSON file
3. Set the entire JSON as the `FIREBASE_SERVICE_ACCOUNT` environment variable:

```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"guber-app",...}'
```

### Step 4 — FCM is enabled by default

No additional Firebase Console configuration is needed. FCM is active on all new projects.

### APNs setup (iOS — separate from Firebase)

1. Apple Developer Portal → **Certificates, Identifiers & Profiles** → **Keys**
2. Create new key → enable **Apple Push Notifications service (APNs)**
3. Download the `.p8` file **(only downloadable once — store in a secure vault)**
4. Note the **Key ID** and your **Team ID**
5. Set environment variables:

```env
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGH...\n-----END PRIVATE KEY-----
APNS_BUNDLE_ID=com.guber.app
```

### VAPID setup (web push)

Generate once — do not regenerate unless you intentionally want to reset all web subscriptions:

```bash
npx web-push generate-vapid-keys
# → Paste output into VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars
```

---

## 5. Stripe Setup

GUBER uses two separate Stripe payment rails.

### Step 1 — Create Stripe account

1. Go to https://dashboard.stripe.com
2. Create a **platform account** (not a Connect sub-account)
3. Enable **Stripe Connect** in Dashboard → Connect → Settings

### Step 2 — Get API keys

```
Dashboard → Developers → API keys
  Secret key → STRIPE_SECRET_KEY (and STRIPE_CONNECT_SECRET_KEY)
```

Use `sk_test_...` for development, `sk_live_...` for production.

### Step 3 — Register Webhook 1 (main account)

```
Dashboard → Developers → Webhooks → Add endpoint
  URL: https://guberapp.app/api/webhooks/stripe
  Events:
    - checkout.session.completed
    - customer.subscription.updated
    - customer.subscription.deleted
    - invoice.payment_succeeded
    - invoice.payment_failed
  Signing secret → STRIPE_WEBHOOK_SECRET
```

### Step 4 — Register Webhook 2 (Stripe Connect)

```
Dashboard → Developers → Webhooks → Add endpoint
  URL: https://guberapp.app/api/webhooks/stripe-connect
  Listen to: Connect account events
  Events:
    - payment_intent.succeeded
    - payment_intent.payment_failed
    - transfer.created
    - account.updated
    - payout.paid
    - payout.failed
  Signing secret → STRIPE_CONNECT_WEBHOOK_SECRET
```

### Step 5 — Create Trust Box subscription product

```
Dashboard → Products → Create product
  Name: GUBER Trust Box
  Pricing: Recurring, monthly
  → Copy the Price ID → STRIPE_PAYROLL_TRUST_BOX_PRICE_ID
```

All other product prices (Studio credits, job payments, etc.) are created dynamically at checkout time via `price_data` — no additional Stripe Dashboard setup required.

### Step 6 — Configure Stripe Connect settings

```
Dashboard → Connect → Settings
  → Allow users to receive payouts: Yes
  → Set platform fee percentage as needed
```

### Test Stripe locally

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:5000/api/webhooks/stripe
stripe listen --forward-to localhost:5000/api/webhooks/stripe-connect

# Test cards
4242 4242 4242 4242  → Success
4000 0025 0000 3155  → Requires authentication
4000 0000 0000 9995  → Decline
```

---

## 6. Codemagic Deployment (iOS CI/CD)

iOS builds are done entirely through Codemagic. The full pipeline is defined in `codemagic.yaml` at the repo root.

### Step 1 — Connect repo to Codemagic

1. Go to https://codemagic.io
2. **Add application** → connect GitHub → select `Guber-private-`
3. Codemagic will detect `codemagic.yaml` automatically

### Step 2 — Upload code signing assets

In Codemagic → **Code Signing** section:

| Asset | Where to get it |
|-------|----------------|
| Distribution certificate | Keychain Access (export `GUBER_iOS_Distribution` as `.p12`) or re-download from Apple Developer Portal → Certificates |
| Provisioning profile | Apple Developer Portal → Profiles → `GUBER_Profile_v3` (com.guber.app, App Store) |

Upload both under **iOS code signing identities**.

> The pipeline automatically fetches the latest profile from Apple at build time — the uploaded profile is a fallback only.

### Step 3 — Set environment variables in Codemagic

Create an environment group named **`Default`** in Codemagic → Environment variables:

| Variable | Description |
|----------|-------------|
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API key issuer ID |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | App Store Connect API key ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Contents of `AuthKey_XXXXXX.p8` |

To get these:
1. App Store Connect → Users and Access → **Integrations** → App Store Connect API
2. Generate a new API key with **Developer** role
3. Download the `.p8` file **(only available once)**
4. Copy the Issuer ID and Key ID from the dashboard

### Step 4 — Trigger a build

- **Auto:** Push to the `main` branch (set up a Codemagic webhook on GitHub)
- **Manual:** Codemagic Dashboard → **Start new build** → select `ios-app-store` workflow

### What the pipeline does (in order)

1. `npm ci` — install dependencies from `package-lock.json`
2. `npm run build` — build React app to `dist/public/`
3. `npx cap sync ios` — copy web assets into the Xcode project
4. Resolve Swift Package Manager dependencies
5. Initialize macOS keychain and install signing certificate
6. Wipe any stale pre-installed provisioning profiles
7. Fetch the current profile from Apple via App Store Connect API
8. Patch Xcode project with the fresh profile UUID
9. `xcodebuild archive` → produces `.xcarchive`
10. `xcodebuild -exportArchive` → produces `.ipa`
11. Upload `.ipa` to App Store Connect / TestFlight

### After the build

1. App Store Connect → **TestFlight** → distribute build to internal/external testers
2. App Store Connect → **App Store** → submit for review when ready
3. Typical review time: 1–3 business days

### Key Xcode settings (do not change)

```
Workspace:    ios/App/App.xcworkspace
Scheme:       App
Bundle ID:    com.guber.app
Team ID:      7MC93QFW6Q
Xcode:        16.2
Min iOS:      14.0
```

### Entitlements (do not modify)

`ios/App/App/App.entitlements` must contain **only**:
```xml
<key>aps-environment</key>
<string>production</string>
```

Do **not** add `com.apple.developer.storekit.external-purchase-link` — it is not needed and will cause App Review rejection.

---

## 7. Android Deployment

### Prerequisites

- Android Studio (latest stable)
- Java 17+
- Android SDK 34+

### Step 1 — Restore `google-services.json`

This file is gitignored. Retrieve it from:
- Your secure backup vault, or
- Firebase Console → Project Settings → Your apps → Download `google-services.json`

Place it at `android/app/google-services.json`.

Without this file, the Android build will fail with a Firebase configuration error.

### Step 2 — Restore the Android keystore

The keystore (`*.jks`) is gitignored. Retrieve `guber.jks` from your secure vault (or Codemagic Code Signing section).

You need:
```
Keystore file:     guber.jks
Keystore alias:    guber
Keystore password: (from your vault or Codemagic secrets)
Key password:      (from your vault or Codemagic secrets)
```

> **Warning:** If the original keystore is lost, you cannot update the app on Google Play. Existing installs cannot receive updates signed by a new key. Back up the keystore in at minimum two separate secure locations.

### Step 3 — Build the web app and sync

```bash
npm run build
npx cap sync android
```

### Step 4 — Open in Android Studio

```bash
npx cap open android
```

### Step 5 — Generate a signed release build

1. In Android Studio: **Build → Generate Signed Bundle/APK**
2. Select **Android App Bundle** (for Play Store) or **APK** (for direct install)
3. Choose your keystore file, enter alias and passwords
4. Select **release** build variant
5. Click **Finish**

### Step 6 — Upload to Google Play

1. Go to https://play.google.com/console
2. Select the GUBER app
3. Production → **Create new release**
4. Upload the `.aab` file
5. Fill in release notes → **Review and rollout**

### Key Android files

| File | Purpose |
|------|---------|
| `android/app/src/main/AndroidManifest.xml` | Permissions and intent filters |
| `android/app/build.gradle` | Build config, signing, dependencies |
| `android/app/google-services.json` | Firebase config (gitignored — back up!) |
| `android/app/src/main/res/xml/config.xml` | Capacitor Android config |
| `android-build-config/keystore-setup.md` | Keystore setup notes |

---

## 8. iOS Deployment

### How it works

The iOS app is a Capacitor WebView shell pointing to `https://guberapp.app`. Web-only changes (UI, API, business logic) are live instantly — no App Store update needed. App Store updates are only required when native code changes (plugins, permissions, entitlements, Info.plist).

### Required Apple Developer Portal setup

Ensure these are active on the Apple Developer Portal for `com.guber.app`:

| Capability | Status |
|------------|--------|
| Push Notifications | Must be enabled |
| Sign in with Apple | Must be enabled |

These are enabled under: **Certificates, Identifiers & Profiles → Identifiers → com.guber.app → Capabilities**

### iOS Info.plist permissions

GUBER requests these permissions (already configured in `ios/App/App/Info.plist`):

| Permission | Reason shown to user |
|------------|---------------------|
| `NSLocationWhenInUseUsageDescription` | Job location tracking |
| `NSCameraUsageDescription` | Photo/video capture for job proof |
| `NSPhotoLibraryUsageDescription` | Upload existing photos |
| `NSMicrophoneUsageDescription` | Video recording |

### ExternalPurchaseSheet (iOS digital purchases)

All digital purchases on iOS (Studio credits, subscriptions, Trust Box, etc.) go through `ExternalPurchaseSheet` which shows Apple's required disclosure then opens Stripe in SFSafariViewController.

- Component: `client/src/components/external-purchase-sheet.tsx`
- Token bridge: `server/mobile-checkout-token.ts`
- **No Apple IAP is implemented.** This is valid under current U.S. App Store rules.
- Do NOT add the `com.apple.developer.storekit.external-purchase-link` entitlement.

### Deploying a new iOS build

Use Codemagic (see Section 6). Do not build locally for App Store distribution — the Codemagic pipeline handles signing, profile fetching, archiving, and upload.

For testing on a real device without going through App Store:
```bash
npm run build
npx cap sync ios
# Open ios/App/App.xcworkspace in Xcode
# Select your device → Product → Run
```

### Common iOS issues

| Issue | Fix |
|-------|-----|
| Push notifications not working | Check `aps-environment=production` in entitlements; verify `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` |
| App rejected for external purchase | Ensure `ExternalPurchaseSheet` shows Apple's required disclosure text before redirecting |
| Provisioning profile errors | Trigger a fresh Codemagic build — it re-fetches the profile from Apple |
| `npm ci` fails on Codemagic | Run `npm install` locally, commit the updated `package-lock.json` |
| Capacitor sync fails | Run `npm run build` first, then `npx cap sync ios` |

---

## 9. Post-Restore Verification Checklist

Run through these after bringing GUBER back up on a new machine.

### Server & database
- [ ] `curl https://guberapp.app/api/health` returns 200
- [ ] Can log in (session auth working)
- [ ] Database tables exist (check via `npm run db:studio` or `psql`)
- [ ] `NODE_ENV=production` is set (enables rate limiting, HTTPS cookies)

### Stripe
- [ ] Stripe webhooks are registered and signing secrets match env vars
- [ ] Test a checkout flow end-to-end in Stripe test mode
- [ ] `STRIPE_PAYROLL_TRUST_BOX_PRICE_ID` resolves to a real price in your Stripe account

### Push notifications
- [ ] Android: send a test notification from Firebase Console → Cloud Messaging
- [ ] iOS: test on a real device (simulator does not support push)
- [ ] Web: verify VAPID keys match what the frontend received at subscription time

### Native apps
- [ ] `google-services.json` is present at `android/app/google-services.json`
- [ ] Android keystore is available for signing builds
- [ ] iOS APNs `.p8` key is stored securely and env vars are correct

### Codemagic
- [ ] `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_IDENTIFIER`, `APP_STORE_CONNECT_PRIVATE_KEY` are set in the `Default` env group
- [ ] Distribution certificate and provisioning profile are uploaded
- [ ] Trigger a test build and confirm it reaches TestFlight

### Production cron
- [ ] `DISABLE_BACKGROUND_JOBS=true` is set
- [ ] External scheduler is firing `POST /api/internal/cron/run` with `x-cron-secret` header
- [ ] Mission Control health check returns GREEN:
  ```bash
  curl -H "x-cron-secret: $CRON_SECRET" https://guberapp.app/api/internal/mission-control/status
  ```

### Security
- [ ] `SESSION_SECRET` is a fresh 64-byte hex value
- [ ] `RELEASE_CODE_SECRET` matches the value used when codes were issued (changing it invalidates all existing VRS release codes)
- [ ] All Stripe keys are live (`sk_live_...`), not test keys
- [ ] Google Maps API key has HTTP-referer restriction; Geocoding key has IP restriction
- [ ] APNs `.p8` key is backed up in a secure offline vault

---

*This guide covers a full rebuild from zero. For incremental deployments, only the changed components need updating. The server handles all schema changes automatically on boot.*
