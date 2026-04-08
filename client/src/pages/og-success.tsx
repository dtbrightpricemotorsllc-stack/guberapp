import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuberLayout } from "@/components/guber-layout";
import { Crown, Loader2 } from "lucide-react";
import { Day1OGLogo } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function OGSuccess() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const sessionId = params.get("session_id");
  const [confirmed, setConfirmed] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/confirm-og", { sessionId });
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmed(true);
      // Session was restored server-side; update client cache with the activated user
      if (data && data.id) {
        queryClient.setQueryData(["/api/auth/me"], data);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
  });

  useEffect(() => {
    if (sessionId && !confirmed) {
      confirmMutation.mutate();
    }
  }, [sessionId]);

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-16 text-center" data-testid="page-og-success">
        {confirmMutation.isPending ? (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-secondary mx-auto" />
            <p className="font-display text-lg">Activating Day-1 OG...</p>
          </div>
        ) : confirmed ? (
          <div className="space-y-5">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-32 h-32 rounded-full blur-3xl opacity-30"
                style={{ background: "radial-gradient(circle, hsl(45 100% 55%), transparent 70%)" }} />
              <Day1OGLogo size="xl" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-extrabold text-amber-400 tracking-tight">Day-1 OG</h1>
              <p className="text-lg font-display font-bold text-amber-300/70 tracking-widest mt-0.5">ACTIVATED</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Your founding member status is locked in forever. Free urgent toggles on every job you post — no exceptions.
            </p>
            <Link href="/dashboard">
              <Button className="font-display premium-btn mt-2" data-testid="button-dashboard">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-destructive font-display">Activation failed. Please contact support.</p>
            <Link href="/profile">
              <Button variant="outline" className="font-display">Back to Profile</Button>
            </Link>
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
