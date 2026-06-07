# GUBER Database Schema Reference

**ORM:** Drizzle ORM  
**Database:** PostgreSQL 14+  
**Schema source of truth:** `shared/schema.ts` (~2600 lines)  
**Provisioning:** `server/index.ts` (runs on every boot — idempotent)

---

## Schema Management Rules

1. **No `db:push` in production.** All production schema changes must be written as
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS` blocks
   in `server/index.ts`. The server runs them on every boot.

2. **`db:push` is for local dev only.** Use it to sync a fresh local database.

3. **`custody_events` is APPEND-ONLY** — enforced by Postgres rules that rewrite
   any UPDATE or DELETE into NOTHING. Never bypass this at the SQL level.

4. **Soft deletes only** — user accounts are anonymized, not deleted. Records
   are retained for legal/fraud purposes.

---

## Core Tables

### `users`
The central user entity. One row per user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Internal user ID |
| `email` | text unique | Login email |
| `password` | text | scrypt hash |
| `username` | text unique | Display username |
| `full_name` | text | Full legal name |
| `profile_photo` | text | Cloudinary URL |
| `rating` | real | Average rating (0–5) |
| `review_count` | integer | Total reviews received |
| `user_bio` | text | Profile bio |
| `zipcode` | text | Home zip code |
| `role` | text | `buyer` \| `seller` \| `both` \| `admin` |
| `tier` | text | `community` \| `pro` \| `elite` |
| `trust_score` | integer | 0–100 trust score |
| `jobs_completed` | integer | Lifetime jobs completed |
| `jobs_disputed` | integer | Lifetime disputes |
| `day1_og` | boolean | Day-1 OG member |
| `is_available` | boolean | Currently accepting jobs |
| `skills` | text | Comma-separated skill list |
| `strikes` | integer | Total strikes received |
| `suspended` | boolean | Account suspended |
| `banned` | boolean | Account banned |
| `stripe_customer_id` | text | Stripe customer ID |
| `stripe_account_id` | text | Stripe Connect account ID |
| `stripe_account_status` | text | `none` \| `pending` \| `active` \| `restricted` |
| `email_verified` | boolean | Email verified |
| `profile_complete` | boolean | Profile completion flag |
| `id_verified` | boolean | Government ID verified |
| `selfie_verified` | boolean | Selfie verified |
| `credential_verified` | boolean | Professional credential verified |
| `auth_provider` | text | `email` \| `google` \| `apple` |
| `google_sub` | text | Google OAuth subject |
| `apple_sub` | text | Apple OAuth subject |
| `cancellation_rate` | real | Cancellation percentage |
| `badge_tier` | text | `standard` \| `verified` \| `elite` \| `legend` |
| `under_review` | boolean | Account under admin review |
| `background_check_status` | text | `none` \| `eligible` \| `passed` \| `declined` |
| `ai_or_not_credits` | integer | AI-or-Not detection credits |
| `studio_credits` | integer | GUBER Studio generation credits |
| `studio_tier` | text | `free` \| `standard` \| `business` \| `enterprise` |
| `studio_subscription_id` | text | Stripe subscription ID for Studio tier |
| `studio_subscription_status` | text | Stripe subscription status string |
| `trust_box_purchased` | boolean | Trust Box active |
| `trust_box_subscription_id` | text | Stripe subscription ID for Trust Box |
| `is_test_user` | boolean | Test/demo user flag (excluded from OS analytics) |
| `guber_id` | text unique | Public GUBER-XXXX identifier |
| `public_username` | text unique | URL-safe public username |
| `referral_code` | text unique | User's referral code |
| `lat` / `lng` | real | Last known location (fuzzed on map) |
| `founding_asset_protection_member` | boolean | Verified Release System Founders Club |

### `jobs`
Job postings and their lifecycle.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Job ID |
| `poster_id` | integer | User who posted the job |
| `worker_id` | integer | Assigned worker (null until locked) |
| `title` | text | Job title |
| `category` | text | Top-level category |
| `subcategory` | text | Subcategory |
| `description` | text | Job description |
| `payment` | real | Job payment amount (USD) |
| `status` | text | `open` \| `locked` \| `in_progress` \| `on_the_way` \| `arrived` \| `completed` \| `disputed` \| `cancelled` |
| `lat` / `lng` | real | Job location (fuzzed) |
| `zip` | text | Job zip code |
| `proof_url` | text | Proof photo/video Cloudinary URL |
| `stripe_payment_intent_id` | text | Stripe PaymentIntent ID |
| `is_test_job` | boolean | Excluded from OS analytics |
| `is_same_day` | boolean | Same-day job flag |
| `stuck_acknowledged_at` | timestamp | Admin acknowledged stuck job |

### `payments`
Financial records for all job payments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Payment ID |
| `job_id` | integer | Associated job |
| `hirer_id` | integer | Paying user |
| `worker_id` | integer | Receiving user |
| `amount` | real | Total amount |
| `platform_fee` | real | GUBER platform fee |
| `worker_amount` | real | Worker's net payout |
| `stripe_payment_intent_id` | text | Stripe PI ID |
| `status` | text | `pending` \| `captured` \| `transferred` \| `refunded` |

### `wallet_transactions`
Worker and hirer wallet ledger.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Transaction ID |
| `user_id` | integer | User |
| `type` | text | `credit` \| `debit` \| `payout` \| `refund` \| `bonus` |
| `amount` | real | Amount (USD) |
| `description` | text | Human-readable reason |
| `reference_id` | text | Job ID or Stripe reference |
| `created_at` | timestamp | Transaction time |

---

## GUBER Studio Tables

### `studio_sessions`
24-hour AI generation sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Session ID |
| `user_id` | integer | Owner |
| `status` | text | `active` \| `expired` |
| `credits_used` | integer | Credits consumed this session |
| `last_heartbeat_at` | timestamp | Last 4-min heartbeat |
| `expires_at` | timestamp | Session expiry (24h from creation) |

### `studio_model_pricing`
Per-tool credit costs (DB-managed, not hardcoded).

| Column | Type | Description |
|--------|------|-------------|
| `tool_id` | text PK | Tool identifier (e.g. `kling_motion_control`) |
| `credit_cost` | integer | Credits per generation |
| `label` | text | Display name |
| `enabled` | boolean | Kill-switch |

Current pricing:
| Tool | Credits |
|------|---------|
| `kling_motion_control` | 80 |
| `wan_motion_5s` | 30 |
| `wan_motion_10s` | 60 |
| `minimax_music` | 5 |

### `studio_featured_clips`
Admin-curated clips for the For You feed at `/studio/explore`.

---

## Verified Release System Tables

### `protected_assets`
Assets registered for custody protection.

### `custody_events` ⚠️ APPEND-ONLY
Immutable chain of custody events. Postgres rules prevent UPDATE/DELETE.
Every state transition (pickup, loading, departure, delivery, incidents) is
recorded here and can never be altered.

### `release_authorizations`
Pending release requests with GPS, selfie, tow/trailer verification references.

### `release_codes`
HMAC-hashed one-time release codes (plain text code is never stored after display).

### `tow_vehicle_verifications` / `trailer_verifications` / `vin_verifications`
Physical verification records tied to release authorizations.

### `master_transport_events`
Full transport lifecycle (origin → destination).

### `incidents` / `transport_issues` / `storage_events`
Issues and incidents tied to protected assets.

### `witness_assignments` / `witness_reports`
Third-party witness verification records and payouts.

### `asset_protection_purchases`
Purchase records for protection packages (idempotent Stripe fulfillment).

### `founders_club_state`
Singleton row (id=1) tracking Founders Club capacity and pricing.

---

## Push Notification Tables

### `push_subscriptions`
Web VAPID push subscriptions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `user_id` | integer | User |
| `endpoint` | text | Push endpoint URL |
| `p256dh` | text | Public key |
| `auth` | text | Auth secret |

### `push_tokens`
Native device tokens (iOS APNs + Android FCM).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `user_id` | integer | User |
| `token` | text | Device token |
| `platform` | text | `ios` \| `android` |
| `created_at` | timestamp | |

---

## Feature Flags Table

### `feature_flags`
Runtime feature flag state (overrides defaults from `shared/feature-flags.ts`).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `key` | text unique | Flag key (e.g. `studio_v2`) |
| `enabled` | boolean | Current state |
| `scope` | text | `off` \| `global` \| `role` \| `allowlist` |
| `allowed_roles` | text[] | Roles if scope=role |
| `allowlist` | integer[] | User IDs if scope=allowlist |
| `updated_at` | timestamp | Last change |
| `updated_by` | integer | Admin who changed it |

---

## Load Board Tables

### `load_board_listings`
Freight/load board listings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `poster_id` | integer | Posting user |
| `category` | text | Load type |
| `pickup_location` | text | Origin city/state |
| `pickup_zip` | text | Origin zip code |
| `delivery_location` | text | Destination |
| `delivery_zip` | text | Destination zip |
| `posted_price` | real | Asking price (USD) |
| `pricing_mode` | text | `fixed` \| `negotiable` |
| `status` | text | `active` \| `filled` \| `cancelled` |
| `urgent` | boolean | Urgent flag |
| `trailer_preference` | text | Trailer type required |

---

## Key Indexes

```sql
-- High-traffic query optimization
CREATE INDEX idx_jobs_poster ON jobs(poster_id);
CREATE INDEX idx_jobs_worker ON jobs(worker_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_zip ON jobs(zip);
CREATE INDEX idx_jobs_lat_lng ON jobs(lat, lng);
CREATE INDEX idx_payments_job ON payments(job_id);
CREATE INDEX idx_wallet_user ON wallet_transactions(user_id);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_custody_events_asset ON custody_events(asset_id);
CREATE INDEX IDX_session_expire ON user_sessions(expire);
```

---

## Drizzle Commands

```bash
# View schema in browser GUI (local dev only)
npm run db:studio

# Push schema changes to local DB (dev only, never production)
npm run db:push

# Generate migration files (reference only — migrations not run directly)
npx drizzle-kit generate

# Introspect existing DB
npx drizzle-kit introspect
```
