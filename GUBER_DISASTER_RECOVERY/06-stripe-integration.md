# GUBER Stripe Integration Requirements

GUBER uses **two** Stripe keys for two separate payment rails.
See `docs/payment-routing.md` for the authoritative policy.

---

## Two Stripe Rails

| Rail | Key | Webhook | Used for |
|------|-----|---------|---------|
| **Main account** | `STRIPE_SECRET_KEY` | `/api/webhooks/stripe` | Studio credits, subscriptions, Trust Box, Business fees |
| **Stripe Connect** | `STRIPE_CONNECT_SECRET_KEY` | `/api/webhooks/stripe-connect` | Job payments, worker payouts, direct offers |

Both keys are typically the same Stripe account's platform key. Set them
separately in env vars to allow independent rotation.

---

## Setup Checklist

### Step 1: Create Stripe account
- Go to https://dashboard.stripe.com
- Create a platform account (not an individual Connect account)
- Enable **Stripe Connect** in the Dashboard → Connect settings

### Step 2: Get API keys
```
Dashboard → Developers → API keys
  → Secret key → STRIPE_SECRET_KEY
  → Also set as STRIPE_CONNECT_SECRET_KEY
```

Use `sk_test_...` for development, `sk_live_...` for production.

### Step 3: Register Webhook 1 (Main account)
```
Dashboard → Developers → Webhooks → Add endpoint
  URL: https://guberapp.app/api/webhooks/stripe
  Events:
    - checkout.session.completed
    - customer.subscription.updated
    - customer.subscription.deleted
    - invoice.payment_succeeded
    - invoice.payment_failed
  → Signing secret → STRIPE_WEBHOOK_SECRET
```

### Step 4: Register Webhook 2 (Stripe Connect)
```
Dashboard → Developers → Webhooks → Add endpoint
  URL: https://guberapp.app/api/webhooks/stripe-connect
  Listen to: Connect account events
  Events:
    - payment_intent.succeeded
    - payment_intent.payment_failed
    - transfer.created
    - account.updated
    - payout.paid
    - payout.failed
  → Signing secret → STRIPE_CONNECT_WEBHOOK_SECRET
```

### Step 5: Create Trust Box subscription price
```
Dashboard → Products → Create product
  Name: GUBER Trust Box
  Price: recurring, monthly, $X.XX
  → Price ID → STRIPE_PAYROLL_TRUST_BOX_PRICE_ID
```

### Step 6: Configure Connect settings
```
Dashboard → Connect → Settings
  → Payout schedule: match your platform policy
  → Application fee percentage: set platform fee %
  → Allow users to receive payouts: Yes
```

---

## Stripe Connect Flow (Job Payments)

Workers must complete Stripe Connect onboarding before accepting jobs:

```
Worker → POST /api/stripe/connect/onboard
       → Stripe creates/updates Express account
       → Returns onboarding URL
       → Worker completes Stripe KYC
       → Stripe fires account.updated webhook
       → Worker's stripeAccountStatus updated
```

Job payment flow:
```
Hirer locks worker → POST /api/jobs/:id/lock
  → Stripe PaymentIntent created (destination: worker's Stripe account)
  → application_fee_amount set (platform fee)

Worker completes job → POST /api/jobs/:id/release
  → GPS proximity verified (≤ 150m, ≤ 60s staleness)
  → Stripe PaymentIntent captured
  → Connect transfer to worker
```

---

## Product / Price ID Reference

These prices are created dynamically in the Stripe API calls (no hardcoded price IDs
except Trust Box). The code creates prices on-the-fly using `price_data`:

| Product | How priced | Stripe call |
|---------|------------|-------------|
| Job lock-in | Dynamic (job.payment) | `payment_intents.create` with Connect |
| Business verification | $49 one-time | `checkout.sessions.create` with `price_data` |
| Business Scout Plan | $99/mo | `checkout.sessions.create` with `price_data` |
| Additional unlocks | $7 × qty | `checkout.sessions.create` with `price_data` |
| Studio credit packs | $5–$200 | `checkout.sessions.create` with `price_data` |
| Studio subscriptions | $10.99/$37.99/$99/mo | `checkout.sessions.create` with `price_data` |
| Trust Box | Price ID from env | `checkout.sessions.create` with `STRIPE_PAYROLL_TRUST_BOX_PRICE_ID` |
| Day-1 OG membership | Dynamic | `checkout.sessions.create` with `price_data` |
| Cash Drops | Dynamic | `checkout.sessions.create` with `price_data` |
| Barter listings | Dynamic | `checkout.sessions.create` with `price_data` |

---

## iOS External Purchase Link (ExternalPurchaseSheet)

Digital products on iOS go through the `ExternalPurchaseSheet` component:

```
Component: client/src/components/external-purchase-sheet.tsx
Token bridge server: server/mobile-checkout-token.ts
Token mint: POST /api/mobile/checkout-link   (signs HMAC token, 15-min TTL)
Token redeem: GET  /api/mobile/checkout-redirect  (creates Stripe session → 302)
```

**No Apple IAP** is implemented. All iOS digital purchases use Stripe via
external browser (SFSafariViewController). This is valid under current U.S.
App Store guidelines for apps with a web business presence.

**Entitlement note:** The `com.apple.developer.storekit.external-purchase-link`
entitlement is NOT in `ios/App/App/App.entitlements` and must NOT be added.

---

## Webhook Fulfillment Pattern

All Stripe webhook handlers use atomic fulfillment with `FOR UPDATE` row locking
to prevent double-fulfillment on webhook retries:

```typescript
// Pattern in routes.ts:
await pool.query('BEGIN');
const row = await pool.query(
  'SELECT * FROM purchases WHERE stripe_session_id = $1 FOR UPDATE',
  [sessionId]
);
if (row.rows[0]?.status === 'paid') {
  await pool.query('ROLLBACK');
  return res.sendStatus(200); // Already fulfilled — idempotent
}
// Apply all effects in same transaction
await pool.query('UPDATE purchases SET status = $1 WHERE ...', ['paid']);
// ... credit grants, feature flags, etc.
await pool.query('COMMIT');
```

---

## Stripe API Version

```typescript
// server/routes.ts line ~128
const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia"
});
```

When upgrading Stripe SDK, test all webhook handlers and payment flows.

---

## Testing Stripe Locally

Use the Stripe CLI to forward webhooks to localhost:

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
stripe listen --forward-to localhost:5000/api/webhooks/stripe-connect

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded --stripe-account <connect-account-id>
```

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Requires auth: `4000 0025 0000 3155`
- Decline: `4000 0000 0000 9995`
