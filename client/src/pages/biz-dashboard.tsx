import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { BizLayout } from "@/components/biz-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Upload, FileText, ShoppingBag, ChevronRight, Eye, Search,
  ShieldCheck, Send, TrendingUp, Zap, CreditCard, CheckCircle2,
  Flame, Sparkles, ArrowRight, Clock, Target
} from "lucide-react";
import type { Job, BusinessProfile } from "@shared/schema";

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";
const PURPLE = "#7B3FE4";
const SURFACE = "#0A0A0A";
const BORDER = "rgba(255,255,255,0.06)";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#A1A1A1";
const TEXT_MUTED = "#6B6B6B";
const SUCCESS = "#22C55E";

function StatCard({ label, value, sub, icon: Icon, iconColor }: { label: string; value: string | number; sub?: string; icon?: any; iconColor?: string }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-1.5 transition-all hover:border-white/[0.10]" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      {Icon && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-0.5" style={{ background: `${iconColor || GOLD}12`, border: `1px solid ${iconColor || GOLD}20` }}>
          <Icon className="w-4 h-4" style={{ color: iconColor || GOLD }} />
        </div>
      )}
      <p className="font-black text-2xl lg:text-3xl tracking-tight" style={{ color: TEXT_PRIMARY, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ color: TEXT_MUTED, fontSize: "10px", fontWeight: 500 }}>{sub}</p>}
      <p style={{ color: GOLD_DK, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 600 }} className="uppercase">{label}</p>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, sub, iconColor, badge }: { href: string; icon: any; label: string; sub: string; iconColor: string; badge?: string }) {
  return (
    <Link href={href}>
      <button
        className="w-full text-left rounded-2xl p-4 flex items-center gap-3.5 transition-all group hover:border-white/[0.10] hover:bg-white/[0.01]"
        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        data-testid={`button-biz-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${iconColor}10`, border: `1px solid ${iconColor}20` }}>
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{label}</p>
            {badge && (
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase" style={{ background: `${iconColor}15`, color: iconColor, border: `1px solid ${iconColor}25` }}>
                {badge}
              </span>
            )}
          </div>
          <p style={{ color: TEXT_MUTED, fontSize: "11px", marginTop: 1 }}>{sub}</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: TEXT_MUTED }} />
      </button>
    </Link>
  );
}

function statusStyle(status: string): { color: string; background: string; borderColor: string } {
  const map: Record<string, { color: string; background: string; borderColor: string }> = {
    open: { color: "#34d399", background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.2)" },
    in_progress: { color: "#60a5fa", background: "rgba(96,165,250,0.08)", borderColor: "rgba(96,165,250,0.2)" },
    completed: { color: GOLD, background: "rgba(198,168,92,0.08)", borderColor: "rgba(198,168,92,0.2)" },
    proof_submitted: { color: "#a78bfa", background: "rgba(167,139,250,0.08)", borderColor: "rgba(167,139,250,0.2)" },
    disputed: { color: "#f87171", background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.2)" },
    cancelled: { color: TEXT_MUTED, background: "rgba(113,113,122,0.08)", borderColor: "rgba(113,113,122,0.15)" },
    expired: { color: TEXT_MUTED, background: "rgba(113,113,122,0.06)", borderColor: "rgba(113,113,122,0.1)" },
  };
  return map[status] || { color: TEXT_MUTED, background: "rgba(113,113,122,0.06)", borderColor: "rgba(113,113,122,0.1)" };
}

function OnboardingStep({ step, title, desc, done, active }: { step: number; title: string; desc: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-start gap-3.5">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-black transition-all"
        style={{
          background: done ? `${SUCCESS}15` : active ? GOLD_GLOW : "rgba(255,255,255,0.03)",
          border: `1.5px solid ${done ? `${SUCCESS}30` : active ? GOLD_BORDER : "rgba(255,255,255,0.06)"}`,
          color: done ? SUCCESS : active ? GOLD : "#3F3F46",
        }}
      >
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: done ? "#52525B" : TEXT_PRIMARY, textDecoration: done ? "line-through" : "none", textDecorationColor: "#3F3F46" }}>{title}</p>
        <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: done ? "#3F3F46" : TEXT_MUTED }}>{desc}</p>
      </div>
    </div>
  );
}

export default function BizDashboard() {
  const { isDemoUser } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const { data: account, isLoading: accountLoading } = useQuery<any>({
    queryKey: ["/api/business/account"],
    retry: false,
  });

  const { data: profile, isLoading: profileLoading } = useQuery<BusinessProfile>({
    queryKey: ["/api/business/profile"],
    retry: false,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/business/jobs"],
    enabled: !!profile || !!account,
  });

  const isLoading = accountLoading || profileLoading;

  const avgResponseHrs = useMemo(() => {
    const withLocked = (jobs || []).filter(j => j.lockedAt && j.createdAt);
    if (!withLocked.length) return null;
    const totalMs = withLocked.reduce((sum, j) => sum + (new Date(j.lockedAt!).getTime() - new Date(j.createdAt!).getTime()), 0);
    return (totalMs / withLocked.length) / (1000 * 60 * 60);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        if (
          !(j.location || "").toLowerCase().includes(q) &&
          !(j.zip || "").toLowerCase().includes(q) &&
          !(j.title || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, searchFilter]);

  if (isLoading) {
    return (
      <BizLayout>
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-24 rounded-2xl" style={{ background: SURFACE }} />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" style={{ background: SURFACE }} />
            ))}
          </div>
          <Skeleton className="h-40 rounded-2xl" style={{ background: SURFACE }} />
        </div>
      </BizLayout>
    );
  }

  const isPending = account?.status === "pending_business";
  const isApproved = account?.status === "approved_limited";
  const isVerified = account?.status === "verified_business";
  const hasPlan = account?.planActive;
  const companyName = account?.companyName || profile?.companyName || "Your Business";

  const total = jobs?.length || 0;
  const completed = jobs?.filter((j) => j.status === "completion_submitted" || j.status === "completed_paid").length || 0;
  const inProgress = jobs?.filter((j) => ["in_progress", "active", "funded", "accepted_pending_payment"].includes(j.status)).length || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalSpend = jobs?.filter((j) => j.status === "completion_submitted" || j.status === "completed_paid").reduce((sum, j) => sum + (j.finalPrice || j.budget || 0), 0) || 0;

  const isNewAccount = isPending || (isApproved && total === 0);

  return (
    <BizLayout>
      <div className="max-w-5xl mx-auto" style={{ paddingBottom: "3rem" }}>

        {/* Company header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(198,168,92,0.07)", border: `1px solid rgba(198,168,92,0.14)` }}>
            <Building2 className="w-5 h-5" style={{ color: GOLD_DK }} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-black text-xl tracking-tight" style={{ color: TEXT_PRIMARY }} data-testid="text-company-name">
                {companyName}
              </h1>
              {isVerified && <ShieldCheck className="w-4 h-4" style={{ color: SUCCESS }} data-testid="badge-verified-company" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[9px] px-2.5 py-0.5 rounded-full font-bold tracking-[0.15em] uppercase"
                style={{
                  background: isPending ? "rgba(245,158,11,0.07)" : isVerified ? `${SUCCESS}10` : "rgba(198,168,92,0.07)",
                  color: isPending ? "#F59E0B" : isVerified ? SUCCESS : GOLD_DK,
                  border: `1px solid ${isPending ? "rgba(245,158,11,0.15)" : isVerified ? `${SUCCESS}20` : "rgba(198,168,92,0.16)"}`,
                }}
                data-testid="text-account-status"
              >
                {isPending ? "Pending Review" : isApproved ? "Approved · Limited" : isVerified ? "Verified" : account?.status || "Active"}
              </span>
              {hasPlan && (
                <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold tracking-[0.15em] uppercase"
                  style={{ background: `${PURPLE}0D`, color: PURPLE, border: `1px solid ${PURPLE}20` }}>
                  Scout Plan
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── STATUS ─────────────────────────────────── */}
        {(isPending || (!isVerified && !isPending) || isNewAccount) && (
          <div style={{ marginBottom: "2.75rem" }}>
            <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-4" style={{ color: TEXT_MUTED }}>Status</p>

            {isPending && (
              <div className="rounded-2xl overflow-hidden" style={{ background: "#0A0A0A", border: "1px solid rgba(245,158,11,0.10)" }}>
                <div className="h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.30), transparent)" }} />
                <div className="p-7 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
                    <Clock className="w-4 h-4" style={{ color: "#F59E0B" }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-white mb-1.5">Access request under review</p>
                    <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                      The GUBER team reviews every business application to maintain network quality. You'll be notified when approved — typically within 1–2 business days.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!isVerified && !isPending && (
              <div className="rounded-2xl overflow-hidden" style={{ background: "#0A0A0A", border: `1px solid ${GOLD_BORDER}` }}>
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_DK}, transparent)` }} />
                <div className="p-7 flex items-start gap-5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(198,168,92,0.06)", border: `1px solid rgba(198,168,92,0.14)` }}>
                    <ShieldCheck className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white mb-2">Complete Business Verification</p>
                    <p className="text-xs leading-relaxed mb-5" style={{ color: TEXT_SECONDARY }}>
                      {isDemoUser ? "Verified companies unlock full scouting, candidate profiles, and direct outreach. Submit your EIN to gain full access." : "Verified companies unlock full scouting, candidate profiles, and direct outreach. Submit your EIN and a one-time $49 fee to gain full access."}
                    </p>
                    <Link href="/biz/verification">
                      <Button
                        size="sm"
                        className="h-9 text-[10px] font-bold tracking-[0.14em] rounded-xl gap-1.5"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: "none" }}
                        data-testid="button-start-verification"
                      >
                        START VERIFICATION
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {isNewAccount && (
              <div className="rounded-2xl p-6 mt-3" style={{ background: "#0A0A0A", border: `1px solid rgba(255,255,255,0.05)` }}>
                <div className="flex items-center gap-2 mb-5">
                  <Target className="w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
                  <p className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: TEXT_MUTED }}>Access Status</p>
                </div>
                <div className="space-y-4">
                  <OnboardingStep step={1} title="Submit access request" desc="Application received and queued for review" done={true} active={false} />
                  <OnboardingStep step={2} title="Account approval" desc="GUBER team reviews your business credentials" done={!isPending} active={isPending} />
                  <OnboardingStep step={3} title="Complete verification" desc={isDemoUser ? "Submit EIN to complete verification and unlock full access" : "Submit EIN and pay $49 verification fee to unlock full access"} done={isVerified} active={isApproved && !isVerified} />
                  <OnboardingStep step={4} title="Start scouting" desc="Explore talent, unlock profiles, and send direct offers" done={false} active={isVerified} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCOUTING ───────────────────────────────── */}
        <div style={{ marginBottom: "2.75rem" }}>
          <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-4" style={{ color: TEXT_MUTED }}>Scouting</p>

          {/* Primary Talent Explorer card */}
          <Link href="/biz/talent-explorer">
            <div
              className="rounded-2xl p-7 mb-3 cursor-pointer transition-all group"
              style={{ background: "#0D0D0D", border: `1px solid rgba(255,255,255,0.06)` }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
              data-testid="card-talent-explorer-primary"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${PURPLE}10`, border: `1px solid ${PURPLE}18` }}>
                      <Search className="w-4.5 h-4.5" style={{ color: PURPLE }} />
                    </div>
                    <div>
                      <p className="text-base font-black text-white">Talent Explorer</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SUCCESS }} />
                        <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Active in your region</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed mb-1" style={{ color: TEXT_SECONDARY }}>
                    Discover proven people through performance, reliability, and real-world work.
                  </p>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>Search by category, region, mobility, and trust signals.</p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0 mt-1 opacity-20 group-hover:opacity-50 transition-opacity" style={{ color: TEXT_PRIMARY }} />
              </div>
            </div>
          </Link>

          {/* Secondary row: Sent Offers + Verification */}
          <div className="grid grid-cols-2 gap-3">
            <QuickAction href="/biz/offers" icon={Send} label="Sent Offers" sub={total > 0 ? "Track your outreach" : "No outreach yet"} iconColor="#60A5FA" />
            <QuickAction href="/biz/verification" icon={ShieldCheck} label="Verification" sub={isVerified ? "Verified" : "Required for full access"} iconColor={isVerified ? SUCCESS : "#A1A1A1"} />
          </div>
        </div>

        {/* ── CAMPAIGNS ──────────────────────────────── */}
        <div style={{ marginBottom: "2.75rem" }}>
          <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-4" style={{ color: TEXT_MUTED }}>Campaigns</p>

          <div className="rounded-2xl overflow-hidden" style={{ background: "#0A0A0A", border: `1px solid ${GOLD_BORDER}` }}>
            <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_DK}, transparent)` }} />
            <div className="p-7 flex items-start gap-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(198,168,92,0.06)", border: `1px solid rgba(198,168,92,0.14)` }}>
                <Flame className="w-5 h-5" style={{ color: GOLD }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-2">
                  <p className="text-base font-black text-white">Live GUBER Drops</p>
                  <span className="text-[8px] px-1.5 py-0.5 rounded font-bold tracking-[0.18em] uppercase" style={{ background: "rgba(198,168,92,0.07)", color: GOLD_DK, border: `1px solid rgba(198,168,92,0.16)` }}>
                    NEW
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed mb-1.5" style={{ color: TEXT_SECONDARY }}>
                  Sponsor a live cash drop and put your business in front of real GUBER users.
                </p>
                <p className="text-sm font-semibold mb-1.5" style={{ color: GOLD }}>This could be your company.</p>
                <p className="text-xs leading-relaxed mb-6" style={{ color: TEXT_MUTED }}>
                  When a drop is live, your business is featured directly inside GUBER — in front of active workers in real time.
                </p>
                <Link href="/biz/sponsor-drop">
                  <Button
                    size="sm"
                    className="gap-1.5 h-9 text-[10px] font-bold tracking-[0.14em] rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: "none" }}
                    data-testid="button-sponsor-drop"
                  >
                    <Sparkles className="w-3 h-3" />
                    SPONSOR A DROP
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── PERFORMANCE ────────────────────────────── */}
        {total > 0 && (
          <div style={{ marginBottom: "2.75rem" }}>
            <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-4" style={{ color: TEXT_MUTED }}>Performance</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <StatCard label="Total Assignments" value={total} icon={FileText} iconColor={PURPLE} />
              <StatCard label="Completed" value={completed} icon={CheckCircle2} iconColor={SUCCESS} />
              <StatCard label="Active" value={inProgress} icon={Zap} iconColor="#60A5FA" />
              <StatCard label="Completion Rate" value={`${completionRate}%`} icon={TrendingUp} iconColor={GOLD_DK} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Avg Response" value={avgResponseHrs === null ? "—" : avgResponseHrs < 1 ? `${Math.round(avgResponseHrs * 60)}m` : `${avgResponseHrs.toFixed(1)}h`} sub="to first accept" icon={Clock} iconColor={TEXT_MUTED} />
              <StatCard label="Total Spend" value={`$${totalSpend.toFixed(0)}`} icon={CreditCard} iconColor={TEXT_MUTED} />
            </div>
          </div>
        )}

        {/* ── OPERATIONS ─────────────────────────────── */}
        <div style={{ marginBottom: "2.75rem" }}>
          <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-4" style={{ color: TEXT_MUTED }}>Operations</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <QuickAction href="/biz/bulk-post" icon={Upload} label="Deploy Assignments" sub="Upload CSV of addresses" iconColor="#60a5fa" />
            <QuickAction href="/biz/templates" icon={FileText} label="Inspection Standards" sub="Reusable inspection forms" iconColor="#a78bfa" />
            <QuickAction href="/biz/observations" icon={ShoppingBag} label="Field Data" sub="Browse completed field work" iconColor="#71717A" />
          </div>
        </div>

        {/* ── ASSIGNMENT HISTORY ─────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold tracking-[0.22em] uppercase" style={{ color: TEXT_MUTED }}>
              Assignment History
            </p>
            {total > 0 && <p style={{ color: TEXT_MUTED, fontSize: "11px" }}>{filteredJobs.length} of {total}</p>}
          </div>

          {total > 0 && (
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search by city, zip, or title..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl text-xs outline-none transition-all focus:border-white/[0.10]"
                  style={{ background: "#0A0A0A", border: `1px solid rgba(255,255,255,0.05)`, color: TEXT_PRIMARY }}
                  data-testid="input-job-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs w-32 rounded-xl" style={{ background: "#0A0A0A", border: `1px solid rgba(255,255,255,0.05)`, color: TEXT_PRIMARY }} data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent style={{ background: "#141417", border: `1px solid rgba(255,255,255,0.06)` }}>
                  {["all", "posted_public", "in_progress", "completion_submitted", "completed_paid", "proof_submitted", "cancelled"].map((s) => (
                    <SelectItem key={s} value={s} style={{ color: TEXT_PRIMARY }}>
                      {s === "all" ? "All Status" : s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {jobsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" style={{ background: "#0A0A0A" }} />
              ))}
            </div>
          ) : filteredJobs.length > 0 ? (
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid rgba(255,255,255,0.05)` }}>
              {filteredJobs.slice(0, 50).map((job, idx) => {
                const ss = statusStyle(job.status);
                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors"
                    style={{
                      background: "transparent",
                      borderBottom: idx < filteredJobs.length - 1 ? `1px solid rgba(255,255,255,0.03)` : "none",
                    }}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    data-testid={`biz-job-row-${job.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: TEXT_PRIMARY }}>{job.title}</p>
                      <p style={{ color: TEXT_MUTED, fontSize: "11px" }} className="truncate">
                        {job.location || ""}
                        {job.zip ? ` · ${job.zip}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="font-bold text-sm font-mono" style={{ color: TEXT_SECONDARY }}>${job.budget || 0}</p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-lg font-medium capitalize"
                        style={{ color: ss.color, background: ss.background, border: `1px solid ${ss.borderColor}` }}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                      {["proof_submitted", "completion_submitted", "completed_paid"].includes(job.status) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                          className="flex items-center gap-1 transition-colors hover:opacity-70"
                          style={{ color: TEXT_MUTED, fontSize: "11px" }}
                          data-testid={`button-view-job-${job.id}`}
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl" style={{ background: "#0A0A0A", border: `1px solid rgba(255,255,255,0.04)` }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.015)", border: `1px solid rgba(255,255,255,0.04)` }}>
                <FileText className="w-5 h-5" style={{ color: "#3F3F46" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "#52525B" }}>
                {total === 0 ? "No activity yet" : "No assignments match your filters"}
              </p>
              <p className="text-[11px] max-w-xs text-center leading-relaxed" style={{ color: "#3F3F46" }}>
                {total === 0
                  ? "Post your first field assignment or use bulk upload to get started."
                  : "Try adjusting your search or filter criteria."}
              </p>
              {total === 0 && (
                <Link href="/biz/bulk-post">
                  <Button
                    size="sm"
                    className="mt-2 h-9 text-[10px] font-bold tracking-[0.12em] rounded-xl gap-1.5"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: "none" }}
                    data-testid="button-post-first-job"
                  >
                    CREATE YOUR FIRST FIELD ASSIGNMENT
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>

      </div>
    </BizLayout>
  );
}
