import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialLinks } from "@/components/social-links";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  Crown, MapPin, DollarSign, Clock, ChevronRight, X,
  Briefcase, ShieldCheck, Zap, Star, ArrowRight, Lock,
  Globe, Hammer, Wrench, ShoppingBag, Repeat, Truck, Bot,
  Share2, Gift, CheckCircle,
} from "lucide-react";
import { SiGoogleplay, SiApple } from "react-icons/si";
import { GridDemo } from "@/components/grid-demo";
import { SignUpWall } from "@/components/signup-wall";

import logoImg          from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import day1OGImg        from "@assets/Gubergoldday1_1772434950756.png";
import viLogoImg        from "@assets/Picsart_26-04-13_12-33-21-291_1776101665162.png";
import verifyInspectImg from "@assets/category-images/verify_inspect.png";

interface PublicJob {
  id: number;
  title: string;
  category: string;
  budget: number;
  locationApprox: string;
  zip: string;
  urgentSwitch: boolean;
  payType: string;
  jobType: string;
  proofRequired: boolean;
  serviceType: string | null;
  verifyInspectCategory: string | null;
  jobImage: string | null;
  createdAt: string;
  appUrl: string;
  _demo?: boolean;
}

// Demo tiles — shown when real listings are sparse so the feed always looks alive.
const DEMO_JOBS: PublicJob[] = [
  { id: -1, title: "Help Move a Sectional Sofa",   category: "On-Demand Help",  budget: 75, locationApprox: "Near you", zip: "", urgentSwitch: true,  payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  8 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -2, title: "Pre-Purchase Vehicle Photos",  category: "Verify & Inspect", budget: 45, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: true,  serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 23 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -3, title: "Yard Cleanup — Leaf Blowing",  category: "General Labor",    budget: 60, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 45 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -4, title: "Furniture Assembly — IKEA",    category: "Skilled Labor",    budget: 90, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  2 * 3_600_000).toISOString(), appUrl: "", _demo: true },
  { id: -5, title: "Grocery Pickup & Delivery",    category: "On-Demand Help",   budget: 30, locationApprox: "Near you", zip: "", urgentSwitch: true,  payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 18 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -6, title: "Property Walk-Through Photos", category: "Verify & Inspect", budget: 55, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: true,  serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  3 * 3_600_000).toISOString(), appUrl: "", _demo: true },
];

const CATEGORIES = [
  { label: "On-Demand Help",   desc: "Get help fast for any task",          icon: Zap,         bg: "linear-gradient(135deg,#78350f,#92400e,#c2410c)", href: "/browse-jobs?category=On-Demand Help" },
  { label: "Skilled Labor",    desc: "Find skilled pros for the job",        icon: Hammer,      bg: "linear-gradient(135deg,#7f1d1d,#991b1b,#b91c1c)", href: "/browse-jobs?category=Skilled Labor" },
  { label: "General Labor",    desc: "Everyday tasks, done right",           icon: Wrench,      bg: "linear-gradient(135deg,#14532d,#166534,#15803d)", href: "/browse-jobs?category=General Labor" },
  { label: "Verify & Inspect", desc: "Verify assets & inspections",          icon: ShieldCheck, bg: "linear-gradient(135deg,#2e1065,#4c1d95,#5b21b6)", href: "/verify-inspect" },
  { label: "Marketplace",      desc: "Buy, sell & verify local items",       icon: ShoppingBag, bg: "linear-gradient(135deg,#5C3E07,#8B6010,#A87418)", href: "/marketplace",  badge: "BETA" },
  { label: "Barter Labor",     desc: "Trade skills. No cash needed",         icon: Repeat,      bg: "linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)", href: "/browse-jobs?category=Barter Labor" },
  { label: "Load Board",       desc: "Cars, boats, RVs, equipment & more",   icon: Truck,       bg: "linear-gradient(135deg,#0A3D3D,#105252,#186868)", href: "/load-board",   badge: "NEW" },
  { label: "AI or Not?",       desc: "Can you spot the fake? 🤖",            icon: Bot,         bg: "linear-gradient(135deg,#0E0E0F,#141417,#1A1A1F)", href: "/ai-or-not",    border: "1.5px solid rgba(0,229,118,0.55)" },
];

const QUOTES = [
  { text: "Made $140 in one weekend doing yard work. GUBER made it dead simple.", name: "Marcus T.", location: "Mobile, AL" },
  { text: "Posted my first V&I request and had someone at the property taking photos the same day.", name: "Janelle R.", location: "Saraland, AL" },
  { text: "Finally a platform that pays fast and keeps sketchy people out.", name: "Devon W.", location: "Daphne, AL" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function GateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="modal-gate">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl p-7 w-full max-w-sm shadow-2xl z-10">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-gate-close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex justify-center mb-5">
          <img src={logoImg} alt="GUBER" className="h-14 object-contain" style={{ mixBlendMode: "screen" }} />
        </div>
        <h2 className="text-xl font-display font-black tracking-wider text-center mb-1">READY TO EARN?</h2>
        <p className="text-center text-muted-foreground text-sm mb-6">Create a free account or sign in to accept jobs on the GUBER app.</p>
        <div className="space-y-3">
          <Link href="/signup" className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-display tracking-[0.15em] text-sm premium-btn" data-testid="link-gate-signup">
            GET STARTED FREE <ChevronRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium" data-testid="link-gate-login">
            SIGN IN
          </Link>
        </div>
        <p className="text-center text-muted-foreground text-[10px] font-display tracking-wider mt-5">FREE TO JOIN · GUBER GLOBAL LLC</p>
      </div>
    </div>
  );
}

function JobCard({ job, onAccept }: { job: PublicJob; onAccept: () => void }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col relative" data-testid={`card-job-${job.id}`}>
      {job._demo && (
        <div className="absolute top-3 right-3 z-10">
          <span className="text-[9px] font-display font-black px-1.5 py-0.5 rounded-md tracking-wider"
            style={{ background: "rgba(0,229,118,0.12)", color: "rgba(0,229,118,0.7)", border: "1px solid rgba(0,229,118,0.2)" }}>
            SAMPLE
          </span>
        </div>
      )}
      {job.jobImage && <img src={job.jobImage} alt={job.title} className="w-full h-36 object-cover" />}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display font-bold text-sm leading-snug pr-10">{job.title}</h3>
          {job.urgentSwitch && (
            <Badge className="shrink-0 text-[9px] font-display tracking-widest bg-amber-500/15 text-amber-400 border-amber-500/20 no-default-hover-elevate" data-testid={`badge-urgent-${job.id}`}>
              <Zap className="w-2.5 h-2.5 mr-0.5" /> URGENT
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="w-3 h-3" />{job.locationApprox}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="w-3 h-3" />{timeAgo(job.createdAt)}</span>
          {job.proofRequired && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400"><ShieldCheck className="w-3 h-3" />Proof required</span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-display no-default-hover-elevate">{job.category}</Badge>
          <Badge variant="outline" className="text-[10px] font-display no-default-hover-elevate capitalize">{job.jobType}</Badge>
        </div>
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-baseline gap-0.5">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-lg font-display font-black text-emerald-400">{job.budget}</span>
            {job.payType === "hourly" && <span className="text-[10px] text-muted-foreground ml-0.5">/hr</span>}
          </div>
          <button onClick={onAccept} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-display font-bold tracking-widest premium-btn" data-testid={`button-accept-${job.id}`}>
            <Lock className="w-3 h-3" />ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [gateOpen, setGateOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const jobsSectionRef = useRef<HTMLDivElement>(null);
  const { enabled: investorPitchPublic } = useFeatureFlag("investor_pitch_public");

  const { data: jobs, isLoading: jobsLoading } = useQuery<PublicJob[]>({
    queryKey: ["/api/public/jobs"],
  });

  // Blend real jobs with demo tiles — feed always shows 6 cards to hook visitors.
  const displayJobs = useMemo(() => {
    const real = jobs ?? [];
    if (real.length >= 6) return real.slice(0, 6);
    return [...real, ...DEMO_JOBS.slice(0, Math.max(0, 6 - real.length))];
  }, [jobs]);

  const scrollToJobs = () =>
    jobsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleShare = async () => {
    const url  = "https://guberapp.com";
    const text = "Find local work — or get help fast. No resume, no fees to join. 🔥";
    if (navigator.share) {
      try { await navigator.share({ title: "GUBER", text, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-home">
      {gateOpen && <GateModal onClose={() => setGateOpen(false)} />}
      {wallOpen && <SignUpWall onClose={() => setWallOpen(false)} />}

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }} />
        <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, hsl(275 85% 62%), transparent 65%)" }} />
        <div className="absolute bottom-[5%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, hsl(200 80% 55%), transparent 65%)" }} />
      </div>

      {/* ── Nav ── */}
      <nav className="relative z-10 flex items-center justify-between px-5 py-4 max-w-6xl mx-auto w-full">
        <img src={logoImg} alt="GUBER" className="h-10 object-contain" style={{ mixBlendMode: "screen" }} data-testid="img-nav-logo" />
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-xs font-display tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-signin">
            SIGN IN
          </Link>
          <Link href="/signup" className="h-9 px-5 rounded-xl text-xs font-display tracking-[0.15em] premium-btn flex items-center" data-testid="link-nav-signup">
            GET STARTED
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 px-5 pt-6 pb-10 max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-14">

          {/* Mascot */}
          <div className="shrink-0">
            <img
              src={logoImg}
              alt="GUBER"
              className="w-32 h-32 sm:w-44 sm:h-44 object-contain"
              style={{ mixBlendMode: "screen", filter: "drop-shadow(0 0 40px rgba(0,229,118,0.35))" }}
              data-testid="img-hero-mascot"
            />
          </div>

          {/* Copy + search */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5 text-[10px] font-display tracking-widest"
              style={{ background: "rgba(0,229,118,0.08)", border: "1px solid rgba(0,229,118,0.22)", color: "#00e576" }}>
              FIND WORK · POST JOBS · VERIFY ANYTHING
            </div>

            <h1 className="font-display font-black tracking-tight leading-[1.05] mb-4 text-[clamp(2rem,7vw,3.5rem)]">
              Find help{" "}
              <span style={{ color: "hsl(152 100% 44%)" }}>near</span>{" "}
              <span style={{ color: "hsl(275 85% 72%)" }}>you.</span>
            </h1>

            <p className="text-sm sm:text-base text-foreground/70 leading-relaxed mb-6 max-w-lg">
              Real local work. Real people. Verified, GPS-checked, and paid through the app —
              no resumes, no gatekeepers, no friction.
            </p>

            {/* Search bar */}
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xl mb-4" data-testid="form-hero-search">
              <input
                type="text"
                placeholder="What do you need help with?"
                className="flex-1 h-12 rounded-xl px-4 text-sm bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 transition-colors"
                data-testid="input-search-what"
              />
              <input
                type="text"
                placeholder="ZIP or city"
                className="w-full sm:w-36 h-12 rounded-xl px-4 text-sm bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 transition-colors"
                data-testid="input-search-zip"
              />
              <button
                onClick={scrollToJobs}
                className="h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm premium-btn flex items-center justify-center gap-2 whitespace-nowrap"
                data-testid="button-see-the-map"
              >
                See the map <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Free badge */}
            <div className="inline-flex items-center gap-2 text-[11px] font-display tracking-wider text-muted-foreground mb-6">
              <span className="online-dot" aria-hidden />
              Always <span className="text-emerald-400 font-bold">free to join</span>
              &nbsp;· No card · No resume
            </div>

            {/* Platform badges */}
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-[11px] font-display tracking-wider" data-testid="row-platform-availability">
              <span className="flex items-center gap-1.5 text-foreground/90" data-testid="text-platform-web">
                <span className="online-dot" aria-hidden />
                <Globe className="w-3.5 h-3.5" />
                Web App <span className="text-emerald-400 font-bold">(Live)</span>
              </span>
              <span className="text-muted-foreground/40">|</span>
              <span className="flex items-center gap-1.5 text-foreground/90" data-testid="text-platform-android">
                <SiGoogleplay className="w-3.5 h-3.5" />
                Google Play <span className="text-emerald-400 font-bold">(Live)</span>
              </span>
              <span className="text-muted-foreground/40">|</span>
              <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-platform-ios">
                <SiApple className="w-3.5 h-3.5" />
                iOS <span className="text-amber-400/80 font-bold">(Soon)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Day-1 OG banner */}
        <div className="mt-8">
          <a
            href="/day1og.html"
            target="_blank"
            rel="noopener noreferrer"
            className="gold-shine-wrap flex items-center gap-3 rounded-xl px-4 py-3 w-full max-w-2xl mx-auto group transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, rgba(180,120,0,0.2) 0%, rgba(245,165,0,0.12) 100%)",
              border: "1.5px solid rgba(245,175,0,0.5)",
            }}
            data-testid="link-hero-day1og"
          >
            <img src={day1OGImg} alt="Day-1 OG" className="w-9 h-9 object-contain rounded-lg shrink-0 relative z-[2]" />
            <div className="flex-1 min-w-0 relative z-[2]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-display font-black tracking-wider text-amber-300">💎 DAY-1 OG ADVANTAGE</span>
                <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>LIMITED</span>
              </div>
              <p className="text-[10px] text-amber-100/70 mt-0.5">Permanent 5% platform fee discount — locked in for life</p>
            </div>
            <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0 relative z-[2]" />
          </a>
        </div>
      </section>

      {/* ── Interactive Map — always visible ── */}
      <section className="relative z-10 px-5 pb-12 max-w-2xl mx-auto w-full" data-testid="section-live-map">
        <div className="mb-4 text-center">
          <h2 className="text-xl font-display font-black tracking-wider mb-1">THE GRID — LIVE NEAR YOU</h2>
          <p className="text-muted-foreground text-xs">Real local jobs &amp; cash drops dropping around you. Tap any pin to claim it.</p>
        </div>
        <GridDemo onClaim={() => setWallOpen(true)} />
      </section>

      {/* ── Categories ── */}
      <section className="relative z-10 px-5 pb-12 max-w-6xl mx-auto w-full">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-display font-black tracking-wider mb-1">WORK IN EVERY CATEGORY</h2>
          <p className="text-muted-foreground text-xs">Whatever your skills — there's a job waiting.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map(({ label, desc, icon: Icon, bg, badge, border, href }) => (
            <Link
              key={label}
              href={href}
              className="relative rounded-2xl p-4 flex flex-col gap-1 items-start text-left active:scale-[0.97] transition-transform overflow-hidden"
              style={{ background: bg, border: border ?? "1px solid rgba(255,255,255,0.06)" }}
              data-testid={`card-category-${label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
            >
              {badge && (
                <span className="absolute top-2.5 right-2.5 text-[9px] font-display font-black px-1.5 py-0.5 rounded-md"
                  style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}>
                  {badge}
                </span>
              )}
              <Icon className="w-5 h-5 mb-1 text-white/80" />
              <p className="text-sm font-display font-black text-white leading-tight">{label}</p>
              <p className="text-[10px] text-white/60 leading-tight">{desc}</p>
              <ChevronRight className="w-3.5 h-3.5 text-white/30 mt-1" />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Live Job Feed (real jobs + demo fill) ── */}
      <section ref={jobsSectionRef} className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full scroll-mt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-black tracking-wider">LIVE JOBS NEAR YOU</h2>
            <p className="text-muted-foreground text-sm mt-1">Real work posted right now in your area</p>
          </div>
          <Link href="/browse-jobs" className="flex items-center gap-1 text-xs font-display tracking-wider text-[#00E5E5] hover:opacity-80 transition-opacity" data-testid="link-see-all-jobs">
            SEE ALL <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {jobsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayJobs.map((job) => (
              <JobCard key={job.id} job={job} onAccept={() => setGateOpen(true)} />
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button onClick={() => setGateOpen(true)} className="flex items-center gap-2 h-12 px-8 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium" data-testid="button-view-more-jobs">
            <Briefcase className="w-4 h-4" />VIEW MORE JOBS
          </button>
        </div>
      </section>

      {/* ── City Activation ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full" data-testid="section-city-activation">
        <div className="rounded-2xl p-8 sm:p-12 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(0,229,118,0.06) 0%, rgba(0,200,255,0.04) 100%)",
            border: "1px solid rgba(0,229,118,0.15)",
          }}>
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.2)", color: "#00e576" }}>
            <span className="online-dot" aria-hidden />
            ACTIVATING CITY BY CITY
          </div>

          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-3">
            Your city is going live.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg mx-auto mb-8">
            GUBER grows neighborhood by neighborhood. The more people who join your area,
            the more jobs, cash drops, and opportunities appear on your local grid.
            Be a founding member — claim your spot before your city fills up.
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8 flex-wrap">
            {["Sign Up Free", "Verify ID", "City Goes Live", "Get Paid"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-display font-black"
                    style={{
                      background: i === 0 ? "rgba(0,229,118,0.2)" : "rgba(255,255,255,0.06)",
                      border: i === 0 ? "1.5px solid rgba(0,229,118,0.5)" : "1.5px solid rgba(255,255,255,0.1)",
                      color: i === 0 ? "#00e576" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[9px] font-display tracking-wider text-muted-foreground whitespace-nowrap">{step}</span>
                </div>
                {i < 3 && <div className="w-5 h-px mb-4" style={{ background: "rgba(255,255,255,0.1)" }} />}
              </div>
            ))}
          </div>

          <Link href="/signup" className="inline-flex items-center gap-2 h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm premium-btn" data-testid="link-activate-city">
            ACTIVATE YOUR CITY <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── $5 Share & Earn ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full" data-testid="section-referral">
        <div className="rounded-2xl p-8 sm:p-12"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(180,83,9,0.04) 100%)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
              <Gift className="w-8 h-8 text-amber-400" />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-display font-black tracking-wider mb-2">
                Earn <span className="text-amber-400">$5</span> for every share
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5 max-w-md">
                When a friend you invite completes their first job on GUBER, you earn $5 cash —
                automatically added to your wallet. No limits. Share with your whole neighborhood.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 h-11 px-7 rounded-xl font-display tracking-[0.15em] text-sm premium-btn"
                  data-testid="button-share-guber"
                >
                  {copied
                    ? <><CheckCircle className="w-4 h-4" />LINK COPIED!</>
                    : <><Share2 className="w-4 h-4" />SHARE GUBER</>}
                </button>
                <Link href="/signup" className="flex items-center gap-2 h-11 px-6 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium" data-testid="link-referral-signup">
                  GET YOUR REFERRAL LINK
                </Link>
              </div>
            </div>

            <div className="shrink-0 text-center hidden lg:flex flex-col items-center gap-1 px-6 py-4 rounded-xl"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <span className="text-3xl font-display font-black text-amber-400">$5</span>
              <span className="text-[10px] font-display tracking-wider text-muted-foreground">PER INVITE</span>
              <span className="text-[9px] text-muted-foreground/60">no cap</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Verify & Inspect callout ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="rounded-2xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, rgba(0,229,229,0.06) 0%, rgba(0,229,229,0.02) 100%)", border: "1px solid rgba(0,229,229,0.15)" }}>
          <div className="p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-full sm:w-64 h-48 sm:h-48 shrink-0">
              <img src={verifyInspectImg} alt="Verify & Inspect" className="w-full h-full object-cover rounded-xl" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/40 to-transparent" />
              <img src={viLogoImg} alt="V&I" className="absolute bottom-2 right-2 w-16 h-16 object-contain drop-shadow-2xl" style={{ mixBlendMode: "screen" }} />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
                style={{ background: "rgba(0,229,229,0.1)", border: "1px solid rgba(0,229,229,0.2)", color: "#00E5E5" }}>
                <ShieldCheck className="w-3 h-3" />GUBER EXCLUSIVE
              </div>
              <h2 className="text-2xl font-display font-black tracking-wider mb-3">VERIFY &amp; INSPECT</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                Get paid to show up and document — visual proof, eyes on the ground. Property walk-throughs,
                pre-purchase photo runs, online listing verification. Helpers don't certify, diagnose, or appraise —
                they take clear photos and short video. $40–$120+ per job.
              </p>
              <Link href="/browse-jobs?category=Verify+%26+Inspect" className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-display tracking-[0.15em] premium-btn" data-testid="link-vi-learn-more">
                SEE V&I JOBS <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-black tracking-wider mb-2">REAL PEOPLE. REAL EARNINGS.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {QUOTES.map((q, i) => (
            <div key={i} className="rounded-2xl p-6 bg-card border border-border" data-testid={`card-quote-${i}`}>
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => <Star key={s} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />)}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">&ldquo;{q.text}&rdquo;</p>
              <div>
                <p className="text-xs font-display font-bold tracking-wider">{q.name}</p>
                <p className="text-[10px] text-muted-foreground font-display">{q.location}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 px-5 pb-20 max-w-3xl mx-auto w-full text-center">
        <div className="rounded-2xl p-10 sm:p-14"
          style={{
            background: "linear-gradient(135deg, rgba(0,229,229,0.05) 0%, rgba(152,255,152,0.04) 100%)",
            border: "1px solid rgba(0,229,229,0.12)",
          }}>
          <h2 className="text-3xl font-display font-black tracking-wider mb-4">READY TO START EARNING?</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Join thousands of people who are turning their neighborhood into a paycheck. No experience required — just show up.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Link href="/signup" className="w-full sm:w-auto h-12 px-10 rounded-xl font-display tracking-[0.2em] text-sm premium-btn flex items-center justify-center gap-2" data-testid="link-cta-signup">
              CREATE FREE ACCOUNT <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="/browse-jobs" className="w-full sm:w-auto h-12 px-8 rounded-xl font-display tracking-[0.2em] text-sm btn-glass-premium flex items-center justify-center" data-testid="link-cta-browse">
              BROWSE OPEN JOBS
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border py-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
            <img src={logoImg} alt="GUBER" className="h-8 object-contain" style={{ mixBlendMode: "screen" }} />
            <div className="flex items-center gap-6 text-[10px] font-display tracking-wider text-muted-foreground">
              <Link href="/terms" data-testid="link-footer-terms">TERMS</Link>
              <span className="w-px h-3 bg-white/10" />
              <Link href="/privacy" data-testid="link-footer-privacy">PRIVACY</Link>
              <span className="w-px h-3 bg-white/10" />
              <Link href="/" data-testid="link-footer-app">GUBER APP</Link>
              {investorPitchPublic && (
                <>
                  <span className="w-px h-3 bg-white/10" />
                  <Link href="/investors" data-testid="link-footer-investors">INVESTORS</Link>
                </>
              )}
            </div>
            <p className="text-[10px] font-display tracking-wider text-muted-foreground">GUBER GLOBAL LLC &mdash; GREENSBORO, NC</p>
          </div>
          <SocialLinks size="sm" testIdPrefix="link-home-social" />
        </div>
      </footer>
    </div>
  );
}
