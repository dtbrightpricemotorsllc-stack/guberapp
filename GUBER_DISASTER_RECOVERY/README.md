# GUBER Disaster Recovery Runbook

**Version:** June 2026  
**App:** GUBER — Trust-Enforced Local Visibility Network  
**Production URL:** https://guberapp.app  
**Bundle ID:** com.guber.app  
**Stack:** React + TypeScript + Vite · Express.js · PostgreSQL + Drizzle ORM · Stripe Connect · Capacitor 7 (iOS + Android)

---

## Contents

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [database-schema.md](./01-database-schema.md) | Every table, column, and index; Drizzle schema reference |
| 02 | [sql-migrations.sql](./02-sql-migrations.sql) | Raw SQL to recreate the full schema from scratch |
| 03 | [environment-variables.env.example](./03-environment-variables.env.example) | All env vars with descriptions |
| 04 | [api-documentation.md](./04-api-documentation.md) | All API endpoints, auth, rate limits |
| 05 | [firebase-configuration.md](./05-firebase-configuration.md) | Firebase / FCM / APNs setup |
| 06 | [stripe-integration.md](./06-stripe-integration.md) | Stripe Connect setup, webhooks, price IDs |
| 07 | [deployment-instructions.md](./07-deployment-instructions.md) | Replit Autoscale + production config |
| 08 | [build-instructions.md](./08-build-instructions.md) | Local dev + production web build |
| 09 | [native-app-build.md](./09-native-app-build.md) | iOS (Codemagic) + Android builds |
| 10 | [architecture-map.md](./10-architecture-map.md) | Full system architecture diagram |

---

## 15-Minute Recovery Checklist

If GUBER goes completely dark and needs to be rebuilt from scratch:

1. **Provision PostgreSQL** — any provider (Neon, Supabase, Railway, or Replit DB). Copy the `DATABASE_URL`.
2. **Clone repo** — `git clone <this-repo>` then `npm install`.
3. **Set env vars** — Copy `03-environment-variables.env.example` → `.env`, fill every required value.
4. **Boot server** — `npm run dev`. The server provisions all tables on first boot via `server/index.ts` (no `db:push` needed in production).
5. **Verify health** — `GET /api/health` → 200.
6. **Restore Stripe** — Re-register webhooks for both the main account and Connect account (see doc 06).
7. **Push native builds** — Trigger Codemagic (see doc 09).
8. **Smoke test** — Sign up, post a job, verify Stripe checkout flow works.

---

## Critical Secrets That Must Never Be Lost

| Secret | Where to find it |
|--------|-----------------|
| `SESSION_SECRET` | Any random 64-byte hex string. Generate: `openssl rand -hex 64` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_CONNECT_SECRET_KEY` | Same Stripe account, Connect settings |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → signing secret |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Dashboard → Connect webhooks → signing secret |
| `APNS_PRIVATE_KEY` | Apple Developer Portal → Keys → APNs key (.p8 file) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service accounts |
| `CLOUDINARY_*` | Cloudinary Dashboard → Settings → API Keys |
| `RELEASE_CODE_SECRET` | Random 64-byte hex. Must match what's in production DB |
| Android keystore (`.jks`) | Codemagic → Code Signing → Android Keystores |

---

## Key Architecture Decisions

- **No db:push in production** — all schema changes go in `server/index.ts` as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS`. The server auto-migrates on boot.
- **Append-only custody_events** — enforced at the Postgres rule level (UPDATE/DELETE rewritten to NOTHING). Never bypass.
- **Stripe platform key vs Connect key** — two separate Stripe keys. Main key for direct charges (Studio credits, Trust Box, etc). Connect key for job payments and worker payouts.
- **iOS digital purchases** — use `ExternalPurchaseSheet` → Stripe (NOT Apple IAP). Valid under updated U.S. App Store rules.
- **Background jobs in production** — set `DISABLE_BACKGROUND_JOBS=true` and use a scheduled cron curl. No in-process timers.
- **GPS fuzzing** — all map displays show fuzzed coordinates. Raw GPS stored server-side only.
- **Soft delete only** — account deletion anonymizes data, never hard-deletes.
