#!/bin/bash
set -e
npm install

# ---------------------------------------------------------------------------
# Safe schema sync: add new columns/tables via explicit SQL only.
# We do NOT run `npm run db:push` here because drizzle-kit's push command
# prompts interactively when it detects data-loss changes (e.g. removing the
# `user_sessions` table that connect-pg-simple manages outside drizzle).
# Instead, every new column or table introduced by a task is listed below.
# ---------------------------------------------------------------------------

psql "$DATABASE_URL" << 'SQL'

-- pinned_findings (added for admin stuck-job feature)
CREATE TABLE IF NOT EXISTS pinned_findings (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  note TEXT DEFAULT '',
  pinned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- jobs: stuck-job acknowledgement columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_at TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_by INTEGER;

-- Unique constraints: drizzle generates _unique names; DB had _key names.
-- These DO-blocks are idempotent and safe to re-run on any environment.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'og_preapproved_emails_email_unique') THEN
    ALTER TABLE og_preapproved_emails ADD CONSTRAINT og_preapproved_emails_email_unique UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_unique') THEN
    ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_user_id_unique') THEN
    ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_settings_key_unique') THEN
    ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_key_unique UNIQUE (key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trust_box_preapproved_emails_email_unique') THEN
    ALTER TABLE trust_box_preapproved_emails ADD CONSTRAINT trust_box_preapproved_emails_email_unique UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referred_id_unique') THEN
    ALTER TABLE referrals ADD CONSTRAINT referrals_referred_id_unique UNIQUE (referred_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_business_projections_user_id_unique') THEN
    ALTER TABLE worker_business_projections ADD CONSTRAINT worker_business_projections_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_stripe_event_id_unique') THEN
    ALTER TABLE billing_events ADD CONSTRAINT billing_events_stripe_event_id_unique UNIQUE (stripe_event_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_check_eligibility_user_id_unique') THEN
    ALTER TABLE background_check_eligibility ADD CONSTRAINT background_check_eligibility_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_accounts_owner_user_id_unique') THEN
    ALTER TABLE business_accounts ADD CONSTRAINT business_accounts_owner_user_id_unique UNIQUE (owner_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referral_code_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);
  END IF;
END $$;

-- users.guber_id and users.public_username: convert raw unique indexes
-- (created by an earlier migration) to proper constraint-backed indexes
-- so drizzle-kit recognises them as managed constraints.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_guber_id_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_guber_id_unique'
  ) THEN
    EXECUTE 'DROP INDEX users_guber_id_unique';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_guber_id_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_guber_id_unique UNIQUE (guber_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_public_username_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_public_username_unique'
  ) THEN
    EXECUTE 'DROP INDEX users_public_username_unique';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_public_username_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_public_username_unique UNIQUE (public_username);
  END IF;
END $$;

SQL

echo "[post-merge] Schema sync complete."
