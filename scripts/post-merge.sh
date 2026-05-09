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

-- users: cash drop host logo slots (task-290)
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_drop_logo_2 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_drop_active_logo INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_drop_logo1_admin_uploaded BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_drop_logo2_admin_uploaded BOOLEAN DEFAULT false;

-- users: smart-reminder notification preferences (task-308 / Phase 5)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reminder_pre_arrival BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reminder_on_the_way BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reminder_payout_release BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reminder_at_risk BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reminder_drop_expiring BOOLEAN DEFAULT true;

-- reminders_sent: atomic dedupe table for smart reminders (task-308 / Phase 5)
-- Partial unique indexes guarantee single-fire per (job, type) and per
-- (cash_drop, user, type) even if cron sweeps overlap or race.
CREATE TABLE IF NOT EXISTS reminders_sent (
  id SERIAL PRIMARY KEY,
  job_id INTEGER,
  cash_drop_id INTEGER,
  user_id INTEGER,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS reminders_sent_job_type_uniq
  ON reminders_sent (job_id, reminder_type)
  WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reminders_sent_drop_user_type_uniq
  ON reminders_sent (cash_drop_id, user_id, reminder_type)
  WHERE cash_drop_id IS NOT NULL AND user_id IS NOT NULL;

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

-- apns_device_tokens: native iOS APNs device tokens from @capacitor/push-notifications
-- Allows the server to deliver pushes directly to APNs with a custom aps.sound field
-- instead of going through Apple's Web Push Gateway (which ignores aps.sound).
CREATE TABLE IF NOT EXISTS apns_device_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- push_send_log: per-attempt push delivery log (admin Push Log tab)
CREATE TABLE IF NOT EXISTS push_send_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_code TEXT,
  title TEXT,
  tag TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_send_log_user_idx ON push_send_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS push_send_log_sent_idx ON push_send_log (sent_at DESC);

-- worker_qualifications: AI-extracted credential card fields (task-372)
-- Read by /api/users/:id/certifications and /api/users/me/qualifications;
-- production was missing these so both endpoints returned 500 with
-- "column issuing_authority does not exist".
ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS issuing_authority TEXT;
ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMP;
ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS credential_type TEXT;
ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS ai_extracted BOOLEAN DEFAULT false;

-- AI Video Studio (task-439): credits balance, tier, OG drip tracker + tables.
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_credits integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_tier text DEFAULT 'standard';
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_credits_last_drip_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_subscription_status text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_subscription_cancel_at_period_end boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_resume_video_id integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_business_promo_video_id integer;
ALTER TABLE cash_drops ADD COLUMN IF NOT EXISTS studio_video_id integer;

CREATE TABLE IF NOT EXISTS studio_videos (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  tier text NOT NULL DEFAULT 'standard',
  source_image_url text,
  vibe_id integer,
  prompt text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 5,
  credits_cost integer NOT NULL DEFAULT 1,
  video_url text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'pending',
  error_reason text,
  fal_job_id text,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS studio_videos_user_idx ON studio_videos(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_vibes (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  preview_video_url text,
  thumbnail_url text,
  prompt_modifier text NOT NULL,
  tier_required text NOT NULL DEFAULT 'standard',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- jobs.is_demo: permanent flag for demo/seed jobs — prevents them from ever appearing
-- on the public map or heat map regardless of demo-user ID caching state.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
UPDATE jobs
  SET is_demo = true
  WHERE is_demo = false
    AND posted_by_id IN (
      SELECT id FROM users
      WHERE email IN ('demo.consumer@guberapp.internal', 'demo.business@guberapp.internal')
    );

-- proof_submissions.capture_meta: POV / hands-free capture metadata (task-454)
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS capture_meta jsonb;

-- proof_submissions.pov_summary: AI-generated scene cards for POV proof videos (task-458)
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS pov_summary jsonb;

-- platform_settings: hands-free capture kill-switch (task-454)
INSERT INTO platform_settings (key, value, category, description)
VALUES ('handsfree_capture_enabled', 'false', 'trust', 'Show the Hands-Free POV recorder on V&I jobs and accept wearable uploads. Default OFF — dark launch; admin enables for staff/dev cohorts first.')
ON CONFLICT (key) DO NOTHING;

-- ── QA Dashboard (task-462) ─────────────────────────────────────────────
ALTER TABLE users      ADD COLUMN IF NOT EXISTS is_test_user boolean DEFAULT false;
ALTER TABLE users      ADD COLUMN IF NOT EXISTS handsfree_blocked_attempts integer DEFAULT 0;
ALTER TABLE users      ADD COLUMN IF NOT EXISTS handsfree_blocked_last_at  timestamp;
ALTER TABLE jobs       ADD COLUMN IF NOT EXISTS is_test_job  boolean DEFAULT false;
ALTER TABLE jobs       ADD COLUMN IF NOT EXISTS visibility   text    NOT NULL DEFAULT 'public';
ALTER TABLE cash_drops ADD COLUMN IF NOT EXISTS is_test_drop boolean DEFAULT false;
ALTER TABLE cash_drops ADD COLUMN IF NOT EXISTS visibility   text    NOT NULL DEFAULT 'public';
CREATE INDEX IF NOT EXISTS jobs_visibility_idx       ON jobs(visibility);
CREATE INDEX IF NOT EXISTS cash_drops_visibility_idx ON cash_drops(visibility);

CREATE TABLE IF NOT EXISTS feature_flags (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  rollout_scope text NOT NULL DEFAULT 'global',
  allowed_roles text[],
  allowed_user_ids integer[],
  note text,
  updated_by integer,
  updated_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tester_allowlist (
  id serial PRIMARY KEY,
  item_type text NOT NULL,
  item_id integer NOT NULL,
  user_id integer NOT NULL,
  invited_by integer,
  invited_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tester_allowlist_uniq
  ON tester_allowlist (item_type, item_id, user_id);
CREATE INDEX IF NOT EXISTS tester_allowlist_user_idx
  ON tester_allowlist (user_id, item_type);

CREATE TABLE IF NOT EXISTS cash_drop_events (
  id serial PRIMARY KEY,
  cash_drop_id integer NOT NULL,
  event_type text NOT NULL,
  reason_code text,
  actor_user_id integer,
  source text,
  payload jsonb,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_drop_events_drop_idx
  ON cash_drop_events (cash_drop_id, created_at DESC);

-- ── V&I Satisfied / Request-Retake review flow + 30-day media retention (task-494) ──
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS review_decision text DEFAULT 'pending';
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS reviewed_at timestamp;
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS reviewed_by integer;
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS retake_count integer DEFAULT 0;
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS retake_reasons text[];
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS review_window_expires_at timestamp;
ALTER TABLE proof_submissions ADD COLUMN IF NOT EXISTS media_purged_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vi_retake_count integer DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vi_retake_reasons text[];
CREATE INDEX IF NOT EXISTS proof_submissions_review_window_idx
  ON proof_submissions (review_window_expires_at)
  WHERE review_decision = 'pending';
CREATE INDEX IF NOT EXISTS proof_submissions_media_purge_idx
  ON proof_submissions (created_at)
  WHERE media_purged_at IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS excessive_retake_count integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS poor_proof_count integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS task_history_summary (
  id serial PRIMARY KEY,
  job_id integer NOT NULL UNIQUE,
  poster_id integer,
  helper_id integer,
  category text,
  vi_category text,
  job_type text,
  proof_review_decision text,
  retake_count integer DEFAULT 0,
  proof_count integer DEFAULT 0,
  completion_status text,
  outcome text,
  poster_rating_impact real,
  worker_rating_impact real,
  metadata jsonb,
  completed_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_history_summary_helper_idx
  ON task_history_summary (helper_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS task_history_summary_poster_idx
  ON task_history_summary (poster_id, completed_at DESC);

-- ── GUBER Studio v2 cutover ─────────────────────────────────────────────
-- Drop the v1 tables (studio_videos / studio_vibes) and the user/cash_drop
-- columns that referenced them. Generated media is now session-scoped and
-- never persisted to the user's profile.
ALTER TABLE users      DROP COLUMN IF EXISTS studio_resume_video_id;
ALTER TABLE users      DROP COLUMN IF EXISTS studio_business_promo_video_id;
ALTER TABLE cash_drops DROP COLUMN IF EXISTS studio_video_id;
DROP TABLE IF EXISTS studio_videos;
DROP TABLE IF EXISTS studio_vibes;

CREATE TABLE IF NOT EXISTS studio_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamp NOT NULL DEFAULT now(),
  last_activity_at timestamp NOT NULL DEFAULT now(),
  ended_at timestamp,
  end_reason text
);
CREATE INDEX IF NOT EXISTS studio_sessions_user_active_idx
  ON studio_sessions (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS studio_sessions_active_idx
  ON studio_sessions (last_activity_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS studio_session_files (
  id serial PRIMARY KEY,
  session_id integer NOT NULL,
  user_id integer NOT NULL,
  file_type text NOT NULL,
  provider_url text NOT NULL,
  cloudinary_public_id text,
  resource_type text NOT NULL DEFAULT 'image',
  meta jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_session_files_session_idx
  ON studio_session_files (session_id);

CREATE TABLE IF NOT EXISTS studio_generation_log (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  session_id integer,
  tool_key text NOT NULL,
  prompt text,
  credits_cost integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  provider_job_id text,
  status text NOT NULL DEFAULT 'succeeded',
  error_reason text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_generation_log_user_idx
  ON studio_generation_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_model_pricing (
  id serial PRIMARY KEY,
  tool_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  provider_endpoint text NOT NULL,
  credits_cost integer NOT NULL DEFAULT 1,
  duration_seconds integer,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO studio_model_pricing (tool_key, label, description, provider_endpoint, credits_cost, duration_seconds, active) VALUES
  ('kling_motion_control', 'Motion Control Video',
   'Photo + prompt → cinematic 5s clip with controlled camera motion (Kling v3 Pro).',
   'fal-ai/kling-video/v3/pro/motion-control', 2, 5, true),
  ('wan_motion_5s',        'Quick Motion Clip · 5s',
   'Text or image to a fast 5-second motion clip (Wan).',
   'fal-ai/wan-motion', 1, 5, true),
  ('wan_motion_10s',       'Quick Motion Clip · 10s',
   'Text or image to a 10-second motion clip (Wan).',
   'fal-ai/wan-motion', 2, 10, true),
  ('minimax_music',        'AI Music Track',
   'Prompt → ~30s instrumental track (MiniMax Music v2).',
   'fal-ai/minimax-music/v2', 1, 30, true)
ON CONFLICT (tool_key) DO NOTHING;

-- task-506: drone_certified flag on worker_business_projections
ALTER TABLE worker_business_projections ADD COLUMN IF NOT EXISTS drone_certified BOOLEAN DEFAULT false;

-- Studio v2 feature flag: restrict to admin-only by default so admins can
-- preview and then flip to "global" in the Feature Flag Console when ready.
UPDATE feature_flags
SET rollout_scope = 'role',
    allowed_roles = ARRAY['admin']
WHERE key = 'studio_v2'
  AND rollout_scope = 'global';

SQL

echo "[post-merge] Schema sync complete."
