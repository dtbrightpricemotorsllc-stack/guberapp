# GUBER Complete Architecture Map

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT DEVICES                           │
│                                                                 │
│  Web Browser          iOS App              Android App          │
│  (React/Vite)     (Capacitor 7.4)       (Capacitor 7.4)        │
│       │                  │                     │                │
│       └──────────────────┴─────────────────────┘               │
│                          │                                      │
│                   HTTPS / WSS                                   │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                  REPLIT AUTOSCALE HOST                          │
│                  https://guberapp.app                           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              Express.js Server (port 5000)              │     │
│  │                                                         │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │     │
│  │  │  server/     │  │  server/     │  │  server/    │  │     │
│  │  │  routes.ts   │  │  os/         │  │  studio/    │  │     │
│  │  │  (main API)  │  │  (OS agents) │  │  (AI gen)   │  │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │     │
│  │         │                 │                  │          │     │
│  │  ┌──────▼─────────────────▼──────────────────▼──────┐  │     │
│  │  │           server/storage.ts (IStorage)            │  │     │
│  │  │           server/db.ts (Drizzle + pg pool)        │  │     │
│  │  └──────────────────────────┬────────────────────────┘  │     │
│  └─────────────────────────────┼──────────────────────────-┘     │
│                                │                                  │
│  ┌─────────────────────────────▼──────────────────────────┐     │
│  │              Vite Dev Server (development)              │     │
│  │              dist/public/ (production static)          │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼──────┐                    ┌─────────▼────────┐
│  PostgreSQL  │                    │  External APIs   │
│  (Replit DB  │                    │                  │
│  or Neon)    │                    │ • Stripe Connect │
│              │                    │ • Cloudinary     │
│  ~60 tables  │                    │ • Fal.ai         │
│  Drizzle ORM │                    │ • OpenAI         │
│  shared/     │                    │ • Google Maps    │
│  schema.ts   │                    │ • Google OAuth   │
└──────────────┘                    │ • Apple OAuth    │
                                    │ • Resend email   │
                                    │ • Firebase FCM   │
                                    │ • APNs (direct)  │
                                    └──────────────────┘
```

---

## Directory Structure

```
/
├── client/                        # React frontend (Vite)
│   └── src/
│       ├── App.tsx                # Router (wouter) — all page registrations
│       ├── pages/                 # One file per route
│       │   ├── home.tsx           # Public landing page (with mascot intro)
│       │   ├── dashboard.tsx      # Worker/hirer dashboard
│       │   ├── browse-jobs.tsx    # Job marketplace map
│       │   ├── post-job.tsx       # Dropdown-driven job creation
│       │   ├── job-detail.tsx     # Job detail + proof + chat
│       │   ├── profile.tsx        # User profile + Day-1 OG purchase
│       │   ├── wallet.tsx         # Earnings, payouts, history
│       │   ├── verify-inspect.tsx # V&I job flow
│       │   ├── marketplace.tsx    # Observation marketplace
│       │   ├── business-dashboard.tsx
│       │   ├── biz-account.tsx
│       │   ├── biz-post-job.tsx
│       │   ├── studio.tsx         # GUBER Studio hub
│       │   ├── studio-credits.tsx # Credit packs + tier subscriptions
│       │   ├── studio-explore.tsx # For You feed (featured clips)
│       │   ├── studio-ai-director.tsx  # AI Director (batched generation)
│       │   ├── ai-or-not.tsx      # AI-or-Not detection tool
│       │   └── os/                # OS Agent Command Center
│       ├── components/
│       │   ├── ui/                # shadcn/ui base components
│       │   ├── external-purchase-sheet.tsx  # iOS ExternalPurchaseSheet
│       │   ├── handsfree-capture.tsx        # POV V&I capture
│       │   └── ...
│       ├── lib/
│       │   ├── queryClient.ts     # TanStack Query setup + apiRequest
│       │   ├── platform.ts        # isStoreBuild, isIOS detection
│       │   ├── push.ts            # Web push (VAPID) client
│       │   ├── gps.ts             # GPS permission + disclaimer
│       │   ├── job-builder-config.ts  # Job categories/subcategories
│       │   └── investor-config.ts # Investor pitch content
│       ├── hooks/                 # Custom React hooks
│       └── services/
│           └── location/
│               └── TaskTrackingService.ts  # Foreground GPS watch
│
├── server/                        # Express backend
│   ├── index.ts                   # App bootstrap, middleware, DB provisioning
│   ├── routes.ts                  # ALL API routes (~9000 lines)
│   ├── storage.ts                 # IStorage interface + DatabaseStorage impl
│   ├── db.ts                      # Drizzle client + pg pool
│   ├── cron.ts                    # Background jobs (node-cron, disabled in prod)
│   ├── push.ts                    # Dual-path push: VAPID + APNs direct
│   ├── fal.ts                     # Fal.ai client wrapper
│   ├── seed.ts                    # Catalog seeding (categories, checklists, etc.)
│   ├── seed-demo.ts               # Demo account creation
│   ├── oauth.ts                   # Google + Apple OAuth handlers
│   ├── mobile-checkout-token.ts   # iOS checkout HMAC token bridge
│   ├── wearable-token.ts          # Hands-free wearable JWT tokens
│   ├── demo-guard.ts              # Demo account protection
│   ├── seo-routes.ts              # sitemap.xml, robots.txt, OG tags
│   ├── static.ts                  # Static file serving (production)
│   ├── vite.ts                    # Vite dev server integration
│   ├── admin-qa.ts                # QA dashboard routes
│   ├── feature-flags.ts           # Server-side feature flag evaluation
│   ├── studio-tools-notify.ts     # Studio model pricing SSE listener
│   ├── os/                        # GUBER OS Agent system
│   │   ├── index.ts               # OS runtime bootstrap
│   │   ├── os-routes.ts           # OS API endpoints
│   │   ├── event-bus.ts           # Internal event system
│   │   └── agents/                # CFO, COO, CTO, etc. agents
│   ├── studio/                    # AI Video Studio backend
│   │   ├── ai-director.ts         # AI Director (batched multi-clip generation)
│   │   └── ...
│   └── tests/                     # Vitest server tests
│       ├── auth.test.ts
│       ├── webhooks.test.ts
│       ├── studio.test.ts
│       └── release-system.test.ts
│
├── shared/                        # Isomorphic code (client + server)
│   ├── schema.ts                  # Drizzle schema (~2600 lines, source of truth)
│   ├── feature-flags.ts           # Feature flag key registry
│   ├── os-schema.ts               # OS agent schema
│   ├── asset-protection.ts        # Verified Release System pricing/types
│   └── dispute.ts                 # Dispute taxonomy
│
├── ios/                           # Capacitor iOS project
│   └── App/App/
│       ├── AppDelegate.swift
│       ├── Info.plist             # Permissions, URL schemes
│       ├── App.entitlements       # Only: aps-environment = production
│       └── capacitor.config.json
│
├── android/                       # Capacitor Android project
│   └── app/src/main/java/com/guber/app/
│       ├── MainActivity.java
│       └── GuberTrackingService.java
│
├── e2e/                           # Playwright end-to-end tests
├── scripts/                       # Build + audit scripts
│   ├── audit-statebleed.mjs       # State-bleed detector (153 files)
│   ├── automated-watchdog.mjs     # Mission Control health monitor
│   └── build-social-video.mjs    # Marketing video builder
├── docs/                          # Internal documentation
│   ├── payment-routing.md         # AUTHORITATIVE payment routing policy
│   └── ...
├── capacitor.config.ts            # Capacitor: appId, server URL, plugins
├── drizzle.config.ts              # Drizzle Kit: schema path, dialect
├── vite.config.ts                 # Vite: aliases, build output
├── tsconfig.json                  # TypeScript config
├── vitest.config.ts               # Unit test config
├── playwright.config.ts           # E2E test config
└── codemagic.yaml                 # iOS CI/CD (Codemagic)
```

---

## Request Flow

### Web API Request
```
Browser → HTTPS → Express middleware (rate limit, session, CORS)
       → requireAuth() check
       → routes.ts handler
       → storage.ts (IStorage)
       → Drizzle ORM
       → PostgreSQL
       → Response JSON
```

### iOS Native Purchase (Digital Product)
```
iOS App → ExternalPurchaseSheet (shows Apple disclosure)
        → SFSafariViewController opens guberapp.app/...
        → POST /api/mobile/checkout-link (HMAC signed token, 15min TTL)
        → GET /api/mobile/checkout-redirect (creates Stripe session)
        → 302 → Stripe Checkout
        → Stripe processes payment
        → POST /api/webhooks/stripe (checkout.session.completed)
        → Atomic fulfillment (FOR UPDATE lock, single tx)
        → Credits/tier applied to user
```

### Job Payment Flow
```
Hirer → POST /api/jobs/:id/lock (creates Stripe PaymentIntent via Connect)
      → Hirer confirms payment (Stripe Elements)
      → Worker completes job
      → Worker submits proof
      → GPS proximity + completion confirmed
      → POST /api/jobs/:id/release → Stripe capture + Connect transfer
      → Worker receives payout (Stripe Connect transfer)
```

### Push Notification Flow
```
Server event (job update, message, etc.)
  → server/push.ts: notify(userId, payload)
  → Check user's push_subscriptions (VAPID web) + push_tokens (APNs)
  → Web: web-push VAPID → browser Service Worker
  → iOS: @parse/node-apn → Apple APNs → iOS notification
  → Android: firebase-admin → FCM → Android notification
```

---

## Feature Flag System

All flags live in `shared/feature-flags.ts`. Evaluated server-side via
`isFeatureEnabledFor(flagKey, viewer)`. Admin override always sees everything.

| Flag | Default | Purpose |
|------|---------|---------|
| `studio_v2` | global ON | GUBER Studio session-based AI generation |
| `studio_ai` | global ON | AI Video Studio at /studio |
| `studio_subscriptions` | global ON | Studio tier subscriptions |
| `cash_drops` | global ON | Cash Drops feature |
| `barter` | global ON | Barter listings |
| `direct_offers` | global ON | Hirer→worker direct offers |
| `observation_marketplace` | global ON | Observation jobs |
| `handsfree_capture` | OFF | Hands-free POV V&I capture |
| `paired_wearable_import` | global ON | Wearable clip import |
| `verified_release_system` | OFF | Asset Custody Engine™ |
| `asset_protection_founders_club` | OFF | Founders Club buy-in |
| `free_quickpic_enabled` | global ON | 3 free daily AI images |
| `business_signup` | global ON | Business org accounts |
| `qa_dashboard` | global ON | /admin/qa surface |

---

## Database Table Inventory (~60 tables)

### Core User & Auth
`users` · `user_sessions` · `oauth_used_nonces` · `worker_qualifications`
`id_verifications` · `selfie_verifications` · `push_subscriptions` · `push_tokens`

### Jobs & Marketplace
`jobs` · `job_applications` · `job_reviews` · `job_checklists` · `job_checklist_items`
`job_location_pings` · `direct_offers` · `barter_listings` · `observation_listings`
`cash_drops` · `cash_drop_claims` · `marketplace_listings` · `marketplace_buyer_order_purchases`

### Payments & Disputes
`payments` · `wallet_transactions` · `disputes` · `billing_events`
`legal_acceptances` · `preset_listings`

### Business Accounts
`business_accounts` · `business_plans` · `business_candidate_unlocks`
`business_offers` · `business_profiles` · `worker_business_projections`
`background_check_eligibility`

### GUBER Studio
`studio_sessions` · `studio_session_files` · `studio_generation_log`
`studio_model_pricing` · `studio_featured_clips`

### Verified Release System
`protected_assets` · `asset_roles` · `custody_events` (append-only)
`release_authorizations` · `release_codes` · `tow_vehicle_verifications`
`trailer_verifications` · `vin_verifications` · `master_transport_events`
`transport_issues` · `incidents` · `storage_events` · `witness_assignments`
`witness_reports` · `asset_protection_purchases` · `founders_club_state`

### Platform
`feature_flags` · `platform_settings` · `service_pricing_configs`
`notifications` · `messages` · `message_threads` · `load_board_listings`

### OS Agents
`os_agent_tasks` · `os_agent_logs` · `os_briefings`

---

## Rate Limits (production)

| Endpoint | Limit |
|----------|-------|
| All `/api/*` | 200 req / 15 min per IP |
| `POST /api/auth/login` | 5 failed / 1 min per IP |
| `POST /api/auth/signup` | 5 / 1 hr per IP |
| `POST /api/auth/forgot-password` | 5 / 15 min per IP |

---

## Key Gotchas for Recovery

1. **`custody_events` is APPEND-ONLY** — enforced by Postgres rules. Never try to UPDATE or DELETE rows.
2. **`studio_v2` flag scope** — auto-migrated from `role` → `global` on boot. If this fails, Studio is inaccessible.
3. **Two Stripe webhook endpoints** — `/api/webhooks/stripe` (main account) AND `/api/webhooks/stripe-connect` (Connect). Both must be registered.
4. **APNs key is irreplaceable** — the `.p8` file is only downloadable once from Apple. Store it securely.
5. **`RELEASE_CODE_SECRET`** — changing this invalidates ALL existing release codes. Never rotate casually.
6. **Google Maps server-side** — `GOOGLE_GEOCODING_API_KEY` must NOT have HTTP-referer restrictions. Use IP restriction or unrestricted key.
7. **`npm ci` on Codemagic** — reads `package-lock.json` strictly. Run `npm install` locally after any dependency change to keep it in sync.
