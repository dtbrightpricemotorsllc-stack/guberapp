# GUBER iOS Setup Guide

This folder contains everything you need to initialize and configure the GUBER iOS app from a Mac with Xcode installed.

---

## Prerequisites (on your Mac)

1. macOS 13+ (Ventura or later)
2. Xcode 15+ installed from the App Store
3. CocoaPods: `sudo gem install cocoapods`
4. Node.js 22+: `brew install node`

---

## Step 1 — Initialize the iOS Project

Run these commands from the project root (same folder as `capacitor.config.ts`):

```bash
npm install
npx cap add ios
npx cap sync ios
```

This creates `ios/App/App/Info.plist` and the full Xcode project.

---

## Step 2 — Add Required Privacy Descriptions to Info.plist

Open `ios/App/App/Info.plist` and add the keys from `ios-prep/Info.plist.template`.

**These are mandatory for App Store submission:**

| Key | Why it's needed |
|-----|-----------------|
| `NSLocationWhenInUseUsageDescription` | GPS for nearby jobs and Cash Drops |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Background location alerts |
| `NSCameraUsageDescription` | Job proof photo capture |
| `NSPhotoLibraryUsageDescription` | Attach proof images |
| `NSPhotoLibraryAddUsageDescription` | Save proof photos |
| `NSMicrophoneUsageDescription` | Video proof recording |

> **Without these keys, Apple will reject the app during review.**

---

## Step 3 — Google Sign-In Configuration

The app uses the Capacitor Browser plugin for OAuth, which opens the Google sign-in
page in Safari. No native Google SDK (GoogleSignIn.framework) is needed.

**What's already configured:**
- `ios.scheme = 'guber'` in `capacitor.config.ts` registers the `guber://` URL scheme
- The Google OAuth callback now sets the session directly (web flow) — no token exchange
- For native iOS, the `guber://oauth-complete?t=TOKEN` deep link flow is unchanged

**What to verify in Google Cloud Console:**
1. Add `com.guber.app` as an iOS OAuth client (separate from the Web client)
2. Add the following as authorized redirect URIs:
   - `https://guberapp.app/api/auth/google/callback`
3. Download `GoogleService-Info.plist` (only needed if you use Firebase; skip otherwise)

---

## Step 4 — Business Mode & Feature Parity

Business mode, job gating, and all backend logic are identical on iOS — everything
runs through the same `https://guberapp.app` server. No extra configuration needed.

---

## Step 5 — Open in Xcode and Configure Signing

```bash
npx cap open ios
```

In Xcode:
1. Select the `App` target → Signing & Capabilities
2. Choose your Apple Developer Team
3. Bundle ID: `com.guber.app` (must match App Store Connect)
4. Enable "Automatically manage signing"

---

## Step 6 — Test on Device

Connect an iPhone via USB and press Run (⌘R) in Xcode.

Check that:
- [ ] Location permission dialog appears on first launch
- [ ] Google Sign-In opens in Safari and redirects back to the app
- [ ] Camera permission dialog appears on first proof submission
- [ ] All tabs and pages load from `https://guberapp.app`

---

## Step 7 — Archive for App Store

1. Product → Archive
2. Distribute App → App Store Connect
3. Upload

---

## What Still Needs Manual Work for App Store Submission

| Item | Action Required |
|------|-----------------|
| Apple Developer Account | Enroll at developer.apple.com ($99/year) |
| App Store Connect listing | Create the app record, add screenshots, description, keywords |
| iOS-specific screenshots | Required: 6.7" (iPhone 15 Pro Max) and 6.5" (iPhone 11 Pro Max) |
| Privacy Policy URL | Must be hosted publicly — link in App Store Connect |
| Age Rating | Fill out the questionnaire in App Store Connect |
| Google iOS OAuth Client | Register `com.guber.app` in Google Cloud Console |
| TestFlight beta | Recommended before public release — submit a build to TestFlight first |
| App Review compliance | Ensure no contact-info scraping, comply with in-app purchase rules |

---

## Notes on GPS (Already Fixed)

The Android GPS issue (missing `ACCESS_FINE_LOCATION` in manifest) does not apply
to iOS — iOS uses `Info.plist` privacy descriptions instead. As long as the keys in
Step 2 are present, iOS will prompt the user for location permission automatically.
