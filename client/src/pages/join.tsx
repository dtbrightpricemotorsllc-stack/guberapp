import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { GuberLogo } from "@/components/guber-logo";
import { createCampaignSession } from "@/lib/campaign-onboarding";
import { getGuestSessionId } from "@/hooks/use-guest-jac-session";

export default function JoinPage({ kind = "consumer" }: { kind?: "consumer" | "business" }) {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const code = (params.code || "").trim().toUpperCase();
        if (code) {
          try {
            if (kind === "consumer") localStorage.setItem("guber_ref", code);
            else localStorage.setItem("guber_business_invitation", code);
          } catch {}
        }
        try {
          const session = await createCampaignSession({
            kind,
            code,
            source: kind === "business" ? "business_invitation" : "flyer",
            guestSessionId: getGuestSessionId(),
          });
          if (!cancelled) {
            setLocation(`/?campaignSession=${encodeURIComponent(session.sessionId)}&campaignKind=${kind}`);
          }
        } catch {
          const fallback = kind === "business" ? "/business-signup" : "/signup";
          if (!cancelled) {
            setLocation(code ? `${fallback}?${kind === "business" ? "invite" : "ref"}=${encodeURIComponent(code)}` : fallback);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.code, setLocation, kind]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <GuberLogo size="md" />
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Oxanium,sans-serif", letterSpacing: "0.05em" }}>
          {kind === "business" ? "Your business has been invited." : "You've been invited."}
        </p>
        <p style={{ color: "#C9A84C", fontSize: 11, fontFamily: "Oxanium,sans-serif", marginTop: 6, opacity: 0.75 }}>
          Opening JAC to help you get started…
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#C9A84C",
              animation: `dot-pulse 1.4s ease-in-out ${i * 0.25}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%           { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
