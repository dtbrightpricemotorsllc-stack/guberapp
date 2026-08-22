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

## Review-safe Commerce Mode

Before an App Store resubmission, GUBER's Commerce Mode must remain
`EARNED_CREDITS_ONLY`. In this mode, paid digital-benefit checkout is
intentionally unavailable. Do **not** run TC-01 through TC-08 or TC-11 through
TC-17 as purchase-success cases unless an authorized release owner has explicitly
changed Commerce Mode to `FULL_COMMERCE` for a separate test environment.

For an App Review build, run TC-24 below instead. It verifies that the review-safe
lock gives a clear in-app response and never begins a Stripe or external-browser
checkout.

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

## TC-11 — Return-to-app banner appears after Studio credit pack purchase

**Surface:** `/studio` (redirect target after a successful mobile credit purchase)

**Prerequisite:** Run TC-03 and TC-04 first to establish that the purchase itself completes. This test focuses only on the banner.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Complete a studio credit pack purchase via the `ExternalPurchaseSheet` flow (TC-03 + TC-04 up to popover close). | Stripe confirms. Popover closes. |
| 2 | Observe the screen the app returns to. | The app is on `/studio` (Studio home page) because the `success_url` configured by `GET /api/mobile/checkout-redirect` for `studio_credits` is `{base}/studio?credits=success`. |
| 3 | Confirm the green return-to-app banner is visible at the bottom of the screen. | A green bar reads **"Purchase complete"** with a "Tap here to return to the GUBER app" link (`data-testid="banner-mobile-return"`). |
| 4 | Tap the **"Tap here to return to the GUBER app"** link. | The system opens the GUBER app via the `guber://` deep link scheme. (On a TestFlight build the app should already be in the foreground; the link may focus it or trigger no-op — confirm no crash or error alert.) |
| 5 | Tap the **✕** dismiss button on the banner. | Banner disappears. Studio page remains intact. |

Pass criteria: ✅ Green banner visible on `/studio` after credit purchase; `guber://` link present; dismiss works.

---

## TC-12 — Return-to-app banner appears after Studio subscription purchase

**Surface:** `/studio` (redirect target after a successful mobile subscription purchase)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Complete a studio subscription tier purchase via `ExternalPurchaseSheet` (TC-05). | Stripe confirms. Popover closes. |
| 2 | Confirm the app returns to `/studio?subscription=success`. | App is on the Studio home page. |
| 3 | Confirm the green return-to-app banner is visible. | Banner text and `guber://` link match TC-11. |
| 4 | Tap the `guber://` link. | No crash. |
| 5 | Dismiss the banner. | Banner disappears. |

Pass criteria: ✅ Green banner visible on `/studio` after subscription purchase.

---

## TC-13 — Return-to-app banner appears after Day-1 OG purchase

**Surface:** `/og-success` (redirect target after a successful Day-1 OG purchase)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Complete a Day-1 OG purchase via `ExternalPurchaseSheet` on `/profile` (TC-06). | Stripe confirms. Popover closes. |
| 2 | Confirm the app navigates to `/og-success?session_id=...`. | The OG Success page is shown. |
| 3 | Confirm the green return-to-app banner is visible at the bottom. | Banner reads **"Purchase complete"** with `guber://` link. |
| 4 | Tap the `guber://` link. | No crash. |
| 5 | Dismiss the banner. | Banner disappears. |

Pass criteria: ✅ Green banner visible on `/og-success` after Day-1 OG purchase.

---

## TC-14 — Return-to-app banner appears after Trust Box purchase

**Surface:** `/ai-or-not?trustbox=success` (redirect target after a Trust Box mobile purchase)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Complete a Trust Box purchase via `ExternalPurchaseSheet` on `/ai-or-not` (TC-07). | Stripe confirms. Popover closes. |
| 2 | Confirm the app navigates to `/ai-or-not?trustbox=success`. | The AI-or-Not page is shown with Trust Box activated. |
| 3 | Confirm the green return-to-app banner is visible at the bottom. | Banner reads **"Purchase complete"** with `guber://` link. |
| 4 | Tap the `guber://` link. | No crash. |
| 5 | Dismiss the banner. | Banner disappears. |

Pass criteria: ✅ Green banner visible on `/ai-or-not` after Trust Box purchase.

---

## TC-15 — Banner deep link opens the app (integration check)

**Purpose:** Confirm that the `guber://` URI scheme is registered and handled by the iOS app so tapping the banner link in the SFSafariViewController or external browser brings the user back into the app.

**Prerequisite:** Install the app via TestFlight on a physical iPhone (not Simulator — URI scheme open does not work in Simulator).

| # | Step | Expected result |
|---|------|-----------------|
| 1 | After any successful purchase that shows the banner (TC-11 through TC-14), tap the **"Tap here to return to the GUBER app"** link. | iOS intercepts the `guber://` scheme and opens the GUBER app (or brings it to foreground if already running). |
| 2 | If the app is already in the foreground (SFSafariViewController scenario), observe whether the popover dismisses or focuses. | No crash, no error dialog. The app remains functional. |
| 3 | Force-quit the GUBER app. Open Safari and manually navigate to a URL that contains the banner (e.g., `https://guberapp.app/studio?credits=success` on an iOS device with a mobile user-agent). Tap the banner link. | The OS prompts to open GUBER or opens it directly, landing on the app home screen. |

Pass criteria: ✅ `guber://` URI scheme registered; tapping the link opens the app without error.

---

## TC-16 — Return-to-app banner appears after Business Scout plan purchase

**Surface:** `/biz/dashboard` (redirect target after a successful mobile Business Scout plan purchase)

**Prerequisite:** Run TC-08 first to establish that the Scout Plan purchase itself completes. This test focuses only on the banner.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Complete a Business Scout plan purchase via the `ExternalPurchaseSheet` flow on `/biz/talent-explorer` (TC-08). | Stripe confirms. Popover closes. |
| 2 | Observe the screen the app returns to. | The app is on `/biz/dashboard` because the `success_url` configured by `GET /api/mobile/checkout-redirect` for `business_scout` is `{base}/biz/dashboard?subscribed=true&purchased=1`. |
| 3 | Confirm the green return-to-app banner is visible at the bottom of the screen. | A green bar reads **"Purchase complete"** with a "Tap here to return to the GUBER app" link (`data-testid="banner-mobile-return"`). |
| 4 | Tap the **"Tap here to return to the GUBER app"** link. | The system opens the GUBER app via the `guber://` deep link scheme. No crash or error alert. |
| 5 | Tap the **✕** dismiss button on the banner. | Banner disappears. Business Dashboard page remains intact. |

Pass criteria: ✅ Green banner visible on `/biz/dashboard` after Scout Plan purchase; `guber://` link present; dismiss works.

---

## TC-17 — Return-to-app banner appears after Business extra unlocks purchase

**Surface:** `/biz/dashboard` (redirect target after a successful mobile Business extra unlocks purchase)

**Prerequisite:** User must be an active Scout Plan subscriber (TC-08 or TC-16 completed first). Extra unlock packs are only purchasable by Scout Plan holders.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to `/biz/dashboard` as a Scout Plan subscriber. Tap the extra unlock pack purchase button. | Disclosure dialog appears (same as TC-01). |
| 2 | Tap **Continue** → complete the Stripe test purchase. | Stripe confirms. Popover closes. |
| 3 | Observe the screen the app returns to. | The app is on `/biz/dashboard` because the `success_url` for `business_unlock` is `{base}/biz/dashboard?unlocks_purchased=true&purchased=1`. |
| 4 | Confirm the green return-to-app banner is visible at the bottom of the screen. | Green bar reads **"Purchase complete"** with `guber://` link (`data-testid="banner-mobile-return"`). |
| 5 | Tap the **✕** dismiss button on the banner. | Banner disappears. Dashboard remains intact. Unlock count updated. |

Pass criteria: ✅ Green banner visible on `/biz/dashboard` after extra unlocks purchase; `guber://` link present; dismiss works.

---

## TC-18 — Sign in with Apple completes on iPhone and iPad

**Devices:** Physical iPhone and iPad with an Apple ID available for Sign in with
Apple. Run this once on each device class.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open the TestFlight build while signed out and select **Sign in with Apple**. | Apple's native Sign in with Apple sheet opens. No generic GUBER error toast appears. |
| 2 | Complete authentication with the QA Apple ID. | The sheet closes and the app signs into the QA account. |
| 3 | Force-close and reopen the app. | The session remains valid and the app renders authenticated content. |

Pass criteria: ✅ Native Apple sheet opens and the QA account signs in on both device classes.

---

## TC-19 — Proof-photo camera capture

**Devices:** Physical iPhone and iPad. Use a disposable QA job or test mission
that permits proof submission; do not submit a production job.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open the proof-submission surface and select the proof-photo action. | The native camera opens, or iOS requests camera access with GUBER's usage description. |
| 2 | Grant permission if prompted and take a photo. | The photo returns to the proof surface as an attached preview. |
| 3 | Cancel from the camera, then reopen it. | Cancellation leaves the form usable; reopening presents the camera again. |

Pass criteria: ✅ A live photo can be captured and attached, with no unresponsive control.

---

## TC-20 — Change profile photo

**Devices:** Physical iPhone and iPad.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open your profile and tap **Change profile photo**. | The native iOS picker presents **Take Photo** and **Choose from Library** options. |
| 2 | Choose one option and select or capture an image. | The image uploads and the profile avatar updates. |
| 3 | Cancel the picker and tap the control again. | The profile stays usable and the picker can be reopened. |

Pass criteria: ✅ The control is responsive and a changed photo persists after refresh.

---

## TC-21 — Wallet renders a visible state

**Devices:** Physical iPhone and iPad. Use a QA account with either wallet history
or no wallet history; both states are valid as long as one is visibly rendered.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to **Wallet** after authentication. | The page progresses past its loading state. |
| 2 | Wait up to 10 seconds. | Balance/history content, an empty state, or an actionable error state is visible — never a blank screen. |
| 3 | Leave and return to Wallet. | The visible state remains usable; no crash or permanent spinner occurs. |

Pass criteria: ✅ Wallet is never blank on either device class.

---

## TC-22 — In-app account deletion

**Devices:** Physical iPhone and iPad. **Use a new disposable QA account only.**
This flow permanently anonymizes the account and signs it out.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open Profile → Account Settings → Danger Zone → **Delete**. | The first warning dialog explains immediate profile/login removal and retention. |
| 2 | Continue and enter the disposable QA account's exact email. | **DELETE MY ACCOUNT** is disabled until the matching email is entered. |
| 3 | Confirm deletion. | The app signs out and the deleted account cannot sign back in. |

Pass criteria: ✅ A user can complete deletion within the app without contacting support.

---

## TC-23 — `guber://` deep link opens the TestFlight app

**Devices:** Physical iPhone and iPad.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Force-quit GUBER. In Safari, open a GUBER return page containing the return banner, then tap **Tap here to return to the GUBER app**. | iOS opens or prompts to open GUBER using `guber://`; GUBER launches without a crash or alert. |
| 2 | Repeat while GUBER is already foregrounded. | The app stays functional; no error dialog appears. |

Pass criteria: ✅ The registered custom scheme opens the installed TestFlight build on both device classes.

---

## TC-24 — Review-safe digital-purchase lock

**Devices:** Physical iPhone and iPad. **Prerequisite:** Confirm Commerce Mode is
`EARNED_CREDITS_ONLY`; do not switch it for App Review verification.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open `/studio/credits` and select any paid digital credit pack or tier entry point that is visible. | The app explains that paid digital purchases are unavailable in the current mode, or the paid entry point is not offered. |
| 2 | Check that no system disclosure, SFSafariViewController, Safari app, or Stripe page opens. | No external checkout begins. |
| 3 | Repeat on another digital-benefit surface if available (Day-1 OG, Trust Box, Business Scout). | The same review-safe block applies. |

Pass criteria: ✅ Paid digital-benefit checkout cannot start, while earned-credit and real-world-service functionality remain unaffected.

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

Return-to-app banner (TC-11–TC-17)
TC-11 Banner on /studio after credits purchase           [ ] Pass  [ ] Fail  Notes: ___
TC-12 Banner on /studio after subscription purchase      [ ] Pass  [ ] Fail  Notes: ___
TC-13 Banner on /og-success after Day-1 OG purchase      [ ] Pass  [ ] Fail  Notes: ___
TC-14 Banner on /ai-or-not after Trust Box purchase      [ ] Pass  [ ] Fail  Notes: ___
TC-15 guber:// deep link opens the app                   [ ] Pass  [ ] Fail  Notes: ___
TC-16 Banner on /biz/dashboard after Scout Plan purchase [ ] Pass  [ ] Fail  Notes: ___
TC-17 Banner on /biz/dashboard after extra unlocks buy   [ ] Pass  [ ] Fail  Notes: ___

Overall: [ ] APPROVED  [ ] BLOCKED — do not submit
```

### App Review recovery record — 2026-08-22

**Status: BLOCKED — do not resubmit yet.** This Linux workspace has no Xcode,
physical iPhone/iPad, TestFlight install access, or eligible Apple ID, so it
cannot truthfully record a physical-device pass. No reviewer-facing device
screenshots or screen recordings were captured here.

Completed non-device checks:

- ✅ iOS permission guard and its negative self-test passed: camera/microphone
  WebView handling is present; only foreground location is declared.
- ✅ Apple Sign-In plugin registration check passed: `AppleSignInPlugin` is in
  the iOS Capacitor package list and the `guber` URL scheme is declared.
- ✅ Browser checks completed with the QA account: the Change Photo control is
  enabled; Account Deletion reaches its two-step, email-gated confirmation;
  Wallet renders a nonblank shell; and review-safe Commerce Mode offers no
  Stripe path.
- ✅ The mobile Safari user-agent Playwright check passed for the actual
  `/studio?credits=success` redirect target after restoring its return banner.

Still required from the person holding the new TestFlight build:

```
Build:          _______________   (must be the newly uploaded build)
TestFlight date: _______________
Tester:         _______________

TC-18 Apple Sign-In (iPhone)                 [ ] Pass  [ ] Fail  Evidence: ___
TC-18 Apple Sign-In (iPad)                   [ ] Pass  [ ] Fail  Evidence: ___
TC-19 Proof-photo capture (iPhone)           [ ] Pass  [ ] Fail  Evidence: ___
TC-19 Proof-photo capture (iPad)             [ ] Pass  [ ] Fail  Evidence: ___
TC-20 Change profile photo (iPhone)          [ ] Pass  [ ] Fail  Evidence: ___
TC-20 Change profile photo (iPad)            [ ] Pass  [ ] Fail  Evidence: ___
TC-21 Wallet visible state (iPhone)          [ ] Pass  [ ] Fail  Evidence: ___
TC-21 Wallet visible state (iPad)            [ ] Pass  [ ] Fail  Evidence: ___
TC-22 Account deletion, disposable QA (iPhone) [ ] Pass [ ] Fail Evidence: ___
TC-22 Account deletion, disposable QA (iPad) [ ] Pass  [ ] Fail  Evidence: ___
TC-23 guber:// deep link (iPhone)            [ ] Pass  [ ] Fail  Evidence: ___
TC-23 guber:// deep link (iPad)              [ ] Pass  [ ] Fail  Evidence: ___
TC-24 review-safe purchase lock (iPhone)     [ ] Pass  [ ] Fail  Evidence: ___
TC-24 review-safe purchase lock (iPad)       [ ] Pass  [ ] Fail  Evidence: ___

Final physical-device status: [ ] APPROVED — resubmission allowed
                              [ ] BLOCKED — do not submit
```
