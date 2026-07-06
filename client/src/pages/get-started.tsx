import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "@/components/guber-logo";
import { Send, Mic, MicOff, Volume2, VolumeX, ArrowRight } from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";
import jacFull from "@assets/Picsart_26-06-23_12-22-52-096_1782235908382.png";

interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
  signupRoute?: string;
  buttons?: Array<{ label: string; message: string }>;
}

const QUICK_OPTIONS = [
  "I need work",
  "I need help",
  "I want to sell my car",
  "I want to sell something",
  "I need my car washed",
  "I need something verified",
  "I need transport",
  "I want to earn credits",
  "I want Day-1 OG",
];

const JAC_GREETING: OnboardingMessage = {
  role: "assistant",
  content: "Hi, I'm JAC — your Job Assisting Coordinator. Tell me what you need and I'll guide you exactly where to go.",
};

export default function GetStarted() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => { if (user) navigate("/"); }, [user, navigate]);

  const [messages, setMessages] = useState<OnboardingMessage[]>([JAC_GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { speak, cancel: cancelSpeech, muted, toggleMute, supported: ttsSupported } = useSpeechOutput();
  const { listening, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => { setInput(text); });

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 60);
  }, [messages, typing]);

  useEffect(() => {
    setTimeout(() => speak(JAC_GREETING.content.replace(/GUBER/g, "Goober").replace(/Guber/g, "Goober")), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function processInput(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;

    // ── Navigation sentinels (guest D.D. sign-in invite) — handled client-side ─
    if (trimmed === "__goto_signup__") { cancelSpeech(); navigate("/signup"); return; }
    if (trimmed === "__goto_login__") { cancelSpeech(); navigate("/login"); return; }

    const userMsg: OnboardingMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setTyping(true);
    cancelSpeech();

    (async () => {
      try {
        const res = await fetch("/api/jac/onboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        const assistantMsg: OnboardingMessage = {
          role: "assistant",
          content: data.reply || "I can help with that. Which sounds closest to what you need?",
          signupRoute: typeof data.route === "string" && data.route ? data.route : undefined,
          buttons: [
            ...(Array.isArray(data.actions) ? data.actions : []),
            ...(Array.isArray(data.options) ? data.options : []),
          ].filter((b: any) => b?.label && b?.message).slice(0, 5),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!muted) speak(assistantMsg.content.replace(/GUBER/g, "Goober").replace(/Guber/g, "Goober"));
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I can help with that. Which sounds closest to what you need?",
            buttons: [
              { label: "I need work", message: "I need work" },
              { label: "I need to hire someone", message: "I need help with something" },
              { label: "I want to sell something", message: "I want to sell something" },
              { label: "Earn credits / missions", message: "I want to earn credits" },
              { label: "Day-1 OG", message: "What is Day-1 OG?" },
            ],
          },
        ]);
      } finally {
        setTyping(false);
      }
    })();
  }

  function handleSend() { processInput(input); }
  function handleChip(chip: string) { processInput(chip); }
  function handleSignup(route: string) {
    cancelSpeech();
    navigate(route);
  }

  const showInitialChips = messages.length === 1;
  const ctaLabel = (route?: string) => {
    if (!route) return null;
    if (route.startsWith("/login")) return "Log In →";
    if (route.includes("business")) return "Set Up Business Account →";
    return "Create Account →";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] right-[-5%] w-[380px] h-[380px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, hsl(270 100% 65%), transparent 65%)" }} />
        <div className="absolute bottom-[15%] left-[-8%] w-[340px] h-[340px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 60%)" }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-safe pt-4 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0"
            style={{ border: "1.5px solid hsl(270 100% 65% / 0.45)" }}
          >
            <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
          </div>
          <div>
            <p className="text-[11px] font-display font-black tracking-widest text-white uppercase leading-none">Jac</p>
            <p className="text-[9px] text-muted-foreground font-display tracking-wider leading-none mt-0.5">
              Job Assistance Coordinator
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ttsSupported && (
            <button
              onClick={toggleMute}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}
              data-testid="button-onboarding-mute"
              aria-label={muted ? "Unmute Jac" : "Mute Jac"}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <GuberLogo size="sm" />
        </div>
      </header>

      {/* ── Title + Jac hero ── */}
      <div className="relative z-10 px-5 pt-4 pb-0 flex items-end justify-between overflow-hidden">
        <div className="pb-2">
          <h1 className="font-display font-black text-2xl text-white tracking-tight leading-tight">
            Welcome to GUBER
          </h1>
          <p className="text-sm text-muted-foreground mt-1">I'm JAC. Ask me anything.</p>
        </div>
        <img
          src={jacFull}
          alt="Jac"
          className="h-[140px] w-auto object-contain object-bottom flex-shrink-0 -mb-1"
          style={{ filter: "drop-shadow(0 4px 24px hsl(270 100% 65% / 0.35))" }}
        />
      </div>

      {/* ── Chat area ── */}
      <div ref={messagesRef} className="relative z-10 flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`onboarding-msg-${i}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 mt-0.5"
                style={{ border: "1px solid hsl(270 100% 65% / 0.4)" }}
              >
                <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
              </div>
            )}
            <div className="max-w-[82%] space-y-2 flex flex-col">
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-tr-sm font-medium text-black"
                    : "rounded-tl-sm text-white/90"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }
                    : { background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 17%)" }
                }
              >
                {msg.content}
              </div>

              {/* CTA button */}
              {msg.role === "assistant" && msg.signupRoute && ctaLabel(msg.signupRoute) && (
                <button
                  onClick={() => handleSignup(msg.signupRoute!)}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-display font-black transition-all active:scale-[0.97]"
                  style={{
                    background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
                    color: "black",
                  }}
                  data-testid={`button-onboarding-cta-${i}`}
                >
                  {ctaLabel(msg.signupRoute)}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Follow-up / disambiguation buttons */}
              {msg.role === "assistant" && msg.buttons && msg.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.buttons.map((btn) => (
                    <button
                      key={btn.label}
                      onClick={() => handleChip(btn.message)}
                      className="rounded-2xl px-3 py-1.5 text-xs font-display font-semibold transition-all active:scale-95"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.8)",
                      }}
                      data-testid={`chip-followup-${btn.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
          <div className="flex gap-2.5 justify-start" data-testid="onboarding-typing">
            <div
              className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0"
              style={{ border: "1px solid hsl(270 100% 65% / 0.4)" }}
            >
              <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
              style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 17%)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 75%)", animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 75%)", animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 75%)", animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Initial quick options grid */}
        {showInitialChips && !typing && (
          <div className="grid grid-cols-2 gap-2 pt-1" data-testid="quick-options-grid">
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => handleChip(opt)}
                className="rounded-2xl px-3.5 py-3 text-left text-xs font-display font-semibold leading-snug transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(135deg, hsl(270 100% 65% / 0.09), hsl(152 100% 44% / 0.07))",
                  border: "1px solid hsl(270 100% 65% / 0.2)",
                  color: "rgba(255,255,255,0.85)",
                }}
                data-testid={`quick-option-${opt.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Input bar ── */}
      <div
        className="relative z-10 flex-shrink-0 px-4 py-3 border-t border-white/[0.05]"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2 mb-3"
          style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(222 47% 16%)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Tell Jac what you need…"
            className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground outline-none min-h-[36px] max-h-[100px] py-1.5 px-0 leading-relaxed"
            rows={1}
            data-testid="input-dd-onboarding"
            disabled={typing}
          />

          {micSupported && (
            <button
              onClick={listening ? stopListening : startListening}
              className={`w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all ${listening ? "animate-pulse" : ""}`}
              style={{
                background: listening ? "hsl(0 80% 55%)" : "hsl(222 47% 15%)",
                color: listening ? "white" : "hsl(0 0% 45%)",
              }}
              data-testid="button-onboarding-mic"
              aria-label={listening ? "Stop listening" : "Speak"}
              disabled={typing}
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!input.trim() || typing}
            className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all duration-150 disabled:opacity-40"
            style={{
              background:
                input.trim() && !typing
                  ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))"
                  : "hsl(222 47% 15%)",
              color: input.trim() && !typing ? "black" : "hsl(0 0% 40%)",
            }}
            data-testid="button-onboarding-send"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4">
          <p className="text-xs text-muted-foreground/60">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-display font-semibold tracking-wider hover:underline"
              style={{ color: "hsl(270 100% 75%)" }}
              data-testid="link-login"
            >
              LOG IN
            </Link>
          </p>
          <span className="text-muted-foreground/30 text-[10px]">·</span>
          <Link
            href="/signup"
            className="text-xs text-muted-foreground/60 hover:text-white transition-colors"
            data-testid="link-signup-direct"
          >
            Skip to signup
          </Link>
        </div>
      </div>
    </div>
  );
}
