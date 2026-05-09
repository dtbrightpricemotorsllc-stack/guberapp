import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialLinks } from "@/components/social-links";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  Crown, MapPin, DollarSign, Clock, ChevronRight, X,
  Briefcase, ShieldCheck, Zap, Users, Star, ArrowRight, Lock,
  Search, Globe,
} from "lucide-react";
import { SiGoogleplay, SiApple } from "react-icons/si";

import logoImg   from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import day1OGImg from "@assets/Gubergoldday1_1772434950756.png";
import viLogoImg from "@assets/Picsart_26-04-13_12-33-21-291_1776101665162.png";
import generalLaborImg  from "@assets/category-images/general_labor.png";
import skilledLaborImg  from "@assets/category-images/skilled_labor.png";
import onDemandHelpImg  from "@assets/category-images/on_demand_help.png";
import verifyInspectImg from "@assets/category-images/verify_inspect.png";
import marketplaceImg   from "@assets/category-images/marketplace.png";
import barterLaborImg   from "@assets/category-images/barter_labor.png";

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
}

const CATEGORIES = [
  { label: "General Labor",   img: generalLaborImg,  desc: "Moving, loading, clean-up — show up and earn." },
  { label: "Skilled Labor",   img: skilledLaborImg,  desc: "Trades, repairs, installs — your craft pays." },
  { label: "On-Demand Help",  img: onDemandHelpImg,  desc: "Errands, delivery, quick tasks near you." },
  { label: "Barter Labor",    img: barterLaborImg,   desc: "Trade skills for goods. No cash required." },
  { label: "Verify & Inspect",img: verifyInspectImg, desc: "Visual proof — eyes on the ground, not inspectors." },
  { label: "Marketplace",     img: marketplaceImg,   desc: "Buy, sell, and trade local items." },
];

const QUOTES = [
  { text: "Made $140 in one weekend doing yard work. GUBER made it dead simple.", name: "Marcus T.", location: "Mobile, AL" },
  { text: "Posted my first V&I request and had someone at the property taking photos the same day.", name: "Janelle R.", location: "Saraland, AL" },
  { text: "Finally a platform that pays fast and keeps sketchy people out.", name: "Devon W.", location: "Daphne, AL" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-gate-close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-5">
          <img src={logoImg} alt="GUBER" className="h-14 object-contain" style={{ mixBlendMode: "screen" }} />
        </div>

        <h2 className="text-xl font-display font-black tracking-wider text-center mb-1">
          READY TO EARN?
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-6">
          Create a free account or sign in to accept jobs on the GUBER app.
        </p>

        <div className="space-y-3">
          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-display tracking-[0.15em] text-sm premium-btn"
            data-testid="link-gate-signup"
          >
            GET STARTED FREE
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium"
            data-testid="link-gate-login"
          >
            SIGN IN
          </Link>
        </div>

        <p className="text-center text-muted-foreground text-[10px] font-display tracking-wider mt-5">
          FREE TO JOIN · GUBER GLOBAL LLC
        </p>
      </div>
    </div>
  );
}

function JobCard({ job, onAccept }: { job: PublicJob; onAccept: () => void }) {
  return (
    <div
      className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col"
      data-testid={`card-job-${job.id}`}
    >
      {job.jobImage && (
        <img src={job.jobImage} alt={job.title} className="w-full h-36 object-cover" />
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display font-bold text-sm leading-snug">{job.title}</h3>
          {job.urgentSwitch && (
            <Badge className="shrink-0 text-[9px] font-display tracking-widest bg-amber-500/15 text-amber-400 border-amber-500/20 no-default-hover-elevate" data-testid={`badge-urgent-${job.id}`}>
              <Zap className="w-2.5 h-2.5 mr-0.5" /> URGENT
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {job.locationApprox}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {timeAgo(job.createdAt)}
          </span>
          {job.proofRequired && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400">
              <ShieldCheck className="w-3 h-3" />
              Proof required
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-display no-default-hover-elevate">
            {job.category}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-display no-default-hover-elevate capitalize">
            {job.jobType}
          </Badge>
        </div>

        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-baseline gap-0.5">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-lg font-display font-black text-emerald-400">{job.budget}</span>
            {job.payType === "hourly" && <span className="text-[10px] text-muted-foreground ml-0.5">/hr</span>}
          </div>
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-display font-bold tracking-widest premium-btn"
            data-testid={`button-accept-${job.id}`}
          >
            <Lock className="w-3 h-3" />
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [gateOpen, setGateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchZip, setSearchZip] = useState("");
  const { enabled: investorPitchPublic } = useFeatureFlag("investor_pitch_public");

  // The marketing hero search routes into /browse-jobs with the user's
  // intent + location pre-filled as query params. Both fields are
  // optional — empty submit just opens the map view.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (searchZip.trim()) params.set("zip", searchZip.trim());
    const qs = params.toString();
    window.location.href = qs ? `/browse-jobs?${qs}` : "/browse-jobs";
  };

  const { data: jobs, isLoading: jobsLoading } = useQuery<PublicJob[]>({
    queryKey: ["/api/public/jobs"],
  });

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-home">
      {gateOpen && <GateModal onClose={() => setGateOpen(false)} />}

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
          <Link
            href="/signup"
            className="h-9 px-5 rounded-xl text-xs font-display tracking-[0.15em] premium-btn flex items-center"
            data-testid="link-nav-signup"
          >
            GET STARTED
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col items-center text-center px-5 pt-12 pb-16 max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-[10px] font-display tracking-widest"
          style={{ background: "rgba(0,229,229,0.08)", border: "1px solid rgba(0,229,229,0.2)", color: "#00E5E5" }}>
          <Zap className="w-3 h-3" />
          LOCAL WORK · REAL CASH · TRUSTED PEOPLE
        </div>

        {/* Headline — kept tight so it never breaks past 2 lines on phones.
            "Glad you're here." sits on one line with the CTA on the next. */}
        <h1 className="font-display font-black tracking-tight leading-[1.05] mb-4 text-[clamp(1.85rem,7vw,3.25rem)]">
          Glad you&rsquo;re here.<br />
          <span style={{ color: "hsl(152 100% 44%)" }}>Let&rsquo;s get started.</span>
        </h1>

        <p className="text-base sm:text-lg max-w-lg leading-relaxed mb-8 text-foreground/85">
          Put your city on the map! 📍{" "}
          <span className="neon-pulse font-display font-black">No Resumes</span>.{" "}
          No Gatekeepers.{" "}
          <span className="neon-pulse font-display font-black">Just Hustle</span>.
        </p>

        {/* Interactive Search Bar — two inputs + glowing CTA. */}
        <form
          onSubmit={handleSearchSubmit}
          className="w-full max-w-xl mx-auto mb-6"
          data-testid="form-hero-search"
        >
          <div className="flex flex-col gap-2 p-2 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
            }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="What are you looking for?"
                  aria-label="What are you looking for?"
                  autoComplete="off"
                  className="w-full h-12 pl-10 pr-3 rounded-xl bg-black/40 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-400/50 transition-colors"
                  data-testid="input-hero-search-query"
                />
              </div>
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchZip}
                  onChange={(e) => setSearchZip(e.target.value)}
                  placeholder="Enter ZIP or City"
                  aria-label="ZIP code or city"
                  autoComplete="postal-code"
                  inputMode="text"
                  className="w-full h-12 pl-10 pr-3 rounded-xl bg-black/40 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-400/50 transition-colors"
                  data-testid="input-hero-search-zip"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full h-12 rounded-xl font-display tracking-[0.2em] text-sm premium-btn btn-breathe-glow flex items-center justify-center gap-2"
              data-testid="button-hero-see-map"
            >
              SEE THE MAP
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Secondary CTA row — kept lean now that the search bar is the
            primary action. Sign-up still reachable in one tap. */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/signup"
            className="text-[11px] font-display tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-hero-getstarted"
          >
            GET STARTED FREE →
          </Link>
        </div>

        {/* Day-1 OG badge — gold shine sweep + new high-contrast label. */}
        <a
          href="/day1og.html"
          target="_blank"
          rel="noopener noreferrer"
          className="gold-shine-wrap flex items-center gap-3 rounded-xl px-5 py-3 w-full max-w-md mx-auto group transition-all hover:scale-[1.015]"
          style={{
            background: "linear-gradient(135deg, rgba(180,120,0,0.22) 0%, rgba(245,165,0,0.14) 100%)",
            border: "1.5px solid rgba(245,175,0,0.55)",
            boxShadow: "0 0 24px rgba(245,165,0,0.18), inset 0 1px 0 rgba(255,235,160,0.18)",
            transitionDuration: "0.3s",
          }}
          data-testid="link-hero-day1og"
        >
          <img src={day1OGImg} alt="Day-1 OG" className="w-11 h-11 object-contain rounded-lg shrink-0 relative z-[2]" />
          <div className="flex-1 min-w-0 text-left relative z-[2]">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[12px] font-display font-black tracking-widest text-amber-300 drop-shadow-[0_0_6px_rgba(245,165,0,0.4)]">
                💎 DAY-1 OG
              </span>
              <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>LIMITED</span>
            </div>
            <p className="text-[11px] text-amber-100/85 font-display font-semibold">
              Higher Pay &amp; Exclusive Rewards
            </p>
          </div>
          <Crown className="w-4 h-4 text-amber-300 shrink-0 relative z-[2]" />
        </a>

        {/* Frictionless Platform Bar */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6 flex-wrap text-[11px] font-display tracking-wider"
          data-testid="row-platform-availability">
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

        {/* Stats row */}
        <div className="flex items-center justify-center gap-8 mt-10 flex-wrap">
          {[
            { icon: DollarSign, label: "EARN CASH" },
            { icon: MapPin,     label: "LOCAL WORK" },
            { icon: Users,      label: "GET HIRED"  },
            { icon: ShieldCheck,label: "TRUST FIRST" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-display tracking-wider">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Job Feed ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-black tracking-wider">LIVE JOBS NEAR YOU</h2>
            <p className="text-muted-foreground text-sm mt-1">Real work posted right now in your area</p>
          </div>
          <Link
            href="/browse-jobs"
            className="flex items-center gap-1 text-xs font-display tracking-wider text-[#00E5E5] hover:opacity-80 transition-opacity"
            data-testid="link-see-all-jobs"
          >
            SEE ALL <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {jobsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(jobs ?? []).map((job) => (
              <JobCard key={job.id} job={job} onAccept={() => setGateOpen(true)} />
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setGateOpen(true)}
            className="flex items-center gap-2 h-12 px-8 rounded-xl font-display tracking-[0.15em] text-sm btn-glass-premium"
            data-testid="button-view-more-jobs"
          >
            <Briefcase className="w-4 h-4" />
            VIEW MORE JOBS
          </button>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-display font-black tracking-wider mb-2">WORK IN EVERY CATEGORY</h2>
          <p className="text-muted-foreground text-sm">Whatever your skills — there's a job waiting.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {CATEGORIES.map(({ label, img, desc }) => (
            <Link
              key={label}
              href="/browse-jobs"
              className="group relative overflow-hidden rounded-2xl aspect-[4/3] block"
              data-testid={`card-category-${label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
            >
              <img
                src={img}
                alt={label}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              {label === "Verify & Inspect" && (
                <img
                  src={viLogoImg}
                  alt="V&I"
                  className="absolute top-2 right-2 w-10 h-10 object-contain"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-[11px] font-display font-black tracking-widest text-white mb-0.5">{label}</p>
                <p className="text-[10px] text-white/85 leading-tight">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Verify & Inspect feature callout ── */}
      <section className="relative z-10 px-5 pb-20 max-w-6xl mx-auto w-full">
        <div className="rounded-2xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, rgba(0,229,229,0.06) 0%, rgba(0,229,229,0.02) 100%)", border: "1px solid rgba(0,229,229,0.15)" }}>
          <div className="p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-full sm:w-64 h-48 sm:h-48 shrink-0">
              <img src={verifyInspectImg} alt="Verify & Inspect" className="w-full h-full object-cover rounded-xl" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/40 to-transparent" />
              <img
                src={viLogoImg}
                alt="V&I"
                className="absolute bottom-2 right-2 w-16 h-16 object-contain drop-shadow-2xl"
                style={{ mixBlendMode: "screen" }}
              />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
                style={{ background: "rgba(0,229,229,0.1)", border: "1px solid rgba(0,229,229,0.2)", color: "#00E5E5" }}>
                <ShieldCheck className="w-3 h-3" />
                GUBER EXCLUSIVE
              </div>
              <h2 className="text-2xl font-display font-black tracking-wider mb-3">VERIFY &amp; INSPECT</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                Get paid to show up and document — visual proof, eyes on the ground. Property walk-throughs,
                pre-purchase photo runs, online listing verification. Helpers are eyes on the ground — they don't certify, diagnose, or
                appraise — they just take clear photos and short video. $40–$120+ per job.
              </p>
              <Link
                href="/browse-jobs?category=Verify+%26+Inspect"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-display tracking-[0.15em] premium-btn"
                data-testid="link-vi-learn-more"
              >
                SEE V&I JOBS
                <ArrowRight className="w-4 h-4" />
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
            <div
              key={i}
              className="rounded-2xl p-6 bg-card border border-border"
              data-testid={`card-quote-${i}`}
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
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
          <h2 className="text-3xl font-display font-black tracking-wider mb-4">
            READY TO START EARNING?
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Join thousands of people who are turning their neighborhood into a paycheck.
            No experience required — just show up.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Link
              href="/signup"
              className="w-full sm:w-auto h-13 px-10 rounded-xl font-display tracking-[0.2em] text-sm premium-btn flex items-center justify-center gap-2"
              data-testid="link-cta-signup"
            >
              CREATE FREE ACCOUNT
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/browse-jobs"
              className="w-full sm:w-auto h-13 px-8 rounded-xl font-display tracking-[0.2em] text-sm btn-glass-premium flex items-center justify-center"
              data-testid="link-cta-browse"
            >
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
            <p className="text-[10px] font-display tracking-wider text-muted-foreground">
              GUBER GLOBAL LLC &mdash; GREENSBORO, NC
            </p>
          </div>
          <SocialLinks size="sm" testIdPrefix="link-home-social" />
        </div>
      </footer>
    </div>
  );
}
