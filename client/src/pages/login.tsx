import { useState, useEffect, useRef } from "react";
import { reportIssue } from "@/lib/report-issue";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Eye, EyeOff, Sparkles, Building2 } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { Capacitor } from "@capacitor/core";
import { isIOS, isStoreBuild } from "@/lib/platform";
import { nativeGoogleSignIn, browserGoogleSignIn } from "@/lib/native-google-sign-in";
import { getToken } from "@/lib/token-storage";
import { setGoogleAuthPhase } from "@/components/google-auth-overlay";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<"consumer" | "business" | null>(null);
  const isNative = Capacitor.isNativePlatform();

  // Synchronous in-flight lock for the Google sign-in handler — see comment in handler below.
  const googleInFlightRef = useRef(false);

  // 5-taps-on-the-logo demo shortcut. The Demo Consumer/Demo Business buttons
  // below are already visible on store builds, but App Review notes have
  // historically told reviewers to "tap the logo 5 times to sign in" — this
  // wires that up so it actually does something instead of being dead UI
  // (see docs/app-store-rejection-2026-07.md, "app not responsive when
  // tapping the logo 5 times").
  const logoTapCountRef = useRef(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = () => {
    if (!isStoreBuild) return;
    logoTapCountRef.current += 1;
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);
    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      handleDemoLogin("consumer");
      return;
    }
    logoTapTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0;
    }, 600);
  };

  useEffect(() => {
    const params = new URLSearchParams(search);
    const error = params.get("error");
    const reason = params.get("reason");
    if (reason === "session_expired") toast({ title: "Session Expired", description: "Your session expired — please sign in again." });
    else if (error === "banned") toast({ title: "Account Banned", description: "This account has been permanently banned.", variant: "destructive" });
    else if (error === "suspended") toast({ title: "Account Suspended", description: "This account is currently suspended.", variant: "destructive" });
    else if (error === "google_failed") toast({ title: "Google Sign-In Failed", description: "Please try again.", variant: "destructive" });
    else if (error === "google_cancelled") toast({ title: "Sign-In Cancelled", description: "Google sign-in was cancelled." });
    else if (error === "invalid_state") {
      getToken().then((token) => {
        if (token) {
          setLocation(returnTo || "/dashboard");
        } else {
          toast({ title: "Sign-In Link Expired", description: "That sign-in link already expired. Please tap 'Continue with Google' again.", variant: "destructive" });
        }
      });
    }
    else if (error === "not_configured") toast({ title: "Not Available", description: "Google Sign-In is not configured yet.", variant: "destructive" });
  }, [search]);

  const rawReturnTo = new URLSearchParams(search).get("returnTo") || "";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      if (returnTo) {
        setLocation(returnTo);
      } else if (loggedInUser?.accountType === "business") {
        setLocation("/biz/dashboard");
      } else {
        setLocation("/dashboard");
      }
    } catch (err: any) {
      toast({ title: "Login Failed", description: err.message || "Invalid credentials", variant: "destructive" });
      // Only report system failures (network / 5xx) — wrong credentials (401/403)
      // are expected user error, not an outage worth alerting on.
      const status = err?.status;
      if (status === undefined || status >= 500) {
        reportIssue({ module: "login", attemptedAction: "password-login", error: err, blocked: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    // Re-entry guard — second tap before the first attempt resolves is a no-op.
    // Use a synchronous ref so back-to-back taps in the same JS turn can't slip
    // through before React commits the loading state.
    if (googleInFlightRef.current) return;
    googleInFlightRef.current = true;
    setGoogleLoading(true);
    setGoogleAuthPhase("connecting");
    if (isNative) {
      try {
        const result = await nativeGoogleSignIn();
        if (result.ok) {
          setGoogleAuthPhase("completing");
          // Navigate immediately — the global overlay survives the route change
          // and is cleared once the destination has had time to mount.
          setLocation(returnTo || (result.accountType === "business" ? "/biz/dashboard" : "/dashboard"), { replace: true });
          setTimeout(() => setGoogleAuthPhase(null), 600);
        } else if (result.reason === "plugin_not_available") {
          // Only the genuine "plugin missing from build" path falls back to
          // the in-app browser. Misconfiguration (wrong SHA-1, missing
          // Web client ID) used to land here too and silently obscured the
          // real problem behind a browser-redirect — that fallback is now
          // gated to true plugin absence.
          const browserResult = await browserGoogleSignIn({
            returnTo: returnTo || undefined,
            onPhaseChange: (phase) => {
              if (phase === "completing") setGoogleAuthPhase("completing");
            },
          });
          if (browserResult.ok) {
            setGoogleAuthPhase("completing");
            setLocation(returnTo || (browserResult.accountType === "business" ? "/biz/dashboard" : "/dashboard"), { replace: true });
            setTimeout(() => setGoogleAuthPhase(null), 600);
          } else if (browserResult.reason !== "cancelled") {
            setGoogleAuthPhase(null);
            toast({ title: "Sign-In Failed", description: browserResult.message || "Please try again.", variant: "destructive" });
          } else {
            setGoogleAuthPhase(null);
          }
        } else if (result.reason === "misconfigured") {
          setGoogleAuthPhase(null);
          toast({
            title: "Google Sign-In Setup Issue",
            description: result.message || "This build isn't authorized for Google Sign-In yet.",
            variant: "destructive",
          });
        } else if (result.reason !== "cancelled") {
          setGoogleAuthPhase(null);
          toast({ title: "Sign-In Failed", description: result.message || "Please try again.", variant: "destructive" });
        } else {
          setGoogleAuthPhase(null);
        }
      } finally {
        setGoogleLoading(false);
        googleInFlightRef.current = false;
      }
    } else {
      // Web/PWA: full-page redirect. Show the overlay so the moment of "leaving
      // the app" feels like a controlled handoff instead of a blank flash.
      const googleUrl = new URL(`${window.location.origin}/api/auth/google`);
      if (returnTo) googleUrl.searchParams.set("returnTo", returnTo);
      // Safety net: if navigation is blocked (popup blocker, very rare), clear
      // the overlay after 10s so the user isn't stranded behind it.
      setTimeout(() => {
        setGoogleAuthPhase(null);
        setGoogleLoading(false);
        googleInFlightRef.current = false;
      }, 10000);
      window.location.href = googleUrl.toString();
    }
  };

  const handleDemoLogin = async (type: "consumer" | "business") => {
    setDemoLoading(type);
    try {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Demo login failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      setLocation(data.redirectTo);
    } catch (err: any) {
      toast({ title: "Demo Login Failed", description: err.message, variant: "destructive" });
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <InAppBrowserGate>
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden" data-testid="page-login">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[25%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06]"
            style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }} />
          <div className="absolute bottom-[30%] right-[15%] w-[300px] h-[300px] rounded-full opacity-[0.04]"
            style={{ background: "radial-gradient(circle, hsl(275 85% 62%), transparent 65%)" }} />
        </div>

        <div className="w-full max-w-sm relative z-10">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider transition-colors" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              BACK
            </Link>
            <Link href="/biz/login" className="inline-flex items-center gap-1.5 text-[11px] text-yellow-500/80 hover:text-yellow-400 font-display tracking-wider transition-colors" data-testid="link-business-signin-top">
              <Building2 className="w-3.5 h-3.5" />
              BUSINESS SIGN IN →
            </Link>
          </div>

          <div className="text-center space-y-3 mb-10 animate-fade-in">
            <div
              className="inline-block select-none"
              data-testid="logo-tap-trigger"
              onClick={handleLogoTap}
            >
              <GuberLogo size="lg" />
            </div>
            <p className="text-muted-foreground text-xs font-display tracking-[0.2em]">SIGN IN TO YOUR ACCOUNT</p>
          </div>

          <div className="glass-card rounded-2xl p-7 premium-border-glow animate-slide-up stagger-1">
            {!isIOS && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 rounded-xl font-display text-sm tracking-wider flex items-center gap-3 btn-glass-premium"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  data-testid="button-google-signin"
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
                </Button>

                <p className="text-center text-[11px] text-muted-foreground/70 mt-2 mb-5 leading-relaxed" data-testid="text-google-helper">
                  {isNative
                    ? "Secure Google sign-in will open briefly and return you automatically."
                    : "A Google sign-in window will open — allow popups if prompted."}
                </p>
              </>
            )}


            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[10px] text-muted-foreground font-display tracking-widest">OR</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]" data-testid="label-email">EMAIL ADDRESS</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="premium-input rounded-xl h-12 text-foreground text-sm px-4"
                  placeholder="your@email.com"
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]" data-testid="label-password">PASSWORD</Label>
                  <Link href="/forgot-password" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="premium-input rounded-xl h-12 text-foreground text-sm px-4 pr-12"
                    placeholder="Enter password"
                    required
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors p-1"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full h-14 font-display text-base tracking-[0.2em] rounded-xl premium-btn"
                data-testid="button-login-submit"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "LOGIN"}
              </Button>
            </form>

            {/* iOS-only helper note for existing Google web users */}
            {isIOS && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-[11px] text-muted-foreground/80 leading-relaxed" data-testid="text-google-user-hint">
                  Already use GUBER on the web with Google?{" "}
                  <Link href="/forgot-password" className="text-primary/80 hover:text-primary underline" data-testid="link-google-set-password">
                    Set a password here
                  </Link>{" "}
                  to use the app — don't sign up again or you'll create a duplicate account.
                </p>
              </div>
            )}

            {/* Demo login — always visible on store builds so reviewers can access instantly */}
            {isStoreBuild && (
              <div className="mt-5 pt-5 border-t border-white/[0.06]" data-testid="demo-login-section">
                <p className="text-[10px] text-muted-foreground font-display tracking-widest text-center mb-3">REVIEWER DEMO ACCESS</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-primary/20 text-primary/80 hover:bg-primary/10 flex items-center justify-center gap-2"
                    onClick={() => handleDemoLogin("consumer")}
                    disabled={demoLoading !== null}
                    data-testid="button-demo-consumer"
                  >
                    {demoLoading === "consumer" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Demo Consumer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-yellow-500/20 text-yellow-500/80 hover:bg-yellow-500/10 flex items-center justify-center gap-2"
                    onClick={() => handleDemoLogin("business")}
                    disabled={demoLoading !== null}
                    data-testid="button-demo-business"
                  >
                    {demoLoading === "business" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5" />
                    )}
                    Demo Business
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 text-center animate-fade-in stagger-3">
            <p className="text-sm text-muted-foreground">
              New to GUBER?{" "}
              <Link href={returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : "/signup"} className="guber-text-purple font-display font-semibold hover:underline tracking-wider" data-testid="link-signup">
                SIGN UP
              </Link>
            </p>
          </div>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
