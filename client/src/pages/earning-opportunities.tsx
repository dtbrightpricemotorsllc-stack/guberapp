/**
 * /earning-opportunities — shown to users in EARNED_CREDITS_ONLY mode who
 * tap "View Earning Opportunities" instead of a purchase button.
 *
 * Lists every way to earn GUBER Credits without spending money:
 * City Missions, job completions, referrals, Day-1 OG monthly bonus, etc.
 */

import { Link } from "wouter";
import { ArrowLeft, Star, MapPin, Users, Briefcase, Zap, Gift, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EarnMethod {
  icon: JSX.Element;
  title: string;
  description: string;
  credits: string;
  action?: { label: string; href: string };
  highlight?: boolean;
}

const EARN_METHODS: EarnMethod[] = [
  {
    icon: <MapPin className="w-5 h-5 text-cyan-400" />,
    title: "Complete City Missions",
    description:
      "Report fuel prices, submit local business info, verify storefront photos, and more. Missions rotate weekly and vary by your ZIP code.",
    credits: "5–50 credits each",
    action: { label: "Browse Missions", href: "/dashboard" },
    highlight: true,
  },
  {
    icon: <Briefcase className="w-5 h-5 text-emerald-400" />,
    title: "Complete Jobs",
    description:
      "Every eligible job you complete on GUBER may award bonus GUBER Credits on top of your cash payout. Credit rewards vary by job category.",
    credits: "Varies by job type",
    action: { label: "Find Jobs", href: "/jobs" },
  },
  {
    icon: <Users className="w-5 h-5 text-purple-400" />,
    title: "Refer New Users",
    description:
      "Share your referral link. When a friend signs up and completes their first job, both of you earn credits.",
    credits: "Credits per referral",
    action: { label: "Get Referral Link", href: "/og-advantage" },
  },
  {
    icon: <Star className="w-5 h-5 text-amber-400" />,
    title: "Day-1 OG Monthly Bonus",
    description:
      "Day-1 OG members receive 20 bonus credits every month, credited automatically. Credits roll over — they never expire.",
    credits: "+20 credits/month",
    action: { label: "Learn About Day-1 OG", href: "/og-advantage" },
    highlight: true,
  },
  {
    icon: <Zap className="w-5 h-5 text-yellow-400" />,
    title: "Trial Credits",
    description:
      "All new GUBER users receive 2 free trial credits to explore GUBER Studio and other credit-powered features.",
    credits: "2 credits on signup",
  },
  {
    icon: <Trophy className="w-5 h-5 text-orange-400" />,
    title: "Milestones & Achievements",
    description:
      "Unlock one-time credit bonuses by reaching job count milestones, completing your profile, and other achievements.",
    credits: "One-time bonuses",
    action: { label: "Check Progress", href: "/dashboard" },
  },
  {
    icon: <Gift className="w-5 h-5 text-pink-400" />,
    title: "Promotional Events",
    description:
      "GUBER periodically runs limited-time credit promotions tied to local events, seasonal campaigns, and platform milestones.",
    credits: "Varies per event",
  },
];

export default function EarningOpportunities() {
  const { user } = useAuth();

  const { data: balance } = useQuery<{ balance: number }>({
    queryKey: ["/api/credits/balance"],
    enabled: !!user,
    staleTime: 30_000,
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-5 pt-safe-top pb-4 pt-4"
        style={{ background: "linear-gradient(180deg, #0d1117 0%, rgba(13,17,23,0.95) 100%)" }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href="/dashboard">
            <button
              className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
              aria-label="Back"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-base font-display font-black text-foreground tracking-wider">
              EARNING OPPORTUNITIES
            </h1>
            <p className="text-[10px] text-muted-foreground font-display tracking-widest uppercase">
              Ways to earn GUBER Credits
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 max-w-lg mx-auto space-y-5 mt-2">
        {/* Credit balance callout */}
        {user && (
          <div
            className="rounded-2xl p-4 flex items-center justify-between"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,229,0.08), rgba(0,153,170,0.06))",
              border: "1px solid rgba(0,229,229,0.2)",
            }}
          >
            <div>
              <p className="text-[10px] text-muted-foreground font-display tracking-widest uppercase mb-0.5">
                Your Credit Balance
              </p>
              <p className="text-2xl font-display font-black text-foreground" data-testid="text-credit-balance">
                {balance?.balance ?? "—"}{" "}
                <span className="text-sm font-normal text-muted-foreground">credits</span>
              </p>
            </div>
            <Link href="/credits">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl font-display text-xs tracking-wider"
                data-testid="button-view-credits"
              >
                View History
              </Button>
            </Link>
          </div>
        )}

        {/* Intro */}
        <div className="space-y-1">
          <p className="text-sm text-foreground/80 leading-relaxed">
            GUBER Credits unlock platform features like GUBER Studio, listing boosts, and access
            perks. Earn them by completing real work — no purchase required.
          </p>
        </div>

        {/* Methods */}
        <div className="space-y-3">
          {EARN_METHODS.map((method) => (
            <Card
              key={method.title}
              className="rounded-2xl overflow-hidden"
              style={
                method.highlight
                  ? {
                      background: "linear-gradient(135deg, rgba(0,229,229,0.06), rgba(0,0,0,0))",
                      border: "1px solid rgba(0,229,229,0.25)",
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }
              }
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {method.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-display font-black text-foreground tracking-wide">
                        {method.title}
                      </p>
                      <span className="text-[10px] font-display font-bold text-cyan-400/80 shrink-0 mt-0.5 whitespace-nowrap">
                        {method.credits}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                      {method.description}
                    </p>
                    {method.action && (
                      <Link href={method.action.href}>
                        <button
                          className="text-[11px] font-display font-bold text-cyan-400 hover:text-cyan-300 transition-colors tracking-wide"
                          data-testid={`button-earn-${method.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {method.action.label} →
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer note */}
        <div className="rounded-2xl p-4 mt-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
            GUBER Credits are earned by completing eligible activities within GUBER.
            Credits cannot be purchased in this version of the app.
          </p>
        </div>
      </div>
    </div>
  );
}
