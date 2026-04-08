import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search, Filter, MapPin, Star, CheckCircle2, Shield, Clock,
  Zap, Lock, Eye, Bookmark, Send, ChevronDown, X, TrendingUp,
  User, Award
} from "lucide-react";

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";
const PURPLE = "#7B3FE4";
const SURFACE = "#0A0A0A";
const SURFACE2 = "#111111";
const BORDER = "rgba(255,255,255,0.06)";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#A1A1A1";
const TEXT_MUTED = "#6B6B6B";
const SUCCESS = "#22C55E";

const CATEGORIES = [
  "barter_labor", "skilled_labor", "verify_inspect", "general_labor",
  "delivery", "cleaning", "moving", "pet_care", "tutoring",
];

const MOBILITY_TYPES = [
  { value: "local_only", label: "Local Only" },
  { value: "regional", label: "Regional" },
  { value: "travels_for_work", label: "Travels for Work" },
  { value: "frequently_mobile", label: "Frequently Mobile" },
];

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available Now" },
  { value: "this_week", label: "Available This Week" },
  { value: "part_time", label: "Part-time" },
  { value: "open_to_offers", label: "Open to Offers" },
];

const RADIUS_OPTIONS = [
  { value: "10", label: "10 miles" },
  { value: "25", label: "25 miles" },
  { value: "50", label: "50 miles" },
  { value: "100", label: "100 miles" },
  { value: "0", label: "Nationwide" },
];

const QUICK_FILTERS = [
  { key: "top_rated", label: "Top Rated", icon: Star, apply: { minRating: "4.5" } },
  { key: "id_verified", label: "ID Verified", icon: Shield, apply: { idVerified: true } },
  { key: "high_volume", label: "50+ Jobs", icon: TrendingUp, apply: { minJobs: "50" } },
  { key: "active_now", label: "Recently Active", icon: Zap, apply: { recentActivity: true } },
  { key: "elite", label: "Elite Workers", icon: Award, apply: { minRating: "4.8", minCompletionRate: "95" } },
];

function BadgeChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase"
      style={{ background: `${color}12`, color, border: `1px solid ${color}22` }}
    >
      {label}
    </span>
  );
}

function CandidateCard({
  candidate,
  onUnlock,
  onViewResume,
  unlocking,
}: {
  candidate: any;
  onUnlock: (userId: number) => void;
  onViewResume: (userId: number) => void;
  unlocking: boolean;
}) {
  const badges = candidate.eliteBadgesJson || [];
  const isLimited = candidate.isLimitedView;

  return (
    <div
      className="rounded-2xl p-5 transition-all hover:border-white/[0.10] hover:bg-white/[0.01]"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
      data-testid={`card-candidate-${candidate.userId}`}
    >
      <div className="flex items-start justify-between mb-3.5">
        <div>
          <p className="text-[11px] font-mono tracking-widest mb-1.5" style={{ color: GOLD }}>
            GUBER ID #{candidate.guberId || "XXXXXX"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(candidate.primaryCategories || []).slice(0, 3).map((cat: string) => (
              <span key={cat} className="text-[9px] px-2 py-0.5 rounded-full tracking-wider uppercase"
                style={{ background: `${PURPLE}10`, color: PURPLE, border: `1px solid ${PURPLE}20` }}>
                {cat.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {candidate.idVerified && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${SUCCESS}10`, border: `1px solid ${SUCCESS}18` }}>
              <Shield className="w-3 h-3" style={{ color: SUCCESS }} />
            </div>
          )}
          {candidate.backgroundVerified && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}18` }}>
              <Award className="w-3 h-3" style={{ color: GOLD }} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: `1px solid ${BORDER}` }}>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: GOLD_DK }}>Jobs</p>
          <p className="text-sm font-black" style={{ color: TEXT_PRIMARY }}>{candidate.jobsCompleted || 0}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: GOLD_DK }}>Rating</p>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3" style={{ color: GOLD, fill: GOLD }} />
            <p className="text-sm font-black" style={{ color: TEXT_PRIMARY }}>{(candidate.averageRating || 0).toFixed(1)}</p>
          </div>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: GOLD_DK }}>Complete</p>
          <p className="text-sm font-black" style={{ color: (candidate.completionRate || 0) >= 90 ? SUCCESS : TEXT_PRIMARY }}>
            {(candidate.completionRate || 0).toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: GOLD_DK }}>Response</p>
          <p className="text-sm font-black" style={{ color: TEXT_PRIMARY }}>
            {(candidate.responseSpeedScore || 0).toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3.5">
        {candidate.currentRegion && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: TEXT_SECONDARY }}>
            <MapPin className="w-3 h-3" /> {candidate.currentRegion}
          </span>
        )}
        {candidate.mobilityType && (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: `${PURPLE}08`, color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }}>
            {candidate.mobilityType.replace(/_/g, " ")}
          </span>
        )}
        {candidate.recentActivityFlag && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: SUCCESS }}>
            <Zap className="w-3 h-3" /> Active recently
          </span>
        )}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {badges.includes("reliable") && <BadgeChip label="Reliable" color={SUCCESS} />}
          {badges.includes("elite_reliability") && <BadgeChip label="Elite" color={GOLD} />}
          {badges.includes("fast_response") && <BadgeChip label="Fast" color="#60A5FA" />}
          {badges.includes("frequent_worker") && <BadgeChip label="Frequent" color={PURPLE} />}
          {badges.includes("strong_proof") && <BadgeChip label="Strong Proof" color="#A78BFA" />}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3.5" style={{ borderTop: `1px solid ${BORDER}` }}>
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-[10px] font-bold tracking-[0.1em] rounded-xl h-9 transition-all"
          style={{ background: `${PURPLE}10`, color: PURPLE, border: `1px solid ${PURPLE}22` }}
          onClick={() => onViewResume(candidate.userId)}
          data-testid={`button-view-resume-${candidate.userId}`}
        >
          <Eye className="w-3 h-3" /> GUBER RESUME
        </Button>
        {!candidate.isUnlocked ? (
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-[10px] font-bold tracking-[0.1em] rounded-xl h-9 transition-all"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: `1px solid ${GOLD_BORDER}`, boxShadow: `0 2px 8px ${GOLD_GLOW}` }}
            onClick={() => onUnlock(candidate.userId)}
            disabled={unlocking || isLimited}
            data-testid={`button-unlock-${candidate.userId}`}
          >
            {unlocking ? <Zap className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
            {isLimited ? "VERIFY TO UNLOCK" : "UNLOCK PROFILE"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-[10px] font-bold tracking-[0.1em] rounded-xl h-9"
            style={{ background: `${SUCCESS}10`, color: SUCCESS, border: `1px solid ${SUCCESS}22` }}
            data-testid={`button-unlocked-${candidate.userId}`}
          >
            <CheckCircle2 className="w-3 h-3" /> UNLOCKED
          </Button>
        )}
      </div>
    </div>
  );
}

export default function BizTalentExplorer() {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();
  const [showFilters, setShowFilters] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    category: "",
    radius: "50",
    minJobs: "",
    minRating: "",
    minCompletionRate: "",
    mobilityType: "",
    idVerified: false,
    backgroundVerified: false,
    availability: "",
    recentActivity: false,
  });

  const applyQuickFilter = (key: string) => {
    if (activeQuickFilter === key) {
      setActiveQuickFilter(null);
      setFilters(f => ({ ...f, minRating: "", minJobs: "", minCompletionRate: "", idVerified: false, recentActivity: false }));
      return;
    }
    const qf = QUICK_FILTERS.find(q => q.key === key);
    if (!qf) return;
    setActiveQuickFilter(key);
    setFilters(f => ({ ...f, ...qf.apply }));
  };

  const queryParams = new URLSearchParams();
  if (filters.category) queryParams.set("category", filters.category);
  if (filters.radius && filters.radius !== "0") queryParams.set("radius", filters.radius);
  if (filters.minJobs) queryParams.set("minJobs", filters.minJobs);
  if (filters.minRating) queryParams.set("minRating", filters.minRating);
  if (filters.minCompletionRate) queryParams.set("minCompletionRate", filters.minCompletionRate);
  if (filters.mobilityType) queryParams.set("mobilityType", filters.mobilityType);
  if (filters.idVerified) queryParams.set("idVerified", "true");
  if (filters.backgroundVerified) queryParams.set("backgroundVerified", "true");
  if (filters.availability) queryParams.set("availability", filters.availability);
  if (filters.recentActivity) queryParams.set("recentActivity", "true");

  const queryString = queryParams.toString();
  const fetchUrl = queryString ? `/api/business/talent-explorer?${queryString}` : "/api/business/talent-explorer";

  const { data, isLoading } = useQuery<{
    candidates: any[];
    totalUnlocks: number;
    unlockBalance: number;
    planActive: boolean;
    accountStatus: string;
  }>({
    queryKey: [fetchUrl],
  });

  const unlockMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", "/api/business/unlock-candidate", { userId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Unlocked", description: "You now have full access to this candidate's profile." });
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/business/talent-explorer") });
    },
    onError: (err: any) => {
      toast({ title: "Unlock Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleViewResume = (userId: number) => {
    window.open(`/resume/${userId}`, "_blank");
  };

  const activeCount = [filters.category, filters.mobilityType, filters.availability, filters.minJobs, filters.minRating].filter(Boolean).length +
    (filters.idVerified ? 1 : 0) + (filters.recentActivity ? 1 : 0) + (filters.backgroundVerified ? 1 : 0);

  return (
    <BizLayout>
      <div className="max-w-6xl mx-auto" data-testid="page-talent-explorer">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-xl font-black tracking-tight text-white">Talent Explorer</h1>
              {data?.candidates?.length ? (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold tracking-[0.12em]" style={{ background: `${PURPLE}10`, color: PURPLE, border: `1px solid ${PURPLE}20` }}>
                  {data.candidates.length} FOUND
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
              Discover proven people through performance, reliability, and real-world work.
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#3F3F46" }}>
              Search by category, region, mobility, and trust signals.
            </p>
          </div>
          {data?.planActive && (
            <div className="text-right rounded-xl px-4 py-2.5" style={{ background: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
              <p className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: GOLD_DK }}>Unlocks Left</p>
              <p className="text-xl font-black font-mono" style={{ color: GOLD }}>{data.unlockBalance}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_FILTERS.map(qf => {
            const Icon = qf.icon;
            const active = activeQuickFilter === qf.key;
            return (
              <button
                key={qf.key}
                onClick={() => applyQuickFilter(qf.key)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-bold tracking-[0.08em] transition-all"
                style={{
                  background: active ? GOLD_GLOW : "rgba(255,255,255,0.02)",
                  color: active ? GOLD : "#52525B",
                  border: `1px solid ${active ? GOLD_BORDER : BORDER}`,
                  boxShadow: active ? `0 2px 8px ${GOLD_GLOW}` : "none",
                }}
                data-testid={`quick-filter-${qf.key}`}
              >
                <Icon className="w-3 h-3" style={active ? { fill: qf.key === "top_rated" ? GOLD : "none" } : {}} />
                {qf.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl p-4 mb-6" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: TEXT_MUTED }} />
              <Input
                placeholder="Search by category, region, or GUBER ID..."
                className="pl-10 h-11 rounded-xl border-0 text-sm"
                style={{ background: SURFACE2, color: TEXT_PRIMARY }}
                data-testid="input-search"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-11 rounded-xl text-[10px] font-bold tracking-[0.1em] relative"
              style={{ background: showFilters ? `${PURPLE}10` : "transparent", color: showFilters ? PURPLE : TEXT_SECONDARY, borderColor: showFilters ? `${PURPLE}20` : BORDER }}
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-3.5 h-3.5" />
              FILTERS
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black"
                  style={{ background: PURPLE, color: "#fff" }}>
                  {activeCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              <Select value={filters.category} onValueChange={(v) => setFilters(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-0" style={{ background: SURFACE2, color: TEXT_SECONDARY }} data-testid="filter-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent style={{ background: "#141417", border: `1px solid ${BORDER}` }}>
                  <SelectItem value="all_categories">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.radius} onValueChange={(v) => setFilters(f => ({ ...f, radius: v }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-0" style={{ background: SURFACE2, color: TEXT_SECONDARY }} data-testid="filter-radius">
                  <SelectValue placeholder="Radius" />
                </SelectTrigger>
                <SelectContent style={{ background: "#141417", border: `1px solid ${BORDER}` }}>
                  {RADIUS_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.mobilityType} onValueChange={(v) => setFilters(f => ({ ...f, mobilityType: v }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-0" style={{ background: SURFACE2, color: TEXT_SECONDARY }} data-testid="filter-mobility">
                  <SelectValue placeholder="Mobility" />
                </SelectTrigger>
                <SelectContent style={{ background: "#141417", border: `1px solid ${BORDER}` }}>
                  <SelectItem value="any_mobility">Any Mobility</SelectItem>
                  {MOBILITY_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.availability} onValueChange={(v) => setFilters(f => ({ ...f, availability: v }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-0" style={{ background: SURFACE2, color: TEXT_SECONDARY }} data-testid="filter-availability">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent style={{ background: "#141417", border: `1px solid ${BORDER}` }}>
                  <SelectItem value="any_availability">Any</SelectItem>
                  {AVAILABILITY_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Input
                placeholder="Min jobs"
                type="number"
                value={filters.minJobs}
                onChange={(e) => setFilters(f => ({ ...f, minJobs: e.target.value }))}
                className="h-9 text-xs rounded-xl border-0"
                style={{ background: SURFACE2, color: TEXT_SECONDARY }}
                data-testid="filter-min-jobs"
              />

              <Input
                placeholder="Min rating"
                type="number"
                step="0.1"
                max="5"
                value={filters.minRating}
                onChange={(e) => setFilters(f => ({ ...f, minRating: e.target.value }))}
                className="h-9 text-xs rounded-xl border-0"
                style={{ background: SURFACE2, color: TEXT_SECONDARY }}
                data-testid="filter-min-rating"
              />

              <button
                className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-xl transition-all h-9"
                style={{
                  background: filters.idVerified ? `${SUCCESS}10` : SURFACE2,
                  color: filters.idVerified ? SUCCESS : TEXT_MUTED,
                  border: `1px solid ${filters.idVerified ? `${SUCCESS}22` : BORDER}`,
                }}
                onClick={() => setFilters(f => ({ ...f, idVerified: !f.idVerified }))}
                data-testid="filter-id-verified"
              >
                <Shield className="w-3 h-3" /> ID Verified
              </button>

              <button
                className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-xl transition-all h-9"
                style={{
                  background: filters.recentActivity ? GOLD_GLOW : SURFACE2,
                  color: filters.recentActivity ? GOLD : TEXT_MUTED,
                  border: `1px solid ${filters.recentActivity ? GOLD_BORDER : BORDER}`,
                }}
                onClick={() => setFilters(f => ({ ...f, recentActivity: !f.recentActivity }))}
                data-testid="filter-recent-activity"
              >
                <Zap className="w-3 h-3" /> Recent Activity
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-64 rounded-2xl" style={{ background: SURFACE }} />
            ))}
          </div>
        ) : !data?.candidates?.length ? (
          <div className="rounded-2xl p-16 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
              <User className="w-7 h-7" style={{ color: "#3F3F46" }} />
            </div>
            <p className="text-sm font-bold text-white mb-2">No matches yet</p>
            <p className="text-xs leading-relaxed max-w-sm mx-auto mb-5" style={{ color: TEXT_MUTED }}>
              Try expanding your radius or adjusting your filters.<br />New workers are added as the GUBER network grows.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => setFilters(f => ({ ...f, radius: "0" }))}
                className="text-[10px] font-bold tracking-[0.1em] px-4 py-2 rounded-xl transition-all"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: `1px solid ${GOLD_BORDER}` }}
                data-testid="button-expand-radius"
              >
                EXPAND SEARCH RADIUS
              </button>
              <button
                onClick={() => { setFilters({ category: "", radius: "50", minJobs: "", minRating: "", minCompletionRate: "", mobilityType: "", idVerified: false, backgroundVerified: false, availability: "", recentActivity: false }); setActiveQuickFilter(null); }}
                className="text-[10px] font-bold tracking-[0.1em] px-4 py-2 rounded-xl transition-all"
                style={{ background: "transparent", color: TEXT_MUTED, border: `1px solid ${BORDER}` }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.candidates.map((candidate: any) => (
              <CandidateCard
                key={candidate.userId}
                candidate={candidate}
                onUnlock={(userId) => unlockMutation.mutate(userId)}
                onViewResume={handleViewResume}
                unlocking={unlockMutation.isPending}
              />
            ))}
          </div>
        )}

        {data && !data.planActive && data.accountStatus !== "pending_business" && (
          <div className="mt-8 rounded-2xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_DK}, transparent)` }} />
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: GOLD_GLOW, border: `1px solid ${GOLD_BORDER}`, boxShadow: `0 4px 16px ${GOLD_GLOW}` }}>
                <Lock className="w-6 h-6" style={{ color: GOLD }} />
              </div>
              <p className="text-sm font-black text-white mb-2">Unlock Full Scouting Access</p>
              <p className="text-xs mb-1 leading-relaxed max-w-md mx-auto" style={{ color: TEXT_SECONDARY }}>
                {isDemoUser ? "Subscribe to the Scout Plan for full talent search, monthly profile unlocks, and direct outreach to proven workers." : "Subscribe to the Scout Plan ($99/mo) for full talent search, 20 monthly profile unlocks, and direct outreach to proven workers."}
              </p>
            </div>
          </div>
        )}
      </div>
    </BizLayout>
  );
}
