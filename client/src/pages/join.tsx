import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { GuberLogo } from "@/components/guber-logo";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const code = (params.code || "").trim().toUpperCase();
    if (code) {
      localStorage.setItem("guber_ref", code);
    }
    const target = code ? `/signup?ref=${encodeURIComponent(code)}` : "/signup";
    setTimeout(() => setLocation(target), 600);
  }, [params.code, setLocation]);

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
          You've been invited.
        </p>
        <p style={{ color: "#C9A84C", fontSize: 11, fontFamily: "Oxanium,sans-serif", marginTop: 6, opacity: 0.75 }}>
          Setting up your early access…
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
