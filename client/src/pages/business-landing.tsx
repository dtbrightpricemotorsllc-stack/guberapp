// GUBER For Business — Public lead-capture landing page
// No account creation required. ~30-second interest form.
// Phone collected privately; never displayed publicly.

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Building2, Megaphone, Cpu, Sparkles, CheckCircle2,
  Loader2, ChevronRight, ExternalLink, Mail, Star, Phone, Globe, MessageCircle,
} from "lucide-react";
import { GuberLogo } from "@/components/guber-logo";

// ── Constants ────────────────────────────────────────────────────────────────
const PURPLE = "#a855f7";
const TEAL   = "#00E5E5";
const GREEN  = "#00e576";

const INTEREST_OPTIONS = [
  "Join GUBER",
  "Promote my business",
  "Build an app",
  "Build a website",
  "Add AI or automation",
  "Sponsor a cash drop or treasure hunt",
  "Interested but not ready",
  "Not sure, contact me",
] as const;

const BUSINESS_CATEGORIES = [
  "Restaurant / Food & Beverage",
  "Retail / E-Commerce",
  "Healthcare / Wellness",
  "Real Estate / Property",
  "Construction / Trades",
  "Automotive / Transportation",
  "Technology / Software",
  "Marketing / Media / Creative",
  "Legal / Professional Services",
  "Education / Training",
  "Event Planning / Entertainment",
  "Beauty / Personal Care",
  "Finance / Insurance",
  "Logistics / Delivery",
  "Non-Profit / Community",
  "Other",
] as const;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

type LeadOption = {
  key: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  interest: string;
  color: string;
  bg: string;
  border: string;
  small?: boolean;
  href?: string;
};

const LEAD_OPTIONS: LeadOption[] = [
  {
    key: "join",
    icon: Building2,
    title: "Join GUBER",
    description: "Create a business presence and connect with GUBER users.",
    interest: "Join GUBER",
    color: PURPLE,
    bg: `rgba(168,85,247,0.08)`,
    border: `rgba(168,85,247,0.25)`,
  },
  {
    key: "promo",
    icon: Megaphone,
    title: "Request a Promotion",
    description: "Business spotlight, social campaign, cash drop, treasure hunt, grand opening, or local activation. Open the full brief form →",
    interest: "Promote my business",
    color: TEAL,
    bg: `rgba(0,229,229,0.08)`,
    border: `rgba(0,229,229,0.25)`,
    href: "/business/promotion",
  },
  {
    key: "digital",
    icon: Cpu,
    title: "Request a Digital Proposal",
    description: "Custom app, premium website, AI assistant, booking system, customer portal, or business automation. Open the full brief form →",
    interest: "Build an app",
    color: GREEN,
    bg: `rgba(0,229,118,0.08)`,
    border: `rgba(0,229,118,0.25)`,
    href: "/business/proposal",
  },
  {
    key: "future",
    icon: Sparkles,
    title: "Future Business Interest",
    description: "Stay informed about upcoming launches, sponsorships, promotions, and early-partner opportunities.",
    interest: "Interested but not ready",
    color: "#f59e0b",
    bg: `rgba(245,158,11,0.08)`,
    border: `rgba(245,158,11,0.25)`,
    small: true,
  },
];

// ── Intent → card key mapping ─────────────────────────────────────────────────
const INTENT_TO_INTEREST: Record<string, string> = {
  join:    "Join GUBER",
  promo:   "Promote my business",
  promote: "Promote my business",
  digital: "Build an app",
  app:     "Build an app",
  future:  "Interested but not ready",
  info:    "Interested but not ready",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function BusinessLanding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [selectedInterest, setSelectedInterest] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("");

  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    businessCategory: "",
    selectedInterest: "",
    message: "",
    permissionToContact: false,
  });

  // ── Read ?source= and ?intent= from URL on mount ─────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const srcParam = params.get("source") || params.get("utm_source") || "";
    const intentParam = params.get("intent") || params.get("interest") || "";

    if (srcParam) {
      const cleaned = srcParam.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "-").slice(0, 80);
      setSource(cleaned);
    }

    if (intentParam) {
      const mapped = INTENT_TO_INTEREST[intentParam.toLowerCase().trim()];
      if (mapped) {
        setSelectedInterest(mapped);
        setForm(f => ({ ...f, selectedInterest: mapped }));
        setTimeout(() => {
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
      }
    }
  }, []);

  const handleCardClick = useCallback((interest: string) => {
    setSelectedInterest(interest);
    setForm(f => ({ ...f, selectedInterest: interest }));
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  const canSubmit =
    form.businessName.trim() &&
    form.contactName.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.city.trim() &&
    form.state &&
    form.businessCategory &&
    form.selectedInterest &&
    form.permissionToContact;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/business-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: source || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Success Screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-16" data-testid="page-business-success">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{ background: `radial-gradient(circle, ${PURPLE}, transparent 60%)` }} />
        </div>

        <div className="relative z-10 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: `rgba(168,85,247,0.15)`, border: `1.5px solid rgba(168,85,247,0.35)` }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: PURPLE }} />
          </div>

          <div className="mx-auto mb-6 w-fit"><GuberLogo size="md" /></div>

          <h1 className="text-2xl font-display font-black tracking-wider mb-3" data-testid="success-heading">
            Your Business Request Has Been Received
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            A Guber Global representative will contact you to discuss your goals and next steps.
          </p>

          <div className="flex flex-col gap-3 max-w-sm mx-auto">
            <Link
              href="/business-signup"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm font-bold transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, color: "#fff" }}
              data-testid="btn-complete-profile"
            >
              <Building2 className="w-4 h-4" />
              COMPLETE A GUBER BUSINESS PROFILE
            </Link>

            <Link
              href="/business-signup"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}
              data-testid="btn-message-guber"
            >
              <Mail className="w-4 h-4" />
              MESSAGE GUBER GLOBAL
            </Link>

            <a
              href="https://isellapps.store"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm transition-all active:scale-95"
              style={{ background: `rgba(0,229,118,0.08)`, border: `1px solid rgba(0,229,118,0.25)`, color: GREEN }}
              data-testid="btn-view-demos"
            >
              <ExternalLink className="w-4 h-4" />
              VIEW APP DEMOS
            </a>

            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 font-display tracking-wider"
              data-testid="link-back-home"
            >
              ← BACK TO GUBERAPP
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Landing Page ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background" data-testid="page-business-landing">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-[20%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ background: `radial-gradient(circle, ${PURPLE}, transparent 60%)` }} />
        <div className="absolute bottom-[30%] left-[5%] w-[350px] h-[350px] rounded-full opacity-[0.04]"
          style={{ background: `radial-gradient(circle, ${TEAL}, transparent 60%)` }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-5 py-10">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-display tracking-wider mb-10 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-back"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO GUBER
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 w-fit"><GuberLogo size="md" /></div>
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: `rgba(168,85,247,0.1)`, border: `1px solid rgba(168,85,247,0.25)`, color: PURPLE }}>
            <Star className="w-3 h-3" /> GUBER GLOBAL — BUSINESS
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-black tracking-wider mb-3" data-testid="page-heading">
            Grow Your Business<br />With GUBER
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
            Get discovered, request a promotion, or let us build your next digital solution.
          </p>
        </div>

        {/* How It Works */}
        <div className="mb-10" data-testid="section-how-it-works">
          <p className="text-center text-[10px] font-display tracking-[0.18em] text-muted-foreground mb-6">HOW IT WORKS</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "01", label: "Pick your goal", sub: "Choose what you're looking for from the options below", color: PURPLE },
              { step: "02", label: "Submit in 30 sec", sub: "Fill out a quick form — no account required", color: TEAL },
              { step: "03", label: "We reach out", sub: "A Guber Global rep contacts you within 1–2 business days", color: GREEN },
            ].map(({ step, label, sub, color }) => (
              <div key={step} className="flex flex-col items-center text-center gap-2 p-3 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="text-[11px] font-display font-black" style={{ color }}>{step}</span>
                <p className="text-[11px] font-display font-bold text-foreground leading-snug">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust / Contact */}
        <div className="mb-8 rounded-2xl p-5"
          style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)" }}
          data-testid="section-contact-trust">
          <p className="text-[10px] font-display tracking-[0.18em] text-muted-foreground mb-4">GUBER GLOBAL — DIRECT CONTACT</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a href="tel:3364841536"
              className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
              style={{ background: "rgba(0,229,229,0.06)", border: "1px solid rgba(0,229,229,0.15)" }}>
              <Phone className="w-4 h-4 flex-shrink-0" style={{ color: TEAL }} />
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground tracking-widest">CALL OR TEXT</p>
                <p className="text-xs font-display font-bold truncate" style={{ color: TEAL }}>(336) 484-1536</p>
              </div>
            </a>
            <a href="https://guberapp.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
              style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <Globe className="w-4 h-4 flex-shrink-0" style={{ color: PURPLE }} />
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground tracking-widest">EXPLORE APP</p>
                <p className="text-xs font-display font-bold truncate" style={{ color: PURPLE }}>GuberApp.com</p>
              </div>
            </a>
            <a href="https://isellapps.store" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
              style={{ background: "rgba(0,229,118,0.06)", border: "1px solid rgba(0,229,118,0.15)" }}>
              <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: GREEN }} />
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground tracking-widest">LIVE DEMOS</p>
                <p className="text-xs font-display font-bold truncate" style={{ color: GREEN }}>iSellApps.store</p>
              </div>
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 text-center leading-relaxed">
            Guber Global LLC is the technology arm behind the GUBER platform — building apps, digital solutions, and local business tools since 2022.
          </p>
        </div>

        {/* Option Cards */}
        <div className="grid grid-cols-1 gap-3 mb-10" data-testid="section-option-cards">
          {LEAD_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = form.selectedInterest === opt.interest;
            return (
              <button
                key={opt.key}
                onClick={() => opt.href ? setLocation(opt.href) : handleCardClick(opt.interest)}
                className={`w-full text-left rounded-2xl p-5 transition-all active:scale-[0.99] ${opt.small ? "opacity-80" : ""}`}
                style={{
                  background: isActive ? opt.bg : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${isActive ? opt.color : "rgba(255,255,255,0.08)"}`,
                  boxShadow: isActive ? `0 0 20px ${opt.color}18` : "none",
                }}
                data-testid={`card-option-${opt.key}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: opt.bg, border: `1px solid ${opt.border}` }}>
                    <Icon className="w-5 h-5" style={{ color: opt.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-display font-black text-sm tracking-wide" style={{ color: opt.small ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.92)" }}>
                        {opt.title}
                      </p>
                      {isActive && (
                        <span className="text-[9px] font-display font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: opt.color, color: "#000" }}>
                          SELECTED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Lead Form */}
        <div ref={formRef} className="scroll-mt-6" data-testid="section-lead-form">
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${PURPLE}, ${TEAL}, transparent)` }} />

            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-display font-black tracking-wide mb-1">Quick Business Interest</h2>
                <p className="text-xs text-muted-foreground">No account required. Takes about 30 seconds.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-business-lead">

                {/* Interest selector (synced with card clicks) */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    I'M INTERESTED IN *
                  </Label>
                  <Select
                    value={form.selectedInterest}
                    onValueChange={(v) => setForm(f => ({ ...f, selectedInterest: v }))}
                  >
                    <SelectTrigger className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      data-testid="select-interest">
                      <SelectValue placeholder="Select your interest" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      BUSINESS NAME *
                    </Label>
                    <Input
                      value={form.businessName}
                      onChange={set("businessName")}
                      placeholder="Your business name"
                      className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      required
                      data-testid="input-business-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      CONTACT NAME *
                    </Label>
                    <Input
                      value={form.contactName}
                      onChange={set("contactName")}
                      placeholder="Your full name"
                      className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      required
                      data-testid="input-contact-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      PHONE NUMBER *
                    </Label>
                    <Input
                      value={form.phone}
                      onChange={set("phone")}
                      type="tel"
                      placeholder="555-000-0000"
                      className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      required
                      data-testid="input-phone"
                    />
                    <p className="text-[10px] text-muted-foreground">Visible to admin only — never shown publicly.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      EMAIL ADDRESS *
                    </Label>
                    <Input
                      value={form.email}
                      onChange={set("email")}
                      type="email"
                      placeholder="you@business.com"
                      className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      required
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      CITY *
                    </Label>
                    <Input
                      value={form.city}
                      onChange={set("city")}
                      placeholder="City"
                      className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      required
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                      STATE *
                    </Label>
                    <Select
                      value={form.state}
                      onValueChange={(v) => setForm(f => ({ ...f, state: v }))}
                    >
                      <SelectTrigger className="rounded-xl h-11 text-sm border-0"
                        style={{ background: "hsl(var(--muted))" }}
                        data-testid="select-state">
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    BUSINESS CATEGORY *
                  </Label>
                  <Select
                    value={form.businessCategory}
                    onValueChange={(v) => setForm(f => ({ ...f, businessCategory: v }))}
                  >
                    <SelectTrigger className="rounded-xl h-11 text-sm border-0"
                      style={{ background: "hsl(var(--muted))" }}
                      data-testid="select-category">
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    MESSAGE (OPTIONAL)
                  </Label>
                  <Textarea
                    value={form.message}
                    onChange={set("message")}
                    placeholder="Anything else you'd like us to know..."
                    className="rounded-xl text-sm border-0 min-h-[80px]"
                    style={{ background: "hsl(var(--muted))" }}
                    maxLength={600}
                    data-testid="input-message"
                  />
                </div>

                {/* Permission checkbox */}
                <div className="rounded-xl p-4"
                  style={{ background: "hsl(var(--muted))", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <label className="flex items-start gap-3 cursor-pointer" data-testid="label-permission">
                    <div
                      onClick={() => setForm(f => ({ ...f, permissionToContact: !f.permissionToContact }))}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={form.permissionToContact
                        ? { background: PURPLE, borderColor: PURPLE }
                        : { borderColor: "rgba(255,255,255,0.15)", background: "transparent" }}
                      data-testid="checkbox-permission"
                    >
                      {form.permissionToContact && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      I give Guber Global LLC permission to contact me about my business inquiry.
                      My phone number is shared privately with the GUBER team only and will not appear publicly.
                    </span>
                  </label>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="w-full h-13 font-display text-[12px] tracking-[0.2em] rounded-xl disabled:opacity-30 font-bold"
                  style={{ background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, color: "#fff", height: "52px" }}
                  data-testid="btn-submit"
                >
                  {loading
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <>SUBMIT BUSINESS INTEREST <ChevronRight className="w-4 h-4 ml-1" /></>}
                </Button>

                <p className="text-center text-[10px] text-muted-foreground">
                  No account required. A Guber Global representative will reach out within 1–2 business days.
                </p>
              </form>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">Already have a GUBER business account?</p>
          <Link href="/login" className="text-xs font-display tracking-wider hover:opacity-80 transition-opacity" style={{ color: PURPLE }}>
            LOG IN TO BUSINESS PORTAL →
          </Link>
        </div>
      </div>
    </div>
  );
}
