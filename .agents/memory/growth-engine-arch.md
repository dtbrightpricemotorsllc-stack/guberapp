---
name: Growth Engine Architecture
description: GUBER Growth Engine — ZIP fallback tasks, credits/score, anti-abuse. Key decisions and wiring gaps.
---

# Rule
Growth tasks do NOT live in the `jobs` table. They have their own tables and NEVER inflate real job counts or paid-work flows.

**Why:** Keeping `jobs` pure means every dashboard stat, job count, and map pin is already "real user only" with zero filtering needed.

# Tables
- `growth_task_templates` — admin-editable task definitions (emoji, title, description, rewards, OG bonus %)
- `zip_fallback_settings` — per-scope (global/state/city/zip) fallback config; scopeValue='' for global; UNIQUE(scope, scope_value)
- `growth_task_completions` — append-only log (anti-abuse + analytics); statuses: approved | rejected | duplicate | suspicious
- `growth_reward_config` — key/value table for every tunable number (15 seeded keys)

# User columns
`users.growth_credits` (int, default 0), `users.guber_score` (int, default 0) — both provisioned via ALTER TABLE IF NOT EXISTS in server/index.ts.

# Anti-abuse (completeGrowthTask)
1. Same user + same template within 24h → rejected "Already completed today"
2. Same device fingerprint + same template + different user within 24h → status=suspicious, rejected
3. GPS bounds: must be within plausible US coordinates (lat 18–72, lng −180 to −65)

# Feature flag
`zip_fallback_growth_tasks` — **off by default**. Admin enables via Feature Flag Console (/admin/qa/flags). Growth tasks are only served when this flag is on.

# Referral milestone awards
`awardReferralGrowthCredits(event, referrerId, referredId?)` exists in `server/growth-engine.ts` and reads all values from `growth_reward_config`. It is **NOT yet hooked into the existing referral flow** — needs explicit call at:
- Signup attribution (server/auth.ts handleSignup)
- ID verification completion (wherever idVerified is set)
- Stripe account connected (stripe connect webhook)
- Job completion with referral (referral-reward.ts)
- OG purchase fulfillment (Stripe webhook, Day-1 OG fulfillment)

# Routes
- `GET /api/growth-tasks/zip?zip=XXXXX` — public, returns ZipFallbackResult
- `POST /api/growth-tasks/:templateId/complete` — requireAuth, returns {success, creditsAwarded, scoreAwarded}
- `GET /api/growth-tasks/my-balance` — requireAuth
- `GET /api/growth-tasks/my-completions` — requireAuth (paginated)
- `GET /api/growth-tasks/zip-job-count?zip=XXXXX` — public, returns real job count
- Admin CRUD under `/api/admin/growth-engine/*` (requireAdmin)

# Frontend
- User page: `/community-tasks` (ProtectedRoute → growth-tasks.tsx)
- Admin page: `/admin/growth-engine` (AdminRoute → admin-growth-engine.tsx, 4 tabs)
- Admin QA link: "🌱 Growth Engine" tab in admin-qa.tsx → links to /admin/growth-engine

**How to apply:** Any future referral milestone work should call awardReferralGrowthCredits at the trigger point and pass the referrerId from `users.referredBy`.
