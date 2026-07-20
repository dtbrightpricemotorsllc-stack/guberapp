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

    private var retryView: UIView?
    private var loadTimeoutTimer: Timer?
    private static let loadTimeoutSeconds: TimeInterval = 12.0

    // App dark background — same colour used throughout the web app and retry overlay.
    private let appDark = UIColor(red: 0.02, green: 0, blue: 0.03, alpha: 1)

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        self.webView?.uiDelegate = self
        self.webView?.navigationDelegate = self

        // Set a dark background on the WKWebView *before* the remote page loads.
        // Without this, Capacitor's WKWebView is transparent during the network
        // round-trip, so dark-mode iPhones show the black system background
        // through it — causing the "instant black screen" symptom.
        webView?.isOpaque = false
        webView?.backgroundColor = appDark
        webView?.scrollView.backgroundColor = appDark
        view.backgroundColor = appDark

        // Safety net: if the page hasn't finished loading within 12 s, show
        // the retry screen rather than leaving the user with a blank screen.
        scheduleLoadTimeout()
    }

    // MARK: - Load timeout

    private func scheduleLoadTimeout() {
        loadTimeoutTimer?.invalidate()
        loadTimeoutTimer = Timer.scheduledTimer(
            withTimeInterval: ViewController.loadTimeoutSeconds,
            repeats: false
        ) { [weak self] _ in
            guard let self = self,
                  let wv = self.webView,
                  !wv.isLoading,
                  wv.url == nil else { return }
            self.showRetryView()
        }
    }

    private func cancelLoadTimeout() {
        loadTimeoutTimer?.invalidate()
        loadTimeoutTimer = nil
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
        cancelLoadTimeout()
        hideRetryView()
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let nsErr = error as NSError
        if nsErr.code == NSURLErrorCancelled {
            // NSURLErrorCancelled (-999) fires when Capacitor's internal bridge
            // intercepts the provisional navigation and replaces it — this is
            // normal Capacitor behaviour during startup. Wait 2 s; if the
            // webview still has no URL and isn't loading by then, the load
            // genuinely failed and we surface the retry screen.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                guard let self = self, let wv = self.webView else { return }
                if wv.url == nil && !wv.isLoading {
                    self.cancelLoadTimeout()
                    self.showRetryView()
                }
            }
            return
        }
        cancelLoadTimeout()
        showRetryView()
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        let nsErr = error as NSError
        guard nsErr.code != NSURLErrorCancelled else { return }
        cancelLoadTimeout()
        showRetryView()
    }

    // MARK: - Retry UI

    private func showRetryView() {
        guard retryView == nil else { return }

        // Anchor to self.view (full screen) not webView — webView.bounds can
        // be .zero when didFailProvisionalNavigation fires on cold start, which
        // causes autoresizingMask-based layout to silently produce a zero-sized
        // overlay and the user never sees the retry controls.
        let overlay = UIView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = appDark

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
        btn.backgroundColor = UIColor(red: 0, green: 0.9, blue: 0.44, alpha: 1)
        btn.layer.cornerRadius = 14
        btn.contentEdgeInsets = UIEdgeInsets(top: 14, left: 40, bottom: 14, right: 40)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        overlay.addSubview(label)
        overlay.addSubview(sub)
        overlay.addSubview(btn)
        view.addSubview(overlay)

        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: overlay.centerYAnchor, constant: -40),
            sub.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            sub.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 8),
            btn.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            btn.topAnchor.constraint(equalTo: sub.bottomAnchor, constant: 32),
        ])

        retryView = overlay
    }

    private func hideRetryView() {
        retryView?.removeFromSuperview()
        retryView = nil
    }

    @objc private func retryLoad() {
        hideRetryView()
        scheduleLoadTimeout()
        // Explicitly reload the server URL rather than webView.reload() which
        // would re-request an empty page if the initial load never completed.
        if let url = URL(string: "https://guberapp.app") {
            webView?.load(URLRequest(url: url))
        } else {
            webView?.reload()
        }
    }
}
