import React from "react";

/** Detect chunk-load / module-import failures that happen after a new deploy */
function isChunkLoadError(err: Error): boolean {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    (msg.includes("import") && msg.includes("failed"))
  );
}

const RELOAD_FLAG = "guber_chunk_reload";

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    // Auto-reload once when this is a stale-chunk error (common after deploys).
    // sessionStorage flag prevents an infinite reload loop.
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          // Force a full reload bypassing cache so the new chunks load.
          window.location.replace(
            window.location.href.includes("?")
              ? window.location.href + "&_r=" + Date.now()
              : window.location.href + "?_r=" + Date.now()
          );
          // Return null so nothing renders during the redirect.
          return { error: null };
        }
      } catch {}
    }
    return { error };
  }

  componentDidMount() {
    // Clear the reload flag once the app successfully mounts.
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
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
          onClick={() => {
            try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
            window.location.replace(
              window.location.href.includes("?")
                ? window.location.href + "&_r=" + Date.now()
                : window.location.href + "?_r=" + Date.now()
            );
          }}
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
