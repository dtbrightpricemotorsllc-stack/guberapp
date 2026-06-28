import { MessageSquare, Mic } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { setGuberAssistantOpen } from "@/components/guber-assistant";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

const QUICK_ACTIONS = [
  { label: "Find Work",        message: "I need work nearby" },
  { label: "Hire Help",        message: "I need help with something" },
  { label: "Sell Something",   message: "I want to sell something" },
  { label: "Need Transport",   message: "I need transport" },
  { label: "Verify Something", message: "I need something verified" },
  { label: "Earn Credits",     message: "I want to earn credits" },
  { label: "Cash Drops",       message: "Tell me about Cash Drops" },
  { label: "My Messages",      message: "Check my messages" },
];

function getContextualGreeting(name?: string | null): { greeting: string; sub: string } {
  const h = new Date().getHours();
  const first = name?.trim().split(" ")[0] ?? null;
  const suffix = first ? `, ${first}!` : "!";

  const greetings = h < 12
    ? `Good morning${suffix}`
    : h < 17
    ? `Good afternoon${suffix}`
    : `Good evening${suffix}`;

  const subs = [
    "What would you like to accomplish today?",
    "Ready to see what's new?",
    "Let's find your next best step.",
    "Nice to see you again.",
    "Your city is growing — want to see what changed?",
    "Welcome back. Want to finish where we left off?",
  ];
  const sub = subs[new Date().getDay() % subs.length];

  return { greeting: greetings, sub };
}

function openJacWith(message: string) {
  setGuberAssistantOpen(true);
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("jac:prefill", { detail: { message } }));
  }, 160);
}

export function JacDashboardCard() {
  const { user } = useAuth();
  const { greeting, sub } = getContextualGreeting(
    (user as any)?.fullName || (user as any)?.username
  );

  return (
    <div
      className="mb-4 rounded-2xl overflow-hidden animate-fade-in"
      data-testid="card-jac-dashboard"
      style={{
        background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 7%))",
        border: "1px solid hsl(270 100% 65% / 0.18)",
        boxShadow: "0 4px 32px hsl(270 100% 65% / 0.06), 0 2px 12px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0"
          style={{ border: "1.5px solid hsl(270 100% 65% / 0.4)" }}
        >
          <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-black text-white tracking-wide leading-none truncate">{greeting}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>
        </div>
        <div
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-display tracking-widest flex-shrink-0"
          style={{ background: "hsl(270 100% 65% / 0.1)", border: "1px solid hsl(270 100% 65% / 0.2)", color: "hsl(270 100% 78%)" }}
        >
          ✦ JAC
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={() => setGuberAssistantOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-display font-bold tracking-wide transition-all active:scale-95"
          style={{
            background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
            color: "black",
          }}
          data-testid="button-jac-talk-dashboard"
        >
          <Mic className="w-3.5 h-3.5" /> Talk to JAC
        </button>
        <button
          onClick={() => setGuberAssistantOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-display font-bold tracking-wide transition-all active:scale-95"
          style={{
            background: "hsl(222 47% 13%)",
            border: "1px solid hsl(270 100% 65% / 0.25)",
            color: "hsl(270 100% 78%)",
          }}
          data-testid="button-jac-type-dashboard"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Type to JAC
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ borderTop: "1px solid hsl(222 47% 12%)" }} className="px-4 pb-4">
        <p className="text-[9px] font-display tracking-widest text-muted-foreground/50 pt-3 pb-2 uppercase">Quick Actions</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => openJacWith(a.message)}
              className="px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-all active:scale-95"
              style={{
                background: "hsl(222 47% 11%)",
                border: "1px solid hsl(222 47% 19%)",
                color: "rgba(255,255,255,0.7)",
              }}
              data-testid={`chip-jac-quick-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
