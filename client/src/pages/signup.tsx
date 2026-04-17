import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Eye, EyeOff, Check, X, ShieldCheck } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One capital letter", ok: /[A-Z]/.test(password) },
    { label: "One symbol (!@#$%...)", ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="space-y-1.5 mt-2">
      {checks.map((c) => (
        <div key={c.label} className={`flex items-center gap-2 text-[11px] font-display transition-colors ${c.ok ? "text-primary" : "text-muted-foreground"}`}>
          {c.ok ? <Check className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
          {c.label}
        </div>
      ))}
    </div>
  );
}

export default function Signup() {
  const { signup } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const rawReturnTo = new URLSearchParams(search).get("returnTo") || "";
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", username: "", fullName: "", password: "", zipcode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setRefCode(ref);
      localStorage.setItem("guber_ref", ref);
    } else {
      const stored = localStorage.getItem("guber_ref");
      if (stored) setRefCode(stored);
    }
  }, []);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const passwordValid = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast({ title: "Weak Password", description: "Password must be 8+ chars with a capital letter and symbol.", variant: "destructive" });
      return;
    }
    if (!termsAgreed) {
      toast({ title: "Agreement Required", description: "Please agree to the Terms of Service, Privacy Policy, and Acceptable Use Policy to continue.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await signup({ ...form, referralCode: refCode || undefined } as any);
      localStorage.removeItem("guber_ref");
      setLocation(returnTo || "/dashboard");
    } catch (err: any) {
      toast({ title: "Signup Failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const isNative = Capacitor.isNativePlatform();
    const authUrl = `${window.location.origin}/api/auth/google${isNative ? "?native=1" : ""}`;
    if (refCode) {
      await fetch("/api/auth/store-ref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: refCode }) }).catch(() => {});
    }
    if (isNative) {
      await Browser.open({ url: authUrl });
      setGoogleLoading(false);
    } else {
      window.location.href = authUrl;
    }
  };

  return (
    <InAppBrowserGate>
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-8 relative overflow-hidden" data-testid="page-signup">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] right-[25%] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, hsl(275 85% 62%), transparent 65%)" }} />
        <div className="absolute bottom-[25%] left-[20%] w-[350px] h-[350px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider mb-8 transition-colors" data-testid="link-back">
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK
        </Link>

        <div className="text-center space-y-2 mb-8 animate-fade-in">
          <GuberLogo size="lg" />
          <p className="text-muted-foreground text-xs font-display tracking-[0.2em]">CREATE YOUR ACCOUNT</p>
          <p className="text-muted-foreground/40 text-[11px] font-display leading-relaxed max-w-[240px] mx-auto">
            Start earning in your neighborhood today
          </p>
        </div>

        <div className="glass-card rounded-2xl p-7 premium-border-glow animate-slide-up stagger-1">
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 mb-5 rounded-xl border-white/[0.15] font-display text-sm tracking-wider flex items-center gap-3 hover:bg-white/[0.04] transition-all"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            data-testid="button-google-signup"
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
            Sign up with Google
          </Button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-muted-foreground/40 font-display tracking-widest">OR</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">EMAIL ADDRESS</Label>
              <Input value={form.email} onChange={update("email")} type="email" className="premium-input rounded-xl h-12 text-foreground text-sm px-4" placeholder="your@email.com" required data-testid="input-email" />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">USERNAME</Label>
              <Input value={form.username} onChange={update("username")} type="text" className="premium-input rounded-xl h-12 text-foreground text-sm px-4" placeholder="Choose a username" required data-testid="input-username" />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">FULL NAME</Label>
              <Input value={form.fullName} onChange={update("fullName")} type="text" className="premium-input rounded-xl h-12 text-foreground text-sm px-4" placeholder="Your full name" required data-testid="input-fullname" />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">ZIP CODE <span className="text-muted-foreground/30 text-[10px]">(Optional)</span></Label>
              <Input value={form.zipcode} onChange={update("zipcode")} type="text" className="premium-input rounded-xl h-12 text-foreground text-sm px-4" placeholder="Your zip code" data-testid="input-zipcode" />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">
                REFERRAL CODE <span className="text-muted-foreground/30 text-[10px]">(Optional)</span>
              </Label>
              <div className="relative">
                <Input
                  value={refCode || ""}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase() || null)}
                  type="text"
                  maxLength={6}
                  className="premium-input rounded-xl h-12 text-foreground text-sm px-4 font-mono tracking-widest uppercase"
                  placeholder="e.g. 9KUVPX"
                  data-testid="input-referral-code"
                />
                {refCode && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-display text-primary font-semibold tracking-wider">
                    APPLIED
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">PASSWORD</Label>
              <div className="relative">
                <Input
                  value={form.password}
                  onChange={update("password")}
                  type={showPassword ? "text" : "password"}
                  className="premium-input rounded-xl h-12 text-foreground text-sm px-4 pr-12"
                  placeholder="Create a strong password"
                  required
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={form.password} />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
                <span className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">By creating an account, you acknowledge that:</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                {[
                  "GUBER is a technology platform connecting independent users",
                  "Service providers are independent contractors, not employees of GUBER",
                  "GUBER is not responsible for the acts, quality, safety, legality, or performance of services",
                  "You are responsible for complying with applicable laws and acting safely",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
                    <span className="text-primary/40 mt-0.5 flex-shrink-0">·</span>
                    {item}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-3 cursor-pointer group mt-2" data-testid="label-terms-agree">
                <div
                  onClick={() => setTermsAgreed(!termsAgreed)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    termsAgreed
                      ? "bg-primary border-primary"
                      : "border-white/20 bg-transparent group-hover:border-primary/40"
                  }`}
                  data-testid="checkbox-terms-agree"
                >
                  {termsAgreed && <Check className="w-3 h-3 text-background font-bold" strokeWidth={3} />}
                </div>
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  I agree to the GUBER{" "}
                  <Link href="/terms" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Terms of Service</Link>,{" "}
                  <Link href="/privacy" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>, and{" "}
                  <Link href="/acceptable-use" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Acceptable Use Policy</Link>
                </span>
              </label>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading || !passwordValid || !termsAgreed}
                size="lg"
                className="w-full h-14 font-display text-base tracking-[0.2em] rounded-xl premium-btn bg-secondary hover:bg-secondary/90 text-secondary-foreground disabled:opacity-50"
                data-testid="button-signup-submit"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "CREATE ACCOUNT"}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8 animate-fade-in stagger-3">
          Already have an account?{" "}
          <Link href="/login" className="guber-text-green font-display font-semibold hover:underline tracking-wider" data-testid="link-login">
            LOG IN
          </Link>
        </p>
        <div className="mt-6 animate-fade-in stagger-3">
          <div
            className="rounded-xl px-5 py-4 text-center"
            style={{ background: "rgba(198,168,92,0.04)", border: "1px solid rgba(198,168,92,0.14)" }}
          >
            <p className="text-[10px] mb-1.5 font-display tracking-[0.14em] uppercase" style={{ color: "#6B6B6B" }}>
              Looking for business access?
            </p>
            <Link
              href="/business-signup"
              className="inline-block text-[13px] font-display font-bold tracking-[0.06em] transition-all hover:opacity-80"
              style={{ color: "#C6A85C" }}
              data-testid="link-business-signup"
            >
              Enter GUBER Business →
            </Link>
            <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "#3F3F46" }}>
              Private access for companies seeking proven workers, local coverage, and live promotional reach.
            </p>
          </div>
        </div>
      </div>
    </div>
    </InAppBrowserGate>
  );
}
