import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export type NativeGoogleSignInResult =
  | { ok: true }
  | { ok: false; reason: "timeout" | "cancelled" | "error"; message?: string };

function makeSid(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto || (window as any).crypto).getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Native Google sign-in using a polling fallback.
 *
 * Why: when the OAuth flow opens in Chrome Custom Tabs (Browser.open on Android)
 * or SFSafariViewController (iOS), the cookie jar is separate from the native
 * app's WebView. Without working deep links the native app would never receive
 * the session.
 *
 * Flow:
 *  1. Generate a random sid and pass it to /api/auth/google?sid=...
 *  2. The server stores the resulting login token keyed by that sid.
 *  3. We poll /api/auth/oauth-pickup?sid=... every 1.5s until a token comes back.
 *  4. We exchange that token via /api/auth/exchange-token, which sets the
 *     session cookie in the WebView's cookie jar.
 *  5. Close the in-app browser. Caller navigates to dashboard.
 */
export async function nativeGoogleSignIn(opts: {
  authPathBase: string; // e.g. "/api/auth/google"
  extraParams?: Record<string, string>;
  timeoutMs?: number;
}): Promise<NativeGoogleSignInResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "error", message: "Not a native platform" };
  }

  const sid = makeSid();
  const params = new URLSearchParams({ native: "1", sid, ...(opts.extraParams || {}) });
  const authUrl = `${window.location.origin}${opts.authPathBase}?${params.toString()}`;
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  let browserClosedByUser = false;
  const finishedListener = await Browser.addListener("browserFinished", () => {
    browserClosedByUser = true;
  });

  try {
    await Browser.open({ url: authUrl });
  } catch (err: any) {
    finishedListener.remove();
    return { ok: false, reason: "error", message: err?.message || "Failed to open browser" };
  }

  const startedAt = Date.now();
  const pickupUrl = `/api/auth/oauth-pickup?sid=${encodeURIComponent(sid)}`;

  try {
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch(pickupUrl, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { token: string | null };
          if (data.token) {
            const exchangeRes = await fetch(
              `/api/auth/exchange-token?t=${encodeURIComponent(data.token)}`,
              { credentials: "include" }
            );
            if (!exchangeRes.ok) {
              return { ok: false, reason: "error", message: "Token exchange failed" };
            }
            try { await Browser.close(); } catch (_) {}
            return { ok: true };
          }
        }
      } catch (_) {
        // network blip — keep polling
      }
      // If the user closed the in-app browser without finishing, give one more
      // pickup attempt then bail. (They might have completed sign-in just before
      // closing.)
      if (browserClosedByUser) {
        try {
          const res = await fetch(pickupUrl, { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as { token: string | null };
            if (data.token) {
              const exchangeRes = await fetch(
                `/api/auth/exchange-token?t=${encodeURIComponent(data.token)}`,
                { credentials: "include" }
              );
              if (exchangeRes.ok) return { ok: true };
            }
          }
        } catch (_) {}
        return { ok: false, reason: "cancelled" };
      }
    }
    try { await Browser.close(); } catch (_) {}
    return { ok: false, reason: "timeout" };
  } finally {
    finishedListener.remove();
  }
}
