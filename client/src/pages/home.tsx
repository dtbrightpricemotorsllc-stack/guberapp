import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialLinks } from "@/components/social-links";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  Crown, MapPin, DollarSign, Clock, ChevronRight, ChevronLeft, X,
  Briefcase, ShieldCheck, Zap, Star, ArrowRight, Lock,
  Globe, Truck, Share2, Gift, CheckCircle,
} from "lucide-react";
import { SiGoogleplay, SiApple } from "react-icons/si";
import { OpportunityMap } from "@/components/opportunity-map";
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

// ── Slideshow ─────────────────────────────────────────────────────────────────
const SLIDES = [
  { label: "EARN",       color: "#00E576", headline: "Your city is hiring.",         sub: "Real cash, real neighbors. No resume, no friction.",            cta: "BROWSE JOBS",     href: "/browse-jobs" },
  { label: "HIRE",       color: "#3B82F6", headline: "Get help in hours.",           sub: "Vetted local workers ready right now in your area.",            cta: "POST A JOB",      href: "/post-job" },
  { label: "VERIFY",     color: "#8B5CF6", headline: "Eyes on the ground.",          sub: "Photo proof & property inspections. Earn $40–$120+.",           cta: "SEE V&I JOBS",    href: "/browse-jobs?category=Verify+%26+Inspect" },
  { label: "LOAD BOARD", color: "#0891b2", headline: "Move it. Haul it. Ship it.",   sub: "Vehicles, boats, RVs — posted by real buyers near you.",        cta: "VIEW LOAD BOARD", href: "/load-board" },
  { label: "EXPLORE",    color: "#EC4899", headline: "Something for everyone.",      sub: "Barter labor, marketplace, AI games & community rewards.",      cta: "EXPLORE ALL",     href: "/browse-jobs" },
];

// ── Five Doors ────────────────────────────────────────────────────────────────
const FIVE_DOORS = [
  {
    id: "earn",      color: "#00E576", icon: DollarSign, label: "EARN",
    headline: "Your neighborhood is hiring.",
    tagline: "Turn free time into real cash.",
    features: ["Real jobs posted near you", "GPS-verified check-ins", "Get paid same day"],
    cta: "BROWSE JOBS", href: "/browse-jobs",
    number: "1",
  },
  {
    id: "hire",      color: "#3B82F6", icon: Briefcase,  label: "HIRE",
    headline: "Get help in hours, not weeks.",
    tagline: "Vetted local workers, any task.",
    features: ["Post for free", "Workers apply instantly", "Payment held in escrow"],
    cta: "POST A JOB", href: "/post-job",
    number: "2",
  },
  {
    id: "verify",    color: "#8B5CF6", icon: ShieldCheck, label: "VERIFY",
    headline: "Eyes on the ground.",
    tagline: "Photo proof, property inspections.",
    features: ["Pre-purchase vehicle photos", "Property walk-throughs", "$40–$120+ per job"],
    cta: "SEE V&I JOBS", href: "/browse-jobs?category=Verify+%26+Inspect",
    number: "3",
  },
  {
    id: "loadboard", color: "#0891b2", icon: Truck,      label: "LOAD BOARD",
    headline: "Move it. Haul it. Ship it.",
    tagline: "Vehicles, boats, RVs & freight.",
    features: ["Cars, boats & equipment", "Partial + full loads", "Direct shipper contact"],
    cta: "VIEW LOAD BOARD", href: "/load-board",
    number: "4",
  },
  {
    id: "explore",   color: "#EC4899", icon: Zap,        label: "EXPLORE",
    headline: "There's more inside.",
    tagline: "Barter, marketplace, AI games.",
    features: ["Trade skills, no cash needed", "Buy & sell locally", "Earn playing AI or Not?"],
    cta: "EXPLORE ALL", href: "/browse-jobs",
    number: "5",
  },
];

// ── Door SVG shape ────────────────────────────────────────────────────────────
function DoorShape({ color, icon: Icon, number, isHovered }: {
  color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; number: string; isHovered: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* CSS arch door — no SVG panels */}
      <div
        style={{
          width: 96,
          height: 136,
          borderRadius: "48px 48px 6px 6px",
          border: `2px solid ${isHovered ? color + "90" : color + "35"}`,
          background: `linear-gradient(180deg, ${color}12 0%, ${color}06 60%, transparent 100%)`,
          boxShadow: isHovered
            ? `0 0 24px ${color}50, 0 0 8px ${color}30, inset 0 0 24px ${color}08`
            : `0 0 8px ${color}18`,
          transition: "all 0.3s ease",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Big faded number */}
        <span style={{
          fontFamily: "system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 48,
          color,
          opacity: isHovered ? 0.22 : 0.12,
          lineHeight: 1,
          transition: "opacity 0.3s ease",
          userSelect: "none",
        }}>
          {number}
        </span>
        {/* Keyhole dot */}
        <div style={{
          position: "absolute",
          right: 14,
          top: "52%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, opacity: isHovered ? 1 : 0.55 }} />
          <div style={{ width: 5, height: 7, borderRadius: "0 0 3px 3px", background: color, opacity: isHovered ? 1 : 0.55 }} />
        </div>
      </div>

      {/* Icon badge */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{
          background: `${color}18`,
          border: `1.5px solid ${color}40`,
          boxShadow: isHovered ? `0 0 14px ${color}55` : "none",
          transition: "all 0.3s ease",
        }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
    </div>
  );
}

// ── Door Card ─────────────────────────────────────────────────────────────────
type DoorDef = typeof FIVE_DOORS[number];
function DoorCard({ door }: { door: DoorDef }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={door.href}
      className="flex-shrink-0 w-[160px] sm:w-auto flex flex-col items-center gap-4 pt-2 pb-5 px-3 rounded-2xl cursor-pointer"
      style={{
        background: hovered ? `${door.color}0a` : "transparent",
        border: `1.5px solid ${hovered ? door.color + "50" : door.color + "20"}`,
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "background 0.3s ease, border-color 0.3s ease, transform 0.2s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`door-${door.id}`}
    >
      <DoorShape
        color={door.color}
        icon={door.icon}
        label={door.label}
        number={door.number}
        isHovered={hovered}
      />
      <div className="text-center w-full">
        <span className="block text-[10px] font-display font-black tracking-[0.3em] mb-1" style={{ color: door.color }}>
          {door.label}
        </span>
        <h3 className="text-[12px] font-display font-black text-white leading-snug mb-1">{door.headline}</h3>
        <p className="text-[10px] text-white/40 leading-snug mb-3">{door.tagline}</p>
        <ul className="space-y-1 mb-3 text-left">
          {door.features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[10px] text-white/50">
              <span className="w-1 h-1 rounded-full shrink-0 mt-[4px]" style={{ background: door.color }} />{f}
            </li>
          ))}
        </ul>
        <div className="inline-flex items-center gap-1 text-[10px] font-display font-black" style={{ color: door.color }}>
          {door.cta} <ArrowRight className="w-2.5 h-2.5" />
        </div>
      </div>
    </Link>
  );
}

// ── Demo job tiles ────────────────────────────────────────────────────────────
const DEMO_JOBS: PublicJob[] = [
  { id: -1, title: "Help Move a Sectional Sofa",   category: "On-Demand Help",  budget: 75, locationApprox: "Near you", zip: "", urgentSwitch: true,  payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  8 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -2, title: "Pre-Purchase Vehicle Photos",  category: "Verify & Inspect", budget: 45, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: true,  serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 23 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -3, title: "Yard Cleanup — Leaf Blowing",  category: "General Labor",    budget: 60, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 45 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -4, title: "Furniture Assembly — IKEA",    category: "Skilled Labor",    budget: 90, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  2 * 3_600_000).toISOString(), appUrl: "", _demo: true },
  { id: -5, title: "Grocery Pickup & Delivery",    category: "On-Demand Help",   budget: 30, locationApprox: "Near you", zip: "", urgentSwitch: true,  payType: "flat", jobType: "one-time", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() - 18 * 60_000).toISOString(), appUrl: "", _demo: true },
  { id: -6, title: "Property Walk-Through Photos", category: "Verify & Inspect", budget: 55, locationApprox: "Near you", zip: "", urgentSwitch: false, payType: "flat", jobType: "one-time", proofRequired: true,  serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date(Date.now() -  3 * 3_600_000).toISOString(), appUrl: "", _demo: true },
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

// ── Gate Modal ────────────────────────────────────────────────────────────────
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

// ── Job Card ──────────────────────────────────────────────────────────────────
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

// ── Hero Slideshow ────────────────────────────────────────────────────────────
function HeroSlideshow() {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused]);

  const slide = SLIDES[current];

  return (
    <section
      className="relative z-10 overflow-hidden w-full"
      style={{ background: "#050508", height: "clamp(330px, 42vw, 510px)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="section-hero-slideshow"
    >
      {SLIDES.map((s, i) => (
        <div
          key={s.label}
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: i === current ? 1 : 0, pointerEvents: i === current ? "auto" : "none" }}
          aria-hidden={i !== current}
        >
          {/* Radial accent glow */}
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 68% 95% at 78% 55%, ${s.color}18 0%, transparent 66%)` }} />
          {/* Subtle grid overlay */}
          <div className="absolute inset-0 opacity-[0.022]"
            style={{ backgroundImage: `linear-gradient(${s.color} 1px,transparent 1px),linear-gradient(90deg,${s.color} 1px,transparent 1px)`, backgroundSize: "48px 48px" }} />
          {/* Bottom gradient to page bg */}
          <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-background to-transparent" />

          {/* Content */}
          <div className="relative h-full flex items-center px-6 sm:px-10 max-w-6xl mx-auto gap-8">
            {/* Left: copy */}
            <div className="flex-1 max-w-xl">
              <div className="inline-flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                <span className="text-[11px] font-display font-black tracking-[0.35em]" style={{ color: s.color }}>
                  {s.label}
                </span>
              </div>
              <h1
                className="font-display font-black tracking-tight leading-[1.03] mb-4 text-white"
                style={{ fontSize: "clamp(1.85rem, 4.6vw, 3.3rem)" }}
              >
                {s.headline}
              </h1>
              <p className="text-white/55 text-sm sm:text-[1rem] leading-relaxed mb-7 max-w-md">{s.sub}</p>
              <Link
                href={s.href}
                className="inline-flex items-center gap-2 h-12 px-8 rounded-xl font-display tracking-[0.15em] text-sm font-black text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: s.color, boxShadow: `0 0 28px ${s.color}50, 0 4px 16px rgba(0,0,0,0.3)` }}
                data-testid={`link-slide-cta-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {s.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Right: mascot */}
            <div className="hidden lg:flex shrink-0 items-center justify-center w-52 xl:w-68">
              <img
                src={logoImg}
                alt="GUBER"
                className="w-44 xl:w-60 h-auto object-contain select-none"
                draggable={false}
                style={{
                  mixBlendMode: "screen",
                  filter: `drop-shadow(0 0 44px ${s.color}) drop-shadow(0 0 90px ${s.color}55) drop-shadow(0 0 150px ${s.color}1a)`,
                  transition: "filter 0.5s ease",
                }}
                data-testid="img-hero-mascot"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Dot indicators */}
      <div className="absolute bottom-5 inset-x-0 flex justify-center gap-2.5" data-testid="slideshow-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setCurrent(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === current ? "22px" : "7px",
              height: "7px",
              background: i === current ? s.color : "rgba(255,255,255,0.18)",
              boxShadow: i === current ? `0 0 8px ${s.color}88` : "none",
            }}
            data-testid={`dot-slide-${i}`}
            aria-label={`Slide ${i + 1}: ${s.label}`}
          />
        ))}
      </div>

      {/* Prev/Next arrows */}
      <button
        onClick={() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length)}
        className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center transition-all hover:scale-110 active:scale-95 hidden sm:flex"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
        data-testid="button-prev-slide"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-4 h-4 text-white/60" />
      </button>
      <button
        onClick={() => setCurrent((c) => (c + 1) % SLIDES.length)}
        className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center transition-all hover:scale-110 active:scale-95 hidden sm:flex"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
        data-testid="button-next-slide"
        aria-label="Next slide"
      >
        <ChevronRight className="w-4 h-4 text-white/60" />
      </button>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [gateOpen, setGateOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const jobsSectionRef = useRef<HTMLDivElement>(null);
  const { enabled: investorPitchPublic } = useFeatureFlag("investor_pitch_public");

  const { data: jobs, isLoading: jobsLoading } = useQuery<PublicJob[]>({
    queryKey: ["/api/public/jobs"],
  });

  const { data: stats } = useQuery<{ members: number; jobs: number; states: number }>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60_000,
  });

  const displayJobs = useMemo(() => {
    const real = jobs ?? [];
    if (real.length >= 6) return real.slice(0, 6);
    return [...real, ...DEMO_JOBS.slice(0, Math.max(0, 6 - real.length))];
  }, [jobs]);

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

      {/* ── Hero Slideshow ── */}
      <HeroSlideshow />

      {/* ── Platform availability strip ── */}
      <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-6 flex-wrap px-5 py-4 text-[11px] font-display tracking-wider border-b border-border/30">
        <span className="flex items-center gap-1.5 text-foreground/90" data-testid="text-platform-web">
          <span className="online-dot" aria-hidden /><Globe className="w-3.5 h-3.5" />
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
        <span className="hidden sm:flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="text-muted-foreground/40">|</span>
          <span className="online-dot" aria-hidden />
          Always <span className="text-emerald-400 font-bold ml-1">free to join</span>
          &nbsp;· No card · No resume
        </span>
      </div>

      {/* ── Opportunity Map ── */}
      <section className="relative z-10 px-5 pt-14 pb-14 max-w-6xl mx-auto w-full" data-testid="section-opportunity-map">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(0,229,118,0.08)", border: "1px solid rgba(0,229,118,0.2)", color: "#00e576" }}>
            <span className="online-dot" aria-hidden />LIVE NEAR YOU
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-2">Land of Opportunities</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Jobs, cash drops, local businesses & more — all in your neighborhood, all on one map.
          </p>
        </div>
        <OpportunityMap onClaim={() => setWallOpen(true)} />
      </section>

      {/* ── Five Doors ── */}
      <section className="relative z-10 px-5 pb-16 max-w-6xl mx-auto w-full" data-testid="section-five-doors">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#8B5CF6" }}>
            YOUR FIVE DOORS
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-2">Pick your door.</h2>
          <p className="text-muted-foreground text-sm">Every door leads to a different kind of opportunity.</p>
        </div>

        {/* Doors row — horizontal scroll on mobile, 5-col on desktop */}
        <div className="flex gap-4 overflow-x-auto pb-4 sm:pb-0 sm:grid sm:grid-cols-5 sm:overflow-visible scrollbar-hide">
          {FIVE_DOORS.map((door) => <DoorCard key={door.id} door={door} />)}
        </div>
      </section>

      {/* ── Day-1 OG banner ── */}
      <div className="relative z-10 px-5 pb-10 max-w-2xl mx-auto w-full">
        <Link
          href="/og-advantage"
          className="gold-shine-wrap flex items-center gap-3 rounded-xl px-4 py-3 w-full group transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg,rgba(180,120,0,0.2) 0%,rgba(245,165,0,0.12) 100%)", border: "1.5px solid rgba(245,175,0,0.5)" }}
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
        </Link>
      </div>

      {/* ── Live Job Feed ── */}
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
          style={{ background: "linear-gradient(135deg,rgba(0,229,118,0.06) 0%,rgba(0,200,255,0.04) 100%)", border: "1px solid rgba(0,229,118,0.15)" }}>
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.2)", color: "#00e576" }}>
            <span className="online-dot" aria-hidden />ACTIVATING CITY BY CITY
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-3">Your city is going live.</h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg mx-auto mb-8">
            GUBER grows neighborhood by neighborhood. The more people who join your area,
            the more jobs, cash drops, and opportunities appear on your local grid.
            Be a founding member — claim your spot before your city fills up.
          </p>
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8 flex-wrap">
            {["Sign Up Free", "Verify ID", "City Goes Live", "Start Earning"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-display font-black"
                    style={{
                      background: i === 0 ? "rgba(0,229,118,0.2)" : "rgba(255,255,255,0.06)",
                      border: i === 0 ? "1.5px solid rgba(0,229,118,0.5)" : "1.5px solid rgba(255,255,255,0.1)",
                      color: i === 0 ? "#00e576" : "rgba(255,255,255,0.4)",
                    }}>
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

      {/* ── Community Stats ── */}
      <section className="relative z-10 px-5 pb-14 max-w-6xl mx-auto w-full" data-testid="section-community-stats">
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              value: stats?.members ? stats.members.toLocaleString() : "—",
              label: "MEMBERS",
              sub: stats?.members ? "and growing daily" : "Growing daily across local communities",
              color: "#00E576",
            },
            {
              value: stats?.jobs ? stats.jobs.toLocaleString() : "—",
              label: "JOBS POSTED",
              sub: "real work, real pay",
              color: "#3B82F6",
            },
            {
              value: stats?.states ? `${stats.states}+` : "—",
              label: "AREAS ACTIVE",
              sub: "more cities going live",
              color: "#8B5CF6",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl p-5 text-center"
              style={{ background: `${s.color}07`, border: `1px solid ${s.color}20` }}
              data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="text-2xl sm:text-3xl font-display font-black mb-0.5" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[10px] font-display font-black tracking-widest mb-1" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Referral / Credits ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full" data-testid="section-referral">
        <div className="rounded-2xl p-8 sm:p-12"
          style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.06) 0%,rgba(180,83,9,0.04) 100%)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
              <Gift className="w-8 h-8 text-amber-400" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-display font-black tracking-wider mb-2">
                Earn <span className="text-amber-400">GUBER Credits</span>
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5 max-w-md">
                Invite friends and earn GUBER Credits when they become active members on GUBER.
                Credits may be used for platform perks, visibility boosts, premium features, and future rewards.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button onClick={handleShare} className="flex items-center gap-2 h-11 px-7 rounded-xl font-display tracking-[0.15em] text-sm premium-btn" data-testid="button-share-guber">
                  {copied ? <><CheckCircle className="w-4 h-4" />LINK COPIED!</> : <><Share2 className="w-4 h-4" />SHARE GUBER</>}
                </button>
                <Link href="/signup" className="flex items-center gap-2 h-11 px-6 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium" data-testid="link-referral-signup">
                  GET YOUR REFERRAL LINK
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Verify & Inspect callout ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="rounded-2xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg,rgba(0,229,229,0.06) 0%,rgba(0,229,229,0.02) 100%)", border: "1px solid rgba(0,229,229,0.15)" }}>
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
          style={{ background: "linear-gradient(135deg,rgba(0,229,229,0.05) 0%,rgba(152,255,152,0.04) 100%)", border: "1px solid rgba(0,229,229,0.12)" }}>
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
