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

## AI Video Studio (task-439 + task-452 + task-453)
- **Page:** `client/src/pages/studio.tsx` (route `/studio`)
- **Provider:** Fal.ai. Single integration point: `server/fal.ts`. Requires `FAL_KEY`. Without it, `/api/studio/generate` returns 503 and never charges credits.
- **Credit packs:** Starter $5/8, Plus $20/50, Pro $50/150 (`STUDIO_CREDIT_PACKS` in `server/routes.ts`).
- **Tier subscriptions (task-452):** Creator $19/mo (+30 credits, motion AI, refs, locked vibes), Business $99/mo (+150 credits, brand kits, ad templates, multi-export). `STUDIO_TIER_PLANS` in `server/routes.ts`. Endpoints: `GET /api/studio/tiers`, `POST /api/stripe/studio-subscription-checkout`, `POST /api/stripe/cancel-studio-subscription`. Uses inline `price_data` w/ `recurring: { interval: "month" }` (no env price IDs).
- **Free credits:** Every new signup gets 1 trial credit (`server/auth.ts`). Day-1 OG members get +2 credits/month via `ogStudioCreditDripSweep` in `server/cron.ts` (gated by `users.studio_credits_last_drip_at`).
- **Storage tables:** `studio_videos`, `studio_vibes`; `users.studio_credits/tier/credits_last_drip_at/subscription_id/subscription_status/subscription_cancel_at_period_end/studio_resume_video_id/studio_business_promo_video_id`, plus `cash_drops.studio_video_id`. Schema: `shared/schema.ts`; raw SQL: `scripts/post-merge.sh`.
- **Webhook (`server/routes.ts` main webhook):** `metadata.type === "studio_credits"` increments balance; `studio_subscription` on `checkout.session.completed` activates tier + grants first month + sets lastDripAt; `customer.subscription.updated/deleted` syncs status / downgrades to standard; `invoice.paid` w/ `billing_reason==="subscription_cycle"` grants monthly drip (dedup by `[invoice:<id>]` in audit log).
- **Cron drip safety net:** `studioMonthlyDrip()` (paid Creator/Business, 28-day cutoff) and `ogStudioCreditDripSweep()` (Day-1 OG, 30-day cutoff) both run in the 5-min sweep in `server/cron.ts`.
- **Vibe gating:** `v.tierRequired !== "standard" && tier === "standard"` — auto-unlocks for Creator/Business with no extra logic.
- **"Use in…" handoff (task-453):** Studio dropdown links to `/resume?studioVideoId=N`, `/biz/dashboard?studioVideoId=N`, `/host-drop/new?studioVideoId=N`. Resume + biz-dashboard auto-call `POST /api/studio/attach` ({target: "resume"|"business_promo"}); host-drop fetches the clip URL and prefills it as a clue media item, passing `studioVideoId` to `/api/cash-drops/host/create`. Single-clip fetch lives at `GET /api/studio/videos/:id` (ownership-checked). `/api/resume/me` and `/api/resume/:userId` expose `studioPromo` for rendering.

## Hands-Free V&I (task-454)
- **Component:** `client/src/components/handsfree-capture.tsx` (dialog: consent → camera preview → MediaRecorder → upload).
- **Entry point:** "Hands-Free POV Capture" card in `worker-clipboard.tsx` (only when `job.category === "Verify & Inspect"`).
- **Token:** `server/wearable-token.ts` — HMAC-SHA256 (key = `SESSION_SECRET`), 15-min TTL, payload `{jobId, helperId, exp, nonce}`.
- **Routes:** `GET /api/jobs/:id/wearable-upload-token` (auth + assigned check) and `POST /api/proof/wearable-upload` (token + Cloudinary URL + `captureMeta`). Both gated by `platform_settings.handsfree_capture_enabled` (admin kill-switch, defaults `true`).
- **Storage:** `proof_submissions.capture_meta jsonb` holds `{deviceKind, deviceModel, captureStartedAt, captureEndedAt, gpsAtStart, receivedAt, consentVersion}`. Hirer-side badge "POV · Hands-Free" rendered in `job-detail.tsx` proof card.
- **Vendor neutrality:** product copy never names a glasses brand. Three paths documented in `docs/handsfree-vi-architecture.md` — phone-as-glasses (live), Capacitor paired-device import on Android + iOS (task-457 / task-460; iOS uses `<input type=file accept="video/*">` with no `capture` attr so the Photos picker shows; deviceKind `paired-ios`), and the public `/api/proof/wearable-upload` contract for partner devices. Allowed `captureMeta.deviceKind` values: `phone-handsfree`, `paired-android`, `paired-ios`, `direct-api`.
- **Imported-clip freshness flags (task-461):** For `paired-android`/`paired-ios` deviceKind, `/api/proof/wearable-upload` enriches `captureMeta` with `recordedAt`, `recordedAgeSec`, `gpsDistanceMeters`, and `freshnessFlags[]` (`recorded_before_job` if `fileLastModified` < lockedAt − 24h, `recorded_in_future`, `missing_recorded_at`, `location_mismatch` if upload GPS > 1 km from job). Hirer proof card in `job-detail.tsx` shows "Imported clip · recorded {age}" subline plus yellow warning badges for each flag. Advisory only — never blocks upload.

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
- **Studio FAL_KEY:** `/api/studio/generate` requires `FAL_KEY`. Without it the route returns 503 and never deducts credits. Vibe presets table (`studio_vibes`) is empty — needs admin seed (or follow-up "generate vibes via Fal.ai" task) before the carousel renders content.


- **Autoscale Production:** To maintain Autoscale's per-request pricing, ensure no recurring in-process timers are running; use `DISABLE_BACKGROUND_JOBS=true` and a `CRON_SECRET` with a scheduled `curl` command.
- **Google Maps API Key:** Server-side Google Maps API calls require a separate API key with no HTTP-referer restrictions (or "IP addresses" restriction) if `GOOGLE_MAPS_API_KEY` has referer restrictions.
- **Account Deletion:** Users are soft-deleted, anonymizing data while retaining records for legal/safety reasons. Public lookups for deleted users return 404.
- **Google Play Compliance:** Digital purchase UI is hidden in Android/iOS store builds (`isStoreBuild`) to comply with store guidelines.

## Pointers
- _Populate as you build_