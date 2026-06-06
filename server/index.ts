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
