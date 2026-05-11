import { setToken } from "@/lib/token-storage";
import { queryClient } from "@/lib/queryClient";

export interface NativeAppleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "error" | "plugin_not_available" | "misconfigured";
  message?: string;
}

/**
 * Native Apple Sign-In.
 * @capgo/capacitor-social-login has been removed from the project.
 * Falls back to the server-side Apple OAuth web flow.
 */
export async function nativeAppleSignIn(): Promise<NativeAppleSignInResult> {
  try {
    const res = await fetch("/api/auth/apple/web-initiate", { method: "POST" });
    if (!res.ok) {
      return { ok: false, reason: "plugin_not_available" };
    }
    const { url } = await res.json();
    if (!url) return { ok: false, reason: "plugin_not_available" };

    // Open Apple's auth page in the same window — Apple does not support
    // popups for Sign in with Apple on iOS Safari / WKWebView.
    window.location.href = url;
    // The page will navigate away; return a pending result.
    return { ok: false, reason: "plugin_not_available" };
  } catch {
    return { ok: false, reason: "plugin_not_available" };
  }
}
