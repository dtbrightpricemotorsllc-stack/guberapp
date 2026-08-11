/**
 * D.D. Business Launch — Team GUBER Business Development specialist
 *
 * Route: /dd
 * Access: authenticated GUBER users only
 *
 * Flow:
 *   Not unlocked → paywall (explain $9.99 one-time, Stripe checkout)
 *   Unlocked      → Guided Chat with D.D.
 *
 * D.D. is strictly business-startup focused. For off-topic requests she
 * offers to send the user back to JAC.
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ChevronRight, Loader2, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

interface DDMessage {
  role: "user" | "assistant";
  content: string;
  links?: { label: string; url: string }[];
  costs?: CostLine[];
  badges?: string[];    // "REQUIRED" | "RECOMMENDED" | "OPTIONAL" | "NOT NEEDED"
}

interface CostLine {
  label: string;
  amount: string;         // e.g. "$50" or "Free"
  category: "pay_now" | "can_wait" | "optional" | "recurring";
  badge: string;          // REQUIRED | RECOMMENDED | OPTIONAL | NOT NEEDED
  feeType?: string;       // "Government fee" | "Third-party fee" | "GUBER fee"
  freeAlt?: boolean;
}

interface DDStatus {
  unlocked: boolean;
}

// ── Paywall screen ────────────────────────────────────────────────────────────

function DDPaywall({ onPurchase, isPurchasing }: { onPurchase: () => void; isPurchasing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-black text-amber-500">D</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1">D.D. Business Launch</h1>
        <p className="text-sm text-muted-foreground">Team GUBER · Business Development</p>
      </div>

      {/* Price */}
      <div className="w-full bg-amber-500 text-black rounded-2xl p-5 text-center mb-6">
        <div className="text-4xl font-black mb-1">$9.99</div>
        <div className="text-sm font-semibold">One-time · Permanent access</div>
        <div className="text-xs mt-1 opacity-80">Tied to your GUBER account</div>
      </div>

      {/* Why Guided Chat */}
      <div className="w-full bg-muted/50 rounded-xl p-4 mb-6 border border-border">
        <h3 className="font-semibold text-sm mb-2">Why Guided Chat?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Starting a business involves official links, government fees, filing deadlines, and steps
          you'll want to come back to. D.D. keeps everything visible — click a link, complete a step,
          and come right back where you left off.
        </p>
      </div>

      {/* Benefits */}
      <div className="w-full mb-6">
        <h3 className="font-semibold text-sm mb-3">What you get</h3>
        <ul className="space-y-2">
          {[
            "Step-by-step business setup — one step at a time",
            "Official government links (IRS, Secretary of State, and more)",
            "Location-specific guidance — federal, state, county, and city",
            "Estimated startup cost breakdown",
            "Pay Now vs. Can Wait — know what's urgent",
            "Required vs. Optional — no unnecessary spending",
            "Recurring and future expense forecast",
            "Plain-English explanations — no legal jargon",
            "Free alternative flagged when available",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Safety note */}
      <div className="w-full bg-muted/30 rounded-lg p-3 mb-6 text-xs text-muted-foreground flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          D.D. does not ask for your SSN, card number, bank password, or tax returns.
          Sensitive information goes directly to the official government service — D.D. guides, never collects.
        </span>
      </div>

      {/* CTA */}
      <Button
        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-base h-12 rounded-xl"
        onClick={onPurchase}
        disabled={isPurchasing}
      >
        {isPurchasing ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up checkout…</>
        ) : (
          <>Unlock D.D. Business Launch — $9.99 <ChevronRight className="ml-1 h-4 w-4" /></>
        )}
      </Button>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Secure checkout via Stripe. No card info stored by GUBER.
      </p>
    </div>
  );
}

// ── Cost summary card ─────────────────────────────────────────────────────────

function CostCard({ costs }: { costs: CostLine[] }) {
  const payNow = costs.filter(c => c.category === "pay_now");
  const canWait = costs.filter(c => c.category === "can_wait");
  const optional = costs.filter(c => c.category === "optional");
  const recurring = costs.filter(c => c.category === "recurring");

  const badgeColor: Record<string, string> = {
    "REQUIRED": "bg-red-500/20 text-red-600",
    "REQUIRED FOR YOUR SITUATION": "bg-orange-500/20 text-orange-600",
    "RECOMMENDED": "bg-amber-500/20 text-amber-700",
    "OPTIONAL": "bg-blue-500/20 text-blue-600",
    "NOT NEEDED": "bg-muted text-muted-foreground line-through",
  };

  const Section = ({ title, items, color }: { title: string; items: CostLine[]; color: string }) => (
    items.length > 0 ? (
      <div className="mb-3">
        <div className={`text-xs font-bold mb-1 ${color}`}>{title}</div>
        {items.map((c, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-xs py-0.5">
            <div className="flex-1">
              <span>{c.label}</span>
              {c.feeType && <span className="text-muted-foreground ml-1">({c.feeType})</span>}
              {c.freeAlt && <span className="ml-1 text-green-600 font-medium">· Free alt available</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-medium">{c.amount}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeColor[c.badge] || "bg-muted text-muted-foreground"}`}>
                {c.badge}
              </span>
            </div>
          </div>
        ))}
      </div>
    ) : null
  );

  return (
    <div className="bg-muted/40 border border-border rounded-xl p-4 mt-2">
      <div className="text-xs font-bold text-amber-600 mb-2 uppercase tracking-wide">Estimated Startup Cost</div>
      <Section title="Pay Now" items={payNow} color="text-red-600" />
      <Section title="Can Wait" items={canWait} color="text-amber-700" />
      <Section title="Optional" items={optional} color="text-blue-600" />
      <Section title="Recurring / Future" items={recurring} color="text-muted-foreground" />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: DDMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
          <span className="text-xs font-black text-amber-600">D</span>
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? "order-1" : "order-2"}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-amber-500 text-black rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}>
          {msg.content}
        </div>

        {/* Official links */}
        {msg.links && msg.links.length > 0 && (
          <div className="mt-2 space-y-1">
            {msg.links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {l.label}
              </a>
            ))}
          </div>
        )}

        {/* Cost card */}
        {msg.costs && msg.costs.length > 0 && <CostCard costs={msg.costs} />}
      </div>
    </div>
  );
}

// ── Main Guided Chat ──────────────────────────────────────────────────────────

function DDChat() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DDMessage[]>([
    {
      role: "assistant",
      content: "Hey, I'm D.D. 👋 I'm Team GUBER's Business Development guide. Tell me what you want to start and I'll help you get there one step at a time.",
    },
  ]);
  const [step, setStep] = useState(1);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await apiRequest("POST", "/api/dd/chat", {
        messages: [
          ...messages,
          { role: "user", content: userMessage },
        ],
      });
      return response.json();
    },
    onSuccess: (data) => {
      const reply: DDMessage = {
        role: "assistant",
        content: data.content,
        links: data.links,
        costs: data.costs,
      };
      setMessages(prev => [...prev, reply]);
      setStep(prev => prev + 1);
      // Scroll to bottom
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    chatMutation.mutate(text);
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="p-1.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-sm font-black text-amber-600">D</span>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">D.D.</div>
            <div className="text-xs text-muted-foreground">Business Development · Team GUBER</div>
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          Step {step}
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start mb-3">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
              <span className="text-xs font-black text-amber-600">D</span>
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </ScrollArea>

      {/* Footer — Back to JAC */}
      <div className="border-t border-border bg-background px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground text-xs mb-2"
          onClick={() => setLocation("/")}
        >
          ← Back to JAC
        </Button>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell D.D. what business you want to start…"
            className="resize-none text-sm min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-black shrink-0 self-end h-11"
          >
            {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          D.D. is a guide, not your attorney or CPA. Always confirm requirements with official sources.
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DDLaunch() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: statusData, isLoading: statusLoading } = useQuery<DDStatus>({
    queryKey: ["/api/dd/status"],
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dd/checkout", {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: () => {
      // handled inline
    },
  });

  // Handle Stripe return: ?dd_success=1 → re-fetch status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dd_success") === "1") {
      queryClient.invalidateQueries({ queryKey: ["/api/dd/status"] });
      // Clean the URL
      window.history.replaceState({}, "", "/dd");
    }
  }, [queryClient]);

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!statusData?.unlocked) {
    return (
      <DDPaywall
        onPurchase={() => checkoutMutation.mutate()}
        isPurchasing={checkoutMutation.isPending}
      />
    );
  }

  return <DDChat />;
}
