import { useState, useRef } from "react";
import { Link } from "wouter";
import { X, Loader2, Gem, Map as MapIcon, Target, ChevronRight } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { isIOS } from "@/lib/platform";
import { nativeGoogleSignIn, browserGoogleSignIn } from "@/lib/native-google-sign-in";
import { nativeAppleSignIn } from "@/lib/native-apple-sign-in";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";

const PERKS = [
  { icon: Gem, emoji: "💎", title: "Permanent 5% Platform Fee", desc: "Save money on every future task or cash drop." },
  { icon: MapIcon, emoji: "🗺️", title: "Secure Your Username", desc: "Lock in your territory before the map populates." },
  { icon: Target, emoji: "🎯", title: "Instant Launch Alerts", desc: "Be the first to know when live cash drops hit your area." },
];

export function SignUpWall({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const googleInFlightRef = useRef(false);

  const returnTo = "/dashboard";

  const handleGoogleSignIn = async () => {
    if (googleInFlightRef.current) return;
    googleInFlightRef.current = true;
    setGoogleLoading(true);
    if (isNative) {
      try {
        const result = await nativeGoogleSignIn();
        if (result.ok) {
          setLocation(result.accountType === "business" ? "/biz/dashboard" : "/dashboard", { replace: true });
        } else if (result.reason === "plugin_not_available") {
          const browserResult = await browserGoogleSignIn({ returnTo });
          if (browserResult.ok) {
            setLocation(browserResult.accountType === "business" ? "/biz/dashboard" : "/dashboard", { replace: true });
          } else if (browserResult.reason !== "cancelled") {
            toast({ title: "Sign-In Failed", description: browserResult.message || "Please try again.", variant: "destructive" });
          }
        } else if (result.reason !== "cancelled") {
          toast({ title: "Sign-In Failed", description: result.message || "Please try again.", variant: "destructive" });
        }
      } finally {
        setGoogleLoading(false);
        googleInFlightRef.current = false;
      }
    } else {
      const googleUrl = new URL(`${window.location.origin}/api/auth/google`);
      googleUrl.searchParams.set("returnTo", returnTo);
      window.location.href = googleUrl.toString();
    }
  };

  const handleAppleSignIn = async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      const result = await nativeAppleSignIn();
      if (result.ok) {
        setLocation(result.accountType === "business" ? "/biz/dashboard" : "/dashboard", { replace: true });
      } else if (result.reason !== "cancelled") {
        toast({ title: "Sign-In Failed", description: result.message || "Please try again.", variant: "destructive" });
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" data-testid="modal-signup-wall">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl z-10 overflow-hidden animate-slide-up"
        style={{
          background: "linear-gradient(180deg, hsl(152 30% 8%), hsl(0 0% 4%))",
          border: "1.5px solid rgba(0,229,118,0.3)",
          boxShadow: "0 0 60px rgba(0,229,118,0.12), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-20"
          data-testid="button-wall-close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-4">
          <img src={logoImg} alt="GUBER" className="h-11 object-contain" style={{ mixBlendMode: "screen" }} />
        </div>

        <h2 className="text-2xl font-display font-black tracking-tight text-center text-white leading-tight" data-testid="text-wall-headline">
          Bring your city's<br />
          <span style={{ color: "hsl(152 100% 44%)" }}>grid to life.</span>
        </h2>

        <p className="text-center text-[11px] font-display tracking-wide text-muted-foreground mt-2.5" data-testid="text-wall-subheadline">
          Account Creation: <span className="text-emerald-400 font-bold">100% Free</span> • No credit card required • No resumes.
        </p>

        <div className="mt-5 space-y-2.5">
          {PERKS.map(({ icon: Icon, emoji, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-xl px-3.5 py-2.5"
              style={{ background: "rgba(0,229,118,0.05)", border: "1px solid rgba(0,229,118,0.12)" }}
              data-testid={`perk-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "rgba(0,229,118,0.1)" }}>
                <Icon className="w-4 h-4" style={{ color: "#00E576" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-display font-black text-white leading-tight">{emoji} {title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] font-display font-semibold tracking-wide text-white/80 mt-5 mb-3" data-testid="text-wall-action">
          Tap below to enter the ecosystem instantly.
        </p>

        <div className="space-y-2.5">
          {!isIOS && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full h-12 rounded-xl font-display text-sm tracking-wider flex items-center justify-center gap-3 bg-white text-black hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-60"
              data-testid="button-wall-google"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>
          )}

          {(isIOS && isNative) && (
            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={appleLoading}
              className="w-full h-12 rounded-xl font-display text-sm tracking-wider flex items-center justify-center gap-3 bg-white text-black hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-60"
              data-testid="button-wall-apple"
            >
              {appleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="black">
                  <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09z"/>
                </svg>
              )}
              Continue with Apple
            </button>
          )}

          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-display tracking-[0.15em] text-sm premium-btn"
            data-testid="link-wall-email-signup"
          >
            SIGN UP WITH EMAIL
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-center text-muted-foreground text-xs mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-display font-semibold tracking-wider hover:underline" data-testid="link-wall-login">
            LOG IN
          </Link>
        </p>
      </div>
    </div>
  );
}
