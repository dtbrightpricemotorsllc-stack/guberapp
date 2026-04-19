import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { setToken } from "@/lib/token-storage";
import { GuberLogo } from "@/components/guber-logo";
import { Loader2 } from "lucide-react";
import { ALLOWED_RETURN_TO_PREFIXES } from "@shared/oauth-config";

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setLocation("/login");
      return;
    }

    const returnTo = params.get("returnTo");

    void setToken(token)
      .then(() => {
        window.history.replaceState({}, "", "/auth-success");

        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        return queryClient.fetchQuery({ queryKey: ["/api/auth/me"] });
      })
      .then((me) => {
        if (returnTo && isAllowedReturnTo(returnTo)) {
          setLocation(returnTo);
          return;
        }
        const dest = (me as { accountType?: string } | null)?.accountType === "business" ? "/biz/dashboard" : "/dashboard";
        setLocation(dest);
      })
      .catch(() => {
        setLocation("/login");
      });
  }, []);

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
