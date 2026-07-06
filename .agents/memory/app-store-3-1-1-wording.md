---
name: App Store 3.1.1 wording review
description: Recurring UI-text patterns that get flagged under Apple Guideline 3.1.1 (In-App Purchase) even when the actual payment routing is correct.
---

When Apple flags 3.1.1 on an app that already routes digital purchases through the correct disclosure/checkout flow (e.g. an external-purchase-link sheet before Stripe), the root cause is usually misleading UI copy, not the payment plumbing. Two patterns recur:

1. **Cost hidden behind a platform check.** A `isStoreBuild ? "Generate" : "Generate · {cost} cr"`-shaped conditional (or any `Platform.OS === 'ios' ? ... : ...` variant) that shows the price/cost on web but suppresses it on iOS. This looks like an attempt to dodge review, and even when unintentional it means the user commits to a spend with no visible cost.
   **Why:** reviewers test the iOS build specifically, so any such conditional is guaranteed to be seen.
   **How to apply:** grep the codebase for `isStoreBuild` / platform checks near price, cost, or credit labels; the fix is to always show the cost, never to reroute the purchase mechanism.

2. **"Claim/Get/Activate for free"-sounding CTA next to a real charge.** Verbs like "CLAIM", "GET", "UNLOCK" (without a price) on a button that actually charges money read as free to a reviewer skimming the screen, even if a `$X.XX` price is shown in nearby body text.
   **Why:** Apple evaluates the CTA in isolation, not the surrounding paragraph.
   **How to apply:** put the price directly in the CTA string itself (e.g. "UNLOCK OG STATUS — $2.00"), not just adjacent copy.

Both fixes are copy-only — no backend/payment-flow changes needed unless the underlying routing is actually wrong (see `docs/payment-routing.md` for this project's Stripe/ExternalPurchaseSheet policy).
