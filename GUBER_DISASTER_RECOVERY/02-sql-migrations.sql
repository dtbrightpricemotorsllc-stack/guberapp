-- GUBER Complete SQL Schema
-- Run this against a fresh PostgreSQL database to recreate the full schema.
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).
-- This is extracted from server/index.ts provisioning + shared/schema.ts.
-- Last updated: June 2026

-- ─── Session Store ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");

-- ─── OAuth Nonce Store (replay protection) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_used_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_used_nonces_expires_at ON oauth_used_nonces (expires_at);

-- ─── Core Users Table ─────────────────────────────────────────────────────────
-- Source of truth: shared/schema.ts → users
-- Contains all user fields, identity, trust, Studio credits, payment IDs, etc.
-- Run `npm run db:push` in development to sync any new columns.
-- In production, use ALTER TABLE ... ADD COLUMN IF NOT EXISTS in server/index.ts.

-- ─── Business Tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_accounts (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  work_email TEXT NOT NULL,
  phone TEXT,
  industry TEXT,
  company_needs_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending_business',
  verification_fee_paid BOOLEAN DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_email TEXT,
  business_address TEXT,
  authorized_contact_name TEXT,
  ein_encrypted TEXT,
  ein_last4 TEXT,
  verification_submitted_at TIMESTAMP,
  verified_at TIMESTAMP,
  company_logo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_plans (
  id SERIAL PRIMARY KEY,
  business_account_id INTEGER NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'scout',
  status TEXT NOT NULL DEFAULT 'active',
  included_unlocks_per_month INTEGER NOT NULL DEFAULT 20,
  current_unlock_balance INTEGER NOT NULL DEFAULT 20,
  renews_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_candidate_unlocks (
  id SERIAL PRIMARY KEY,
  business_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  unlock_source TEXT NOT NULL DEFAULT 'plan',
  payment_reference TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_offers (
  id SERIAL PRIMARY KEY,
  business_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  offer_type TEXT NOT NULL DEFAULT 'direct_work',
  subject TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT NOW(),
  viewed_at TIMESTAMP,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  expired_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worker_business_projections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  guber_id TEXT,
  primary_categories JSONB,
  current_region TEXT,
  mobility_type TEXT DEFAULT 'local_only',
  jobs_completed INTEGER DEFAULT 0,
  completion_rate REAL DEFAULT 100,
  average_rating REAL DEFAULT 0,
  response_speed_score REAL DEFAULT 0,
  proof_strength_score REAL DEFAULT 0,
  recent_activity_flag BOOLEAN DEFAULT false,
  recent_regions_summary TEXT,
  id_verified BOOLEAN DEFAULT false,
  background_verified BOOLEAN DEFAULT false,
  elite_badges_json JSONB,
  revenue_earned REAL DEFAULT 0,
  availability_status TEXT DEFAULT 'available',
  business_visibility_status TEXT DEFAULT 'visible',
  review_count INTEGER DEFAULT 0,
  reliability_score REAL DEFAULT 100,
  lat REAL,
  lng REAL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS background_check_eligibility (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  eligibility_source TEXT NOT NULL DEFAULT 'revenue_milestone',
  threshold_amount REAL NOT NULL DEFAULT 1000,
  unlocked_at TIMESTAMP,
  notification_sent_at TIMESTAMP,
  accepted_at TIMESTAMP,
  passed_at TIMESTAMP,
  declined_at TIMESTAMP,
  badge_granted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_events (
  id SERIAL PRIMARY KEY,
  business_account_id INTEGER NOT NULL,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'processed',
  raw_reference TEXT
);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id SERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMP DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_biz_accounts_status ON business_accounts(status);
CREATE INDEX IF NOT EXISTS idx_biz_unlocks_biz ON business_candidate_unlocks(business_account_id);
CREATE INDEX IF NOT EXISTS idx_biz_offers_biz ON business_offers(business_account_id);
CREATE INDEX IF NOT EXISTS idx_biz_offers_user ON business_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_proj_user ON worker_business_projections(user_id);
CREATE INDEX IF NOT EXISTS idx_bg_check_user ON background_check_eligibility(user_id);

-- ─── Marketplace Purchases ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_buyer_order_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  payment_status TEXT DEFAULT 'free',
  month_key TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bo_purchases_user_listing ON marketplace_buyer_order_purchases(user_id, listing_id);
CREATE INDEX IF NOT EXISTS idx_bo_purchases_session ON marketplace_buyer_order_purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_bo_purchases_user_month ON marketplace_buyer_order_purchases(user_id, month_key);

-- ─── Preset Listings (Business Discovery) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS preset_listings (
  id SERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  phone_number TEXT,
  social_media_url TEXT,
  category TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  profile_slug TEXT NOT NULL UNIQUE,
  claimed_status BOOLEAN NOT NULL DEFAULT false,
  drafted_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_preset_listings_zip ON preset_listings(zip_code);

-- ─── Live Task Location Tracking ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_location_pings (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_location_pings_job ON job_location_pings(job_id);

-- ─── GUBER Verified Release System™ — Asset Custody Engine ───────────────────
-- IMPORTANT: custody_events is APPEND-ONLY.
-- The Postgres rules at the bottom of this file enforce this.

ALTER TABLE users ADD COLUMN IF NOT EXISTS founding_asset_protection_member boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS protected_assets (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  listing_id INTEGER,
  job_id INTEGER,
  asset_type TEXT NOT NULL DEFAULT 'vehicle',
  vin TEXT,
  year TEXT,
  make TEXT,
  model TEXT,
  description TEXT,
  estimated_value REAL,
  package_tier TEXT NOT NULL DEFAULT 'none',
  witness_addon BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  geofence_lat REAL,
  geofence_lng REAL,
  geofence_radius_meters INTEGER DEFAULT 250,
  founder_protected BOOLEAN DEFAULT false,
  frozen_at TIMESTAMP,
  frozen_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protected_assets_owner ON protected_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_protected_assets_listing ON protected_assets(listing_id);

CREATE TABLE IF NOT EXISTS asset_roles (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_roles_asset ON asset_roles(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_roles_user ON asset_roles(user_id);

-- APPEND-ONLY: Do NOT INSERT into this table directly except via storage.ts.
-- Do NOT attempt UPDATE or DELETE — the rules below will silently ignore them.
CREATE TABLE IF NOT EXISTS custody_events (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  actor_id INTEGER,
  event_type TEXT NOT NULL,
  description TEXT,
  metadata JSON,
  lat REAL,
  lng REAL,
  photo_urls TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custody_events_asset ON custody_events(asset_id);

CREATE TABLE IF NOT EXISTS release_authorizations (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  requested_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  selfie_url TEXT,
  lat REAL,
  lng REAL,
  geofence_verified BOOLEAN DEFAULT false,
  geofence_meters INTEGER,
  tow_verification_id INTEGER,
  trailer_verification_id INTEGER,
  vin_verification_id INTEGER,
  approved_by INTEGER,
  approved_at TIMESTAMP,
  denied_reason TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_release_auth_asset ON release_authorizations(asset_id);

CREATE TABLE IF NOT EXISTS release_codes (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  authorization_id INTEGER,
  code TEXT NOT NULL,
  code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  used_at TIMESTAMP,
  used_by INTEGER,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_release_codes_asset ON release_codes(asset_id);

CREATE TABLE IF NOT EXISTS tow_vehicle_verifications (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  authorization_id INTEGER,
  carrier_id INTEGER NOT NULL,
  vehicle_type TEXT,
  plate_number TEXT,
  plate_state TEXT,
  photo_urls TEXT[],
  verified BOOLEAN DEFAULT false,
  verified_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailer_verifications (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  authorization_id INTEGER,
  carrier_id INTEGER NOT NULL,
  trailer_type TEXT,
  trailer_number TEXT,
  plate_number TEXT,
  photo_urls TEXT[],
  verified BOOLEAN DEFAULT false,
  verified_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vin_verifications (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  authorization_id INTEGER,
  expected_vin TEXT,
  scanned_vin TEXT,
  matched BOOLEAN,
  photo_url TEXT,
  verified_by INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_transport_events (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  carrier_id INTEGER,
  origin_address TEXT,
  origin_lat REAL,
  origin_lng REAL,
  dest_address TEXT,
  dest_lat REAL,
  dest_lng REAL,
  status TEXT NOT NULL DEFAULT 'created',
  loaded_at TIMESTAMP,
  departed_at TIMESTAMP,
  arrived_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_master_transport_asset ON master_transport_events(asset_id);

CREATE TABLE IF NOT EXISTS transport_issues (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  master_event_id INTEGER,
  reported_by INTEGER NOT NULL,
  issue_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  reported_by INTEGER NOT NULL,
  incident_type TEXT NOT NULL,
  description TEXT,
  photo_urls TEXT[],
  lat REAL,
  lng REAL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  protection_claim_status TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incidents_asset ON incidents(asset_id);

CREATE TABLE IF NOT EXISTS storage_events (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  location_name TEXT,
  lat REAL,
  lng REAL,
  photo_urls TEXT[],
  actor_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS witness_assignments (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  witness_user_id INTEGER,
  job_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  payout_amount REAL,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  stripe_transfer_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_witness_assign_asset ON witness_assignments(asset_id);

CREATE TABLE IF NOT EXISTS witness_reports (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  witness_user_id INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  notes TEXT,
  photo_urls TEXT[],
  lat REAL,
  lng REAL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_protection_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  asset_id INTEGER,
  listing_id INTEGER,
  product_type TEXT NOT NULL,
  package_tier TEXT,
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfilled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_purchases_user ON asset_protection_purchases(user_id);

CREATE TABLE IF NOT EXISTS founders_club_state (
  id SERIAL PRIMARY KEY,
  total_claimed INTEGER NOT NULL DEFAULT 0,
  cap_limit INTEGER NOT NULL DEFAULT 500,
  founder_price_cents INTEGER NOT NULL DEFAULT 9900,
  standard_price_cents INTEGER NOT NULL DEFAULT 29900,
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Singleton row — only ever 1 row
INSERT INTO founders_club_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── Append-Only Enforcement for Chain of Custody ─────────────────────────────
-- These rules make custody_events truly immutable at the database level.
-- Any UPDATE or DELETE silently does nothing.
CREATE OR REPLACE RULE custody_events_no_update AS
  ON UPDATE TO custody_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE custody_events_no_delete AS
  ON DELETE TO custody_events DO INSTEAD NOTHING;

-- ─── Migration: Additional columns added post-launch ─────────────────────────
-- All ALTER TABLE statements use IF NOT EXISTS — safe to re-run.

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS ein text;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS legal_business_name text;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_at TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_by INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_test_job boolean DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_user boolean DEFAULT false;

ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMP;

-- ─── Notes ────────────────────────────────────────────────────────────────────
-- Additional tables defined in shared/schema.ts (managed by Drizzle):
--   users, jobs, job_applications, job_reviews, job_checklists,
--   job_checklist_items, payments, wallet_transactions, disputes,
--   messages, message_threads, notifications, push_subscriptions,
--   push_tokens, id_verifications, selfie_verifications,
--   worker_qualifications, direct_offers, barter_listings,
--   observation_listings, cash_drops, cash_drop_claims,
--   marketplace_listings, studio_sessions, studio_session_files,
--   studio_generation_log, studio_model_pricing, studio_featured_clips,
--   feature_flags, platform_settings, service_pricing_configs,
--   load_board_listings, os_agent_tasks, os_agent_logs, os_briefings,
--   and more.
--
-- For the FULL schema including all columns, see:
--   shared/schema.ts  (Drizzle ORM definitions)
--   Run: npm run db:studio  (Drizzle Studio GUI to browse live schema)
