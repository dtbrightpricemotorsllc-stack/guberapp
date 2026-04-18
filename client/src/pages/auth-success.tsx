import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { GuberLogo } from "@/components/guber-logo";
import { Loader2 } from "lucide-react";

export default function AuthSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setLocation("/login");
      return;
    }

    localStorage.setItem("guber_token", token);

    window.history.replaceState({}, "", "/auth-success");

    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.fetchQuery({ queryKey: ["/api/auth/me"] })
      .then((me: any) => {
        const dest = me?.accountType === "business" ? "/biz/dashboard" : "/dashboard";
        setLocation(dest);
      })
      .catch(() => {
        setLocation("/dashboard");
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
