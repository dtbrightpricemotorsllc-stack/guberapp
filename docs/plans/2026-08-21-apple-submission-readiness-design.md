# Apple Submission Readiness

## Goal

Prepare GUBER for another App Store review submission while keeping digital
purchases unavailable to reviewers until the business is ready to choose an
Apple-compliant purchase route.

## Decisions

- Use the existing, admin-only Commerce Mode control rather than create a
  second purchase toggle.
- Keep `EARNED_CREDITS_ONLY` as the review-safe default. This preserves earned
  credit access while blocking paid digital benefits and external checkout.
- Keep real-world service, marketplace, and worker-payout flows unaffected.
- Use one canonical iOS GitHub Actions workflow: `Build iOS IPA`.

## Implementation

1. Enforce Commerce Mode at every server-side digital checkout entry point,
   including Studio subscriptions.
2. Remove background-location declarations and the Always-location permission
   from the shipping iOS plist. GUBER requests foreground location only.
3. Use macOS 15 + Xcode 26, an automatically incremented build number safely
  above the already-used build 124, iPhone OS SDK archive, and disabled asset
  thinning in the canonical workflow.
4. Repair Capacitor native-plugin registration after every sync, then run the
   native permission guard before archiving.

## Verification

- Run the native permission guard and its self-test.
- Validate the canonical workflow YAML and build the web bundle.
- Confirm Commerce Mode rejects Studio subscription checkout unless the
  administrator has selected `FULL_COMMERCE`.

## Remaining manual App Store Connect work

- Confirm the age-rating and parental-controls questionnaire reflects all app
  content.
- Upload approved screenshot sets for every required device size.
- Complete TestFlight checks on a physical iPhone/iPad for Apple Sign-In,
  camera/photo capture, Wallet, account deletion, deep links, and the
  review-safe purchase lock.
- After a successful workflow run, confirm App Store Connect shows the new
  build number before selecting it for review.