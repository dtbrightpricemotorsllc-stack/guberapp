import { useState } from "react";
import { LoadingSplash } from "@/components/loading-splash";

/**
 * Visual demo of the universal LoadingSplash component. Lets you toggle the
 * splash on/off and time how long it stays visible. Not part of the main app
 * navigation — it's reachable directly via /loading-demo for QA + design review.
 */
export default function LoadingDemo() {
  const [loading, setLoading] = useState<boolean>(true);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0c10",
        color: "#e6ffe9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontWeight: 800, fontSize: 22 }}>Loading Splash Demo</h1>
      <p style={{ margin: 0, color: "rgba(230,255,233,0.65)", textAlign: "center", maxWidth: 400 }}>
        Tap the buttons to show/hide the universal GUBER loading splash.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => setLoading(true)}
          style={{
            padding: "12px 20px",
            background: "rgba(0,255,150,0.15)",
            border: "1px solid rgba(0,255,150,0.45)",
            color: "#7CFFB6",
            borderRadius: 12,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "0.08em",
            fontSize: 18,
            cursor: "pointer",
          }}
          data-testid="button-show-loading-splash"
        >
          SHOW SPLASH
        </button>
        <button
          onClick={() => setLoading(false)}
          style={{
            padding: "12px 20px",
            background: "rgba(255,200,60,0.12)",
            border: "1px solid rgba(255,200,60,0.45)",
            color: "#FFE7A8",
            borderRadius: 12,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "0.08em",
            fontSize: 18,
            cursor: "pointer",
          }}
          data-testid="button-hide-loading-splash"
        >
          HIDE SPLASH
        </button>
      </div>
      <LoadingSplash loading={loading} />
    </div>
  );
}
