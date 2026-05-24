import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { GuberLayout } from "@/components/guber-layout";
import {
  ArrowLeft, ShieldCheck, Package, Clock, CheckCircle2, XCircle,
  AlertTriangle, MessageCircle, Send, User, ChevronDown, ChevronUp, Star,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DealDetail {
  id: number;
  listingId: number;
  offerId: number;
  buyerUserId: number;
  sellerUserId: number;
  agreedPrice: number;
  status: string;
  outcomeNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  listingTitle: string;
  listingSlug: string | null;
  listingPhoto: string | null;
  listingCategory: string | null;
  buyerName: string;
  sellerName: string;
  buyerAvatarUrl: string | null;
  sellerAvatarUrl: string | null;
}

interface DealMessage {
  id: number;
  dealId: number;
  senderUserId: number;
  message: string;
  createdAt: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pending_completion: {
    label: "Awaiting Completion",
    color: "#f5a500",
    bg: "rgba(245,165,0,0.1)",
    border: "rgba(245,165,0,0.3)",
    icon: Clock,
  },
  completed: {
    label: "Completed",
    color: "#00e676",
    bg: "rgba(0,229,118,0.1)",
    border: "rgba(0,229,118,0.25)",
    icon: CheckCircle2,
  },
  buyer_backed_out: {
    label: "Buyer Backed Out",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    icon: XCircle,
  },
  seller_backed_out: {
    label: "Seller Backed Out",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    icon: XCircle,
  },
  buyer_no_show: {
    label: "Buyer No-Show",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.25)",
    icon: AlertTriangle,
  },
  seller_no_show: {
    label: "Seller No-Show",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.25)",
    icon: AlertTriangle,
  },
  mutual_cancellation: {
    label: "Mutually Cancelled",
    color: "#9ca3af",
    bg: "rgba(156,163,175,0.1)",
    border: "rgba(156,163,175,0.2)",
    icon: XCircle,
  },
};

const OUTCOME_OPTIONS = [
  {
    value: "completed",
    label: "Mark as Completed",
    desc: "Transaction went through successfully.",
    selfRole: "both",
    icon: CheckCircle2,
    color: "#00e676",
  },
  {
    value: "seller_backed_out",
    label: "Seller Backed Out",
    desc: "Seller cancelled after agreeing to the deal.",
    selfRole: "buyer",
    icon: XCircle,
    color: "#ef4444",
  },
  {
    value: "buyer_backed_out",
    label: "Buyer Backed Out",
    desc: "Buyer cancelled after agreeing to the deal.",
    selfRole: "seller",
    icon: XCircle,
    color: "#ef4444",
  },
  {
    value: "seller_no_show",
    label: "Seller No-Show",
    desc: "Seller didn't show up to the agreed meet.",
    selfRole: "buyer",
    icon: AlertTriangle,
    color: "#f97316",
  },
  {
    value: "buyer_no_show",
    label: "Buyer No-Show",
    desc: "Buyer didn't show up to the agreed meet.",
    selfRole: "seller",
    icon: AlertTriangle,
    color: "#f97316",
  },
  {
    value: "mutual_cancellation",
    label: "Mutual Cancellation",
    desc: "Both parties agreed to cancel.",
    selfRole: "both",
    icon: XCircle,
    color: "#9ca3af",
  },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function MarketplaceDeal() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [showOutcomePanel, setShowOutcomePanel] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dealId = parseInt(id!);

  const { data: deal, isLoading } = useQuery<DealDetail>({
    queryKey: ["/api/marketplace/deals", dealId],
    queryFn: () => fetch(`/api/marketplace/deals/${dealId}`).then(r => {
      if (!r.ok) throw new Error("Deal not found");
      return r.json();
    }),
    enabled: !!dealId,
    refetchInterval: deal?.status === "pending_completion" ? 15000 : false,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<DealMessage[]>({
    queryKey: ["/api/marketplace/deals", dealId, "messages"],
    queryFn: () => fetch(`/api/marketplace/deals/${dealId}/messages`).then(r => r.json()),
    enabled: !!dealId && deal?.status === "pending_completion",
    refetchInterval: deal?.status === "pending_completion" ? 8000 : false,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", `/api/marketplace/deals/${dealId}/messages`, { message: text }),
    onSuccess: () => {
      setMessage("");
      refetchMessages();
    },
    onError: (err: any) => {
      toast({ title: "Can't send message", description: err.message, variant: "destructive" });
    },
  });

  const resolveOutcome = useMutation({
    mutationFn: ({ outcome, note }: { outcome: string; note: string }) =>
      apiRequest("POST", `/api/marketplace/deals/${dealId}/outcome`, { outcome, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/deals/my"] });
      setShowOutcomePanel(false);
      setSelectedOutcome(null);
      setOutcomeNote("");
      toast({ title: "Outcome recorded", description: "Deal status has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Review query — only fetch if deal is completed
  const { data: myReview, refetch: refetchMyReview } = useQuery<any>({
    queryKey: ["/api/marketplace/deals", dealId, "review/mine"],
    queryFn: () => fetch(`/api/marketplace/deals/${dealId}/review/mine`).then(r => r.json()),
    enabled: !!dealId && !isLoading && deal?.status === "completed",
  });

  const submitReview = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/marketplace/deals/${dealId}/review`, { rating: reviewRating, comment: reviewComment.trim() || undefined }),
    onSuccess: () => {
      refetchMyReview();
      toast({ title: "Review submitted", description: "Thanks for your feedback." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate(message.trim());
  };

  const handleOutcomeSubmit = () => {
    if (!selectedOutcome) return;
    resolveOutcome.mutate({ outcome: selectedOutcome, note: outcomeNote });
  };

  if (isLoading) {
    return (
      <GuberLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </GuberLayout>
    );
  }

  if (!deal) {
    return (
      <GuberLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
          <Package className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-xl font-display font-bold">Deal Not Found</h1>
          <Button onClick={() => navigate("/marketplace")} className="premium-btn font-display">Back to Marketplace</Button>
        </div>
      </GuberLayout>
    );
  }

  const isBuyer = user?.id === deal.buyerUserId;
  const isSeller = user?.id === deal.sellerUserId;
  const myName = isBuyer ? deal.buyerName : deal.sellerName;
  const theirName = isBuyer ? deal.sellerName : deal.buyerName;
  const theirAvatar = isBuyer ? deal.sellerAvatarUrl : deal.buyerAvatarUrl;

  const statusMeta = STATUS_META[deal.status || "pending_completion"] || STATUS_META.pending_completion;
  const StatusIcon = statusMeta.icon;
  const isPending = deal.status === "pending_completion";

  // Filter outcome options to those the current user can report
  const myRole = isSeller ? "seller" : "buyer";
  const availableOutcomes = OUTCOME_OPTIONS.filter(
    o => o.selfRole === "both" || o.selfRole === myRole
  );

  return (
    <GuberLayout>
      <title>Deal — {deal.listingTitle} | GUBER</title>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          data-testid="button-back"
          onClick={() => navigate("/marketplace")}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-bold truncate">{deal.listingTitle}</p>
          <p className="text-xs text-muted-foreground">Deal #{deal.id} · {isBuyer ? "You're the buyer" : "You're the seller"}</p>
        </div>
        <span
          className="flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, color: statusMeta.color }}
        >
          <StatusIcon className="w-2.5 h-2.5" />
          {statusMeta.label}
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Deal summary card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {deal.listingPhoto && (
            <div className="h-40 bg-black overflow-hidden">
              <img src={deal.listingPhoto} alt={deal.listingTitle} className="w-full h-full object-cover opacity-80" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-0.5">
                  {deal.listingCategory || "ITEM"}
                </p>
                <h2 className="text-base font-display font-bold leading-tight">{deal.listingTitle}</h2>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">Agreed Price</p>
                <p className="text-xl font-display font-black text-primary">${deal.agreedPrice.toLocaleString()}</p>
              </div>
            </div>

            {/* Parties */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {deal.sellerAvatarUrl
                  ? <img src={deal.sellerAvatarUrl} alt={deal.sellerName} className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-3.5 h-3.5 text-primary" /></div>}
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">SELLER</p>
                  <p className="text-xs font-bold truncate">{deal.sellerName}</p>
                </div>
              </div>
              <div className="text-muted-foreground text-xs">→</div>
              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                <div className="min-w-0 text-right">
                  <p className="text-[10px] text-muted-foreground">BUYER</p>
                  <p className="text-xs font-bold truncate">{deal.buyerName}</p>
                </div>
                {deal.buyerAvatarUrl
                  ? <img src={deal.buyerAvatarUrl} alt={deal.buyerName} className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-3.5 h-3.5 text-primary" /></div>}
              </div>
            </div>
          </div>
        </div>

        {/* Resolved state */}
        {!isPending && deal.resolvedAt && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
            <div className="flex items-center gap-2 mb-1">
              <StatusIcon className="w-4 h-4" style={{ color: statusMeta.color }} />
              <span className="font-display font-bold" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
            </div>
            {deal.outcomeNote && <p className="text-muted-foreground text-xs mt-1">{deal.outcomeNote}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Resolved {new Date(deal.resolvedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        )}

        {/* Outcome resolution panel — only for pending deals */}
        {isPending && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              data-testid="button-toggle-outcome"
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-display font-bold hover:bg-white/5 transition-colors"
              onClick={() => setShowOutcomePanel(p => !p)}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Record Deal Outcome
              </span>
              {showOutcomePanel ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showOutcomePanel && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only record an outcome after the transaction has concluded. This updates both parties' reputation scores and is permanent.
                </p>
                <div className="space-y-2">
                  {availableOutcomes.map(opt => {
                    const Icon = opt.icon;
                    const selected = selectedOutcome === opt.value;
                    return (
                      <button
                        key={opt.value}
                        data-testid={`button-outcome-${opt.value}`}
                        onClick={() => setSelectedOutcome(opt.value)}
                        className="w-full text-left rounded-xl p-3 flex items-start gap-3 transition-all"
                        style={{
                          background: selected ? `${opt.color}18` : "rgba(255,255,255,0.03)",
                          border: selected ? `1.5px solid ${opt.color}60` : "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: opt.color }} />
                        <div>
                          <p className="text-sm font-display font-bold" style={{ color: selected ? opt.color : undefined }}>{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedOutcome && (
                  <div className="space-y-2">
                    <textarea
                      data-testid="input-outcome-note"
                      value={outcomeNote}
                      onChange={e => setOutcomeNote(e.target.value)}
                      placeholder="Optional note (max 300 chars)..."
                      maxLength={300}
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button
                      data-testid="button-submit-outcome"
                      className="w-full premium-btn font-display"
                      onClick={handleOutcomeSubmit}
                      disabled={resolveOutcome.isPending}
                    >
                      {resolveOutcome.isPending ? "Saving…" : "Confirm Outcome"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Gated chat — only available while deal is pending */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-bold">Deal Chat</span>
            {isPending && (
              <span className="ml-auto text-[10px] text-emerald-400 font-display font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                OPEN
              </span>
            )}
            {!isPending && (
              <span className="ml-auto text-[10px] text-muted-foreground font-display font-bold">CLOSED</span>
            )}
          </div>

          {!isPending ? (
            <div className="px-4 py-8 text-center">
              <MessageCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Chat is closed — this deal has been resolved.</p>
            </div>
          ) : (
            <>
              {/* Message list */}
              <div className="h-72 overflow-y-auto px-4 py-3 space-y-3" data-testid="chat-messages">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                    <ShieldCheck className="w-8 h-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                      Chat is now unlocked. Keep all coordination on-platform.<br />
                      <span className="text-[11px]">No phone numbers, emails, or external links.</span>
                    </p>
                  </div>
                )}
                {messages.map(msg => {
                  const isMe = msg.senderUserId === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`} data-testid={`message-${msg.id}`}>
                      <div
                        className="max-w-[78%] rounded-2xl px-3 py-2 text-sm"
                        style={isMe
                          ? { background: "rgba(57,255,20,0.15)", border: "1px solid rgba(57,255,20,0.2)" }
                          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <p className="leading-relaxed">{msg.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 text-right">{timeAgo(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-3 py-3 border-t border-white/5 flex items-end gap-2">
                <textarea
                  data-testid="input-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Message…"
                  rows={1}
                  maxLength={1000}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ maxHeight: 120, overflowY: "auto" }}
                />
                <Button
                  data-testid="button-send"
                  size="sm"
                  className="premium-btn font-display h-9 w-9 p-0 flex-shrink-0"
                  onClick={handleSend}
                  disabled={sendMessage.isPending || !message.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <div className="px-4 pb-3">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Do not share phone numbers, email addresses, or external links. Doing so will block your message.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Deal Review Prompt ── */}
        {deal.status === "completed" && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <Star className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-display font-bold">Rate Your Experience</span>
            </div>

            {myReview ? (
              /* Already reviewed */
              <div className="px-4 py-5 flex flex-col items-center gap-2 text-center">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star
                      key={n}
                      className={`w-5 h-5 ${n <= myReview.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                <p className="text-sm font-display font-bold text-foreground">Review Submitted</p>
                {myReview.comment && (
                  <p className="text-xs text-muted-foreground italic max-w-xs">"{myReview.comment}"</p>
                )}
                <p className="text-xs text-muted-foreground">Your review of {isBuyer ? "the seller" : "the buyer"} has been recorded.</p>
              </div>
            ) : (
              /* Review form */
              <div className="px-4 py-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  How was your experience with <strong>{theirName}</strong>?
                </p>

                {/* Star picker */}
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      data-testid={`button-star-${n}`}
                      onMouseEnter={() => setReviewHover(n)}
                      onMouseLeave={() => setReviewHover(0)}
                      onClick={() => setReviewRating(n)}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${n <= (reviewHover || reviewRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                      />
                    </button>
                  ))}
                </div>

                {/* Optional comment */}
                {reviewRating > 0 && (
                  <textarea
                    data-testid="input-review-comment"
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    placeholder="Optional — share what went well or what could be better…"
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}

                <Button
                  data-testid="button-submit-review"
                  className="w-full premium-btn font-display"
                  disabled={reviewRating === 0 || submitReview.isPending}
                  onClick={() => submitReview.mutate()}
                >
                  {submitReview.isPending ? "Submitting…" : reviewRating === 0 ? "Select a rating to continue" : `Submit ${reviewRating}-Star Review`}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* View listing link */}
        {deal.listingSlug && (
          <button
            data-testid="link-view-listing"
            onClick={() => navigate(`/marketplace/p/${deal.listingSlug}`)}
            className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors py-2 font-display"
          >
            View original listing →
          </button>
        )}
      </div>
    </GuberLayout>
  );
}
