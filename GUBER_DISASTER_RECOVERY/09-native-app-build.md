# GUBER Native App Build Instructions

## Overview

GUBER uses **Capacitor 7** to wrap the React web app into native iOS and Android apps.
The web app is built first, then synced into the native projects.

```
npm run build          → dist/public/ (web assets)
npx cap sync ios       → copies web assets into ios/App/
npx cap sync android   → copies web assets into android/app/
```

---

## iOS Build (Codemagic CI/CD)

iOS builds are done via Codemagic, not locally. The configuration is in `codemagic.yaml`.

### Prerequisites (set in Codemagic environment)

1. **Code signing certificate** — `GUBER_iOS_Distribution` (uploaded to Codemagic → Code Signing Identities)
2. **Provisioning profile** — `GUBER_Profile_v3` (com.guber.app, App Store distribution)
3. **App Store Connect API credentials** (in Codemagic "Default" environment group):
   ```
   APP_STORE_CONNECT_ISSUER_ID=
   APP_STORE_CONNECT_KEY_IDENTIFIER=
   APP_STORE_CONNECT_PRIVATE_KEY=  (contents of AuthKey_XXXXXX.p8)
   ```

### Codemagic build pipeline (from `codemagic.yaml`)

```yaml
scripts:
  1. npm ci                        # Install Node deps (reads package-lock.json)
  2. npm run build                 # Build React app to dist/public/
  3. npx cap sync ios              # Sync web assets into Xcode project
  4. xcodebuild -resolvePackageDependencies   # SPM deps
  5. keychain initialize           # Set up macOS keychain for signing
  6. Wipe pre-installed profiles   # Remove stale Codemagic profiles
  7. app-store-connect fetch-signing-files    # Fetch current App Store profile from Apple
  8. xcode-project use-profiles    # Apply profiles
  9. xcodebuild archive            # Build .xcarchive
  10. xcodebuild -exportArchive    # Export .ipa
  11. app-store-connect publish    # Upload to App Store Connect / TestFlight
```

### Key Xcode settings
```
Workspace: ios/App/App.xcworkspace
Scheme: App
Bundle ID: com.guber.app
Xcode version: 16.2 (set in codemagic.yaml)
Minimum iOS: 14.0 (set in Info.plist)
```

### Triggering a build
1. Push to the `main` branch → Codemagic auto-triggers (if webhook configured)
2. Or: Codemagic Dashboard → Start new build → select `ios-app-store` workflow

### App Store submission
After Codemagic uploads to App Store Connect:
1. App Store Connect → TestFlight → distribute to testers
2. App Store Connect → App Store → submit for review
3. Typical review time: 1-3 business days

---

## iOS Entitlements

`ios/App/App/App.entitlements` — **do not modify without careful review**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>production</string>
</dict>
</plist>
```

Only `aps-environment` is present. Do NOT add:
- `com.apple.developer.storekit.external-purchase-link` — not needed, causes App Review issues
- `com.apple.developer.healthkit` — not used
- Any entitlement not matching a live App ID capability

### App ID capabilities (enabled on Apple Developer Portal)
- Push Notifications ✓
- Sign in with Apple ✓

---

## iOS Key Files

| File | Purpose |
|------|---------|
| `ios/App/App/Info.plist` | App permissions, URL schemes, display name |
| `ios/App/App/App.entitlements` | Entitlements (only APNs env) |
| `ios/App/App/AppDelegate.swift` | App lifecycle, deep link handling |
| `ios/App/App/capacitor.config.json` | Platform-specific Capacitor config |
| `capacitor.config.ts` | Root Capacitor config (shared) |
| `codemagic.yaml` | Full CI/CD pipeline definition |

---

## Info.plist Permissions

GUBER requests these permissions in `Info.plist`:
```
NSLocationWhenInUseUsageDescription — Job location tracking
NSLocationAlwaysAndWhenInUseUsageDescription — Background location (if enabled)
NSCameraUsageDescription — Photo/video capture for job proof
NSPhotoLibraryUsageDescription — Upload existing photos
NSMicrophoneUsageDescription — Video recording
NSFaceIDUsageDescription — Biometric auth (optional)
```

---

## Android Build

Android builds can be done locally or via Codemagic.

### Local Android build

Prerequisites:
- Android Studio (latest)
- Java 17+
- Android SDK 34+

```bash
# 1. Build web app
npm run build

# 2. Sync to Android project
npx cap sync android

# 3. Open in Android Studio
npx cap open android

# 4. Build → Generate Signed Bundle/APK → release build
# Keystore alias: guber (from capacitor.config.ts android.buildOptions.keystoreAlias)
```

### Android keystore

The Android keystore (`*.jks` / `*.keystore`) is gitignored and must be stored securely.
In Codemagic: **Code Signing** → **Android Keystores** → upload your `.jks` file.

Keystore details (you must know these to sign new builds):
```
Keystore file: guber.jks  (stored in Codemagic or secure vault)
Keystore alias: guber
Keystore password: (stored in Codemagic secrets)
Key password: (stored in Codemagic secrets)
```

### Android key files

| File | Purpose |
|------|---------|
| `android/app/build.gradle` | Build config, dependencies, signing |
| `android/app/src/main/AndroidManifest.xml` | Permissions, intents |
| `android/app/src/main/java/com/guber/app/MainActivity.java` | Main activity |
| `android/app/src/main/java/com/guber/app/GuberTrackingService.java` | Location service |
| `android/app/google-services.json` | Firebase config (gitignored — back up!) |
| `android/app/src/main/res/xml/config.xml` | Capacitor Android config |

---

## Capacitor Configuration

`capacitor.config.ts` (root):
```typescript
{
  appId: 'com.guber.app',
  appName: 'GUBER',
  webDir: 'dist/public',           // Points to built web assets
  server: {
    url: 'https://guberapp.app',   // Live server URL (app loads from here)
    cleartext: false,
  },
  plugins: {
    Browser: { presentationStyle: 'popover' },
    PushNotifications: { presentationOptions: ['alert', 'badge', 'sound'] },
  },
  ios: {
    scheme: 'guber',               // URL scheme for deep links: guber://
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
    minWebViewVersion: 60,
    buildOptions: { keystoreAlias: 'guber' },
  },
}
```

**Important:** The app points to `https://guberapp.app` (live server). The native
app shell is just a WebView container. Updates to the web app are instant (no
App Store update needed for web-only changes). Native code changes (plugins,
permissions, entitlements) require a new App Store build.

---

## Platform Detection in Code

```typescript
// client/src/lib/platform.ts
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isStoreBuild = isNative; // True for all native builds
```

Use `isStoreBuild` to conditionally show `ExternalPurchaseSheet` instead of
direct Stripe checkout links on iOS.

---

## Deep Link Setup

URL scheme: `guber://`

Examples:
- `guber://jobs/123` — opens job detail
- `guber://reset-password?token=abc` — password reset

Configured in:
- iOS: `Info.plist` → `CFBundleURLSchemes`
- Android: `AndroidManifest.xml` → `intent-filter`
- Handled in: `ios/App/App/AppDelegate.swift`

---

## Common Build Issues

| Issue | Fix |
|-------|-----|
| `npm ci` fails on Codemagic | Run `npm install` locally and commit updated `package-lock.json` |
| Stale provisioning profile | Codemagic fetches fresh profile from Apple — clear cached profiles step handles this |
| Push notifications not working | Check `aps-environment=production` in entitlements, verify APNs key is correct |
| App rejected for external purchase | Verify `ExternalPurchaseSheet` shows Apple's required disclosure text before redirecting |
| Android build fails — keystore not found | Upload keystore to Codemagic Code Signing section |
| `google-services.json` missing | Download from Firebase Console and place at `android/app/google-services.json` |
| Capacitor sync fails | Run `npm run build` first, then `npx cap sync` |
