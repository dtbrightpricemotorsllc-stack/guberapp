import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { JobCard } from "@/components/job-card";
import { GoogleMap, type JobPin } from "@/components/google-map";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Briefcase, SlidersHorizontal, Plus, Map, List, ShieldCheck, MapPin as MapPinIcon, Clock, X, Lock } from "lucide-react";
import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { shouldShowAlertPrompt } from "@/components/alert-prompt-modal";
import { subscribeToPush, getPushStatus } from "@/lib/push";
import type { Job, ServiceType } from "@shared/schema";
import onDemandImg from "@assets/category-images/on_demand_help.png";
import skilledImg from "@assets/category-images/skilled_labor.png";
import generalImg from "@assets/category-images/general_labor.png";
import barterImg from "@assets/category-images/barter_labor.png";

const CATEGORY_IMAGES: Record<string, string> = {
  "On-Demand Help": onDemandImg,
  "Skilled Labor": skilledImg,
  "General Labor": generalImg,
  "Barter Labor": barterImg,
};

function SkilledTierBadge({ serviceType }: { serviceType: string }) {
  const { data: skilledServices } = useQuery<ServiceType[]>({
    queryKey: ["/api/services/Skilled Labor"],
  });

  const st = skilledServices?.find(s => s.name === serviceType);
  if (!st || !st.minTier || st.minTier === "community") return null;

  return (
    <Badge variant="outline" className="text-[10px] font-display py-0 h-5 bg-amber-500/10 border-amber-500/20 text-amber-500 gap-1 no-default-hover-elevate" data-testid={`badge-tier-required-${st.minTier}`}>
      <ShieldCheck className="w-2.5 h-2.5" />
      Requires {st.minTier.charAt(0).toUpperCase() + st.minTier.slice(1)}
    </Badge>
  );
}

function TierBadge({ minTier }: { minTier: string }) {
  if (!minTier || minTier === "community") return null;
  return (
    <Badge variant="outline" className="text-[10px] font-display py-0 h-5 bg-amber-500/10 border-amber-500/20 text-amber-500 gap-1 no-default-hover-elevate" data-testid={`badge-tier-required-${minTier}`}>
      <ShieldCheck className="w-2.5 h-2.5" />
      Requires {minTier.charAt(0).toUpperCase() + minTier.slice(1)}
    </Badge>
  );
}

const allCategories = [
  "All",
  "On-Demand Help",
  "General Labor",
  "Skilled Labor",
  "Barter Labor",
];

export default function BrowseJobs() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialCategory = params.get("category") || "All";
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isFlagged = (user as any)?.backgroundCheckStatus === "flagged";
  const restrictions: string[] = (user as any)?.backgroundCheckRestrictions || [];

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState("posted_public");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedPin, setSelectedPin] = useState<JobPin | null>(null);
  const [alertsJustEnabled, setAlertsJustEnabled] = useState(false);

  const alertsOff = !alertsJustEnabled && shouldShowAlertPrompt();
  const availableOff = !(user as any)?.isAvailable;

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/users/${user!.id}`, { isAvailable: true });
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          await apiRequest("POST", "/api/users/location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  const handleEnableAlerts = async () => {
    if (!user?.id) return;
    await subscribeToPush(user.id);
    if (getPushStatus() === "granted") setAlertsJustEnabled(true);
  };

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: mapPins } = useQuery<JobPin[]>({
    queryKey: ["/api/map-jobs"],
    enabled: viewMode === "map",
  });

  const filtered = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => {
      if (j.category === "Verify & Inspect") return false;
      if (isFlagged && restrictions.includes(j.category)) return false;
      if (category !== "All" && j.category !== category) return false;
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (search && !j.title.toLowerCase().includes(search.toLowerCase()) && !j.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [jobs, category, statusFilter, search, isFlagged, restrictions]);

  const postHref = category === "Verify & Inspect"
    ? "/verify-inspect"
    : `/post-job${category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`;

  return (
    <GuberLayout>
      <div className="max-w-3xl mx-auto px-4 py-6" data-testid="page-browse-jobs">
        {CATEGORY_IMAGES[category] && (
          <div className="relative mb-4 rounded-2xl overflow-hidden h-28 animate-fade-in" data-testid="banner-category-image">
            <img
              src={CATEGORY_IMAGES[category]}
              alt={category}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 px-4 py-3">
              <p className="font-display font-extrabold text-white text-lg tracking-tight leading-none">{category}</p>
              <p className="text-white/70 text-xs mt-0.5">Jobs available near you</p>
            </div>
          </div>
        )}

        {!CATEGORY_IMAGES[category] && (
          <div className="mb-5 animate-fade-in">
            <h1 className="text-xl font-display font-bold tracking-tight mb-1" data-testid="text-browse-title">
              Browse Jobs
            </h1>
            <p className="text-sm text-muted-foreground">Find opportunities that match your skills</p>
          </div>
        )}

        {isFlagged && restrictions.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in" data-testid="banner-background-restriction">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-display font-bold text-destructive tracking-wide">Category Restrictions Active</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Due to background check status, some categories are restricted: {restrictions.join(", ")}. Contact support if you believe this is an error.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-5 animate-fade-in stagger-1">
          <Link href={postHref} className="flex-1">
            <Button className="w-full gap-2 premium-btn rounded-xl font-display tracking-wider text-xs h-11" data-testid="button-post-job-browse">
              <Plus className="w-4 h-4" />
              POST A JOB
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl border-white/[0.15] hover:border-white/25"
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
            data-testid="button-toggle-view"
          >
            {viewMode === "list" ? <Map className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </Button>
        </div>

        <div className="space-y-3 mb-6 animate-slide-up stagger-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs..."
              className="pl-10 premium-input rounded-xl h-11"
              data-testid="input-search-jobs"
            />
          </div>
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="flex-1 premium-input rounded-xl h-10" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((c) => {
                  const isRestricted = isFlagged && c !== "All" && restrictions.includes(c);
                  return (
                    <SelectItem
                      key={c}
                      value={c}
                      disabled={isRestricted}
                      className={isRestricted ? "opacity-40 cursor-not-allowed" : ""}
                      data-testid={`category-option-${c.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isRestricted && <Lock className="w-3 h-3 text-destructive" />}
                        {c}
                        {isRestricted && <span className="text-[10px] text-destructive/70">Restricted</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 premium-input rounded-xl h-10" data-testid="select-status">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="posted_public">Open</SelectItem>
                <SelectItem value="accepted_pending_payment">Accepted</SelectItem>
                <SelectItem value="funded">Funded</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completion_submitted">Completed</SelectItem>
                <SelectItem value="completed_paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {viewMode === "map" ? (
          <div className="glass-card rounded-2xl p-3 animate-fade-in relative" data-testid="section-map-view">
            <GoogleMap
              pins={mapPins || []}
              onPinClick={setSelectedPin}
              className="h-[400px]"
            />

            {selectedPin && (
              <div
                className="absolute bottom-16 left-6 right-6 z-[9999] animate-in slide-in-from-bottom-2 duration-300"
                data-testid={`card-pin-preview-${selectedPin.id}`}
              >
                <div className="glass-card-strong rounded-2xl p-4 shadow-2xl relative border-primary/20 bg-background/95 backdrop-blur-xl">
                  <button
                    onClick={() => setSelectedPin(null)}
                    className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
                    data-testid="button-close-preview"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${selectedPin.color}20`, border: `1.5px solid ${selectedPin.color}40` }}
                    >
                      <MapPinIcon className="w-6 h-6" style={{ color: selectedPin.color }} />
                    </div>
                    <div className="min-w-0 pr-6">
                      <h3 className="font-display font-extrabold text-foreground text-base leading-tight truncate mb-1">
                        {selectedPin.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-display font-bold px-2 py-0 h-5 border-white/10 no-default-hover-elevate"
                          style={{ color: selectedPin.color, borderColor: `${selectedPin.color}40`, background: `${selectedPin.color}10` }}
                        >
                          {selectedPin.category}
                        </Badge>
                        {selectedPin.serviceType && (
                          <span className="text-[10px] font-display text-muted-foreground tracking-wider">
                            {selectedPin.serviceType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-display text-muted-foreground tracking-widest uppercase mb-0.5">Budget</span>
                      <span className="text-xl font-display font-black guber-text-green">
                        {selectedPin.budget ? `$${selectedPin.budget.toFixed(2)}` : "Barter"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-display text-muted-foreground tracking-widest uppercase mb-0.5">Posted</span>
                      <div className="flex items-center gap-1.5 text-xs font-display text-muted-foreground/80">
                        <Clock className="w-3.5 h-3.5" />
                        {selectedPin.createdAt ? new Date(selectedPin.createdAt).toLocaleDateString() : "Recently"}
                      </div>
                    </div>
                  </div>

                  <Link href={`/jobs/${selectedPin.id}`}>
                    <Button className="w-full premium-btn rounded-xl font-display tracking-[0.12em] font-bold h-11" data-testid="button-view-job">
                      VIEW JOB
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
              {[
                { label: "On-Demand", color: "#F97316" },
                { label: "V&I",      color: "#8B5CF6" },
                { label: "Skilled",  color: "#DC2626" },
                { label: "General",  color: "#16A34A" },
                { label: "Barter",   color: "#0EA5E9" },
                { label: "Market",   color: "#FACC15" },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1 text-[9px] font-display font-bold tracking-wider text-muted-foreground">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 animate-fade-in" data-testid="section-empty-state">
            <p className="text-2xl mb-3">💰</p>
            <p className="font-display font-bold text-foreground text-base mb-2" data-testid="text-empty-title">Waiting on the next move</p>
            <p className="text-sm text-muted-foreground mb-1">Jobs appear in real-time based on your area.</p>
            {(alertsOff || availableOff) && (
              <div className="mt-5 flex flex-col gap-2 items-center">
                {alertsOff && (
                  <Button
                    className="w-full max-w-xs gap-2 premium-btn rounded-xl font-display tracking-wider text-xs h-11"
                    onClick={handleEnableAlerts}
                    data-testid="button-turn-on-alerts"
                  >
                    TURN ON ALERTS
                  </Button>
                )}
                {availableOff && (
                  <Button
                    variant="outline"
                    className="w-full max-w-xs rounded-xl font-display tracking-wider text-xs h-11 border-white/[0.15] hover:border-white/25"
                    onClick={() => availabilityMutation.mutate()}
                    disabled={availabilityMutation.isPending}
                    data-testid="button-set-available"
                  >
                    SET AVAILABLE FOR WORK
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground/35 mt-4">Stay ready so you don't miss the next opportunity.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((job, i) => (
              <div key={job.id} className={`animate-fade-in stagger-${Math.min(i + 1, 6)}`}>
                <JobCard job={job} />
                {(job.category === "Skilled Labor" || (job as any).minTier) && (
                  <div className="mt-1 px-4">
                    {job.category === "Skilled Labor" && job.serviceType ? (
                      <SkilledTierBadge serviceType={job.serviceType} />
                    ) : (job as any).minTier ? (
                      <TierBadge minTier={(job as any).minTier} />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
