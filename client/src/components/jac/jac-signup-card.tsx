/**
 * SignupCard — inline signup moment inside the GUBER door scene.
 *
 * Rendered by GuberDoorSplash at the conversation layer (still over the HQ
 * corridor, JAC still visible) when JAC's reply includes an
 * { action: "show_signup" } entry. The visitor signs up without leaving the
 * cinematic entry experience — on success they land on the standard
 * new-user onboarding flow.
 */
import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { nativeGoogleSignIn, browserGoogleSignIn } from "@/lib/native-google-sign-in";
import { jacResumeDashboardTarget } from "@/lib/jac-workflow";
import { transferGuestJacSession } from "@/hooks/use-guest-jac-session";

export interface SignupCardProps {
  /** Dismiss the card and keep talking to JAC. */
  onDismiss: () => void;
  /** Called after a successful native sign-in so the scene can exit. */
  onAuthed: (accountType?: string) => void | Promise<void>;
  /** Optional destination after authentication, for a draft JAC already prepared. */
  returnTo?: string;
}

export function SignupCard({ onDismiss, onAuthed, returnTo }: SignupCardProps) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const inFlightRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();
  const authReturnTo = returnTo || jacResumeDashboardTarget();

  async function handleGoogle() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setGoogleLoading(true);
    try {
      if (isNative) {
        const result = await nativeGoogleSignIn();
        if (result.ok) {
          await onAuthed(result.accountType);
          return;
        }
        if (result.reason === "plugin_not_available") {
          const browserResult = await browserGoogleSignIn({ returnTo: authReturnTo });
          if (browserResult.ok) {
            await onAuthed(browserResult.accountType);
            return;
          }
        }
      } else {
        await transferGuestJacSession();
        const googleUrl = new URL(`${window.location.origin}/api/auth/google`);
        // With no explicit work-in-progress destination, let auth-success route
        // from the resolved account type instead of forcing every user through
        // the consumer dashboard first.
        googleUrl.searchParams.set("returnTo", authReturnTo);
        window.location.href = googleUrl.toString();
        return; // full-page redirect — no state to reset
      }
    } finally {
      setGoogleLoading(false);
      inFlightRef.current = false;
    }
  }

  return (
    <div
      data-testid="card-jac-signup"
      style={{
        margin: "0 16px 8px",
        padding: "16px 16px 14px",
        borderRadius: 18,
        background: "linear-gradient(180deg, rgba(6,20,32,.92), rgba(2,8,18,.94))",
        border: "1px solid rgba(0,220,170,.4)",
        boxShadow: "0 0 32px rgba(0,200,150,.18), 0 8px 30px rgba(0,0,0,.55)",
        backdropFilter: "blur(10px)",
        animation: "bubble-in 320ms cubic-bezier(.22,1,.36,1) both",
      }}
    >
      <p style={{
        margin: 0,
        fontFamily: "'Bebas Neue','Inter',sans-serif",
        fontSize: "clamp(17px,5vw,22px)",
        letterSpacing: ".08em",
        color: "#fff",
        textShadow: "0 0 14px rgba(0,220,170,.45)",
      }}>
        READY TO GET STARTED?
      </p>
      <p style={{
        margin: "4px 0 12px",
        fontSize: "clamp(12px,3.4vw,14px)",
        lineHeight: 1.4,
        color: "rgba(255,255,255,.72)",
        fontFamily: "'Inter',sans-serif",
      }}>
        Create your free GUBER account — I'll keep everything we talked about ready for you.
      </p>

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        data-testid="button-jac-signup-google"
        style={{
          width: "100%", height: 46, borderRadius: 12,
          background: "#fff", color: "#111", border: "none",
          cursor: "pointer", fontFamily: "'Inter',sans-serif",
          fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          opacity: googleLoading ? 0.6 : 1,
          transition: "opacity 150ms ease, transform 120ms ease",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {googleLoading ? "Connecting…" : "Continue with Google"}
      </button>

      {/* Phone / email — standard signup flow */}
      <button
        type="button"
        onClick={async () => {
          await transferGuestJacSession();
          const signupUrl = new URL("/signup", window.location.origin);
          signupUrl.searchParams.set("from", "jac");
          if (authReturnTo) {
            signupUrl.searchParams.set("intent", "worker");
            signupUrl.searchParams.set("returnTo", authReturnTo);
          }
          window.location.href = signupUrl.pathname + signupUrl.search;
        }}
        data-testid="button-jac-signup-phone"
        style={{
          width: "100%", height: 46, borderRadius: 12, marginTop: 8,
          background: "rgba(0,200,140,.16)", color: "rgba(0,230,160,.95)",
          border: "1px solid rgba(0,200,140,.45)", cursor: "pointer",
          fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600,
        }}
      >
        Sign up with phone or email
      </button>

      {/* Keep talking */}
      <button
        type="button"
        onClick={onDismiss}
        data-testid="button-jac-signup-dismiss"
        style={{
          width: "100%", marginTop: 10, padding: "4px 0",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "rgba(255,255,255,.45)",
          fontFamily: "'Inter',sans-serif", letterSpacing: ".04em",
        }}
      >
        Not yet — keep talking to JAC
      </button>
    </div>
  );
}
