# TestFlight Smoke Test — iOS External Purchase Disclosure Sheet

**Applies to:** Every build submitted to App Store Connect / TestFlight that includes
digital-purchase surfaces (`/studio/credits`, `/profile`, `/biz/talent-explorer`,
`/biz/dashboard`, `/ai-or-not`).

**Prerequisite:** Apple Developer portal must have **External Purchase Link** ticked
on the GUBER App ID and the provisioning profile must be regenerated before the
build is archived. See Steps 1–3 in `docs/payment-routing.md` → "Pre-submission
checklist".

**Stripe environment:** Use a Stripe **test-mode** key (`sk_test_…`) for all
TestFlight smoke tests. Never use a live key in a TestFlight build unless you are
doing a final production smoke test immediately before release.

**Test user:** Use a dedicated QA account (not a real user) that has been created
in the GUBER staging / test environment. The account must be logged in on the
device before starting.

---

## TC-01 — Disclosure sheet appears on credit-pack tap

**Surface:** `/studio/credits`

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open the app and navigate to `/studio/credits` (Studio → Credits). | Credits page loads; packs and subscription tiers are visible. |
| 2 | Tap any credit pack button (e.g., "Spark — 330 cr"). | A loading spinner appears briefly on the button (request to `/api/mobile/checkout-link` is in flight). |
| 3 | Wait for the sheet to appear. | Apple's mandated disclosure dialog opens **within the app** — it is NOT a full browser redirect. Dialog title reads "Continue to external website". |
| 4 | Read the dialog body. | Body text contains: *"This link will take you to an external website. Apple is not responsible for the privacy or security of purchases made on the web."* |
| 5 | Confirm both buttons are present. | **Cancel** and **Continue** buttons are both visible. |

Pass criteria: ✅ Dialog appears, copy matches, two buttons present.

---

## TC-02 — Cancel dismisses the sheet without navigating

**Surface:** `/studio/credits` (continue from TC-01 or repeat steps 1–4)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | With the disclosure dialog open, tap **Cancel**. | Dialog closes. App returns to `/studio/credits`. No browser or Safari popover opens. |
| 2 | Confirm no navigation occurred. | The user is still on the credits page. No Stripe URL was opened. |
| 3 | Tap the same credit pack again. | Dialog opens again from scratch (no stale pending state). |

Pass criteria: ✅ Cancel dismisses cleanly, no navigation side-effect.

---

## TC-03 — Continue opens Stripe in SFSafariViewController (popover)

**Surface:** `/studio/credits` (continue from TC-01 or repeat steps 1–4)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | With the disclosure dialog open, tap **Continue**. | Dialog closes. |
| 2 | Observe the next screen. | A **popover** (SFSafariViewController) slides up from the bottom — it is NOT a full-screen modal and it is NOT the system Safari app. The GUBER branded loading page (`/mobile-checkout`) appears briefly, then automatically redirects to Stripe. |
| 3 | Confirm the Stripe checkout page loads. | Stripe's checkout UI is visible with the correct product name and price for the pack that was tapped. |
| 4 | Confirm the address bar shows a `stripe.com` URL. | The URL begins with `https://checkout.stripe.com/`. |
| 5 | Confirm the SFSafariViewController chrome is present. | A "Done" / close button is visible in the popover. |

Pass criteria: ✅ Popover (not Safari app), GUBER redirect page shown briefly, Stripe checkout loads with correct product.

---

## TC-04 — Stripe test purchase completes and credits are applied

**Prerequisite:** Build is pointed at Stripe test mode. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | In the SFSafariViewController Stripe checkout, enter the test card details and complete the purchase. | Stripe shows a success / confirmation screen. |
| 2 | Close the SFSafariViewController (tap **Done**). | App returns to `/studio/credits`. |
| 3 | Wait up to 10 seconds for the credit balance to update (the app polls `/api/auth/me` on return). | The credit balance displayed in the Studio header increases by the number of credits in the pack that was purchased. |
| 4 | Navigate to Studio home (`/studio`). | The plan pill and credit chip in the Studio header show the updated balance. |

Pass criteria: ✅ Balance updated without requiring a manual refresh or re-login.

---

## TC-05 — Subscription tier purchase (Standard / Business / Enterprise)

**Surface:** `/studio/credits` — subscription tiers section

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Tap a subscription tier button (e.g., "Standard — $10.99/mo"). | Disclosure dialog appears (same as TC-01). |
| 2 | Tap **Continue**. | SFSafariViewController opens with Stripe subscription checkout. |
| 3 | Complete the purchase with a test card. | Stripe shows confirmation. |
| 4 | Close the popover. | App polls `/api/auth/me`; `studio_tier` field updates to `standard` (or the purchased tier). The Plan pill on `/studio` updates from "Free Plan" to "Standard Plan". |

Pass criteria: ✅ Tier reflected in the app without re-login.

---

## TC-06 — Day-1 OG purchase on `/profile`

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to the test user's profile (`/profile`). | Day-1 OG card is visible (user does not yet have the badge). |
| 2 | Tap the Day-1 OG purchase button. | Disclosure dialog appears. |
| 3 | Tap **Continue** → complete the Stripe test purchase. | Stripe confirms. Popover closes. |
| 4 | Return to `/profile`. | Day-1 OG badge is shown on the profile. |

Pass criteria: ✅ Badge visible after purchase, no re-login required.

---

## TC-07 — Trust Box purchase on `/ai-or-not`

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to `/ai-or-not` while logged in as a user without an active Trust Box subscription. | Floating Trust Box purchase panel is visible. |
| 2 | Tap the Trust Box purchase button. | Disclosure dialog appears. |
| 3 | Tap **Continue** → complete the Stripe test purchase. | Popover closes. |
| 4 | Return to `/ai-or-not`. | Trust Box panel is no longer shown; Trust Box features are unlocked. |

Pass criteria: ✅ Trust Box unlocked after purchase.

---

## TC-08 — Business Scout plan on `/biz/talent-explorer`

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Sign in as a business account without a Scout Plan. Navigate to `/biz/talent-explorer`. | Scout Plan upgrade button is visible. |
| 2 | Tap the upgrade button. | Disclosure dialog appears. |
| 3 | Tap **Continue** → complete the Stripe test purchase. | Popover closes. |
| 4 | Return to `/biz/talent-explorer`. | Talent Explorer content is accessible; Scout Plan is active. |

Pass criteria: ✅ Scout Plan active after purchase.

---

## TC-09 — Token expiry edge case (negative test)

**Purpose:** Confirm that a 15-minute-old or tampered token is rejected gracefully.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Using a REST client or the browser Dev Tools network tab (on a non-iOS debug build), intercept the URL returned by `POST /api/mobile/checkout-link`. | URL is of the form `https://guberapp.app/mobile-checkout?token=…`. |
| 2 | Modify one character in the token and open the modified URL in Safari. | `GET /api/mobile/checkout-redirect` returns HTTP 400 or 401. The user sees an error page, NOT a Stripe checkout. |
| 3 | Return to the app and tap a credit pack again. | A fresh valid token is issued and the flow completes normally. |

Pass criteria: ✅ Tampered token rejected, valid retry succeeds.

---

## TC-10 — Non-iOS fallback (regression, run on Android / web)

**Purpose:** Confirm the disclosure sheet does NOT appear on non-iOS builds and
that the web/Android flow redirects directly to Stripe.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open the app on Android or in a desktop browser. Navigate to `/studio/credits`. | Credit packs are visible. |
| 2 | Tap any credit pack. | No disclosure dialog appears. The browser navigates directly to Stripe checkout via `window.location.href`. |
| 3 | Complete a test purchase. | Credits applied on return. |

Pass criteria: ✅ No disclosure dialog on non-iOS; direct Stripe navigation works.

---

## Failure checklist

If any test case fails, check the following before raising a bug:

| Symptom | Likely cause |
|---------|-------------|
| Disclosure sheet never appears on iOS | `isIOS` returning `false` — check `client/src/lib/platform.ts` and that the Capacitor build target is iOS |
| Sheet appears but tapping Continue does nothing | `@capacitor/browser` not installed or not linked; check `npx cap sync ios` was run |
| Stripe checkout opens in full Safari instead of a popover | `Browser.open` `presentationStyle: "popover"` not supported on this iOS version (requires iOS 14+) |
| `POST /api/mobile/checkout-link` returns 401 | User session expired; re-login and retry |
| `GET /api/mobile/checkout-redirect` returns 400 "Invalid or expired token" | Token TTL (15 min) elapsed between `/checkout-link` call and `/checkout-redirect` hit; retry |
| Credits not updated after purchase | Stripe webhook not received in staging; check `stripe listen` is forwarding or that the test webhook endpoint is registered in Stripe Dashboard |
| Apple entitlement silently ignored | Portal capability not enabled on the App ID, or provisioning profile not regenerated — repeat Steps 1–3 of the pre-submission checklist in `docs/payment-routing.md` |

---

## Sign-off record

Before each App Store submission, a team member must run TC-01 through TC-05 on a
real iOS device via TestFlight and record the results here (or in the associated
Linear / Jira ticket):

```
Build:          _______________   (e.g. 1.4.2 / build 231)
TestFlight date: _______________
Device:         _______________   (e.g. iPhone 15 Pro, iOS 17.4)
Tester:         _______________

TC-01 Disclosure appears           [ ] Pass  [ ] Fail  Notes: ___
TC-02 Cancel dismisses cleanly     [ ] Pass  [ ] Fail  Notes: ___
TC-03 Continue → SFSafariVC       [ ] Pass  [ ] Fail  Notes: ___
TC-04 Credits applied after buy    [ ] Pass  [ ] Fail  Notes: ___
TC-05 Subscription tier purchase   [ ] Pass  [ ] Fail  Notes: ___
TC-06 Day-1 OG on /profile         [ ] Pass  [ ] Fail  Notes: ___
TC-07 Trust Box on /ai-or-not      [ ] Pass  [ ] Fail  Notes: ___
TC-08 Scout Plan on /biz           [ ] Pass  [ ] Fail  Notes: ___
TC-09 Token expiry (negative)      [ ] Pass  [ ] Fail  Notes: ___
TC-10 Non-iOS fallback             [ ] Pass  [ ] Fail  Notes: ___

Overall: [ ] APPROVED  [ ] BLOCKED — do not submit
```
