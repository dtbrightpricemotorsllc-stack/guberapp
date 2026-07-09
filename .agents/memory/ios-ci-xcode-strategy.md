---
name: iOS CI Xcode version strategy
description: Which Xcode version to use on GitHub Actions for App Store uploads, and why each option fails.
---

**Rule:** Use `macos-15` runner + Xcode 26. Prefer `/Applications/Xcode_26.0.app` then `Xcode_26.app`.

**Why:**
Apple enforced a requirement (effective July 2026) that all App Store uploads be built with iOS 26 SDK (Xcode 26 or later). Earlier SDKs are rejected at upload time with `SDK version issue`.

**What fails and why:**

| Xcode | Runner | Archive | Upload | Reason |
|---|---|---|---|---|
| Xcode 15.4 | macos-14 | ✓ | ✗ | iOS 17.5 SDK rejected by ASC — Apple requires iOS 26 SDK |
| Xcode 16.2 | macos-15 | ✗ | — | ibtool: `iOS 18.2 Platform Not Installed`; `xcodebuild -downloadPlatform iOS` also fails (`Unable to connect to simulator`, exit 70) — simulator daemon won't start on headless CI |
| Xcode 26 | macos-15 | ✓ | ✓ | iOS 26 SDK bundled; ibtool works (old storyboard toolsVersions 14111/17132 don't require iOS 18.x migration) |

**Key detail on Xcode 16.x ibtool failure:**
Xcode 16.x stores iOS platform files (simulator runtime) separately from the `.app` bundle. On headless GitHub Actions runners, these aren't pre-installed, and `xcodebuild -downloadPlatform iOS` fails because the CoreSimulatorService daemon cannot be started without a display session.

**Key detail on storyboards:**
The project's `Main.storyboard` has `toolsVersion="14111"` (Xcode 9 era) and `LaunchScreen.storyboard` has `toolsVersion="17132"` (Xcode 11 era). These old versions do NOT trigger the iOS 18.x platform migration path in ibtool.

**How to apply:**
In `build-ios-ipa.yml`, `runs-on: macos-15`. "Select Xcode" step checks for `Xcode_26.0.app` then `Xcode_26.app` first; glob-excludes `Xcode_16*` in the fallback. No platform download step needed.
