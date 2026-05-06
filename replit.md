# GUBER - Trust-Enforced Local Visibility Network

GUBER is a local visibility network connecting individuals needing assistance with those who can provide it, emphasizing trust and efficient local service delivery.

## Run & Operate
- **Run Unit Tests:** `npx vitest run --config vitest.config.ts`
- **Run E2E Tests:** `npx playwright test` (requires `npm run dev` running on port 5000)
- **Production Autoscale Environment Variables:**
    - `DISABLE_BACKGROUND_JOBS=true`
    - `CRON_SECRET=<long random string>`
- **Scheduled Deployment Cron Job:** `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://guberapp.app/api/internal/cron/run`

## Stack
- **Frontend:** React, TypeScript, Vite, TailwindCSS
- **Backend:** Express.js, Node.js
- **Database:** PostgreSQL with Drizzle ORM
- **State Management:** TanStack Query
- **Authentication:** `express-session`, `scrypt`
- **Payments:** Stripe Connect
- **Mapping:** Google Maps JS API
- **Testing:** Vitest, Supertest, Playwright

## Where things live
- **Job Builder Config:** `client/src/lib/job-builder-config.ts`
- **Guided Job Builder Component:** `client/src/components/guided-job-builder.tsx`
- **Dispute Issue Types:** `shared/dispute.ts`
- **Credential Card Component:** `client/src/components/credential-card.tsx`
- **Platform Detection:** `client/src/lib/platform.ts`
- **Push Notification Logic (Server):** `server/push.ts`
- **Push Notification Logic (Client):** `client/src/lib/push.ts`
- **Cron Job Logic:** `server/cron.ts`, `server/routes.ts`
- **Reverse Geocoding:** `/api/places/reverse-geocode` (server/routes.ts)
- **Account Settings UI:** `client/src/pages/account-settings.tsx`
- **Delete Account UI:** `client/src/pages/delete-account.tsx`
- **Server Tests:** `server/tests/`
- **E2E Tests:** `e2e/`

## Architecture decisions
- **Post-First Job Flow:** Job posting is free; payment occurs only upon worker lock-in.
- **Mandatory ID Verification:** For both job posters and workers to ensure security and trust.
- **Strictly Dropdown-Driven Input:** For job creation to ensure structured data and dynamic form fields.
- **Fuzzed Coordinates:** For privacy on map displays.
- **Dual-Path Push Notifications:** VAPID web-push for browsers and APNs direct delivery for native iOS Capacitor builds.
- **Soft-Delete for User Accounts:** Anonymizes personal data while retaining essential records for legal, safety, and fraud prevention.

## Product
- **Core Functionality:** Connects individuals needing assistance with local service providers.
- **Payment System:** Stripe-based, supporting destination charges, payouts, subscriptions, and boosts.
- **Job Features:** Guided job builder, V&I smart forms, time-based pricing, barter listings, milestone tracking, proof engine, auto-pay increase.
- **Trust & Reliability System:** Worker reliability tracking, badge tiers, dynamic trust scores.
- **Admin Panel:** Role-based access for managing users, jobs, catalog, disputes, and proof templates.
- **Direct Offer System:** Private hirer-to-worker offers with structured counters and expiration.
- **Worker Clock-In System:** Workers must clock in to appear on maps and receive offers.
- **Money Ledger:** Comprehensive tracking of all financial transactions for compliance.
- **Dispute Resolution:** Structured issue taxonomy, evidence uploads, and admin-led resolution.
- **Observation Marketplace:** Passive income opportunity for workers via real-world observations.
- **GUBER Resume:** Auto-tracking work record with qualification management.
- **AI Credential Cards:** AI-powered extraction and verification of worker credentials.
- **Cash Drop System:** Alternative payment for marketing/promotional expenses.
- **GUBER Business:** Platform for companies to scout talent, manage offers, and verify workers.
- **Capacitor Integration:** Mobile app support for native features.

## User preferences
I prefer a concise and direct communication style. I value iterative development and clear explanations of the changes made. Please ask for confirmation before implementing major architectural changes or introducing new external dependencies. For code, I appreciate well-structured and readable solutions.

**IMPORTANT: Do NOT use task agents / project task queue.** All work must be done directly by the main agent in this environment. Parallel/isolated task agents have caused duplicate code and merge conflicts (e.g. duplicate ActiveAreasTab). Handle every request directly here.

## Gotchas
- **Autoscale Production:** To maintain Autoscale's per-request pricing, ensure no recurring in-process timers are running; use `DISABLE_BACKGROUND_JOBS=true` and a `CRON_SECRET` with a scheduled `curl` command.
- **Google Maps API Key:** Server-side Google Maps API calls require a separate API key with no HTTP-referer restrictions (or "IP addresses" restriction) if `GOOGLE_MAPS_API_KEY` has referer restrictions.
- **Account Deletion:** Users are soft-deleted, anonymizing data while retaining records for legal/safety reasons. Public lookups for deleted users return 404.
- **Google Play Compliance:** Digital purchase UI is hidden in Android/iOS store builds (`isStoreBuild`) to comply with store guidelines.

## Pointers
- _Populate as you build_