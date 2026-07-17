import UIKit
import WebKit
import Capacitor

/**
 * Custom bridge view controller — required for microphone (and camera) access
 * to work inside the native WKWebView.
 *
 * WKWebView does NOT support `getUserMedia()` out of the box. Since iOS 15,
 * Apple requires the host app to implement
 * `WKUIDelegate.webView(_:requestMediaCapturePermissionFor:...)` and
 * explicitly grant the request — otherwise every `getUserMedia()` call from
 * JS silently rejects with NotAllowedError, even when the user has already
 * granted the app's OS-level microphone permission (Settings → GUBER →
 * Microphone → ON). This is exactly why native (Capacitor) reported
 * "Microphone is blocked" while the PWA (Safari, which handles this natively)
 * worked fine — Safari doesn't need this delegate, WKWebView does.
 *
 * Default Capacitor project scaffolding does not set a `uiDelegate` on the
 * bridge's WKWebView, so this was previously entirely unhandled.
 */
class ViewController: CAPBridgeViewController, WKUIDelegate {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        self.webView?.uiDelegate = self
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        // The OS-level microphone permission prompt/gate (Info.plist
        // NSMicrophoneUsageDescription + system Settings toggle) is still the
        // real source of truth. This delegate just tells WKWebView it's
        // allowed to proceed to that check instead of auto-denying.
        decisionHandler(.grant)
    }
}
