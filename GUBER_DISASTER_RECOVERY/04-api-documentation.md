# GUBER API Documentation

**Base URL:** `https://guberapp.app`  
**Auth:** Session cookie (`express-session`). Login via `POST /api/auth/login`.  
**Content-Type:** `application/json` for all requests/responses.  
**Source:** `server/routes.ts` (~9000 lines)

---

## Authentication

All endpoints marked 🔒 require an active session (call `POST /api/auth/login` first).
Endpoints marked 🛡 require `role = 'admin'`.

### Rate Limits (production)
| Endpoint | Limit |
|----------|-------|
| All `/api/*` | 200 req / 15 min / IP |
| `POST /api/auth/login` | 5 failed attempts / 1 min / IP |
| `POST /api/auth/signup` | 5 / 1 hr / IP |
| `POST /api/auth/forgot-password` | 5 / 15 min / IP |

---

## Auth Endpoints

```
POST   /api/auth/signup              Create new account
POST   /api/auth/login               Login (returns session cookie)
POST   /api/auth/logout              Clear session
GET    /api/auth/me             🔒   Current user object
POST   /api/auth/forgot-password     Request password reset email
POST   /api/auth/reset-password      Complete password reset with token
POST   /api/auth/verify-email        Verify email with token
POST   /api/auth/resend-verification Resend verification email
POST   /api/auth/business-signup     Create business org account
POST   /api/auth/google/native  🔒   Google Sign-In (native iOS/Android)
POST   /api/auth/apple/native   🔒   Apple Sign-In (native iOS/Android)
GET    /api/auth/google              Google OAuth redirect (web)
GET    /api/auth/google/callback     Google OAuth callback (web)
```

---

## User Endpoints

```
GET    /api/users/:id           🔒   Get user profile
PATCH  /api/users/:id           🔒   Update own profile
DELETE /api/users/:id           🔒   Soft-delete own account (anonymizes data)
GET    /api/users/:id/reviews        Get user reviews
POST   /api/users/:id/reviews   🔒   Submit review for a user
GET    /api/users/lookup/:username   Look up user by public username
GET    /api/users/by-guber-id/:id    Look up user by GUBER ID
POST   /api/users/upload-photo  🔒   Upload profile photo (Cloudinary)
POST   /api/users/id-verification 🔒 Submit ID verification documents
GET    /api/users/me/wallet     🔒   Wallet balance + transaction history
POST   /api/users/me/payout     🔒   Request Stripe Connect payout
```

---

## Jobs Endpoints

```
GET    /api/jobs                      Browse open jobs (with filters)
POST   /api/jobs               🔒    Post a new job
GET    /api/jobs/:id                  Get job details
PATCH  /api/jobs/:id           🔒    Update job (poster only)
DELETE /api/jobs/:id           🔒    Cancel job (poster only)
POST   /api/jobs/:id/apply     🔒    Apply to a job (worker)
GET    /api/jobs/:id/applications 🔒 Get applications (poster only)
POST   /api/jobs/:id/lock      🔒    Lock in a worker + create Stripe payment
POST   /api/jobs/:id/start     🔒    Mark job as in_progress (worker)
POST   /api/jobs/:id/proof     🔒    Submit completion proof (worker)
POST   /api/jobs/:id/release   🔒    Release payment (GPS + confirm required)
POST   /api/jobs/:id/dispute   🔒    Open a dispute
GET    /api/jobs/:id/location-pings 🔒 Get live location pings
POST   /api/jobs/:id/location-batch 🔒 Submit GPS location batch (worker tracking)
GET    /api/jobs/my             🔒   My posted jobs
GET    /api/jobs/applied        🔒   Jobs I applied to
GET    /api/jobs/nearby               Jobs near a location (lat/lng)
```

---

## Stripe / Payment Endpoints

```
POST   /api/checkout/create     🔒   Create Stripe checkout session (web)
GET    /api/checkout/success         Checkout success callback
POST   /api/mobile/checkout-link 🔒  Create HMAC-signed mobile checkout token
GET    /api/mobile/checkout-redirect Redeem token → Stripe session → 302

POST   /api/stripe/connect/onboard 🔒    Start Stripe Connect onboarding
GET    /api/stripe/connect/status  🔒    Check Connect account status
GET    /api/stripe/connect/dashboard-link 🔒 Get Stripe Express dashboard link

POST   /api/webhooks/stripe           Stripe main account webhook (raw body)
POST   /api/webhooks/stripe-connect   Stripe Connect webhook (raw body)
```

---

## Studio Endpoints

```
POST   /api/studio/session/start    🔒   Start/resume 24h Studio session
POST   /api/studio/session/heartbeat 🔒  Keep session alive (every 4 min)
GET    /api/studio/session/status   🔒   Current session + credit balance
POST   /api/studio/generate/video   🔒   Generate video clip (Fal.ai)
POST   /api/studio/generate/image   🔒   Generate image (Fal.ai)
POST   /api/studio/generate/music   🔒   Generate music (Fal.ai minimax)
POST   /api/studio/generate/ai-director 🔒  AI Director batched generation
GET    /api/studio/files            🔒   List session files
GET    /api/studio/explore               Featured clips (For You feed)
GET    /api/studio/model-pricing         Current per-tool credit costs
POST   /api/studio/admin/feature-clip 🛡  Add clip to featured feed
DELETE /api/studio/admin/feature-clip/:id 🛡 Remove featured clip
```

---

## Push Notifications

```
POST   /api/push/subscribe      🔒   Register VAPID web push subscription
DELETE /api/push/unsubscribe    🔒   Remove web push subscription
POST   /api/push/register-token 🔒   Register native device token (iOS/Android)
DELETE /api/push/unregister-token 🔒 Remove device token
GET    /api/push/vapid-public-key    Get VAPID public key for browser subscription
```

---

## Messages / Chat

```
GET    /api/messages/threads    🔒   All message threads
GET    /api/messages/:threadId  🔒   Messages in a thread
POST   /api/messages            🔒   Send a message
```

---

## Verify & Inspect (V&I)

```
GET    /api/verify-inspect/jobs  🔒      Browse V&I jobs
POST   /api/verify-inspect/jobs  🔒      Create V&I job
POST   /api/verify-inspect/jobs/:id/proof 🔒  Submit V&I proof
GET    /api/wearable/token       🔒      Get wearable JWT token (hands-free capture)
POST   /api/wearable/upload      🔒      Upload hands-free clip
```

---

## Cash Drops

```
GET    /api/cash-drops               Browse active drops
POST   /api/cash-drops          🔒   Create a drop (hirer/sponsor)
POST   /api/cash-drops/:id/claim 🔒  Claim a drop
GET    /api/cash-drops/nearby        Drops near location
```

---

## Direct Offers

```
GET    /api/direct-offers       🔒   My offers (sent + received)
POST   /api/direct-offers       🔒   Send a direct offer to a worker
PATCH  /api/direct-offers/:id   🔒   Accept, decline, or counter
POST   /api/direct-offers/:id/pay 🔒 Pay a direct offer
```

---

## Barter Listings

```
GET    /api/barter                   Browse barter listings
POST   /api/barter              🔒   Create barter listing
GET    /api/barter/:id               Get barter listing details
PATCH  /api/barter/:id          🔒   Update barter listing
POST   /api/barter/:id/offer    🔒   Make a barter offer
```

---

## Business Endpoints

```
GET    /api/biz/account         🔒   Business account details
PATCH  /api/biz/account         🔒   Update business account
POST   /api/biz/verify          🔒   Pay business verification fee ($49)
GET    /api/biz/talent-explorer 🔒   Browse worker profiles (requires Scout Plan)
POST   /api/biz/unlock/:userId  🔒   Unlock a worker profile
POST   /api/biz/scout-plan      🔒   Purchase Scout Plan subscription
GET    /api/biz/dashboard        🔒   Business dashboard data
POST   /api/biz/job             🔒   Post a business job
```

---

## Load Board

```
GET    /api/load-board               Browse load board listings
POST   /api/load-board          🔒   Post a load listing
GET    /api/load-board/:id           Get listing details
PATCH  /api/load-board/:id      🔒   Update listing (poster only)
DELETE /api/load-board/:id      🔒   Remove listing (poster only)
```

---

## Feature Flags

```
GET    /api/feature-flags            Get all flags (current state)
GET    /api/feature-flags/:key       Check a single flag for current user
PATCH  /api/feature-flags/:key  🛡   Update flag (admin only)
```

---

## Admin & QA

```
GET    /api/admin/users         🛡   User list with filters
GET    /api/admin/users/:id     🛡   User detail + admin actions
PATCH  /api/admin/users/:id     🛡   Update user (suspend, ban, etc.)
GET    /api/admin/jobs          🛡   All jobs with filters
GET    /api/admin/disputes      🛡   All disputes
PATCH  /api/admin/disputes/:id  🛡   Resolve dispute
GET    /api/admin/dashboard     🛡   Platform metrics
GET    /api/admin/qa            🛡   QA dashboard data
POST   /api/admin/qa/cash-drops 🛡   Cash drop debugger
POST   /api/admin/test-user     🛡   Create sandbox test user
```

---

## Internal / Cron

```
POST   /api/internal/cron/run              Trigger cron jobs (x-cron-secret header required)
GET    /api/internal/mission-control/status Health check (x-cron-secret header)
POST   /api/internal/mission-control/status Same endpoint, POST also works
```

---

## Config / Meta

```
GET    /api/config               Google Maps API key (for frontend)
GET    /api/health               Health check → 200
GET    /api/geo/zip/:zip         Geocode a zip code → { lat, lng, city, state }
GET    /api/asset-protection/pricing  Asset protection package pricing
GET    /api/asset-protection/recommend?value=N  Recommended package for asset value N
```

---

## Error Response Format

```json
{
  "message": "Human-readable error description"
}
```

HTTP status codes:
- `200` — Success
- `201` — Created
- `400` — Bad request (validation error)
- `401` — Not authenticated
- `403` — Forbidden (wrong role or feature flag off)
- `404` — Not found
- `409` — Conflict (duplicate, already purchased)
- `429` — Rate limited
- `500` — Internal server error
- `503` — Feature unavailable (e.g. FAL_KEY missing for Studio)

---

## Common Request Patterns

### Login and get session
```bash
curl -c cookies.txt -X POST https://guberapp.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"..."}'
```

### Use session for authenticated requests
```bash
curl -b cookies.txt https://guberapp.app/api/auth/me
```

### Check a feature flag
```bash
curl -b cookies.txt https://guberapp.app/api/feature-flags/studio_v2
# → { "enabled": true, "scope": "global" }
```

### Trigger cron jobs
```bash
curl -X POST https://guberapp.app/api/internal/cron/run \
  -H "x-cron-secret: $CRON_SECRET"
```
