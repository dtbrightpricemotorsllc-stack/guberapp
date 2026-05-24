import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "@/components/guber-logo";

export default function GetStarted() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleIndividual = () => {
    localStorage.setItem("guber_account_intent", "individual");
    navigate("/signup?from=onboarding");
  };

  const handleBusiness = () => {
    localStorage.setItem("guber_account_intent", "business");
    navigate("/business-signup?from=onboarding");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] right-[10%] w-[400px] h-[400px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 60%)" }} />
        <div className="absolute bottom-[20%] left-[5%] w-[350px] h-[350px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, hsl(152 80% 50%), transparent 60%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <GuberLogo size="lg" />

        {/* Headline */}
        <h1 className="font-display font-black text-3xl text-white tracking-tight mt-8 text-center">
          Welcome to GUBER
        </h1>
        <p className="font-display text-sm text-muted-foreground mt-2 text-center">
          How will you use GUBER?
        </p>

        {/* Buttons */}
        <div className="w-full mt-10 space-y-3">
          <button
            onClick={handleIndividual}
            className="w-full rounded-2xl px-5 py-4 flex flex-col items-start text-left transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.08))",
              border: "1.5px solid rgba(34,197,94,0.4)",
            }}
            data-testid="button-individual"
          >
            <span className="font-display font-black text-base text-white">Individual</span>
            <span className="text-xs text-white/50 mt-0.5">Work, hire, earn locally</span>
          </button>

          <button
            onClick={handleBusiness}
            className="w-full rounded-2xl px-5 py-4 flex flex-col items-start text-left transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08))",
              border: "1.5px solid rgba(59,130,246,0.4)",
            }}
            data-testid="button-business"
          >
            <span className="font-display font-black text-base text-white">Business</span>
            <span className="text-xs text-white/50 mt-0.5">Hire, verify, promote</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground/40 text-center mt-6">
          You can switch account types later.
        </p>

        <p className="text-xs text-muted-foreground text-center mt-8">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-display font-semibold tracking-wider hover:underline" data-testid="link-login">
            LOG IN
          </Link>
        </p>
      </div>
    </div>
  );
}
