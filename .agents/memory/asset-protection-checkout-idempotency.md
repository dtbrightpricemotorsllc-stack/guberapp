---
name: Asset protection checkout idempotency
description: Why Verified Release System™ checkout must guard at init, not only at webhook fulfillment.
---

Stripe checkout for asset protection (and any one-asset-one-purchase product) must be made idempotent at **checkout initiation**, not only at webhook fulfillment.

**Why:** Webhook-side `fulfillPurchaseBySession` (atomic pending→paid keyed by `stripeSessionId`) only stops a single session from being applied twice. It does NOT stop a user from repeatedly hitting the checkout endpoint and minting multiple distinct Stripe sessions / pending rows — each is a separate live charge surface, so the asset could be paid for more than once.

**How to apply:** Before `stripeMain.checkout.sessions.create`, call `findPurchaseForAsset({assetId, productType, packageTier})`:
- a `paid` row → reject 409 ("already active").
- a `pending` row with a session id → `stripe.checkout.sessions.retrieve`; if `status === "open"` reuse its `url` instead of minting a new one; on retrieve failure fall through and create fresh.

**Contract gotcha:** the web checkout endpoints return `{ checkoutUrl }` (not `{ url }`). The client must read `checkoutUrl`. A key mismatch silently breaks the web redirect into Stripe while still creating the session.
