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
  Truck, Share2, Gift, CheckCircle,
} from "lucide-react";
import { SiGoogleplay, SiApple } from "react-icons/si";
import { OpportunityMap } from "@/components/opportunity-map";
import { SignUpWall } from "@/components/signup-wall";
import { JacHomepage } from "@/components/jac-homepage";

import logoImg          from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import day1OGImg        from "@assets/Gubergoldday1_1772434950756.png";
import viLogoImg        from "@assets/Picsart_26-04-13_12-33-21-291_1776101665162.png";
import verifyInspectImg from "@assets/category-images/verify_inspect.png";
import heroEarnImg      from "@assets/file_00000000acf4720cbdee0df300204ecc_1781794028373.png";
import heroHireImg      from "@assets/file_000000001b68722fa9b9a139b8832496_1781794028432.png";
import heroVerifyImg    from "@assets/file_00000000563471f5a72bc4c3624229c7_1781794028404.png";
import heroLoadImg      from "@assets/file_0000000048c471f5be4d6d0fbf5eb94c_1781794028448.png";
import heroExploreImg   from "@assets/file_000000009960720ca77a90e111b70876_1781794028463.png";

import proofImg1 from "@assets/Screenshot_20260331_102503_Facebook_1778199034115.jpg";
import proofImg2 from "@assets/Screenshot_20260426_064718_Facebook_1778199034048.jpg";
import proofImg3 from "@assets/Screenshot_20260426_064907_Facebook_1778199034017.jpg";
import proofImg4 from "@assets/Screenshot_20260426_064624_Facebook_1778199034059.jpg";

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
  { label: "EARN",       color: "#00E576", cta: "BROWSE JOBS",     href: "/browse-jobs",                                        img: heroEarnImg,    focus: "center" },
  { label: "HIRE",       color: "#3B82F6", cta: "POST A JOB",      href: "/post-job",                                           img: heroHireImg,    focus: "center" },
  { label: "VERIFY",     color: "#8B5CF6", cta: "SEE V&I JOBS",    href: "/browse-jobs?category=Verify+%26+Inspect",            img: heroVerifyImg,  focus: "center" },
  { label: "LOAD BOARD", color: "#0891b2", cta: "VIEW LOAD BOARD", href: "/load-board",                                         img: heroLoadImg,    focus: "center" },
  { label: "EXPLORE",    color: "#EC4899", cta: "EXPLORE ALL",     href: "/browse-jobs",                                        img: heroExploreImg, focus: "center" },
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
  const W = 88, H = 148;
  const pad = 8;          // frame padding
  const panelGap = 6;     // gap between upper & lower panels
  const panelX = pad + 6;
  const panelW = W - 2 * panelX;
  const upperH = 52;
  const upperY = pad + 6;
  const lowerY = upperY + upperH + panelGap;
  const lowerH = H - lowerY - pad - 14; // leave room for threshold
  const knobX = W - pad - 10;
  const knobY = H * 0.52;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <svg
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible", transition: "filter 0.3s ease",
          filter: isHovered ? `drop-shadow(0 0 18px ${color}60)` : `drop-shadow(0 0 4px ${color}22)` }}
      >
        {/* Door frame / outer body */}
        <rect
          x={1} y={1} width={W - 2} height={H - 2}
          rx={4} ry={4}
          fill={`${color}0d`}
          stroke={isHovered ? `${color}95` : `${color}40`}
          strokeWidth={1.5}
          style={{ transition: "all 0.3s" }}
        />

        {/* Upper panel */}
        <rect
          x={panelX} y={upperY} width={panelW} height={upperH}
          rx={3} ry={3}
          fill={`${color}${isHovered ? "18" : "0a"}`}
          stroke={isHovered ? `${color}70` : `${color}28`}
          strokeWidth={1}
          style={{ transition: "all 0.3s" }}
        />

        {/* Icon centered in upper panel */}
        <foreignObject x={panelX + panelW / 2 - 10} y={upperY + upperH / 2 - 10} width={20} height={20}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
            <Icon className="w-[18px] h-[18px]" style={{ color, opacity: isHovered ? 1 : 0.55, transition: "opacity 0.3s" }} />
          </div>
        </foreignObject>

        {/* Lower panel */}
        <rect
          x={panelX} y={lowerY} width={panelW} height={lowerH}
          rx={3} ry={3}
          fill={`${color}${isHovered ? "10" : "06"}`}
          stroke={isHovered ? `${color}55` : `${color}22`}
          strokeWidth={1}
          style={{ transition: "all 0.3s" }}
        />

        {/* Door number — faint, in lower panel center */}
        <text
          x={panelX + panelW / 2} y={lowerY + lowerH / 2 + 8}
          textAnchor="middle"
          fontFamily="system-ui, sans-serif" fontWeight={900} fontSize={28}
          fill={color} opacity={isHovered ? 0.18 : 0.08}
          style={{ transition: "opacity 0.3s", userSelect: "none" }}
        >
          {number}
        </text>

        {/* Knob — circle */}
        <circle
          cx={knobX} cy={knobY} r={4}
          fill={isHovered ? color : `${color}55`}
          style={{ transition: "fill 0.3s" }}
        />
        {/* Knob backplate */}
        <rect
          x={knobX - 3} y={knobY - 8} width={6} height={16}
          rx={3} ry={3}
          fill="none"
          stroke={isHovered ? `${color}80` : `${color}30`}
          strokeWidth={1}
          style={{ transition: "stroke 0.3s" }}
        />

        {/* Threshold / step at bottom */}
        <rect
          x={0} y={H - 6} width={W} height={6}
          rx={2} ry={2}
          fill={isHovered ? `${color}22` : `${color}0e`}
          stroke={isHovered ? `${color}60` : `${color}25`}
          strokeWidth={1}
          style={{ transition: "all 0.3s" }}
        />
      </svg>
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

const COMMUNITY_PROOF = [
  { img: proofImg1, caption: "James Ellis — Cash Drop Winner", sub: "Mobile, AL · Found &amp; claimed" },
  { img: proofImg2, caption: "Quandala — Cash Drop Found", sub: "Pensacola, FL · Real community drop" },
  { img: proofImg3, caption: "Klin Brantley — \"It's been found!\"", sub: "85 reactions · 8 shares" },
  { img: proofImg4, caption: "Kyle Holley — Drop Hunt", sub: "Pensacola area · 31 reactions" },
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
function HeroSlideshow({ onSlideChange }: { onSlideChange: (slide: typeof SLIDES[number]) => void }) {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSlideChange(SLIDES[current]);
  }, [current]);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused]);

  return (
    <section
      className="relative z-10 overflow-hidden w-full"
      style={{ height: "clamp(200px, 40vw, 500px)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="section-hero-slideshow"
    >
      {/* Slides — image only, no overlay */}
      {SLIDES.map((s, i) => (
        <div
          key={s.label}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === current ? 1 : 0, pointerEvents: i === current ? "auto" : "none" }}
          aria-hidden={i !== current}
        >
          <img
            src={s.img}
            alt={s.label}
            className="absolute inset-0 w-full h-full object-cover select-none"
            style={{ objectPosition: "60% center" }}
            draggable={false}
          />
          {/* Subtle bottom fade — just enough to blend into background */}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-background to-transparent" />
        </div>
      ))}

      {/* Dots only — no CTA button overlapping images */}
      <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center">
        <div className="flex gap-2.5" data-testid="slideshow-dots">
          {SLIDES.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setCurrent(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? "22px" : "7px",
                height: "7px",
                background: i === current ? s.color : "rgba(255,255,255,0.30)",
                boxShadow: i === current ? `0 0 8px ${s.color}99` : "none",
              }}
              data-testid={`dot-slide-${i}`}
              aria-label={`Slide ${i + 1}: ${s.label}`}
            />
          ))}
        </div>
      </div>

      {/* Prev/Next arrows */}
      <button
        onClick={() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length)}
        className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center transition-all hover:scale-110 active:scale-95 hidden sm:flex"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)" }}
        data-testid="button-prev-slide"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-4 h-4 text-white/70" />
      </button>
      <button
        onClick={() => setCurrent((c) => (c + 1) % SLIDES.length)}
        className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center transition-all hover:scale-110 active:scale-95 hidden sm:flex"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)" }}
        data-testid="button-next-slide"
        aria-label="Next slide"
      >
        <ChevronRight className="w-4 h-4 text-white/70" />
      </button>
    </section>
  );
}

// ── MascotPowerUp ─────────────────────────────────────────────────────────────

const ORBIT_PARTICLES = [
  { r: 82,  sz: 4,   c: '#8B4DFF', spd: 4.2, deg: 0   },
  { r: 108, sz: 2.5, c: '#39FF14', spd: 6.1, deg: 22  },
  { r: 90,  sz: 5,   c: '#8B4DFF', spd: 3.8, deg: 45  },
  { r: 122, sz: 2,   c: '#39FF14', spd: 7.3, deg: 67  },
  { r: 94,  sz: 4,   c: '#8B4DFF', spd: 5.5, deg: 90  },
  { r: 104, sz: 3,   c: '#39FF14', spd: 4.8, deg: 112 },
  { r: 78,  sz: 5,   c: '#8B4DFF', spd: 6.7, deg: 135 },
  { r: 114, sz: 2,   c: '#39FF14', spd: 3.5, deg: 157 },
  { r: 86,  sz: 4,   c: '#8B4DFF', spd: 5.1, deg: 180 },
  { r: 100, sz: 3,   c: '#39FF14', spd: 4.3, deg: 202 },
  { r: 92,  sz: 4.5, c: '#8B4DFF', spd: 7.0, deg: 225 },
  { r: 118, sz: 2,   c: '#39FF14', spd: 3.9, deg: 247 },
  { r: 80,  sz: 3.5, c: '#8B4DFF', spd: 5.8, deg: 270 },
  { r: 106, sz: 3,   c: '#39FF14', spd: 6.4, deg: 292 },
  { r: 96,  sz: 4,   c: '#8B4DFF', spd: 4.6, deg: 315 },
  { r: 116, sz: 2,   c: '#39FF14', spd: 7.2, deg: 337 },
];

const LIGHTNING_ARCS = [
  { d: "M0,0 L18,-30 L8,-48 L26,-74 L38,-92",  c: '#8B4DFF' },
  { d: "M0,0 L30,-6  L24,-22 L52,-30 L62,-46", c: '#39FF14' },
  { d: "M0,0 L-24,20 L-14,38 L-36,56 L-50,72", c: '#8B4DFF' },
  { d: "M0,0 L-26,-18 L-18,-36 L-42,-52 L-54,-66", c: '#39FF14' },
  { d: "M0,0 L6,32 L-6,42 L8,68 L2,86",         c: '#8B4DFF' },
];

const OG_PERKS = [
  "Lifetime 5% Platform Fee Discount",
  "Double GUBER Credits",
  "Free Urgent Posts Every Month",
  "Free Buyer's Order Every Month",
  "Future Founder Perks",
];

// Light rays that radiate from the mascot centre, extending past the video
// rectangle so no hard edge is visible. Purple/green/gold match the section palette.
const MASCOT_RAYS: { a: number; c1: string; c2: string; l: number; h: number }[] = [
  { a: 0,   c1: 'rgba(139,77,255,0.72)', c2: 'rgba(139,77,255,0)', l: 250, h: 3.5 },
  { a: 27,  c1: 'rgba(57,255,20,0.55)',  c2: 'rgba(57,255,20,0)',   l: 225, h: 2.5 },
  { a: 54,  c1: 'rgba(255,255,255,0.22)',c2: 'rgba(255,255,255,0)', l: 200, h: 1.5 },
  { a: 81,  c1: 'rgba(139,77,255,0.62)', c2: 'rgba(139,77,255,0)', l: 240, h: 3   },
  { a: 108, c1: 'rgba(57,255,20,0.50)',  c2: 'rgba(57,255,20,0)',   l: 220, h: 2.5 },
  { a: 135, c1: 'rgba(255,215,0,0.38)',  c2: 'rgba(255,215,0,0)',   l: 230, h: 1.5 },
  { a: 162, c1: 'rgba(139,77,255,0.68)', c2: 'rgba(139,77,255,0)', l: 250, h: 3.5 },
  { a: 189, c1: 'rgba(57,255,20,0.48)',  c2: 'rgba(57,255,20,0)',   l: 225, h: 2.5 },
  { a: 216, c1: 'rgba(255,255,255,0.18)',c2: 'rgba(255,255,255,0)', l: 200, h: 1.5 },
  { a: 243, c1: 'rgba(139,77,255,0.60)', c2: 'rgba(139,77,255,0)', l: 240, h: 3   },
  { a: 270, c1: 'rgba(57,255,20,0.50)',  c2: 'rgba(57,255,20,0)',   l: 220, h: 2.5 },
  { a: 297, c1: 'rgba(255,215,0,0.32)',  c2: 'rgba(255,215,0,0)',   l: 230, h: 1.5 },
];

function MascotPowerUpInner({ onComplete }: { onComplete: () => void }) {
  const [phase,        setPhase]        = useState(0);
  const [visiblePerks, setVisiblePerks] = useState(0);
  const [swKey,        setSwKey]        = useState(0);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    const T = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => { setPhase(4); setSwKey(k => k + 1); }, 4200),
      setTimeout(() => setPhase(5), 5500),
      setTimeout(() => setPhase(6), 7000),
      setTimeout(() => { setPhase(7); setVisiblePerks(1); }, 8000),
      setTimeout(() => setVisiblePerks(2),  9200),
      setTimeout(() => setVisiblePerks(3), 10400),
      setTimeout(() => setVisiblePerks(4), 11600),
      setTimeout(() => setVisiblePerks(5), 12800),
      setTimeout(() => setPhase(8), 14200),
      setTimeout(() => cbRef.current(), 18500),
    ];
    return () => T.forEach(clearTimeout);
  }, []);

  const p1 = phase >= 1;
  const p2 = phase === 2;
  const p3 = phase === 3;
  const p4 = phase >= 4;
  const p5 = phase >= 5;
  const p6 = phase >= 6;
  const p7 = phase >= 7;
  const p8 = phase >= 8;

  return (
    <div
      data-testid="section-mascot-transform"
      className="relative flex flex-col items-center select-none overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, #020008 0%, #07001e 50%, #020008 100%)',
        padding: '52px 0 40px',
        margin: '0 -20px',
        width: 'calc(100% + 40px)',
      }}
    >
      {/* ── orb + particle viewport ── */}
      <div className="relative" style={{ width: 280, height: 280 }}>

        {/* ambient radial glow */}
        <div className="absolute rounded-full pointer-events-none" style={{
          inset: 0,
          background: 'radial-gradient(circle, rgba(139,77,255,0.13) 0%, transparent 68%)',
          animation: 'pu-ambient 2.8s ease-in-out infinite',
        }} />

        {/* orbiting particles */}
        {ORBIT_PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            width:  p.r * 2,
            height: p.r * 2,
            top:  `calc(50% - ${p.r}px)`,
            left: `calc(50% - ${p.r}px)`,
            animation: `pu-orbit ${p.spd}s linear infinite`,
            animationDelay: `${-(p.spd * p.deg / 360)}s`,
            opacity: p1 ? 1 : 0,
            transition: 'opacity 0.7s ease',
          }}>
            <div style={{
              position: 'absolute',
              width: p.sz, height: p.sz,
              top: '50%', right: 0,
              transform: 'translateY(-50%)',
              background: p.c,
              borderRadius: '50%',
              boxShadow: `0 0 ${p.sz * 3}px ${p.c}, 0 0 ${p.sz * 7}px ${p.c}88`,
            }} />
          </div>
        ))}

        {/* lightning arcs */}
        {p2 && (
          <svg
            className="absolute pointer-events-none"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', overflow: 'visible', zIndex: 15 }}
            width="1" height="1" viewBox="0 0 1 1"
          >
            {LIGHTNING_ARCS.map((arc, i) => (
              <path key={i} d={arc.d}
                stroke={arc.c} strokeWidth="1.5" fill="none"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="220" strokeDashoffset="220"
                style={{
                  filter: `drop-shadow(0 0 5px ${arc.c})`,
                  animation: 'pu-arc-draw 0.4s ease forwards',
                  animationDelay: `${i * 75}ms`,
                }}
              />
            ))}
          </svg>
        )}

        {/* dark energy orb */}
        <div className="absolute rounded-full flex items-center justify-center" style={{
          width: 114, height: 114,
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(circle at 38% 32%, #2a0055 0%, #130022 48%, #060010 100%)',
          boxShadow: '0 0 34px #8B4DFF,0 0 75px rgba(139,77,255,0.45),0 0 145px rgba(139,77,255,0.18),inset 0 0 28px rgba(139,77,255,0.4)',
          animation: 'pu-orb-pulse 1.6s ease-in-out infinite, pu-orb-float 3.2s ease-in-out infinite',
          opacity: p4 ? 0 : 1,
          transition: 'opacity 0.35s ease',
          zIndex: 10,
        }}>
          <img src={logoImg} alt="GUBER"
            style={{ width: 68, height: 68, objectFit: 'contain', mixBlendMode: 'screen',
              filter: 'drop-shadow(0 0 8px #8B4DFF) drop-shadow(0 0 18px rgba(57,255,20,0.4))' }} />
        </div>

        {/* flash burst */}
        {p3 && (
          <div className="absolute inset-0 rounded-full pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.96) 0%, rgba(139,77,255,0.75) 28%, rgba(57,255,20,0.3) 55%, transparent 72%)',
            animation: 'pu-flash 0.72s ease-out forwards',
            zIndex: 20,
          }} />
        )}

        {/* shockwave ring 1 */}
        <div key={`sw1-${swKey}`} className="absolute rounded-full pointer-events-none" style={{
          width: 114, height: 114,
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          border: '2px solid #8B4DFF',
          boxShadow: '0 0 14px #8B4DFF,0 0 28px rgba(57,255,20,0.5)',
          animation: swKey > 0 ? 'pu-shockwave 1.1s ease-out forwards' : 'none',
          zIndex: 8,
        }} />

        {/* shockwave ring 2 */}
        <div key={`sw2-${swKey}`} className="absolute rounded-full pointer-events-none" style={{
          width: 114, height: 114,
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          border: '1.5px solid #39FF14',
          boxShadow: '0 0 10px #39FF14',
          animation: swKey > 0 ? 'pu-shockwave 1.1s ease-out 0.16s forwards' : 'none',
          zIndex: 7,
        }} />

        {/* OG mascot glow bed — sits behind the video, gives it a heroic halo */}
        {p4 && (
          <div className="absolute rounded-full pointer-events-none" style={{
            width: 260, height: 260,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(circle, rgba(139,77,255,0.48) 0%, rgba(57,255,20,0.22) 38%, rgba(139,77,255,0.06) 65%, transparent 80%)',
            filter: 'blur(22px)',
            zIndex: 11,
            animation: 'pu-mascot-glow 3.2s ease-in-out infinite',
          }} />
        )}

        {/* OG mascot video — full figure visible, edges faded by overlay */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 260, height: 300,
            top: '50%', left: '50%',
            zIndex: 12,
            opacity: p4 ? 1 : 0,
            transition: 'opacity 0.5s ease',
            animation: p4
              ? 'pu-mascot-in 0.95s cubic-bezier(0.34,1.2,0.64,1) forwards'
              : 'none',
          }}
        >
          {/* Video — full mascot, screen blend drops dark bg pixels */}
          <video
            src="/mascot-hero.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              mixBlendMode: 'screen' as const,
              willChange: 'transform',
              position: 'relative',
              zIndex: 0,
            }}
          />

          {/* Rays — radiate from centre past the rectangle boundary, masking hard edges */}
          {MASCOT_RAYS.map((r, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: r.l,
                height: r.h,
                transformOrigin: 'left center',
                transform: `translateY(-50%) rotate(${r.a}deg)`,
                background: `linear-gradient(to right, transparent 0%, ${r.c1} 38%, ${r.c2} 100%)`,
                animation: `pu-ray-pulse 3.2s ease-in-out ${(i * 0.22).toFixed(2)}s infinite`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          ))}

          {/* Edge blender — inset box-shadow kills all 4 rectangular edges on
              every browser, radial gradient handles the mid-corners */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 70% 64% at 50% 48%, transparent 52%, rgba(7,0,30,0.85) 72%, #020008 90%)',
            boxShadow: [
              'inset 0 0 28px 18px #020008',        /* all-edge dark frame  */
              'inset 0 0 55px 12px rgba(2,0,8,0.9)',/* second softer pass   */
            ].join(','),
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        </div>

        {/* idle soft aura */}
        {p8 && (
          <div className="absolute rounded-full pointer-events-none" style={{
            width: 268, height: 268,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(circle, rgba(139,77,255,0.09) 0%, transparent 65%)',
            animation: 'pu-idle-aura 2.4s ease-in-out infinite',
            zIndex: 3,
          }} />
        )}
      </div>

      {/* ── text + perks ── */}
      <div className="flex flex-col items-center gap-3 w-full px-8" style={{ maxWidth: 340, marginTop: 20 }}>

        {p5 && (
          <p className="text-[10px] font-display tracking-[0.3em] text-center"
            style={{ color: '#8B4DFF', filter: 'drop-shadow(0 0 6px #8B4DFF)', animation: 'pu-slide-up 0.5s ease forwards' }}>
            UNLOCK YOUR SUPER POWERS
          </p>
        )}

        {p6 && (
          <h3 className="text-[24px] font-display font-black tracking-wide text-center leading-tight"
            style={{ color: '#39FF14', filter: 'drop-shadow(0 0 12px #39FF14) drop-shadow(0 0 30px rgba(57,255,20,0.4))', animation: 'pu-slide-up 0.5s ease forwards' }}>
            BECOME A DAY-1 OG
          </h3>
        )}

        {p7 && (
          <ul className="w-full mt-1 flex flex-col gap-2">
            {OG_PERKS.slice(0, visiblePerks).map((perk, i) => (
              <li key={i} className="flex items-center gap-3"
                style={{ animation: 'pu-perk-in 0.4s ease forwards' }}>
                <span style={{
                  width: 20, height: 20, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: 'rgba(57,255,20,0.1)',
                  border: '1px solid rgba(57,255,20,0.5)',
                  color: '#39FF14',
                  fontSize: 11, fontWeight: 900, lineHeight: 1,
                  filter: 'drop-shadow(0 0 5px #39FF14)',
                }}>✓</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: 1.35 }}>
                  {perk}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        @keyframes pu-ambient {
          0%,100% { opacity:0.55; transform:scale(1);    }
          50%     { opacity:1;    transform:scale(1.08); }
        }
        @keyframes pu-orbit { to { transform:rotate(360deg); } }
        @keyframes pu-orb-float {
          0%,100% { transform:translate(-50%,-50%) translateY(0px);  }
          50%     { transform:translate(-50%,-50%) translateY(-9px); }
        }
        @keyframes pu-orb-pulse {
          0%,100% {
            box-shadow:0 0 34px #8B4DFF,0 0 75px rgba(139,77,255,0.45),
                       0 0 145px rgba(139,77,255,0.18),inset 0 0 28px rgba(139,77,255,0.4);
          }
          50% {
            box-shadow:0 0 55px #8B4DFF,0 0 115px rgba(139,77,255,0.65),
                       0 0 210px rgba(139,77,255,0.28),inset 0 0 44px rgba(139,77,255,0.58);
          }
        }
        @keyframes pu-arc-draw {
          from { stroke-dashoffset:220; }
          to   { stroke-dashoffset:0;   }
        }
        @keyframes pu-flash {
          0%   { opacity:0; transform:scale(0.3);  }
          38%  { opacity:1; transform:scale(1.06); }
          100% { opacity:0; transform:scale(2.5);  }
        }
        @keyframes pu-shockwave {
          from { opacity:0.85; transform:translate(-50%,-50%) scale(1);   }
          to   { opacity:0;    transform:translate(-50%,-50%) scale(3.9); }
        }
        @keyframes pu-mascot-in {
          0%  { opacity:0; transform:translate(-50%,-50%) scale(0.62);
                filter:blur(24px) brightness(5.5) saturate(0.2); }
          55% { opacity:1; transform:translate(-50%,-50%) scale(1.07);
                filter:blur(3px) brightness(1.5) saturate(1);   }
          75% { transform:translate(-50%,-50%) scale(0.97);
                filter:blur(0px) brightness(1)   saturate(1);   }
          100%{ opacity:1; transform:translate(-50%,-50%) scale(1);
                filter:blur(0px) brightness(1)   saturate(1);   }
        }
        @keyframes pu-breathe {
          0%,100% { transform:translate(-50%,-50%) scale(1);     }
          50%     { transform:translate(-50%,-50%) scale(1.022); }
        }
        @keyframes pu-idle-aura {
          0%,100% { opacity:0.5; transform:translate(-50%,-50%) scale(1);    }
          50%     { opacity:1;   transform:translate(-50%,-50%) scale(1.12); }
        }
        @keyframes pu-slide-up {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes pu-perk-in {
          from { opacity:0; transform:translateX(-20px); }
          to   { opacity:1; transform:translateX(0);     }
        }
        @keyframes pu-mascot-glow {
          0%,100% { opacity:0.7; transform:translate(-50%,-50%) scale(1);    }
          50%     { opacity:1;   transform:translate(-50%,-50%) scale(1.10); }
        }
        @keyframes pu-video-loop-fade {
          0%,85%,100% { opacity:1;    }
          92%         { opacity:0.82; }
        }
        @keyframes pu-ray-pulse {
          0%,100% { opacity:0.55; }
          50%     { opacity:1;    }
        }
      `}</style>
    </div>
  );
}

function MascotPowerUp() {
  const [cycle, setCycle] = useState(0);
  return <MascotPowerUpInner key={cycle} onComplete={() => setCycle(c => c + 1)} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [gateOpen,      setGateOpen]      = useState(false);
  const [wallOpen,      setWallOpen]      = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [currentSlide,  setCurrentSlide]  = useState(SLIDES[0]);
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

      {/* ── JAC Homepage Assistant — first thing users see ── */}
      <JacHomepage />

      {/* ── Hero Slideshow ── */}
      <HeroSlideshow onSlideChange={setCurrentSlide} />

      {/* ── Slide CTA — below images, never overlapping ── */}
      <div className="relative z-10 flex justify-center px-5 pt-4 pb-2">
        <Link
          href={currentSlide.href}
          className="inline-flex items-center gap-2 h-12 px-8 rounded-xl font-display tracking-[0.15em] text-sm font-black text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: currentSlide.color, boxShadow: `0 0 24px ${currentSlide.color}55, 0 4px 14px rgba(0,0,0,0.4)` }}
          data-testid="link-slide-cta"
        >
          {currentSlide.cta} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* ── Platform availability strip ── */}
      <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-6 flex-wrap px-5 py-4 text-[11px] font-display tracking-wider border-b border-border/30">
        <a
          href="https://play.google.com/store/apps/details?id=com.guber.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-foreground/90 hover:text-emerald-400 transition-colors"
          data-testid="link-platform-android"
        >
          <SiGoogleplay className="w-3.5 h-3.5" />
          Google Play <span className="text-emerald-400 font-bold">(Live)</span>
        </a>
        <span className="text-muted-foreground/40">|</span>
        <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-platform-ios">
          <SiApple className="w-3.5 h-3.5" />
          App Store <span className="text-amber-400/80 font-bold">(Coming Soon)</span>
        </span>
        <span className="hidden sm:flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="text-muted-foreground/40">|</span>
          <span className="online-dot" aria-hidden />
          Always <span className="text-emerald-400 font-bold ml-1">free to join</span>
          &nbsp;· No card · No resume
        </span>
      </div>

      {/* JAC moved above hero — removed from here */}

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
        <a
          href="https://guberapp.com/day1og.html"
          className="gold-shine-wrap flex items-center gap-3 rounded-xl px-4 py-4 w-full group transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg,rgba(180,120,0,0.25) 0%,rgba(245,165,0,0.15) 100%)", border: "2px solid rgba(245,175,0,0.6)", boxShadow: "0 0 20px rgba(245,158,11,0.15)" }}
          data-testid="link-hero-day1og"
        >
          <img src={day1OGImg} alt="Day-1 OG" className="w-11 h-11 object-contain rounded-lg shrink-0 relative z-[2]" style={{ filter: "drop-shadow(0 0 8px rgba(245,158,11,0.5))" }} />
          <div className="flex-1 min-w-0 relative z-[2]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-display font-black tracking-wider text-amber-300">💎 DAY-1 OG ADVANTAGE</span>
              <span className="text-[9px] font-display font-bold px-2 py-0.5 rounded-full animate-pulse"
                style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)" }}>
                ⏳ LIMITED TIME
              </span>
            </div>
            <p className="text-[10px] text-amber-100/80 mt-0.5">Permanent 5% fee discount + OG badge · <span className="text-amber-300 font-bold">you can't lose</span></p>
          </div>
          <Crown className="w-4 h-4 text-amber-300 shrink-0 relative z-[2]" />
        </a>

        <MascotPowerUp />
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
          <p className="text-sm text-muted-foreground max-w-md mx-auto">GUBER Cash Drops happening in real communities — real finds, real winners.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COMMUNITY_PROOF.map((p, i) => (
            <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border flex flex-col" data-testid={`card-proof-${i}`}>
              <div className="relative overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 340 }}>
                <img
                  src={p.img}
                  alt={p.caption}
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </div>
              <div className="p-3">
                <p className="text-xs font-display font-bold tracking-wide text-foreground leading-snug" dangerouslySetInnerHTML={{ __html: p.caption }} />
                <p className="text-[10px] text-muted-foreground mt-0.5" dangerouslySetInnerHTML={{ __html: p.sub }} />
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
          {/* Store badges */}
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <a
              href="https://play.google.com/store/apps/details?id=com.guber.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 h-10 px-4 rounded-xl text-[11px] font-display tracking-wider font-bold transition-colors hover:opacity-80"
              style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e576" }}
              data-testid="link-footer-google-play"
            >
              <SiGoogleplay className="w-4 h-4" /> GET IT ON GOOGLE PLAY
            </a>
            <span
              className="flex items-center gap-2 h-10 px-4 rounded-xl text-[11px] font-display tracking-wider font-bold opacity-50 cursor-default"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
              data-testid="text-footer-app-store"
            >
              <SiApple className="w-4 h-4" /> APP STORE — COMING SOON
            </span>
          </div>

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
