import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { isStoreBuild } from "@/lib/platform";
import { GuberLayout } from "@/components/guber-layout";
import { TrustBadge, Day1OGBadge } from "@/components/trust-badge";
import { GoogleMap, type JobPin, type WorkerPin, type CashDropPin } from "@/components/google-map";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Job } from "@shared/schema";
import {
  Zap,
  ShieldCheck,
  Hammer,
  Wrench,
  Repeat,
  ShoppingBag,
  Plus,
  Search,
  Briefcase,
  Clock,
  CheckCircle,
  ChevronRight,
  Bot,
  MapPin as MapPinIcon,
  Star,
  TrendingUp,
  X,
  Crown,
  Loader2,
  Zap as ZapIcon,
  Rocket,
} from "lucide-react";
import type { CashDrop } from "@shared/schema";

const categories = [
  { name: "On-Demand Help", icon: Zap, gradient: "from-amber-400 via-yellow-500 to-amber-600", accent: "hsl(45 95% 55%)", href: "/browse-jobs?category=On-Demand Help" },
  { name: "Verify/Inspect", icon: ShieldCheck, gradient: "from-blue-400 via-blue-600 to-indigo-800", accent: "hsl(200 80% 55%)", href: "/verify-inspect" },
  { name: "Skilled Labor", icon: Hammer, gradient: "from-amber-400 via-orange-500 to-orange-800", accent: "hsl(45 100% 55%)", href: "/browse-jobs?category=Skilled Labor" },
  { name: "General Labor", icon: Wrench, gradient: "from-emerald-400 via-green-500 to-green-800", accent: "hsl(152 100% 44%)", href: "/browse-jobs?category=General Labor" },
  { name: "Barter Labor", icon: Repeat, gradient: "from-fuchsia-400 via-violet-500 to-violet-800", accent: "hsl(275 85% 62%)", href: "/browse-jobs?category=Barter Labor" },
  { name: "Marketplace", icon: ShoppingBag, gradient: "from-rose-400 via-pink-500 to-pink-800", accent: "hsl(350 80% 55%)", href: "/marketplace" },
];

const MAP_CATS = [
  { label: "All", value: "", color: "#22C55E" },
  { label: "On-Demand", value: "On-Demand Help", color: "#F59E0B" },
  { label: "V&I", value: "Verify & Inspect", color: "#8B5CF6" },
  { label: "Skilled", value: "Skilled Labor", color: "#F97316" },
  { label: "General", value: "General Labor", color: "#22C55E" },
  { label: "Barter", value: "Barter Labor", color: "#14B8A6" },
  { label: "Market", value: "Marketplace", color: "#EF4444" },
];

type DashboardMode = "hire" | "work";


export default function Dashboard() {
  const { user, isDemoUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<DashboardMode>("hire");
  const [ogBannerDismissed, setOgBannerDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("og_promo_dismissed") === "1"
  );
  const [zipOverride, setZipOverride] = useState("");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [selectedPin, setSelectedPin] = useState<JobPin | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerPin | null>(null);
  const [mapCatFilter, setMapCatFilter] = useState("");

  const ogCheckoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/og-checkout", {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not start checkout", variant: "destructive" });
    },
  });

  const handleAiOrNot = () => {
    navigate("/ai-or-not");
  };

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/stripe/connect/onboard");
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => toast({ title: "Setup Failed", description: err.message, variant: "destructive" }),
  });

  const availabilityMutation = useMutation({
    mutationFn: async (v: boolean) => {
      await apiRequest("PATCH", `/api/users/${user!.id}`, { isAvailable: v });
      if (v && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          await apiRequest("POST", "/api/users/location", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  const { data: myJobs } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          if ((user as any).lat && (user as any).lng) {
            setMapCenter({ lat: (user as any).lat, lng: (user as any).lng });
          } else if (user.zipcode) {
            fetch(`/api/geocode?address=${encodeURIComponent(user.zipcode + ", USA")}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => { if (d?.lat && d?.lng) setMapCenter({ lat: d.lat, lng: d.lng }); })
              .catch(() => {});
          }
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    } else if ((user as any).lat && (user as any).lng) {
      setMapCenter({ lat: (user as any).lat, lng: (user as any).lng });
    } else if (user.zipcode) {
      fetch(`/api/geocode?address=${encodeURIComponent(user.zipcode + ", USA")}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.lat && d?.lng) setMapCenter({ lat: d.lat, lng: d.lng }); })
        .catch(() => {});
    }
  }, [user?.id]);

  const { data: mapPins } = useQuery<JobPin[]>({
    queryKey: ["/api/map-jobs"],
    enabled: !!user,
  });

  const { data: workerPins } = useQuery<WorkerPin[]>({
    queryKey: ["/api/workers/map"],
    enabled: !!user,
  });

  const { data: activeDrops } = useQuery<CashDrop[]>({
    queryKey: ["/api/cash-drops/active"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const activeDrop = activeDrops?.[0] || null;

  const postedJobs = myJobs?.filter((j) => j.postedById === user?.id) || [];
  const acceptedJobs = myJobs?.filter((j) => j.assignedHelperId === user?.id) || [];

  const awaitingHireAction = postedJobs.filter((j) => ["pending", "proof_submitted"].includes(j.status));
  const awaitingWorkAction = acceptedJobs.filter((j) => ["locked", "proof_needed"].includes(j.status));

  const boostableJobs = postedJobs.filter((j) => j.boostSuggested && j.suggestedBudget && ["open", "pending"].includes(j.status));

  const boostMutation = useMutation({
    mutationFn: async ({ jobId, newBudget }: { jobId: number; newBudget: number }) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/boost`, { newBudget });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({ title: "Reward Boosted!", description: "Your job reward has been increased and re-surfaced in feeds." });
    },
    onError: (err: any) => {
      toast({ title: "Boost Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-dashboard">

        {activeDrop && (
          <Link href={`/cash-drop/${activeDrop.id}`}>
            <div
              className="mb-5 rounded-2xl p-4 cursor-pointer relative overflow-hidden cash-drop-banner"
              data-testid="banner-cash-drop"
              style={{
                background: "linear-gradient(135deg, #1a0a00 0%, #2d1200 50%, #1a0500 100%)",
                border: "1.5px solid rgba(245,158,11,0.45)",
                boxShadow: "0 0 24px rgba(245,158,11,0.15), 0 0 48px rgba(245,158,11,0.06)",
              }}
            >
              <div className="absolute inset-0 rounded-2xl" style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(245,158,11,0.08) 0%, transparent 70%)" }} />
              <div className="relative flex items-center gap-3">
                <div className="flex-shrink-0 relative">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center cash-drop-pulse">
                    <span className="text-2xl">⚡</span>
                  </div>
                  <div className="absolute -top-1 -right-1 flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 cash-drop-blink" style={{ boxShadow: "0 0 6px #ef4444" }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-display font-black tracking-[0.2em] text-red-400 uppercase">LIVE</span>
                    <span className="text-[9px] font-display font-black tracking-[0.2em] text-amber-400/70 uppercase">·</span>
                    <span className="text-[9px] font-display font-black tracking-[0.2em] text-amber-400 uppercase">GUBER CASH DROP</span>
                  </div>
                  <p className="font-display font-black text-[15px] text-amber-300 leading-tight truncate">{activeDrop.title}</p>
                  <p className="text-[11px] text-amber-400/60 mt-0.5">
                    ${activeDrop.rewardPerWinner?.toFixed(2)} per winner · {(activeDrop.winnerLimit || 1) - (activeDrop.winnersFound || 0)} slot{((activeDrop.winnerLimit || 1) - (activeDrop.winnersFound || 0)) !== 1 ? "s" : ""} remaining
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-400/60 flex-shrink-0" />
              </div>
            </div>
          </Link>
        )}

        <div className="mb-7 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-display font-extrabold text-foreground tracking-tight" data-testid="text-greeting">
                Ready Set Go!!
              </h1>
              <p className="text-xs text-muted-foreground font-display tracking-wider mt-1">
                {user?.zipcode ? `ZIP ${user.zipcode}` : "Set your zip for local jobs"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TrustBadge tier={user?.tier || "community"} />
              {user?.day1OG && <Day1OGBadge />}
            </div>
          </div>
        </div>

        {!user?.day1OG && !ogBannerDismissed && !isStoreBuild && !isDemoUser && (
          <div
            onClick={() => !ogCheckoutMutation.isPending && ogCheckoutMutation.mutate()}
            role="button"
            className="relative flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-5 animate-fade-in overflow-hidden group cursor-pointer"
            style={{
              background: "linear-gradient(135deg, rgba(180,120,0,0.18) 0%, rgba(245,165,0,0.12) 50%, rgba(180,120,0,0.18) 100%)",
              border: "1.5px solid rgba(245,175,0,0.4)",
              boxShadow: "0 0 18px rgba(245,165,0,0.08), inset 0 1px 0 rgba(255,220,80,0.15)",
              opacity: ogCheckoutMutation.isPending ? 0.7 : 1,
            }}
            data-testid="banner-og-promo"
          >
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "linear-gradient(135deg, rgba(245,165,0,0.08), rgba(180,120,0,0.08))" }} />
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 relative z-10"
              style={{ background: "rgba(245,165,0,0.15)", border: "1px solid rgba(245,165,0,0.3)" }}>
              <Crown className="w-4.5 h-4.5 text-amber-400" style={{ width: 18, height: 18 }} />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-display font-black tracking-widest text-amber-400">DAY-1 OG</span>
                <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full tracking-wider"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                  LIMITED TIME
                </span>
              </div>
              <p className="text-[11px] text-amber-200/70 font-display leading-snug">
                Founding member status. Free urgent on every job, forever.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400/50 shrink-0 relative z-10" />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                localStorage.setItem("og_promo_dismissed", "1");
                setOgBannerDismissed(true);
              }}
              className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity z-20"
              style={{ background: "rgba(0,0,0,0.3)" }}
              data-testid="button-dismiss-og-banner"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-5 animate-fade-in stagger-1" data-testid="toggle-mode">
          <button
            onClick={() => setMode("hire")}
            className="relative rounded-2xl p-4 flex flex-col items-start gap-2 text-left transition-all active:scale-95"
            style={{
              background: mode === "hire"
                ? "linear-gradient(135deg, hsl(142 60% 18%), hsl(152 70% 12%))"
                : "hsl(var(--card))",
              border: mode === "hire"
                ? "2px solid hsl(152 70% 40% / 0.6)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "hire" ? "0 0 20px hsl(152 70% 40% / 0.12)" : "none",
            }}
            data-testid="button-hire-mode"
          >
            {mode === "hire" && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            )}
            <div className="p-2 rounded-xl" style={{ background: mode === "hire" ? "hsl(152 70% 40% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Briefcase className="w-5 h-5" style={{ color: mode === "hire" ? "hsl(152 70% 55%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.1em]" style={{ color: mode === "hire" ? "hsl(152 70% 65%)" : "hsl(var(--muted-foreground))" }}>HIRE</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "hire" ? "hsl(152 50% 50%)" : "hsl(var(--muted-foreground) / 0.5)" }}>I need help</p>
            </div>
          </button>

          <button
            onClick={() => setMode("work")}
            className="relative rounded-2xl p-4 flex flex-col items-start gap-2 text-left transition-all active:scale-95"
            style={{
              background: mode === "work"
                ? "linear-gradient(135deg, hsl(220 60% 18%), hsl(230 70% 12%))"
                : "hsl(var(--card))",
              border: mode === "work"
                ? "2px solid hsl(220 70% 55% / 0.6)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "work" ? "0 0 20px hsl(220 70% 55% / 0.12)" : "none",
            }}
            data-testid="button-work-mode"
          >
            {mode === "work" && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400" />
            )}
            <div className="p-2 rounded-xl" style={{ background: mode === "work" ? "hsl(220 70% 55% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Search className="w-5 h-5" style={{ color: mode === "work" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.1em]" style={{ color: mode === "work" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }}>WORK</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "work" ? "hsl(220 50% 60%)" : "hsl(var(--muted-foreground) / 0.5)" }}>I want to earn</p>
            </div>
          </button>
        </div>

        <div className="mb-7 animate-fade-in stagger-2">
          {mode === "hire" ? (
            <Link href="/post-job">
              <Button className="w-full h-14 gap-3 rounded-2xl premium-btn font-display tracking-[0.12em] text-sm font-bold shadow-lg" data-testid="button-post-job">
                <Plus className="w-5 h-5" />
                POST A JOB
                <ChevronRight className="w-4 h-4 ml-auto opacity-60" /> {/* faint-text-allow: decorative chevron icon */}
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/browse-jobs">
                <Button className="w-full h-14 gap-3 rounded-2xl premium-btn font-display tracking-[0.12em] text-sm font-bold shadow-lg" data-testid="button-find-jobs">
                  <Search className="w-5 h-5" />
                  FIND JOBS
                  <ChevronRight className="w-4 h-4 ml-auto opacity-60" /> {/* faint-text-allow: decorative chevron icon */}
                </Button>
              </Link>
              <div className="flex items-center justify-between px-1 pt-1" data-testid="section-availability">
                <div>
                  <p className="text-sm font-display font-semibold text-foreground leading-tight">Available for Work</p>
                  <p className="text-xs text-muted-foreground/55 mt-0.5">Get notified of jobs posted within 10 miles</p>
                </div>
                <Switch
                  checked={!!(user as any)?.isAvailable}
                  onCheckedChange={(v) => availabilityMutation.mutate(v)}
                  disabled={availabilityMutation.isPending}
                  data-testid="toggle-availability"
                />
              </div>

              {!!(user as any)?.isAvailable && (user as any)?.stripeAccountStatus !== "active" && (
                <div 
                  className="mx-1 mt-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 animate-in fade-in slide-in-from-top-2"
                  data-testid="banner-stripe-required"
                >
                  <div className="flex gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-display font-bold text-foreground leading-tight mb-1 uppercase tracking-wider">Payout Setup Required</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                        Complete your Stripe verification to receive payments for jobs.
                      </p>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-0 text-[10px] font-display font-bold text-emerald-400 hover:text-emerald-300 hover:bg-transparent flex items-center gap-1 group"
                        onClick={() => onboardMutation.mutate()}
                        disabled={onboardMutation.isPending}
                        data-testid="link-setup-payouts-dashboard"
                      >
                        {onboardMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            SET UP NOW
                            <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {boostableJobs.length > 0 && (
          <div className="mb-5 space-y-3 animate-fade-in stagger-2">
            {boostableJobs.map((job: any) => (
              <div
                key={job.id}
                className="rounded-2xl p-4 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.04) 100%)",
                  border: "1.5px solid rgba(245,158,11,0.25)",
                }}
                data-testid={`banner-boost-suggestion-${job.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <Rocket className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-bold text-amber-400 tracking-wider mb-0.5">BOOST REWARD</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                      "{job.title}" hasn't been accepted yet. Increasing the reward may help it get picked up faster.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-display">
                        ${job.budget} → <span className="text-amber-400 font-bold">${job.suggestedBudget}</span>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="mt-2 h-8 px-4 rounded-xl font-display text-xs font-bold tracking-wider bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() => boostMutation.mutate({ jobId: job.id, newBudget: job.suggestedBudget })}
                      disabled={boostMutation.isPending}
                      data-testid={`button-boost-${job.id}`}
                    >
                      {boostMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      )}
                      Boost to ${job.suggestedBudget}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Link href="/my-jobs">
          <div className="mb-6 rounded-2xl px-4 py-3 flex items-center justify-between animate-fade-in stagger-2 cursor-pointer"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.3)" }}
            data-testid="link-my-activity">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: "hsl(152 70% 40% / 0.12)" }}>
                <Briefcase className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-foreground leading-tight">My Activity</p>
                <p className="text-[10px] text-muted-foreground font-display mt-0.5">
                  {mode === "hire"
                    ? `${postedJobs.length} posted · ${awaitingHireAction.length} need attention`
                    : `${acceptedJobs.length} accepted · ${awaitingWorkAction.length} need attention`}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>

        <div className="mb-3 animate-fade-in stagger-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-display font-bold text-foreground/90 tracking-[0.15em] uppercase">Categories</span>
            <Link href="/browse-jobs">
              <span className="text-[10px] font-display text-primary/60 tracking-wider hover:text-primary transition-colors cursor-pointer font-semibold">VIEW ALL</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4" data-testid="section-categories">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <Link key={cat.name} href={cat.href}>
                <div
                  className={`category-tile bg-gradient-to-br ${cat.gradient} rounded-2xl p-5 flex flex-col items-center justify-center text-center aspect-[4/3] cursor-pointer animate-fade-in stagger-${Math.min(idx + 1, 6)}`}
                  data-testid={`card-category-${cat.name.toLowerCase().replace(/[^a-z]/g, "-")}`}
                >
                  <div
                    className="mb-3 p-3.5 rounded-2xl"
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      boxShadow: `0 0 30px ${cat.accent.replace(")", " / 0.25)")}`,
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <Icon className="w-7 h-7 text-white drop-shadow-lg" strokeWidth={1.8} />
                  </div>
                  <span className="font-display font-bold text-white text-[13px] leading-tight tracking-wide drop-shadow-md">{cat.name}</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div
          onClick={handleAiOrNot}
          className="mb-7 rounded-2xl p-5 flex items-center gap-4 cursor-pointer animate-fade-in stagger-4 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, hsl(190 85% 12%), hsl(175 85% 8%))",
              border: "1px solid hsl(190 85% 50% / 0.2)",
              boxShadow: "0 0 30px hsl(190 85% 50% / 0.08)",
            }}
            data-testid="card-category-ai-or-not"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20"
                style={{ background: "radial-gradient(circle, hsl(190 85% 55%), transparent 70%)" }} />
            </div>
            <div className="p-3.5 rounded-2xl shrink-0 relative"
              style={{
                background: "linear-gradient(135deg, hsl(190 85% 40%), hsl(175 85% 30%))",
                boxShadow: "0 0 20px hsl(190 85% 50% / 0.3)",
              }}>
              <Bot className="w-7 h-7 text-white" strokeWidth={1.8} />
            </div>
            <div className="flex-1 relative">
              <p className="font-display font-bold text-white text-[15px] leading-tight mb-0.5">AI or Not</p>
              <p className="text-[11px] font-display tracking-wider" style={{ color: "hsl(190 85% 60%)" }}>DETECT AI-GENERATED MEDIA</p>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 relative" style={{ color: "hsl(190 85% 55%)" }} />
        </div>

        <div className="mb-7 animate-fade-in stagger-5" data-testid="section-nearby-jobs">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-display font-bold text-foreground/90 tracking-[0.15em] uppercase">Nearby Jobs</span>
            <Link href="/map">
              <span className="text-[10px] font-display text-primary/60 tracking-wider hover:text-primary transition-colors cursor-pointer font-semibold">MAP VIEW</span>
            </Link>
          </div>
          <div className="glass-card-strong rounded-2xl p-4 relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={zipOverride}
                  onChange={(e) => setZipOverride(e.target.value)}
                  placeholder="Override zip code..."
                  className="pl-9 premium-input rounded-xl h-10 text-xs"
                  data-testid="input-zip-override"
                />
              </div>
              <Button
                variant="outline"
                className="rounded-xl h-10 text-xs border-white/10 font-display tracking-wider font-semibold hover:border-primary/30 hover:text-primary transition-all"
                onClick={async () => {
                  if (!zipOverride.trim()) {
                    setMapCenter(undefined);
                    return;
                  }
                  try {
                    const resp = await fetch(`https://api.zippopotam.us/us/${zipOverride.trim()}`);
                    if (resp.ok) {
                      const data = await resp.json();
                      const place = data.places?.[0];
                      if (place) {
                        setMapCenter({ lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) });
                      }
                    }
                  } catch {}
                }}
                data-testid="button-zip-search"
              >
                GO
              </Button>
            </div>
            {/* Category filter chips — work mode only */}
            {mode === "work" && (
              <div
                className="flex gap-1.5 mb-3 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none" }}
                data-testid="map-category-filter"
              >
                {MAP_CATS.map((cat) => {
                  const active = mapCatFilter === cat.value;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => {
                        setMapCatFilter(cat.value);
                        setSelectedPin(null);
                      }}
                      data-testid={`filter-map-cat-${cat.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                      style={{
                        background: active ? cat.color : "rgba(255,255,255,0.06)",
                        color: active ? "#fff" : "rgba(255,255,255,0.55)",
                        border: `1px solid ${active ? cat.color : "rgba(255,255,255,0.1)"}`,
                        borderRadius: 20,
                        padding: "4px 11px",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "Oxanium, sans-serif",
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                        flexShrink: 0,
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}

            <GoogleMap
              pins={mode === "work" ? (mapPins || []).filter(p => {
                if (mapCatFilter && p.category !== mapCatFilter) return false;
                if (!mapCenter) return true;
                const R = 3958.8;
                const dLat = (p.lat - mapCenter.lat) * Math.PI / 180;
                const dLng = (p.lng - mapCenter.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2)**2 + Math.cos(mapCenter.lat * Math.PI/180) * Math.cos(p.lat * Math.PI/180) * Math.sin(dLng/2)**2;
                const miles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return miles <= 50;
              }) : []}
              workerPins={mode === "hire" ? (workerPins || []) : []}
              cashDrops={(activeDrops || []).map(d => ({ id: d.id, gpsLat: d.gpsLat, gpsLng: d.gpsLng, title: d.title, rewardPerWinner: d.rewardPerWinner })) as CashDropPin[]}
              center={mapCenter}
              className="h-[260px]"
              onPinClick={(pin) => {
                setSelectedPin(pin);
                setSelectedWorker(null);
              }}
              onWorkerPinClick={(worker) => {
                setSelectedWorker(worker);
                setSelectedPin(null);
              }}
              onCashDropClick={(drop) => {
                navigate(`/cash-drop/${drop.id}`);
              }}
              onUserPos={(pos) => {
                if (user?.isAvailable) {
                  apiRequest("POST", "/api/users/location", pos).catch(() => {});
                }
              }}
            />

            {selectedWorker && (
              <div
                className="absolute bottom-16 left-4 right-4 z-[9999] animate-in slide-in-from-bottom-2 duration-300"
                data-testid={`card-worker-preview-${selectedWorker.id}`}
              >
                <div className="glass-card-strong rounded-2xl p-4 shadow-2xl relative border-primary/20 bg-background/95 backdrop-blur-xl">
                  <button
                    onClick={() => setSelectedWorker(null)}
                    className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
                    data-testid="button-close-worker-preview"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <div className="flex items-start gap-4 mb-3">
                    <Avatar className="w-12 h-12 rounded-xl border-2 border-primary/20">
                      <AvatarImage src={selectedWorker.avatar || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {(selectedWorker.displayName || "G").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 pr-6">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-display font-extrabold text-foreground text-base leading-tight truncate">
                          {selectedWorker.displayName || "GUBER Member"}
                        </h3>
                        <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20 uppercase tracking-tighter">
                          {selectedWorker.tier}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-400">
                        <Star className="w-3 h-3 fill-current" />
                        <span className="text-[11px] font-bold">{selectedWorker.rating.toFixed(1)}</span>
                        <span className="text-[11px] text-muted-foreground">({selectedWorker.reviewCount} reviews)</span>
                      </div>
                    </div>
                  </div>

                  {selectedWorker.bio && (
                    <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mb-3 leading-relaxed">
                      {selectedWorker.bio}
                    </p>
                  )}

                  {selectedWorker.skills && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {selectedWorker.skills.split(",").slice(0, 3).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-[9px] px-2 py-0 h-4 bg-white/5 border-white/5 font-medium">
                          {skill.trim()}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/profile/${selectedWorker.id}`}>
                      <Button variant="outline" className="w-full rounded-xl font-display tracking-[0.12em] font-bold h-11 text-xs border-white/10 hover:border-primary/30 hover:text-primary transition-all" data-testid="button-view-profile">
                        VIEW PROFILE
                      </Button>
                    </Link>
                    <Link href={`/post-job?helperId=${selectedWorker.id}`}>
                      <Button className="w-full premium-btn rounded-xl font-display tracking-[0.12em] font-bold h-11 text-xs" data-testid="button-send-gig">
                        SEND A GIG
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {selectedPin && (
              <div
                className="absolute bottom-16 left-4 right-4 z-[9999] animate-in slide-in-from-bottom-2 duration-300"
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
                      <ChevronRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 animate-fade-in stagger-6">
          <div className="stat-card rounded-2xl p-4 text-center" data-testid="stat-jobs-done">
            <div className="flex justify-center mb-2">
              <div className="p-1.5 rounded-xl bg-primary/10">
                <CheckCircle className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-display font-extrabold guber-text-green">{user?.jobsCompleted || 0}</p>
            <p className="text-[9px] text-muted-foreground mt-1.5 font-display tracking-wider uppercase">Jobs Done</p>
          </div>
          <div className="stat-card rounded-2xl p-4 text-center" data-testid="stat-rating">
            <div className="flex justify-center mb-2">
              <div className="p-1.5 rounded-xl bg-amber-500/10">
                <Star className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-display font-extrabold guber-text-green">{user?.rating?.toFixed(1) || "0.0"}</p>
            <p className="text-[9px] text-muted-foreground mt-1.5 font-display tracking-wider uppercase">Rating</p>
          </div>
          <div className="stat-card rounded-2xl p-4 text-center" data-testid="stat-trust-score">
            <div className="flex justify-center mb-2">
              <div className="p-1.5 rounded-xl bg-secondary/10">
                <TrendingUp className="w-4 h-4 text-secondary" />
              </div>
            </div>
            <p className="text-2xl font-display font-extrabold guber-text-green">{user?.trustScore || 0}</p>
            <p className="text-[9px] text-muted-foreground mt-1.5 font-display tracking-wider uppercase">Trust</p>
          </div>
        </div>
      </div>
    </GuberLayout>
  );
}
