# Reliability & Security Audit — May 2026

This document records the findings of the 8-item reliability/security batch
landed in May 2026. It covers what was changed, why, and what still needs
follow-up so the next maintainer doesn't need to re-derive the context.

## 1. Server-side geofence on movement milestones

| Endpoint                                  | Before                              | After                                                                                                                                  |
| ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/jobs/:id/milestone` (Arrived)  | Existing 5km block on `arrived`     | Unchanged (already strict)                                                                                                             |
| `POST /api/jobs/:id/submit-proof`         | Stored GPS, no validation           | **NEW**: 250m radius enforced when both job and helper have coords. Bypasses for `notEncountered` reports + jobs with no coordinates.  |
| `POST /api/workers/clock-in`              | Took no GPS, no audit               | **NEW**: requires `gpsLat`/`gpsLng`, validates range, persists location, audits with `worker_clock_in`.                                |
| `POST /api/workers/clock-out`             | No audit                            | **NEW**: audits `worker_clock_out` with optional GPS context.                                                                          |

Failure responses use stable error codes: `GPS_REQUIRED`, `GPS_INVALID`,
`TOO_FAR_FROM_JOB` so clients can render specific UX for each case.

Every blocked attempt writes to `auditLog` (`proof_geofence_blocked`) with
the helper's coords + the meters-from-job distance for admin investigation.

## 2. Native-aware GPS shim

`client/src/lib/gps.ts` now dynamically imports `@capacitor/geolocation` when
`Capacitor.isNativePlatform()` is true. The web path is unchanged. New
helpers:

- `gpsGetCurrentPosition(opts)` — uniform `GeolocationPosition` return
  shape on web *and* native (so existing call sites work unchanged).
- `gpsStartWatchPosition(success, error, opts)` — returns a numeric ID; on
  native this is a synthetic ID mapped to the plugin's string handle.
- `gpsClearWatch(id)` — cross-platform clear.

Permission prompts on native are handled via
`Geolocation.checkPermissions()` / `requestPermissions()` before any read,
so the user sees the iOS/Android system dialog rather than a silent denial.

`@capacitor-community/background-geolocation` is also installed for future
background tracking work — not yet wired up. See follow-up at the bottom.

## 3. Upload retries and progress (reference)

`client/src/lib/cloudinary-upload.ts` already implements 3-attempt retries
with exponential backoff, per-attempt timeout (60s), abort-signal support,
and granular progress callbacks. No further changes needed.

## 4. No silent GPS failures

Every UI surface that previously had `.catch(() => {})` (or
`(_, () => {}, ...)`) on a GPS read now surfaces an error toast and tells
the user the consequence ("workers without GPS can't appear on the map",
"the hirer needs an honest GPS breadcrumb", etc.).

| Path                                                       | Status                       |
| ---------------------------------------------------------- | ---------------------------- |
| `dashboard.tsx` clock-in                                   | Toast on failure              |
| `browse-jobs.tsx` clock-in (legacy `availabilityMutation`) | Toast on failure              |
| `job-detail.tsx` `fireHelperStartAction`                   | Toast (no silent fall-through) |
| `job-navigate.tsx` `handleOnMyWay`                         | Toast (no silent fall-through) |
| `handsfree-capture.tsx` initial GPS lock                   | Toast warning                  |
| `cash-drop-detail.tsx` `submitProofMutation`               | Throws → toast via mutation    |
| `cash-drops-list.tsx` distance sort                        | Already toasts via `setGpsError` |
| `observation-marketplace.tsx` `requestGps`                 | Toast on failure              |

## 5. Cloudinary signing hardening

`POST /api/upload-photo/sign`:

- requires `requireAuth`,
- per-user folder `guber-proof/u<userId>` (so a leaked signature can't be
  used to write into someone else's namespace),
- per-user rate limit (60 sigs / minute),
- `kind` body param ("image" | "video") drives the returned `resource_type`
  and `max_bytes` (15 MB / 200 MB respectively).

`client/src/lib/cloudinary-upload.ts` was updated to:

- forward `kind` to the sign endpoint,
- enforce `max_bytes` client-side before attempting the upload,
- use the server-returned `resource_type` to pick the right Cloudinary URL.

Cloudinary's signing model can't enforce a max byte size purely via the
signature (would require an upload preset). For full server enforcement we
should provision a signed Upload Preset with `max_file_size` set per kind —
captured as a follow-up.

## 6. Google Sign-In audit & fix

**Bug found**: `validAuds` for native sign-in was
`[webClientId, androidClientId]`. Native iOS sign-in tokens carry the
**iOS** OAuth client ID as their `aud` claim, so every iOS native sign-in
was being rejected with "tokeninfo aud mismatch".

**Fix**: added `iosClientId` to `NativeGoogleAuthDeps` and seeded it from
`process.env.GOOGLE_IOS_CLIENT_ID` in `routes.ts`.

**Operational TODO**: set `GOOGLE_IOS_CLIENT_ID` in deployment secrets
before next App Store build. Without it, iOS native sign-in continues to
fall back to the web flow.

Verification path is unchanged: Google's `tokeninfo` HTTP endpoint. Future
hardening could replace this with `google-auth-library` for a couple ms of
latency saving and offline JWKS caching, but the current path is correct
and resistant to forged tokens (Google verifies signature for us).

## 7. Push notification audit (closed-app delivery)

### iOS / APNs (`server/push.ts`)

Added three explicit headers/flags to every alert:

```ts
note.pushType = "alert";   // required for visible alerts on iOS 13+
note.priority = 10;         // immediate delivery
note.mutableContent = true; // allows future Notification Service Extension
```

Without `pushType: "alert"` APNs will reject visible-alert payloads on
recent iOS releases, which manifested as silent delivery failure when the
app was force-quit.

### Android / FCM

Already sends `android.priority = "high"` and a `notification` block, which
wakes the app from background/closed. No code change needed.

### Web Push

Uses VAPID; payloads include `title` + `body`. No closed-tab guarantee on
all browsers, but that's a browser-side limitation, not ours.

## 8. Store-build gating for digital purchases

Per `docs/payment-routing.md`, digital purchases must use Apple IAP /
Google Play Billing on store builds — Stripe is allowed only for real-world
services. Studio credits and subscriptions are digital goods.

Gated in this batch:

- `client/src/pages/studio.tsx` — credit pack `<div id="buy">` and tier
  subscription `<div id="upgrade">` are now `hidden={isStoreBuild}`.

Already gated previously (no change needed):

- `client/src/pages/ai-or-not.tsx` — Trust Box checkout.

Still un-gated (tracked in `docs/payment-routing.md`):

- `business_scout_plan` checkout.

## Follow-ups

1. Provision a Cloudinary Upload Preset with `max_file_size` per kind for
   full server-side enforcement.
2. Wire `@capacitor-community/background-geolocation` into worker
   "on-the-way" tracking so coords keep updating when the screen sleeps.
3. Set `GOOGLE_IOS_CLIENT_ID` in deployment secrets before next iOS
   release.
4. Replace `tokeninfo` HTTP verification with `google-auth-library` for
   marginal latency improvement.
5. Gate `business_scout_plan` checkout behind `isStoreBuild` before
   App Store / Play submission.
