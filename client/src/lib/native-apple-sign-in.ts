import { SocialLogin } from "@capgo/capacitor-social-login";
import { Capacitor } from "@capacitor/core";
import { setToken } from "@/lib/token-storage";
import { queryClient } from "@/lib/queryClient";

export interface NativeAppleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "error" | "plugin_not_available" | "misconfigured";
  message?: string;
}

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = SocialLogin.initialize({
      apple: {},
    }).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function nativeAppleSignIn(): Promise<NativeAppleSignInResult> {
  if (Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("SocialLogin")) {
    return { ok: false, reason: "plugin_not_available" };
  }

  try {
    await ensureInitialized();

    const loginResult = await SocialLogin.login({
      provider: "apple",
      options: {
        scopes: ["name", "email"],
      },
    });

    const result = loginResult.result as any;
    const identityToken = result?.idToken ?? result?.identityToken ?? null;

    if (!identityToken) {
      console.warn("[apple/native] login returned no identityToken");
      return { ok: false, reason: "error", message: "Apple didn't return an identity token." };
    }

    // Apple only sends name on the very first sign-in
    const firstName = result?.profile?.givenName ?? result?.givenName ?? "";
    const lastName = result?.profile?.familyName ?? result?.familyName ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

    const res = await fetch("/api/auth/apple/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken, fullName }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 403) {
        return { ok: false, reason: "error", message: data.message || "Account unavailable." };
      }
      return { ok: false, reason: "error", message: data.message || "Sign-in failed. Please try again." };
    }

    if (data.token) {
      await setToken(data.token);
    }

    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });

    return { ok: true, accountType: data.user?.accountType };
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (
      msg.toLowerCase().includes("cancel") ||
      msg.toLowerCase().includes("dismiss") ||
      msg.toLowerCase().includes("user_cancelled")
    ) {
      return { ok: false, reason: "cancelled" };
    }
    console.error("[apple/native] sign-in error:", err);
    return { ok: false, reason: "error", message: "Sign-in failed. Please try again." };
  }
}
