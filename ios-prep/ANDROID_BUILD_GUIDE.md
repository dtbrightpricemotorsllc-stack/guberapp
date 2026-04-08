# GUBER Android AAB Build Guide

The Android SDK is not installed in the Replit environment, so the AAB must be
built on a machine with Android Studio or the Android command-line tools.

---

## What Changed in This Release (v1.2)

| Fix | Details |
|-----|---------|
| GPS / Location | Added `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` to `AndroidManifest.xml` — without these, Android silently denied all GPS requests |
| Google Sign-In | Session is now set directly in the OAuth callback (no more in-memory token exchange that failed across server instances) |
| Business mode gating | `pending_business` users see the setup flow; standard users see contact support |
| Worker cancel of funded jobs | Now sets `canceled_by_worker` status and issues a Stripe refund to the hirer |

---

## Build Steps (on your local machine or CI)

### Option A — Android Studio

1. Open Android Studio
2. File → Open → select the `android/` folder in this project
3. Wait for Gradle sync to complete
4. Build → Generate Signed Bundle / APK → Android App Bundle
5. Select your keystore:
   - File: `android-build-config/guber-release.jks`
   - Alias: `guber`
   - Password: (your keystore password)
6. Choose Release → Finish

### Option B — Command Line (requires Android SDK)

```bash
# Set Android SDK location
export ANDROID_HOME=/path/to/your/android/sdk

# From project root:
npm run build
cp -r dist/public/* android/app/src/main/assets/public/

# Build signed AAB
cd android
./gradlew bundleRelease --no-daemon \
  -Pandroid.injected.signing.store.file=../android-build-config/guber-release.jks \
  -Pandroid.injected.signing.store.password=YOUR_PASSWORD \
  -Pandroid.injected.signing.key.alias=guber \
  -Pandroid.injected.signing.key.password=YOUR_PASSWORD
```

The signed AAB will be at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

Copy it to the project root and rename it:
```bash
cp android/app/build/outputs/bundle/release/app-release.aab guber-v1.2-release.aab
```

---

## Upload to Google Play Console

1. Go to Google Play Console → your GUBER app
2. Release → Production (or Internal Testing) → Create new release
3. Upload `guber-v1.2-release.aab`
4. Release name: `1.2 — GPS Fix + Google Sign-In Fix`
5. Release notes: see below

### Suggested Release Notes

```
v1.2 — Critical fixes

• Fixed GPS/location not working on Android (missing OS-level permission)
• Fixed Google Sign-In session not persisting after login
• Improved business mode access flow
```

---

## Version Numbers

Current version in `android/app/build.gradle`:
- `versionCode` = 2
- `versionName` = "1.1"

Before building v1.2, bump these:
```groovy
versionCode 3
versionName "1.2"
```
