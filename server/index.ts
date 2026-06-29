import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startCron } from "./cron";
import { seedCatalog, syncAdminCredentials, syncOGPreapprovedEmails, seedJobChecklists, migrateGuberIds, seedPAVCategory, seedPropertySituationsV2, seedReferralCodes, seedReferralExpiry, seedServicePricingConfigs, seedBoostColumns, seedDroneServices, seedDroneCategory, seedAutomotiveVIUseCases, seedBarterChecklists, reseedOnlineItemsSituations, seedPlatformSettings, seedUploadQuotaColumns, seedDisputeProtectionColumns, seedLiabilityColumns, seedMarketplaceSamples } from "./seed";
import { seedDemoAccounts } from "./seed-demo";
import { invalidateDemoIdCache } from "./demo-guard";
import { pool } from "./db";
import { setNonceStore, PgNonceStore } from "./oauth";
import { startStudioToolsListener } from "./studio-tools-notify";
import { startOSRuntime } from "./os/index";

const app = express();
const httpServer = createServer(app);

// Trust the first proxy hop (Replit edge / hosting proxy) so that
// req.ip resolves to the real client IP. This MUST be set before any
// rate-limit middleware mounts — otherwise every request looks like it
// came from the same proxy IP and all users share a single bucket,
// causing false 429s on /api/auth/login under normal traffic.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: (req) =>
    process.env.NODE_ENV !== "production" ||
    req.path.startsWith("/api/webhooks"),
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Skip in non-production so Playwright test suites can call login freely
  skip: () => process.env.NODE_ENV !== "production",
  message: {
    message:
      "Too many failed login attempts. Please wait a minute and try again.",
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many signup attempts from this IP. Please try again in an hour.",
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many password reset requests. Please try again in a few minutes.",
  },
});

app.use("/api", generalLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/demo-login", loginLimiter);
app.use("/api/auth/google/native", loginLimiter);
app.use("/api/auth/apple/native", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/auth/business-signup", signupLimiter);
app.use("/api/auth/business-access-request", signupLimiter);
app.use("/api/auth/forgot-password", passwordResetLimiter);
app.use("/api/auth/reset-password", passwordResetLimiter);

// Use type: () => true so the body is always captured as a raw Buffer regardless
// of how the production proxy may modify the Content-Type header.
// The signature check inside each handler determines authenticity.
app.use("/api/webhooks/stripe", express.raw({ type: () => true }));
app.use("/api/webhooks/stripe-connect", express.raw({ type: () => true }));

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Prevent browsers and proxies (including Cloudflare) from caching API responses.
// All /api/* routes serve live data — stale responses cause incorrect UI state.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const sessionSecret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (!sessionSecret || sessionSecret.length < 32) {
      console.error(
        "[GUBER] FATAL: SESSION_SECRET is missing or too short (must be ≥ 32 characters). " +
        "Refusing to start in production with an insecure session secret."
      );
      process.exit(1);
    }
    log(`[session] Real SESSION_SECRET loaded (${sessionSecret.length} chars).`);
  } else {
    if (!sessionSecret) {
      console.warn("[session] SESSION_SECRET not set — using insecure dev-only default. Do NOT use in production.");
    } else {
      log(`[session] SESSION_SECRET loaded from environment (${sessionSecret.length} chars).`);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
  `).catch(e => console.error("[sessions] table setup error:", e));

  const nonceTableReady = await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_used_nonces (
      nonce TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_used_nonces_expires_at ON oauth_used_nonces (expires_at);
  `).then(() => true).catch(e => {
    console.error("[oauth] nonce table setup error:", e);
    return false;
  });

  if (nonceTableReady) {
    setNonceStore(new PgNonceStore(pool));
    console.log("[oauth] Nonce store switched to PostgreSQL backend.");
  } else if (process.env.NODE_ENV === "production") {
    console.error("[oauth] FATAL: Could not create oauth_used_nonces table. Refusing to start without durable replay protection.");
    process.exit(1);
  } else {
    console.warn("[oauth] Falling back to in-memory nonce store (dev only — not suitable for production).");
  }

  await pool.query(`
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS ein text;
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS legal_business_name text;
  `).catch(e => console.error("[migration] business_profiles EIN columns error:", e));

  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_at TIMESTAMP;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_by INTEGER;
  `).catch(e => console.error("[migration] jobs stuck_acknowledged columns error:", e));

  // Analytics / OS-agent queries (server/os/*.ts) filter production data on these
  // test/demo flags. Defined in shared/schema.ts, but prod has no db:push step, so
  // self-heal them here (idempotent) to keep the dashboard queries from failing
  // with `column "is_test_job" does not exist`.
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_test_job boolean DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_user boolean DEFAULT false;
  `).catch(e => console.error("[migration] test-flag columns error:", e));

  await pool.query(`
    ALTER TABLE worker_qualifications ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMP;
  `).catch(e => console.error("[migration] worker_qualifications expiry_warning_sent_at error:", e));

  await pool.query(`
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
  `).catch(e => console.error("[migration] business tables error:", e));

  await pool.query(`
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
  `).catch(e => console.error("[migration] marketplace_buyer_order_purchases error:", e));

  await pool.query(`
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
  `).catch(e => console.error("[migration] preset_listings error:", e));

  await pool.query(`
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
  `).catch(e => console.error("[migration] job_location_pings error:", e));

  // ── GUBER Verified Release System™ — Asset Custody Engine ──────────────────
  // Prod has no db:push step, so provision these idempotently on boot. The
  // custody_events table is APPEND-ONLY, enforced below by a Postgres rule that
  // turns any UPDATE/DELETE into a no-op — it is the immutable chain of custody.
  await pool.query(`
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
      status TEXT NOT NULL DEFAULT 'active',
      used_at TIMESTAMP,
      used_by INTEGER,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_release_codes_asset ON release_codes(asset_id);
    ALTER TABLE release_codes ADD COLUMN IF NOT EXISTS code_hash TEXT;

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
    INSERT INTO founders_club_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `).catch(e => console.error("[migration] verified release system tables error:", e));

  // Append-only enforcement for the chain of custody. Any UPDATE or DELETE is
  // silently rewritten to do nothing, so historical events can never be altered
  // or removed at the SQL level — even by application bugs or compromised code.
  await pool.query(`
    CREATE OR REPLACE RULE custody_events_no_update AS
      ON UPDATE TO custody_events DO INSTEAD NOTHING;
    CREATE OR REPLACE RULE custody_events_no_delete AS
      ON DELETE TO custody_events DO INSTEAD NOTHING;
  `).catch(e => console.error("[migration] custody_events append-only rule error:", e));

  // ── Saved Service Area ────────────────────────────────────────────────────
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS service_radius   INTEGER DEFAULT 25;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_categories TEXT[];
  `).catch(e => console.error("[migration] service area columns error:", e));

  // ── GUBER Growth Engine ────────────────────────────────────────────────────
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS growth_credits INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS guber_score    INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS growth_task_templates (
      id            SERIAL PRIMARY KEY,
      emoji         TEXT NOT NULL DEFAULT '📢',
      title         TEXT NOT NULL,
      description   TEXT,
      reward_credits INTEGER NOT NULL DEFAULT 25,
      reward_score   INTEGER NOT NULL DEFAULT 50,
      og_bonus_pct   INTEGER NOT NULL DEFAULT 25,
      category       TEXT NOT NULL DEFAULT 'community',
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      paused         BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS zip_fallback_settings (
      id                       SERIAL PRIMARY KEY,
      scope                    TEXT NOT NULL DEFAULT 'global',
      scope_value              TEXT NOT NULL DEFAULT '',
      enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
      show_when_real_jobs_exist BOOLEAN NOT NULL DEFAULT FALSE,
      max_tasks_shown          INTEGER NOT NULL DEFAULT 6,
      updated_at               TIMESTAMP DEFAULT NOW(),
      UNIQUE (scope, scope_value)
    );

    CREATE TABLE IF NOT EXISTS growth_task_completions (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL,
      template_id        INTEGER NOT NULL,
      zip                TEXT,
      credits_awarded    INTEGER NOT NULL DEFAULT 0,
      score_awarded      INTEGER NOT NULL DEFAULT 0,
      submission_data    JSONB,
      device_fingerprint TEXT,
      ip_address         TEXT,
      lat                REAL,
      lng                REAL,
      status             TEXT NOT NULL DEFAULT 'approved',
      rejection_reason   TEXT,
      created_at         TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_growth_completions_user     ON growth_task_completions(user_id);
    CREATE INDEX IF NOT EXISTS idx_growth_completions_template ON growth_task_completions(template_id);
    CREATE INDEX IF NOT EXISTS idx_growth_completions_created  ON growth_task_completions(created_at DESC);

    CREATE TABLE IF NOT EXISTS growth_reward_config (
      key        TEXT PRIMARY KEY,
      value_int  INTEGER NOT NULL DEFAULT 0,
      label      TEXT NOT NULL,
      description TEXT,
      updated_at  TIMESTAMP DEFAULT NOW()
    );
  `).catch(e => console.error("[migration] growth engine tables error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS growth_score_ranks (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      emoji      TEXT NOT NULL DEFAULT '',
      min_score  INTEGER NOT NULL,
      max_score  INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO growth_score_ranks (title, emoji, min_score, max_score, sort_order) VALUES
      ('Rookie Scout',       '🌱', 0,     499,   1),
      ('Local Scout',        '🔍', 500,   1999,  2),
      ('Senior Scout',       '⭐', 2000,  4999,  3),
      ('City Scout',         '🏙️', 5000,  9999,  4),
      ('City Leader',        '🏆', 10000, 24999, 5),
      ('City Founder Elite', '👑', 25000, NULL,  6)
    ON CONFLICT DO NOTHING;
  `).catch(e => console.error("[migration] growth_score_ranks error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_business_pins (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL,
      category          TEXT NOT NULL DEFAULT 'Business',
      description       TEXT,
      address           TEXT,
      city              TEXT,
      state             TEXT,
      zip               TEXT,
      lat               REAL NOT NULL,
      lng               REAL NOT NULL,
      phone             TEXT,
      website           TEXT,
      logo_url          TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      featured          BOOLEAN NOT NULL DEFAULT FALSE,
      added_by_admin_id INTEGER,
      created_at        TIMESTAMP DEFAULT NOW()
    );
  `).catch(e => console.error("[migration] local_business_pins error:", e));

  // ── Credit Ledger + Cashout tables (Phase 1 credits rollout) ─────────────
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_credits           INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_credits_earned   INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_credits_redeemed INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL,
      amount             INTEGER NOT NULL,
      dollar_equivalent  NUMERIC(10,4) NOT NULL DEFAULT 0,
      source_type        TEXT NOT NULL,
      task_completion_id INTEGER,
      status             TEXT NOT NULL DEFAULT 'approved',
      reason             TEXT,
      created_at         TIMESTAMP DEFAULT NOW(),
      approved_at        TIMESTAMP,
      redeemed_at        TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_user   ON credit_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_status ON credit_ledger(status);
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger(created_at DESC);

    CREATE TABLE IF NOT EXISTS cashout_requests (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL,
      credits_requested INTEGER NOT NULL,
      dollar_amount     NUMERIC(10,2) NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      payout_method     TEXT,
      payout_details    TEXT,
      admin_note        TEXT,
      created_at        TIMESTAMP DEFAULT NOW(),
      reviewed_at       TIMESTAMP,
      reviewed_by       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cashout_requests_user   ON cashout_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_cashout_requests_status ON cashout_requests(status);
  `).catch(e => console.error("[migration] credit ledger / cashout tables error:", e));

  // ── Mission Instances + Proofs tables ─────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_instances (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      template_id     INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'accepted',
      zip             TEXT,
      lat             REAL,
      lng             REAL,
      accepted_at     TIMESTAMP DEFAULT NOW(),
      submitted_at    TIMESTAMP,
      reviewed_at     TIMESTAMP,
      reviewed_by     INTEGER,
      credits_awarded INTEGER DEFAULT 0,
      admin_note      TEXT,
      created_at      TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mission_instances_user     ON mission_instances(user_id);
    CREATE INDEX IF NOT EXISTS idx_mission_instances_template ON mission_instances(template_id);
    CREATE INDEX IF NOT EXISTS idx_mission_instances_status   ON mission_instances(status);

    CREATE TABLE IF NOT EXISTS mission_proofs (
      id                 SERIAL PRIMARY KEY,
      instance_id        INTEGER NOT NULL REFERENCES mission_instances(id),
      photo_url          TEXT,
      gps_lat            REAL,
      gps_lng            REAL,
      captured_at        TIMESTAMP,
      business_name      TEXT,
      address            TEXT,
      notes              TEXT,
      device_fingerprint TEXT,
      created_at         TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mission_proofs_instance ON mission_proofs(instance_id);
  `).catch(e => console.error("[migration] mission_instances/proofs error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jac_interactions (
      id          SERIAL PRIMARY KEY,
      visitor_id  TEXT NOT NULL,
      user_id     INTEGER REFERENCES users(id),
      session_id  TEXT,
      intent      TEXT,
      messages    JSONB DEFAULT '[]',
      zip         TEXT,
      converted   BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_jac_interactions_visitor ON jac_interactions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_jac_interactions_created ON jac_interactions(created_at);
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS user_type TEXT;
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS tracking JSONB DEFAULT '{}';
  `).catch(e => console.error("[migration] jac_interactions error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jac_user_profile (
      user_id            INTEGER PRIMARY KEY REFERENCES users(id),
      primary_goal       TEXT,
      user_type          TEXT,
      zip_code           TEXT,
      interests          JSONB DEFAULT '[]',
      service_needs      JSONB DEFAULT '[]',
      work_interests     JSONB DEFAULT '[]',
      transport_interest BOOLEAN DEFAULT FALSE,
      creator_interest   BOOLEAN DEFAULT FALSE,
      creator_platforms  JSONB DEFAULT '[]',
      business_owner     BOOLEAN DEFAULT FALSE,
      service_provider   BOOLEAN DEFAULT FALSE,
      retired            BOOLEAN DEFAULT FALSE,
      prefers_voice      BOOLEAN DEFAULT FALSE,
      assistant_mode     TEXT DEFAULT 'full',
      startup_behavior   TEXT DEFAULT 'show_summary',
      voice_enabled      BOOLEAN DEFAULT TRUE,
      language           TEXT DEFAULT 'en',
      tutorial_status    TEXT DEFAULT 'not_started',
      last_jac_summary   JSONB DEFAULT '{}',
      updated_at         TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jac_tutorial_state (
      user_id                  INTEGER PRIMARY KEY REFERENCES users(id),
      tutorial_started         BOOLEAN DEFAULT FALSE,
      tutorial_completed       BOOLEAN DEFAULT FALSE,
      selected_goal            TEXT,
      completed_steps          JSONB DEFAULT '[]',
      skipped_steps            JSONB DEFAULT '[]',
      last_tutorial_screen     TEXT,
      needs_followup           BOOLEAN DEFAULT FALSE,
      reset_count              INTEGER DEFAULT 0,
      last_seen_feature_version TEXT DEFAULT '1.0',
      updated_at               TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jac_missed_actions (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      action_type  TEXT NOT NULL,
      priority     TEXT DEFAULT 'medium',
      title        TEXT NOT NULL,
      description  TEXT,
      route        TEXT,
      cta_label    TEXT,
      status       TEXT DEFAULT 'active',
      created_at   TIMESTAMP DEFAULT NOW(),
      dismissed_at TIMESTAMP,
      remind_at    TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_jac_missed_user ON jac_missed_actions(user_id, status);
  `).catch(e => console.error("[migration] jac tables error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jac_memory (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category   TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      source     TEXT DEFAULT 'user_said',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, category, key)
    );
    CREATE INDEX IF NOT EXISTS idx_jac_memory_user ON jac_memory(user_id);
  `).catch(e => console.error("[migration] jac_memory error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jac_knowledge (
      id               SERIAL PRIMARY KEY,
      category         TEXT NOT NULL,
      title            TEXT NOT NULL,
      question_patterns JSONB DEFAULT '[]',
      keywords         JSONB DEFAULT '[]',
      answer           TEXT NOT NULL,
      follow_up_actions JSONB DEFAULT '[]',
      active           BOOLEAN DEFAULT TRUE,
      admin_approved   BOOLEAN DEFAULT TRUE,
      hit_count        INTEGER DEFAULT 0,
      created_by       TEXT DEFAULT 'system',
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jac_intents (
      id                 SERIAL PRIMARY KEY,
      intent_name        TEXT UNIQUE NOT NULL,
      display_name       TEXT NOT NULL,
      sample_phrases     JSONB DEFAULT '[]',
      required_fields    JSONB DEFAULT '[]',
      target_flow        TEXT,
      target_route       TEXT,
      backend_action     TEXT,
      follow_up_questions JSONB DEFAULT '[]',
      fallback_response  TEXT,
      active             BOOLEAN DEFAULT TRUE,
      hit_count          INTEGER DEFAULT 0,
      created_at         TIMESTAMP DEFAULT NOW(),
      updated_at         TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jac_response_cache (
      id            SERIAL PRIMARY KEY,
      cache_key     TEXT UNIQUE NOT NULL,
      question_text TEXT NOT NULL,
      answer_text   TEXT NOT NULL,
      intent_name   TEXT,
      source        TEXT DEFAULT 'ai_approved',
      admin_approved BOOLEAN DEFAULT FALSE,
      hit_count     INTEGER DEFAULT 0,
      last_hit_at   TIMESTAMP,
      created_at    TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS intent_detected TEXT;
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS cost_source TEXT DEFAULT 'ai';
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS jac_response TEXT;
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS user_feedback TEXT;
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS admin_reviewed BOOLEAN DEFAULT FALSE;
    ALTER TABLE jac_interactions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
  `).catch(e => console.error("[migration] jac_brain tables error:", e));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jac_dd_goals (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_amount  REAL NOT NULL,
      deadline     TEXT,
      plan_json    JSONB DEFAULT '[]',
      earned_so_far REAL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_jac_dd_goals_user ON jac_dd_goals(user_id, status);
  `).catch(e => console.error("[migration] jac_dd_goals error:", e));

  // Add realistic_earnable column to jac_dd_goals if not exists (idempotent)
  await pool.query(`
    ALTER TABLE jac_dd_goals ADD COLUMN IF NOT EXISTS realistic_earnable REAL DEFAULT 0;
  `).catch(e => console.error("[migration] jac_dd_goals realistic_earnable error:", e));

  // Add new JAC preference columns to jac_user_profile (idempotent)
  await pool.query(`
    ALTER TABLE jac_user_profile
      ADD COLUMN IF NOT EXISTS text_responses               BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS voice_activation             BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS floating_button              BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS proactive_suggestions        BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS personalized_recommendations BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS voice_selection              TEXT    DEFAULT 'default',
      ADD COLUMN IF NOT EXISTS low_data_mode                BOOLEAN DEFAULT FALSE;
  `).catch(e => console.error("[migration] jac_user_profile prefs error:", e));

  // Seed GUBER knowledge base (only if empty)
  await pool.query(`
    INSERT INTO jac_knowledge (category, title, question_patterns, keywords, answer, follow_up_actions, created_by)
    SELECT * FROM (VALUES
      ('general','What is GUBER',
        '["what is guber","how does guber work","what does guber do","tell me about guber","explain guber","about guber"]'::jsonb,
        '["guber","platform","how it works","global unlimited"]'::jsonb,
        'GUBER stands for Global Unlimited Business & Employment Resources. It''s a U.S.-only local platform where workers earn money on real nearby jobs, hirers post jobs and hire ID-verified workers, and users can buy/sell vehicles and items in the Marketplace. Our slogan: "Create Value In Yourself."',
        '[{"label":"Find work","message":"I want to find work nearby"},{"label":"Post a job","message":"I need to hire someone"},{"label":"Explore all features","message":"What else can GUBER do?"}]'::jsonb,
        'system'),
      ('general','Is GUBER free to use',
        '["is guber free","does guber cost money","how much does guber cost","is it free to sign up","free to join"]'::jsonb,
        '["free","cost","price","sign up","join"]'::jsonb,
        'Signing up and posting jobs is free. Workers earn from completed jobs. GUBER takes a small platform fee on completed transactions. Premium features like Studio credits, Scout Plan, and Day-1 OG have their own pricing.',
        '[{"label":"See Day-1 OG","message":"What is Day-1 OG?"},{"label":"Find work","message":"How do I start earning?"}]'::jsonb,
        'system'),
      ('jobs','How to post a job',
        '["how do i post a job","how do i hire someone","create a job","post a job listing","hire help","need to hire","want to hire","how to post"]'::jsonb,
        '["post job","hire","job listing","post a task","create job"]'::jsonb,
        'Tap "Post a Job" from the home screen or job board. Choose your service category, describe what you need, set a budget, and enter your ZIP code. Once posted, verified workers in your area can apply. You only pay when you lock in a worker.',
        '[{"label":"Post a job now","message":"I want to post a job"},{"label":"How does payment work?","message":"How does GUBER payment work?"}]'::jsonb,
        'system'),
      ('jobs','How to find work nearby',
        '["how do i find work","find jobs nearby","how do i get hired","looking for work","want to work","need a job","looking for jobs","find gigs","earn money","how to earn"]'::jsonb,
        '["find work","get hired","jobs nearby","earn","worker","gig"]'::jsonb,
        'Create a free account as a worker, complete ID verification, and browse available jobs in your area on the Job Board. Apply to jobs that match your skills. Once a hirer selects you, you''ll receive a notification and can coordinate directly.',
        '[{"label":"Sign up as worker","message":"I want to sign up as a worker"},{"label":"What jobs are available?","message":"What kind of jobs are on GUBER?"}]'::jsonb,
        'system'),
      ('payments','How does payment work',
        '["how do i get paid","when do i get paid","how does payment work","how does guber pay","stripe","wallet","how does the wallet work","getting paid"]'::jsonb,
        '["get paid","payment","wallet","stripe","earnings","payout"]'::jsonb,
        'GUBER uses Stripe for secure payments. Hirers fund a job when they lock in a worker. Once the job is marked complete and the hirer approves proof, the payment releases to your GUBER wallet. You can then withdraw to your bank via Stripe. Setup usually takes 2–5 business days.',
        '[{"label":"Set up Stripe","message":"How do I set up Stripe to get paid?"},{"label":"Withdraw money","message":"How do I withdraw my wallet balance?"}]'::jsonb,
        'system'),
      ('payments','Stripe onboarding setup',
        '["stripe onboarding","set up stripe","connect stripe","stripe account","how to withdraw","how to cash out","withdraw money","cash out wallet"]'::jsonb,
        '["stripe","onboarding","withdraw","cash out","bank account","payout setup"]'::jsonb,
        'Go to your Profile and tap "Set up payouts." This opens Stripe Express, where you''ll enter your SSN (last 4 digits), bank account info, and verify your identity. Once approved, your wallet balance can be withdrawn anytime. Most transfers arrive in 2–5 business days.',
        '[{"label":"Go to profile","message":"Take me to my profile"}]'::jsonb,
        'system'),
      ('general','What is Day-1 OG',
        '["what is day 1 og","day-1 og","og membership","founding membership","day one og","what is og","og benefits","day 1 original"]'::jsonb,
        '["day-1","og","founding","original","membership","day one"]'::jsonb,
        'Day-1 OG is GUBER''s founding membership. OG members get +20 Studio credits every month (rollover, no expiry), a permanent OG badge on their profile, priority in job matching, and exclusive perks as GUBER grows. You can join from your Profile page or the OG Advantage section.',
        '[{"label":"Join Day-1 OG","message":"How do I become a Day-1 OG?"},{"label":"What are Studio credits?","message":"What are GUBER Studio credits?"}]'::jsonb,
        'system'),
      ('credits','What are GUBER credits',
        '["what are credits","guber credits","how do credits work","what can i do with credits","credit system","earn credits","credits missions"]'::jsonb,
        '["credits","missions","earn credits","credit balance","reward"]'::jsonb,
        'GUBER credits are your in-app currency used primarily for GUBER Studio (AI content generation). You earn credits by completing City Missions — local tasks like reporting fuel prices, submitting local events, or verifying business info. New users get 2 free trial credits. Day-1 OG members receive +20 credits/month.',
        '[{"label":"View missions","message":"Show me city missions"},{"label":"GUBER Studio","message":"What is GUBER Studio?"}]'::jsonb,
        'system'),
      ('general','What are Cash Drops',
        '["what are cash drops","cash drop","how do cash drops work","how to get cash drops","guber cash drops","cash drop event"]'::jsonb,
        '["cash drop","community event","free money","cash event"]'::jsonb,
        'Cash Drops are community events where GUBER drops real money to verified users in specific locations at specific times. They''re NOT jobs — you just need to show up verified and claim your share. Check the home screen for active Cash Drop events near you.',
        '[{"label":"See Cash Drops","message":"Show me active Cash Drops near me"}]'::jsonb,
        'system'),
      ('vi','What is Verify and Inspect',
        '["what is verify and inspect","what is v&i","verify and inspect","vehicle inspection","how does v&i work","verify a vehicle","inspect a vehicle","vi service"]'::jsonb,
        '["verify","inspect","v&i","vehicle inspection","inspection service"]'::jsonb,
        'Verify & Inspect (V&I) is GUBER''s remote vehicle inspection service. A verified GUBER worker visits the vehicle on your behalf, takes structured photos and a live video walkthrough, and submits a full inspection report. Great for buying used vehicles remotely or confirming a vehicle''s condition before transport.',
        '[{"label":"Request V&I","message":"I want to request a vehicle inspection"},{"label":"Become a V&I inspector","message":"How do I become a Verify and Inspect worker?"}]'::jsonb,
        'system'),
      ('vi','How to upload proof photos',
        '["how do i upload proof","photo proof","submit proof","proof of completion","upload photos","take photos for job","proof submission"]'::jsonb,
        '["proof","upload","photo","completion","submit proof","evidence"]'::jsonb,
        'When your job is in progress, open the job detail screen and tap "Submit Proof." Take or upload photos showing the completed work. Your proof is sent to the hirer for review. They can approve it (releasing your payment) or request a retake if something is unclear.',
        '[{"label":"How do I get paid after proof?","message":"What happens after I submit proof?"}]'::jsonb,
        'system'),
      ('load_board','What is the Load Board',
        '["what is the load board","load board","how does the load board work","transport loads","freight","hauling","shipping loads","carrier loads"]'::jsonb,
        '["load board","transport","freight","haul","carrier","shipper","cargo"]'::jsonb,
        'The GUBER Load Board connects shippers who need cargo moved with carriers (truck drivers, haulers) who can move it. Shippers post loads with origin, destination, weight, and price. Carriers browse and bid on loads. Great for DOT-licensed carriers looking for local or regional loads.',
        '[{"label":"Post a load","message":"I need to post a load on the load board"},{"label":"Find loads to haul","message":"I want to find loads to haul as a carrier"}]'::jsonb,
        'system'),
      ('marketplace','How to sell a vehicle',
        '["how do i sell my car","sell my vehicle","sell my truck","list my car","vehicle listing","sell on marketplace","car for sale","list a vehicle"]'::jsonb,
        '["sell car","sell vehicle","vehicle listing","marketplace car","car sale","list truck"]'::jsonb,
        'Go to the Marketplace and tap "Sell a Vehicle." Enter the year, make, model, mileage, condition, your asking price, and photos. Your listing goes live immediately to verified GUBER buyers. You can receive offers, accept/counter, and coordinate a meeting through the app.',
        '[{"label":"Start a listing","message":"I want to list my vehicle for sale"},{"label":"How do offers work?","message":"How do marketplace offers work?"}]'::jsonb,
        'system'),
      ('marketplace','How marketplace offers work',
        '["how do offers work","how do i make an offer","marketplace offer","buyer offer","make an offer on a car","accept an offer"]'::jsonb,
        '["offer","bid","marketplace offer","accept offer","counter offer","make offer"]'::jsonb,
        'On any marketplace listing, tap "Make an Offer" and enter your price. The seller gets notified and can accept, counter, or decline. If accepted, both parties coordinate a meeting time through the GUBER messaging system. Payment is handled through GUBER''s secure escrow.',
        '[{"label":"Browse marketplace","message":"Show me the marketplace"}]'::jsonb,
        'system'),
      ('safety','Is GUBER safe',
        '["is guber safe","how is guber safe","safety","how does guber verify users","is it safe to hire on guber","worker safety","id verification safety"]'::jsonb,
        '["safe","safety","verify","trust","id verification","background","secure"]'::jsonb,
        'GUBER requires mandatory ID verification for all hirers and workers before they can transact. All jobs go through a structured flow with proof-of-completion, GPS check-ins, and dispute protection. Payments are held in escrow until both parties confirm completion.',
        '[{"label":"How does ID verification work?","message":"How does ID verification work on GUBER?"},{"label":"What if there is a dispute?","message":"What happens if there is a dispute?"}]'::jsonb,
        'system'),
      ('safety','ID verification process',
        '["how does id verification work","verify my id","id check","identity verification","verify my identity","how do i verify","id required"]'::jsonb,
        '["id verification","verify","identity","id check","document","verify id"]'::jsonb,
        'Go to your Profile and tap "Verify Identity." You''ll need to upload a photo of a government-issued ID (driver''s license, passport, or state ID) and take a selfie for face matching. Verification usually completes within minutes. You must be 18+ (or have a parent account if 13–17).',
        '[{"label":"Go verify my ID","message":"Take me to verify my ID"}]'::jsonb,
        'system'),
      ('safety','How disputes work',
        '["what if there is a dispute","dispute","how do disputes work","dispute a job","file a dispute","job dispute","problem with job","bad worker","hirer problem"]'::jsonb,
        '["dispute","problem","issue","conflict","bad worker","bad hirer","complaint"]'::jsonb,
        'If there''s a problem with a job, either party can open a dispute from the job detail screen. GUBER''s team reviews submitted proof, GPS data, and messages. Funds stay in escrow during the review. Most disputes are resolved within 48 hours based on the evidence.',
        '[{"label":"How does proof work?","message":"How does photo proof work on GUBER?"}]'::jsonb,
        'system'),
      ('gps','Why does GUBER need my location',
        '["why does guber need my location","location access","gps permission","why gps","location privacy","do you track me","is my location shared","location data"]'::jsonb,
        '["gps","location","privacy","tracking","location access","share location"]'::jsonb,
        'GUBER uses your location for three things: 1) showing nearby jobs and workers, 2) verifying GPS check-ins for job status (on my way, arrived), and 3) preventing fraud by confirming workers are physically at job sites. All GPS coordinates are fuzzed on public maps — your exact address is never shown to others.',
        '[{"label":"GPS privacy","message":"How is my GPS data kept private?"}]'::jsonb,
        'system'),
      ('general','GUBER Studio what is it',
        '["what is guber studio","studio","ai content","ai videos","guber ai","studio credits","generate video","create content with guber"]'::jsonb,
        '["studio","ai content","generate","video","music","avatar","ai tool"]'::jsonb,
        'GUBER Studio is our AI content creation suite. Use it to generate AI videos (text-to-video, motion control), AI music, and motion effects using your Studio credits. Tools include Kling Motion, WAN Motion, and MiniMax Music. Access it from the Studio tab.',
        '[{"label":"Go to Studio","message":"Take me to GUBER Studio"},{"label":"Get more credits","message":"How do I get more Studio credits?"}]'::jsonb,
        'system'),
      ('jobs','Job status updates explained',
        '["on my way","arrived","mark complete","job status","what does job status mean","in progress","job complete","mark arrived","status update"]'::jsonb,
        '["on my way","arrived","in progress","mark complete","job status","status update"]'::jsonb,
        'Job statuses: Open → a hirer posted, no worker yet. In Progress → worker accepted and is working. On My Way → worker has checked in that they''re heading to the job. Arrived → worker confirmed they''re on site. Complete → work done, proof submitted, awaiting hirer approval. You update status from the job detail screen.',
        '[{"label":"How does proof work?","message":"How do I submit proof of completion?"}]'::jsonb,
        'system')
    ) AS v(category, title, question_patterns, keywords, answer, follow_up_actions, created_by)
    WHERE NOT EXISTS (SELECT 1 FROM jac_knowledge WHERE created_by = 'system' LIMIT 1);
  `).catch(e => console.error("[migration] jac_knowledge seed error:", e));

  // Seed initial intents
  await pool.query(`
    INSERT INTO jac_intents (intent_name, display_name, sample_phrases, required_fields, target_flow, target_route, fallback_response)
    SELECT * FROM (VALUES
      ('post_job','Post a Job',
        '["post a job","hire someone","need help","I need someone to","create a job"]'::jsonb,
        '["service_type","zip"]'::jsonb,
        'post_job','/post-job?from=jac',
        'I can help you post a job. What service do you need, and what area are you in?'),
      ('find_work','Find Work',
        '["find work","looking for work","I want to work","earn money","get hired","find a job","available jobs"]'::jsonb,
        '[]'::jsonb,
        'find_work','/jobs',
        'Great — let''s get you set up to earn on GUBER. Have you created your account yet?'),
      ('sell_vehicle','Sell a Vehicle',
        '["sell my car","list my truck","sell my vehicle","car for sale","sell a vehicle"]'::jsonb,
        '["make","model","year"]'::jsonb,
        'marketplace','/marketplace',
        'I can help you list your vehicle. What''s the year, make, and model?'),
      ('request_vi','Request Verify and Inspect',
        '["verify a vehicle","inspect a car","v&i","verify and inspect","vehicle inspection","inspect before I buy"]'::jsonb,
        '["vehicle_location","vin_or_description"]'::jsonb,
        'verify_inspect','/verify-inspect',
        'Verify & Inspect is perfect for buying a vehicle remotely. Where is the vehicle located?'),
      ('post_load','Post a Load',
        '["post a load","need freight moved","ship a load","load board post","need a carrier","transport cargo"]'::jsonb,
        '["pickup","delivery","weight"]'::jsonb,
        'load_board','/load-board',
        'I can help you post a load. What''s the pickup location, destination, and approximate weight?'),
      ('find_loads','Find Loads to Haul',
        '["find loads","haul loads","carrier loads","truck loads","available loads","I drive a truck","I have a trailer"]'::jsonb,
        '[]'::jsonb,
        'load_board','/load-board',
        'Let''s find loads that match your equipment. What type of trailer do you run?'),
      ('check_payment','Check Payment Status',
        '["where is my money","when do I get paid","payment status","check my payment","wallet balance","how much have I earned"]'::jsonb,
        '[]'::jsonb,
        'payments','/profile',
        'Your wallet balance and payment history are in your Profile. Want me to take you there?'),
      ('explain_og','Explain Day-1 OG',
        '["what is og","day 1 og","day-1 og","founding membership","og benefits","og member"]'::jsonb,
        '[]'::jsonb,
        'og','/profile',
        'Day-1 OG is GUBER''s founding membership — monthly Studio credits, an OG badge, and growing perks. Want to join?'),
      ('gps_help','GPS Help',
        '["gps not working","location not working","can''t share location","location permission","gps issues","location access denied"]'::jsonb,
        '[]'::jsonb,
        'help',NULL,
        'GPS is used to verify job check-ins and show nearby opportunities. On iOS: Settings → Privacy → Location → GUBER → While Using. On Android: Settings → Apps → GUBER → Permissions → Location.'),
      ('check_job_status','Check Job Status',
        '["what is my job status","where is my job","job update","job progress","active jobs","job status","what''s happening with my job"]'::jsonb,
        '[]'::jsonb,
        'jobs','/jobs',
        'Your active jobs and their current status are on the Jobs screen. Want me to take you there?')
    ) AS v(intent_name, display_name, sample_phrases, required_fields, target_flow, target_route, fallback_response)
    WHERE NOT EXISTS (SELECT 1 FROM jac_intents LIMIT 1);
  `).catch(e => console.error("[migration] jac_intents seed error:", e));

  // Upsert destination_determination intent (D.D. mode — goal-based financial plan)
  await pool.query(`
    INSERT INTO jac_intents (intent_name, display_name, sample_phrases, required_fields, target_flow, target_route, fallback_response)
    VALUES (
      'destination_determination',
      'Destination Determination',
      '["I need $","help me earn","make money by","earn by","I want to make","earning goal","how do I make $","I need to make","D.D. mode","destination determination"]'::jsonb,
      '["goal_amount"]'::jsonb,
      'destination_determination',
      NULL,
      'Tell me your earning goal and deadline — e.g. "I need $300 by Friday" — and I''ll build a ranked action plan across all GUBER income streams.'
    )
    ON CONFLICT (intent_name) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      sample_phrases = EXCLUDED.sample_phrases,
      target_flow = EXCLUDED.target_flow,
      fallback_response = EXCLUDED.fallback_response;
  `).catch(e => console.error("[migration] jac_intents seed error:", e));

  // Seed Phase 1 map mission templates — deactivate old placeholders first
  await pool.query(`
    UPDATE growth_task_templates SET is_active = false, paused = true
    WHERE title IN (
      'Best Place To Eat','Trusted Local Business','Cheapest Fuel Report',
      'Hiring Alert','Share GUBER','Invite A User'
    );
    INSERT INTO growth_task_templates (emoji, title, description, reward_credits, reward_score, og_bonus_pct, category, sort_order) VALUES
      ('🗺️', 'Submit Local Recommendation',   'Share a trusted local business, restaurant, or service you would recommend to neighbors in your area.',  25,  25, 100, 'map_mission', 1),
      ('⛽', 'Fuel Price Report',              'Report today''s cheapest gas price you have spotted nearby. Include the station name and price.',           50,  50, 100, 'map_mission', 2),
      ('🏪', 'Verify Business Hours',          'Confirm a local business''s hours are correct. Take a photo of their door sign or hours display.',         75,  75, 100, 'map_mission', 3),
      ('📍', 'Add Useful Local Info',          'Share helpful information about a local spot — parking notes, access tips, or anything the community needs to know.', 100, 100, 100, 'map_mission', 4),
      ('📅', 'Submit Local Event',             'Know of a local event, market, job fair, or community opportunity? Share it so neighbors can take advantage.', 100, 100, 100, 'map_mission', 5),
      ('❌', 'Report Wrong or Closed Business','Found a business listed incorrectly or permanently closed? Help keep the map accurate.',                    100, 100, 100, 'map_mission', 6),
      ('📷', 'Add Storefront Photo',           'Take a clear photo of a local business storefront. Helps the community recognize and find it.',             100, 100, 100, 'map_mission', 7),
      ('⭐', 'High-Value Verified Local Intel','Submit exceptionally useful, verified local information. Admin-reviewed. Up to 500 credits for top-tier intel.', 500, 500, 100, 'map_mission', 8)
    ON CONFLICT DO NOTHING;
    -- Fix OG bonus for any templates already in DB with old 25% value
    UPDATE growth_task_templates SET og_bonus_pct = 100
    WHERE og_bonus_pct = 25 AND category IN ('map_mission','profile_mission');
  `).catch(e => console.error("[seed] Phase 1 map mission templates error:", e));

  await pool.query(`
    INSERT INTO growth_task_templates (emoji, title, description, reward_credits, reward_score, og_bonus_pct, category, sort_order)
    VALUES ('📡', 'Set Your Availability + Skills', 'Mark yourself available and describe what tasks or services you can do so hirers know you are on standby. Skilled trade workers must have valid credentials on file.', 200, 200, 100, 'profile_mission', 1)
    ON CONFLICT DO NOTHING;
  `).catch(e => console.error("[seed] profile_mission template error:", e));

  // Seed global fallback setting — show missions even when real jobs exist so the map is always useful
  await pool.query(`
    INSERT INTO zip_fallback_settings (scope, scope_value, enabled, show_when_real_jobs_exist, max_tasks_shown)
    VALUES ('global', '', true, true, 6)
    ON CONFLICT (scope, scope_value) DO UPDATE
      SET show_when_real_jobs_exist = true,
          enabled = true;
  `).catch(e => console.error("[seed] zip fallback global setting error:", e));

  // Seed/update reward config — ON CONFLICT DO UPDATE so ratio changes apply to existing DBs
  await pool.query(`
    INSERT INTO growth_reward_config (key, value_int, label, description) VALUES
      ('referral_signup_credits',               250,   'Referral: Signup Credits (pending)',    'Credits awarded (pending) to referrer when referred user creates account'),
      ('referral_signup_score',                  25,   'Referral: Signup Score',                'Score awarded to referrer when referred user creates account'),
      ('referral_verified_credits',             500,   'Referral: ID Verified Credits',         'Credits approved to referrer when referred user verifies ID'),
      ('referral_verified_score',               100,   'Referral: ID Verified Score',           'Score awarded to referrer when referred user verifies ID'),
      ('referral_stripe_connected_credits',     500,   'Referral: Stripe Connected Credits',    'Credits awarded when referred user connects Stripe payout'),
      ('referral_stripe_connected_score',       250,   'Referral: Stripe Connected Score',      'Score awarded when referred user connects Stripe payout'),
      ('referral_first_paid_job_credits',      1500,   'Referral: First Paid Job Credits',      'Credits awarded to referrer when referred user completes first paid job'),
      ('referral_first_paid_job_score',        1000,   'Referral: First Paid Job Score',        'Score awarded to referrer when referred user completes first paid job'),
      ('referral_og_purchase_referrer_credits', 2500,  'Referral: OG Purchase (Referrer) Credits', 'Credits to referrer when referred user buys Day-1 OG'),
      ('referral_og_purchase_referrer_score',   500,   'Referral: OG Purchase (Referrer) Score',   'Score to referrer when referred user buys Day-1 OG'),
      ('referral_og_purchase_referred_credits', 1000,  'Referral: OG Purchase (Referred) Credits', 'Credits to referred user for purchasing Day-1 OG via referral'),
      ('referral_og_purchase_referred_score',   250,   'Referral: OG Purchase (Referred) Score',   'Score to referred user for purchasing Day-1 OG via referral'),
      ('cashout_minimum_credits',              50000,  'Cashout Minimum Credits',               'Minimum approved credits required to request a cashout (1000 cr = $1, min = $50)'),
      ('credits_per_dollar',                    1000,  'Credits Per Dollar',                    'Number of growth credits equal to $1 USD'),
      ('og_bonus_pct',                           100,  'Day-1 OG Bonus %',                      'Extra % credits/score earned by Day-1 OG members on growth tasks (100% = double)'),
      ('cashout_enabled',                          0,  'Cashout Enabled',                       'Global toggle: 1 = cashout requests allowed, 0 = disabled')
    ON CONFLICT (key) DO UPDATE
      SET value_int = EXCLUDED.value_int,
          label     = EXCLUDED.label,
          description = EXCLUDED.description,
          updated_at  = NOW()
    WHERE growth_reward_config.key IN (
      'credits_per_dollar','cashout_minimum_credits','og_bonus_pct',
      'referral_signup_credits','referral_verified_credits',
      'referral_stripe_connected_credits','referral_first_paid_job_credits',
      'referral_og_purchase_referrer_credits','referral_og_purchase_referred_credits',
      'cashout_enabled'
    );
  `).catch(e => console.error("[seed] growth reward config error:", e));

  await registerRoutes(httpServer, app);
  await startOSRuntime(app);
  startStudioToolsListener();
  startCron();
  await seedReferralExpiry().catch(e => console.error("[seed] Referral expiry column error:", e));
  await seedCatalog().catch(e => console.error("[seed] catalog seed error:", e));
  // Task #317: must run before syncAdminCredentials/seedDemoAccounts (which SELECT new columns)
  await seedDisputeProtectionColumns().catch(e => console.error("[seed] Dispute protection columns error:", e));
  // Task #318: liability disclaimer & helper-safety columns — run before seedDemoAccounts
  await seedLiabilityColumns().catch(e => console.error("[seed] Liability columns error:", e));
  seedJobChecklists().catch(e => console.error("[seed] job checklist seed error:", e));
  syncAdminCredentials().catch(e => console.error("[seed] admin sync error:", e));
  syncOGPreapprovedEmails().catch(e => console.error("[seed] OG sync error:", e));
  migrateGuberIds().catch(e => console.error("[seed] GUBER ID migration error:", e));
  seedPAVCategory().catch(e => console.error("[seed] PAV category seed error:", e));
  seedPropertySituationsV2().catch(e => console.error("[seed] Property situations V2 seed error:", e));
  seedReferralCodes().catch(e => console.error("[seed] Referral codes seed error:", e));
  seedServicePricingConfigs().catch(e => console.error("[seed] Service pricing configs seed error:", e));
  seedBoostColumns().catch(e => console.error("[seed] Boost columns error:", e));
  seedUploadQuotaColumns().catch(e => console.error("[seed] Upload quota columns error:", e));
  seedDroneServices().catch(e => console.error("[seed] Drone services seed error:", e));
  seedDroneCategory().catch(e => console.error("[seed] Drone category seed error:", e));
  seedAutomotiveVIUseCases().catch(e => console.error("[seed] Automotive V&I use cases seed error:", e));
  seedBarterChecklists().catch(e => console.error("[seed] Barter checklists seed error:", e));
  reseedOnlineItemsSituations().catch(e => console.error("[seed] Online Items reseed error:", e));
  seedPlatformSettings().catch(e => console.error("[seed] Platform settings seed error:", e));

  pool.query(`
    INSERT INTO studio_model_pricing (tool_key, label, description, provider_endpoint, credits_cost, active) VALUES
      ('listing_video', 'Listing Video',
       'Property or product listing walkthrough video (35 cr).',
       'composite:listing_video', 35, true),
      ('promo_clip', 'Promo Clip',
       'Short promotional video clip for any business type (35 cr).',
       'composite:promo_clip', 35, true),
      ('ai_director', 'AI Director',
       'Automated commercial director — script → clips → assembled ad (200–2240 cr based on duration).',
       'composite:ai_director', 200, true)
    ON CONFLICT (tool_key) DO NOTHING
  `).catch(e => console.error("[seed] Studio model pricing seed error:", e));

  seedDemoAccounts().then(() => invalidateDemoIdCache()).catch(e => console.error("[seed] Demo accounts seed error:", e));
  seedMarketplaceSamples().catch(e => console.error("[seed] Marketplace samples seed error:", e));
  pool.query("UPDATE jobs SET status = 'posted_public' WHERE status = 'open'").then((r: any) => {
    if (r.rowCount > 0) console.log(`[GUBER] Migrated ${r.rowCount} jobs from 'open' → 'posted_public'.`);
  }).catch(e => console.error("[seed] Job status migration error:", e));

  pool.query(`
    DELETE FROM notifications
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@guberapp.internal')
      AND type = 'boost_suggestion'
  `).then((r: any) => {
    if (r.rowCount > 0) console.log(`[GUBER] Cleaned up ${r.rowCount} demo boost_suggestion notifications.`);
  }).catch(e => console.error("[seed] Demo notification cleanup error:", e));

  pool.query(`
    UPDATE jobs SET boost_suggested = false, suggested_budget = NULL
    WHERE posted_by_id IN (SELECT id FROM users WHERE email LIKE '%@guberapp.internal')
      AND boost_suggested = true
  `).then((r: any) => {
    if (r.rowCount > 0) console.log(`[GUBER] Reset boostSuggested on ${r.rowCount} demo jobs.`);
  }).catch(e => console.error("[seed] Demo boost reset error:", e));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // ── PUBLIC SEO ROUTES (SSR job pages + sitemap) ──
  // These must be registered BEFORE the Vite/static catch-all so they intercept first.

  const { setupPublicSeoRoutes } = await import("./seo-routes");
  setupPublicSeoRoutes(app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} in use, retrying in 1s...`);
      setTimeout(() => {
        httpServer.close();
        httpServer.listen({ port, host: "0.0.0.0" }, () => {
          log(`serving on port ${port}`);
        });
      }, 1000);
    } else {
      throw err;
    }
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  if (process.env.NODE_ENV === "production" && !process.env.APP_BASE_URL) {
    console.warn("[GUBER] WARNING: APP_BASE_URL is not set. Google OAuth callback URI will be inferred from request host, which may not match your registered redirect URI. Set APP_BASE_URL=https://yourdomain.com in environment secrets.");
  } else if (process.env.APP_BASE_URL) {
    log(`Google OAuth base URL: ${process.env.APP_BASE_URL}`);
  }

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
