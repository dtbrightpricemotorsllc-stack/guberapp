// /business/next-steps — shown after onboarding (?fromOnboarding=1)
// Six large option cards for what the business wants to do next.

import { useLocation } from "wouter";
import { Link } from "wouter";
import { GuberLogo } from "@/components/guber-logo";
import {
  Megaphone, Cpu, Phone, Star, Users, ArrowRight,
  Building2, CalendarCheck, Sparkles,
} from "lucide-react";

const PURPLE = "#a855f7";
const TEAL   = "#00E5E5";
const GREEN  = "#00e576";
const GOLD   = "#C6A85C";

interface OptionCard {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
  href?: string;
  externalHref?: string;
  testId: string;
}

const OPTIONS: OptionCard[] = [
  {
    icon: Building2,
    color: PURPLE,
    title: "Publish Your Profile",
    description: "Complete your business profile so your brand is visible to local workers, customers, and partners on GUBER.",
    href: "/business-onboarding",
    testId: "card-publish-profile",
  },
  {
    icon: Megaphone,
    color: TEAL,
    title: "Request a Promotion",
    description: "Launch a targeted cash drop, treasure hunt, or local campaign to reach real people in your area.",
    href: "/business/promotion",
    testId: "card-request-promo",
  },
  {
    icon: Cpu,
    color: GREEN,
    title: "Request a Digital Proposal",
    description: "Get a custom proposal for a mobile app, website, AI integration, or digital product built by the GUBER team.",
    href: "/business/proposal",
    testId: "card-request-proposal",
  },
  {
    icon: CalendarCheck,
    color: GOLD,
    title: "Schedule a Consultation",
    description: "Book a free call with a GUBER Global representative to talk through your goals and find the best path forward.",
    externalHref: "tel:3364841536",
    testId: "card-schedule-consult",
  },
  {
    icon: Star,
    color: "#f472b6",
    title: "Join the Interest List",
    description: "Not ready yet? Stay on our radar and get notified first when new GUBER business features launch in your area.",
    href: "/business",
    testId: "card-interest-list",
  },
  {
    icon: Sparkles,
    color: "#fb923c",
    title: "Early Partner Inquiry",
    description: "Explore exclusive early-partner pricing, co-branded drops, and priority onboarding for founding business partners.",
    href: "/business",
    testId: "card-early-partner",
  },
];

export default function BusinessNextSteps() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background px-5 py-12" data-testid="page-business-next-steps">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] rounded-full opacity-[0.04]"
          style={{ background: `radial-gradient(circle, ${PURPLE}, transparent 60%)` }} />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] rounded-full opacity-[0.03]"
          style={{ background: `radial-gradient(circle, ${TEAL}, transparent 60%)` }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-5">
            <GuberLogo size="md" />
          </div>
          <p className="text-[10px] font-display font-bold tracking-[0.25em] uppercase mb-3" style={{ color: PURPLE }}>
            GUBER FOR BUSINESS
          </p>
          <h1 className="text-2xl font-display font-black tracking-wide mb-2" data-testid="heading-next-steps">
            What Would You Like to Do?
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Choose your next step. You can always come back and explore all of these later from your dashboard.
          </p>
        </div>

        {/* Option Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {OPTIONS.map(opt => {
            const Icon = opt.icon;
            const inner = (
              <div
                className="group rounded-2xl p-5 transition-all active:scale-[0.98] cursor-pointer h-full"
                style={{ background: "hsl(var(--card))", border: `1px solid ${opt.color}22` }}
                data-testid={opt.testId}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-110"
                    style={{ background: `${opt.color}15`, border: `1.5px solid ${opt.color}30` }}>
                    <Icon className="w-5 h-5" style={{ color: opt.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-sm mb-1" style={{ color: opt.color }}>
                        {opt.title}
                      </h3>
                      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" style={{ color: opt.color }} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
                  </div>
                </div>
              </div>
            );

            if (opt.externalHref) {
              return (
                <a key={opt.testId} href={opt.externalHref}>{inner}</a>
              );
            }
            return (
              <Link key={opt.testId} href={opt.href!}>{inner}</Link>
            );
          })}
        </div>

        {/* Footer links */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/biz/dashboard"
            className="text-xs font-display tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-go-to-dashboard"
          >
            Go to my dashboard →
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Return to GUBER home
          </Link>
        </div>
      </div>
    </div>
  );
}
