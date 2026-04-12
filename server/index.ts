import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startCron } from "./cron";
import { seedCatalog, syncAdminCredentials, syncOGPreapprovedEmails, seedJobChecklists, migrateGuberIds, seedPAVCategory, seedPropertySituationsV2, seedReferralCodes, seedReferralExpiry, seedServicePricingConfigs, seedBoostColumns, seedDroneServices, seedBarterChecklists, reseedOnlineItemsSituations, seedPlatformSettings, seedUploadQuotaColumns } from "./seed";
import { seedDemoAccounts } from "./seed-demo";
import { invalidateDemoIdCache } from "./demo-guard";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

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
  skip: (req) => req.path.startsWith("/api/webhooks"),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later." },
});

app.use("/api", generalLimiter);
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);
app.use("/api/request-password-reset", authLimiter);

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
  `).catch(e => console.error("[sessions] table setup error:", e));

  await pool.query(`
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS ein text;
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS legal_business_name text;
  `).catch(e => console.error("[migration] business_profiles EIN columns error:", e));

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

  await registerRoutes(httpServer, app);
  startCron();
  await seedReferralExpiry().catch(e => console.error("[seed] Referral expiry column error:", e));
  await seedCatalog().catch(e => console.error("[seed] catalog seed error:", e));
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
  seedBarterChecklists().catch(e => console.error("[seed] Barter checklists seed error:", e));
  reseedOnlineItemsSituations().catch(e => console.error("[seed] Online Items reseed error:", e));
  seedPlatformSettings().catch(e => console.error("[seed] Platform settings seed error:", e));
  seedDemoAccounts().then(() => invalidateDemoIdCache()).catch(e => console.error("[seed] Demo accounts seed error:", e));
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
    httpServer.closeAllConnections?.();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
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
