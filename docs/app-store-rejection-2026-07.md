# App Store Rejection — iOS App 1.0.0 (7), reviewed 2026-07-01

Apple rejected build 1.0.0 (7) under:
- 2.1.0 Performance: App Completeness
- 2.3.6 Performance: Accurate Metadata
- 2.5.4 Performance: Software Requirements
- 3.1.1 Business: Payments - In-App Purchase
- 5.1.1 Legal: Privacy - Data Collection and Storage

## Confirmed root cause: unjustified "Always Allow" location request (5.1.1 + 2.5.4)

`AppDelegate.swift` called `CLLocationManager.requestAlwaysAuthorization()`
unconditionally in `applicationDidBecomeActive`, on every app foreground —
not gated to an active protected job. The reviewer saw the "Change to Always
Allow?" prompt almost immediately after launch, before doing anything
location-relevant.

Worse, the permission did nothing: `UIBackgroundModes` never declared
`location`, and `@capacitor-community/background-geolocation` (the plugin
`TaskTrackingService` calls for real iOS background tracking) is listed in
`package.json` but its plugin class is **not** in `capacitor.config.json`'s
`packageClassList`, so it was never compiled into the native binary.
`bgStartWatch()` always silently failed and fell back to foreground-only
tracking. Net effect: every user was asked for a broad permission that no
functioning feature actually used.

**Fix applied:**
- Removed the swizzle + `requestAlwaysAuthorization()` flow from
  `AppDelegate.swift` entirely.
- Removed `NSLocationAlwaysAndWhenInUseUsageDescription` from `Info.plist`
  (kept `NSLocationWhenInUseUsageDescription`, clarified it's foreground-only).
- Left `bg-geolocation.ts` / `TaskTrackingService`'s bg path in place as
  dead/no-op code for now (deferred real background tracking); if it's ever
  revived, the community plugin's class must be added to `packageClassList`
  AND `UIBackgroundModes` must include `location`, and the Always-permission
  request must only fire when a protected job actually starts (never on app
  launch).

## Apple's exact rejection text (obtained from screenshots)

- **2.5.4** — `UIBackgroundModes` declared `location` but no feature uses
  persistent background location. → Fixed above.
- **2.1.1(a) App Completeness**, tested on iPad Air 11" (M3) / iOS 26:
  1. Wallet screen showed no content.
  2. Tapping "submit proof photo" showed no photo options.
  3. "Change photo" button was unresponsive.
  4. An error was shown when tapping "Sign in with Apple".
- **5.1.1(v)** — app must offer in-app account deletion, not just
  deactivation.
- **3.1.1** — app/metadata offers purchasable content outside of IAP.
- **2.3.6** — age rating doesn't match the content/parental-control settings
  declared in App Store Connect.

## Confirmed root cause: missing Camera plugin (2.1.1(a) #2)

`mission-proof-sheet.tsx` dynamically imports `@capacitor/camera` to launch
the native camera for mission proof photos. The package was **not** in
`package.json`, and even `@capacitor/status-bar` (used statically in
`App.tsx`) was missing from the compiled plugin list — both silently no-op
on a real device with no error shown, matching "no photo options" exactly.

**Fix applied:** installed `@capacitor/camera`, removed the unused/never-
compiled `@capacitor-community/background-geolocation` package (dead code —
`TaskTrackingService` only does foreground tracking; keeping it around only
reintroduces the same background-location risk we just removed), and re-ran
`npx cap sync ios`. `Package.swift` / `capacitor.config.json` now compile in
exactly: App, Browser, Camera, Geolocation, Preferences, PushNotifications,
StatusBar (+ BiometricAuthNative, integrated manually, not via SPM).
Also added a fallback in `mission-proof-sheet.tsx`: if the native Camera
plugin call throws for any other reason, it now falls back to the file-input
capture sheet instead of leaving the user stuck.

## Confirmed root cause: broken Apple Sign-In (2.1.1(a) #4)

`native-apple-sign-in.ts` posts to `/api/auth/apple/web-initiate`, which
**does not exist anywhere in `server/routes.ts`** — every tap 404s and
surfaces a generic "Sign-In Failed" toast, exactly matching the reviewer's
report. The only Apple auth route that exists, `/api/auth/apple/native`,
expects an identity token from a native Sign-In-with-Apple plugin — but no
such plugin is installed or compiled into the app (comment in the debug
route suggests one was removed previously: "...falling back to the in-app
browser").

**Not yet fixed** — this needs a decision, not a guess (see "Open decisions"
below): Apple *requires* offering Sign in with Apple because the app offers
Google Sign-In (Guideline 4.8), so the button can't simply be removed.

## Verified already-correct: account deletion (5.1.1)

In-app account deletion already exists end-to-end:
`account-settings.tsx` `deleteMutation` → `DELETE /api/users/:id` in
`server/routes.ts`. Apple may have missed it, or hit a bug reaching it (e.g.
the same broken Apple Sign-In blocking their test account from ever getting
into Settings). No code change made here — flagging for App Store Connect
resubmission notes / reviewer re-test guidance.

## Still investigating

- Wallet blank screen (2.1.1(a) #1) — code inspection of `wallet.tsx`
  found no obvious bug (loading/error/empty states are all handled); most
  likely needs a real device/account repro to pin down — possibly the same
  broken Apple Sign-In prevented the reviewer's account from ever loading
  real wallet data.
- "Change photo" unresponsive (2.1.1(a) #3) — code inspection of
  `account-settings.tsx` found no obvious bug (no wrapping `<form>` to
  cause an accidental submit, click handler and hidden input look correct).
  Same caveat — may be a device-specific repro or a downstream effect of
  another bug.
- 2.3.6 Accurate Metadata — App Store Connect listing configuration
  (age rating / parental controls questionnaire), not app code.
- 3.1.1 In-App Purchase — `ExternalPurchaseSheet` disclosure-then-Stripe
  flow was flagged as offering purchasable content outside IAP. This is a
  major architectural question (see "Open decisions").

## Open decisions needing user input

1. **Apple Sign-In**: implement a real flow. Two paths:
   - **Native** (recommended): add a native "Sign in with Apple" Capacitor
     plugin (e.g. `@capgo/capacitor-social-login` or Apple's own
     AuthenticationServices via a small custom plugin), wire it to the
     already-working `/api/auth/apple/native` server route. Needs the
     `applesignin` entitlement (may already be present) and no new secrets.
   - **Web OAuth**: implement `/api/auth/apple/web-initiate` as a real
     "Sign in with Apple" web flow. Needs new Apple Developer setup: a
     Services ID, a Sign-In-with-Apple private key, and a registered
     redirect URI — i.e. new secrets from the user's Apple Developer
     account.
2. **3.1.1 IAP**: decide whether to pursue the External Purchase Link
   entitlement route, restrict `ExternalPurchaseSheet` further, or dispute
   with Apple citing the physical/service exemption — needs the user's
   call since it changes monetization architecture.
3. **2.3.6 age rating**: needs the user (or whoever has App Store Connect
   access) to review/update the age rating and parental-controls
   questionnaire to match actual app content — not something fixable from
   the codebase.
