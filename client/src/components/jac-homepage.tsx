import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Send, Mic, MicOff, ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import jacFull from "@assets/Picsart_26-06-23_12-22-52-096_1782235908382.png";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

interface JacMsg {
  role: "user" | "assistant";
  content: string;
  buttons?: Array<{ label: string; message: string }>;
  signupRoute?: string;
}

interface JacTracking {
  intent?: string;
  user_type?: string;
  service_requested?: string | null;
  transport_need?: boolean;
  content_creator?: boolean;
  business_owner?: boolean;
  retired?: boolean;
  zip?: string | null;
  confusing_point?: string | null;
}

const OPENING_OPTIONS = [
  { label: "I need help",           message: "I need help" },
  { label: "I need work",           message: "I need work" },
  { label: "I need money today",    message: "I need money today" },
  { label: "I want to sell something", message: "I want to sell something" },
  { label: "I need transport",      message: "I need transport" },
  { label: "I own a business",      message: "I own a business" },
  { label: "I provide services",    message: "I provide services" },
  { label: "I create content",      message: "I create content" },
  { label: "I'm retired",           message: "I'm retired" },
  { label: "I'm just exploring",    message: "I'm just exploring" },
  { label: "I'm not sure yet",      message: "I'm not sure yet" },
];

const GREETING: JacMsg = {
  role: "assistant",
  content: "What brings you to GUBER today?",
  buttons: OPENING_OPTIONS,
};

function getVisitorId(): string {
  try {
    let id = localStorage.getItem("jac_visitor_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("jac_visitor_id", id); }
    return id;
  } catch { return "anonymous"; }
}

let _interactionId: number | null = null;
let _lastTracking: JacTracking = {};

async function logInteraction(
  msgs: JacMsg[],
  extra: { intent?: string; zip?: string; converted?: boolean; userType?: string; tracking?: JacTracking } = {}
) {
  try {
    const merged: JacTracking = { ..._lastTracking, ...extra.tracking };
    const body = {
      visitorId: getVisitorId(),
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
      ...(extra.intent || merged.intent ? { intent: extra.intent ?? merged.intent } : {}),
      ...(extra.zip || merged.zip ? { zip: extra.zip ?? merged.zip } : {}),
      ...(extra.converted !== undefined ? { converted: extra.converted } : {}),
      ...(extra.userType || merged.user_type ? { userType: extra.userType ?? merged.user_type } : {}),
      ...(Object.keys(merged).length ? { tracking: merged } : {}),
      ...(_interactionId ? { id: _interactionId } : {}),
    };
    const res = await fetch("/api/jac/interaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { const d = await res.json(); if (d.id) _interactionId = d.id; }
  } catch {}
}

export function JacHomepage() {
  const [mode, setMode] = useState<"intro" | "chat">("intro");
  const [messages, setMessages] = useState<JacMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { speak, cancel: cancelSpeech, muted, supported: ttsSupported, toggleMute } = useSpeechOutput();
  const { listening, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => setInput(text));

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, [messages, typing]);

  async function processInput(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    const userMsg: JacMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setTyping(true);
    cancelSpeech();
    try {
      const res = await fetch("/api/jac/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();

      if (data.tracking && typeof data.tracking === "object") {
        _lastTracking = { ..._lastTracking, ...data.tracking };
      }

      const aMsg: JacMsg = {
        role: "assistant",
        content: data.reply || "What brings you to GUBER today?",
        signupRoute: typeof data.route === "string" && data.route ? data.route : undefined,
        buttons: [
          ...(Array.isArray(data.actions) ? data.actions : []),
          ...(Array.isArray(data.options) ? data.options : []),
        ].filter((b: any) => b?.label && b?.message).slice(0, 11),
      };

      const final = [...next, aMsg];
      setMessages(final);
      if (!muted) speak(aMsg.content);

      await logInteraction(final, {
        tracking: data.tracking,
        converted: !!aMsg.signupRoute,
      });
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "What brings you to GUBER today?",
        buttons: OPENING_OPTIONS,
      }]);
    } finally {
      setTyping(false);
    }
  }

  function openChat(initial?: string) {
    setMode("chat");
    if (initial) { setTimeout(() => processInput(initial), 120); }
    else { setTimeout(() => inputRef.current?.focus(), 120); }
  }

  function openChatMic() {
    setMode("chat");
    setTimeout(() => startListening(), 300);
  }

  const ctaLabel = (route?: string) => {
    if (!route) return null;
    if (route.startsWith("/login")) return "Log In";
    if (route.includes("business")) return "Set Up Business Account";
    return "Create Free Account";
  };

  if (mode === "intro") {
    return (
      <section className="relative z-10 px-4 sm:px-5 py-8 sm:py-12 max-w-6xl mx-auto w-full" data-testid="section-jac-homepage">
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
            border: "1px solid hsl(270 100% 65% / 0.18)",
            boxShadow: "0 8px 64px hsl(270 100% 65% / 0.07), 0 2px 20px rgba(0,0,0,0.45)",
          }}
        >
          <div className="flex flex-col md:flex-row items-center md:items-end">

            {/* JAC character */}
            <div className="flex-shrink-0 md:w-[220px] flex justify-center md:justify-start pt-6 md:pt-0 px-6 md:px-0">
              <img
                src={jacFull}
                alt="JAC"
                className="h-[180px] md:h-[240px] w-auto object-contain object-bottom"
                style={{ filter: "drop-shadow(0 0 40px hsl(270 100% 65% / 0.28))" }}
                data-testid="img-jac-hero"
              />
            </div>

            {/* Text + actions */}
            <div className="flex-1 px-5 sm:px-8 pb-8 pt-3 md:pt-10 text-center md:text-left">

              <div
                className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
                style={{ background: "hsl(270 100% 65% / 0.1)", border: "1px solid hsl(270 100% 65% / 0.25)", color: "hsl(270 100% 78%)" }}
              >
                ✦ JUST ASK JAC
              </div>

              <h2 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight">
                Hi, I'm JAC.
              </h2>
              <p className="font-display font-bold text-lg text-white/60 mt-1 mb-2">
                Your Job Assisting Coordinator.
              </p>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto md:mx-0">
                Tell me what you need and I'll guide you step by step — no account required to start.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-5">
                {micSupported && (
                  <button
                    onClick={openChatMic}
                    className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
                      color: "black",
                      boxShadow: "0 0 20px hsl(270 100% 65% / 0.3)",
                    }}
                    data-testid="button-jac-talk"
                  >
                    <Mic className="w-3.5 h-3.5" /> Talk to JAC
                  </button>
                )}
                <button
                  onClick={() => openChat()}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95"
                  style={{
                    background: "hsl(222 47% 12%)",
                    border: "1px solid hsl(270 100% 65% / 0.3)",
                    color: "hsl(270 100% 78%)",
                  }}
                  data-testid="button-jac-type"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Type to JAC
                </button>
                <Link
                  href="/get-started"
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95 no-underline"
                  style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 22%)", color: "hsl(0 0% 65%)" }}
                  data-testid="link-jac-get-started"
                >
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Quick chips — the 11 opening options */}
              <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                {OPENING_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => openChat(opt.message)}
                    className="px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-all active:scale-95 hover:border-purple-500/40"
                    style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 20%)", color: "rgba(255,255,255,0.65)" }}
                    data-testid={`chip-jac-${opt.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 px-4 sm:px-5 py-8 sm:py-12 max-w-6xl mx-auto w-full" data-testid="section-jac-chat">
      <div
        className="rounded-3xl flex flex-col"
        style={{
          background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
          border: "1px solid hsl(270 100% 65% / 0.18)",
          boxShadow: "0 8px 64px hsl(270 100% 65% / 0.07), 0 2px 20px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid hsl(222 47% 13%)" }}>
          <button
            onClick={() => setMode("intro")}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-colors flex-shrink-0"
            style={{ background: "hsl(222 47% 12%)" }}
            data-testid="button-jac-back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid hsl(270 100% 65% / 0.4)" }}>
            <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
          </div>
          <div>
            <p className="text-sm font-display font-black text-white tracking-wide leading-none">JAC</p>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider mt-0.5">Job Assisting Coordinator</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {ttsSupported && (
              <button
                onClick={toggleMute}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white transition-colors text-[10px]"
                style={{ background: "hsl(222 47% 12%)" }}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display tracking-widest"
              style={{ background: "hsl(270 100% 65% / 0.1)", border: "1px solid hsl(270 100% 65% / 0.2)", color: "hsl(270 100% 78%)" }}>
              ✦ JUST ASK JAC
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: "420px" }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`jac-msg-${i}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 mt-0.5" style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}>
                  <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="max-w-[85%] space-y-2 flex flex-col">
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm font-medium text-black" : "rounded-tl-sm text-white/90"}`}
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }
                      : { background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 20%)" }
                  }
                >
                  {msg.content}
                </div>

                {/* Signup CTA */}
                {msg.role === "assistant" && msg.signupRoute && ctaLabel(msg.signupRoute) && (
                  <Link
                    href={msg.signupRoute}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-display font-black transition-all active:scale-[0.97] no-underline"
                    style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }}
                    data-testid={`jac-cta-${i}`}
                    onClick={() => logInteraction(messages, { converted: true })}
                  >
                    {ctaLabel(msg.signupRoute)} <ArrowRight className="w-4 h-4" />
                  </Link>
                )}

                {/* Follow-up buttons / option chips */}
                {msg.role === "assistant" && msg.buttons && msg.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.buttons.map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => processInput(btn.message)}
                        className="rounded-full px-3 py-1.5 text-xs font-display font-semibold transition-all active:scale-95"
                        style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 20%)", color: "rgba(255,255,255,0.8)" }}
                        data-testid={`jac-btn-${btn.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                        disabled={typing}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex gap-2.5 justify-start" data-testid="jac-typing">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}>
                <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 20%)" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-5 pb-5 pt-3 flex-shrink-0" style={{ borderTop: "1px solid hsl(222 47% 13%)" }}>
          <div className="flex items-end gap-2 rounded-2xl px-3 py-2" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 16%)" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); processInput(input); } }}
              placeholder="Tell JAC what you need…"
              className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground outline-none min-h-[36px] max-h-[100px] py-1.5 px-0 leading-relaxed"
              rows={1}
              disabled={typing}
              data-testid="input-jac-homepage"
            />
            {micSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                className={`w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all ${listening ? "animate-pulse" : ""}`}
                style={{ background: listening ? "hsl(0 80% 55%)" : "hsl(222 47% 15%)", color: listening ? "white" : "hsl(0 0% 45%)" }}
                data-testid="button-jac-mic"
                disabled={typing}
                aria-label={listening ? "Stop" : "Speak"}
              >
                {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={() => processInput(input)}
              disabled={!input.trim() || typing}
              className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all disabled:opacity-40"
              style={{
                background: input.trim() && !typing ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" : "hsl(222 47% 15%)",
                color: input.trim() && !typing ? "black" : "hsl(0 0% 40%)",
              }}
              data-testid="button-jac-send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-2 font-display tracking-wide">
            JUST ASK JAC · Free to start · No account needed to chat
          </p>
        </div>
      </div>
    </section>
  );
}
