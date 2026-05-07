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

### Digital products → **Stripe today; review Apple rules per-product before shipping in iOS app**

| `metadata.type` | Surface | Apple-rule risk |
| --- | --- | --- |
| `studio_credits` | AI Video Studio credit packs ($5/$20/$50) | High — pure digital consumable |
| `studio_subscription` | Studio Creator $19/mo, Business $99/mo | High — digital subscription |
| `business_scout_plan` | $99/mo Talent Explorer subscription | Medium — unlocks digital app features (could be argued real-world hiring tool, but plays it safer to treat as digital) |
| `trust_box` | Trust Toolbox one-time unlock | High — digital feature unlock |
| `day1og` | Day-1 OG digital perks/badge | High — pure digital cosmetic + perk |
| `ai_or_not` (uses `trust_box` bundle) | AI Or Not credits & unlimited text | High — digital consumable |

For each digital product, the choice on iOS/Android store builds is:

1. **Hide it on store builds** (already the pattern via `isStoreBuild` in
   `client/src/lib/platform.ts`) — user is told to purchase on the web.
   This is the "reader app" pattern and is App Store Review safe.
2. **Implement IAP / Play Billing** — only worth it if the conversion loss
   from option 1 is material and the product can fit IAP's recurring or
   consumable models cleanly.

There is no third option. Selling digital goods through Stripe inside the
iOS app without IAP is an App Store rejection.

---

## Current store-build gating status

`isStoreBuild` (= `isAndroid || isIOS` via Capacitor) is already used to hide
digital purchase UI in:

- ✅ `client/src/pages/biz-verification.tsx` — actually a *real-world* fee, but
  hidden on store builds out of caution. Revisit: this might be safely shown
  in-app since it's KYB, not digital.
- ✅ `client/src/pages/marketplace.tsx` — boost button hidden in store builds.
- ✅ `client/src/pages/ai-or-not.tsx` — opens browser instead of in-app purchase.
- ✅ `client/src/pages/profile.tsx` — Day-1 OG card hidden in store builds.

**Gaps (digital purchase UI currently visible in store builds):**

- ❌ `client/src/pages/studio.tsx` — Studio credit packs *and* Studio
  subscription tiers (Creator $19, Business $99) — both exposed.
- ❌ Trust Box / Trust Toolbox checkout — purchase entry points not gated.
- ❌ `business_scout_plan` ($99/mo) and `business_extra_unlocks` ($7) on
  business dashboard — not gated. Extra-unlocks is borderline-real-world
  (paying to contact a person) but the recurring scout plan is digital.

Each gap above must be resolved before the iOS/Android build is submitted to
the respective store. Resolution = either hide-on-store-build, or implement
IAP / Play Billing for that product.

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
3. **Digital → Stripe + decide store-build behavior up front.** Either gate
   the UI with `isStoreBuild` or queue an IAP/Play Billing implementation
   task before the next mobile release.
4. **Never mix.** Don't use IAP for a real-world service. Don't use Stripe in
   the iOS app for a digital product without IAP.
5. **Update this doc.** Add the new row to the appropriate table. This file
   is the authoritative classification.
