---
name: iOS TestFlight uploads need a unique build number every time
description: App Store Connect treats a re-uploaded IPA with the same version+build as a duplicate and silently keeps the old build visible — CI must bump CURRENT_PROJECT_VERSION on every run.
---

`CURRENT_PROJECT_VERSION` (the iOS "build number", distinct from
`MARKETING_VERSION`) was hardcoded to `1` in `project.pbxproj` and never
bumped by the GitHub Actions workflow. Re-running the same iOS build
workflow multiple times (e.g. while fixing unrelated CI failures) uploads
IPAs that are all version 1.0.0 build 1 — App Store Connect accepts the
`altool --upload-app` call (no error surfaced in CI logs) but treats it as a
duplicate of whatever build already exists at that version+build, so App
Store Connect keeps showing the old/previously-rejected build number and the
new fixes never actually appear as a new selectable build.

**Why:** Apple's TestFlight/App Store Connect build identity key is
(version, build number) — not file hash or upload timestamp. CI logs and the
`Upload to TestFlight` step both report success even when the build is a
no-op duplicate, so this failure mode is invisible unless you specifically
check the build number shown in App Store Connect against what you expect.

**How to apply:** Any iOS CI workflow that uploads to TestFlight must
compute a fresh, monotonically increasing build number every run (e.g. from
`github.run_number`) and pass it as an `xcodebuild archive` build-setting
override (`CURRENT_PROJECT_VERSION=$BUILD_NUMBER`) rather than relying on a
static value baked into `project.pbxproj`. After any resubmission, confirm
in App Store Connect that the *build number actually changed* before
telling the user it's safe to submit for review — don't just trust "green"
CI.
