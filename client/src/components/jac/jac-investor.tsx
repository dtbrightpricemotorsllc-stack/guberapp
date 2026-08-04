/**
 * JacInvestorPanel — Investor-mode JAC for the /investors page.
 *
 * Primary interface: ConvAI real-time voice (JacConvaiInvestorVoice).
 * Secondary: text chat via /api/jac/onboard?mode=investor.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Send, X, ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import { JacConvaiInvestorVoice } from "@/components/jac/jac-convai-voice";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

type JacMsg = {
  role: "user" | "assistant";
  content: string;
  buttons?: Array<{ label: string; message: string }>;
};

const QUICK_CHIPS = [
  { label: "What is GUBER?", message: "What is GUBER?" },
  { label: "Why does GUBER exist?", message: "Why does GUBER exist? What problem does it solve?" },
  { label: "How does GUBER make money?", message: "How does GUBER make money?" },
  { label: "Real estate & Airbnb", message: "How does GUBER work for real estate and Airbnb?" },
  { label: "See For Me", message: "Tell me about See For Me and remote presence." },
  { label: "Vehicles & transport", message: "How does GUBER handle vehicles and transportation?" },
  { label: "Why is GUBER different?", message: "Why is GUBER different from other platforms?" },
  { label: "Meet the founder", message: "Tell me about the founder and the vision." },
  { label: "View pitch deck", message: "Can I see the investor pitch deck?" },
  { label: "Connect with founder", message: "I'd like to connect directly with the founder." },
];

const GREETING: JacMsg = {
  role: "assistant",
  content: "Welcome to GUBER. I'm Jack, your Investor Assistance Coordinator. I can explain the company, answer your questions, show approved materials, and connect you with the founder. What would you like to know?",
  buttons: QUICK_CHIPS.slice(0, 4),
};

async function sendToJac(
  messages: JacMsg[],
): Promise<{ reply: string; buttons: Array<{ label: string; message: string }>; tracking?: any }> {
  const res = await fetch("/api/jac/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "investor",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  return {
    reply: data.reply || "What would you like to know about GUBER?",
    buttons: [
      ...(Array.isArray(data.actions) ? data.actions : []),
      ...(Array.isArray(data.options) ? data.options : []),
    ].filter((b: any) => b?.label && b?.message).slice(0, 8),
    tracking: data.tracking,
  };
}

// ── Text chat panel ───────────────────────────────────────────────────────────
function JacTextChat() {
  const [messages, setMessages] = useState<JacMsg[]>([GREETING]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const audioUnlocked = useRef(false);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [messages]);

  const unlockAudio = useCallback(() => {
    if (!audioUnlocked.current) { unlockAudioContext(); audioUnlocked.current = true; }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    unlockAudio();
    cancelAllJacAudio();

    const userMsg: JacMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const { reply, buttons, tracking } = await sendToJac(next);

      if (tracking?.investorLead?.complete && !leadSubmitted) {
        setLeadSubmitted(true);
        fetch("/api/investor/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...tracking.investorLead,
            conversationSummary: next.filter(m => m.role === "user").map(m => m.content).join(" | "),
          }),
        }).catch(() => {});
      }

      const aMsg: JacMsg = { role: "assistant", content: reply, buttons };
      setMessages(prev => [...prev, aMsg]);
      jacSpeak(reply, { mode: "auto" });
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Something went sideways. What would you like to know about GUBER?" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, leadSubmitted, unlockAudio]);

  return (
    <div className="flex flex-col" style={{ minHeight: 400 }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ maxHeight: 380 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              <div
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={m.role === "user"
                  ? { background: "rgba(209,0,255,0.15)", border: "1px solid rgba(209,0,255,0.25)", color: "#e8e8f0" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e8e8f0" }
                }
                data-testid={`msg-jac-investor-${i}`}
              >
                {m.content}
              </div>
              {m.buttons && m.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {m.buttons.map((b, bi) => (
                    <button
                      key={bi}
                      onClick={() => sendMessage(b.message)}
                      className="text-[11px] px-3 py-1.5 rounded-full transition active:scale-95"
                      style={{ background: "rgba(209,0,255,0.1)", border: "1px solid rgba(209,0,255,0.3)", color: "#D100FF" }}
                      data-testid={`button-jac-investor-chip-${bi}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#D100FF" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips */}
      {messages.length <= 1 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {QUICK_CHIPS.map((c, i) => (
            <button
              key={i}
              onClick={() => sendMessage(c.message)}
              className="text-[11px] px-3 py-1.5 rounded-full transition active:scale-95"
              style={{ background: "rgba(57,255,20,0.07)", border: "1px solid rgba(57,255,20,0.2)", color: "#39FF14" }}
              data-testid={`button-jac-investor-quick-${i}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <form
          className="flex items-center gap-2"
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask JAC anything about GUBER…"
            className="flex-1 h-10 px-4 rounded-xl text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e8e8f0" }}
            data-testid="input-jac-investor"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(209,0,255,0.2)", border: "1px solid rgba(209,0,255,0.4)", color: "#D100FF" }}
            data-testid="button-jac-investor-send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function JacInvestorPanel() {
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState<"voice" | "text">("voice");

  return (
    <div data-testid="jac-investor-panel">
      {/* ── Collapsed card ── */}
      {!open && (
        <div
          className="inv-card inv-card-hover cursor-pointer p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 transition-all"
          style={{ borderColor: "rgba(209,0,255,0.25)", background: "rgba(209,0,255,0.04)" }}
          onClick={() => setOpen(true)}
          data-testid="button-jac-investor-open"
        >
          {/* Portrait */}
          <div className="relative flex-shrink-0">
            <div className="rounded-2xl overflow-hidden"
              style={{ width: 100, height: 100, boxShadow: "0 0 40px rgba(209,0,255,0.35)" }}>
              <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-[#09090f]"
              style={{ boxShadow: "0 0 8px rgba(74,222,128,0.8)" }} />
          </div>

          {/* Text */}
          <div className="flex-1 text-center sm:text-left">
            <div className="text-[10px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(209,0,255,0.7)", fontFamily: "DM Mono, monospace" }}>
              Investor Assistance Coordinator
            </div>
            <div className="text-white font-extrabold text-2xl sm:text-3xl mb-1">Meet JAC</div>
            <p className="text-sm leading-relaxed" style={{ color: "#a8a8b3" }}>
              Ask about GUBER, explore the opportunity, or connect with the founder — voice or text.
            </p>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0">
            <div
              className="h-12 px-6 rounded-full text-sm font-extrabold flex items-center gap-2 transition"
              style={{ background: "rgba(209,0,255,0.15)", border: "1px solid rgba(209,0,255,0.4)", color: "#D100FF" }}
            >
              <Mic className="w-4 h-4" />
              Talk to JAC
              <ChevronDown className="w-4 h-4 ml-1" />
            </div>
          </div>
        </div>
      )}

      {/* ── Open panel ── */}
      {open && (
        <div
          className="inv-card flex flex-col"
          style={{ borderColor: "rgba(209,0,255,0.25)", background: "rgba(7,4,16,0.97)" }}
          data-testid="jac-investor-chat"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="relative flex-shrink-0">
              <div className="rounded-xl overflow-hidden w-10 h-10"
                style={{ boxShadow: "0 0 16px rgba(209,0,255,0.4)" }}>
                <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#070410]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm">JAC</div>
              <div className="text-[11px]" style={{ color: "#D100FF" }}>Investor Assistance Coordinator · Online</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition hover:bg-white/10"
              style={{ color: "#666" }}
              data-testid="button-jac-investor-close"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 px-5 pt-4 pb-2">
            <button
              onClick={() => setTab("voice")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all"
              style={tab === "voice"
                ? { background: "rgba(209,0,255,0.2)", border: "1px solid rgba(209,0,255,0.5)", color: "#D100FF" }
                : { background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#888" }
              }
              data-testid="tab-jac-investor-voice"
            >
              <Mic className="w-3.5 h-3.5" />
              Voice
            </button>
            <button
              onClick={() => setTab("text")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all"
              style={tab === "text"
                ? { background: "rgba(209,0,255,0.2)", border: "1px solid rgba(209,0,255,0.5)", color: "#D100FF" }
                : { background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#888" }
              }
              data-testid="tab-jac-investor-text"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Text
            </button>
          </div>

          {/* Voice tab */}
          {tab === "voice" && (
            <div className="flex flex-col items-center justify-center px-6 py-10 gap-6">
              <p className="text-sm text-center" style={{ color: "#a8a8b3", maxWidth: 340 }}>
                Tap the button below to start a live voice conversation with JAC, powered by ElevenLabs real-time AI.
              </p>
              <JacConvaiInvestorVoice
                label="Start Voice Conversation"
                className="text-base px-8 py-3 h-auto"
              />
              <p className="text-xs text-center" style={{ color: "#555" }}>
                Mic access required · U.S. English
              </p>
            </div>
          )}

          {/* Text tab */}
          {tab === "text" && <JacTextChat />}
        </div>
      )}
    </div>
  );
}
