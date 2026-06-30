import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, Mic, MicOff, Volume2, VolumeX, ChevronRight, X, Navigation, ClipboardList,
  Target, TrendingUp, Zap,
} from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import { saveListingPrefill, clearListingPrefill } from "@/lib/jac-listing-prefill";
import { useAuth } from "@/lib/auth-context";
import {
  saveJacSessionDraft,
  getJacSessionDraft,
  clearJacSessionDraft,
  applyJacSessionDraft,
  getIntentLabel,
} from "@/lib/jac-session";
import { extractAndSaveMemory } from "@/lib/jac-memory";
import { useJacContext, useJacOpportunities } from "@/lib/use-jac-context";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

const DD_PATTERNS = [
  /\$\s*\d+.{0,40}by\s+(today|tonight|tomorrow|friday|saturday|sunday|monday|tuesday|wednesday|thursday|next week|end of (week|day)|this weekend|midnight|eod)/i,
  /\b(need|want|make|earn|get)\b.{0,25}\$\s*\d+\b.{0,40}\b(by|before|this|tonight|tomorrow|end of|in)\b/i,
  /\bhow\s+(can|do)\s+i\s+(make|earn).{0,25}\$\s*\d+/i,
  /\b(earning|financial)\s+goal\b/i,
  /\bdestination\s+determination\b/i,
  /\bi\s+need\s+\$\s*\d+/i,
  /\bi\s+want\s+to\s+earn\s+\$\s*\d+/i,
  /\bset\s+(a|an|my)\s+(earning|income|money)\s+goal\b/i,
];

function hasDDIntent(text: string): boolean {
  return DD_PATTERNS.some(p => p.test(text));
}

type DDPlanItem = {
  type: string;
  id?: number;
  title: string;
  estimatedPay: number;
  route: string;
  urgency: string;
  actionLabel: string;
  estimatedTime?: string;
  notes?: string;
};

interface Message {
  role: "user" | "assistant";
  content: string;
  route?: string | null;
  actions?: Array<{ label: string; message: string; route?: string }>;
  planItems?: DDPlanItem[];
  isDDPlan?: boolean;
  ddGoalAmount?: number;
  ddDeadline?: string | null;
  ddEarnedSoFar?: number;
}

const DD_GREETING =
  "Welcome to GUBER — the land of opportunities. I'm JAC, your Job Assisting Coordinator. What brings you to GUBER?";
const SESSION_KEY = "jac_v1_messages";
const SEEN_KEY = "jac_v1_seen";
const FAB_HINT_KEY = "jac_fab_hint_shown";

const LISTING_PATTERNS = [
  /\bstart a listing\b/i,
  /\b(sell|selling|list|post)\b.{0,50}\b(car|truck|vehicle|motorcycle|suv|van|boat|rv|trailer|auto|bike)\b/i,
  /\b(sell|selling|list|post)\b.{0,50}\b(house|home|property|apartment|apt|condo|room|rental|place)\b/i,
  /\b(sell|selling|list|post)\b.{0,50}\b(phone|laptop|computer|tablet|tv|furniture|electronics|item|stuff|things|equipment|tool|watch|camera)\b/i,
  /\b(post|add|create)\s+a?\s*(load|cargo|freight|shipment)\b/i,
  /\b(sell my|list my|post my)\b/i,
  /\b(I want to sell|I'm selling|selling my|I need to sell|looking to sell)\b/i,
  /\b(got a|have a|I have)\b.{0,30}\b(for sale|to sell)\b/i,
  // job / hiring patterns
  /\b(hire|hiring|need)\b.{0,40}\b(someone|a worker|a helper|help|a person|somebody)\b/i,
  /\b(post|create|add)\b.{0,20}\b(a job|my job|a gig|a task)\b/i,
  /\bneed (help with|someone to|a hand with)\b/i,
  /\b(looking for|need)\b.{0,30}\b(lawn|cleaning|mowing|moving|plumber|handyman|electrician|painter|cleaner|pet sitter|dog walker|delivery|driver)\b/i,
  /\bI (want|need) (to hire|to find a worker|to post a job)\b/i,
];

function hasListingIntent(text: string): boolean {
  return LISTING_PATTERNS.some((p) => p.test(text));
}

const INITIAL_CHIPS = [
  "I need $500 by Friday",
  "Find work nearby",
  "Hire help",
  "Earn credits",
  "Cash Drops",
  "Day-1 OG",
  "Verify & Inspect",
  "Transport / Load Board",
  "Start a listing",
];

function loadMessages(): Message[] {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Message[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [{ role: "assistant", content: DD_GREETING }];
}

function loadSeen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

type StoreState = { open: boolean; hasSavedThread: boolean; seen: boolean };
const store: StoreState = { open: false, hasSavedThread: false, seen: loadSeen() };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function patchStore(p: Partial<StoreState>) { Object.assign(store, p); emit(); }
function useAssistantStore(): StoreState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return store;
}

export function useGuberAssistantOpen(): boolean { return useAssistantStore().open; }
export function setGuberAssistantOpen(open: boolean) { if (open) markSeen(); patchStore({ open }); }
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
  patchStore({ seen: true });
}

// ── Header trigger button (used in guber-layout header) ─────────────────────
export function GUBERAssistantHeaderButton() {
  const s = useAssistantStore();
  const showBadge = s.hasSavedThread && !s.seen && !s.open;
  return (
    <button
      type="button"
      onClick={() => { markSeen(); patchStore({ open: true }); }}
      className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.04] active:scale-95"
      aria-label={showBadge ? "Open Jac (saved conversation)" : "Open Jac"}
      data-testid="button-guber-assistant"
    >
      <span
        className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
        style={{ boxShadow: "0 2px 10px hsl(270 100% 65% / 0.45), 0 1px 4px rgba(0,0,0,0.35)" }}
      >
        <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
      </span>
      {showBadge && (
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full pointer-events-none"
          style={{
            background: "hsl(152 100% 44%)",
            border: "2px solid hsl(222 47% 7%)",
            boxShadow: "0 0 6px hsl(152 100% 44% / 0.85)",
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ── Floating Jac bubble (FAB, rendered in guber-layout) ─────────────────────
export function DDFloatingButton() {
  const s = useAssistantStore();
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem(FAB_HINT_KEY) !== "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => {
      setShowHint(false);
      try { localStorage.setItem(FAB_HINT_KEY, "1"); } catch {}
    }, 4000);
    return () => clearTimeout(t);
  }, [showHint]);

  if (s.open) return null;
  return (
    <div
      className="fixed z-[150]"
      style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))", right: "16px" }}
    >
      {showHint && (
        <div
          className="absolute bottom-16 right-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-display font-semibold text-white animate-fade-in mb-1"
          style={{ background: "hsl(270 100% 65% / 0.95)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          I'm always here — just tap!
        </div>
      )}
      <button
        type="button"
        onClick={() => { markSeen(); patchStore({ open: true }); }}
        className="w-14 h-14 rounded-full overflow-hidden transition-all active:scale-95"
        style={{
          boxShadow: "0 4px 24px hsl(270 100% 65% / 0.55), 0 2px 8px rgba(0,0,0,0.6)",
          border: "2px solid hsl(270 100% 65% / 0.6)",
        }}
        data-testid="button-dd-floating"
        aria-label="Open Jac"
      >
        <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
      </button>
    </div>
  );
}

// ── Main Jac Sheet ──────────────────────────────────────────────────────────
export function GUBERAssistant() {
  const s = useAssistantStore();
  const { user } = useAuth();
  const userRef = useRef<typeof user>(null as any);
  useEffect(() => { userRef.current = user; }, [user]);
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [listingMode, setListingMode] = useState(false);
  const [listingCollected, setListingCollected] = useState<Record<string, any>>({});
  const [listingType, setListingType] = useState("");
  const [listingRoute, setListingRoute] = useState("");
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastUserInputRef = useRef("");

  const { data: jacContext } = useJacContext(!!user && s.open);
  const { data: jacOpportunities } = useJacOpportunities(!!user && s.open);

  const briefingInjectedRef = useRef(false);

  // ── "jac:prefill" — quick-action chips pre-load a message ──
  useEffect(() => {
    function onPrefill(e: Event) {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg) return;
      setInput(msg);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
    window.addEventListener("jac:prefill", onPrefill);
    return () => window.removeEventListener("jac:prefill", onPrefill);
  }, []);

  const { cancel: cancelSpeech, muted, toggleMute, supported: ttsSupported } =
    useSpeechOutput();

  // Auto-send when mic result arrives — no send button tap needed
  const { listening, transcribing, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => doSend(text));

  // Wake word listener — "Hey JAC" opens the panel and starts listening
  useEffect(() => {
    function onWake() {
      if (!store.open) {
        markSeen();
        patchStore({ open: true });
      }
      setTimeout(() => startListening(), 400);
    }
    window.addEventListener("jac:wake", onWake);
    return () => window.removeEventListener("jac:wake", onWake);
  }, [startListening]);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch {}
    patchStore({ hasSavedThread: messages.length > 1 });
  }, [messages]);

  useEffect(() => {
    if (!s.open) return;
    const el = messagesRef.current;
    if (!el) return;
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 80);
  }, [messages, s.open]);

  // Speak greeting + personalise for returning users on first open
  useEffect(() => {
    if (!s.open) return;
    if (messages.length !== 1) return; // already has a thread
    unlockAudioContext();

    // ── Resume pending pre-login draft for newly logged-in users ──────────
    if (userRef.current) {
      const pending = getJacSessionDraft();
      if (pending) {
        const route = applyJacSessionDraft(pending);
        clearJacSessionDraft();
        const label = getIntentLabel(pending);
        const resumeContent = `Welcome back! I saved your ${label} from before you signed in. Tap "Continue" and I'll take you straight there — all your info is ready.`;
        const resumeMsg: Message = {
          role: "assistant",
          content: resumeContent,
          route,
          actions: [{ label: "Continue where I left off", message: "__resume__" }],
        };
        setMessages(prev => [...prev, resumeMsg]);
        jacSpeak(resumeContent, { muted });
        return;
      }
    }

    const returning = localStorage.getItem("jac_returning") === "1";
    if (!returning) {
      // First-time visitor — speak the greeting immediately
      setTimeout(() => jacSpeak(DD_GREETING, { muted }), 300);
      return;
    }
    fetch("/api/jac/updates")
      .then((r) => r.json())
      .then((data: { loggedIn: boolean; firstName?: string | null; workerActive?: number; hirerOpen?: number; unreadNotifs?: number; walletBalance?: number }) => {
        const name = data.firstName ? `, ${data.firstName}` : "";
        const parts: string[] = [];
        if ((data.workerActive ?? 0) > 0) parts.push(`${data.workerActive} active job${data.workerActive! > 1 ? "s" : ""} in progress`);
        if ((data.hirerOpen ?? 0) > 0) parts.push(`${data.hirerOpen} open job${data.hirerOpen! > 1 ? "s" : ""} you posted`);
        if ((data.unreadNotifs ?? 0) > 0) parts.push(`${data.unreadNotifs} new notification${data.unreadNotifs! > 1 ? "s" : ""}`);
        if ((data.walletBalance ?? 0) > 0) parts.push(`$${(data.walletBalance!).toFixed(2)} in your wallet`);
        let content: string;
        if (parts.length === 0) content = `Welcome back${name}! Good to see you. What can I help you with?`;
        else if (parts.length === 1) content = `Welcome back${name}! Quick update — ${parts[0]}. What else can I help you with?`;
        else { const last = parts.pop(); content = `Welcome back${name}! Quick update — ${parts.join(", ")} and ${last}. What can I help you with?`; }
        // Don't overwrite if briefing already injected (briefingInjectedRef set synchronously before its fetch)
        if (!briefingInjectedRef.current) setMessages([{ role: "assistant", content }]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.open]);

  // Reset briefing ref on close so the server-side daily gate is re-checked on next open
  useEffect(() => {
    if (!s.open) briefingInjectedRef.current = false;
  }, [s.open]);

  // ── Morning briefing injection ─────────────────────────────────────────────
  // Server gates by calendar day per user (jac_memory system/last_briefing_date).
  // Returns null if already shown today — we replace the default greeting with the briefing.
  useEffect(() => {
    if (!s.open || !user || briefingInjectedRef.current) return;
    briefingInjectedRef.current = true;
    fetch("/api/jac/briefing")
      .then(r => r.json())
      .then((data: { text: string | null; chips: Array<{ label: string; message: string }> }) => {
        if (!data.text) return;
        // Replace the greeting entirely — briefing IS the first message
        setMessages(prev => {
          if (prev.length !== 1 || prev[0].role !== "assistant") return prev;
          return [{ role: "assistant", content: data.text!, actions: data.chips || [] }];
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.open, user]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/ai/guber-assist", {
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      });
      const data = await res.json();
      return data as { reply: string; confidence?: string; route?: string | null; actions?: Array<{ label: string; message: string }>; options?: Array<{ label: string; message: string }> };
    },
    onSuccess: (data) => {
      const msg: Message = {
        role: "assistant",
        content: data.reply ?? "I'm having trouble right now — please try again.",
        route: typeof data.route === "string" ? data.route : null,
        actions: [
          ...(Array.isArray(data.actions) ? data.actions : []),
          ...(Array.isArray(data.options) ? data.options : []),
        ].filter((a: any) => a?.label && a?.message).slice(0, 5),
      };
      setMessages((prev) => [...prev, msg]);
      if (!muted) jacSpeak(msg.content, { muted });
      if (userRef.current && lastUserInputRef.current) {
        extractAndSaveMemory(lastUserInputRef.current, msg.content);
      }
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment." },
      ]);
    },
  });

  const listingMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/jac/listing-collect", {
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
        listingType: listingType || undefined,
      });
      const data = await res.json();
      return data as { reply: string; actions?: Array<{ label: string; message: string }>; collected: Record<string, any>; ready: boolean; listingType: string; route: string };
    },
    onSuccess: (data) => {
      const newCollected = { ...listingCollected, ...(data.collected || {}) };
      setListingCollected(newCollected);
      if (data.listingType) setListingType(data.listingType);
      if (data.route) setListingRoute(data.route);

      const msg: Message = {
        role: "assistant",
        content: data.reply ?? "Tell me more…",
        actions: Array.isArray(data.actions) ? data.actions.filter((a: any) => a?.label && a?.message).slice(0, 4) : [],
      };
      setMessages((prev) => [...prev, msg]);
      if (!muted) jacSpeak(msg.content, { muted });

      if (data.ready && data.route) {
        // Always write the prefill so forms have data whether or not user is logged in
        if (data.listingType === "job") {
          try {
            localStorage.setItem("jac_job_prefill", JSON.stringify({
              category: newCollected.category || "",
              serviceType: newCollected.serviceType || newCollected.service_type || "",
              descriptionSeed: newCollected.descriptionSeed || newCollected.description || "",
              budgetHint: newCollected.budget ? Number(newCollected.budget) : null,
              zip: newCollected.zip || "",
            }));
          } catch {}
        } else {
          saveListingPrefill({
            type: data.listingType as any,
            collected: newCollected,
            route: data.route,
          });
        }

        // ── Not logged in: save session draft + show auth prompt ──────────
        if (!userRef.current) {
          saveJacSessionDraft({
            intent: (data.listingType as any) || "general",
            listingType: data.listingType || "",
            collected: newCollected,
            route: data.route,
            messages: [],
            source: "jac",
          });
          const savedMsg: Message = {
            role: "assistant",
            content: "I saved everything you told me. After you sign in, I'll continue right where we left off — no starting over. Ready?",
            actions: [
              { label: "Sign up — it's free", message: "__goto_signup__" },
              { label: "Sign in", message: "__goto_login__" },
            ],
          };
          setMessages(prev => [...prev, savedMsg]);
          jacSpeak(savedMsg.content, { muted });
          return; // do NOT navigate — user isn't logged in
        }

        // ── Logged in: navigate immediately ────────────────────────────────
        setTimeout(() => {
          patchStore({ open: false });
          cancelSpeech();
          navigate(data.route);
          setListingMode(false);
          setListingCollected({});
          setListingType("");
          setListingRoute("");
        }, 1400);
      }
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment." },
      ]);
    },
  });

  const ddMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/jac/dd/plan", { message: text });
      const data = await res.json();
      return data as {
        goalId?: number;
        goalAmount: number;
        deadline: string | null;
        earnedSoFar: number;
        remaining: number;
        planItems: DDPlanItem[];
        reply: string;
        actions: Array<{ label: string; message: string; route?: string }>;
      };
    },
    onSuccess: (data) => {
      const msg: Message = {
        role: "assistant",
        content: data.reply ?? "Here are some options that could help.",
        isDDPlan: true,
        planItems: data.planItems ?? [],
        ddGoalAmount: data.goalAmount,
        ddDeadline: data.deadline,
        ddEarnedSoFar: data.earnedSoFar,
        actions: (data.actions ?? []).slice(0, 4),
      };
      setMessages(prev => [...prev, msg]);
      if (!muted) jacSpeak(msg.content, { muted });
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "assistant", content: "I couldn't pull up options right now — please try again." }]);
    },
  });

  const anyPending = sendMutation.isPending || listingMutation.isPending || ddMutation.isPending;

  function exitListingMode() {
    setListingMode(false);
    setListingCollected({});
    setListingType("");
    setListingRoute("");
    clearListingPrefill();
  }

  function doSend(text: string) {
    // Navigation sentinels — handled client-side, not sent to AI
    if (text === "__goto_signup__") {
      patchStore({ open: false });
      cancelSpeech();
      cancelAllJacAudio();
      navigate("/signup");
      return;
    }
    if (text === "__goto_login__") {
      patchStore({ open: false });
      cancelSpeech();
      cancelAllJacAudio();
      navigate("/login");
      return;
    }
    if (text === "__resume__") return; // route button on the message handles it

    // STT sentinels — show actionable feedback rather than silently doing nothing
    if (text === "__mic_denied__") {
      const platform = (typeof window !== "undefined" && (window as any).Capacitor?.getPlatform?.()) ?? "web";
      const guide = platform === "android"
        ? "Microphone is blocked. To fix it: open your phone's Settings app → Apps → tap the three-dot menu (⋮) or search for GUBER → App info → Permissions → Microphone → set to Allow. Then come back and try again."
        : platform === "ios"
          ? "Microphone access is blocked. Go to Settings → Privacy & Security → Microphone → GUBER and turn it on, then try again."
          : "Microphone access was denied. Please allow microphone access in your browser settings, then try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: guide }]);
      jacSpeak(guide, { muted });
      return;
    }
    if (text === "__whisper_empty__") {
      const msg = "I didn't catch that — tap the mic and try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      jacSpeak(msg, { muted });
      return;
    }
    if (text === "__whisper_error__" || text === "__mic_error__") {
      const msg = "Something went wrong with voice — please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      jacSpeak(msg, { muted });
      return;
    }
    unlockAudioContext();
    const trimmed = text.trim();
    if (!trimmed || anyPending) return;
    lastUserInputRef.current = trimmed;
    const newMsgs: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(newMsgs);
    setInput("");
    cancelSpeech();
    cancelAllJacAudio();
    if (hasDDIntent(trimmed)) {
      ddMutation.mutate(trimmed);
    } else if (listingMode || hasListingIntent(trimmed)) {
      if (!listingMode) setListingMode(true);
      listingMutation.mutate(newMsgs);
    } else {
      sendMutation.mutate(newMsgs);
    }
  }

  function handleSend() { doSend(input); }
  function handleChip(chip: string) { doSend(chip); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleRoute(route: string) {
    patchStore({ open: false });
    cancelSpeech();
    cancelAllJacAudio();
    navigate(route);
  }

  const showInitialChips = messages.length === 1 && !sendMutation.isPending;
  const isOnlyGreeting = messages.length === 1;

  return (
    <Sheet
      open={s.open}
      onOpenChange={(v) => {
        patchStore({ open: v });
        if (!v) cancelSpeech();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-[88vh] p-0 rounded-t-3xl border-0 flex flex-col"
        style={{ background: "hsl(222 47% 5%)", borderTop: "1px solid hsl(270 100% 65% / 0.2)" }}
      >
        {/* ── Header ── */}
        <SheetHeader className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/[0.05]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0"
                style={{ border: "1.5px solid hsl(270 100% 65% / 0.4)" }}
              >
                <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
              </div>
              <div>
                <SheetTitle className="text-left text-base font-display font-black text-white tracking-tight">
                  JAC
                </SheetTitle>
                <p className="text-[10px] text-muted-foreground font-display tracking-wider">
                  Job Assisting Coordinator
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {ttsSupported && (
                <button
                  onClick={toggleMute}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                  data-testid="button-dd-mute"
                  aria-label={muted ? "Unmute Jac" : "Mute Jac"}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => {
                  patchStore({ open: false });
                  cancelSpeech();
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                style={{ background: "rgba(255,255,255,0.04)" }}
                data-testid="button-dd-close"
                aria-label="Close Jac"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </SheetHeader>

        {/* ── Live Intelligence Panel (pending actions + opportunities) ── */}
        {user && s.open && !alertsDismissed && jacOpportunities && jacOpportunities.length > 0 && (() => {
          const actions = jacOpportunities.filter(o => o.type === "pending_action");
          const opps = jacOpportunities.filter(o => o.type !== "pending_action");
          return (
            <div className="flex-shrink-0 mx-3 mt-3 space-y-2">
              {actions.length > 0 && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(222 47% 18%)" }}
                >
                  <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid hsl(222 47% 15%)" }}>
                    <span className="text-[10px] font-display font-black tracking-wider text-muted-foreground uppercase">
                      Needs Your Attention
                    </span>
                    <button
                      onClick={() => setAlertsDismissed(true)}
                      className="text-muted-foreground hover:text-white transition-colors"
                      aria-label="Dismiss alerts"
                      data-testid="button-jac-alerts-dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="divide-y" style={{ borderColor: "hsl(222 47% 14%)" }}>
                    {actions.map((opp, i) => (
                      <button
                        key={i}
                        onClick={() => { patchStore({ open: false }); navigate(opp.route); }}
                        className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
                        data-testid={`button-jac-alert-${i}`}
                      >
                        <span
                          className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: opp.urgency === "high" ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)" }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white/90 leading-tight truncate">{opp.title}</p>
                          {opp.subtitle && <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">{opp.subtitle}</p>}
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 ml-auto" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {opps.length > 0 && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(270 100% 65% / 0.18)" }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: "1px solid hsl(222 47% 15%)" }}>
                    <span className="text-[10px] font-display font-black tracking-wider uppercase" style={{ color: "hsl(270 100% 65%)" }}>
                      🔍 Live Opportunities
                    </span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "hsl(222 47% 14%)" }}>
                    {opps.map((opp, i) => (
                      <button
                        key={i}
                        onClick={() => { patchStore({ open: false }); navigate(opp.route); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
                        data-testid={`button-jac-opp-${i}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white/90 leading-tight truncate">{opp.title}</p>
                          {opp.subtitle && (
                            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 truncate">{opp.subtitle}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {opp.distanceLabel && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg"
                              style={{ background: "hsl(222 47% 18%)", color: "hsl(210 40% 70%)" }}
                            >
                              {opp.distanceLabel}
                            </span>
                          )}
                          {opp.payLabel && (
                            <span
                              className="text-[10px] font-display font-bold px-1.5 py-0.5 rounded-lg"
                              style={{ background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 55%)" }}
                            >
                              {opp.payLabel}
                            </span>
                          )}
                          {opp.urgency === "high" && (
                            <span
                              className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-lg"
                              style={{ background: "hsl(0 84% 60% / 0.15)", color: "hsl(0 84% 65%)" }}
                            >
                              URGENT
                            </span>
                          )}
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Active D.D. Goal Banner ── */}
        {user && s.open && jacContext?.activeGoal && (() => {
          const g = jacContext.activeGoal!;
          const pct = Math.min(100, Math.round((g.earnedSoFar / g.goalAmount) * 100));
          const remaining = Math.max(0, g.goalAmount - g.earnedSoFar);
          return (
            <div
              className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
              style={{ background: "hsl(270 100% 65% / 0.08)", borderBottom: "1px solid hsl(270 100% 65% / 0.18)" }}
              data-testid="dd-goal-banner"
            >
              <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(270 100% 65%)" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-display font-black tracking-wider uppercase" style={{ color: "hsl(270 100% 65%)" }}>
                    Goal: ${g.goalAmount.toFixed(0)}{g.deadline ? ` by ${g.deadline}` : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground">${remaining.toFixed(2)} left</span>
                </div>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: "hsl(222 47% 16%)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "hsl(270 100% 65%)" }} />
                </div>
              </div>
              <button
                onClick={() => doSend(`I need $${remaining.toFixed(2)} more toward my goal — what options do I have?`)}
                className="text-[10px] font-display font-semibold px-2 py-1 rounded-lg flex-shrink-0 transition-colors"
                style={{ background: "hsl(270 100% 65% / 0.18)", color: "hsl(270 100% 75%)" }}
                data-testid="button-dd-update-plan"
              >
                Update
              </button>
            </div>
          );
        })()}

        {/* ── Listing Builder Banner ── */}
        {listingMode && (
          <div
            className="flex items-center justify-between px-4 py-2 flex-shrink-0"
            style={{ background: "rgba(0,229,118,0.07)", borderBottom: "1px solid rgba(0,229,118,0.18)" }}
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-display font-bold text-primary tracking-wider">
                LISTING BUILDER{listingType ? ` · ${listingType.toUpperCase()}` : ""}
              </span>
            </div>
            <button
              onClick={exitListingMode}
              className="text-[10px] font-display text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)" }}
              data-testid="button-exit-listing-mode"
            >
              Exit
            </button>
          </div>
        )}

        {/* ── Messages ── */}
        <div
          ref={messagesRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          data-testid="assistant-message-thread"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.role}-${i}`}
            >
              {msg.role === "assistant" && (
                <div
                  className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 mt-0.5"
                  style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}
                >
                  <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className={`max-w-[80%] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user" ? "rounded-tr-sm text-black font-medium" : "rounded-tl-sm text-white/90"
                  }`}
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }
                      : { background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }
                  }
                >
                  {msg.content}
                </div>

                {/* Route button */}
                {msg.role === "assistant" && msg.route && (
                  <button
                    onClick={() => handleRoute(msg.route!)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-display font-bold transition-all active:scale-[0.97]"
                    style={{
                      background: "linear-gradient(135deg, hsl(270 100% 65% / 0.15), hsl(152 100% 44% / 0.12))",
                      border: "1px solid hsl(152 100% 44% / 0.35)",
                      color: "hsl(152 100% 55%)",
                    }}
                    data-testid={`button-dd-route-${i}`}
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Take me there
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* D.D. Plan Cards */}
                {msg.role === "assistant" && msg.isDDPlan && msg.planItems && msg.planItems.length > 0 && (
                  <div className="w-full space-y-1.5 mt-1" data-testid="dd-plan-cards">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Target className="w-3.5 h-3.5" style={{ color: "hsl(270 100% 65%)" }} />
                      <span className="text-[10px] font-display font-black tracking-wider uppercase" style={{ color: "hsl(270 100% 65%)" }}>
                        Possible Options
                      </span>
                      {msg.ddGoalAmount && (
                        <span className="ml-auto text-[10px] font-display font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 55%)" }}>
                          Goal: ${msg.ddGoalAmount.toFixed(0)}
                        </span>
                      )}
                    </div>
                    {msg.planItems.map((item, k) => (
                      <button
                        key={k}
                        onClick={() => { patchStore({ open: false }); navigate(item.route); }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98]"
                        style={{
                          background: item.urgency === "high" ? "hsl(270 100% 65% / 0.08)" : "hsl(222 47% 11%)",
                          border: `1px solid ${item.urgency === "high" ? "hsl(270 100% 65% / 0.3)" : "hsl(222 47% 18%)"}`,
                        }}
                        data-testid={`dd-plan-item-${k}`}
                      >
                        <span className="text-base flex-shrink-0">{
                          item.type === "job" ? "💼" :
                          item.type === "load_board" ? "🚛" :
                          item.type === "cash_drop" ? "💰" :
                          item.type === "city_mission" ? "📍" :
                          item.type === "vi_job" ? "🔍" : "⚡"
                        }</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white/90 leading-tight truncate">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.estimatedTime && (
                              <span className="text-[10px] text-muted-foreground">{item.estimatedTime}</span>
                            )}
                            {item.notes && (
                              <span className="text-[10px] text-muted-foreground truncate">{item.notes}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          {item.estimatedPay >= 1 && (
                            <span className="text-xs font-display font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 55%)" }}>
                              ${item.estimatedPay % 1 === 0 ? item.estimatedPay.toFixed(0) : item.estimatedPay.toFixed(2)}
                            </span>
                          )}
                          {item.urgency === "high" && (
                            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "hsl(270 100% 65% / 0.2)", color: "hsl(270 100% 75%)" }}>
                              TOP
                            </span>
                          )}
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Action chips from AI */}
                {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && !msg.isDDPlan && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.actions.map((action, j) => (
                      <button
                        key={j}
                        onClick={() => action.route ? handleRoute(action.route) : handleChip(action.message)}
                        className="rounded-xl px-3 py-1.5 text-xs font-display font-semibold transition-all active:scale-95"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "rgba(255,255,255,0.8)",
                        }}
                        data-testid={`button-dd-action-${i}-${j}`}
                        disabled={sendMutation.isPending}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {anyPending && (
            <div className="flex gap-2 justify-start" data-testid="assistant-typing">
              <div
                className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0"
                style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}
              >
                <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
              </div>
              <div
                className="px-3.5 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Jac is thinking…</span>
              </div>
            </div>
          )}

          {/* Initial quick chips */}
          {showInitialChips && (
            <div className="flex flex-wrap gap-2 pt-1" data-testid="dd-initial-chips">
              {INITIAL_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChip(chip)}
                  className="rounded-2xl px-3.5 py-2 text-xs font-display font-semibold transition-all active:scale-95"
                  style={{
                    background: isOnlyGreeting
                      ? "linear-gradient(135deg, hsl(270 100% 65% / 0.12), hsl(152 100% 44% / 0.10))"
                      : "rgba(255,255,255,0.05)",
                    border: "1px solid hsl(270 100% 65% / 0.25)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                  data-testid={`chip-dd-${chip.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

        </div>

        {/* ── Input bar ── */}
        <div
          className="flex-shrink-0 px-4 py-3 border-t border-white/[0.05]"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="flex items-end gap-2 rounded-2xl px-3 py-2"
            style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(222 47% 16%)" }}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Jac what you need…"
              className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[36px] max-h-[120px] py-1.5 px-0"
              rows={1}
              data-testid="input-assistant-message"
              disabled={anyPending}
            />

            {/* Mic button */}
            {micSupported && (
              <button
                onClick={() => { unlockAudioContext(); listening ? stopListening() : startListening(); }}
                className={`w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all ${
                  listening ? "animate-pulse" : ""
                }`}
                style={{
                  background: listening
                    ? "hsl(0 80% 55%)"
                    : transcribing
                      ? "hsl(270 60% 35%)"
                      : "hsl(222 47% 15%)",
                  color: listening || transcribing ? "white" : "hsl(0 0% 45%)",
                }}
                data-testid="button-dd-mic"
                aria-label={transcribing ? "Transcribing…" : listening ? "Stop listening" : "Speak to Jac"}
                disabled={anyPending || transcribing}
              >
                {transcribing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : listening
                    ? <MicOff className="w-3.5 h-3.5" />
                    : <Mic className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={!input.trim() || anyPending}
              size="icon"
              className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-150"
              style={{
                background:
                  input.trim() && !anyPending
                    ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))"
                    : "hsl(222 47% 15%)",
                color: input.trim() && !anyPending ? "black" : "hsl(0 0% 40%)",
              }}
              data-testid="button-send-message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-2 font-display tracking-wider">
            Jac · Job Assistance Coordinator
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
