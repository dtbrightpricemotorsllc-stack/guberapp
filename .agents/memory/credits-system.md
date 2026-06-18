---
name: GUBER Credits + City Mission System
description: Phase 1 credits rollout — ratio, tables, pending referral flow, cashout, admin queue, map missions
---

## Credit Ratio
- **1000 credits = $1.00** (NOT 100). Seeded via `ON CONFLICT DO UPDATE` so existing DBs get updated.
- **Min cashout: 25,000 credits ($25)**.
- `cashout_enabled` config key defaults to 0 (disabled) — admin must flip to 1 to open cashout.

## New DB Objects
- `credit_ledger` — append-only, all credit events. Columns: user_id, amount, dollar_equivalent, source_type, task_completion_id, status (pending/approved/denied/redeemed), reason, created_at, approved_at, redeemed_at.
- `cashout_requests` — user-initiated cashout requests. Status: pending/approved/denied/paid.
- New user columns: `pending_credits`, `lifetime_credits_earned`, `lifetime_credits_redeemed`.

## Pending Referral Flow
- `referral_creates_account` → writes `credit_ledger` with `status='pending'`, increments `pending_credits` (NOT `growth_credits`).
- ID verify approval (both admin and audit-log approve paths) → calls `approveReferralPendingCredits(referredUserId)` + `awardReferralGrowthCredits("referral_verifies_id", referrerId, referredId)`.
- `approveReferralPendingCredits` finds pending ledger rows matching `Referred user #N%`, moves them to approved, shifts pending_credits → growth_credits + lifetime_credits_earned.

## Phase 1 Map Missions (8 templates, category='map_mission')
All seeded via `ON CONFLICT DO NOTHING`. Old 6 placeholders deactivated (is_active=false, paused=true).
25/50/75/100/100/100/100/500 credits. High-value intel (500cr) is admin-approval-intended but technically auto-approved by the engine — could add manual-review flag later.

## API Surface
- `GET /api/credits/balance` — wallet state + eligibility
- `GET /api/credits/ledger?offset=N&limit=N` — paginated history
- `POST /api/credits/cashout-request` — { credits, payoutMethod, payoutDetails }
- `GET /api/credits/referral-stats` — for OG page referral panel
- Admin: GET/POST stats, cashout-requests, approve, deny, cashout-toggle, grant

## Frontend Routes
- `/credits` — ProtectedRoute → CreditsPage (wallet, ledger, cashout form)
- `/og-advantage` — updated to show ReferralPanel for logged-in users (referral link + stats + credits)
- `/admin/growth-engine` → Credits tab added (first tab, cashout queue + stats + manual grant)

**Why:** Needed a way to surface credit earnings and provide the cashout flow that previously had no UI or persistence layer.
