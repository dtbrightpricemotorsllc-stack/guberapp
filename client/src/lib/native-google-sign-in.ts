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
 * Fire-and-forget telemetry. Never throws.
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

/**
 * Native Google Sign-In via the SocialLogin plugin.
 * Plugin has been removed — always returns plugin_not_available so callers
 * fall through to browserGoogleSignIn automatically.
 */
export async function nativeGoogleSignIn(
  _opts?: { authPathBase?: string },
): Promise<NativeGoogleSignInResult> {
  trace("plugin_removed", {});
  return { ok: false, reason: "plugin_not_available" };
}

/**
 * Google Sign-In via Chrome Custom Tab + server-side poll token.
 *
 * Works with ANY installed APK — no native plugin, no deep links, no new build.
 * This is now the primary Google sign-in path on iOS and Android.
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

    const consumeTokenIfReady = async (
      whence: "interval" | "browser_close" | "timeout",
      attempts: number,
    ): Promise<boolean> => {
      if (resolved) return true;
      try {
        const res = await fetch(`/api/auth/google/poll?key=${encodeURIComponent(pollKey)}`);
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.token) return false;
        if (resolved) return true;
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
          trace("browser_closed_event", {});
          // The server-side token write and the browser-close event can arrive in
          // either order. Retry up to 10 times (2 s) before giving up so a small
          // server round-trip delay doesn't force the user to tap again.
          for (let i = 0; i < 10; i++) {
            if (resolved) return;
            const consumed = await consumeTokenIfReady("browser_close", i);
            if (consumed) return;
            await new Promise<void>((r) => setTimeout(r, 200));
          }
          if (!resolved) finish({ ok: false, reason: "cancelled" });
        });

        opts?.onPhaseChange?.("browser_open");
        await Browser.open({ url: authUrl.toString(), presentationStyle: "popover" });
        trace("browser_opened", {});

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

/** No-op — SocialLogin plugin removed. */
export async function signOutFromGoogle(): Promise<void> {
  // no-op: @capgo/capacitor-social-login removed from project
}
