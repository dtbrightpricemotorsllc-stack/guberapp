import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { setToken } from "@/lib/token-storage";
import { queryClient } from "@/lib/queryClient";

export interface NativeGoogleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "timeout" | "error";
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

export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleAuth.signOut();
  } catch {
    // ignore — not fatal if sign-out fails
  }
}
