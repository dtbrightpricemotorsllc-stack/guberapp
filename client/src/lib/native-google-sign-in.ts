import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { Browser } from "@capacitor/browser";
import { setToken } from "@/lib/token-storage";
import { queryClient } from "@/lib/queryClient";

export interface NativeGoogleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "error" | "plugin_not_available";
  message?: string;
}

export async function nativeGoogleSignIn(
  _opts?: { authPathBase?: string },
): Promise<NativeGoogleSignInResult> {
  try {
    await GoogleAuth.initialize({
      clientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || "",
      scopes: ["profile", "email"],
      grantOfflineAccess: true,
    });

    const googleUser = await GoogleAuth.signIn();
    const idToken = googleUser.authentication?.idToken;

    if (!idToken) {
      return { ok: false, reason: "error", message: "No ID token returned from Google" };
    }

    const res = await fetch("/api/auth/google/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, reason: "error", message: data.message || "Sign-in failed" };
    }

    await setToken(data.token);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    return { ok: true, accountType: data.user?.accountType };
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    if (
      msg.includes("not implemented") ||
      msg.includes("not available") ||
      msg.includes("No implementation found")
    ) {
      return { ok: false, reason: "plugin_not_available" };
    }
    if (
      msg.includes("cancel") ||
      msg.includes("Cancel") ||
      msg.includes("12501") ||
      msg.includes("dismissed")
    ) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "error", message: msg };
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
 */
export async function browserGoogleSignIn(opts?: {
  returnTo?: string;
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

        await Browser.open({ url: authUrl.toString(), presentationStyle: "popover" });

        // Poll every 1.5 s for up to 5 minutes
        let attempts = 0;
        pollInterval = setInterval(async () => {
          attempts++;
          if (attempts > 200) { // 5 min max
            await Browser.close().catch(() => {});
            finish({ ok: false, reason: "cancelled" });
            return;
          }
          try {
            const res = await fetch(`/api/auth/google/poll?key=${encodeURIComponent(pollKey)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                await setToken(data.token);
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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
