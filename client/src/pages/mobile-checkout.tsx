import { useEffect } from "react";
import { useSearch } from "wouter";
import shieldLogo from "@assets/__favicon_1773034423924.png";

export default function MobileCheckout() {
  const search = useSearch();

  useEffect(() => {
    const token = new URLSearchParams(search).get("token");
    if (!token) return;
    window.location.replace(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`);
  }, [search]);

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 24,
      }}
      data-testid="page-mobile-checkout"
    >
      <img
        src={shieldLogo}
        alt="GUBER"
        style={{
          width: 80, height: 80, objectFit: "contain",
          filter: "drop-shadow(0 0 20px rgba(180,60,255,0.55)) drop-shadow(0 0 10px rgba(0,230,200,0.4))",
        }}
      />
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Oxanium, sans-serif" }}>
        Preparing your checkout…
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "linear-gradient(135deg, #b43cff, #00e6c8)",
              animation: `mc-bounce 1.3s ease-in-out ${i * 0.22}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes mc-bounce {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
