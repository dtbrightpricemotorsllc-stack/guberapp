# Play Store Data Safety — GUBER

Complete this in Play Console → App content → Data safety before submitting for review.

---

## Does your app collect or share any of the required user data types?

**Yes**

---

## Data types collected and their purposes

### Location

| Type | Collected | Shared | Required or optional | Purpose |
|---|---|---|---|---|
| Approximate location | Yes | No | Optional | Nearby job search, job alert matching |
| Precise location | Yes | Yes (with job poster/hirer during active job) | Required for active jobs | Live job navigation, worker–hirer proximity verification, asset transport tracking |

**Background location:**
- Collected: **Yes**
- When: Only during an active job session (transport, asset protection). Collection starts when the worker explicitly taps "I'm On My Way" or accepts an active transport load. Collection stops immediately when the job is marked complete, cancelled, or the worker manually stops sharing.
- Purpose: Real-time location sharing with the hirer/customer for job progress verification and safety.
- Is it encrypted in transit: **Yes** (HTTPS/TLS)
- Is it deleted after use: **Yes** — location pings are retained per job session for dispute resolution and automatically purged per retention policy.

---

### Personal info

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Name | Yes | Yes (with job counterpart after hire) | Profile, job matching |
| Email address | Yes | No | Account authentication, notifications |
| Phone number | Yes | Yes (with job counterpart after hire) | Job coordination |
| User IDs (GUBER ID) | Yes | Yes (public profile) | Identity, trust score |
| Profile photo | Yes | Yes (public profile) | Identity verification |

---

### Financial info

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Purchase history | Yes | No (Stripe processes; GUBER stores job payment records) | Payment history, dispute resolution |
| Payment info | No — processed by Stripe | — | Payments handled by Stripe, not stored by GUBER |

---

### Photos and videos

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Photos | Yes | Yes (with job counterpart for V&I jobs) | Verify & Inspect job documentation, profile photo |
| Videos | Yes | Yes (with job counterpart for V&I jobs) | Verify & Inspect job documentation |

---

### Audio

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Voice or sound recordings | No (microphone permission present for V&I video capture only) | — | V&I video jobs |

---

### Device or other IDs

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Device or other IDs (FCM token) | Yes | No | Push notification delivery |

---

### App activity

| Type | Collected | Shared | Purpose |
|---|---|---|---|
| App interactions | Yes | No | Analytics, fraud detection |
| In-app search history | No | — | — |
| Installed apps | No | — | — |

---

## Is all of the user data collected by your app encrypted in transit?

**Yes** — all data is transmitted over HTTPS/TLS.

---

## Do you provide a way for users to request that their data is deleted?

**Yes** — users can delete their account from Account Settings → Delete Account. Account deletion anonymizes all personal data. Location history and job records are retained for legal/fraud purposes per the Privacy Policy retention schedule.

---

## Privacy Policy URL

https://guberapp.app/privacy

---

## Background location disclosure (required by Play Store policy)

GUBER displays a prominent in-app disclosure before requesting background location:

> *"GUBER needs to track your location while the app is in the background so hirers receive live updates during your active job. Tracking stops automatically when the job ends."*

The disclosure appears at the moment the worker taps "I'm On My Way" (regular jobs) or opens an active transport load (Load Board jobs). It is never shown at signup or during onboarding. The user may tap "Not now" to proceed with foreground-only tracking.

---

## Notes for reviewer

- Background location is used **only** during an active job. No passive background collection occurs.
- The foreground service notification ("GUBER — task in progress") is visible for the entire duration of background tracking.
- Workers can manually stop location sharing at any time via the "Stop sharing my location" control on the job navigation screen.
- Location data is not sold or used for advertising.
