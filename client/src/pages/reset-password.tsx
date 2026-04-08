import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Eye, EyeOff, Check, X, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
        <div key={c.label} className={`flex items-center gap-2 text-[11px] font-display transition-colors ${c.ok ? "text-primary" : "text-muted-foreground/50"}`}>
          {c.ok ? <Check className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
          {c.label}
        </div>
      ))}
    </div>
  );
}

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordValid = password.length >= 8 && /[A-Z]/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast({ title: "Weak Password", description: "Meet all password requirements first.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords Don't Match", description: "Make sure both passwords match.", variant: "destructive" });
      return;
    }
    if (!token) {
      toast({ title: "Invalid Link", description: "This reset link is invalid or expired.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, password });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Reset failed");
      }
      setDone(true);
    } catch (err: any) {
      toast({ title: "Reset Failed", description: err.message || "Please request a new reset link.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-foreground font-display font-bold mb-2">Invalid Reset Link</p>
          <p className="text-sm text-muted-foreground/60 mb-6">This link is invalid or has expired.</p>
          <Link href="/forgot-password">
            <Button className="premium-btn rounded-xl font-display tracking-wider">Request New Link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden" data-testid="page-reset-password">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, hsl(275 85% 62%), transparent 65%)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK TO LOGIN
        </Link>

        <div className="text-center space-y-3 mb-10 animate-fade-in">
          <GuberLogo size="lg" />
          <p className="text-muted-foreground/60 text-xs font-display tracking-[0.2em]">CREATE NEW PASSWORD</p>
        </div>

        {done ? (
          <div className="glass-card rounded-2xl p-8 premium-border-glow animate-slide-up text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="font-display font-bold text-lg mb-2">Password Updated!</h2>
            <p className="text-sm text-muted-foreground/70 mb-6">Your password has been successfully updated. You can now log in.</p>
            <Link href="/login">
              <Button className="w-full h-12 rounded-xl premium-btn font-display tracking-wider">
                GO TO LOGIN
              </Button>
            </Link>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-7 premium-border-glow animate-slide-up">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-muted-foreground/70 text-[11px] font-display tracking-[0.15em]">NEW PASSWORD</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="premium-input rounded-xl h-12 text-foreground text-sm px-4 pr-12"
                    placeholder="Create a strong password"
                    required
                    data-testid="input-password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground/70 text-[11px] font-display tracking-[0.15em]">CONFIRM PASSWORD</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`premium-input rounded-xl h-12 text-foreground text-sm px-4 pr-12 ${confirm && confirm !== password ? "border-destructive/40" : ""}`}
                    placeholder="Confirm your password"
                    required
                    data-testid="input-confirm-password"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p className="text-[11px] text-destructive font-display">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !passwordValid || password !== confirm}
                size="lg"
                className="w-full h-14 font-display text-base tracking-[0.2em] rounded-xl premium-btn disabled:opacity-50"
                data-testid="button-reset-submit"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "UPDATE PASSWORD"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
