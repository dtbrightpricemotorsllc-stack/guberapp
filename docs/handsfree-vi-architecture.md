# Hands-Free Verify & Inspect — Architecture (Task #454)

## Goal
Continuous point-of-view (POV) video evidence for V&I jobs, captured from a wearable or hands-free position, with GUBER as the system of record. Vendor-neutral: GUBER never names a specific glasses/camera brand in product copy.

## Three capture paths

### 1. Phone-as-Glasses (PWA recorder) — MVP, ships today
- Worker mounts phone in a chest harness or pocket clip with back camera forward.
- `client/src/components/handsfree-capture.tsx` opens `getUserMedia({video:{facingMode:'environment'},audio:true})`, records via `MediaRecorder`, holds a screen `wakeLock`, captures GPS at start, auto-stops at 15 minutes.
- Uploads directly to Cloudinary via the existing signed-upload route, then POSTs `{token, videoUrl, captureMeta}` to `/api/proof/wearable-upload`.
- Token issued by `GET /api/jobs/:id/wearable-upload-token` (HMAC-SHA256, 15-min TTL, payload `{jobId, helperId, exp, nonce}`). Verified server-side in `server/wearable-token.ts`.
- Pros: zero hardware cost, available on every modern phone. Cons: heavier than glasses, no eye-line framing.

### 2. Paired Capacitor device import — live (Tasks #457 Android, #460 iOS)
- Worker pairs a wearable camera (any vendor) over Bluetooth, local Wi-Fi, AirDrop, or USB using the **native** Capacitor app.
- The Android and iOS shells both render an "Import Clip" button in `client/src/components/handsfree-capture.tsx` next to "Phone POV".
  - **Android:** `<input type="file" accept="video/*" capture="environment">` — the WebView opens a chooser for the wearable's gallery folder or the system camera as a fallback.
  - **iOS:** `<input type="file" accept="video/*">` (no `capture` attribute) — WKWebView opens the iOS sheet with "Photo Library", "Take Video", and "Choose File" so the worker picks a clip the wearable already deposited via AirDrop, USB import, or the vendor's companion app. We deliberately do **not** force `capture="environment"` on iOS because that would hide the Photos picker.
- Both platforms upload through the same `/api/proof/wearable-upload` flow with `captureMeta.deviceKind = "paired-android"` or `"paired-ios"`. Basic file metadata (`fileName`, `fileType`, `fileSizeBytes`, `fileLastModified`) is added to `captureMeta`; `captureStartedAt` is anchored to the file's `lastModified` timestamp so reviewers see when the clip was actually shot, not when it was imported.
- Gating: `isNativeApp && (isAndroid || isIOS)` from `client/src/lib/platform.ts`. The web build shows a disabled "Import in app" button plus the hint "Importing a clip from a paired wearable is available in the GUBER mobile app." Phone POV recording remains available on every platform.
- Pros: vendor-neutral; works with any wearable that can drop MP4 onto the phone (gallery folder on Android, Photos library/Files on iOS). Cons: manual file-pick step; on iOS the worker is responsible for getting the clip into Photos or Files first (most action-camera companion apps already do this automatically).

### 3. Documented direct-API contract — for partners
Any wearable or PWA that can hit the contract may submit POV proof:

```
POST /api/proof/wearable-upload
Content-Type: application/json
Body:
  {
    "token":     "<HMAC token from /api/jobs/:id/wearable-upload-token>",
    "videoUrl":  "https://res.cloudinary.com/.../video.mp4",
    "captureMeta": {
      "deviceKind":      "direct-api",
      "deviceModel":     "<vendor model string>",
      "captureStartedAt":"2026-05-07T12:00:00Z",
      "captureEndedAt":  "2026-05-07T12:04:30Z",
      "gpsAtStart":      { "lat": 0, "lng": 0, "accuracy": 0 },
      "consentVersion":  1
    }
  }
Response: 200 { id, jobId, videoUrl }
```

The token is bound to one `jobId` + `helperId` + 15-minute window. Reuse / replay across jobs is rejected. The video must already be uploaded to a public URL (Cloudinary, S3, or partner CDN). GUBER does not store raw glasses-vendor recordings.

## Data model
- `proof_submissions.capture_meta jsonb` (nullable) — set by the wearable path; the legacy photo flow leaves it null.
- `platform_settings` row `handsfree_capture_enabled` (`true`/`false`) — admin kill-switch. The button is hidden client-side and the route returns 403 server-side when off.

## Trust / abuse model
- One token per job per helper at a time (token TTL 15 min, no revocation list — TTL is the limit).
- Server enforces `helperId === session.userId` and `job.assignedHelperId === helperId`.
- Audit log entry `handsfree_proof_uploaded` written with `{jobId, deviceKind, deviceModel, durationSec}` for every submission.
- Reviewer sees a "POV · Hands-Free" badge on the proof card whenever `captureMeta.deviceKind` is set, so the hirer knows the evidence is continuous video, not curated stills.

## Autoscale safety
- All capture state lives client-side. The server adds zero in-process timers and no background jobs.
- Token signing is stateless HMAC; no DB writes until the upload arrives.
- Cloudinary handles the heavy upload; our request body stays under the 10 MB Express limit.

## What's deferred to follow-ups
- AI summarization of the POV clip (extract checklist hits → studio-style scene cards).
- Real-time live-streaming (WebRTC) so a hirer can watch the helper work.
- Native vendor SDKs once a single wearable becomes the dominant V&I device. Until then we stay vendor-neutral.
- 2026 EU/US biometric capture laws may require explicit on-device consent UX changes; the `consentVersion` field in `captureMeta` makes that easy to bump without a migration.
