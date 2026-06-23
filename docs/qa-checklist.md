# GUBER QA Checklist

Permanent regression checklist. Run before every release. All items must pass.

---

## 1. Automated Test Suite (39 files)

```bash
npx vitest run $(ls server/tests/*.test.ts | head -20 | tr '\n' ' ')
npx vitest run $(ls server/tests/*.test.ts | tail -19 | head -10 | tr '\n' ' ')
npx vitest run $(ls server/tests/*.test.ts | tail -9 | tr '\n' ' ')
```

All 39 files must show `Test Files N passed`. No failures allowed.

**Protected suites** (high-risk, must run individually if the full suite crashes):

| Suite | Key invariant |
|---|---|
| `studio-pricing.test.ts` | 6 packs, 3 tiers, `STUDIO_TOOL_CREDIT_COSTS` matches DB including `ai_director: 200` |
| `asset-custody-routes.test.ts` | Witness payout idempotency: first report → "sent", duplicate → 409, no Stripe account → skips |
| `payout-multifactor.test.ts` | GPS + completion + photo all required; GPS alone never pays |
| `witness-entitlement.test.ts` | Only assets with `witnessAddon: true` or `packageTier: elite/elite_max` can pay out |
| `asset-release-handoff.test.ts` | Release codes HMAC-hashed, timing-safe, driver-bound |
| `stripe-webhook-connect.test.ts` | Fulfillment is atomic (FOR UPDATE), no double-pay on retry |
| `mobile-checkout.test.ts` | HMAC token signed, 15-min expiry, single-use |

---

## 2. State-Bleed Audit

```bash
node scripts/audit-statebleed.mjs
```

Must exit 0. Any violation means a mode-selector form resets are missing.

---

## 3. Server Boot Checks

Start `npm run dev` and verify console shows no `[seed]` errors. Critical seeds:

- `[seed] Studio model pricing seed error` — means `studio_model_pricing` INSERT failed
- `[seed] Platform settings seed error` — means `platform_settings` table issue
- `[seed] Service pricing configs seed error` — means service pricing table issue

---

## 4. Feature Flag–Gated Routes

Verify these feature flags are `enabled: true` in the DB before testing the guarded surfaces:

| Flag | Guards |
|---|---|
| `verified_release_system` | `/api/assets/*`, `/api/witness/*`, `/api/asset-protection/*` |
| `studio_v2` | `/studio/*`, `/api/studio/*` |
| `cash_drops` | `/api/cash-drops/*` |
| `barter` | `/api/barter/*` |
| `direct_offers` | `/api/direct-offers/*` |
| `observation_marketplace` | `/api/marketplace/*` |
| `guber_business` | `/biz/*`, `/api/business/*` |

---

## 5. UI Smoke Tests (Manual / Playwright)

### Auth
- [ ] `/auth` — sign up with new email succeeds
- [ ] `/auth` — log in with existing credentials succeeds
- [ ] Forgot password flow sends reset link (check server log for link)

### Job Posting
- [ ] `/post-job` — all dropdowns populate, job submits
- [ ] Job appears on `/jobs` / `/browse` after posting

### Wallet
- [ ] `/wallet` renders without blank screen (Zap icon present)
- [ ] Credit balance visible

### Browse Jobs
- [ ] "Turn on Alerts" button shows loading state, then success or toast on denial

### Studio
- [ ] `/studio` loads credit balance
- [ ] `/studio/text-to-video`, `/studio/music`, `/studio/mirror-motion`, `/studio/commercial` all render
- [ ] On iOS store build, `/studio/avatar` shows "coming soon" placeholder (not real avatar)

### Missions / Map
- [ ] Mission pins appear on map when GPS is granted
- [ ] Mission pins appear using zip-center fallback when GPS is denied
- [ ] Pin SVG renders correctly (no garbled/double-encoded emoji)

### Payments (web)
- [ ] `/studio/credits` — pack purchase opens ExternalPurchaseSheet on iOS, direct Stripe on web
- [ ] `/profile` — Day-1 OG purchase surface renders

### Payments (iOS)
- [ ] Tapping any purchase on iOS shows Apple disclosure sheet before redirecting to Stripe
- [ ] No `com.apple.developer.storekit.external-purchase-link` entitlement in `App.entitlements`

---

## 6. Push Notifications

- [ ] `POST /api/push/subscribe` with valid VAPID subscription succeeds
- [ ] APNs token registration at `POST /api/push/apns-token` accepts `deviceToken`
- [ ] "Turn on Alerts" button on Browse Jobs grants permission and subscribes

---

## 7. Mobile / Capacitor

- [ ] `isStoreBuild` returns `true` only in App Store builds (checks `window.__GUBER_STORE_BUILD__`)
- [ ] `isIOS` returns correct value
- [ ] No `@capacitor-community/background-geolocation` in `package.json`

---

## 8. Production Health

```bash
node scripts/automated-watchdog.mjs
```

Output must be GREEN. If RED, check:
1. Statebleed audit failures
2. Protected test suite failures
3. Native manifest issues (see `MANIFEST_REQUIREMENTS` in the script)

---

## 9. Known Gotchas (Checklist on Every Deploy)

- [ ] `FAL_KEY` is set in production env — without it Studio returns 503
- [ ] `DISABLE_BACKGROUND_JOBS=true` is set on Autoscale deployment
- [ ] `CRON_SECRET` is set and cron curl is scheduled
- [ ] `studio_v2` feature flag is `global` scope (not `role`) — auto-migrated on boot
- [ ] `post-merge.sh` has been run or DB has `ai_director` row in `studio_model_pricing`
- [ ] `package-lock.json` is in sync with `package.json` after any dep change

---

## 10. Regression: Previously-Fixed Bugs

Keep this table updated when bugs are fixed so they can be spot-checked on future releases.

| Date | Component | Bug | Fix |
|---|---|---|---|
| 2026-06 | `wallet.tsx` | Blank screen on render | Added `Zap` to lucide-react import |
| 2026-06 | `browse-jobs.tsx` | "Turn on Alerts" button non-functional | Added pending state, toast on denial, `promptIfNeeded: true` |
| 2026-06 | Mission map pins | SVG double-encoding of emoji | Use raw emoji, XML-escape only |
| 2026-06 | Mission map pins | Pins invisible when GPS denied | Fall back to `userPos \|\| jumpCenter` |
| 2026-06 | `studio-pricing.test.ts` | `ai_director` row not in DB | Added startup seed INSERT to `server/index.ts`; added `ai_director` to test's `WHERE IN` clause |
| 2026-06 | `asset-custody-routes.test.ts` | Witness payout tests failing (entitlement gate) | Added `witnessAddon` param to `createProtectedAsset`; `setupAcceptedAssignment` passes `witnessAddon: true` |
