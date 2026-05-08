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

## GUBER Studio v2 — session-based AI generation (Phase 1)
- **Page:** `client/src/pages/studio.tsx` (route `/studio`). Mobile-first dark UI. Tool picker → optional reference upload → prompt → cost preview → generate → in-page preview → download. Exit confirm purges immediately.
- **Provider:** Fal.ai. Single integration point: `server/fal.ts`. Requires `FAL_KEY`. Without it, every `/api/studio/generate/*` returns 503 BEFORE charging credits.
- **Phase 1 tools (server-priced via `studio_model_pricing`):**
    - `kling_motion_control` (2 cr, photo required) → `fal-ai/kling-video/v3/pro/motion-control`
    - `wan_motion_5s`        (1 cr) / `wan_motion_10s` (2 cr) → `fal-ai/wan-motion`
    - `minimax_music`        (1 cr) → `fal-ai/minimax-music/v2`
- **Generate endpoints:** `POST /api/studio/generate/motion-control`, `POST /api/studio/generate/wan-motion`, `POST /api/studio/generate/music`. All share `runStudioGeneration()` in `server/routes.ts`: auth → validate → moderation 503/block → pricing lookup → atomic credit deduct (402 on insufficient) → provider call → re-host on Cloudinary → attach to session + log success. ANY provider failure → refund + 502.
- **Sessions are TEMPORARY.** `POST /api/studio/session` opens; `GET /api/studio/session/current` reads; `POST /api/studio/session/touch` heartbeats; `POST /api/studio/session/exit` purges immediately (also fired via `navigator.sendBeacon` on tab close / route change). Cleanup safety net: `purgeAbandonedStudioSessions()` in `server/cron.ts` runs in the 5-min sweep — kills sessions inactive >30 min OR older than 1 hour. Both row-delete `studio_session_files` AND destroy the corresponding Cloudinary assets.
- **Reference uploads:** `POST /api/studio/upload` (image/video/audio dataUrl). Image uploads run OpenAI omni-moderation fail-closed before being kept; rejected images are destroyed.
- **Credit packs (kept):** Starter $5/8, Plus $20/50, Pro $50/150 (`STUDIO_CREDIT_PACKS` in `server/routes.ts`).
- **Tier subscriptions (kept):** Creator $19/mo (+30 cr/mo), Business $99/mo (+150 cr/mo). `STUDIO_TIER_PLANS` + `/api/studio/tiers` + `POST /api/stripe/studio-subscription-checkout` + `POST /api/stripe/cancel-studio-subscription`. Webhook handlers + `studioMonthlyDrip()` + `ogStudioCreditDripSweep()` unchanged.
- **Free credits:** New signups get **2** trial credits (`server/auth.ts`). Day-1 OG members get +2 cr/month via `ogStudioCreditDripSweep`.
- **Storage tables (v2):** `studio_sessions`, `studio_session_files`, `studio_generation_log` (no URLs retained), `studio_model_pricing` (admin-editable). User fields kept: `studio_credits`, `studio_tier`, `studio_credits_last_drip_at`, `studio_subscription_*`. **Dropped in v2:** `studio_videos`, `studio_vibes`, `users.studio_resume_video_id`, `users.studio_business_promo_video_id`, `cash_drops.studio_video_id` — generated media is no longer pinned to profile/resume/business/cashdrop. Schema: `shared/schema.ts`; raw SQL: `scripts/post-merge.sh`.
- **Feature flag:** `studio_v2` in `shared/feature-flags.ts` (default ON, global). The legacy `studio_ai` flag is retained for any callers but the v2 UI does not consult it.
- **No more "Use in…" handoff.** Studio is a self-contained surface. The previous Resume/Biz-Promo/Host-Drop pin flows have been removed from `client/src/pages/{studio,resume,biz-dashboard,host-drop-new}.tsx` and from `/api/resume/*` + `/api/cash-drops/host/create`.

## QA Dashboard (task-462)
- **Page:** `client/src/pages/admin-qa.tsx` at `/admin/qa` (admin-only). Sister pages: `admin-qa-inspect.tsx`, `admin-qa-cashdrop-debug.tsx`, `admin-qa-flags.tsx`, `admin-user-profile.tsx` at `/admin/users/:id`. Linked from `admin.tsx` header.
- **Server module:** `server/admin-qa.ts` mounted at end of `registerRoutes()` via dynamic import. All `/api/admin/qa/*` + `/api/admin/users/:id/*` routes are gated by `requireAdmin` and write to `auditLog` (action prefix `qa.*`). Public hooks `/api/feature-flags` + `/api/feature-flags/:key` are unauthenticated and used by `useFeatureFlag` on the client.
- **Sandbox safety:** `requireStripeTestMode` middleware refuses to run if `STRIPE_SECRET_KEY` starts with `sk_live_`. Test users carry `users.is_test_user=true`; test jobs carry `jobs.is_test_job=true`. Reset endpoint deletes only tagged rows + dependents (audit, proofs, attempts, etc).
- **Live Allowlist:** `tester_allowlist (item_type, item_id, user_id)` table + `jobs.visibility` / `cash_drops.visibility` columns (`public` | `allowlist`). Public listings (`GET /api/jobs`, `GET /api/cash-drops/active`) hide allowlist items from non-listed viewers (filter in `server/visibility.ts`). Owner + admin always see their own. End-test endpoint requires `x-live-confirm: LIVE` header.
- **Feature flags:** `shared/feature-flags.ts` (12-key registry: `studio_ai`, `studio_subscriptions`, `cash_drops`, `barter`, `direct_offers`, `observation_marketplace`, `handsfree_capture`, `paired_wearable_import`, `pov_summary`, `business_promo`, `business_signup`, `qa_dashboard`). Resolver in `server/feature-flags.ts` (30s in-process cache, scopes: `off|global|role|allowlist`, admin always passes). `feature_flags` table seeded on boot via `ensureFlagsSeeded()`.
- **Cash Drop Debugger:** `cash_drop_events` table appends transitions (`auto_expired`, `force_expired`, `unexpired`, `extended`, `cancelled`); `server/cron.ts autoExpireCashDrops` records `auto_expired` events. Replay tools: extend-expiry, un-expire, force-expire, cancel — all audited.
- **Media viewer:** `client/src/components/media-lightbox.tsx` opens any URL (image/video/audio/pdf/other) in a dialog with Open + Download buttons. Cloudinary URLs get `fl_attachment/` injected for forced download (`server/media-download.ts toCloudinaryAttachmentUrl`).
- **User link:** `client/src/components/user-link.tsx` — drop-in clickable `<UserLink userId={id} label={name} />` jumps to `/admin/users/:id`.
- **Tests:** `server/tests/admin-qa.test.ts` covers visibility filter (admin/owner/allowlisted/stranger), Cloudinary attachment-URL helper, media classifier, and feature-flag resolver scopes.

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

## Payment Routing Policy
**Authoritative doc:** `docs/payment-routing.md`. Two rails, never mix:
- **Stripe / Stripe Connect** for all real-world services (jobs, V&I, direct offers, barter, business verification, profile unlocks, marketplace boost, Cash Drops, worker payouts, platform fees, dispute refunds). Used on **every platform** including iOS/Android store builds — Apple IAP rules exempt person-to-person and physical services.
- **Apple IAP / Google Play Billing** *may* be required for digital-only products on store builds (Studio credits, Studio subscriptions, Trust Box, Day-1 OG, AI Or Not credits, Business Scout plan). Not yet implemented. Until implemented, digital purchase UI must be hidden on store builds via `isStoreBuild` (`client/src/lib/platform.ts`).
- **Apple Pay / Google Pay** are *wallet payment methods inside Stripe* — not a separate rail. Allowed on any Stripe flow.
- Known store-build gating gaps (digital UI still visible in iOS/Android builds): `studio.tsx` (credits + subscriptions), Trust Box checkout, `business_scout_plan`. Must be resolved before App Store / Play submission — see `docs/payment-routing.md`.

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

## Investor Pitch (task-497)
- **Page:** `client/src/pages/investors.tsx` at `/investors` and `/guber-investor-deck` (both public, lazy, registered before NotFound). 11 sections, dark theme with neon green/purple/cyan, IntersectionObserver scroll-reveal (gated by `prefers-reduced-motion`), print-to-PDF CSS, `noindex,nofollow,noarchive` set in `useEffect` and cleaned up on unmount.
- **Single editable config:** `client/src/lib/investor-config.ts` — change copy, funding ask, contact info, social handles here only.
- **Shared social icons:** `client/src/components/social-links.tsx` — 5 brand icons (LinkedIn / Facebook / TikTok / Instagram / X) from `react-icons/si`. Mounted on the investor page (Traction + CTA) AND on the marketing home footer (`client/src/pages/home.tsx`).
- **Feature flag:** `investor_pitch_public` in `shared/feature-flags.ts` (default OFF). Reserved for a future public nav-link surface; the page itself is always reachable regardless of the flag.

## Pointers
- **QA Dashboard:** see "QA Dashboard (task-462)" section. Plan: `.local/tasks/task-462.md`.
- **Investor Pitch:** see "Investor Pitch (task-497)" section. Plan: `.local/tasks/task-497.md`.