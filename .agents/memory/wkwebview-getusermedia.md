---
name: WKWebView requires a WKUIDelegate to unlock getUserMedia
description: Why native iOS mic can be "blocked" while PWA/Safari mic works fine on the same app
---

On iOS, `WKWebView` (used by Capacitor) does NOT support `getUserMedia()` by
default. Since iOS 15, Apple requires the hosting app to implement
`WKUIDelegate.webView(_:requestMediaCapturePermissionFor:initiatedByFrame:type:decisionHandler:)`
and call `decisionHandler(.grant)` — otherwise every mic/camera request from
JS silently rejects with `NotAllowedError`, even with
`NSMicrophoneUsageDescription` set and OS-level mic permission already
granted in Settings.

**Why:** Safari (PWA) handles `getUserMedia` natively and doesn't need this
delegate, so it's easy to assume the web code is correct and only the native
shell/permissions are broken. The real gap is almost always a missing
`WKUIDelegate` on the bridge's `WKWebView`, not the JS mic capture logic
itself.

**How to apply:** In Capacitor iOS projects, check whether the storyboard's
view controller is a plain `CAPBridgeViewController` — if so, a custom
`ViewController: CAPBridgeViewController, WKUIDelegate` subclass must be
created (setting `self.webView?.uiDelegate = self` in `capacitorDidLoad()`)
and wired into the storyboard's `customClass`. Android's equivalent is a
`WebChromeClient.onPermissionRequest` override in `MainActivity` — check that
exists too before assuming a mic bug is JS-side.
