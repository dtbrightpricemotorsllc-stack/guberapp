import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLogo } from "@/components/guber-logo";
import { Sparkles, Send, Mic, MicOff, Volume2, VolumeX, ChevronRight, ArrowRight } from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";

interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
  signupRoute?: string;
  chips?: string[];
}

interface IntentResult {
  reply: string;
  signupRoute?: string;
  chips?: string[];
}

function matchIntent(raw: string): IntentResult {
  const s = raw.toLowerCase().trim();

  if (/\b(need work|find work|want work|looking for work|get a job|earn money|employment|i need a job|find a job)\b/.test(s)
    || s === "i need work" || s === "work") {
    return {
      reply: "GUBER connects workers with local hirers every day. Sign up as an Individual and start browsing jobs near you right away.",
      signupRoute: "/signup?intent=worker&from=dd",
    };
  }

  if (/\b(need help|hire someone|find someone|need someone|task|errand|chore|handyman|need a worker|get help)\b/.test(s)
    || s === "i need help" || s === "post a job") {
    return {
      reply: "Verified local workers are on standby. Post a job and someone near you will respond fast. Let's create your account.",
      signupRoute: "/signup?intent=hirer&from=dd",
    };
  }

  if (/\b(sell.*car|car.*sell|vehicle|automobile|car.*list|list.*car|my car|used car|list a vehicle)\b/.test(s)
    || s === "i want to sell my car") {
    return {
      reply: "The GUBER Marketplace has built-in Verify & Inspect so buyers trust your listing. Add photos, VIN, and pricing — it takes minutes.",
      signupRoute: "/signup?intent=seller_vehicle&from=dd",
    };
  }

  if (/\b(sell|marketplace|list.*item|item.*sell|phone|electronics|furniture|sell something|selling)\b/.test(s)
    || s === "i want to sell something") {
    return {
      reply: "GUBER Marketplace gives your items verified buyer protection — more trust than generic listings. Let's get you set up.",
      signupRoute: "/signup?intent=seller&from=dd",
    };
  }

  if (/\b(wash|detail|detailing|car.*wash|clean.*car)\b/.test(s)
    || s === "i need my car washed") {
    return {
      reply: "Do you want a mobile worker to come to you, or are you looking for a local car wash shop?",
      chips: ["Mobile car wash — come to me", "Looking for a local shop", "Either works"],
    };
  }

  if (/\b(mobile.*wash|come to me|mobile detail)\b/.test(s)) {
    return {
      reply: "Perfect. You'll post a General Labor job for on-demand car washing. Sign up and GUBER routes you there.",
      signupRoute: "/signup?intent=hirer&service=car_wash&from=dd",
    };
  }

  if (/\b(local shop|local car wash|shop)\b/.test(s)) {
    return {
      reply: "Got it — GUBER's map shows verified local businesses. Sign up to browse the area and leave reviews.",
      signupRoute: "/signup?intent=hirer&from=dd",
    };
  }

  if (/\b(verify|inspect|inspection|check.*car|check.*item|check.*property|someone.*check|v&i)\b/.test(s)
    || s === "i need something verified") {
    return {
      reply: "GUBER's Verify & Inspect sends a trusted worker to physically check cars, property, or marketplace items on your behalf. Quick, affordable, reliable.",
      signupRoute: "/signup?intent=hirer&service=verify&from=dd",
    };
  }

  if (/\b(transport|tow|haul|move.*stuff|load.*board|freight|truck|cargo|shipping|need transport|load board)\b/.test(s)
    || s === "i need transport") {
    return {
      reply: "GUBER's Load Board connects cargo owners with verified carriers. Post a load or find transport fast.",
      signupRoute: "/signup?intent=transport&from=dd",
    };
  }

  if (/\b(credit|earn credit|earn.*reward|points|cash out|missions|community task)\b/.test(s)
    || s === "i want to earn credits") {
    return {
      reply: "GUBER Credits are earned by completing local missions, referring friends, and supporting the community. 1,000 credits = $1 — cashable once you hit $25.",
      signupRoute: "/signup?intent=credits&from=dd",
    };
  }

  if (/\b(day.?1|og\b|founding|original|membership|upgrade|og member)\b/.test(s)
    || s === "i want day-1 og" || s === "i want day-1 og membership") {
    return {
      reply: "Day-1 OG is GUBER's founding membership. You get a 5% platform fee instead of 10%, priority Cash Drop access, and a permanent OG badge. Lock it in early.",
      signupRoute: "/signup?intent=og&from=dd",
    };
  }

  if (/\b(business|company|employer|biz\b|enterprise|startup|for my business)\b/.test(s)) {
    return {
      reply: "GUBER Business gives companies dedicated hiring tools, team management, Scout plans, and verified worker access at scale.",
      signupRoute: "/business-signup?intent=business&from=dd",
    };
  }

  if (/\b(already.*account|have account|log in|login|sign in|returning)\b/.test(s)) {
    return {
      reply: "Welcome back! Head straight to login.",
      signupRoute: "/login",
    };
  }

  return {
    reply: "GUBER connects people who need things done with people who can do them — locally and on demand. What are you trying to accomplish?",
    chips: ["I need work", "I need help", "I want to sell something", "I want Day-1 OG"],
  };
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

const DD_GREETING: OnboardingMessage = {
  role: "assistant",
  content: "Welcome to GUBER — the Land of Opportunities. Tell Jac what you're trying to do and I'll point you exactly where you need to go.",
};

export default function GetStarted() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => { if (user) navigate("/"); }, [user, navigate]);

  const [messages, setMessages] = useState<OnboardingMessage[]>([DD_GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { speak, cancel: cancelSpeech, muted, toggleMute, supported: ttsSupported } = useSpeechOutput();
  const { listening, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => { setInput(text); });

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, [messages, typing]);

  // Speak the greeting on first load
  useEffect(() => {
    setTimeout(() => speak(DD_GREETING.content), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function processInput(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;

    const userMsg: OnboardingMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);
    cancelSpeech();

    setTimeout(() => {
      const result = matchIntent(trimmed);
      const assistantMsg: OnboardingMessage = {
        role: "assistant",
        content: result.reply,
        signupRoute: result.signupRoute,
        chips: result.chips,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setTyping(false);
      setTimeout(() => speak(result.reply), 100);
    }, 700 + Math.random() * 300);
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
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, hsl(270 100% 65% / 0.22), hsl(152 100% 44% / 0.18))",
              border: "1px solid hsl(270 100% 65% / 0.3)",
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "hsl(270 100% 75%)" }} />
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

      {/* ── Title ── */}
      <div className="relative z-10 px-5 pt-5 pb-2">
        <h1 className="font-display font-black text-2xl text-white tracking-tight leading-tight">
          Welcome to GUBER
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Tell Jac what you're trying to do.</p>
      </div>

      {/* ── Chat area ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`onboarding-msg-${i}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: "linear-gradient(135deg, hsl(270 100% 65% / 0.22), hsl(152 100% 44% / 0.18))",
                  border: "1px solid hsl(270 100% 65% / 0.3)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: "hsl(270 100% 75%)" }} />
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

              {/* Follow-up chips */}
              {msg.role === "assistant" && msg.chips && msg.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleChip(chip)}
                      className="rounded-2xl px-3 py-1.5 text-xs font-display font-semibold transition-all active:scale-95"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.8)",
                      }}
                      data-testid={`chip-followup-${chip.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {chip}
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
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, hsl(270 100% 65% / 0.22), hsl(152 100% 44% / 0.18))",
                border: "1px solid hsl(270 100% 65% / 0.3)",
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: "hsl(270 100% 75%)" }} />
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

        <div ref={bottomRef} />
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
