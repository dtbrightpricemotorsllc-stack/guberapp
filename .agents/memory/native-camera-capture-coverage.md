---
name: Native camera capture coverage
description: Any surface requiring a live, camera-only photo on Capacitor iOS must call the native Camera plugin, not just <input capture="environment">.
---

Apple App Store rejected GUBER for "no photo options shown" when tapping a proof-photo button. Root cause: WKWebView does not reliably honor `<input type="file" capture="environment">` — it silently does nothing on real iOS devices even though it works in a normal mobile browser and in local dev.

**Why:** the only reliable way to force the live camera (not a gallery picker) inside a Capacitor WKWebView is to call `@capacitor/camera`'s `Camera.getPhoto({ source: CameraSource.Camera })` directly. Relying on the HTML `capture` attribute alone is not sufficient on native builds, and this bug is easy to reintroduce because it works fine everywhere except a real device.

**How to apply:** any new "take a live proof/verification photo" UI must use the shared `triggerLiveCameraCapture()` helper in `client/src/lib/native-camera-capture.ts` (native Camera.getPhoto → falls back to file input on web/non-cancel errors), not a bare file input. When auditing for this class of bug, grep for `capture="environment"` across the whole client — a fix applied to one screen does not imply other screens using the same raw pattern are safe.
