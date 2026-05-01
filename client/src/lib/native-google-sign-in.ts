import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { Browser } from "@capacitor/browser";
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

/**
 * Mask a client ID so we can log it safely. Returns the leading 12 chars
 * (project number portion) and the total length — enough to verify in
 * Android logcat that the right value reached the WebView, never enough to
 * leak the credential.
 */
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

export async function nativeGoogleSignIn(
  _opts?: { authPathBase?: string },
): Promise<NativeGoogleSignInResult> {
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || "";
  const diag = maskClientId(clientId);

  // Surfaced in adb logcat under "chromium" / "Capacitor/Console" so a tester
  // can confirm the sync actually baked a clientId into the build.
  console.info("[google/native] init", { ...diag });
  trace("entry", { ...diag });

  // Hard-fail before invoking the plugin if the build was synced without the
  // serverClientId — otherwise the plugin throws an opaque DEVELOPER_ERROR
  // that callers used to misinterpret as "user cancelled".
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
    await GoogleAuth.initialize({
      clientId,
      scopes: ["profile", "email"],
      grantOfflineAccess: true,
    });
    trace("plugin_initialized", { ...diag });

    const googleUser = await GoogleAuth.signIn();
    const idToken = googleUser.authentication?.idToken;
    trace("signin_returned", { ...diag, hasIdToken: !!idToken });

    if (!idToken) {
      console.warn("[google/native] signIn returned no idToken", { ...diag });
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
    console.warn("[google/native] signIn failed", { msg, code, errName, ...diag });
    trace("signin_threw", { msg: msg.slice(0, 300), code, errName, ...diag });

    // Plugin truly missing from the build (web/PWA, or the Android Java side
    // never registered). Only this case is allowed to fall back to browser.
    if (
      msg.includes("not implemented") ||
      msg.includes("not available") ||
      msg.includes("No implementation found")
    ) {
      return { ok: false, reason: "plugin_not_available", diagnostic: diag };
    }

    // User dismissal — silent.
    if (
      msg.includes("cancel") ||
      msg.includes("Cancel") ||
      msg.includes("dismissed") ||
      code === "12501"
    ) {
      return { ok: false, reason: "cancelled", diagnostic: diag };
    }

    // DEVELOPER_ERROR (10) means the SHA-1 / package name combination is not
    // registered in the Google Cloud project that owns the Web client, OR
    // google-services.json doesn't contain an Android OAuth entry for this
    // package. We label this distinctly so the call sites stop silently
    // bouncing the user into the browser.
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
 * Flow:
 *   1. App generates a random pollKey and opens the standard browser OAuth URL.
 *   2. After sign-in, the server stores the JWT keyed by pollKey and returns a
 *      "Signed in!" page that tries window.close().
 *   3. App polls /api/auth/google/poll every 1.5 s; on success, closes the
 *      browser and navigates to the dashboard.
 *
 * onPhaseChange callbacks let the caller show intentional loading UI:
 *   "browser_open"  — browser is about to appear (keep "Connecting…" screen)
 *   "completing"    — token received, browser closing (show "Signing you in…")
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

  return new Promise<NativeGoogleSignInResult>((resolve) => {
    const finish = (result: NativeGoogleSignInResult) => {
      if (resolved) return;
      resolved = true;
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (browserListener) { browserListener.remove(); browserListener = null; }
      resolve(result);
    };

    (async () => {
      try {
        browserListener = await Browser.addListener("browserFinished", () => {
          finish({ ok: false, reason: "cancelled" });
        });

        opts?.onPhaseChange?.("browser_open");
        await Browser.open({ url: authUrl.toString(), presentationStyle: "popover" });

        // Poll every 1.5 s for up to 5 minutes
        let attempts = 0;
        pollInterval = setInterval(async () => {
          attempts++;
          if (attempts > 200) {
            await Browser.close().catch(() => {});
            finish({ ok: false, reason: "cancelled" });
            return;
          }
          try {
            const res = await fetch(`/api/auth/google/poll?key=${encodeURIComponent(pollKey)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                // Signal "completing" before resolving so the caller can show the
                // "Signing you in…" screen while the browser is still closing.
                opts?.onPhaseChange?.("completing");
                await setToken(data.token);
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                // Remove the browserFinished listener before closing so it doesn't
                // fire "cancelled" after a successful sign-in.
                if (browserListener) { browserListener.remove(); browserListener = null; }
                await Browser.close().catch(() => {});
                finish({ ok: true, accountType: data.user?.accountType });
              }
            }
          } catch {
            // network blip — keep polling
          }
        }, 1500);
      } catch (err: any) {
        finish({ ok: false, reason: "error", message: err?.message || String(err) });
      }
    })();
  });
}

export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleAuth.signOut();
  } catch {
    // ignore — not fatal if sign-out fails
  }
}
