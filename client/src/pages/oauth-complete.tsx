import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function OAuthComplete() {
  const [, navigate] = useLocation();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");

    if (!token) {
      navigate("/login?error=google_failed");
      return;
    }

    fetch(`/api/auth/exchange-token?t=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          window.location.replace("/dashboard");
        } else {
          navigate("/login?error=google_failed");
        }
      })
      .catch(() => navigate("/login?error=google_failed"));
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
