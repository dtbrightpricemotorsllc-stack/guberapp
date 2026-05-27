import { useRef, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Notification } from "@shared/schema";
import { subscribeToPush, clearNativeBadge } from "@/lib/push";
import { playGuberPing, unlockAudio, isAudioUnlocked, playGuberSound, type SoundType } from "@/lib/notification-sound";
import { isNativeApp, isAndroid } from "@/lib/platform";
import { PushNotificationBanner } from "@/components/push-notification-banner";
import { GpsDisclaimerModal } from "@/components/gps-disclaimer-modal";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "./guber-logo";
import { GUBERAssistant, GUBERAssistantHeaderButton } from "./guber-assistant";
import { AdminDiagnosticAssistant } from "./admin-diagnostic-assistant";
import { ActiveJobBanner } from "./active-job-banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Briefcase,
  User,
  Bell,
  Settings,
  LogOut,
  Wallet,
  FileText,
  Lock,
  Shield,
  Map,
  Zap,
  Download,
  ShoppingBag,
  ArrowLeft,
} from "lucide-react";

const SOUND_PRIORITY: SoundType[] = ["money", "nearby", "action", "closed", "default"];

function classifyNotification(n: Notification): SoundType {
  const t = (n.title || "").toLowerCase();
  const b = (n.body || "").toLowerCase();
  const type = n.type || "";

  if (type === "offer_funded") return "money";
  if (type === "cash_drop") {
    if (t.includes("live")) return "nearby";
    if (t.includes("claimed") || b.includes("claimed")) return "closed";
    return "nearby";
  }
  if (type === "offer_payment_failed" || type === "offer_payment_pending") return "closed";
  if (type === "job") {
    if (t.includes("payment") || t.includes("paid") || t.includes("locked") ||
        t.includes("earned") || t.includes("payout") ||
        b.includes("payment") || b.includes("paid") || b.includes("locked") ||
        b.includes("earned") || b.includes("payout")) return "money";
    return "action";
  }
  if (type === "system") {
    if (t.includes("referral reward") || t.includes("payout")) return "money";
    return "default";
  }
  return "default";
}

function classifyPush(tag: string, title: string): SoundType {
  const tl = (title || "").toLowerCase();
  if (tag.includes("cashdrop-claimed")) return "closed";
  if (tag.includes("cashdrop")) return "nearby";
  if (tl.includes("payment") || tl.includes("paid") || tl.includes("locked") || tl.includes("earned")) return "money";
  if (tag.includes("job-status")) return "action";
  if (tag === "nearby-jobs") return "nearby";
  return "default";
}

export function GuberLayout({ children, hideHeader, showBack, backHref, onBack, title }: {
  children: React.ReactNode;
  hideHeader?: boolean;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  title?: string;
}) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    // On login, only re-register the push token if permission is already
    // granted. Never trigger the OS permission dialog from this auto-effect —
    // Apple Guideline 4.5.4 expects a user-initiated, contextual ask. The
    // dashboard / browse-jobs in-app prompts handle the actual ask.
    if (user?.id) subscribeToPush(user.id, { promptIfNeeded: false }).catch(() => {});
  }, [user?.id]);

  // Clear app badge + notification-centre entries whenever the app comes to
  // the foreground. This resets the red dot on the iOS/Android icon so the
  // user knows the alerts have been seen. Runs once on mount (covers the case
  // where the app was opened via a tap from a closed state) and again every
  // time the App 'appStateChange' active event fires (background → foreground).
  useEffect(() => {
    if (!isNativeApp) return;
    clearNativeBadge().catch(() => {});

    let cleanupFn: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) clearNativeBadge().catch(() => {});
        });
        cleanupFn = () => handle.remove();
      } catch {}
    })();

    return () => { cleanupFn?.(); };
  }, []);

  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      if (isAdmin) {
        navigate("/admin");
      }
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current < 5) {
        navigate("/dashboard");
      }
      tapCountRef.current = 0;
    }, 600);
  }, [isAdmin, navigate]);

  const bottomTabs = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/map", label: "Map", icon: Map },
    { href: "/marketplace", label: "Market", icon: ShoppingBag },
    { href: "/my-jobs", label: "Jobs", icon: Briefcase },
    ...(isAdmin
      ? [{ href: "/admin", label: "Admin", icon: Shield }]
      : [{ href: "/wallet", label: "Wallet", icon: Wallet }]
    ),
  ];

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;
  const prevUnreadRef = useRef<number | null>(null);

  // Tracks which notification IDs have already triggered a typed WAV sound
  const soundedIdsRef = useRef<Set<number>>(new Set());
  // Whether soundedIdsRef has been seeded with the initial fetch
  const seededRef = useRef(false);

  const [moneyFlashVisible, setMoneyFlashVisible] = useState(false);
  const moneyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (moneyFlashTimerRef.current) clearTimeout(moneyFlashTimerRef.current);
    };
  }, []);

  function triggerMoneyFlash() {
    if (moneyFlashTimerRef.current) clearTimeout(moneyFlashTimerRef.current);
    setMoneyFlashVisible(true);
    moneyFlashTimerRef.current = setTimeout(() => setMoneyFlashVisible(false), 1800);
  }

  // Unlock AudioContext + HTMLAudio on the first user gesture. iOS is fussy
  // about this — listen on a wide set of events and detach them all once any
  // path successfully unlocks (tracked in sessionStorage so it persists
  // across re-mounts during the same tab session).
  useEffect(() => {
    if (isAudioUnlocked()) return;
    const events: Array<keyof WindowEventMap> = [
      "touchstart",
      "touchend",
      "click",
      "pointerdown",
      "keydown",
    ];
    const unlock = () => {
      unlockAudio();
      if (isAudioUnlocked()) {
        events.forEach((e) => window.removeEventListener(e, unlock as EventListener));
      }
    };
    events.forEach((e) =>
      window.addEventListener(e, unlock as EventListener, { passive: true } as AddEventListenerOptions)
    );
    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock as EventListener));
    };
  }, []);

  // Play GUBER ping when unread count rises (new notification arrived).
  // Important: do NOT fire on the initial fetch transition from
  // `undefined` → loaded data, otherwise users with pre-existing unread
  // items hear the alert every time they open the app. Wait until we
  // have real data, seed prevUnreadRef silently, and only ping on
  // subsequent rises.
  useEffect(() => {
    if (notifications === undefined) return;
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current) {
      playGuberPing();
    }
    prevUnreadRef.current = unreadCount;
  }, [notifications, unreadCount]);

  // Typed WAV + vibration dispatch for new notifications
  useEffect(() => {
    if (notifications === undefined) return;

    if (!seededRef.current) {
      // First fetch (even if empty) — seed all existing IDs so they don't trigger sounds
      notifications.forEach((n) => soundedIdsRef.current.add(n.id));
      seededRef.current = true;
      return;
    }

    // Find notifications that haven't been sounded yet
    const newOnes = notifications.filter((n) => !soundedIdsRef.current.has(n.id));
    if (newOnes.length === 0) return;

    // Mark them all as sounded
    newOnes.forEach((n) => soundedIdsRef.current.add(n.id));

    // Pick highest-priority sound type from the batch
    const types = new Set(newOnes.map(classifyNotification));
    const winner = SOUND_PRIORITY.find((t) => types.has(t)) ?? "default";

    playGuberSound(winner);
    if (winner === "money") triggerMoneyFlash();
  }, [notifications]);

  // Play typed sound when a push arrives while the app is open
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "GUBER_PUSH") {
        const tag: string = event.data?.tag ?? "";
        const title: string = event.data?.title ?? "";
        const serverSound: string = event.data?.sound ?? "";
        // Prefer the server-assigned sound filename; fall back to client-side heuristic
        let soundType: SoundType;
        if (serverSound && serverSound.startsWith("guber_")) {
          const name = serverSound.replace("guber_", "").replace(".wav", "") as SoundType;
          soundType = (["money", "action", "closed", "nearby", "default"] as SoundType[]).includes(name) ? name : "default";
        } else {
          soundType = classifyPush(tag, title);
        }
        playGuberSound(soundType);
        if (soundType === "money") triggerMoneyFlash();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const initials = (user as any)?.publicUsername?.slice(0, 2).toUpperCase() || (user as any)?.guberId?.replace("GUB-", "").slice(0, 2) || user?.fullName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  const [statusBarHeight, setStatusBarHeight] = useState(0);
  useEffect(() => {
    if (isNativeApp && isAndroid) {
      const test = document.createElement("div");
      test.style.height = "env(safe-area-inset-top, 0px)";
      test.style.position = "fixed";
      test.style.visibility = "hidden";
      document.body.appendChild(test);
      const h = test.getBoundingClientRect().height;
      document.body.removeChild(test);
      if (h < 4) setStatusBarHeight(36);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!hideHeader && (
        <header className="sticky top-0 z-50 glass-header" style={{ paddingTop: statusBarHeight ? `${statusBarHeight}px` : 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 h-[56px]">
            {showBack ? (
              <button
                onClick={() => onBack ? onBack() : backHref ? navigate(backHref) : history.back()}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors -ml-1 px-1 py-1 rounded-lg hover:bg-white/[0.04] active:scale-95"
                data-testid="button-header-back"
              >
                <ArrowLeft className="w-5 h-5" />
                {title && <span className="text-sm font-display font-bold text-foreground ml-1">{title}</span>}
              </button>
            ) : (
              <div
                onClick={handleLogoTap}
                className="focus:outline-none active:opacity-80 transition-opacity cursor-pointer select-none"
                data-testid="button-logo"
              >
                <GuberLogo size="sm" />
              </div>
            )}

            <div className="flex items-center gap-0.5">
              <Link href="/notifications">
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all rounded-xl w-10 h-10" data-testid="button-notifications">
                  <Bell className="w-[18px] h-[18px]" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive text-[9px] flex items-center justify-center text-white font-bold ring-2 ring-background animate-pulse-glow">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </Link>

              <GUBERAssistantHeaderButton />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 hover:bg-white/[0.04]" data-testid="button-user-menu">
                    <Avatar className="w-8 h-8 ring-[1.5px] ring-primary/25 ring-offset-1 ring-offset-background">
                      {user?.profilePhoto && <AvatarImage src={user.profilePhoto} alt={(user as any)?.publicUsername || (user as any)?.guberId || "Profile"} className="object-cover" />}
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-secondary/20 text-[11px] font-display font-bold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-card-strong rounded-2xl p-2 border-white/[0.08]">
                  <div className="px-3 py-2.5 mb-1">
                    <p className="text-sm font-display font-bold truncate">
                      {(user as any)?.publicUsername ? `@${(user as any).publicUsername}` : ((user as any)?.guberId || user?.fullName || "GUBER Member")}
                    </p>
                    <p className="text-[11px] text-primary/60 font-mono truncate mt-0.5">{(user as any)?.guberId || ""}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-white/[0.06] mx-1" />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" /> My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/wallet" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm">
                      <Wallet className="w-4 h-4 text-muted-foreground" /> Wallet
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account-settings" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm">
                      <Settings className="w-4 h-4 text-muted-foreground" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/ai-or-not" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" /> AI or Not
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/studio" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm" data-testid="link-nav-studio">
                        <Zap className="w-4 h-4 text-primary/80" /> GUBER Studio
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator className="bg-white/[0.06] mx-1" />
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm">
                          <Shield className="w-4 h-4 text-primary/70" /> Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator className="bg-white/[0.06] mx-1" />
                  <DropdownMenuItem asChild>
                    <Link href="/terms" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-xs text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" /> Terms of Service
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/privacy" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-xs text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" /> Privacy Policy
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/acceptable-use" className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-xs text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" /> Acceptable Use
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/[0.06] mx-1" />
                  <DropdownMenuItem
                    className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm"
                    onClick={() => {
                      const e = (window as any).__installPromptEvent;
                      if (e) {
                        e.prompt();
                        (window as any).__installPromptEvent = null;
                      } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) {
                        alert("To install GUBER:\n1. Tap the Share button in Safari\n2. Tap \"Add to Home Screen\"\n3. Tap Add");
                      } else {
                        alert("To install GUBER, tap the menu in your browser and choose \"Add to Home Screen\" or \"Install app\".");
                      }
                    }}
                    data-testid="button-add-to-home"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" /> Add to Home Screen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/[0.06] mx-1" />
                  <DropdownMenuItem
                    className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 text-sm text-destructive focus:text-destructive"
                    onClick={() => logout()}
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="guber-gradient-line" />
        </header>
      )}

      <GpsDisclaimerModal />

      <main className="flex-1" style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
        <PushNotificationBanner />
        <ActiveJobBanner />
        {children}
      </main>

      <GUBERAssistant />
      {isAdmin && location === "/admin" && <AdminDiagnosticAssistant />}

      {/* Money flash overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: "90px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "none",
          opacity: moneyFlashVisible ? 1 : 0,
          transition: moneyFlashVisible
            ? "opacity 0.25s ease-in"
            : "opacity 0.4s ease-out",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #f5a623 0%, #f7c94b 50%, #e8950c 100%)",
            color: "#1a0e00",
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "0.02em",
            padding: "8px 18px",
            borderRadius: "999px",
            boxShadow: "0 0 18px 4px rgba(245,166,35,0.55), 0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          💰 Paid Instantly
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav border-t border-white/[0.06]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-3">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location === tab.href || (tab.href === "/dashboard" && location === "/");
            return (
              <Link key={tab.href} href={tab.href}>
                <div className="flex flex-col items-center gap-1 min-w-[56px] py-1.5 relative cursor-pointer" data-testid={`tab-${tab.label.toLowerCase()}`}>
                  {isActive && (
                    <div
                      className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                      style={{ background: "hsl(152 100% 44%)", boxShadow: "0 0 8px hsl(152 100% 44% / 0.4)" }}
                    />
                  )}
                  <div className={`p-1 rounded-xl transition-all duration-200 ${isActive ? "bg-primary/[0.08]" : ""}`}>
                    <Icon
                      className={`w-[20px] h-[20px] transition-all duration-200 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      strokeWidth={isActive ? 2.2 : 1.5}
                    />
                  </div>
                  <span className={`text-[10px] font-display tracking-wider transition-all duration-200 ${isActive ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {tab.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
