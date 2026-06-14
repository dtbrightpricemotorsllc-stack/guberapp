---
name: Android CI pipeline setup
description: Lessons from getting the GitHub Actions Android AAB build working for GUBER
---

## Key facts

- `.github/` is explicitly gitignored (comment: "PAT lacks workflow scope"). Use GitHub Git Trees API (create blob → create tree → create commit → PATCH ref) to push workflow files without touching the local git index.
- PAT needs **both `repo` and `workflow` scopes** to write `.github/workflows/` files via the API. `repo` alone returns 404 silently.
- `attached_assets/` files referenced via `@assets/` imports in client code are NOT tracked in git. They must be uploaded (batch blob + tree API) or the Vite build fails with ENOENT.
- Keystore (`android-build-config/guber-release.jks`) is gitignored via `*.jks`. GitHub Actions secret `KEYSTORE_BASE64` holds the base64-encoded keystore. Add a "Decode keystore" step: `echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 --decode > android-build-config/guber-release.jks` before Gradle runs.
- GitHub Actions secrets already set: KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD.
- Successful build: run 27508589430, artifact `guber-v1.3-release.aab` (62MB).

**Why:** `.github/` was intentionally excluded when the old PAT only had `repo` scope; the untracked assets accumulated without being committed; keystores are never committed for security.

**How to apply:** For any future re-run or new release build, the workflow file is now on GitHub main. If assets are added locally and not committed, use the batch blob API pattern to push them before triggering a build.
