# GUBER Payment Routing Policy

**Status:** Authoritative. All payment-related code must comply.
**Owner:** Platform / Payments

---

## Principle

GUBER separates payments by **what is being purchased**, not by which device the
user is on. There are two and only two payment rails:

| Rail | What it's for | Where it runs |
| --- | --- | --- |
| **Stripe / Stripe Connect** | Real-world services, jobs, payouts, marketing | Web + iOS + Android |
| **Apple IAP / Google Play Billing** | Digital-only products & subscriptions, *only when the store requires it* | iOS / Android store builds only |

**Apple Pay** and **Google Pay** are *wallet payment methods inside Stripe*. They
are NOT the same as Apple IAP / Play Billing. They are allowed for any Stripe
flow (real-world or digital web purchase).

---

## Why the split exists

Real-world job payments must stay on Stripe so GUBER controls:

- two-sided confirmation (lock-in + proof + release)
- proof review and dispute resolution
- payout timing and Stripe Connect transfers to workers
- platform fees
- refund rules tied to job state, not app-store policy

If a real-world job refund had to go through Apple's refund system, the worker
payout, dispute taxonomy, and ledger would all break. **Never route a
real-world service payment through IAP / Play Billing.**

---

## Classification of every current payment surface

### Real-world services → **Stripe (always, every platform)**

| `metadata.type` | Surface | Rationale |
| --- | --- | --- |
| `job_lock` | Hirer locks in a worker for a posted job | Real-world service |
| `direct_offer_payment` | Hirer pays for a private direct offer | Real-world service |
| `barter_post` | Barter listing fee | Real-world marketplace |
| `business_verification` | $49 one-time business KYB fee | Real-world business onboarding |
| `business_extra_unlocks` | $7/profile worker contact unlock | Real-world hiring tool |
| `marketplace_boost` | Paid placement for a job/listing | Real-world advertising |
| `cash_drop_payout` (Connect) | Hirer funds a Cash Drop campaign | Real-world marketing service |
| `sponsor_drop` | Sponsor funds a community drop | Real-world marketing service |
| Stripe Connect transfers | Worker payouts | Real-world wages |

These must remain on Stripe on **all platforms** including iOS and Android
store builds. Apple's IAP rules explicitly exempt "physical goods or services"
and "person-to-person services" from IAP.

### Digital products → **Stripe via Apple External Purchase Link (task-561)**

GUBER uses Apple's **External Purchase Link** entitlement (EU / reader-app
compliance path) instead of hiding digital purchase UI on store builds.

Every digital purchase surface in the iOS app shows Apple's mandated disclosure
sheet before opening Stripe checkout in SFSafariViewController:

> *"This link will take you to an external website. Apple is not responsible for
> the privacy or security of purchases made on the web."*

The signed-token bridge (`ExternalPurchaseSheet` component +
`POST /api/mobile/checkout-link` + `GET /api/mobile/checkout-redirect`) handles
authentication automatically — the user lands on Stripe without having to log in
to the web.

| `metadata.type` | Surface | iOS delivery |
| --- | --- | --- |
| `studio_credits` | AI Video Studio credit packs ($5–$200) | `ExternalPurchaseSheet` on `/studio/credits` |
| `studio_subscription` | Studio Standard/Business/Enterprise $10–$99/mo | `ExternalPurchaseSheet` on `/studio/credits` |
| `business_scout_plan` | $99/mo Talent Explorer subscription | `ExternalPurchaseSheet` on `/biz/talent-explorer` |
| `business_extra_unlocks` | $7/unlock extra profile unlock packs (5-pack default) | `ExternalPurchaseSheet` on `/biz/dashboard` (Scout Plan holders only) |
| `trust_box` | Trust Toolbox subscription $9.99/mo | `ExternalPurchaseSheet` floating panel on `/ai-or-not` (shown when not yet subscribed); iframe `hideCheckout=1` blocks in-iframe checkout |
| `day1og` | Day-1 OG digital perks/badge — $1.99 | `ExternalPurchaseSheet` on `/profile` and floating panel on `/ai-or-not` |

---

## iOS entitlement required

`ios/App/App/App.entitlements` must include:

```xml
<key>com.apple.developer.storekit.external-purchase-link</key>
<string>external-purchase</string>
```

This key must be provisioned in the Apple Developer portal under the app's
App ID before submission. Without it, the entitlement is silently ignored and
Apple may reject the build.

---

## ExternalPurchaseSheet component

`client/src/components/external-purchase-sheet.tsx`

Accepts `product` + optional `options` props and a render-prop `children({ onPress, loading })`.

**iOS flow:**
1. `onPress` → calls `POST /api/mobile/checkout-link` → receives signed URL
2. Shows Apple's mandated disclosure `<Dialog>`
3. On "Continue" → `Browser.open({ url, presentationStyle: "popover" })` (SFSafariViewController)
4. `GET /api/mobile/checkout-redirect?token=…` validates HMAC token, creates Stripe Checkout Session server-side, 302-redirects to Stripe
5. On return → app polls `/api/auth/me` and updates credit/tier state automatically

**Non-iOS flow:** `onPress` calls the link endpoint and navigates with `window.location.href` (no disclosure required).

**Route contract:** The canonical token-bridge URL is `GET /api/mobile/checkout-redirect` (a server route in `server/routes.ts`). There is no `/mobile-checkout` client-side route in `App.tsx` — the redirect flows entirely server-to-Stripe without a client route hop.

---

## Current store-build gating status (task-561 complete)

| Surface | Status | Method |
| --- | --- | --- |
| `studio.tsx` header `+ credits` CTA | ✅ hidden (`isStoreBuild`) | Existing |
| `studio.tsx` out-of-credits button + low-credit toast | ✅ hidden (`isStoreBuild`) | Existing |
| `/studio/credits` packs + tiers | ✅ ExternalPurchaseSheet | task-561 |
| `/profile` Day-1 OG card | ✅ ExternalPurchaseSheet | task-561 |
| `/biz/talent-explorer` Scout Plan | ✅ ExternalPurchaseSheet | task-561 |
| `/biz/dashboard` extra unlock packs | ✅ ExternalPurchaseSheet (Scout Plan holders) | task-561 |
| `/ai-or-not` Trust Box + Day-1 OG | ✅ ExternalPurchaseSheet floating panel; iframe `hideCheckout=1` blocks in-iframe checkout | task-561 |
| `marketplace.tsx` boost button | ✅ hidden (`isStoreBuild`) | Existing |
| `biz-verification.tsx` $49 fee | ✅ hidden (`isStoreBuild`) — real-world fee, safe to revisit | Existing |

**No remaining gaps.** All digital purchase surfaces on iOS now comply with
Apple's External Purchase Link requirements.

---

## Apple Pay & Google Pay (wallets inside Stripe)

When eventually added, these are configured as **Stripe payment methods**, not
as separate billing systems:

- Web: Stripe `PaymentRequestButton` or `Express Checkout Element`. Requires
  Apple Pay merchant ID + domain verification file at
  `/.well-known/apple-developer-merchantid-domain-association`.
- iOS native: Apple Pay capability in Xcode + merchant ID registered with
  Stripe.
- Android: Google Pay enabled in Stripe dashboard; no extra app config beyond
  Stripe's PaymentSheet.

Wallets can ride any Stripe flow above — real-world or digital — because
they are payment *methods*, not payment *systems*. They never replace IAP for
products Apple requires IAP for.

---

## Rules for new payment code

When adding a new payment surface:

1. **Decide the rail first.** Is this a real-world service or a digital
   product/subscription? Use the table above as the reference.
2. **Real-world → Stripe with a unique `metadata.type`.** Wire the webhook
   handler in `server/routes.ts` and add the new type to this doc.
3. **Digital → Stripe + ExternalPurchaseSheet on store builds.** Add the
   product key to `server/mobile-checkout-token.ts` `VALID_PRODUCTS` and
   handle it in `GET /api/mobile/checkout-redirect`. Wire `ExternalPurchaseSheet`
   in the UI instead of the direct Stripe checkout mutation.
4. **Never mix.** Don't use IAP for a real-world service. Don't use Stripe in
   the iOS app for a digital product without the External Purchase Link
   disclosure sheet.
5. **Update this doc.** Add the new row to the appropriate table. This file
   is the authoritative classification.
