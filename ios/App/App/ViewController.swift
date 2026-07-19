import UIKit
import WebKit
import Capacitor

/**
 * Custom bridge view controller.
 *
 * Implements two WKWebView delegates:
 *
 * 1. WKUIDelegate — grants microphone/camera access inside the WebView.
 *    WKWebView does NOT support `getUserMedia()` out of the box. Since iOS 15,
 *    Apple requires the host app to implement
 *    `webView(_:requestMediaCapturePermissionFor:...)` and explicitly grant the
 *    request — otherwise every `getUserMedia()` call silently rejects with
 *    NotAllowedError even when the OS-level permission is granted.
 *
 * 2. WKNavigationDelegate — handles load failures with a visible retry screen.
 *    When the remote server.url (https://guberapp.app) fails to load at cold
 *    start (network hiccup, DNS delay, brief server restart), Capacitor's
 *    default behaviour is a completely blank black screen with no feedback and
 *    no way to retry. This delegate catches provisional and committed navigation
 *    errors and shows a native retry overlay so the user can tap to reload
 *    instead of thinking the app is broken.
 */
class ViewController: CAPBridgeViewController, WKUIDelegate, WKNavigationDelegate {

    // Retry overlay — created once, shown/hidden as needed.
    private var retryView: UIView?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        self.webView?.uiDelegate = self
        self.webView?.navigationDelegate = self
    }

    // MARK: - WKUIDelegate (media permissions)

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    // MARK: - WKNavigationDelegate (load-failure retry)

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideRetryView()
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        // Ignore "cancelled" — fired when a redirect replaces the provisional load.
        let nsErr = error as NSError
        guard nsErr.code != NSURLErrorCancelled else { return }
        showRetryView(in: webView)
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        let nsErr = error as NSError
        guard nsErr.code != NSURLErrorCancelled else { return }
        showRetryView(in: webView)
    }

    // MARK: - Retry UI

    private func showRetryView(in webView: WKWebView) {
        guard retryView == nil else { return }

        let overlay = UIView(frame: webView.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor(red: 0.02, green: 0, blue: 0.03, alpha: 1) // matches app dark bg

        // GUBER wordmark / status label
        let label = UILabel()
        label.text = "GUBER"
        label.font = UIFont.systemFont(ofSize: 28, weight: .black)
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false

        let sub = UILabel()
        sub.text = "Tap to reconnect"
        sub.font = UIFont.systemFont(ofSize: 14, weight: .regular)
        sub.textColor = UIColor.white.withAlphaComponent(0.5)
        sub.translatesAutoresizingMaskIntoConstraints = false

        let btn = UIButton(type: .system)
        btn.setTitle("Retry", for: .normal)
        btn.setTitleColor(.black, for: .normal)
        btn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        btn.backgroundColor = UIColor(red: 0, green: 0.9, blue: 0.44, alpha: 1) // GUBER green
        btn.layer.cornerRadius = 14
        btn.contentEdgeInsets = UIEdgeInsets(top: 14, left: 40, bottom: 14, right: 40)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        overlay.addSubview(label)
        overlay.addSubview(sub)
        overlay.addSubview(btn)

        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: overlay.centerYAnchor, constant: -40),
            sub.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            sub.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 8),
            btn.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            btn.topAnchor.constraint(equalTo: sub.bottomAnchor, constant: 32),
        ])

        webView.addSubview(overlay)
        retryView = overlay
    }

    private func hideRetryView() {
        retryView?.removeFromSuperview()
        retryView = nil
    }

    @objc private func retryLoad() {
        hideRetryView()
        webView?.reload()
    }
}
