import React from "react";

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0a1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "Oxanium, monospace, sans-serif",
          padding: "24px",
          textAlign: "center",
          gap: "12px",
        }}
      >
        <p style={{ fontSize: "20px", fontWeight: 700, color: "#22C55E", letterSpacing: "0.05em" }}>
          GUBER
        </p>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)" }}>
          Something went wrong
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "#ff6b6b",
            maxWidth: "320px",
            wordBreak: "break-word",
            background: "rgba(255,0,0,0.08)",
            border: "1px solid rgba(255,0,0,0.2)",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
        >
          {error.message || String(error)}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "12px 32px",
            background: "#22C55E",
            border: "none",
            borderRadius: "10px",
            color: "#000",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }
}
