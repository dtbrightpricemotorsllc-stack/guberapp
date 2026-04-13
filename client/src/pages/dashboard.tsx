import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { GuberLayout } from "@/components/guber-layout";
import { GoogleMap, type JobPin, type WorkerPin } from "@/components/google-map";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Job } from "@shared/schema";
import {
  Zap, ShieldCheck, Hammer, Wrench, Repeat, ShoppingBag,
  Plus, Search, Briefcase, ChevronRight, Bot, MapPin as MapPinIcon,
  TrendingUp, X, Loader2, Rocket, UserCircle, Users, Lock, Banknote, Clock,
  Droplets, Heart, Share2,
} from "lucide-react";
import viLogoImg from "@assets/Picsart_26-04-13_12-33-21-291_1776101665162.png";
import { getPushStatus, subscribeToPush } from "@/lib/push";
import { buildReferralShareText } from "@/lib/referral";
import {
  AlertPromptModal, AlertActionPrompt, MissedEventBanner,
  getAlertStatus, setAlertStatus, shouldShowAlertPrompt,
} from "@/components/alert-prompt-modal";

// ─── Promo Modal System ───────────────────────────────────────────────────────

type PromoId = "cashdrop" | "day1og";
type PromoCard = { id: PromoId; title: string; subtitle: string; buttonText: string; href: string; accent: string };

const PROMOS: PromoCard[] = [
  { id: "cashdrop", title: "💰 GUBER Gives Back", subtitle: "Cash Drops are fueled by Day-1 OG memberships and platform fees. The bigger we grow, the bigger the drops. Help put your city on the map.", buttonText: "Got it", href: "/dashboard", accent: "from-amber-500/20 to-orange-500/10" },
  { id: "day1og",  title: "🔥 Day-1 OG Access",        subtitle: "Get in early before it's gone.",         buttonText: "LOCK IN", href: "/profile",    accent: "from-fuchsia-500/20 to-violet-500/10" },
];

function promoIsNewUser(): boolean {
  const key = "guber_first_seen_at";
  const stored = localStorage.getItem(key);
  if (!stored) { localStorage.setItem(key, Date.now().toString()); return true; }
  return Date.now() - Number(stored) < 7 * 24 * 60 * 60 * 1000;
}
function promoGetLastShownAt() { return Number(localStorage.getItem("guber_last_promo_at") || "0"); }
function promoSetLastShownAt() { localStorage.setItem("guber_last_promo_at", Date.now().toString()); }
function promoIsDismissed(id: PromoId) { return localStorage.getItem(`guber_promo_dismissed_${id}`) === "true"; }
function promoDismiss(id: PromoId) { localStorage.setItem(`guber_promo_dismissed_${id}`, "true"); }
function promoGetNext(): PromoCard | null {
  const idx = Number(localStorage.getItem("guber_promo_rotation_index") || "0");
  const available = PROMOS.filter(p => !promoIsDismissed(p.id));
  if (!available.length) return null;
  const promo = available[idx % available.length];
  localStorage.setItem("guber_promo_rotation_index", String(idx + 1));
  return promo;
}

function DashboardPromoModal({ promo, open, onClose, onAction }: { promo: PromoCard | null; open: boolean; onClose: () => void; onAction: (p: PromoCard) => void }) {
  if (!promo || !open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 px-4 pb-6 sm:items-center" data-testid="modal-dashboard-promo">
      <div className={`w-full max-w-md rounded-3xl bg-gradient-to-br ${promo.accent} p-[1px]`}>
        <div className="rounded-3xl bg-neutral-950/95 p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-display font-extrabold tracking-tight text-white" data-testid="text-promo-title">{promo.title}</h3>
              <p className="mt-2 text-sm text-white/65">{promo.subtitle}</p>
            </div>
            <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white transition" aria-label="Close promo" data-testid="button-close-promo">✕</button>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => onAction(promo)} className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black hover:opacity-90 transition" data-testid="button-promo-action">{promo.buttonText}</button>
            <button onClick={onClose} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white transition" data-testid="button-promo-later">Maybe later</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const WORK_CATEGORIES = [
  { name: "On-Demand Help", icon: Zap,    color: "#F97316", bg: "linear-gradient(135deg,#78350f,#92400e,#c2410c)", href: "/browse-jobs?category=On-Demand Help" },
  { name: "Skilled Labor",  icon: Hammer, color: "#DC2626", bg: "linear-gradient(135deg,#7f1d1d,#991b1b,#b91c1c)", href: "/browse-jobs?category=Skilled Labor" },
  { name: "General Labor",  icon: Wrench, color: "#16A34A", bg: "linear-gradient(135deg,#14532d,#166534,#15803d)", href: "/browse-jobs?category=General Labor" },
  { name: "Barter Labor",   icon: Repeat, color: "#0EA5E9", bg: "linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)", href: "/browse-jobs?category=Barter Labor" },
];

type DashboardMode = "hire" | "work";

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<DashboardMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("guber_mode") as DashboardMode) || "hire";
    }
    return "hire";
  });

  const [promoOpen, setPromoOpen] = useState(false);
  const [activePromo, setActivePromo] = useState<PromoCard | null>(null);
  const [zipOverride, setZipOverride] = useState("");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [selectedPin, setSelectedPin] = useState<JobPin | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerPin | null>(null);
  const [mapCatFilter] = useState("");
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showActionPrompt, setShowActionPrompt] = useState(false);
  const [actionPromptMsg, setActionPromptMsg] = useState<string | undefined>(undefined);
  const [showMissedBanner, setShowMissedBanner] = useState(false);
  const [missedEventType, setMissedEventType] = useState<"job" | "cash_drop" | "generic">("generic");

  useEffect(() => {
    localStorage.setItem("guber_mode", mode);
  }, [mode]);

  // First-load prompt — show immediately when status="never_asked" and push not granted
  useEffect(() => {
    if (!user) return;
    if (!shouldShowAlertPrompt()) return;
    const alertStatus = getAlertStatus();
    if (alertStatus === "never_asked") {
      // Show full modal immediately (short render delay so page is visible first)
      const t = setTimeout(() => setShowAlertModal(true), 400);
      return () => clearTimeout(t);
    }
    // status === "declined": check for missed notifications and show missed event banner
    if (alertStatus === "declined") {
      // Query notifications to detect if user missed anything
      fetch("/api/notifications", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((notifs: any[]) => {
          const unread = notifs.filter((n: any) => !n.read);
          if (unread.length > 0) {
            const hasCashDrop = unread.some((n: any) =>
              (n.type === "cash_drop") || (n.title || "").toLowerCase().includes("cash drop") || (n.body || "").toLowerCase().includes("cash drop")
            );
            setMissedEventType(hasCashDrop ? "cash_drop" : "job");
            setShowMissedBanner(true);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  // Re-usable: show inline action prompt (no auto-dismiss — stays until user acts)
  const triggerActionPrompt = (message?: string) => {
    if (!shouldShowAlertPrompt()) return;
    if (showAlertModal) return; // don't overlap with full modal
    setActionPromptMsg(message);
    setShowActionPrompt(true);
  };

  const handleActionPromptEnable = async () => {
    setShowActionPrompt(false);
    setShowMissedBanner(false);
    if (user?.id) {
      await subscribeToPush(user.id);
      setAlertStatus(getPushStatus() === "granted" ? "granted" : "declined");
    }
  };

  const handleAlertModalClose = () => {
    setShowAlertModal(false);
    // If still declined after modal, allow action prompts to appear
  };

  // Promo modal — occasional, spaced out, dismissible
  useEffect(() => {
    if (!user) return;
    const isNew = promoIsNewUser();
    const cooldown = isNew ? 12 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - promoGetLastShownAt() <= cooldown) return;
    const next = promoGetNext();
    if (!next) return;
    const t = setTimeout(() => {
      setActivePromo(next);
      setPromoOpen(true);
      promoSetLastShownAt();
    }, 1400);
    return () => clearTimeout(t);
  }, [user?.id]);

  const handlePromoClose = () => {
    if (activePromo?.id) promoDismiss(activePromo.id);
    setPromoOpen(false);
  };

  const handlePromoAction = (p: PromoCard) => {
    setPromoOpen(false);
    navigate(p.href);
  };

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/stripe/connect/onboard");
      return resp.json();
    },
    onSuccess: (data: any) => { if (data.url) window.location.href = data.url; },
    onError: (err: any) => toast({ title: "Setup Failed", description: err.message, variant: "destructive" }),
  });

  const availabilityMutation = useMutation({
    mutationFn: async (v: boolean) => {
      await apiRequest("PATCH", `/api/users/${user!.id}`, { isAvailable: v });
      if (v && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          await apiRequest("POST", "/api/users/location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  const { data: myJobs } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user,
  });

  const { data: mapPins } = useQuery<JobPin[]>({
    queryKey: ["/api/map-jobs"],
    enabled: !!user,
  });

  const { data: workerPins } = useQuery<WorkerPin[]>({
    queryKey: ["/api/workers/map"],
    enabled: !!user,
  });

  const { data: referralData } = useQuery<{ code: string; link: string; count: number }>({
    queryKey: ["/api/users/me/referral"],
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

  const postedJobs = myJobs?.filter((j) => j.postedById === user?.id) || [];
  const acceptedJobs = myJobs?.filter((j) => j.assignedHelperId === user?.id) || [];
  const awaitingHireAction = postedJobs.filter((j) => ["accepted_pending_payment", "proof_submitted"].includes(j.status));
  const awaitingWorkAction = acceptedJobs.filter((j) => ["funded", "proof_needed"].includes(j.status));
  const boostableJobs = postedJobs.filter((j) => j.boostSuggested && j.suggestedBudget && ["posted_public", "accepted_pending_payment"].includes(j.status));

  const boostMutation = useMutation({
    mutationFn: async ({ jobId, newBudget }: { jobId: number; newBudget: number }) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/boost`, { newBudget });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({ title: "Reward Boosted!", description: "Your job reward has been increased and re-surfaced." });
    },
    onError: (err: any) => toast({ title: "Boost Failed", description: err.message, variant: "destructive" }),
  });

  const filteredPins = (mapPins || []).filter(p => !mapCatFilter || p.category === mapCatFilter);
  const nearbyCount = filteredPins.length;

  const isSharingRef = useRef(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleReferralShare = async () => {
    if (isSharingRef.current) return;
    isSharingRef.current = true;
    setIsSharing(true);
    const link = referralData?.link || (user?.referralCode ? `https://guberapp.app/join/${user.referralCode}` : "https://guberapp.app/signup");
    const shareText = buildReferralShareText(link);
    try {
      if (navigator.share) {
        try { await navigator.share({ title: "GUBER", text: shareText }); } catch {}
      } else {
        try {
          await navigator.clipboard.writeText(shareText);
          toast({ title: "Copied!", description: "Paste and send your invite message." });
        } catch {
          toast({ title: "Your invite link", description: link });
        }
      }
    } finally {
      isSharingRef.current = false;
      setIsSharing(false);
    }
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-dashboard">

        {/* ── Hero Header ── */}
        <div className="mb-6 animate-fade-in text-center">
          {mode === "hire" ? (
            <>
              <h1 className="text-[1.35rem] font-display font-extrabold text-foreground tracking-tight leading-tight" data-testid="text-greeting">
                Find help near you
              </h1>
              <p className="text-xs text-muted-foreground/55 mt-1.5 font-display">
                Post a job, book help, or use verified local support.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[1.35rem] font-display font-extrabold text-foreground tracking-tight leading-tight" data-testid="text-greeting">
                Complete tasks &amp; earn
              </h1>
              <p className="text-xs text-muted-foreground/55 mt-1.5 font-display">
                Start local, build trust, and unlock more opportunities.
              </p>
            </>
          )}
        </div>

        {/* ── HIRE / WORK Toggle ── */}
        <div className="grid grid-cols-2 gap-3 mb-5 animate-fade-in stagger-1" data-testid="toggle-mode">
          <button
            onClick={() => setMode("hire")}
            className="relative rounded-2xl p-4 flex items-center gap-3 text-left transition-all active:scale-95"
            style={{
              background: mode === "hire"
                ? "linear-gradient(135deg,hsl(142 60% 18%),hsl(152 70% 12%))"
                : "hsl(var(--card))",
              border: mode === "hire"
                ? "2px solid hsl(152 70% 40% / 0.7)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "hire" ? "0 0 20px hsl(152 70% 40% / 0.15)" : "none",
            }}
            data-testid="button-hire-mode"
          >
            {mode === "hire" && <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary" />}
            <div className="p-2.5 rounded-xl shrink-0" style={{ background: mode === "hire" ? "hsl(152 70% 40% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Briefcase className="w-5 h-5" style={{ color: mode === "hire" ? "hsl(152 70% 60%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.08em]" style={{ color: mode === "hire" ? "hsl(152 70% 65%)" : "hsl(var(--muted-foreground))" }}>HIRE</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "hire" ? "hsl(152 50% 50%)" : "hsl(var(--muted-foreground) / 0.5)" }}>Find help near you</p>
            </div>
          </button>

          <button
            onClick={() => setMode("work")}
            className="relative rounded-2xl p-4 flex items-center gap-3 text-left transition-all active:scale-95"
            style={{
              background: mode === "work"
                ? "linear-gradient(135deg,hsl(220 60% 18%),hsl(230 70% 12%))"
                : "hsl(var(--card))",
              border: mode === "work"
                ? "2px solid hsl(220 70% 55% / 0.7)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "work" ? "0 0 20px hsl(220 70% 55% / 0.15)" : "none",
            }}
            data-testid="button-work-mode"
          >
            {mode === "work" && <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-400" />}
            <div className="p-2.5 rounded-xl shrink-0" style={{ background: mode === "work" ? "hsl(220 70% 55% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Search className="w-5 h-5" style={{ color: mode === "work" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.08em]" style={{ color: mode === "work" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }}>WORK</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "work" ? "hsl(220 50% 60%)" : "hsl(var(--muted-foreground) / 0.5)" }}>Complete tasks &amp; earn</p>
            </div>
          </button>
        </div>

        {/* ── Mode-Based CTAs ── */}
        <div className="mb-6 animate-fade-in stagger-2 space-y-2">
          {mode === "hire" ? (
            <>
              <Link href="/post-job">
                <Button className="w-full h-14 gap-3 rounded-2xl premium-btn font-display tracking-[0.12em] text-sm font-bold shadow-lg" data-testid="button-post-job">
                  <Plus className="w-5 h-5" />
                  POST A JOB
                  <ChevronRight className="w-4 h-4 ml-auto opacity-60" />
                </Button>
              </Link>
              <p className="text-[10px] text-muted-foreground/40 font-display text-center pt-0.5">
                Be the first to bring opportunities to your city
              </p>
            </>
          ) : (
            <>
              {/* Primary CTA — conditional on task history */}
              {(user as any)?.jobsCompleted === 0 ? (
                <Link href="/browse-jobs">
                  <Button
                    onClick={() => triggerActionPrompt("Enable alerts to get notified when a job matches you")}
                    className="w-full h-14 gap-2 rounded-2xl font-display tracking-[0.10em] text-sm font-bold shadow-lg"
                    style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }}
                    data-testid="button-start-first-task"
                  >
                    <span>🔥</span>
                    START YOUR FIRST TASK
                    <ChevronRight className="w-4 h-4 ml-auto opacity-70" />
                  </Button>
                </Link>
              ) : (
                <Link href="/browse-jobs">
                  <Button
                    onClick={() => triggerActionPrompt("Enable alerts so you never miss a new task")}
                    className="w-full h-14 gap-2 rounded-2xl font-display tracking-[0.10em] text-sm font-bold shadow-lg"
                    style={{ background: "linear-gradient(135deg,#C9A84C,#a8873c)", color: "#000" }}
                    data-testid="button-find-live-tasks"
                  >
                    <span>🔥</span>
                    FIND LIVE TASKS
                    <ChevronRight className="w-4 h-4 ml-auto opacity-60" />
                  </Button>
                </Link>
              )}

              {/* Unified: Opportunities + Invite + City Activation */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.2)" }}
                data-testid="card-city-activation-unified"
              >
                {/* Header row */}
                <div className="px-4 pt-3.5 pb-2">
                  <p className="text-sm font-display font-black text-amber-400 tracking-wider leading-tight">
                    💰 Opportunities Near You
                  </p>
                  <p className="text-[11px] text-amber-400/55 font-display mt-0.5 leading-snug">
                    Your city is not active yet — help unlock it
                  </p>
                </div>

                {/* Progress bar row */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[9px] font-display font-bold text-amber-400/50 tracking-wider uppercase">⚡ City Activation</p>
                    <p className="text-[9px] font-display text-muted-foreground/35">
                      {referralData?.count ?? 0} / 25 to unlock cash drops
                    </p>
                  </div>
                  <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "rgba(201,168,76,0.12)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.round(((referralData?.count ?? 0) / 25) * 100 + 8))}%`, background: "linear-gradient(90deg,#C6A85C,#e8c97a)", transition: "width 1s ease" }}
                      data-testid="bar-city-activation"
                    />
                  </div>
                </div>

                {/* Invite button — full-width, attached to bottom */}
                <button
                  className="w-full py-3 font-display text-sm font-black flex items-center justify-center gap-2 transition-all active:opacity-80 tracking-wider border-t disabled:opacity-50"
                  style={{ background: "rgba(201,168,76,0.1)", borderColor: "rgba(201,168,76,0.18)", color: "#C9A84C" }}
                  data-testid="button-invite-activate-city"
                  disabled={isSharing}
                  onClick={() => handleReferralShare()}
                >
                  🚀 Invite &amp; Activate Your City
                </button>
              </div>

              <div className="flex items-center justify-between px-1 pt-1" data-testid="section-availability">
                <div>
                  <p className="text-sm font-display font-semibold text-foreground leading-tight">Available for Work</p>
                  <p className="text-xs text-muted-foreground/55 mt-0.5">Get notified of jobs posted within 10 miles</p>
                </div>
                <Switch
                  checked={!!(user as any)?.isAvailable}
                  onCheckedChange={(v) => {
                    availabilityMutation.mutate(v);
                    if (v) triggerActionPrompt("Enable alerts to hear about new jobs");
                  }}
                  disabled={availabilityMutation.isPending}
                  data-testid="toggle-availability"
                />
              </div>
              {!!(user as any)?.isAvailable && (user as any)?.stripeAccountStatus !== "active" && (
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5" data-testid="banner-stripe-required">
                  <div className="flex gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-display font-bold text-foreground leading-tight mb-1 uppercase tracking-wider">Payout Setup Required</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">Complete your Stripe verification to receive payments.</p>
                      <Button size="sm" variant="ghost" className="h-7 px-0 text-[10px] font-display font-bold text-emerald-400 hover:text-emerald-300 hover:bg-transparent flex items-center gap-1 group"
                        onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} data-testid="link-setup-payouts-dashboard">
                        {onboardMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><span>SET UP NOW</span><ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></>}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/40 font-display text-center px-2">
                Your activity builds trust and unlocks access
              </p>

              {/* ── Trust Level Widget ── */}
              {(() => {
                const score: number = (user as any)?.trustScore ?? 50;
                const level = score >= 80 ? "trusted" : score >= 60 ? "verified" : "new";
                const levelLabel = level === "trusted" ? "Trusted Worker" : level === "verified" ? "Verified Worker" : "New Worker";
                const levelColor = level === "trusted" ? "#86efac" : level === "verified" ? "#93c5fd" : "#94a3b8";
                const levelBg = level === "trusted" ? "rgba(34,197,94,0.08)" : level === "verified" ? "rgba(59,130,246,0.08)" : "rgba(100,116,139,0.08)";
                const levelBorder = level === "trusted" ? "rgba(34,197,94,0.25)" : level === "verified" ? "rgba(59,130,246,0.25)" : "rgba(100,116,139,0.2)";
                const nextThreshold = level === "new" ? 60 : level === "verified" ? 80 : null;
                const nextLabel = level === "new" ? "Verified (60)" : level === "verified" ? "Trusted (80)" : null;
                const progressPct = nextThreshold ? Math.min(100, Math.round((score / nextThreshold) * 100)) : 100;
                return (
                  <div className="rounded-2xl border p-4 space-y-3" style={{ background: levelBg, borderColor: levelBorder }} data-testid="card-trust-level">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" style={{ color: levelColor }} />
                        <p className="text-xs font-display font-bold" style={{ color: levelColor }}>{levelLabel}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] text-muted-foreground/50 font-display">Trust Score</p>
                        <p className="text-sm font-display font-black tabular-nums" style={{ color: levelColor }} data-testid="text-trust-score">{score}</p>
                      </div>
                    </div>

                    {nextThreshold && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-black/30 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%`, background: levelColor }} data-testid="bar-trust-progress" />
                        </div>
                        <p className="text-[9px] text-muted-foreground/40 font-display">
                          {score} / {nextThreshold} — {nextThreshold - score} pts to {nextLabel}
                        </p>
                      </div>
                    )}
                    {!nextThreshold && (
                      <p className="text-[9px] text-emerald-400/50 font-display">Max trust level reached — all payout modes unlocked</p>
                    )}

                    <div className="grid grid-cols-3 gap-1.5" data-testid="grid-payout-unlocks">
                      {[
                        { icon: <Banknote className="w-3 h-3" />, label: "Standard", sub: "2–5 days · Free", unlocked: true },
                        { icon: <Clock className="w-3 h-3" />, label: "Early", sub: "~1 day · 2% fee", unlocked: level !== "new" },
                        { icon: <Zap className="w-3 h-3" />, label: "Instant", sub: "Immediate · 5%", unlocked: level === "trusted" },
                      ].map(({ icon, label, sub, unlocked }) => (
                        <div key={label} className="rounded-xl p-2 text-center space-y-1" style={{ background: unlocked ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.2)", border: `1px solid ${unlocked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}` }} data-testid={`tile-payout-${label.toLowerCase()}`}>
                          <div className="flex items-center justify-center" style={{ color: unlocked ? levelColor : "#475569" }}>
                            {unlocked ? icon : <Lock className="w-3 h-3" />}
                          </div>
                          <p className="text-[9px] font-display font-bold" style={{ color: unlocked ? "#e2e8f0" : "#475569" }}>{label}</p>
                          <p className="text-[8px]" style={{ color: unlocked ? "#64748b" : "#334155" }}>{sub}</p>
                        </div>
                      ))}
                    </div>
                    <Link href="/profile">
                      <p className="text-[9px] text-muted-foreground/40 text-center font-display hover:text-muted-foreground/60 transition-colors cursor-pointer">Complete jobs to raise your trust score →</p>
                    </Link>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* ── Boost Suggestions (contextual) ── */}
        {boostableJobs.length > 0 && (
          <div className="mb-5 space-y-3 animate-fade-in">
            {boostableJobs.map((job: any) => (
              <div key={job.id} className="rounded-2xl p-4 relative overflow-hidden"
                style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.04))", border: "1.5px solid rgba(245,158,11,0.25)" }}
                data-testid={`banner-boost-suggestion-${job.id}`}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <Rocket className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-bold text-amber-400 tracking-wider mb-0.5">BOOST REWARD</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mb-2">"{job.title}" hasn't been accepted yet. Boost the reward to get picked up faster.</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/60 font-display">${job.budget} → <span className="text-amber-400 font-bold">${job.suggestedBudget}</span></span>
                    </div>
                    <Button size="sm" className="mt-2 h-8 px-4 rounded-xl font-display text-xs font-bold tracking-wider bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() => boostMutation.mutate({ jobId: job.id, newBudget: job.suggestedBudget })} disabled={boostMutation.isPending}
                      data-testid={`button-boost-${job.id}`}>
                      {boostMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                      Boost to ${job.suggestedBudget}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Map Section ── */}
        <div className="mb-6 animate-fade-in stagger-3" data-testid="section-nearby-jobs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs font-display font-bold text-foreground/90 tracking-[0.15em] uppercase">
                {mode === "hire" ? "Nearby Help" : "Nearby Jobs"}
              </span>
              {nearbyCount > 0 && (
                <span className="ml-2 text-[10px] font-display text-primary/60">{nearbyCount} active</span>
              )}
            </div>
            <Link href="/map">
              <span className="text-[10px] font-display text-primary/70 tracking-wider hover:text-primary transition-colors cursor-pointer font-semibold uppercase">
                View All →
              </span>
            </Link>
          </div>
          <div className="glass-card-strong rounded-2xl overflow-hidden relative" style={{ height: 200 }}>
            {mapCenter ? (
              <GoogleMap
                center={mapCenter}
                pins={mode === "hire" ? [] : filteredPins}
                workerPins={mode === "hire" ? (workerPins || []) : []}
                cashDrops={[]}
                onPinClick={setSelectedPin}
                onWorkerPinClick={setSelectedWorker}
                className="w-full h-full"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter zip code..."
                      value={zipOverride}
                      onChange={(e) => setZipOverride(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && zipOverride.trim()) {
                          fetch(`/api/geocode?address=${encodeURIComponent(zipOverride.trim() + ", USA")}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => { if (d?.lat && d?.lng) setMapCenter({ lat: d.lat, lng: d.lng }); })
                            .catch(() => {});
                        }
                      }}
                      className="bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none w-48 text-center"
                      data-testid="input-zip-map"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (zipOverride.trim()) {
                        fetch(`/api/geocode?address=${encodeURIComponent(zipOverride.trim() + ", USA")}`)
                          .then(r => r.ok ? r.json() : null)
                          .then(d => { if (d?.lat && d?.lng) setMapCenter({ lat: d.lat, lng: d.lng }); })
                          .catch(() => {});
                      }
                    }}
                    className="text-[11px] font-display font-bold text-primary px-4 py-1.5 rounded-lg"
                    style={{ background: "hsl(152 70% 40% / 0.2)", border: "1px solid hsl(152 70% 40% / 0.3)" }}
                    data-testid="button-go-zip"
                  >
                    GO
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedPin && (
            <div className="mt-3 rounded-xl p-3 flex items-center gap-3 cursor-pointer" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.3)" }}
              onClick={() => navigate(`/jobs/${selectedPin.id}`)} data-testid="card-selected-pin">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedPin.color || "#22C55E" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selectedPin.title}</p>
                <p className="text-[10px] text-muted-foreground/60">{selectedPin.category} · ${selectedPin.budget}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* ── Verify & Inspect Strip ── */}
        <Link href="/verify-inspect">
          <div
            className="mb-6 rounded-2xl px-4 py-3.5 cursor-pointer animate-fade-in stagger-3 relative overflow-hidden active:scale-[0.97] transition-all group"
            style={{
              background: "linear-gradient(135deg,#0d0820 0%,#1a0d3e 55%,#0a0520 100%)",
              border: "1.5px solid rgba(139,92,246,0.5)",
              boxShadow: "0 0 36px rgba(139,92,246,0.18), inset 0 0 40px rgba(139,92,246,0.04)",
            }}
            data-testid="card-verify-inspect-strip"
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 90% 30%,rgba(167,139,250,0.2) 0%,transparent 55%)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 10% 80%,rgba(91,33,182,0.1) 0%,transparent 50%)" }} />
            <div className="absolute inset-0 pointer-events-none animate-shimmer opacity-30" style={{ background: "linear-gradient(90deg,transparent 0%,rgba(139,92,246,0.12) 50%,transparent 100%)", backgroundSize: "200% 100%" }} />
            <div className="relative flex items-start gap-3.5">
              <div className="shrink-0 mt-0.5 w-12 h-12 animate-pulse-glow" style={{ filter: "drop-shadow(0 0 12px rgba(139,92,246,0.6))" }}>
                <img src={viLogoImg} alt="Verify & Inspect" className="w-full h-full object-contain" style={{ mixBlendMode: "screen" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-display font-black tracking-[0.2em] text-violet-400/70 uppercase mb-0.5">Verify &amp; Inspect</p>
                <p className="text-[13px] font-display font-black text-white leading-tight mb-1.5">See It Before You Buy It.</p>
                <div className="flex flex-wrap gap-1.5">
                  {["📸 Photo proof", "📍 GPS verified", "⚡ On-site in hours"].map((tag) => (
                    <span key={tag} className="text-[10px] font-display font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2 self-center">
                <span className="text-[10px] font-display font-black tracking-widest text-black uppercase px-3 py-1.5 rounded-full group-active:scale-95 transition-transform"
                  style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", boxShadow: "0 0 12px rgba(139,92,246,0.4)" }}>
                  Book Now
                </span>
              </div>
            </div>
          </div>
        </Link>

        {/* ── Work Types / Categories ── */}
        <div className="mb-6 animate-fade-in stagger-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-display font-bold text-foreground/90 tracking-[0.15em] uppercase">Work Types</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3" data-testid="section-categories">
            {WORK_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link key={cat.name} href={cat.href}>
                  <div
                    className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all active:scale-95"
                    style={{ background: cat.bg, border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`card-category-${cat.name.toLowerCase().replace(/[^a-z]/g, "-")}`}
                  >
                    <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                      <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold text-white leading-tight">{cat.name}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Marketplace — full-width coming soon */}
          <Link href="/marketplace-preview">
            <div
              className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg,rgba(250,204,21,0.10),rgba(250,204,21,0.05))",
                border: "1.5px solid rgba(250,204,21,0.28)",
              }}
              data-testid="card-category-marketplace"
            >
              <div className="p-2.5 rounded-xl shrink-0" style={{ background: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.22)" }}>
                <ShoppingBag className="w-5 h-5" style={{ color: "#FACC15" }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-display font-bold" style={{ color: "#FACC15" }}>Marketplace</p>
                  <span className="text-[10px] font-display font-bold px-1.5 py-0.5 rounded-full tracking-wider"
                    style={{ background: "rgba(250,204,21,0.12)", color: "#FACC15", border: "1px solid rgba(250,204,21,0.28)" }}>
                    🚧 COMING SOON
                  </span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(250,204,21,0.45)" }}>Buy & sell with verified confidence</p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "rgba(250,204,21,0.35)" }} />
            </div>
          </Link>
        </div>

        {/* ── AI or Not ── */}
        <div
          onClick={() => navigate("/ai-or-not")}
          className="mb-6 rounded-2xl p-4 cursor-pointer animate-fade-in stagger-5 overflow-hidden relative active:scale-[0.97] transition-all group"
          style={{
            background: "linear-gradient(135deg,hsl(190 85% 12%),hsl(175 85% 8%))",
            border: "1.5px solid hsl(190 85% 50% / 0.3)",
            boxShadow: "0 0 30px hsl(190 85% 50% / 0.1), inset 0 0 40px hsl(190 85% 50% / 0.03)",
          }}
          data-testid="card-category-ai-or-not"
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20"
              style={{ background: "radial-gradient(circle,hsl(190 85% 55%),transparent 70%)" }} />
            <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle,hsl(175 85% 55%),transparent 70%)" }} />
          </div>
          <div className="absolute inset-0 pointer-events-none animate-shimmer opacity-20" style={{ background: "linear-gradient(90deg,transparent 0%,hsl(190 85% 50% / 0.1) 50%,transparent 100%)", backgroundSize: "200% 100%" }} />
          <div className="relative flex items-center gap-4">
            <div className="p-3 rounded-xl shrink-0 relative animate-pulse-glow"
              style={{ background: "linear-gradient(135deg,hsl(190 85% 40%),hsl(175 85% 30%))", boxShadow: "0 0 20px hsl(190 85% 50% / 0.35)" }}>
              <Bot className="w-6 h-6 text-white" strokeWidth={1.8} />
            </div>
            <div className="flex-1 relative">
              <p className="font-display font-bold text-white text-sm leading-tight mb-0.5">AI or Not</p>
              <p className="text-[10px] font-display tracking-wider mb-1.5" style={{ color: "hsl(190 85% 60%)" }}>DETECT AI-GENERATED MEDIA</p>
              <p className="text-[10px] text-white/40 leading-relaxed">Upload any image or video to check if it's real or AI-made</p>
            </div>
            <span className="text-[10px] font-display font-black tracking-widest text-black uppercase px-3 py-1.5 rounded-full shrink-0 group-active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg,hsl(190 85% 55%),hsl(175 85% 45%))", boxShadow: "0 0 12px hsl(190 85% 50% / 0.35)" }}>
              Try It
            </span>
          </div>
        </div>

        {/* ── Cash Drop Fuel Card ── */}
        <div
          className="mb-4 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(234,88,12,0.05),rgba(0,0,0,0))",
            border: "1.5px solid rgba(245,158,11,0.22)",
          }}
          data-testid="card-cash-drop-fuel"
        >
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <Droplets className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-display font-black text-amber-400 tracking-wider leading-tight">💰 GUBER Gives Back</p>
                <p className="text-[10px] text-amber-400/50 font-display mt-0.5">Community-fueled cash events</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Cash Drops are funded by <span className="text-amber-400/80 font-semibold">Day-1 OG memberships</span> and <span className="text-amber-400/80 font-semibold">platform fees</span>. Every job completed and every OG that joins puts more into the pot. The bigger GUBER grows, the bigger the drops.
            </p>

            <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
              {[
                { icon: "📍", text: "Help your city get on the map — share GUBER and explore" },
                { icon: "🔗", text: "Save on platform fees by sharing your referral link" },
                { icon: "📈", text: "As we grow, every drop gets bigger" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <span className="text-sm shrink-0 leading-none mt-0.5">{icon}</span>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleReferralShare}
            className="w-full py-3 font-display text-[11px] font-black flex items-center justify-center gap-2 transition-all active:opacity-80 tracking-wider border-t"
            style={{ background: "rgba(245,158,11,0.07)", borderColor: "rgba(245,158,11,0.15)", color: "#d97706" }}
            data-testid="button-cash-drop-share-referral"
          >
            <Share2 className="w-3.5 h-3.5" />
            GET YOUR REFERRAL LINK → Save on Fees
          </button>
        </div>

        {/* ── Referral Nudge ── */}
        <div
          className="mb-4 rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
          style={{
            background: "linear-gradient(135deg,hsl(152 60% 10%),hsl(152 60% 7%))",
            border: "1px solid hsl(152 70% 40% / 0.2)",
          }}
          onClick={handleReferralShare}
          data-testid="card-referral-nudge"
        >
          <div className="p-2 rounded-xl shrink-0" style={{ background: "hsl(152 70% 40% / 0.15)" }}>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-foreground leading-tight">Invite friends, earn together</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">You both get GUBER Credit when they complete their first job.</p>
          </div>
          <span className="text-[10px] font-display font-black text-primary/70 shrink-0 tracking-wide">INVITE</span>
        </div>

        {/* ── B2B Hint ── */}
        <div
          className="mb-4 rounded-2xl px-4 py-3.5"
          style={{
            background: "rgba(245,158,11,0.03)",
            border: "1px solid rgba(245,158,11,0.10)",
          }}
          data-testid="card-b2b-hint"
        >
          <p className="text-sm font-display font-bold text-amber-400/60 leading-snug mb-0.5">
            Own a business?
          </p>
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
            Turn your location into the final stop.
          </p>
          <p className="text-[11px] text-muted-foreground/40 leading-relaxed mb-2">
            We bring the crowd. You keep the customers.
          </p>
          <a
            href="mailto:support@guberapp.com?subject=Cash%20Drop"
            className="text-[10px] font-display text-amber-400/30 hover:text-amber-400/50 transition-colors"
            data-testid="link-b2b-email"
          >
            → support@guberapp.com (Subject: Cash Drop)
          </a>
        </div>

      </div>

      {/* Alert permission modals */}
      {showAlertModal && (
        <AlertPromptModal onClose={handleAlertModalClose} />
      )}
      {!showAlertModal && showActionPrompt && (
        <AlertActionPrompt
          onEnable={handleActionPromptEnable}
          onDismiss={() => setShowActionPrompt(false)}
          message={actionPromptMsg}
        />
      )}
      {!showAlertModal && !showActionPrompt && showMissedBanner && (
        <MissedEventBanner
          type={missedEventType}
          onEnable={handleActionPromptEnable}
          onDismiss={() => setShowMissedBanner(false)}
        />
      )}

      <DashboardPromoModal
        promo={activePromo}
        open={promoOpen}
        onClose={handlePromoClose}
        onAction={handlePromoAction}
      />

    </GuberLayout>
  );
}
