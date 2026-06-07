# GUBER Firebase Configuration Requirements

GUBER uses Firebase **only for Android push notifications via FCM**.
iOS uses APNs directly via `@parse/node-apn`. Web uses VAPID web-push.

---

## What Firebase is Used For

| Feature | Service | Notes |
|---------|---------|-------|
| Android push notifications | Firebase Cloud Messaging (FCM) | Via `firebase-admin` SDK |
| iOS push notifications | Apple APNs (direct) | NOT through Firebase — uses `@parse/node-apn` |
| Web push | VAPID (web-push library) | No Firebase needed |
| Analytics | Not used | — |
| Auth | Not used | GUBER uses its own session auth |
| Firestore | Not used | GUBER uses PostgreSQL |
| Storage | Not used | GUBER uses Cloudinary |

---

## Firebase Project Setup

### Step 1: Create Firebase project
1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it `guber-app` (or similar)
4. Disable Google Analytics (not used)
5. Click **Create project**

### Step 2: Add Android app
1. In your Firebase project → **Add app** → Android
2. **Android package name:** `com.guber.app`
3. Download `google-services.json`
4. Place it at `android/app/google-services.json` (this file is gitignored — store securely)

### Step 3: Generate Admin SDK service account
1. Firebase Console → Project Settings (gear icon) → **Service accounts** tab
2. Click **Generate new private key**
3. Download the JSON file
4. Set the entire JSON content as the `FIREBASE_SERVICE_ACCOUNT` environment variable:

```bash
# In Replit Secrets panel or .env:
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"guber-app","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-...@guber-app.iam.gserviceaccount.com",...}'
```

### Step 4: Enable FCM
Firebase Cloud Messaging is enabled by default in all Firebase projects.
No additional configuration needed.

---

## How Push Notifications Work in GUBER

```
server/push.ts: notify(userId, title, body, data?)
  │
  ├─→ Lookup push_tokens table for user's FCM tokens (Android)
  │   └─→ firebase-admin: messaging.sendEachForMulticast()
  │
  ├─→ Lookup push_tokens table for user's APNs tokens (iOS)
  │   └─→ @parse/node-apn: connection.send(notification, deviceToken)
  │
  └─→ Lookup push_subscriptions table for web endpoints (browser)
      └─→ web-push: sendNotification(subscription, payload)
```

### Device token registration

**Android / iOS native:**
```
Client: Capacitor PushNotifications plugin → registration event → device token
      → POST /api/push/register-token { token, platform: "android"|"ios" }
      → Stored in push_tokens table
```

**Web browser:**
```
Client: navigator.serviceWorker + PushManager.subscribe(VAPID key)
      → POST /api/push/subscribe { subscription: {...} }
      → Stored in push_subscriptions table
```

---

## APNs Setup (iOS — separate from Firebase)

APNs is configured independently of Firebase.

### Step 1: Create APNs key
1. Apple Developer Portal → **Certificates, Identifiers & Profiles**
2. Keys → **Create new key**
3. Enable **Apple Push Notifications service (APNs)**
4. Download the `.p8` file (only downloadable once — store securely!)
5. Note the **Key ID** and your **Team ID**

### Step 2: Set environment variables
```env
APNS_KEY_ID=XXXXXXXXXX           # 10-character key ID
APNS_TEAM_ID=XXXXXXXXXX          # 10-character Apple Team ID
APNS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGH...\n-----END PRIVATE KEY-----
APNS_BUNDLE_ID=com.guber.app
```

The `APNS_PRIVATE_KEY` should contain the full contents of the `.p8` file,
with literal `\n` for newlines (as stored in an env var).

### Step 3: Entitlements
`ios/App/App/App.entitlements` must contain:
```xml
<key>aps-environment</key>
<string>production</string>
```
This is already set. Do not add any other push-related entitlements.

---

## VAPID Setup (Web Push)

### Generate VAPID keys (one-time)
```bash
npx web-push generate-vapid-keys
# → Public Key: BNtq...
# → Private Key: xAb...
```

Set in environment:
```env
VAPID_PUBLIC_KEY=BNtq...
VAPID_PRIVATE_KEY=xAb...
VAPID_EMAIL=mailto:support@guberapp.app
```

The `VAPID_PUBLIC_KEY` is also served to clients via `GET /api/push/vapid-public-key`.

---

## Notification Types

| Event | Recipient | Channel |
|-------|-----------|---------|
| Job application received | Hirer | FCM / APNs / VAPID |
| Worker selected for job | Worker | FCM / APNs / VAPID |
| Job payment released | Worker | FCM / APNs / VAPID |
| New message received | Conversation partner | FCM / APNs / VAPID |
| Cash Drop nearby | Nearby users | FCM / APNs / VAPID |
| Stripe payout processed | Worker | FCM / APNs / VAPID |
| ID verification approved | User | FCM / APNs / VAPID |

---

## Troubleshooting Push Notifications

### Android not receiving
1. Check `FIREBASE_SERVICE_ACCOUNT` is valid JSON (not truncated)
2. Verify `google-services.json` is in `android/app/` and matches the Firebase project
3. Check FCM token is registered in `push_tokens` table for the user
4. Firebase Console → Cloud Messaging → Send test message to device token

### iOS not receiving
1. Check `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` are correct
2. Verify `aps-environment=production` in entitlements
3. iOS simulator does NOT support push notifications — test on a real device
4. Check `push_tokens` table for the user's APNs token

### Web not receiving
1. Check `VAPID_PUBLIC_KEY` matches what the client subscribed with
2. Service worker must be registered and active
3. Browser must grant notification permission
