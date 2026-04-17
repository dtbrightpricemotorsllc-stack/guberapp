import { useState } from "react";
import { Link } from "wouter";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
      const data = await res.json();
      setSent(true);
      if (data.resetUrl) {
        setDevResetUrl(data.resetUrl);
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden" data-testid="page-forgot-password">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK TO LOGIN
        </Link>

        <div className="text-center space-y-3 mb-10 animate-fade-in">
          <GuberLogo size="lg" />
          <p className="text-muted-foreground text-xs font-display tracking-[0.2em]">RESET YOUR PASSWORD</p>
        </div>

        {sent ? (
          <div className="glass-card rounded-2xl p-8 premium-border-glow animate-slide-up text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="font-display font-bold text-lg mb-2">Check your email</h2>
            <p className="text-sm text-muted-foreground mb-6">
              If <span className="text-foreground font-semibold">{email}</span> has an account, a reset link has been sent.
            </p>
            {devResetUrl && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4 text-left">
                <p className="text-[10px] text-amber-400 font-display font-bold tracking-wider mb-2">DEV MODE — RESET LINK:</p>
                <a href={devResetUrl} className="text-xs text-primary break-all hover:underline">{devResetUrl}</a>
              </div>
            )}
            <Link href="/login">
              <Button variant="outline" className="w-full h-12 rounded-xl border-white/[0.15] font-display tracking-wider">
                Back to Login
              </Button>
            </Link>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-7 premium-border-glow animate-slide-up">
            <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <Mail className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-xs text-muted-foreground/80 font-display">
                Enter the email address linked to your account. We'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px] font-display tracking-[0.15em]">EMAIL ADDRESS</Label>
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

              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full h-14 font-display text-base tracking-[0.2em] rounded-xl premium-btn"
                data-testid="button-send-reset"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "SEND RESET LINK"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
