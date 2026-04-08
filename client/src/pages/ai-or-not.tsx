import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isStoreBuild } from "@/lib/platform";
import shieldLogo from "@assets/__favicon_1773034423924.png";

const MIN_SPLASH_MS = 3000;
const MAX_SPLASH_MS = 20000;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 30000;

export default function AiOrNot() {
  const [, navigate] = useLocation();
  const { user, isDemoUser } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [iframeDidLoad, setIframeDidLoad] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [maxTimeElapsed, setMaxTimeElapsed] = useState(false);
  const showContent = (iframeDidLoad && minTimeElapsed) || (maxTimeElapsed && iframeDidLoad);
  const cspBlocked = maxTimeElapsed && !iframeDidLoad;

  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Detect post-purchase redirect params
  const searchParams = new URLSearchParams(window.location.search);
  const trustboxSuccess = searchParams.get("trustbox") === "success";
  const ogSuccess = searchParams.get("og") === "success" || searchParams.get("day1og") === "success";
  const purchaseSuccess = trustboxSuccess || ogSuccess;

  // Whether we are still waiting for the webhook to update the user record
  const [purchaseActivating, setPurchaseActivating] = useState(purchaseSuccess);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);

  // Minimum-time gate (3s)
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // Hard-cap gate (20s)
  useEffect(() => {
    const t = setTimeout(() => setMaxTimeElapsed(true), MAX_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  const fetchSignedUrl = useCallback(() => {
    if (!user?.id) return;
    fetch("/api/ai-or-not/signed-url", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.url) {
          let url = data.url;
          if (isStoreBuild || isDemoUser) {
            const sep = url.includes("?") ? "&" : "?";
            url = url + sep + "hideCheckout=1";
          }
          setSignedUrl(url);
          // After updating the URL, notify the iframe about the fresh entitlements
          // (in case it already loaded under the old URL and is listening)
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "guber-entitlement-update", trustBox: data.url.includes("trustBox=1"), isOG: data.url.includes("isOG=1") },
              "*"
            );
          }, 800);
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Initial signed-URL fetch
  useEffect(() => {
    fetchSignedUrl();
  }, [fetchSignedUrl]);

  // Poll after purchase until the webhook has updated the DB
  useEffect(() => {
    if (!purchaseActivating || !user?.id) return;

    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      // Force-refetch the user record
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });

      const fresh = queryClient.getQueryData(["/api/auth/me"]) as any;
      const activated =
        (trustboxSuccess && fresh?.trustBoxPurchased) ||
        (ogSuccess && fresh?.day1OG);

      if (activated && !stopped) {
        stopped = true;
        setPurchaseActivating(false);
        setPurchaseConfirmed(true);
        // Re-fetch signed URL now that the DB is updated → iframe gets new flags
        fetchSignedUrl();
        // Remove query params from URL so a refresh doesn't re-trigger this
        window.history.replaceState({}, "", "/ai-or-not");
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const timeout = setTimeout(() => {
      stopped = true;
      setPurchaseActivating(false);
      clearInterval(interval);
    }, POLL_TIMEOUT_MS);

    return () => { stopped = true; clearInterval(interval); clearTimeout(timeout); };
  }, [purchaseActivating, user?.id, trustboxSuccess, ogSuccess, fetchSignedUrl]);

  // Message listener — credit sync + checkout requests from the embed
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (!e.data || typeof e.data.type !== "string") return;

      if (e.data.type === "guber-auth") {
        const { uid: msgUid, isOG: msgIsOG, trustBox: msgTrustBox, credits: msgCredits, sig: msgSig } = e.data;
        if (!msgUid) return;
        try {
          await apiRequest("POST", "/api/guber-auth", {
            uid: msgUid, isOG: msgIsOG, trustBox: msgTrustBox, credits: msgCredits, sig: msgSig,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        } catch (_) {}
        return;
      }

      if (e.data.type === "guber-checkout") {
        if (isStoreBuild || isDemoUser) {
          iframeRef.current?.contentWindow?.postMessage({ type: "guber-checkout-error", message: "Visit guberapp.app to unlock premium features" }, "*");
          return;
        }
        const product = e.data.product as string | undefined;
        let endpoint = "";
        if (product === "trust_box" || product === "trust-box") {
          endpoint = "/api/stripe/trust-box-checkout";
        } else if (product === "day1og" || product === "og") {
          endpoint = "/api/stripe/og-checkout";
        }
        if (!endpoint) return;
        try {
          const resp = await apiRequest("POST", endpoint);
          const data = await resp.json();
          const url = data.checkoutUrl || data.url;
          if (url) {
            window.location.href = url;
          } else {
            iframeRef.current?.contentWindow?.postMessage({ type: "guber-checkout-error", message: data.message || "Checkout failed" }, "*");
          }
        } catch {
          iframeRef.current?.contentWindow?.postMessage({ type: "guber-checkout-error", message: "Checkout failed" }, "*");
        }
        return;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isDemoUser]);

  const externalUrl = signedUrl ?? "";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", overflow: "hidden" }}>
      {/* Back button */}
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          position: "absolute", top: 56, left: 14, zIndex: 10002,
          width: 36, height: 36, borderRadius: 12,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
        data-testid="button-back"
      >
        <ArrowLeft style={{ width: 16, height: 16, color: "#fff" }} />
      </button>

      {/* Purchase activation toast — floats over the iframe once confirmed */}
      {purchaseConfirmed && (
        <div
          style={{
            position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
            zIndex: 10003, background: "rgba(34,197,94,0.95)",
            backdropFilter: "blur(12px)", borderRadius: 12, padding: "10px 18px",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 24px rgba(34,197,94,0.4)",
            animation: "aion-fadein 0.4s ease",
          }}
          data-testid="toast-purchase-confirmed"
        >
          <CheckCircle style={{ width: 16, height: 16, color: "#fff" }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: "Oxanium, sans-serif" }}>
            {trustboxSuccess ? "Trust Box activated!" : "Day-1 OG activated!"}
          </span>
        </div>
      )}

      {/* CSP-blocked fallback */}
      {cspBlocked && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10001, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 32px" }}>
          <img src={shieldLogo} alt="GUBER" style={{ width: 90, height: 90, objectFit: "contain", filter: "drop-shadow(0 0 24px rgba(180,60,255,0.55)) drop-shadow(0 0 12px rgba(0,230,200,0.4))" }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0, fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>AI or Not</p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>This browser is blocking the embedded game. Open it directly to play.</p>
          </div>
          <button
            onClick={() => window.open(externalUrl, "_blank", "noopener")}
            style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", border: "none", borderRadius: 16, padding: "14px 36px", cursor: "pointer", boxShadow: "0 0 24px rgba(34,197,94,0.45)" }}
            data-testid="button-open-ai-or-not"
          >
            Open AI or Not
          </button>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, textAlign: "center" }}>
            {(isStoreBuild || isDemoUser) ? "Opens in browser. Premium features available at guberapp.app." : "Opens in a new tab. Your credits and status sync automatically."}
          </p>
        </div>
      )}

      {/* Splash overlay */}
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 10001, background: "#000",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
          pointerEvents: (showContent || cspBlocked) ? "none" : "all",
          opacity: (showContent || cspBlocked) ? 0 : 1,
          transition: "opacity 0.6s ease",
        }}
      >
        <img src={shieldLogo} alt="GUBER" style={{ width: 130, height: 130, objectFit: "contain", filter: "drop-shadow(0 0 28px rgba(180,60,255,0.55)) drop-shadow(0 0 14px rgba(0,230,200,0.4))" }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0, fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>AI or Not</p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 5 }}>
            {purchaseActivating ? "Activating your purchase…" : "Powered by GUBER"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: purchaseActivating ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #b43cff, #00e6c8)", animation: `aion-bounce 1.3s ease-in-out ${i * 0.22}s infinite` }} />
          ))}
        </div>
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        src={signedUrl || undefined}
        onLoad={() => setIframeDidLoad(true)}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          border: "none", background: "#000",
          opacity: showContent ? 1 : 0,
          transition: "opacity 0.6s ease",
          pointerEvents: showContent ? "all" : "none",
        }}
        title="AI or Not"
        allow="camera; microphone"
        data-testid="iframe-ai-or-not"
      />

      <style>{`
        @keyframes aion-bounce {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
          40% { transform: scale(1.1); opacity: 1; }
        }
        @keyframes aion-fadein {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
