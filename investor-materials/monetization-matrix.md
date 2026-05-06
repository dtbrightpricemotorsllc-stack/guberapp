# GUBER — Monetization Matrix

**Source of truth for every revenue stream in the GUBER platform.** All figures verified against `server/pricing.ts` and the Stripe webhook handlers in `server/routes.ts` as of the date this file was generated. Use this as the answer key when an investor asks "how exactly do you make money?"

| # | Stream | Who pays | Price | Margin / take rate | Status | Source |
|---|---|---|---|---|---|---|
| 1 | Job platform fee | Job poster (taken from helper share) | **20%** of base job price | 100% — pure platform take | **Live** | `server/pricing.ts` `DEFAULT_FEE_CONFIG.platformFeeRate = 0.20` |
| 2 | Job processing fee | Job poster (added on top of base) | **3.2%** of base job price | Net of Stripe pass-through (~2.9% + $0.30); residual is margin | **Live** | `server/pricing.ts` `posterProcessingFeeRate = 0.032` |
| 3 | Job service fee (admin-configurable) | Job poster | Configurable, default 0% | Pure margin when set | **Live, off by default** | `server/pricing.ts` `posterServiceFeeRate = 0` |
| 4 | Worker cashout — early | Helper opting in | **2%** of helper gross share | Pure margin | **Live, feature-flagged off** | `server/pricing.ts` `earlyCashoutFeeRate = 0.02`, `earlyCashoutEnabled = false` |
| 5 | Worker cashout — instant | Helper opting in | **5%** of helper gross share | Pure margin minus instant-payout cost | **Live, feature-flagged off** | `server/pricing.ts` `instantCashoutFeeRate = 0.05`, `instantCashoutEnabled = false` |
| 6 | Trust Box subscription (AI or Not premium) | End user | **$4.99 / month** recurring | Subscription margin minus AI inference cost | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "trust_box"` |
| 7 | Day-1 OG tier | Helper / supporter | One-time purchase (price set in Stripe dashboard) | One-time revenue + retention via 5 AI credits + unlimited text verification | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "day1og"` |
| 8 | Business verification fee | Business | **$49 one-time** | Pure margin minus Stripe processing | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "business_verification"` |
| 9 | Business Scout Plan subscription | Business | **$99 / month** recurring (includes 20 talent unlocks/mo) | High-margin recurring B2B revenue | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "business_scout_plan"` |
| 10 | Business extra unlock packs | Business | Per-pack add-on | Pure margin | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "business_extra_unlocks"` |
| 11 | Marketplace listing boost | Listing seller | Per-listing (7-day featured placement) | Pure margin minus Stripe processing | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "marketplace_boost"` |
| 12 | Cash Drop brand sponsorships | Brand sponsor | Sponsor amount split: `platformAmount` + `dropPoolAmount` (+ `prize_per_winner * winner_count`) | Platform takes a defined share of every sponsor dollar; remainder flows to user prize pool | **Live** | `server/routes.ts` Stripe webhook `metadata.type === "sponsor_drop"`, `dropSponsors` table |
| 13 | Observation marketplace | Business buyer | Variable price per observation; helper gets **80%**, GUBER gets **20%** | 20% take rate | **Live** | `server/routes.ts` observation purchase notification: `$${(price * 0.8).toFixed(2)} credited to your wallet` |
| 14 | Direct Offers | Hirer (gross-up math) | Stripe Connect `application_fee_amount` calculated as `grossCharge − workerShare`, where workerShare = `offerAmount × (1 − platformFeeRate)` | Same effective platform fee as jobs, captured via Stripe Connect | **Live** | `server/routes.ts` `/api/direct-offers/:id/create-payment` |
| 15 | Sponsored visibility / content licensing | Brand sponsor | Per-impression or pack-based (founder-described, not yet wired) | TBD — early-stage product | **Emerging** | Founder-described; needs final productization |

---

## Discount & promo overrides

The job platform fee can be reduced under three named scenarios — useful to know so an investor can model net take rate, not just gross:

| Override | Effect | Floor |
|---|---|---|
| **Day-1 OG discount** | Default 20% → 18% (-2pp) for Day-1 OG helpers | **Never below 5%** |
| **Referral discount** | Configurable per-referral discount (`-options.referralDiscount`) | **Never below 5%** |
| **Promo rate** | Admin can override with any explicit promo rate | None — admin-set |

Source: `server/pricing.ts` `calculateJobPricing()`.

---

## Effective economics — worked example

**Scenario:** poster pays for a $100 job, standard fees, no discounts.

| Item | Amount |
|---|---|
| Base job price | $100.00 |
| + Poster processing fee (3.2%) | $3.20 |
| **Total poster charge** | **$103.20** |
| − Platform fee (20% of base) | $20.00 |
| **Helper gross share** | **$80.00** |
| − Stripe pass-through (~2.9% + $0.30 of total) | ~$3.30 |
| **GUBER gross profit per $100 job** | **~$19.90** |

For a Day-1 OG helper on the same $100 job, the platform fee drops to 18% → helper gross $82, GUBER gross profit ~$17.90. Across 1,000 such jobs: **~$19.9k of platform revenue**.

---

## Where these come from in the code

- `server/pricing.ts` — every fee constant and the `calculateJobPricing()` function.
- `server/routes.ts` — every Stripe webhook handler (`metadata.type`) that recognizes a paid product, plus the Direct Offers payment endpoint.
- `shared/schema.ts` — the `dropSponsors`, `cashDrops`, `businessAccounts`, `businessPlans`, `observations`, `moneyLedger`, `guberPayments`, and `walletTransactions` tables that record every dollar.

If any number above changes in code, regenerate this document — do not let the deck and the codebase drift.
