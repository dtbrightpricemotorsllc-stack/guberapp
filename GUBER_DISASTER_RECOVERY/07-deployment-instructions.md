# GUBER Deployment Instructions

## Platform: Replit Autoscale

GUBER is deployed on Replit's Autoscale tier. The same Express server serves
both the API and the pre-built Vite frontend.

---

## Production Environment Variables

Set all variables from `03-environment-variables.env.example` in:
**Replit → Secrets panel** (not in `.env` files, which are gitignored).

### Critical production-only values
```
NODE_ENV=production
DISABLE_BACKGROUND_JOBS=true
SESSION_SECRET=<64-byte hex>
CRON_SECRET=<32-byte hex>
APP_BASE_URL=https://guberapp.app
```

---

## Deploy Steps

### First-time deployment

1. **Import the repository** into Replit (or use existing Repl).

2. **Attach a PostgreSQL database** via Replit Database panel.  
   `DATABASE_URL` is auto-set in the environment.

3. **Set all secrets** in the Replit Secrets panel.  
   Copy from `03-environment-variables.env.example` and fill values.

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Build the frontend:**
   ```bash
   npm run build
   ```
   Output goes to `dist/public/`. Express serves it in production.

6. **Start the server:**
   ```bash
   npm run dev
   ```
   On first boot, `server/index.ts` automatically runs all `CREATE TABLE IF NOT EXISTS`
   and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` provisioning. No manual migration step.

7. **Verify health:**
   ```bash
   curl https://guberapp.app/api/health
   # → 200 OK
   ```

### Subsequent deployments

Replit Autoscale redeploys automatically on push to main. The server re-runs
all provisioning statements on boot (all are idempotent).

---

## Production Cron Setup

Background jobs are disabled in process (`DISABLE_BACKGROUND_JOBS=true`).
Trigger them with a scheduled external call:

```bash
# Run all cron jobs (call from an external scheduler every 5-15 minutes)
curl -fsS -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://guberapp.app/api/internal/cron/run
```

Cron jobs include:
- Studio credit drip for Day-1 OG members (monthly)
- Expired session cleanup
- Ambassador payout processing
- Hands-free blocked attempts decay (60-day window)
- Background check eligibility sweep

---

## Mission Control Health Monitor

```bash
# Check status (GREEN=200, RED=503)
curl -H "x-cron-secret: $CRON_SECRET" \
  https://guberapp.app/api/internal/mission-control/status

# Run locally with watchdog script
node scripts/automated-watchdog.mjs
node scripts/automated-watchdog.mjs --json
node scripts/automated-watchdog.mjs --loop  # continuous
```

The watchdog checks:
- State-bleed audit (153 files)
- 7 protected test suites
- Native manifest requirements

---

## Stripe Webhook Registration

Register **two** separate webhooks in the Stripe Dashboard:

### Webhook 1 — Main Account
- **URL:** `https://guberapp.app/api/webhooks/stripe`
- **Events to listen for:**
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Webhook 2 — Stripe Connect
- **URL:** `https://guberapp.app/api/webhooks/stripe-connect`
- **Events to listen for (Connect account events):**
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `transfer.created`
  - `account.updated`
  - `payout.paid`
  - `payout.failed`
- **Signing secret** → `STRIPE_CONNECT_WEBHOOK_SECRET`

---

## Custom Domain Setup

1. In Replit: Deployments → Custom domain → add `guberapp.app`
2. DNS: Point `guberapp.app` CNAME to Replit's edge domain
3. SSL: Replit auto-provisions Let's Encrypt certificate
4. Update `APP_BASE_URL=https://guberapp.app` in secrets

---

## Alternative: Deploy to Railway / Render / Fly.io

```bash
# Build
npm run build

# Start command
npm start
# (which runs: NODE_ENV=production node dist/index.js)

# Required env vars: same as above. DATABASE_URL from provider's PostgreSQL addon.
# Port: set PORT to whatever the platform assigns (or leave blank for 5000).
```

The server is a standard Express app — it runs on any Node.js 20+ host.

---

## Database Backup

### Export production database
```bash
pg_dump $DATABASE_URL -F c -f guber_backup_$(date +%Y%m%d).dump
```

### Restore to new PostgreSQL instance
```bash
pg_restore -d $NEW_DATABASE_URL guber_backup_YYYYMMDD.dump
```

### Replit-specific
Replit PostgreSQL databases auto-backup daily. Use the Database panel to
download a backup or restore a previous snapshot.

---

## Rollback Procedure

1. **Replit checkpoint rollback** — Replit auto-creates checkpoints. Use the
   Replit interface to roll back to a previous checkpoint.

2. **Git-based rollback** — Push the previous commit hash to main:
   ```bash
   git push origin <commit-hash>:main --force
   ```
   Then redeploy.

3. **Database rollback** — Schema changes are additive only (ADD COLUMN IF NOT EXISTS).
   Columns cannot be rolled back without a manual ALTER TABLE DROP COLUMN.
   Coordinate with team before any column removal.

---

## SSL / Security Checklist

- [ ] `NODE_ENV=production` is set (enables HTTPS-only cookies, rate limits)
- [ ] `SESSION_SECRET` is a strong random value (not the dev default)
- [ ] All `STRIPE_*` keys are live keys (not test keys)
- [ ] Stripe webhooks are registered and signing secrets match
- [ ] `RELEASE_CODE_SECRET` is set and stored securely offline
- [ ] `CLOUDINARY_*` upload preset has size/type restrictions
- [ ] Google Maps API key has appropriate restrictions (HTTP-referer for Maps JS, IP for Geocoding)
- [ ] APNs `.p8` key is backed up in a secure vault
