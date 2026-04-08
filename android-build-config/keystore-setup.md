# Android Keystore Setup — One-Time Steps

This is a one-time setup. Once done, every GitHub Actions run will produce a signed, upload-ready AAB.

---

## Step 1 — Generate a release keystore (run this on your local machine)

You need Java installed. On macOS with Homebrew: `brew install openjdk`

```bash
keytool -genkey -v \
  -keystore guber-release.jks \
  -alias guber \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

When prompted:
- **Keystore password** — choose a strong password, save it (this is KEYSTORE_PASSWORD)
- **Key password** — can be the same as keystore password (this is KEY_PASSWORD)
- **Key alias** — type `guber` (this is KEY_ALIAS)
- **First/Last name, Org, City, State, Country** — fill in as appropriate for GUBER

This creates `guber-release.jks` in your current directory.

> IMPORTANT: Keep this file safe. If you lose it, you can never update your app on Google Play.
> Store a backup in a secure password manager (1Password, Bitwarden, etc.).

---

## Step 2 — Convert keystore to base64

```bash
# macOS / Linux
base64 -i guber-release.jks | tr -d '\n' > guber-release.b64

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("guber-release.jks")) | Out-File -NoNewline guber-release.b64
```

Copy the entire contents of `guber-release.b64` — this is your KEYSTORE_BASE64 value.

---

## Step 3 — Add 4 GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name        | Value                              |
|--------------------|------------------------------------|
| `KEYSTORE_BASE64`  | Contents of `guber-release.b64`   |
| `KEYSTORE_PASSWORD`| The keystore password you chose    |
| `KEY_ALIAS`        | `guber`                            |
| `KEY_PASSWORD`     | The key password you chose         |

---

## Step 4 — Run the workflow

Go to your GitHub repo → **Actions → Build Android AAB → Run workflow** (or push to `main`).

When it finishes (~10-15 minutes), click the workflow run → scroll to **Artifacts** → download `guber-release-N.zip`.
Unzip it — inside is `app-release-signed.aab`.

---

## Step 5 — Upload to Google Play

1. Go to [Google Play Console](https://play.google.com/console)
2. Create your app if you haven't already (app package: `com.guber.app`)
3. Go to **Production → Create new release**
4. Upload the `.aab` file
5. Fill in release notes and submit for review

---

## Troubleshooting

**Build fails at `npx cap add android`** — Make sure `@capacitor/cli` is listed in `package.json` dependencies and `npm ci` runs successfully before this step.

**Signing step fails** — Double-check that all 4 secrets are set correctly with no leading/trailing whitespace.

**Gradle build fails** — The `ubuntu-latest` runner includes Android SDK 34. If Capacitor requires a different SDK level, add a step to install it via `sdkmanager`.
