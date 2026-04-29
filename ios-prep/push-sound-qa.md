# GUBER iOS Push Sound — Manual QA Script

This document is the definitive checklist for verifying that custom push-notification
sounds play correctly on a real iOS device after Task #336 bundled the WAV files into
the Xcode project.

No simulator or automated test can exercise this path because APNs sound playback
requires a physical device with the app backgrounded or terminated.

---

## Sound File Reference

| Notification type | WAV file | Trigger scenario |
|---|---|---|
| `offer_funded` | `guber_money.wav` | Poster's offer is successfully funded |
| `cash_drop` (live) | `guber_money.wav` | A cash drop goes live near the user |
| `job` | `guber_action.wav` | New job posted nearby / reminder push |
| `nearby` (default) | `guber_default.wav` | Any notification type not listed above |
| `closed` / `offer_payment_failed` | `guber_closed.wav` | Payment fails on a funded offer; or cash drop claimed by someone else |

All four required WAV files must exist in the Xcode project under `ios/App/App/`
(note: `offer_funded` and `cash_drop` share the same file):
- `guber_money.wav`
- `guber_action.wav`
- `guber_default.wav`
- `guber_closed.wav`

---

## Code Audit Verification (completed — no device required)

The following server-side checks were performed by code inspection before physical
device testing. These confirm the push payload and sound mapping are wired correctly;
the device tests below confirm the WAV files actually play on real hardware.

### `getSoundForNotificationType()` mapping — `server/routes.ts` lines 57–71

| Notification type | `type` string passed | WAV returned | Verified |
|---|---|---|---|
| Offer funded | `offer_funded` | `guber_money.wav` | PASS |
| Job posted / reminder | `job` | `guber_action.wav` | PASS |
| Cash drop live | `cash_drop` | `guber_money.wav` | PASS |
| Nearby / default | _(any unmatched string)_ | `guber_default.wav` | PASS |
| Payment failed / closed | `offer_payment_failed` | `guber_closed.wav` | PASS |

### Push payload — `server/push.ts` line 57

- `sound` field is present in every `sendPushToUser` call.
- Falls back to `"guber_default.wav"` when no sound is specified.
- **Verified: PASS**

### Explicit sound overrides — `server/routes.ts`

- Cash drop live (line 301, 321): `sound: "guber_money.wav"` — **PASS**
- Cash drop claimed / closed (line 343): `sound: "guber_closed.wav"` — **PASS**
- Job reminder (line 4686): `sound: "guber_action.wav"` — **PASS**

### WAV files in Xcode bundle

The files are expected at `ios/App/App/*.wav`. Before running device tests, confirm
each file is present in Xcode under **Build Phases → Copy Bundle Resources**.

---

## Prerequisites

Before starting the test session, confirm all of the following:

- [ ] Testing on a **physical iOS device** (iPhone or iPad) — simulator cannot play APNs sounds
- [ ] The GUBER app is installed from Xcode (dev build) or TestFlight
- [ ] The test user account has **push notification permission granted** (Settings → GUBER → Notifications → Allow Notifications = ON)
- [ ] The device **ringer/silent switch is ON** (not muted) and volume is turned up
- [ ] A second account with **admin role** is available to trigger events (or use the curl commands below)
- [ ] The device has an active internet connection
- [ ] The test user's push subscription is registered — open the app once, then background/close it

---

## Device Setup

1. Log in to the test user account in the GUBER app.
2. Enable push notifications when prompted, or go to **Settings → GUBER → Notifications** and enable them.
3. Background the app (swipe up from the home bar) — **do not force-quit yet unless specified**.
4. Keep the device unlocked on the home screen or lock screen; both states should work.

---

## Test 1 — `offer_funded` → `guber_money.wav`

**Trigger:** An offer attached to an existing job is funded via Stripe — or via the admin test push panel.

### Steps (Option A — admin test push panel, fastest)

1. Open the admin panel (`/admin`) and go to the **Broadcast** tab.
2. Scroll to the **Send Test Push (QA)** section.
3. Enter the test user's User ID. Set **Notification Type** to **`offer_funded`**.
4. Click **Send Test Push**. The toast will confirm `sound: guber_money.wav`.

### Steps (Option B — real transaction)

1. On the admin account (separate device or browser), post a new job as the test user or use an existing job the test user created.
2. As an admin (or via a second user), submit an offer on that job.
3. The test user (poster) funds the offer by completing Stripe checkout.
4. Alternatively, trigger via the admin panel: locate the job → approve and fund the offer manually.

### Expected result

- The test device receives a push notification with the title **"Offer Funded"** (or similar).
- The sound played is the **money chime** (`guber_money.wav`).

### Result

| | |
|---|---|
| Sound heard | ________________ |
| Correct sound? | Pass / Fail |
| Notes | |

---

## Test 2 — `job` → `guber_action.wav`

**Trigger:** A new job is posted in the test user's area, or a job-status reminder fires.

### Steps (Option A — post a new job)

1. Using the admin account or a second browser session, post a new job with a zip code near the test user's registered location.
2. Confirm the test user has **job notifications enabled** in their GUBER notification settings.
3. The test device should receive a push within seconds of the job being posted.

### Steps (Option B — admin test push panel)

1. Open the admin panel (`/admin`) and go to the **Broadcast** tab.
2. Scroll down to the **Send Test Push (QA)** section.
3. Enter the test user's numeric User ID in the "Target User ID" field.
4. Set the **Notification Type** dropdown to **`job`**.
5. Click **Send Test Push**.
6. A toast will confirm delivery and show the sound file used (`guber_action.wav`).

### Steps (Option C — curl)

```bash
curl -X POST https://<your-server>/api/admin/test-push \
  -H "Content-Type: application/json" \
  -b "connect.sid=<admin-session-cookie>" \
  -d '{"userId":<target-user-id>,"type":"job"}'
```

### Expected result

- Push notification arrives on the test device.
- Sound played is the **action tone** (`guber_action.wav`).

### Result

| | |
|---|---|
| Sound heard | ________________ |
| Correct sound? | Pass / Fail |
| Notes | |

---

## Test 3 — `cash_drop` (live) → `guber_money.wav`

**Trigger:** Admin activates a cash drop that goes live — or via the admin test push panel.

### Steps (Option A — admin test push panel, fastest)

1. Open the admin panel (`/admin`) and go to the **Broadcast** tab.
2. Scroll to the **Send Test Push (QA)** section.
3. Enter the test user's User ID. Set **Notification Type** to **`cash_drop`**.
4. Click **Send Test Push**. The toast will confirm `sound: guber_money.wav`.

### Steps (Option B — real cash drop)

1. Log in to the **admin panel** (`/admin`) as an admin user in a browser.
2. Create a new Cash Drop with status set to **Live** (or activate an existing draft drop).
3. Make sure the test user has **Cash Drop notifications enabled** (Settings → Notifications → Cash Drops) and is either a Day-1 OG user or is geographically within the drop's radius.
4. Background or close the GUBER app on the test device.
5. Activate the Cash Drop from the admin panel.

### Expected result

- Push notification arrives: **"Cash Drop is LIVE!"**
- Sound played is the **money chime** (`guber_money.wav`).
- This is the same WAV as Test 1 — confirm it sounds identical.

### Result

| | |
|---|---|
| Sound heard | ________________ |
| Correct sound? | Pass / Fail |
| Notes | |

---

## Test 4 — `nearby` (default) → `guber_default.wav`

**Trigger:** Any notification type that does not match a specific sound mapping — e.g. a `nearby` alert.

### Steps (Option A — admin test push panel, fastest)

1. Open the admin panel (`/admin`) and go to the **Broadcast** tab.
2. Scroll to the **Send Test Push (QA)** section.
3. Enter the test user's User ID. Set **Notification Type** to **`nearby`**.
4. Click **Send Test Push**. The toast will confirm `sound: guber_default.wav`.

### Steps (Option B — curl)

```bash
curl -X POST https://<your-server>/api/admin/test-push \
  -H "Content-Type: application/json" \
  -b "connect.sid=<admin-session-cookie>" \
  -d '{"userId":<target-user-id>,"type":"nearby"}'
```

3. Confirm the test device receives the push with the app closed.

### Expected result

- Push notification arrives on the test device.
- Sound played is the **default notification tone** (`guber_default.wav`).

### Result

| | |
|---|---|
| Sound heard | ________________ |
| Correct sound? | Pass / Fail |
| Notes | |

---

## Test 5 — `closed` / `offer_payment_failed` → `guber_closed.wav`

**Trigger:** A funded offer's payment fails, **or** a cash drop the test user entered is
claimed by someone else (the "closed" path) — or via the admin test push panel.

### Steps (Option A — admin test push panel, fastest)

1. Open the admin panel (`/admin`) and go to the **Broadcast** tab.
2. Scroll to the **Send Test Push (QA)** section.
3. Enter the test user's User ID. Set **Notification Type** to **`closed`**.
4. Click **Send Test Push**. The toast will confirm `sound: guber_closed.wav`.

### Steps (Option B — cash drop claimed by another user)

1. Create a Cash Drop via the admin panel and activate it.
2. Have the test user submit an entry for the cash drop.
3. Using a **different** user account, also submit and win the cash drop (or mark it as
   won via the admin panel).
4. The test user (non-winner) will receive a "Cash Drop Has Been Claimed" notification.

### Steps (Option C — offer payment failure)

1. Use a test Stripe card that is set to fail (e.g. card number `4000000000000002`)
   during the offer-funding checkout step.
2. The system sends an `offer_payment_failed` push to the poster.

### Expected result

- Push notification arrives: **"Cash Drop Has Been Claimed"** or **"Payment Failed"**.
- Sound played is the **closed/alert tone** (`guber_closed.wav`).

### Result

| | |
|---|---|
| Sound heard | ________________ |
| Correct sound? | Pass / Fail |
| Notes | |

---

## Summary Results Table

Fill this in once all five tests are complete and attach it to the task ticket.

| # | Notification type | Expected WAV | Sound played | Pass / Fail |
|---|---|---|---|---|
| 1 | `offer_funded` | `guber_money.wav` | | |
| 2 | `job` | `guber_action.wav` | | |
| 3 | `cash_drop` (live) | `guber_money.wav` | | |
| 4 | `nearby` (default) | `guber_default.wav` | | |
| 5 | `closed` / `offer_payment_failed` | `guber_closed.wav` | | |

**Tester name:** ____________________________

**Device model & iOS version:** ____________________________

**App version / build number:** ____________________________

**Test date:** ____________________________

---

## Failure Triage

If a sound does **not** play (device plays the system default instead):

1. Confirm the WAV file exists in the Xcode project: `ios/App/App/<filename>.wav`
2. Confirm the file is listed in **Build Phases → Copy Bundle Resources** in Xcode.
3. Confirm the push payload includes `"sound": "<filename>.wav"` — check the server log
   line `[push] send ...` or add temporary logging in `server/push.ts`.
4. Confirm the device ringer switch is ON and volume > 0.
5. Re-install the app from Xcode (not TestFlight) to pick up any bundle changes, then re-test.

If a **wrong** sound plays:

1. Check `getSoundForNotificationType()` in `server/routes.ts` (lines 57–71) to confirm
   the notification `type` string maps to the expected WAV.
2. Confirm the notification event is calling `notify()` with the correct `type` field.
