---
name: Capacitor WKWebView black screen
description: Three ViewController.swift bugs that combine to produce an instant black screen when the app launches on iOS with server.url set.
---

## The three bugs

**1. Transparent WKWebView during loading**
Capacitor's WKWebView is transparent (`isOpaque = false`, `backgroundColor = .clear`) by default.
While the remote `server.url` is loading over the network, the underlying ViewController view shows through.
In dark mode, that underlying view is black → user sees a black screen.

**Fix:** In `capacitorDidLoad()`, set `webView?.backgroundColor = appDark` and `webView?.scrollView.backgroundColor = appDark` and `view.backgroundColor = appDark` before the page loads.

**2. NSURLErrorCancelled (-999) swallows the error silently**
When Capacitor's internal bridge intercepts the provisional navigation (during startup), it fires `didFailProvisionalNavigation` with `NSURLErrorCancelled`. The original guard `guard nsErr.code != NSURLErrorCancelled else { return }` returned early without showing the retry view, leaving the webview frozen blank.

**Fix:** On `-999`, wait 2 seconds with `DispatchQueue.main.asyncAfter`. If `webView.url == nil && !webView.isLoading` at that point, the load genuinely failed → show retry. This avoids false-positive retry screens during legitimate Capacitor startup while still catching real failures.

**3. Retry overlay anchored to webView.bounds (can be .zero)**
`showRetryView` created the overlay with `UIView(frame: webView.bounds)` and added it as a subview of the WKWebView. At the moment `didFailProvisionalNavigation` fires on cold start, `webView.bounds` can be `.zero` — the overlay is zero-sized and `autoresizingMask` doesn't help if the superview never gets a layout pass.

**Fix:** Use `translatesAutoresizingMaskIntoConstraints = false`, add the overlay to `self.view` (not webView), and constrain it to `view.topAnchor / leadingAnchor / trailingAnchor / bottomAnchor`.

## Additional: load timeout
Added a 12-second `Timer` in `scheduleLoadTimeout()` that shows the retry screen if `webView.url == nil && !webView.isLoading` after 12 s. Cancelled by `didFinish`.

**Why:** Without it, a genuine network timeout (which fires `NSURLErrorTimedOut`, not `-999`) could produce a blank screen if the error handler path has its own bugs.

## Retry button
`retryLoad()` now calls `webView?.load(URLRequest(url: URL(string: "https://guberapp.app")!))` instead of `webView.reload()`, since `reload()` re-requests the last URL which may be nil or an empty string if the initial load never completed.
