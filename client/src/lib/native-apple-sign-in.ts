import { Capacitor, registerPlugin } from "@capacitor/core";
import { setToken } from "@/lib/token-storage";
import { queryClient, apiRequest } from "@/lib/queryClient";

export interface NativeAppleSignInResult {
  ok: boolean;
  accountType?: string;
  reason?: "cancelled" | "error" | "plugin_not_available" | "misconfigured";
  message?: string;
}

interface AppleSignInPlugin {
  isAvailable(): Promise<{ value: boolean }>;
  signIn(): Promise<{
    identityToken: string;
    userIdentifier: string;
    fullName?: string;
    email?: string;
  }>;
}

/**
 * First-party native plugin (ios/App/App/AppleSignInPlugin.swift) built on
 * Apple's own AuthenticationServices framework — no third-party npm
 * dependency, so it can't drift out of sync with the compiled binary the
 * way @capgo/capacitor-social-login previously did (see
 * docs/app-store-rejection-2026-07.md).
 */
const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

/**
 * Native Sign in with Apple, via the on-device AuthenticationServices
 * flow. Only available on iOS native builds — everywhere else this
 * resolves to `plugin_not_available` so callers can decide what to do
 * (there is currently no web fallback; Apple Sign-In is only offered on
 * the iOS app).
 */
export async function nativeAppleSignIn(): Promise<NativeAppleSignInResult> {
  if (Capacitor.getPlatform() !== "ios" || !Capacitor.isNativePlatform()) {
    return { ok: false, reason: "plugin_not_available" };
  }

  try {
    const result = await AppleSignIn.signIn();
    if (!result?.identityToken) {
      return { ok: false, reason: "error", message: "Apple did not return a sign-in token." };
    }

    const res = await apiRequest("POST", "/api/auth/apple/native", {
      identityToken: result.identityToken,
      fullName: result.fullName,
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, reason: "error", message: data?.message || "Sign-in failed. Please try again." };
    }

    await setToken(data.token);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    return { ok: true, accountType: data.user?.accountType };
  } catch (err: any) {
    const code = err?.code || err?.message || "";
    if (String(code).toUpperCase().includes("CANCEL")) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "error", message: err?.message || "Sign-in failed. Please try again." };
  }
}
