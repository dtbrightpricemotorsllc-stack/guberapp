import { SocialLogin } from "@capgo/capacitor-social-login";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { setToken } from "@/lib/token-storage";
import { queryClient } from "@/lib/queryClient";

export interface NativeGoogleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "error" | "plugin_not_available" | "misconfigured";
  message?: string;
  /** Diagnostic — present in dev tools / native logcat for support triage. */
  diagnostic?: { clientIdPrefix?: string; clientIdLength?: number };
}

function maskClientId(raw: string): { clientIdPrefix?: string; clientIdLength?: number } {
  if (!raw) return { clientIdPrefix: "(empty)", clientIdLength: 0 };
  return {
    clientIdPrefix: raw.slice(0, 12) + "…",
    clientIdLength: raw.length,
  };
}

/**
 * Fire-and-forget telemetry. Lets us see what the native plugin actually
 * returns on a real device by reading server logs — needed because adb
 * logcat isn't available to most testers. Never throws.
 */
function trace(stage: string, payload: Record<string, unknown>): void {
  try {
    fetch("/api/debug/sign-in-trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, ...payload, t: Date.now() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let telemetry break the flow
  }
}

// SocialLogin.initialize() must run exactly once per app session before any
// login() call. We cache the result in a module-scoped promise so concurrent
// taps await the same initialization.
let initPromise: Promise<void> | null = null;

function ensureInitialized(clientId: string): Promise<void> {
  if (!initPromise) {
    initPromise = SocialLogin.initialize({
      google: { webClientId: clientId },
    }).catch((err) => {
      // Reset so the next attempt can retry — otherwise a transient init
      // failure would permanently break sign-in for the session.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function nativeGoogleSignIn(
  _opts?: { authPathBase?: string },
): Promise<NativeGoogleSignInResult> {
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || "";
  const diag = maskClientId(clientId);

  console.info("[google/native] init", { ...diag });
  trace("entry", { ...diag });

  // Pre-flight: APKs built before the @capgo/capacitor-social-login plugin
  // landed have no native side for it, so calling SocialLogin.* throws
  // "GoogleAuth plugin is not implemented on android". That's the path most
  // currently-installed phones are on. Detecting this up front and returning
  // plugin_not_available immediately lets the caller skip straight to the
  // Chrome-Custom-Tab fallback without the visible failed attempt.
  if (Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("SocialLogin")) {
    trace("plugin_not_registered_in_apk", { ...diag });
    return { ok: false, reason: "plugin_not_available", diagnostic: diag };
  }

  if (!clientId) {
    console.warn(
      "[google/native] VITE_GOOGLE_WEB_CLIENT_ID is empty — the build was synced " +
      "without the Web OAuth client ID. Set it in your CI environment and run " +
      "`npx cap sync android` again before rebuilding.",
    );
    trace("misconfigured_no_client_id", { ...diag });
    return {
      ok: false,
      reason: "misconfigured",
      message: "Google Sign-In is missing its Web Client ID. Please contact support.",
      diagnostic: diag,
    };
  }

  try {
    await ensureInitialized(clientId);
    trace("plugin_initialized", { ...diag });

    const loginResult = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["profile", "email"],
        // 'standard' opens the full Google account picker dialog.
        style: "standard",
      },
    });

    // Narrow the discriminated union — we initialized in default 'online'
    // mode, so result should always be GoogleLoginResponseOnline with idToken.
    const result = loginResult.result;
    const idToken = "idToken" in result ? result.idToken : null;
    trace("signin_returned", { ...diag, hasIdToken: !!idToken });

    if (!idToken) {
      console.warn("[google/native] login returned no idToken", { ...diag });
      return {
        ok: false,
        reason: "misconfigured",
        message: "Google didn't return an ID token. The Android OAuth client may be missing this app's signing certificate (SHA-1).",
        diagnostic: diag,
      };
    }

    const res = await fetch("/api/auth/google/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, reason: "error", message: data.message || "Sign-in failed", diagnostic: diag };
    }

    await setToken(data.token);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    return { ok: true, accountType: data.user?.accountType, diagnostic: diag };
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    const code: string = err?.code != null ? String(err.code) : "";
    const errName: string = err?.name || "";
    console.warn("[google/native] login failed", { msg, code, errName, ...diag });
    trace("signin_threw", { msg: msg.slice(0, 300), code, errName, ...diag });

    if (
      msg.includes("not implemented") ||
      msg.includes("not available") ||
      msg.includes("No implementation found")
    ) {
      return { ok: false, reason: "plugin_not_available", diagnostic: diag };
    }

    if (
      msg.includes("cancel") ||
      msg.includes("Cancel") ||
      msg.includes("dismissed") ||
      msg.includes("CANCELED") ||
      code === "12501"
    ) {
      return { ok: false, reason: "cancelled", diagnostic: diag };
    }

    if (code === "10" || msg.includes("DEVELOPER_ERROR") || msg.includes("ApiException: 10")) {
      return {
        ok: false,
        reason: "misconfigured",
        message: "Android Google Sign-In isn't authorized for this build. The signing certificate (SHA-1) for this APK isn't registered with the OAuth client.",
        diagnostic: diag,
      };
    }

    return { ok: false, reason: "error", message: msg, diagnostic: diag };
  }
}

/**
 * Google Sign-In via Chrome Custom Tab + server-side poll token.
 *
 * Works with ANY installed APK — no native plugin, no deep links, no new build.
 * Used as fallback when the native plugin is genuinely unavailable.
 */
export async function browserGoogleSignIn(opts?: {
  returnTo?: string;
  onPhaseChange?: (phase: "browser_open" | "completing") => void;
}): Promise<NativeGoogleSignInResult> {
  const pollKey = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authUrl = new URL(`${window.location.origin}/api/auth/google`);
  authUrl.searchParams.set("source", "native");
  authUrl.searchParams.set("pollKey", pollKey);
  if (opts?.returnTo) authUrl.searchParams.set("returnTo", opts.returnTo);

  let resolved = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let browserListener: Awaited<ReturnType<typeof Browser.addListener>> | null = null;

  trace("browser_entry", { pollKeyPrefix: pollKey.slice(0, 6) });

  return new Promise<NativeGoogleSignInResult>((resolve) => {
    const finish = (result: NativeGoogleSignInResult) => {
      if (resolved) return;
      resolved = true;
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (browserListener) { browserListener.remove(); browserListener = null; }
      trace("browser_finish", { ok: result.ok, reason: result.reason || "" });
      resolve(result);
    };

    // Shared single-poll helper. Returns true if a token was found and the
    // success path was taken (so the caller knows finish() has been called).
    const consumeTokenIfReady = async (
      whence: "interval" | "browser_close" | "timeout",
      attempts: number,
    ): Promise<boolean> => {
      if (resolved) return true; // already finished — never touch state again
      try {
        const res = await fetch(`/api/auth/google/poll?key=${encodeURIComponent(pollKey)}`);
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.token) return false;
        if (resolved) return true; // raced with another resolution; do nothing
        trace("browser_poll_token_received", { attempts, whence });
        opts?.onPhaseChange?.("completing");
        await setToken(data.token);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        await Browser.close().catch(() => {});
        finish({ ok: true, accountType: data.user?.accountType });
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      try {
        browserListener = await Browser.addListener("browserFinished", async () => {
          // Race-fix: when the user closes the browser tab right after Google
          // signs them in, there's a ~1s window where the token IS waiting on
          // the server but the next scheduled poll hasn't fired yet. Do a
          // final check before declaring cancellation — otherwise a successful
          // sign-in looks like a cancel and the overlay sticks.
          trace("browser_closed_event", {});
          const consumed = await consumeTokenIfReady("browser_close", 0);
          if (!consumed && !resolved) {
            finish({ ok: false, reason: "cancelled" });
          }
        });

        opts?.onPhaseChange?.("browser_open");
        await Browser.open({ url: authUrl.toString(), presentationStyle: "popover" });
        trace("browser_opened", {});

        // Aggressive 300ms polling — the moment the OAuth callback stores
        // the token server-side, the app picks it up and closes the browser.
        // 300ms × 600 attempts = 3 min before the flow times out, which is
        // plenty of time for a user to complete sign-in.
        let attempts = 0;
        pollInterval = setInterval(async () => {
          if (resolved) return;
          attempts++;
          if (attempts > 600) {
            trace("browser_poll_timeout", { attempts });
            await Browser.close().catch(() => {});
            if (!resolved) finish({ ok: false, reason: "cancelled" });
            return;
          }
          await consumeTokenIfReady("interval", attempts);
        }, 300);
      } catch (err: any) {
        trace("browser_threw", { msg: String(err?.message || err).slice(0, 300) });
        if (!resolved) finish({ ok: false, reason: "error", message: err?.message || String(err) });
      }
    })();
  });
}

export async function signOutFromGoogle(): Promise<void> {
  try {
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // ignore — not fatal if sign-out fails (also fine if never signed in)
  }
}
