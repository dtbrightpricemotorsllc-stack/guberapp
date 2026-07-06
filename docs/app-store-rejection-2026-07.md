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

**Fixed:** built a first-party native plugin, `ios/App/App/AppleSignInPlugin.swift`,
wrapping Apple's own `AuthenticationServices` (`ASAuthorizationAppleIDProvider`) —
no third-party npm dependency, no new credentials needed. Rewrote
`client/src/lib/native-apple-sign-in.ts` to call it via
`registerPlugin<AppleSignInPlugin>("AppleSignIn")` and POST the resulting
`identityToken`/`fullName` to the already-working `/api/auth/apple/native`
route. `App.entitlements` already had `com.apple.developer.applesignin` — no
entitlement change needed.

**Second bug found and fixed during this work — local native plugins get
silently dropped by `cap sync`:** `npx cap sync ios` rebuilds
`ios/App/App/capacitor.config.json`'s `packageClassList` by scanning only
*installed npm* Capacitor plugins' source files
(`@capacitor/cli/util/iosplugin.js`) — it never scans this app target's own
`ios/App/App/*.swift` files. Since `AppleSignInPlugin` is intentionally not an
npm package, every `cap sync` silently removed it from `packageClassList` with
no build error, so it would stop being registered at runtime. Also confirmed
`CapacitorBridge.registerPluginType()` is NOT a usable workaround — it's a
no-op whenever `autoRegisterPlugins` is true, which it is by default in this
project.

Fix: added `scripts/fix-ios-plugin-registration.mjs`, which re-injects
`AppleSignInPlugin` (and any future local plugin classes) into
`packageClassList`. Documented as a **mandatory step after every
`npx cap sync ios`** in `ios-prep/SETUP_GUIDE.md`, including an optional Xcode
Build Phase so it can't be forgotten before an Archive build. Verified the
wipe-then-repair cycle by running `npx cap sync ios` and confirming the script
correctly restores the missing class.

## Confirmed root cause (app-wide): "no photo options" was not limited to one screen

The original fix only patched `mission-proof-sheet.tsx`. Auditing every other
proof/photo-capture surface found the exact same root cause (plain
`<input type="file" capture="environment">` with no `@capacitor/camera` call,
which WKWebView does not reliably honor) still present in:
- `job-detail.tsx` — bounty photo slots
- `cash-drop-detail.tsx` — cash drop proof capture (single-slot and
  per-checklist-item variants, both built on `<label>`-wrapped file inputs)
- `worker-clipboard.tsx` — `GeneralProofSubmit` (fallback proof upload when a
  job has no checklist items)
- `submit-observation.tsx` — observation marketplace photo attachments
- `profile.tsx` — ID verification `UploadButton` (`type === "id"` only;
  other upload types intentionally still allow gallery selection)

**Fix applied:** extracted the working native-camera pattern from
`mission-proof-sheet.tsx` into a shared helper,
`client/src/lib/native-camera-capture.ts`
(`triggerLiveCameraCapture(fileInputRef, onFile)`), and wired it into all five
surfaces above. On native iOS/Android it calls `Camera.getPhoto()` directly;
on web, or if the native call fails for a non-cancel reason, it falls back to
clicking the hidden file input. `cash-drop-detail.tsx`'s `<label>`-based
triggers were restructured into `<div onClick>` wrappers so the same ref-based
helper can drive them. Note: `worker-clipboard.tsx`'s per-checklist-item
camera (live `getUserMedia` video stream, not a file input) was already
unaffected and needed no change.

Verified via `tsc --noEmit` (no new errors introduced), a full app restart
(clean boot), and the state-bleed audit (176 files, clean). Native camera
behavior itself still requires a real-device/Xcode build to confirm — cannot
be exercised from this Linux sandbox.

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

1. ~~**Apple Sign-In**~~ — **Resolved.** Native `AppleSignInPlugin` built and
   wired (see above). Needs real-device verification before resubmission
   (cannot be tested from this sandboxed Linux environment — requires Xcode
   + a physical device or simulator with an Apple ID signed in).
2. **3.1.1 IAP**: user approved a wording-only audit (no backend/architecture
   changes) of all in-app money/credits/subscription/paywall copy for
   misleading earn-vs-cost-vs-reward framing. See "3.1.1 wording audit"
   section below once complete.
3. **2.3.6 age rating**: needs the user (or whoever has App Store Connect
   access) to review/update the age rating and parental-controls
   questionnaire to match actual app content — not something fixable from
   the codebase.

## 3.1.1 wording audit — complete

Reviewed all in-app money/credits/subscription/paywall copy across Studio
generation, Studio credits/tiers, Day-1 OG, Trust Box, Business Scout Plan,
and profile unlocks for misleading earn-vs-cost-vs-reward framing. No backend
logic, pricing, or purchase flows were changed — text only.

**Fixed (real violations found):**
- Several Studio "Generate" buttons hid the credit cost entirely on iOS store
  builds (`isStoreBuild ? "Generate" : "Generate · {cost} cr"` pattern) — a
  user on iOS could tap Generate with no idea it would consume credits until
  after the fact. Now always shows the credit cost on every platform:
  `commercial-wizard.tsx`, `mirror-motion-form.tsx`, `studio-music.tsx`,
  `studio-text-to-video.tsx`.
- `og-advantage.tsx` CTA buttons read "CLAIM YOUR OG STATUS" next to a $2
  one-time fee — "claim" implies free. Changed both instances to
  "UNLOCK OG STATUS — $2.00" so the price is in the button itself, not just
  nearby copy.

**Checked and already compliant (no change needed):**
- `studio-credits.tsx` (packs/tiers): price + credit amount shown clearly,
  `ExternalPurchaseSheet` disclosure used correctly before Stripe checkout.
- `profile.tsx` Day-1 OG / Trust Box buttons already read
  "Activate Day-1 OG — $1.99" with price inline — no ambiguous "claim/get"
  wording present.
- `biz-talent-explorer.tsx` "UNLOCK PROFILE" — this consumes a pre-purchased
  plan allowance (like phone-plan minutes), not a new charge; the same screen
  shows a live "Unlocks Left" counter, so the cost/allowance is visible in
  context.
- `credits.tsx` / `growth-tasks.tsx` — the earned/cashable currency is
  consistently labeled "GUBER Credits" (distinct from purchased "Studio
  Credits"), so there's no earn-vs-purchase conflation.
- `og-advantage.tsx` "+25% OG BONUS" and `credits.tsx` "OG Bonus" — these
  describe a referral-earnings rate, not a purchase, so they aren't
  misleading in the 3.1.1 sense.

Verified via `tsc --noEmit`, full app restart (clean boot, no runtime
errors), and a visual check of `/og-advantage` in-app.

## Apple Sign-In: manual verification still required

This plugin cannot be compiled or run in this Linux sandbox (no Xcode). Before
resubmitting to Apple, verify on a real device or Xcode simulator:
1. Run through `ios-prep/SETUP_GUIDE.md` Step 2 (`cap sync` +
   `fix-ios-plugin-registration.mjs`) and Step 6 (Xcode Build Phase).
2. Confirm `ios/App/App/capacitor.config.json`'s `packageClassList` includes
   `"AppleSignInPlugin"` right before building.
3. Tap "Sign in with Apple" on the signup screen — the native Apple sheet
   should appear, complete, and log the user in via `/api/auth/apple/native`
   with no error toast.
