import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, ArrowLeft, Eye, EyeOff, Check, X, ShieldCheck, Building2,
} from "lucide-react";

const INDUSTRIES = [
  "Insurance / Claims",
  "Auto / Dealer / Auction",
  "Property / Real Estate",
  "Field Services",
  "Staffing / Recruiting",
  "Retail / Mystery Shopping",
  "Logistics / Delivery / Coverage",
  "Research / Market Checks",
  "Asset Verification / Inspections",
  "Other",
];

const GOLD = "#C6A85C";
const PURPLE = "#7B3FE4";

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
        <div key={c.label} className={`flex items-center gap-2 text-[11px] font-display transition-colors`} style={{ color: c.ok ? "#22C55E" : "#6B6B6B" }}>
          {c.ok ? <Check className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
          {c.label}
        </div>
      ))}
    </div>
  );
}

export default function BusinessSignup() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && user.accountType === "business") {
      setLocation("/biz/dashboard");
    }
  }, [user, setLocation]);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    workEmail: "",
    phone: "",
    industry: "",
    companyNeedsSummary: "",
    fullName: "",
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const passwordValid =
    form.password.length >= 8 &&
    /[A-Z]/.test(form.password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password);

  const updateForm = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast({ title: "Weak Password", description: "Password must be 8+ chars with a capital letter and symbol.", variant: "destructive" });
      return;
    }
    if (!termsAgreed) {
      toast({ title: "Agreement Required", description: "Please agree to the Terms of Service and Business Terms to continue.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/business-access-request", form);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/biz/dashboard");
    } catch (err: any) {
      let msg = err.message || "Please try again";
      try {
        const match = msg.match(/^\d+: (.+)$/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          msg = parsed.message || msg;
        }
      } catch {}
      toast({ title: "Request Failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#000000" }} data-testid="page-business-signup">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] right-[15%] w-[500px] h-[500px] rounded-full opacity-[0.06]"
          style={{ background: `radial-gradient(circle, ${PURPLE}, transparent 60%)` }} />
        <div className="absolute bottom-[15%] left-[10%] w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: `radial-gradient(circle, ${GOLD}, transparent 60%)` }} />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-6 py-12">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 text-xs font-display tracking-wider mb-10 transition-colors"
          style={{ color: "#6B6B6B" }}
          data-testid="link-back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK
        </Link>

        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-5">
            <GuberLogo size="lg" />
            <span className="text-xs font-display font-bold tracking-[0.25em]" style={{ color: GOLD }}>BUSINESS</span>
          </div>
          <p className="text-[10px] font-display font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "#A88A43" }}>
            PRIVATE BUSINESS ACCESS
          </p>
          <h1 className="text-2xl font-display font-black text-white tracking-tight mb-2">Enter GUBER Business</h1>
          <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#A1A1A1" }}>
            Private access for companies seeking proven people, local coverage, and live promotional reach.
          </p>
          <p className="text-xs leading-relaxed max-w-[300px] mx-auto mt-2" style={{ color: "#6B6B6B" }}>
            Scout workers based on real performance. Send direct offers. Sponsor live GUBER cash drops.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
          <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-base font-display font-bold text-white mb-1 tracking-tight">Request Access</h2>
            <p className="text-[11px]" style={{ color: "#3F3F46" }}>
              Fill in your company details below to begin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>YOUR COMPANY</p>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>LEGAL BUSINESS NAME *</Label>
                <Input value={form.businessName} onChange={updateForm("businessName")} type="text" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: "#FFFFFF" }} placeholder="e.g. Acme Corporation LLC" required data-testid="input-business-name" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>WORK EMAIL *</Label>
                <Input value={form.workEmail} onChange={updateForm("workEmail")} type="email" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: "#FFFFFF" }} placeholder="you@company.com" required data-testid="input-work-email" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>PHONE</Label>
                <Input value={form.phone} onChange={updateForm("phone")} type="tel" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: "#FFFFFF" }} placeholder="555-000-0000" data-testid="input-phone" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>INDUSTRY *</Label>
                <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}>
                  <SelectTrigger className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: form.industry ? "#FFFFFF" : "#6B6B6B" }} data-testid="select-industry">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>WHAT DO YOU USE PEOPLE FOR?</Label>
                <Textarea
                  value={form.companyNeedsSummary}
                  onChange={updateForm("companyNeedsSummary")}
                  placeholder="Brief summary of your staffing or scouting needs..."
                  className="rounded-xl text-sm px-4 py-3 min-h-[70px] border-0"
                  style={{ background: "#121212", color: "#FFFFFF" }}
                  maxLength={500}
                  data-testid="input-company-needs"
                />
              </div>
            </div>

            <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            <div className="space-y-4">
              <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>YOUR ACCOUNT</p>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>FULL NAME *</Label>
                <Input value={form.fullName} onChange={updateForm("fullName")} type="text" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: "#FFFFFF" }} placeholder="Your full name" required data-testid="input-fullname" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>USERNAME *</Label>
                <Input value={form.username} onChange={updateForm("username")} type="text" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: "#121212", color: "#FFFFFF" }} placeholder="Choose a username" required data-testid="input-username" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-display tracking-[0.12em] uppercase" style={{ color: "#6B6B6B" }}>PASSWORD *</Label>
                <div className="relative">
                  <Input
                    value={form.password}
                    onChange={updateForm("password")}
                    type={showPassword ? "text" : "password"}
                    className="rounded-xl h-11 text-sm px-4 pr-12 border-0"
                    style={{ background: "#121212", color: "#FFFFFF" }}
                    placeholder="Create a strong password"
                    required
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                    style={{ color: "#6B6B6B" }}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={form.password} />
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "#050505", border: "1px solid rgba(255,255,255,0.04)" }}>
              <label className="flex items-start gap-3 cursor-pointer group" data-testid="label-terms-agree">
                <div
                  onClick={() => setTermsAgreed(!termsAgreed)}
                  className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={termsAgreed ? { background: GOLD, borderColor: GOLD } : { borderColor: "rgba(255,255,255,0.15)", background: "transparent" }}
                  data-testid="checkbox-terms-agree"
                >
                  {termsAgreed && <Check className="w-3 h-3 text-black font-bold" strokeWidth={3} />}
                </div>
                <span className="text-[11px] leading-relaxed" style={{ color: "#6B6B6B" }}>
                  I agree to the GUBER{" "}
                  <Link href="/terms" className="hover:underline font-semibold" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()} data-testid="link-terms">Terms of Service</Link>,{" "}
                  <Link href="/privacy" className="hover:underline font-semibold" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()} data-testid="link-privacy">Privacy Policy</Link>, and{" "}
                  <Link href="/acceptable-use" className="hover:underline font-semibold" style={{ color: GOLD }} onClick={(e) => e.stopPropagation()} data-testid="link-business-terms">Business Terms</Link>
                </span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading || !passwordValid || !termsAgreed || !form.workEmail || !form.username || !form.fullName || !form.businessName || !form.industry}
              size="lg"
              className="w-full h-14 font-display text-[12px] tracking-[0.2em] rounded-xl disabled:opacity-30 text-black font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #A88A43)`, boxShadow: "0 4px 20px rgba(168,138,67,0.18)", border: "1px solid rgba(198,168,92,0.22)" }}
              data-testid="button-request-access"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "REQUEST ACCESS"}
            </Button>
            <p className="text-center text-[10px] leading-relaxed pt-1" style={{ color: "#3F3F46" }}>
              Access is reviewed to maintain network quality.
            </p>
          </form>
        </div>
        </div>

        <p className="text-center text-sm" style={{ color: "#6B6B6B" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-display font-semibold hover:underline tracking-wider" style={{ color: GOLD }} data-testid="link-login">
            LOG IN
          </Link>
        </p>
        <p className="text-center text-xs mt-3 pb-4" style={{ color: "#4A4A4A" }}>
          Not a business?{" "}
          <Link href="/signup" className="font-display hover:underline tracking-wider" style={{ color: PURPLE }} data-testid="link-personal-signup">
            Sign up as an individual
          </Link>
        </p>
      </div>
    </div>
  );
}
