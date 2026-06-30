# GUBER — Global Unlimited Business & Employment Resources

"Create Value In Yourself." — Trust-enforced local visibility network connecting hirers with workers, emphasizing trust and efficient local service delivery. U.S.-only launch.

## Run & Operate
- **Dev server:** `npm run dev` (port 5000, Express + Vite)
- **Unit tests:** `npx vitest run --config vitest.config.ts`
- **E2E tests:** `npx playwright test` (requires dev server running)
- **Production (Autoscale) env vars:** `DISABLE_BACKGROUND_JOBS=true`, `CRON_SECRET=<random>`
- **Cron trigger:** `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://guberapp.app/api/internal/cron/run`
- **Health monitor (Mission Control):** `node scripts/automated-watchdog.mjs` (also `--json`, `--loop`). Endpoint: `GET|POST /api/internal/mission-control/status` (header `x-cron-secret: $CRON_SECRET`; GREEN→200, RED→503). Runs state-bleed audit + the 7 protected test suites + native manifest checks. Edit `PROTECTED_TEST_SUITES` / `MANIFEST_REQUIREMENTS` in the script if suites or required manifest keys change.

## Stack
- **Frontend:** React, TypeScript, Vite, TailwindCSS, TanStack Query, wouter
- **Backend:** Express.js, Node.js
- **Database:** PostgreSQL + Drizzle ORM (`shared/schema.ts`)
- **Auth:** `express-session` + `scrypt`
- **Payments:** Stripe Connect
- **AI / Media:** Fal.ai (`server/fal.ts`), OpenAI moderation, Cloudinary
- **Mapping:** Google Maps JS API
- **Mobile:** Capacitor 8.2.0 (iOS + Android)
- **Testing:** Vitest, Supertest, Playwright

## User Preferences
- Concise and direct communication style.
- Ask for confirmation before major architectural changes or new external dependencies.
- **Do NOT use task agents / project task queue.** All work must be done directly by the main agent. Parallel isolated agents have caused duplicate code and merge conflicts.

## Key File Locations
| Area | Path |
|---|---|
| Routes (all API) | `server/routes.ts` |
| Schema | `shared/schema.ts` |
| Feature flags | `shared/feature-flags.ts`, `server/feature-flags.ts` |
| Cron jobs | `server/cron.ts` |
| Job builder config | `client/src/lib/job-builder-config.ts` |
| Platform detection | `client/src/lib/platform.ts` (`isStoreBuild`, `isIOS`) |
| Push notifications | `server/push.ts`, `client/src/lib/push.ts` |
| Live task tracking | `client/src/services/location/TaskTrackingService.ts` (foreground GPS watch; `POST /api/jobs/:id/location-batch`; table `job_location_pings`) |
| Admin QA | `client/src/pages/admin-qa.tsx`, `server/admin-qa.ts` |
| Dispute types | `shared/dispute.ts` |
| Server tests | `server/tests/` |
| E2E tests | `e2e/` |

## iOS / App Store Status
- **Distribution:** U.S. App Store only.
- **External purchases:** All digital purchases on iOS use `ExternalPurchaseSheet` (`client/src/components/external-purchase-sheet.tsx`), which shows Apple's required disclosure then opens Stripe checkout in SFSafariViewController. Valid under updated U.S. App Store rules — **no `com.apple.developer.storekit.external-purchase-link` entitlement required or present.**
- **Entitlements file** (`ios/App/App/App.entitlements`): only `aps-environment: production`. Do not add the external-purchase entitlement.
- **Wired purchase surfaces:** `/studio/credits` (packs + tiers), `/profile` (Day-1 OG), `/biz/talent-explorer` (Scout Plan), `/biz/dashboard` (unlock 5-packs), `/ai-or-not` (Trust Box + Day-1 OG).
- **Token bridge:** `POST /api/mobile/checkout-link` → signs 15-min HMAC token → `GET /api/mobile/checkout-redirect` creates Stripe session → 302 to Stripe. Module: `server/mobile-checkout-token.ts`.
- **Background geolocation:** `@capacitor-community/background-geolocation` removed from `package.json` — not used, not compiled into the binary.
- **Console logs:** stripped from production Vite build via `esbuild: { drop: ['console','debugger'] }`.
- **Studio feature flag:** `studio_v2` is `global` scope — auto-migrated on server boot if DB still has old `role` scope.
- **Hidden/removed for review:** `/loading-demo` unrouted; `/marketplace-preview` redirects to `/marketplace`; Dashboard marketplace "coming soon" card removed; quote-request "coming soon" text removed; Studio Avatar shows placeholder on iOS.

## Payment Routing Policy
**Authoritative doc:** `docs/payment-routing.md`

- **Stripe / Stripe Connect** — all real-world services: jobs, V&I, barter, direct offers, business verification, profile unlocks, Cash Drops, worker payouts, dispute refunds. Used on all platforms including iOS (person-to-person / physical services are exempt from Apple IAP).
- **ExternalPurchaseSheet → Stripe** — digital products on iOS (U.S. only): Studio credits, Studio subscriptions, Trust Box, Day-1 OG, Business Scout plan, unlock packs. Apple disclosure shown before redirect.
- **Apple Pay / Google Pay** — wallet methods inside Stripe, not a separate rail. Allowed anywhere Stripe is used.
- **Apple IAP / Google Play Billing** — not implemented. Required for non-U.S. storefronts if GUBER ever expands internationally.

## GUBER Studio v2
- **Route:** `/studio` — session-based AI generation (24h sessions, heartbeat every 4 min).
- **Provider:** Fal.ai. Requires `FAL_KEY` — without it every `/api/studio/generate/*` returns 503 before charging credits.
- **Tools:** `kling_motion_control` (80 cr), `wan_motion_5s` (30 cr), `wan_motion_10s` (60 cr), `minimax_music` (5 cr). Prices are DB-managed via `studio_model_pricing`.
- **Per-tool pages:** `/studio/text-to-video`, `/studio/mirror-motion`, `/studio/commercial`, `/studio/music`. Shell: `studio-tool-page-shell.tsx`.
- **Avatar page** (`/studio/avatar`): shows "coming soon" placeholder on iOS store builds.
- **Credits:** New users get 2 trial credits. Day-1 OG members get +20 cr/month (rollover, no expiry).
- **Packs (6):** Spark $5/330 → Whale $200/16000. **Tiers (3):** Standard $10.99/mo, Business $37.99/mo, Enterprise $99/mo.
- **For You feed:** `/studio/explore` — vertical snap-scroll of admin-curated `studio_featured_clips`.
- **Storage:** `studio_sessions`, `studio_session_files`, `studio_generation_log`, `studio_model_pricing`.
- **Feature flag:** `studio_v2` — default `global`, auto-migrated from legacy `role` scope on boot.

## Other Key Features
- **QA Dashboard** (`/admin/qa`): feature flags, cash drop debugger, allowlist, test user sandbox. Server module: `server/admin-qa.ts`.
- **Hands-Free V&I:** `handsfree-capture.tsx` — phone-as-glasses POV capture for Verify & Inspect jobs. Token: `server/wearable-token.ts`.
- **Investor Pitch:** `/investors` + `/guber-investor-deck` — public but `noindex`. Edit copy in `client/src/lib/investor-config.ts`.
- **Observation Marketplace**, **Cash Drops**, **Barter**, **Direct Offers**, **GUBER Business** — all feature-flag gated via `shared/feature-flags.ts`.

## Architecture Decisions
- Job posting is free; payment only on worker lock-in.
- Mandatory ID verification for hirers and workers.
- Strictly dropdown-driven job creation (structured data).
- Fuzzed GPS coordinates on all map displays.
- Dual-path push: VAPID for web, APNs direct for native iOS.
- Soft-delete accounts: anonymize data, retain records for legal/fraud.

## Gotchas
- **FAL_KEY missing:** Studio generate endpoints return 503 without deducting credits.
- **Autoscale timers:** No in-process recurring timers in production — use `DISABLE_BACKGROUND_JOBS=true` + scheduled cron curl.
- **Google Maps server-side:** Requires a key with no HTTP-referer restrictions (use IP-restriction key or unrestricted).
- **Account deletion:** Soft-delete only. Public lookups for deleted users return 404.
- **`package-lock.json`:** Keep it in sync with `package.json` — run `npm install` locally after any dependency change.
