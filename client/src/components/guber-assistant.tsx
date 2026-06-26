import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, Mic, MicOff, Volume2, VolumeX, ChevronRight, X, Navigation,
} from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

interface Message {
  role: "user" | "assistant";
  content: string;
  route?: string | null;
  actions?: Array<{ label: string; message: string }>;
}

const DD_GREETING =
  "Welcome to GUBER — the land of opportunities. I'm JAC, your Job Assisting Coordinator. Whether you need to earn, hire, sell, or just explore — I'm here. You can minimize me anytime, but I'll always be in the bottom right corner. What can I do for you today?";
const SESSION_KEY = "jac_v1_messages";
const SEEN_KEY = "jac_v1_seen";
const FAB_HINT_KEY = "jac_fab_hint_shown";

const INITIAL_CHIPS = [
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
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const { listening, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => doSend(text));

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
        setMessages([{ role: "assistant", content }]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.open]);

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
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment." },
      ]);
    },
  });

  function doSend(text: string) {
    unlockAudioContext();
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    const newMsgs: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(newMsgs);
    setInput("");
    cancelSpeech();
    cancelAllJacAudio();
    sendMutation.mutate(newMsgs);
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

                {/* Action chips from AI */}
                {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.actions.map((action, j) => (
                      <button
                        key={j}
                        onClick={() => handleChip(action.message)}
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
          {sendMutation.isPending && (
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
              disabled={sendMutation.isPending}
            />

            {/* Mic button */}
            {micSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                className={`w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all ${
                  listening ? "animate-pulse" : ""
                }`}
                style={{
                  background: listening
                    ? "hsl(0 80% 55%)"
                    : "hsl(222 47% 15%)",
                  color: listening ? "white" : "hsl(0 0% 45%)",
                }}
                data-testid="button-dd-mic"
                aria-label={listening ? "Stop listening" : "Speak to Jac"}
                disabled={sendMutation.isPending}
              >
                {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              size="icon"
              className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-150"
              style={{
                background:
                  input.trim() && !sendMutation.isPending
                    ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))"
                    : "hsl(222 47% 15%)",
                color: input.trim() && !sendMutation.isPending ? "black" : "hsl(0 0% 40%)",
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
