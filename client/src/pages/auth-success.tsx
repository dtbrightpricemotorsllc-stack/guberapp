import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { setToken } from "@/lib/token-storage";
import { GuberLogo } from "@/components/guber-logo";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_RETURN_TO_PREFIXES } from "@shared/oauth-config";
import { setGoogleAuthPhase } from "@/components/google-auth-overlay";

function isAllowedReturnTo(value: string): boolean {
  if (!value || !value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;

  const lowerValue = value.toLowerCase();
  if (
    lowerValue.includes("/..") ||
    lowerValue.includes("%2e") ||
    lowerValue.includes("%2f")
  ) {
    return false;
  }

  let normalized: string;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    normalized = url.pathname;
  } catch {
    return false;
  }

  return ALLOWED_RETURN_TO_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return normalized === prefix.slice(0, -1) || normalized.startsWith(prefix);
    }
    return normalized === prefix || normalized.startsWith(prefix + "/");
  });
}

export default function AuthSuccess() {
  const [, setLocation] = useLocation();
  const [failed, setFailed] = useState(false);
  // Suppress the local spinner for the first 500ms — most logins finish well
  // inside that window and showing nothing keeps the global GoogleAuthOverlay
  // (or a fast hand-off to the dashboard) feeling like one continuous step.
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 500);

    // Make sure the global overlay is showing during this hand-off so the
    // user never sees a blank or login-page flash on their way to /dashboard.
    setGoogleAuthPhase("completing");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    console.log("[GUBER auth-success] page loaded — token present:", !!token);

    if (!token) {
      console.warn("[GUBER auth-success] No token in URL — redirecting to login");
      clearTimeout(spinnerTimer);
      setGoogleAuthPhase(null);
      setLocation("/login?error=google_failed", { replace: true });
      return () => clearTimeout(spinnerTimer);
    }

    const returnTo = params.get("returnTo");

    void setToken(token)
      .then(() => {
        // Clear the token from the URL so it isn't bookmarked or leaked in history
        window.history.replaceState({}, "", "/auth-success");

        // Suppress the install prompt for ~2 minutes after a Google OAuth round
        // trip — the redirect briefly bumps the user out of standalone, and we
        // don't want the mascot popping up the moment they land back.
        try {
          sessionStorage.setItem(
            "guber-install-postauth-until",
            String(Date.now() + 2 * 60 * 1000),
          );
        } catch {}

        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        console.log("[GUBER auth-success] token saved, fetching /api/auth/me");
        return queryClient.fetchQuery({ queryKey: ["/api/auth/me"] });
      })
      .then((me) => {
        const accountType = (me as { accountType?: string } | null)?.accountType;
        console.log("[GUBER auth-success] /api/auth/me succeeded — accountType:", accountType);
        clearTimeout(spinnerTimer);
        const dest = returnTo && isAllowedReturnTo(returnTo)
          ? returnTo
          : (accountType === "business" ? "/biz/dashboard" : "/dashboard");
        // Use replace so the back button doesn't return the user to this
        // transient interstitial after they land on the dashboard.
        setLocation(dest, { replace: true });
        setTimeout(() => setGoogleAuthPhase(null), 600);
      })
      .catch((err) => {
        console.error("[GUBER auth-success] auth flow failed:", err?.message || err);
        clearTimeout(spinnerTimer);
        setGoogleAuthPhase(null);
        setFailed(true);
      });

    return () => {
      clearTimeout(spinnerTimer);
    };
  }, []);

  if (failed) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center bg-background gap-5 px-6"
        data-testid="auth-success-error"
      >
        <GuberLogo className="mb-2" />
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Something went wrong completing sign-in. Please try again.
        </p>
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => setLocation("/login", { replace: true })}
          data-testid="button-auth-retry"
        >
          Back to Sign In
        </Button>
      </div>
    );
  }

  if (!showSpinner) {
    // Render only the dark backdrop for the first 500ms. The global
    // GoogleAuthOverlay (when present) handles the visible "Signing you in…"
    // state, so this page stays invisible behind it for fast logins.
    return (
      <div
        className="min-h-screen bg-background"
        data-testid="auth-success-page"
      />
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-background"
      data-testid="auth-success-page"
    >
      <GuberLogo className="mb-8" />
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground text-sm">Signing you in...</p>
    </div>
  );
}
