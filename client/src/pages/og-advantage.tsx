import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Crown, CheckCircle, Zap, Lock, Star, ArrowRight, ChevronLeft, Shield, Gift, Copy, Coins, Users } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import day1OGImg from "@assets/Gubergoldday1_1772434950756.png";

const PERKS = [
  {
    icon: Zap,
    color: "#fbbf24",
    title: "Permanent 5% Fee Discount",
    desc: "Your platform fee is locked in at 5% lower than the standard rate — forever, regardless of future pricing changes.",
  },
  {
    icon: Crown,
    color: "#f59e0b",
    title: "Day-1 OG Badge",
    desc: "A permanent gold badge on your profile marking you as a founding member of the GUBER community.",
  },
  {
    icon: Star,
    color: "#fbbf24",
    title: "Early Supporter Status",
    desc: "Priority access to new features, beta programs, and platform updates before they roll out to the general public.",
  },
  {
    icon: Gift,
    color: "#f59e0b",
    title: "Founder Community Access",
    desc: "Direct line to the GUBER founding team. Your feedback shapes the platform. You helped build this.",
  },
  {
    icon: Shield,
    color: "#fbbf24",
    title: "Trust Score Boost",
    desc: "OG members receive an elevated starting trust score, giving you an edge in job applications and hiring decisions.",
  },
  {
    icon: Lock,
    color: "#f59e0b",
    title: "Rate Lock Guarantee",
    desc: "Your discounted fee rate is grandfathered in. If GUBER raises fees in the future, your rate stays the same.",
  },
];

const HOW_TO_QUALIFY = [
  "Create a free GUBER account",
  "Complete ID verification",
  "Join before Day-1 OG slots close",
  "Remain an active community member",
];

interface AuthUser {
  id: number;
  username: string;
  referralCode: string | null;
  day1OG?: boolean;
  growthCredits?: number;
  pendingCredits?: number;
}

interface ReferralSummary {
  totalReferrals: number;
  verifiedReferrals: number;
  creditsFromReferrals: number;
}

function ReferralPanel({ user }: { user: AuthUser }) {
  const { toast } = useToast();
  const referralLink = user.referralCode
    ? `${window.location.origin}/join/${user.referralCode}`
    : null;

  const { data: refStats } = useQuery<ReferralSummary>({
    queryKey: ["/api/credits/referral-stats"],
    enabled: !!user,
  });

  function copyLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() =>
      toast({ title: "Referral link copied!", description: "Share it to earn credits." })
    );
  }

  return (
    <div className="rounded-2xl p-6 mb-10"
      style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.1) 0%,rgba(180,83,9,0.06) 100%)", border: "1.5px solid rgba(245,158,11,0.35)" }}
      data-testid="card-referral-panel">

      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-display font-black tracking-wider text-amber-300">YOUR REFERRAL LINK</h2>
        {user.day1OG && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-display font-bold"
            style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
            +25% OG BONUS
          </span>
        )}
      </div>

      {/* Referral stats */}
      {refStats && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div className="text-xl font-display font-black text-amber-400">{refStats.totalReferrals}</div>
            <div className="text-[10px] font-display tracking-wider text-amber-300/70">Signups</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div className="text-xl font-display font-black text-amber-400">{refStats.verifiedReferrals}</div>
            <div className="text-[10px] font-display tracking-wider text-amber-300/70">Verified</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div className="text-xl font-display font-black text-amber-400">{(refStats.creditsFromReferrals ?? 0).toLocaleString()}</div>
            <div className="text-[10px] font-display tracking-wider text-amber-300/70">Credits</div>
          </div>
        </div>
      )}

      {/* Credit balances */}
      <div className="flex items-center gap-4 mb-5 p-3 rounded-xl"
        style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,158,11,0.15)" }}>
        <Coins className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-300">
            {(user.growthCredits ?? 0).toLocaleString()} credits available
            {(user.pendingCredits ?? 0) > 0 && (
              <span className="text-yellow-400/70 ml-1 text-xs">
                + {(user.pendingCredits ?? 0).toLocaleString()} pending
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">1,000 credits = $1.00 · min $25 cashout</div>
        </div>
        <Link href="/credits" className="text-xs text-amber-400 font-medium hover:text-amber-300 underline" data-testid="link-og-view-credits">
          Wallet →
        </Link>
      </div>

      {/* Earn breakdown */}
      <div className="text-xs text-muted-foreground space-y-1 mb-5">
        <div className="flex justify-between">
          <span>👤 Referral signs up</span>
          <span className="text-amber-400 font-medium">250 cr (pending)</span>
        </div>
        <div className="flex justify-between">
          <span>✅ Referral verifies ID</span>
          <span className="text-amber-400 font-medium">500 cr approved</span>
        </div>
        <div className="flex justify-between">
          <span>💼 Referral completes first job</span>
          <span className="text-amber-400 font-medium">1,500 cr</span>
        </div>
        <div className="flex justify-between">
          <span>👑 Referral buys Day-1 OG</span>
          <span className="text-amber-400 font-medium">2,500 cr</span>
        </div>
      </div>

      {referralLink ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-mono break-all"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}
            data-testid="text-referral-link">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="w-full h-10 rounded-xl text-sm font-display tracking-wider font-bold flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000" }}
            data-testid="btn-copy-referral-link">
            <Copy className="w-4 h-4" /> COPY LINK
          </button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center">
          Referral code not set — contact support.
        </div>
      )}
    </div>
  );
}

export default function OgAdvantage() {
  const { data: me } = useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
  });

  const isLoggedIn = !!me;
  const isOG = !!(me as any)?.day1OG;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-og-advantage">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #f59e0b, transparent 65%)" }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-5 py-4 max-w-4xl mx-auto">
        <Link href="/" className="flex items-center gap-2 text-xs font-display tracking-widest text-muted-foreground hover:text-foreground transition-colors" data-testid="link-og-back">
          <ChevronLeft className="w-4 h-4" /> BACK
        </Link>
        <img src={logoImg} alt="GUBER" className="h-9 object-contain" style={{ mixBlendMode: "screen" }} />
        {isLoggedIn ? (
          <Link href="/credits" className="h-8 px-4 rounded-xl text-xs font-display tracking-widest premium-btn flex items-center gap-1.5" data-testid="link-og-credits">
            <Coins className="w-3.5 h-3.5" /> CREDITS
          </Link>
        ) : (
          <Link href="/signup" className="h-8 px-4 rounded-xl text-xs font-display tracking-widest premium-btn flex items-center" data-testid="link-og-signup">
            JOIN
          </Link>
        )}
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-5 pb-20">

        {/* Hero */}
        <div className="text-center pt-10 pb-14">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <img src={day1OGImg} alt="Day-1 OG" className="w-24 h-24 object-contain drop-shadow-2xl"
                style={{ filter: "drop-shadow(0 0 32px rgba(245,158,11,0.6)) drop-shadow(0 0 64px rgba(245,158,11,0.3))" }} />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24" }}>
            <Crown className="w-3 h-3" /> LIMITED AVAILABILITY
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-black tracking-wider mb-4"
            style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            DAY-1 OG ADVANTAGE
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-xl mx-auto mb-8">
            You found GUBER early. That means something. Day-1 OG status is a permanent designation
            for the founding members who helped build this community from the ground up.
          </p>
          {isLoggedIn ? (
            <Link href="/credits" className="inline-flex items-center gap-2 h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm font-black"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", boxShadow: "0 0 28px rgba(245,158,11,0.4), 0 4px 16px rgba(0,0,0,0.3)" }}
              data-testid="link-og-get-started">
              VIEW YOUR CREDITS <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-display tracking-wider"
                style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                One-time founding fee: <span className="font-black ml-1">$2.00</span> — that&apos;s it, forever
              </div>
              <Link href="/profile" className="inline-flex items-center gap-2 h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm font-black"
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", boxShadow: "0 0 28px rgba(245,158,11,0.4), 0 4px 16px rgba(0,0,0,0.3)" }}
                data-testid="link-og-get-started">
                UNLOCK OG STATUS — $2.00 <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[10px] text-muted-foreground">Secure payment via Stripe · No subscription · No hidden fees</p>
            </div>
          )}
        </div>

        {/* Referral panel — only for logged-in users */}
        {isLoggedIn && me && (
          <ReferralPanel user={me} />
        )}

        {/* Perks grid */}
        <div className="mb-14">
          <h2 className="text-xl font-display font-black tracking-wider text-center mb-8">WHAT YOU GET</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PERKS.map((perk) => (
              <div key={perk.title} className="rounded-2xl p-5"
                style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)" }}
                data-testid={`card-perk-${perk.title.replace(/\s+/g, "-").toLowerCase()}`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${perk.color}18`, border: `1px solid ${perk.color}30` }}>
                  <perk.icon className="w-5 h-5" style={{ color: perk.color }} />
                </div>
                <h3 className="text-sm font-display font-black tracking-wide mb-2 text-amber-200">{perk.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{perk.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How to qualify */}
        <div className="rounded-2xl p-8 mb-10"
          style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.07) 0%,rgba(180,83,9,0.04) 100%)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <h2 className="text-xl font-display font-black tracking-wider mb-6 text-center">HOW TO QUALIFY</h2>
          <div className="space-y-3 max-w-sm mx-auto">
            {HOW_TO_QUALIFY.map((step, i) => (
              <div key={step} className="flex items-center gap-3" data-testid={`step-qualify-${i}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-display font-black"
                  style={{ background: "rgba(245,158,11,0.2)", border: "1.5px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
                  {i + 1}
                </div>
                <span className="text-sm text-white/80">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scarcity + disclaimer */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-display tracking-wider mb-4"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            OG SLOTS ARE LIMITED PER CITY
          </div>
          <p className="text-muted-foreground text-xs max-w-md mx-auto leading-relaxed">
            Day-1 OG status is granted to qualifying early members on a city-by-city basis.
            Once the founding cohort for your city is full, this designation will no longer be available.
            Benefits apply to verified members in good standing. GUBER reserves the right to revoke
            OG status for violations of community standards or terms of service.
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { label: "Fee Discount", value: "5%", sub: "locked for life" },
            { label: "Badge", value: "OG", sub: "permanent gold" },
            { label: "Access", value: "Early", sub: "beta & features" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-4 text-center"
              style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
              <div className="text-2xl font-display font-black text-amber-400">{s.value}</div>
              <div className="text-[10px] font-display tracking-wider text-amber-300/70 mt-0.5">{s.label}</div>
              <div className="text-[9px] text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div className="text-center rounded-2xl p-10"
          style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.08) 0%,rgba(180,83,9,0.05) 100%)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <Crown className="w-8 h-8 text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-display font-black tracking-wider mb-3">Join the Founding Community</h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto mb-6">
            Be part of something real. GUBER is building the local opportunity network
            that communities have always needed. Get in early and be remembered for it.
          </p>
          <div className="flex flex-col items-center gap-3">
            {!isLoggedIn && (
              <p className="text-amber-400 text-sm font-display font-bold tracking-wide">
                $2 one-time fee · Secure checkout via Stripe
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isLoggedIn ? (
                <Link href="/browse-jobs" className="h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm font-black flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", boxShadow: "0 0 24px rgba(245,158,11,0.35)" }}
                  data-testid="link-og-cta-missions">
                  BROWSE OPPORTUNITIES <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link href="/profile" className="h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm font-black flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", boxShadow: "0 0 24px rgba(245,158,11,0.35)" }}
                  data-testid="link-og-cta-signup">
                  UNLOCK OG STATUS — $2.00 <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <Link href="/" className="h-12 px-8 rounded-xl font-display tracking-[0.2em] text-sm btn-glass-premium flex items-center justify-center" data-testid="link-og-cta-home">
                EXPLORE GUBER
              </Link>
            </div>
          </div>
        </div>

        {/* Already purchased contact note */}
        <p className="text-center text-[10px] text-muted-foreground/60 mt-8 leading-relaxed">
          Already purchased Day-1 OG but not seeing your badge?{" "}
          <a href="mailto:support@guberapp.com?subject=Day-1%20OG%20Badge%20Missing" className="text-amber-400/80 hover:text-amber-400 underline underline-offset-2 transition-colors">
            Contact us
          </a>{" "}
          and we&apos;ll get it sorted.
        </p>

        {/* Legal footer */}
        <p className="text-center text-[10px] text-muted-foreground/50 font-display tracking-wider mt-4">
          GUBER GLOBAL LLC · DAY-1 OG IS A PLATFORM DESIGNATION, NOT A FINANCIAL INSTRUMENT
        </p>
      </div>
    </div>
  );
}
