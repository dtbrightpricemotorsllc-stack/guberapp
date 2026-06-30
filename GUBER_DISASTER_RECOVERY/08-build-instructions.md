# GUBER Build Instructions

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| npm | 10+ | Package manager |
| PostgreSQL | 14+ | Database (local dev) |
| FFmpeg | 6+ | Video processing scripts (optional) |

---

## Local Development Setup

### 1. Clone and install

```bash
git clone <repo-url> guber
cd guber
npm install
```

### 2. Set up environment

```bash
# Create a .env file (local only, gitignored)
cp GUBER_DISASTER_RECOVERY/03-environment-variables.env.example .env
# Edit .env and fill in required values
```

Minimum required for local dev:
```env
DATABASE_URL=postgresql://localhost:5432/guber_dev
SESSION_SECRET=any-dev-secret-at-least-32-chars
NODE_ENV=development
```

### 3. Provision the database

```bash
# The server auto-creates all tables on first boot.
# Just start the server:
npm run dev
```

On first boot, `server/index.ts` runs all `CREATE TABLE IF NOT EXISTS` statements.
No `npm run db:push` is needed or recommended in production.

For local schema exploration only:
```bash
npm run db:push    # pushes schema to local dev DB (never run in prod)
npm run db:studio  # opens Drizzle Studio GUI at localhost:4983
```

### 4. Start the development server

```bash
npm run dev
# → Express on port 5000
# → Vite HMR on same port (proxied)
# → App at http://localhost:5000
```

---

## Project Scripts

```bash
npm run dev         # Start Express + Vite dev server (port 5000)
npm run build       # Build frontend to dist/public/
npm start           # Run production server (serves dist/public/)
npm run check       # TypeScript type checking (tsc --noEmit)
npm run db:push     # Push schema to DB (dev only)
npm run db:studio   # Drizzle Studio GUI (dev only)
```

### Testing
```bash
npx vitest run --config vitest.config.ts          # Run all unit tests
npx vitest run --config vitest.config.ts --reporter verbose  # Verbose
npx playwright test                                # E2E tests (needs dev server running)
npx playwright test --ui                           # Playwright UI mode
```

### Audits
```bash
node scripts/audit-statebleed.mjs                 # State-bleed audit
node scripts/automated-watchdog.mjs               # Mission Control health check
```

---

## Production Build

### Web build
```bash
NODE_ENV=production npm run build
```

Output: `dist/public/` — static files served by Express.

Build features in production mode:
- Console logs stripped (`esbuild: { drop: ['console', 'debugger'] }`)
- Tree shaking + minification
- Code splitting

### TypeScript check before building
```bash
npm run check
# Must be clean (0 errors) before deploying
```

---

## Key Build Configuration Files

### `vite.config.ts`
- Root: `client/`
- Output: `dist/public`
- Aliases: `@/` → `client/src/`, `@assets/` → `attached_assets/`, `@shared/` → `shared/`
- Port: 5000 (same as Express — Vite proxies to Express in dev)
- **Do not modify** without understanding the Express/Vite co-hosting setup

### `tsconfig.json`
- Target: ESNext
- Module: ESNext
- Path aliases match Vite aliases
- Strict mode enabled

### `drizzle.config.ts`
- Schema: `./shared/schema.ts`
- Output: `./migrations/`
- Dialect: postgresql
- **Do not modify** the `out` or `schema` paths

---

## Adding a New Feature

### New database table
1. Add the Drizzle table definition to `shared/schema.ts`
2. Add insert schema (`createInsertSchema`) and types
3. Add `CREATE TABLE IF NOT EXISTS` block in `server/index.ts` (startup provisioning)
4. Add CRUD methods to `server/storage.ts` (IStorage interface + DatabaseStorage class)
5. Add API routes to `server/routes.ts`
6. Add frontend page/component in `client/src/pages/` or `client/src/components/`
7. Register route in `client/src/App.tsx` if it's a new page

### New feature flag
1. Add key to `FeatureFlagKey` union type in `shared/feature-flags.ts`
2. Add entry to `FEATURE_FLAGS` array with default scope
3. Wrap feature code: server-side with `isFeatureEnabledFor()`, client-side with `useFeatureFlag()`
4. Toggle in `/admin/qa` → Feature Flags console

---

## Dependency Management

```bash
# Add a package
npm install <package-name>

# IMPORTANT: After any npm install, commit the updated package-lock.json.
# GitHub Actions uses `npm ci` which reads package-lock.json strictly.
# A stale lock file will break iOS builds.
```

**Do NOT edit `package.json` scripts directly.** Ask first if you need to change build scripts.

---

## Environment-Specific Behavior

| Behavior | Development | Production |
|----------|-------------|------------|
| Rate limiting | Disabled | Enabled (200 req/15min) |
| Login rate limit | Disabled | 5 failed/min |
| HTTPS cookies | No | Yes (secure flag) |
| Console logs | Present | Stripped by Vite |
| OAuth nonce store | In-memory (fallback) | PostgreSQL (required) |
| Background cron | Runs in-process | `DISABLE_BACKGROUND_JOBS=true` |
| Vite HMR | Yes | No (serves dist/public) |
| Studio Fal.ai | Requires FAL_KEY | Requires FAL_KEY |
