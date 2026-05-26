import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { GuberLayout } from "@/components/guber-layout";
import { InstallHint, InstallMascot } from "@/components/install-prompt";
import { GoogleMap, type JobPin, type WorkerPin, type MapBounds } from "@/components/google-map";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Job } from "@shared/schema";
import {
  Zap, ShieldCheck, Hammer, Wrench, Repeat,
  Plus, Search, Briefcase, ChevronRight, Bot, MapPin as MapPinIcon,
  TrendingUp, X, Loader2, Rocket, Users, Bell, DollarSign, ShoppingBag, Truck,
} from "lucide-react";
import type { CashDropPin } from "@/components/google-map";
import viLogoImg from "@assets/Picsart_26-04-13_12-33-21-291_1776101665162.png";
import { subscribeToPush } from "@/lib/push";
import { buildReferralShareText } from "@/lib/referral";
import { DashboardTour, isTourComplete } from "@/components/dashboard-tour";
import {
  AlertPromptModal, AlertActionPrompt, MissedEventBanner,
  getAlertStatus, setAlertStatus, shouldShowAlertPrompt,
  hasAutoShownAlertModal, markAlertModalAutoShown,
} from "@/components/alert-prompt-modal";
import { gpsGetCurrentPosition } from "@/lib/gps";

// ─── Promo Modal System ───────────────────────────────────────────────────────

type PromoId = "cashdrop" | "day1og";
type PromoCard = { id: PromoId; title: string; subtitle: string; buttonText: string; href: string; accent: string };

const PROMOS: PromoCard[] = [];

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
          {promo.id === "day1og" && (
            <div className="flex justify-center -mt-1 mb-3">
              <img src="/day1og-badge.png" alt="" className="w-16 h-16 object-contain" style={{ filter: "drop-shadow(0 0 12px rgba(245,165,0,0.4))" }} />
            </div>
          )}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-display font-extrabold tracking-tight text-white" data-testid="text-promo-title">{promo.title}</h3>
              <p className="mt-2 text-sm text-white/65">{promo.subtitle}</p>
            </div>
            <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/85 hover:bg-white/5 hover:text-white transition" aria-label="Close promo" data-testid="button-close-promo">✕</button>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => onAction(promo)} className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black hover:opacity-90 transition" data-testid="button-promo-action">{promo.buttonText}</button>
            <button onClick={onClose} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/5 hover:text-white transition" data-testid="button-promo-later">Maybe later</button>
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

const CORE_TILES = [
  { name: "On-Demand Help",   sub: "Get help fast for any task",        icon: Zap,         bg: "linear-gradient(135deg,#78350f,#92400e,#c2410c)", href: "/browse-jobs?category=On-Demand Help",  testId: "on-demand-help" },
  { name: "Skilled Labor",    sub: "Find skilled pros for the job",     icon: Hammer,      bg: "linear-gradient(135deg,#7f1d1d,#991b1b,#b91c1c)", href: "/browse-jobs?category=Skilled Labor",   testId: "skilled-labor" },
  { name: "General Labor",    sub: "Everyday tasks, done right",        icon: Wrench,      bg: "linear-gradient(135deg,#14532d,#166534,#15803d)", href: "/browse-jobs?category=General Labor",   testId: "general-labor" },
  { name: "Verify & Inspect", sub: "Verify assets & inspections",       icon: ShieldCheck, bg: "linear-gradient(135deg,#2e1065,#4c1d95,#5b21b6)", href: "/verify-inspect",                       testId: "verify-inspect" },
  { name: "Marketplace",      sub: "Buy, sell & verify local items",    icon: ShoppingBag, bg: "linear-gradient(135deg,#422006,#7c4a15,#ca8a04)", href: "/marketplace",                          testId: "marketplace", badge: "BETA" },
  { name: "Barter Labor",     sub: "Trade skills. No cash needed",      icon: Repeat,      bg: "linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)", href: "/browse-jobs?category=Barter Labor",   testId: "barter-labor" },
  { name: "Load Board",       sub: "Ship vehicles & equipment",         icon: Truck,       bg: "linear-gradient(135deg,#042f2e,#0c5252,#0891b2)", href: "/load-board",                           testId: "load-board", badge: "NEW" },
  { name: "AI or Not?",       sub: "Can you spot the fake? 🤖",         icon: Bot,         bg: "linear-gradient(135deg,#060606,#111116,#1c1c26)", href: "/ai-or-not",                            testId: "ai-or-not" },
];

type DashboardMode = "hire" | "work";

// ─── To-Do Reminder Box ───────────────────────────────────────────────────────

interface TodoItem { id: string; icon: string; text: string; sub: string; href?: string; sessionOnly?: boolean }

// Permanent localStorage dismissals
function getTodoDismissed(id: string) { return localStorage.getItem(`guber_todo_dismissed_${id}`) === "true"; }
function setTodoDismissed(id: string) { localStorage.setItem(`guber_todo_dismissed_${id}`, "true"); }
// Session-only dismissals (sessionStorage — cleared when browser tab closes / user logs out)
function isSessionDismissed(id: string, userId?: number) {
  return sessionStorage.getItem(`guber_sess_dismissed_${userId ?? "anon"}_${id}`) === "true";
}
function addSessionDismissed(id: string, userId?: number) {
  sessionStorage.setItem(`guber_sess_dismissed_${userId ?? "anon"}_${id}`, "true");
}

function getDay1OgLastSuggested() { return Number(localStorage.getItem("guber_todo_day1og_last") || "0"); }
function setDay1OgLastSuggested() { localStorage.setItem("guber_todo_day1og_last", Date.now().toString()); }

// Clock-in first-use explanation
function getClockInExplained() { return localStorage.getItem("guber_clockin_explained") === "true"; }
function setClockInExplained() { localStorage.setItem("guber_clockin_explained", "true"); }

// Opportunities card collapse (auto-expands after 3 days)
function getOppsCollapsed() {
  const stored = localStorage.getItem("guber_opps_collapsed_at");
  if (!stored) return false;
  return Date.now() - Number(stored) < 3 * 24 * 60 * 60 * 1000;
}
function setOppsCollapsed() { localStorage.setItem("guber_opps_collapsed_at", Date.now().toString()); }
function clearOppsCollapsed() { localStorage.removeItem("guber_opps_collapsed_at"); }

function TodoReminderBox({ user, isAvailable, referralCount }: { user: any; isAvailable: boolean; referralCount: number }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [blink, setBlink] = useState(false);
  const [, navigate] = useLocation();

  const allItems = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    if (!user?.day1OG && Date.now() - getDay1OgLastSuggested() > 7 * 24 * 60 * 60 * 1000) {
      items.push({ id: "day1og", icon: "🥇", text: "Become a Day 1 OG", sub: "Lock in exclusive early-access perks before they're gone.", href: "/join" });
    }
    if (user?.stripeAccountStatus !== "active") {
      items.push({ id: "payout", icon: "💳", text: "Set up payments", sub: "Connect your bank to receive payouts for completed tasks.", sessionOnly: true });
    }
    if (referralCount < 25) {
      items.push({ id: "city", icon: "🏙️", text: "Unlock your city", sub: `${referralCount}/25 invites — help activate local cash drops.` });
    }
    return items;
  }, [user, isAvailable, referralCount]);

  const visibleItems = allItems.filter(item => {
    if (dismissed[item.id]) return false;
    if (item.sessionOnly) return !isSessionDismissed(item.id, user?.id);
    return !getTodoDismissed(item.id);
  });

  useEffect(() => {
    if (visibleItems.length === 0) return;
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 1400);
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 1400);
    }, 9000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [visibleItems.length]);

  const dismiss = (id: string, sessionOnly?: boolean) => {
    if (id === "day1og") setDay1OgLastSuggested();
    if (sessionOnly) {
      addSessionDismissed(id, user?.id);
    } else {
      setTodoDismissed(id);
    }
    setDismissed(p => ({ ...p, [id]: true }));
  };

  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-4 animate-fade-in" data-testid="section-todo-box">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl transition-all active:scale-[0.99]"
        style={{
          background: "rgba(201,168,76,0.06)",
          border: blink ? "1.5px solid rgba(201,168,76,0.75)" : "1.5px solid rgba(201,168,76,0.22)",
          boxShadow: blink ? "0 0 14px rgba(201,168,76,0.28)" : "none",
          transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        }}
        data-testid="button-todo-box"
      >
        <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="flex-1 text-left text-xs font-display font-bold text-amber-400/90 tracking-wide">
          Reminders <span className="ml-1 text-amber-400/60">({visibleItems.length})</span>
        </span>
        <span className="text-[10px] text-amber-400/45 font-display">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="mt-1.5 rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(201,168,76,0.18)", background: "rgba(5,5,5,0.85)" }}
        >
          {visibleItems.map((item, i) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderTop: i > 0 ? "1px solid rgba(201,168,76,0.08)" : "none" }}
            >
              <span className="text-base mt-0.5 shrink-0">{item.icon}</span>
              <div
                className="flex-1 min-w-0"
                style={{ cursor: item.href ? "pointer" : "default" }}
                onClick={() => item.href && navigate(item.href)}
              >
                <p className="text-xs font-display font-bold text-foreground/90 leading-tight">{item.text}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{item.sub}</p>
              </div>
              <button
                onClick={() => dismiss(item.id, item.sessionOnly)}
                className="shrink-0 mt-0.5 p-1 rounded-full text-muted-foreground/25 hover:text-muted-foreground transition-colors"
                aria-label="Dismiss"
                data-testid={`button-todo-dismiss-${item.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// CTA that flips between "Start a GUBER Drop" and "Manage GUBER Drop" based on
// whether the host has an active/draft drop. We render it inside the dashboard
// so it shares the auth/layout context, but isolate the query so the lookup
// doesn't run for users without host permission.
function HostDropCta({ testIdSuffix }: { testIdSuffix: string }) {
  const { data: myDrops } = useQuery<Array<{ id: number; title: string; status: string }>>({
    queryKey: ["/api/cash-drops/host/mine"],
  });
  const activeDrop = myDrops?.[0];
  const href = activeDrop ? `/host-drop/edit/${activeDrop.id}` : "/host-drop/new";
  const label = activeDrop ? "MANAGE GUBER DROP" : "START A GUBER DROP";
  const testId = activeDrop
    ? `button-manage-host-drop-${testIdSuffix}`
    : `button-start-host-drop${testIdSuffix === "hire" ? "" : `-${testIdSuffix}`}`;
  return (
    <Link href={href}>
      <button
        className="w-full h-12 gap-3 rounded-2xl font-display tracking-[0.12em] text-sm font-bold flex items-center justify-center transition-all active:scale-[0.99]"
        style={{
          background: activeDrop
            ? "linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.06))"
            : "linear-gradient(135deg,rgba(201,168,76,0.12),rgba(201,168,76,0.06))",
          border: `1.5px solid ${activeDrop ? "rgba(34,197,94,0.45)" : "rgba(201,168,76,0.4)"}`,
          color: activeDrop ? "#22c55e" : "#C9A84C",
        }}
        data-testid={testId}
      >
        <DollarSign className="w-4 h-4" />
        {label}
        <ChevronRight className="w-4 h-4 ml-auto opacity-60" />
      </button>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showTour, setShowTour] = useState(() => !isTourComplete());

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
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [selectedPin, setSelectedPin] = useState<JobPin | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerPin | null>(null);
  const [mapCatFilter] = useState("");
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showActionPrompt, setShowActionPrompt] = useState(false);
  const [actionPromptMsg, setActionPromptMsg] = useState<string | undefined>(undefined);
  const [showMissedBanner, setShowMissedBanner] = useState(false);
  const [missedEventType, setMissedEventType] = useState<"job" | "cash_drop" | "generic">("generic");
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [oppsCollapsed, setOppsCollapsedState] = useState(() => getOppsCollapsed());

  useEffect(() => {
    localStorage.setItem("guber_mode", mode);
  }, [mode]);

  // First-load prompt — show ONCE ever (effectively after signup), never on
  // subsequent launches. Even if the user closes the app without interacting,
  // the auto-shown flag is set so the modal won't pop up again on relaunch.
  // Banners (action prompt, missed-event) can still appear contextually.
  useEffect(() => {
    if (!user) return;
    if (!shouldShowAlertPrompt()) return;
    const alertStatus = getAlertStatus();
    if (alertStatus === "never_asked" && !hasAutoShownAlertModal()) {
      // Show full modal immediately (short render delay so page is visible first)
      const t = setTimeout(() => {
        setShowAlertModal(true);
        markAlertModalAutoShown();
      }, 400);
      return () => clearTimeout(t);
    }
    // Missed-event banner is disabled for now — it was firing too aggressively
    // (any unread notification triggered it on every launch). Re-enable once
    // we have a tighter "actually missed" signal from the server.
    // (status === "declined" branch intentionally left no-op.)
  }, [user]);

  // Track the highest unread-notification id at the moment the banner was
  // shown so dismissing can persist that watermark in localStorage.
  const [missedMaxId, setMissedMaxId] = useState<number>(0);
  const persistMissedDismissal = () => {
    try {
      const dismissKey = `guber_missed_banner_dismissed_${user?.id ?? "anon"}`;
      if (missedMaxId > 0) localStorage.setItem(dismissKey, String(missedMaxId));
    } catch {}
  };

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
      // Use the boolean return from subscribeToPush — getPushStatus() lies
      // on native (always returns "default"), which previously made the
      // "Turn on job alerts" banner appear to do nothing even on success.
      const granted = await subscribeToPush(user.id);
      setAlertStatus(granted ? "granted" : "declined");
    }
  };

  const handleAlertModalClose = () => {
    setShowAlertModal(false);
    // If still declined after modal, allow action prompts to appear
  };

  useEffect(() => {
    if (!user) return;
    if (user.day1OG) return;
    const isNew = promoIsNewUser();
    const cooldown = isNew ? 12 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000;
    if (Date.now() - promoGetLastShownAt() <= cooldown) return;
    const next = promoGetNext();
    if (!next) return;
    const delay = 4000 + Math.random() * 3000;
    const t = setTimeout(() => {
      setActivePromo(next);
      setPromoOpen(true);
      promoSetLastShownAt();
    }, delay);
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
      // Clock-in requires GPS server-side now (anti-spoof). Capture coords
      // FIRST and send them with the clock-in call. Reject loudly on
      // failure rather than silently flipping availability without GPS.
      if (v) {
        let pos: GeolocationPosition;
        try {
          pos = await gpsGetCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        } catch {
          throw new Error("Enable location to clock in — your map presence depends on it.");
        }
        await apiRequest("POST", "/api/workers/clock-in", {
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
          gpsAccuracy: pos.coords.accuracy,
          gpsTimestamp: pos.timestamp,
        });
      } else {
        await apiRequest("POST", "/api/workers/clock-out");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
    onError: (err: any) => toast({
      title: "Couldn't clock in",
      description: err?.detail || err?.message || "Try again with location enabled.",
      variant: "destructive",
    }),
  });

  const { data: myJobs } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user,
  });

  const { data: mapPins } = useQuery<JobPin[]>({
    queryKey: mapCenter
      ? [`/api/map-jobs?lat=${mapCenter.lat}&lng=${mapCenter.lng}&radiusMiles=100`]
      : ["/api/map-jobs"],
    enabled: !!user,
  });

  const { data: workerPins } = useQuery<WorkerPin[]>({
    queryKey: ["/api/workers/map"],
    enabled: !!user,
  });

  const { data: activeCashDrops } = useQuery<any[]>({
    queryKey: ["/api/cash-drops/active"],
    enabled: !!user,
  });

  const { data: referralData } = useQuery<{ code: string; link: string; referredCount: number }>({
    queryKey: ["/api/users/me/referral"],
    enabled: !!user,
  });

  const fallbackMapCenter = (u: typeof user) => {
    if ((u as any)?.lat && (u as any)?.lng) {
      setMapCenter({ lat: (u as any).lat, lng: (u as any).lng });
    } else if (u?.zipcode) {
      fetch(`/api/geocode?address=${encodeURIComponent(u.zipcode + ", USA")}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.lat && d?.lng) setMapCenter({ lat: d.lat, lng: d.lng }); })
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (!user) return;
    gpsGetCurrentPosition({ timeout: 5000, maximumAge: 60000 })
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMapCenter({ lat, lng });
        // Persist current GPS to the server so "nearby" push notifications
        // (notifyNearbyAvailableWorkers) use a fresh location instead of the
        // stale signup-zip geocode. Fire-and-forget — UI does not depend on it.
        apiRequest("POST", "/api/users/location", { lat, lng }).catch(() => {});
      })
      .catch(() => fallbackMapCenter(user));
  }, [user?.id]);

  const postedJobs = myJobs?.filter((j) => j.postedById === user?.id) || [];
  const acceptedJobs = myJobs?.filter((j) => j.assignedHelperId === user?.id) || [];
  // Poster action items: fund the worker or review submitted proof.
  const awaitingHireAction = postedJobs.filter((j) =>
    ["accepted_pending_payment", "proof_submitted"].includes(j.status),
  );
  // Worker action items: start the funded job or submit required proof.
  // proof_submitted is excluded — that is "waiting on poster", not a worker action.
  const awaitingWorkAction = acceptedJobs.filter(
    (j) =>
      j.status === "funded" ||
      (j.status === "in_progress" && j.proofRequired),
  );

  const mostUrgentHireJob =
    awaitingHireAction.find((j) => j.status === "accepted_pending_payment") ||
    awaitingHireAction[0];
  const mostUrgentWorkJob =
    awaitingWorkAction.find((j) => j.status === "funded") || awaitingWorkAction[0];
  const hireUrgentDeepLink = `/my-jobs?mode=hire&tab=${
    mostUrgentHireJob?.status === "proof_submitted" ? "proof_submitted" : "pending_confirm"
  }`;
  const workUrgentDeepLink = `/my-jobs?mode=work&tab=${
    mostUrgentWorkJob?.status === "funded" ? "locked_in_progress" : "proof_needed"
  }`;

  // First-touch toast: one per session naming the single most urgent job
  // (HIRE funding > HIRE proof review > WORK start > WORK submit-proof).
  // sessionStorage records every urgent ID we've alerted on so the toast
  // doesn't re-fire for the same job, but a brand-new urgent job appearing
  // mid-session still gets its own first-touch toast.
  const topPriorityJob =
    awaitingHireAction.find((j) => j.status === "accepted_pending_payment") ||
    awaitingHireAction.find((j) => j.status === "proof_submitted") ||
    awaitingWorkAction.find((j) => j.status === "funded") ||
    awaitingWorkAction[0];
  const topPriorityId = topPriorityJob?.id;

  useEffect(() => {
    if (!user || !topPriorityJob) return;
    const sessionKey = `guber_urgent_alerted_${user.id}`;
    let alreadyAlerted = new Set<number>();
    try {
      const parsed = JSON.parse(sessionStorage.getItem(sessionKey) || "[]");
      if (Array.isArray(parsed)) {
        alreadyAlerted = new Set(parsed.filter((n) => typeof n === "number"));
      }
    } catch {
      alreadyAlerted = new Set();
    }
    if (alreadyAlerted.has(topPriorityJob.id)) return;

    const isHire = topPriorityJob.postedById === user.id;
    let copy: string;
    let href: string;
    if (isHire) {
      href = hireUrgentDeepLink;
      copy =
        topPriorityJob.status === "accepted_pending_payment"
          ? `A worker accepted "${topPriorityJob.title}" — fund it now to lock them in.`
          : `Proof submitted on "${topPriorityJob.title}" — review it now to release payment.`;
    } else {
      href = workUrgentDeepLink;
      copy =
        topPriorityJob.status === "funded"
          ? `"${topPriorityJob.title}" is funded — start the work to lock in your payout.`
          : `Submit proof for "${topPriorityJob.title}" so the poster can release your payout.`;
    }

    toast({
      title: "⚠️ Action needed",
      description: copy,
      duration: 12000,
      action: (
        <ToastAction
          altText="Take me there"
          onClick={() => navigate(href)}
          className="border-destructive/50 bg-destructive/15 text-destructive hover:bg-destructive/25"
          data-testid="button-urgent-take-me-there"
        >
          Take me there
        </ToastAction>
      ),
    });

    alreadyAlerted.add(topPriorityJob.id);
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(Array.from(alreadyAlerted)));
    } catch {}
  }, [user, topPriorityId, topPriorityJob, hireUrgentDeepLink, workUrgentDeepLink, navigate, toast]);
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

  const activeCashDropPins: CashDropPin[] = (activeCashDrops || [])
    .filter((d: any) => d.gpsLat && d.gpsLng)
    .map((d: any) => ({
      id: d.id,
      gpsLat: parseFloat(d.gpsLat),
      gpsLng: parseFloat(d.gpsLng),
      title: d.title || "Cash Drop",
      rewardPerWinner: d.rewardPerWinner,
      status: d.status,
      hostLogoUrl: d.hostLogo || undefined,
    }));

  // "Nearby" badge counts must NEVER lie. Two checks:
  //  1. Map viewport (used to render pins) — only meaningful once Google Map
  //     has reported bounds; before that we cannot tell what's on screen so
  //     we render nothing rather than every pin in the country.
  //  2. True proximity (used for the "X near you" badges) — haversine from
  //     the user's actual GPS / fallback center, capped at NEARBY_RADIUS_MI.
  //     If we don't yet have a center, the count is 0 (better than lying).
  const NEARBY_RADIUS_MI = 50;
  const inViewport = (lat: number, lng: number) => {
    if (!mapBounds) return false;
    return lat >= mapBounds.south && lat <= mapBounds.north && lng >= mapBounds.west && lng <= mapBounds.east;
  };
  const isTrulyNearby = (lat: number, lng: number) => {
    if (!mapCenter) return false;
    return haversineDistance(mapCenter.lat, mapCenter.lng, lat, lng) <= NEARBY_RADIUS_MI;
  };

  const visibleJobPins = filteredPins.filter(p => inViewport(p.lat, p.lng));
  const visibleCashDropPins = activeCashDropPins.filter(d => inViewport(d.gpsLat, d.gpsLng));
  const visibleWorkerPins = (workerPins || []).filter(w => inViewport(w.lat, w.lng));
  // Counts shown to the user reflect REAL distance, not whatever happens to
  // be inside the current map viewport (which may be zoomed out across the
  // whole country before the user pans).
  const nearbyJobCount = filteredPins.filter(p => isTrulyNearby(p.lat, p.lng)).length;
  const nearbyDropCount = activeCashDropPins.filter(d => isTrulyNearby(d.gpsLat, d.gpsLng)).length;
  const nearbyCount = nearbyJobCount + nearbyDropCount;
  const workerCount = (workerPins || []).filter(w => isTrulyNearby(w.lat, w.lng)).length;

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

        {/* ── Subtle install hint (right-aligned, secondary) ── */}
        <InstallHint />

        {/* ── HIRE / WORK Toggle ── */}
        <div className="grid grid-cols-2 gap-3 mb-4 animate-fade-in stagger-1" data-testid="toggle-mode">
          <button
            onClick={() => {
              // If poster has unhandled action items, jump straight to the
              // urgent My Jobs tab on a single tap regardless of which
              // mode is currently active — the pulsing red badge promises
              // immediate action, not a two-step toggle.
              if (awaitingHireAction.length > 0) {
                navigate(hireUrgentDeepLink);
                return;
              }
              setMode("hire");
            }}
            className={`relative rounded-2xl p-4 flex items-center gap-3 text-left transition-all active:scale-95 ${awaitingHireAction.length > 0 ? "urgent-ring-pulse" : ""}`}
            style={{
              background: mode === "hire"
                ? "linear-gradient(135deg,hsl(220 60% 18%),hsl(220 70% 12%))"
                : "hsl(var(--card))",
              border: mode === "hire"
                ? "2px solid hsl(220 70% 55% / 0.7)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "hire" ? "0 0 20px hsl(220 70% 55% / 0.15)" : "none",
            }}
            data-testid="button-hire-mode"
          >
            {mode === "hire" && <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-400" />}
            {awaitingHireAction.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-destructive text-white text-[11px] font-display font-extrabold flex items-center justify-center ring-2 ring-background shadow-[0_0_12px_rgba(239,68,68,0.55)]"
                aria-label={`${awaitingHireAction.length} hire actions need attention`}
                data-testid="badge-hire-urgent-count"
              >
                {awaitingHireAction.length}
              </span>
            )}
            <div className="p-2.5 rounded-xl shrink-0" style={{ background: mode === "hire" ? "hsl(220 70% 55% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Briefcase className="w-5 h-5" style={{ color: mode === "hire" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.08em]" style={{ color: mode === "hire" ? "hsl(220 70% 70%)" : "hsl(var(--muted-foreground))" }}>HIRE</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "hire" ? "hsl(220 50% 65%)" : "hsl(var(--muted-foreground) / 0.5)" }}>Get things done</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (awaitingWorkAction.length > 0) {
                navigate(workUrgentDeepLink);
                return;
              }
              setMode("work");
            }}
            className={`relative rounded-2xl p-4 flex items-center gap-3 text-left transition-all active:scale-95 ${awaitingWorkAction.length > 0 ? "urgent-ring-pulse" : ""}`}
            style={{
              background: mode === "work"
                ? "linear-gradient(135deg,hsl(142 60% 10%),hsl(152 70% 8%))"
                : "hsl(var(--card))",
              border: mode === "work"
                ? "2px solid hsl(152 70% 45% / 0.7)"
                : "2px solid hsl(var(--border) / 0.3)",
              boxShadow: mode === "work" ? "0 0 20px hsl(152 70% 45% / 0.15)" : "none",
            }}
            data-testid="button-work-mode"
          >
            {mode === "work" && <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary" />}
            {awaitingWorkAction.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-destructive text-white text-[11px] font-display font-extrabold flex items-center justify-center ring-2 ring-background shadow-[0_0_12px_rgba(239,68,68,0.55)]"
                aria-label={`${awaitingWorkAction.length} work actions need attention`}
                data-testid="badge-work-urgent-count"
              >
                {awaitingWorkAction.length}
              </span>
            )}
            <div className="p-2.5 rounded-xl shrink-0" style={{ background: mode === "work" ? "hsl(152 70% 45% / 0.2)" : "hsl(var(--muted) / 0.3)" }}>
              <Search className="w-5 h-5" style={{ color: mode === "work" ? "hsl(152 70% 65%)" : "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <p className="text-sm font-display font-black tracking-[0.08em]" style={{ color: mode === "work" ? "hsl(152 70% 65%)" : "hsl(var(--muted-foreground))" }}>WORK</p>
              <p className="text-[10px] font-display mt-0.5" style={{ color: mode === "work" ? "hsl(152 50% 55%)" : "hsl(var(--muted-foreground) / 0.5)" }}>Earn money</p>
            </div>
          </button>
        </div>

        {/* ── Mode Action Card ── */}
        <div className="mb-4 animate-fade-in stagger-1">
          {mode === "hire" ? (
            <div
              className="rounded-2xl p-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,rgba(0,8,20,0.95),rgba(0,12,30,0.9))", border: "1.5px solid rgba(59,130,246,0.35)" }}
              data-testid="card-mode-action-hire"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[9px] font-display font-black tracking-[0.25em] text-blue-400/70 uppercase mb-1">HIRE MODE ACTIVE</p>
                  <h2 className="text-[1.3rem] font-display font-black text-white leading-tight">Need help today?</h2>
                  <p className="text-xs text-white/55 mt-1">Post a job and get help fast from trusted locals.</p>
                </div>
                <div className="p-3 rounded-2xl shrink-0" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", boxShadow: "0 0 20px rgba(59,130,246,0.2)" }}>
                  <Briefcase className="w-6 h-6" style={{ color: "#3b82f6" }} />
                </div>
              </div>
              <Link href="/post-job">
                <button
                  className="w-full h-12 rounded-2xl font-display font-black text-sm tracking-[0.1em] text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg,#1d4ed8,#1e40af)" }}
                  data-testid="button-post-a-job"
                >
                  POST A JOB <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
              <p className="text-[10px] text-white/30 mt-2 text-center">Fast local help in minutes</p>
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,rgba(0,20,8,0.95),rgba(0,30,12,0.9))", border: "1.5px solid rgba(34,197,94,0.35)" }}
              data-testid="card-mode-action-work"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[9px] font-display font-black tracking-[0.25em] text-green-400/70 uppercase mb-1">WORK MODE ACTIVE</p>
                  <h2 className="text-[1.3rem] font-display font-black text-white leading-tight">Ready to earn?</h2>
                  <p className="text-xs text-white/55 mt-1">Find jobs near you and start earning today.</p>
                </div>
                <div className="p-3 rounded-2xl shrink-0" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", boxShadow: "0 0 20px rgba(34,197,94,0.2)" }}>
                  <DollarSign className="w-6 h-6" style={{ color: "#22c55e" }} />
                </div>
              </div>
              <Link href="/browse-jobs">
                <button
                  className="w-full h-12 rounded-2xl font-display font-black text-sm tracking-[0.1em] text-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
                  data-testid="button-find-work-near-me"
                >
                  FIND WORK NEAR ME <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
              <p className="text-[10px] text-white/30 mt-2 text-center">On-Demand • General Labor • Skilled Labor • Verify &amp; Inspect</p>
            </div>
          )}
        </div>

        {/* ── 8 Core Tiles ── */}
        <div className="mb-5 animate-fade-in stagger-2">
          <div className="grid grid-cols-2 gap-3" data-testid="section-categories">
            {CORE_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link key={tile.name} href={tile.href}>
                  <div
                    className="rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer transition-all active:scale-95 relative overflow-hidden"
                    style={{ background: tile.bg, border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`card-category-${tile.testId}`}
                  >
                    {tile.badge && (
                      <span
                        className="absolute top-2 right-2 text-[7px] font-display font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)" }}
                      >
                        {tile.badge}
                      </span>
                    )}
                    <div className="p-2 rounded-xl self-start" style={{ background: "rgba(255,255,255,0.15)" }}>
                      <Icon className="w-4 h-4 text-white" strokeWidth={1.8} />
                    </div>
                    <div className="pr-2">
                      <p className="text-sm font-display font-bold text-white leading-tight">{tile.name}</p>
                      <p className="text-[10px] text-white/55 mt-0.5 leading-snug">{tile.sub}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-white/30 absolute bottom-3 right-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── You're early — help unlock your city ── */}
        <div className="mb-5 animate-fade-in stagger-3">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.2)" }}
            data-testid="card-city-activation-unified"
          >
            <button
              className="w-full flex items-center justify-between px-4 pt-3.5 pb-2 text-left"
              onClick={() => {
                if (oppsCollapsed) { clearOppsCollapsed(); setOppsCollapsedState(false); }
                else { setOppsCollapsed(); setOppsCollapsedState(true); }
              }}
              data-testid="button-toggle-opps"
            >
              <div>
                <p className="text-sm font-display font-black text-amber-400 tracking-wider leading-tight">
                  🚀 You're early — help unlock your city
                </p>
                {!oppsCollapsed && (
                  <p className="text-[11px] text-amber-400/55 font-display mt-0.5 leading-snug">
                    More activity unlocks more drops, more jobs, and more momentum.
                  </p>
                )}
              </div>
              <span className="text-[10px] text-amber-400/40 font-display ml-3 shrink-0">{oppsCollapsed ? "▼" : "▲"}</span>
            </button>
            {!oppsCollapsed && (
              <>
                <p className="text-[10px] text-amber-400/45 font-display px-4 pb-2 leading-snug">
                  More activity unlocks more drops, more jobs, and more momentum.
                </p>
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[9px] font-display font-bold text-amber-400/50 tracking-wider uppercase">⚡ City Activation</p>
                    <p className="text-[9px] font-display text-muted-foreground/35">
                      {referralData?.referredCount ?? 0} / 25 to unlock cash drops
                    </p>
                  </div>
                  <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "rgba(201,168,76,0.12)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.round(((referralData?.referredCount ?? 0) / 25) * 100 + 8))}%`, background: "linear-gradient(90deg,#C6A85C,#e8c97a)", transition: "width 1s ease" }}
                      data-testid="bar-city-activation"
                    />
                  </div>
                </div>
                <button
                  className="w-full py-3 font-display text-sm font-black flex items-center justify-center gap-2 transition-all active:opacity-80 tracking-wider border-t disabled:opacity-50"
                  style={{ background: "rgba(201,168,76,0.1)", borderColor: "rgba(201,168,76,0.18)", color: "#C9A84C" }}
                  data-testid="button-invite-activate-city"
                  disabled={isSharing}
                  onClick={() => handleReferralShare()}
                >
                  🚀 Invite &amp; Activate Your City
                </button>
              </>
            )}
          </div>
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
            <p className="text-[10px] text-muted-foreground mt-0.5">You both get GUBER Credit when they complete their first job.</p>
          </div>
          <span className="text-[10px] font-display font-black text-primary/70 shrink-0 tracking-wide">INVITE</span>
        </div>

        {/* ── Nearby Jobs / Map ── */}
        <div className="mb-5 animate-fade-in stagger-3" data-testid="section-nearby-jobs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs font-display font-bold text-foreground/90 tracking-[0.15em] uppercase">
                {mode === "hire" ? "Nearby Workers" : "Nearby Jobs"}
              </span>
              {mode === "hire" ? (
                workerCount > 0
                  ? <span className="ml-2 text-[10px] font-display text-primary/60" data-testid="text-nearby-count-inline">{workerCount} active</span>
                  : <span className="ml-2 text-[10px] font-display text-primary/40" data-testid="text-nearby-count-inline">👀 Local help appears here in real time</span>
              ) : (
                nearbyCount > 0
                  ? <span className="ml-2 text-[10px] font-display text-primary/60" data-testid="text-nearby-count-inline">{nearbyCount} active</span>
                  : <span className="ml-2 text-[10px] font-display text-primary/40" data-testid="text-nearby-count-inline">⚡ Activity grows as more workers join</span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {mode === "work" && (
                <div className="flex items-center gap-1.5" data-testid="section-availability">
                  <span className="text-[10px] font-display font-semibold leading-none" style={{ color: (user as any)?.isAvailable ? "hsl(152 70% 60%)" : "hsl(var(--muted-foreground))" }}>
                    {(user as any)?.isAvailable ? "Clocked In" : "Clocked Out"}
                  </span>
                  <Switch
                    checked={!!(user as any)?.isAvailable}
                    onCheckedChange={(v) => {
                      availabilityMutation.mutate(v);
                      if (v) {
                        triggerActionPrompt("Enable alerts to hear about new jobs");
                        if (!getClockInExplained()) {
                          setClockInExplained();
                          setShowClockInModal(true);
                        }
                      }
                    }}
                    disabled={availabilityMutation.isPending}
                    data-testid="toggle-availability"
                  />
                </div>
              )}
              <div className="flex flex-col items-end gap-0.5">
                <Link href="/map">
                  <span className="text-[10px] font-display text-primary/70 tracking-wider hover:text-primary transition-colors cursor-pointer font-semibold uppercase">
                    View Map →
                  </span>
                </Link>
                {mode === "hire" ? (
                  workerCount > 0 && (
                    <span className="text-[9px] font-display text-primary/50 leading-none" data-testid="text-map-live-count">
                      {workerCount} worker{workerCount !== 1 ? "s" : ""} nearby
                    </span>
                  )
                ) : (
                  nearbyCount > 0 && (
                    <span className="text-[9px] font-display text-primary/50 leading-none" data-testid="text-map-live-count">
                      {nearbyCount} near you
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
          <div className="glass-card-strong rounded-2xl overflow-hidden relative" style={{ height: 200 }}>
            {mapCenter ? (
              <GoogleMap
                center={mapCenter}
                pins={mode === "work" ? filteredPins : []}
                workerPins={mode === "hire" ? (workerPins || []) : []}
                cashDrops={mode === "work" ? activeCashDropPins : []}
                onPinClick={setSelectedPin}
                onWorkerPinClick={setSelectedWorker}
                onCashDropClick={(drop) => navigate(`/cash-drop/${drop.id}`)}
                onBoundsChanged={setMapBounds}
                className="w-full h-full"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="flex flex-col items-center gap-2">
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
                    className="bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/85 focus:outline-none w-48 text-center"
                    data-testid="input-zip-map"
                  />
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
                <p className="text-[10px] text-muted-foreground">{selectedPin.category} · ${selectedPin.budget}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          {mode === "work" && !!(user as any)?.isAvailable && (user as any)?.stripeAccountStatus !== "active" && (
            <div className="mt-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5" data-testid="banner-stripe-required">
              <div className="flex gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] font-display font-bold text-foreground leading-tight mb-1">💸 Unlock your payouts</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">Complete Stripe setup so you can receive payments when you finish jobs.</p>
                  <Button size="sm" variant="ghost" className="h-7 px-0 text-[10px] font-display font-bold text-emerald-400 hover:text-emerald-300 hover:bg-transparent flex items-center gap-1 group"
                    onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} data-testid="link-setup-payouts-dashboard">
                    {onboardMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><span>SET UP NOW</span><ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Opportunities Near You (removed — moved above map) ── */}
        {false && (
          <div className="mb-5 animate-fade-in stagger-4">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.2)" }}
              data-testid="card-city-activation-unified-old"
            >
              {/* Header row — tap to collapse */}
              <button
                className="w-full flex items-center justify-between px-4 pt-3.5 pb-2 text-left"
                onClick={() => {
                  if (oppsCollapsed) { clearOppsCollapsed(); setOppsCollapsedState(false); }
                  else { setOppsCollapsed(); setOppsCollapsedState(true); }
                }}
                data-testid="button-toggle-opps"
              >
                <div>
                  <p className="text-sm font-display font-black text-amber-400 tracking-wider leading-tight">
                    🚀 You're early — help unlock your city
                  </p>
                  {!oppsCollapsed && (
                    <p className="text-[11px] text-amber-400/55 font-display mt-0.5 leading-snug">
                      More activity unlocks more drops, more jobs, and more momentum.
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-amber-400/40 font-display ml-3 shrink-0">{oppsCollapsed ? "▼" : "▲"}</span>
              </button>

              {!oppsCollapsed && (
                <>
                  {/* Context line */}
                  <p className="text-[10px] text-amber-400/45 font-display px-4 pb-2 leading-snug">
                    More activity unlocks more drops, more jobs, and more momentum.
                  </p>

                  {/* Progress bar row */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] font-display font-bold text-amber-400/50 tracking-wider uppercase">⚡ City Activation</p>
                      <p className="text-[9px] font-display text-muted-foreground/35">
                        {referralData?.referredCount ?? 0} / 25 to unlock cash drops
                      </p>
                    </div>
                    <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "rgba(201,168,76,0.12)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.round(((referralData?.referredCount ?? 0) / 25) * 100 + 8))}%`, background: "linear-gradient(90deg,#C6A85C,#e8c97a)", transition: "width 1s ease" }}
                        data-testid="bar-city-activation"
                      />
                    </div>
                  </div>

                  {/* Invite button */}
                  <button
                    className="w-full py-3 font-display text-sm font-black flex items-center justify-center gap-2 transition-all active:opacity-80 tracking-wider border-t disabled:opacity-50"
                    style={{ background: "rgba(201,168,76,0.1)", borderColor: "rgba(201,168,76,0.18)", color: "#C9A84C" }}
                    data-testid="button-invite-activate-city"
                    disabled={isSharing}
                    onClick={() => handleReferralShare()}
                  >
                    🚀 Invite &amp; Activate Your City
                  </button>
                </>
              )}
            </div>
          </div>
        )}

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
                      <span className="text-[10px] text-muted-foreground font-display">${job.budget} → <span className="text-amber-400 font-bold">${job.suggestedBudget}</span></span>
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
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Turn your location into the final stop.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
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

      {/* Clock-In first-use explanation modal */}
      {showClockInModal && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 px-4 pb-8" data-testid="modal-clockin-explain">
          <div className="w-full max-w-md rounded-3xl overflow-hidden" style={{ background: "hsl(222 47% 9%)", border: "1.5px solid hsl(152 70% 40% / 0.4)" }}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "hsl(152 70% 40% / 0.2)", border: "1px solid hsl(152 70% 40% / 0.3)" }}>
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-display font-black text-foreground tracking-tight">You're Clocked In! 🟢</p>
                  <p className="text-[10px] text-muted-foreground font-display mt-0.5">Your availability is now visible</p>
                </div>
              </div>
              <p className="text-[13px] text-foreground/80 leading-relaxed mb-4">
                When you're <span className="text-primary font-semibold">Clocked In</span>, local hirers can see you're available and send you gig requests directly. Clock Out any time to go invisible.
              </p>
              <p className="text-[11px] text-muted-foreground mb-5">
                You can also ask the <span className="text-primary/80">AI Help</span> button anytime to explain how this works.
              </p>
              <button
                onClick={() => setShowClockInModal(false)}
                className="w-full py-3 rounded-2xl font-display font-black text-sm tracking-wide transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,hsl(152 70% 40%),hsl(152 70% 30%))", color: "#000" }}
                data-testid="button-clockin-modal-close"
              >
                Got it — I'm ready to work
              </button>
            </div>
          </div>
        </div>
      )}

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
          onEnable={() => { persistMissedDismissal(); handleActionPromptEnable(); }}
          onDismiss={() => { persistMissedDismissal(); setShowMissedBanner(false); }}
        />
      )}

      <DashboardPromoModal
        promo={activePromo}
        open={promoOpen}
        onClose={handlePromoClose}
        onAction={handlePromoAction}
      />

      {/* ── Floating mascot helper (subtle, anchored bottom-right) ── */}
      <InstallMascot />

      {/* ── Onboarding tour ── */}
      {showTour && !!user && (
        <DashboardTour
          accountType={(user as any)?.accountType || "individual"}
          onComplete={() => setShowTour(false)}
          onModeChange={(m) => setMode(m as DashboardMode)}
        />
      )}

    </GuberLayout>
  );
}
