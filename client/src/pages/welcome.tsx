import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import { ChevronRight, DollarSign, MapPin, Users, Crown } from "lucide-react";

export default function Welcome() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden" data-testid="page-welcome">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }} />
        <div className="absolute bottom-[20%] left-[20%] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, hsl(275 85% 62%), transparent 65%)" }} />
        <div className="absolute top-[60%] right-[10%] w-[300px] h-[300px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, hsl(200 80% 55%), transparent 65%)" }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-sm w-full relative z-10">
        <div className="relative mb-10 animate-fade-in">
          <div className="absolute inset-[-20px] blur-3xl opacity-25 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(152 100% 44% / 0.5), transparent 60%)" }} />
          <img
            src={logoImg}
            alt="GUBER - Global Unlimited Business & Employment Resource"
            className="w-[300px] max-w-[88vw] h-auto object-contain relative z-10"
            style={{ mixBlendMode: "screen" }}
            data-testid="img-logo"
          />
        </div>

        <p className="text-center text-muted-foreground text-sm font-display tracking-wider mb-2 animate-fade-in stagger-1">
          YOUR NEIGHBORHOOD. YOUR INCOME.
        </p>
        <p className="text-center text-muted-foreground/60 text-xs mb-10 animate-fade-in stagger-2 max-w-[280px] leading-relaxed">
          Turn your time and presence into real money. GUBER connects people to paid local work — and makes opportunity visible to everyone.
        </p>

        <div className="w-full space-y-3 mb-10">
          <Link href="/signup" className="block w-full animate-slide-up stagger-2">
            <Button
              className="w-full h-14 rounded-xl font-display tracking-[0.2em] text-base premium-btn relative overflow-hidden"
              size="lg"
              variant="default"
              data-testid="button-signup"
            >
              <span className="relative z-10 flex items-center gap-2">
                GET STARTED
                <ChevronRight className="w-5 h-5" />
              </span>
            </Button>
          </Link>

          <Link href="/login" className="block w-full animate-slide-up stagger-3">
            <Button
              variant="outline"
              size="lg"
              className="w-full h-14 rounded-xl font-display tracking-[0.2em] text-base btn-glass-premium"
              data-testid="button-login"
            >
              SIGN IN
            </Button>
          </Link>
        </div>

        <a
          href="https://guberapp.com/day1og.html"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2.5 rounded-xl px-4 py-3 mb-8 animate-fade-in stagger-4 group transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(180,120,0,0.15) 0%, rgba(245,165,0,0.1) 100%)",
            border: "1.5px solid rgba(245,175,0,0.35)",
            boxShadow: "0 0 16px rgba(245,165,0,0.07)",
          }}
          data-testid="link-og-promo-welcome"
        >
          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-display font-black tracking-widest text-amber-400">DAY-1 OG</span>
            <span className="ml-2 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
              LIMITED TIME
            </span>
            <p className="text-[10px] text-amber-200/60 font-display mt-0.5">Founding status · $1.99 one-time · Free urgent forever</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-amber-400/50 shrink-0" />
        </a>

        <div className="flex items-center gap-6 mb-8 animate-fade-in stagger-5">
          <div className="flex items-center gap-1.5 text-muted-foreground/50">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-[10px] font-display tracking-wider">EARN CASH</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground/50">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-[10px] font-display tracking-wider">LOCAL WORK</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground/50">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[10px] font-display tracking-wider">GET HIRED</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground/40 animate-fade-in stagger-5">
          <Link href="/terms" className="hover:text-foreground transition-colors font-display text-[10px] tracking-wider" data-testid="link-terms">TERMS</Link>
          <span className="w-px h-3 bg-white/10" />
          <Link href="/privacy" className="hover:text-foreground transition-colors font-display text-[10px] tracking-wider" data-testid="link-privacy">PRIVACY</Link>
        </div>
      </div>

      <footer className="py-6 text-center text-[10px] text-muted-foreground/30 relative z-10 font-display tracking-wider">
        GUBER APP LLC &mdash; GREENSBORO, NC
      </footer>
    </div>
  );
}
