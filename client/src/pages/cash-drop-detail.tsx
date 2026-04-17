import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, Clock, Trophy, Camera, AlertCircle, CheckCircle, Navigation, ChevronLeft, Car, ChevronRight, DollarSign, CreditCard, Wallet, Banknote } from "lucide-react";
import type { CashDrop, CashDropAttempt } from "@shared/schema";
import { Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    closed: "bg-muted/20 text-muted-foreground border-border/20",
    expired: "bg-muted/20 text-muted-foreground border-border/20",
    draft: "bg-muted/20 text-muted-foreground border-border/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-display tracking-widest uppercase ${styles[status] || "bg-muted/20 text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

const PAYOUT_METHODS = [
  { id: "cash_app", label: "Cash App", icon: DollarSign, placeholder: "$YourCashtag", color: "#00D632" },
  { id: "venmo", label: "Venmo", icon: Wallet, placeholder: "@username", color: "#008CFF" },
  { id: "paypal", label: "PayPal", icon: CreditCard, placeholder: "email@example.com", color: "#003087" },
  { id: "ach", label: "Bank Transfer (ACH)", icon: Banknote, placeholder: "", color: "#6B7280" },
  { id: "guber_credit", label: "GUBER Credit (20% bonus!)", icon: DollarSign, placeholder: "", color: "#22C55E" },
];

function CashDropPayoutSelector({ dropId, attempt, rewardAmount, drop }: { dropId: number; attempt: CashDropAttempt; rewardAmount: number; drop?: CashDrop }) {
  const { toast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [payoutHandle, setPayoutHandle] = useState("");
  const [bankName, setBankName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("checking");

  const payoutStatus = attempt.payoutStatus;
  const chosenMethod = attempt.payoutMethod;
  const isRewardWinner = attempt.isRewardWinner;

  // Reward winner: show redemption instructions instead of payout selector
  if (isRewardWinner || payoutStatus === "reward") {
    const redemptionInstructions = drop?.redemptionInstructions || "";
    const rewardDescription = drop?.rewardDescription || "your reward";
    const noPurchaseText = drop?.noPurchaseRequiredText || "";
    const disclaimerText = drop?.disclaimerText || "";
    return (
      <div className="rounded-2xl border border-amber-500/30 p-6 space-y-4" style={{ background: "linear-gradient(135deg, #1a0a00, #2d1200)" }}>
        <div className="text-center space-y-2">
          <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="font-display font-black text-xl text-amber-300">You Won a Sponsored Reward!</p>
          <p className="text-sm text-amber-400/70 font-medium">{rewardDescription}</p>
        </div>
        {redemptionInstructions && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-display font-black tracking-widest text-amber-400 uppercase mb-2">How to Redeem</p>
            <p className="text-sm text-amber-200/80 leading-relaxed">{redemptionInstructions}</p>
          </div>
        )}
        {drop?.brandingEnabled && drop?.sponsorName && (
          <div className="flex items-center gap-2 justify-center">
            <span className="text-[11px] text-amber-400/50 font-display">Sponsored by</span>
            <span className="text-[11px] font-display font-bold text-amber-300">{drop.sponsorName}</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/40 text-center">
          {noPurchaseText || "No purchase required. GUBER selects and verifies all winners. Sponsor does not influence outcome."}
        </p>
        {disclaimerText && (
          <p className="text-[10px] text-muted-foreground/30 text-center italic">{disclaimerText}</p>
        )}
      </div>
    );
  }

  const selectPayoutMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/cash-drops/${dropId}/select-payout-method`, {
        payoutMethod: selectedMethod,
        payoutHandle,
        bankName,
        routingNumber,
        accountNumber,
        accountType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drops", dropId] });
      toast({ title: "Payout method submitted!", description: selectedMethod === "guber_credit" ? "GUBER Credit applied to your account instantly!" : "Admin will process your payout shortly." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (payoutStatus === "paid") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 p-6 text-center space-y-3" style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }}>
        <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
        <p className="font-display font-black text-xl text-emerald-300">Payout Complete!</p>
        <p className="text-[11px] text-emerald-400/60 leading-relaxed">
          Your reward of <strong className="text-emerald-300">${rewardAmount?.toFixed(2)}</strong> has been sent via <span className="capitalize">{chosenMethod?.replace("_", " ")}</span>.
        </p>
      </div>
    );
  }

  if (chosenMethod && payoutStatus === "payout_method_selected") {
    return (
      <div className="rounded-2xl border border-amber-500/30 p-6 text-center space-y-3" style={{ background: "linear-gradient(135deg, #1a0a00, #2d1200)" }}>
        <Clock className="w-10 h-10 text-amber-400 mx-auto" />
        <p className="font-display font-black text-xl text-amber-300">Payout Pending</p>
        <p className="text-[11px] text-amber-400/60 leading-relaxed">
          Your <strong className="text-amber-300">${rewardAmount?.toFixed(2)}</strong> reward is being sent via <span className="capitalize text-amber-300">{chosenMethod?.replace("_", " ")}</span>. You'll be notified when it lands.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 p-5 space-y-4" style={{ background: "linear-gradient(135deg, #1a0a00, #2d1200)" }}>
      <div className="text-center space-y-2">
        <Trophy className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="font-display font-black text-xl text-amber-300">You Won!</p>
        <p className="text-[11px] text-amber-400/60">Choose how you'd like to receive your <strong className="text-amber-300">${rewardAmount?.toFixed(2)}</strong> reward</p>
      </div>

      <div className="space-y-2">
        {PAYOUT_METHODS.map((method) => (
          <button
            key={method.id}
            onClick={() => setSelectedMethod(method.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
              selectedMethod === method.id
                ? "ring-2 ring-amber-400/50 bg-amber-500/10"
                : "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
            }`}
            data-testid={`button-payout-${method.id}`}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${method.color}20` }}>
              <method.icon className="w-4 h-4" style={{ color: method.color }} />
            </div>
            <span className="text-sm font-display font-semibold text-amber-200">{method.label}</span>
            {method.id === "guber_credit" && (
              <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">BONUS</Badge>
            )}
          </button>
        ))}
      </div>

      {selectedMethod && selectedMethod !== "ach" && selectedMethod !== "guber_credit" && (
        <div className="space-y-2">
          <label className="text-[10px] font-display font-bold tracking-widest text-amber-400/60 uppercase">
            {selectedMethod === "cash_app" ? "$Cashtag" : selectedMethod === "venmo" ? "Venmo Username" : "PayPal Email"}
          </label>
          <Input
            value={payoutHandle}
            onChange={(e) => setPayoutHandle(e.target.value)}
            placeholder={PAYOUT_METHODS.find((m) => m.id === selectedMethod)?.placeholder}
            className="bg-white/[0.05] border-amber-500/20 text-amber-200 placeholder:text-amber-400/30"
            data-testid="input-payout-handle"
          />
        </div>
      )}

      {selectedMethod === "ach" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold tracking-widest text-amber-400/60 uppercase">Bank Name</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase, Wells Fargo" className="bg-white/[0.05] border-amber-500/20 text-amber-200 placeholder:text-amber-400/30" data-testid="input-bank-name" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold tracking-widest text-amber-400/60 uppercase">Routing Number</label>
            <Input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} placeholder="9-digit routing" className="bg-white/[0.05] border-amber-500/20 text-amber-200 placeholder:text-amber-400/30" data-testid="input-routing" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold tracking-widest text-amber-400/60 uppercase">Account Number</label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" className="bg-white/[0.05] border-amber-500/20 text-amber-200 placeholder:text-amber-400/30" data-testid="input-account" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold tracking-widest text-amber-400/60 uppercase">Account Type</label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger className="bg-white/[0.05] border-amber-500/20 text-amber-200" data-testid="select-account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {selectedMethod === "guber_credit" && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-center">
          <p className="text-xs text-emerald-400 font-display">
            Get <strong>${(rewardAmount * 1.2).toFixed(2)}</strong> in GUBER Credit instead of ${rewardAmount?.toFixed(2)} cash — instant, no wait!
          </p>
        </div>
      )}

      {selectedMethod && (
        <Button
          onClick={() => selectPayoutMutation.mutate()}
          disabled={
            selectPayoutMutation.isPending ||
            (selectedMethod !== "guber_credit" && selectedMethod !== "ach" && !payoutHandle) ||
            (selectedMethod === "ach" && (!routingNumber || !accountNumber))
          }
          className="w-full h-12 font-display tracking-wider rounded-xl text-background"
          style={{ background: "linear-gradient(135deg, #d97706, #f59e0b, #d97706)" }}
          data-testid="button-confirm-payout-method"
        >
          {selectPayoutMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : selectedMethod === "guber_credit" ? "APPLY GUBER CREDIT" : "CONFIRM PAYOUT METHOD"}
        </Button>
      )}
    </div>
  );
}

export default function CashDropDetail() {
  const [, params] = useRoute("/cash-drop/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const id = parseInt(params?.id || "0");
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);

  const { data: drop, isLoading } = useQuery<CashDrop & { userAttempt: CashDropAttempt | null }>({
    queryKey: ["/api/cash-drops", id],
    queryFn: async () => {
      const res = await fetch(`/api/cash-drops/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id && !!user,
    staleTime: 0,
    refetchInterval: 15000,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/cash-drops/${id}/accept`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/cash-drops", id] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const arrivedMutation = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      const res = await apiRequest("POST", `/api/cash-drops/${id}/arrived`, {
        gpsLat: pos.coords.latitude,
        gpsLng: pos.coords.longitude,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drops", id] });
      if (data.clue) {
        toast({ title: "Arrived! Clue revealed:", description: data.clue });
      } else {
        toast({ title: "Arrived!", description: "Your arrival has been confirmed." });
      }
    },
    onError: (err: any) => toast({ title: "Not in range", description: err.message, variant: "destructive" }),
  });

  const submitProofMutation = useMutation({
    mutationFn: async () => {
      if (!gpsPos && navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition((pos) => {
            setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            resolve();
          }, () => resolve());
        });
      }
      const res = await apiRequest("POST", `/api/cash-drops/${id}/submit-proof`, {
        proofUrls: capturedPhotos,
        gpsLat: gpsPos?.lat,
        gpsLng: gpsPos?.lng,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drops", id] });
      toast({ title: "Submitted!", description: "Your proof is being reviewed by admin." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCapture = async (index: number, file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      let url = dataUrl;
      try {
        const uploadRes = await fetch("/api/upload-photo", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: dataUrl, fileName: file.name, fileType: file.type }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) url = uploadData.url;
        }
      } catch {}

      setCapturedPhotos((prev) => {
        const next = [...prev];
        next[index] = url;
        return next;
      });
      toast({ title: "Photo captured!" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </GuberLayout>
    );
  }

  if (!drop) {
    return (
      <GuberLayout>
        <div className="text-center py-20 text-muted-foreground font-display">Cash Drop not found</div>
      </GuberLayout>
    );
  }

  const attempt = drop.userAttempt;
  const proofItems = drop.proofItems || [];
  const slotsLeft = (drop.winnerLimit || 1) - (drop.winnersFound || 0);

  const isClosed = ["closed", "expired"].includes(drop.status);
  const isActive = drop.status === "active";

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider transition-colors mb-2" data-testid="button-back">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1a0a00 0%, #2d1200 50%, #1a0500 100%)",
            border: "1.5px solid rgba(245,158,11,0.35)",
          }}
        >
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.06) 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-display font-black tracking-[0.2em] text-amber-400 uppercase">⚡ GUBER CASH DROP</span>
                  {drop.isSponsored && (
                    <span className="text-[9px] font-display font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)" }}>
                      Sponsored
                    </span>
                  )}
                </div>
                <h1 className="font-display font-black text-xl text-amber-300 leading-tight">{drop.title}</h1>
              </div>
              <StatusBadge status={drop.status} />
            </div>

            {drop.description && (
              <p className="text-sm text-amber-400/60 leading-relaxed mb-4">{drop.description}</p>
            )}

            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] text-amber-400/50 font-display uppercase tracking-wider">Reward</p>
                <p className="font-display font-black text-2xl text-amber-300">${drop.rewardPerWinner?.toFixed(2)}</p>
              </div>
              <div className="h-8 w-px bg-amber-400/20" />
              <div>
                <p className="text-[10px] text-amber-400/50 font-display uppercase tracking-wider">Slots Left</p>
                <p className="font-display font-black text-2xl text-amber-300">{slotsLeft}</p>
              </div>
              {drop.gpsRadius && (
                <>
                  <div className="h-8 w-px bg-amber-400/20" />
                  <div>
                    <p className="text-[10px] text-amber-400/50 font-display uppercase tracking-wider">Radius</p>
                    <p className="font-display font-black text-sm text-amber-300">{drop.gpsRadius}m</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {drop.isSponsored && drop.brandingEnabled && drop.sponsorName && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "rgba(201,168,76,0.04)",
              border: "1px solid rgba(201,168,76,0.14)",
            }}
            data-testid="section-sponsor-strip"
          >
            {drop.sponsorLogo ? (
              <img
                src={drop.sponsorLogo}
                alt={drop.sponsorName}
                className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-black"
                style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}
              >
                {drop.sponsorName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-display font-black tracking-[0.15em] uppercase" style={{ color: "rgba(201,168,76,0.5)" }}>
                Sponsored by
              </p>
              <p className="text-xs font-display font-bold" style={{ color: "rgba(201,168,76,0.8)" }}>
                {drop.sponsorName}
              </p>
            </div>
          </div>
        )}

        {drop.isSponsored && drop.brandingEnabled && drop.rewardType !== "cash" && drop.rewardDescription && (
          <div
            className="rounded-xl px-4 py-3 space-y-1.5"
            style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}
            data-testid="section-reward-hint"
          >
            <p className="text-[9px] font-display font-black tracking-widest uppercase" style={{ color: "rgba(201,168,76,0.5)" }}>
              Sponsored Reward for Additional Winners
            </p>
            <p className="text-[11px]" style={{ color: "rgba(201,168,76,0.7)" }}>{drop.rewardDescription}</p>
            {(drop.rewardQuantity ?? 0) > 0 && (
              <p className="text-[10px]" style={{ color: "rgba(201,168,76,0.4)" }}>
                While supplies last — {drop.rewardQuantity} available
              </p>
            )}
          </div>
        )}

        {drop.isSponsored && (
          <div className="rounded-xl px-4 py-2.5 space-y-1" data-testid="section-legal-block">
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.22)" }}>
              No purchase required. GUBER selects and verifies all winners. Sponsor does not influence outcome.
            </p>
            {drop.noPurchaseRequiredText && drop.noPurchaseRequiredText !== "No purchase necessary to participate." && (
              <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.18)" }}>{drop.noPurchaseRequiredText}</p>
            )}
            {drop.disclaimerText && (
              <p className="text-[9px] italic" style={{ color: "rgba(255,255,255,0.15)" }}>{drop.disclaimerText}</p>
            )}
          </div>
        )}

        {isClosed && (
          <div className="rounded-xl border border-border/20 bg-muted/10 p-5 text-center">
            <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="font-display font-bold text-sm text-muted-foreground">This Cash Drop has ended</p>
          </div>
        )}

        {isActive && !attempt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-muted/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-display font-bold text-amber-400">How It Works</p>
              </div>
              <ol className="space-y-1.5 ml-6">
                {["Accept the Cash Drop", "Travel to the location area", "Confirm your arrival (GPS check)", ...(drop.clueRevealOnArrival ? ["Clue revealed after arrival"] : []), "Submit your proof photos", "Admin reviews and confirms winner", "Choose your payout method (Cash App, Venmo, PayPal, etc.)"].map((step, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-400/50 font-bold flex-shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className="w-full h-12 font-display tracking-wider rounded-xl text-background"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b, #d97706)" }}
              data-testid="button-accept-cash-drop"
            >
              {acceptMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "⚡ ACCEPT CASH DROP"}
            </Button>
          </div>
        )}

        {attempt?.status === "accepted" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-display font-bold text-amber-400">Get to the Location</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Travel to the drop area. When you are within <strong className="text-amber-400">{drop.gpsRadius || 200} meters</strong> of the target, tap "I Arrived" to confirm your position. Your GPS will be verified.
              </p>
            </div>

            {(drop.gpsLat && drop.gpsLng) ? (
              <div className="space-y-2">
                <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/40 uppercase px-1">Navigation</p>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${drop.gpsLat},${drop.gpsLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-2xl transition-all active:scale-[0.98]"
                  style={{ background: "rgba(66,133,244,0.10)", border: "1px solid rgba(66,133,244,0.22)" }}
                  data-testid="link-google-maps-cash-drop"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(66,133,244,0.18)" }}>
                    <Navigation className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-bold text-blue-400">Open in Google Maps</p>
                    <p className="text-xs text-muted-foreground">Turn-by-turn navigation</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-blue-400/50 flex-shrink-0" />
                </a>

                <a
                  href={`waze://?ll=${drop.gpsLat},${drop.gpsLng}&navigate=yes`}
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `waze://?ll=${drop.gpsLat},${drop.gpsLng}&navigate=yes`;
                    setTimeout(() => {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${drop.gpsLat},${drop.gpsLng}`, "_blank");
                    }, 2000);
                  }}
                  className="flex items-center gap-3 p-4 rounded-2xl transition-all active:scale-[0.98]"
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
                  data-testid="link-waze-cash-drop"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.14)" }}>
                    <Car className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-bold text-emerald-400">Open in Waze</p>
                    <p className="text-xs text-muted-foreground">Real-time traffic routing</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-400/50 flex-shrink-0" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/10 border border-white/[0.05]">
                <MapPin className="w-4 h-4 text-muted-foreground/40" />
                <p className="text-[11px] text-muted-foreground">Exact coordinates will be revealed when you get close. Head to the general area shown on the map.</p>
              </div>
            )}

            <Button
              onClick={() => arrivedMutation.mutate()}
              disabled={arrivedMutation.isPending}
              className="w-full h-12 font-display tracking-wider rounded-xl"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b, #d97706)", color: "#000" }}
              data-testid="button-i-arrived"
            >
              {arrivedMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "📍 I ARRIVED"}
            </Button>
          </div>
        )}

        {attempt?.status === "arrived" && (
          <div className="space-y-4">
            {drop.clueText && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
                <p className="text-[10px] font-display font-bold tracking-widest text-amber-400/70 uppercase mb-2">Clue</p>
                <p className="text-sm text-amber-300 font-display font-semibold leading-relaxed">{drop.clueText}</p>
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-muted/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                <p className="text-sm font-display font-bold">Submit Your Proof</p>
              </div>
              {proofItems.length === 0 ? (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2">Capture at least one photo as proof</p>
                  <label className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-primary/30 cursor-pointer hover:border-primary/50 transition-colors" data-testid="label-capture-photo">
                    <Camera className="w-4 h-4 text-primary" />
                    <span className="text-sm text-primary font-display">{capturedPhotos[0] ? "Re-take Photo" : "Take Photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture={drop.requireInAppCamera ? "environment" : undefined}
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleCapture(0, e.target.files[0])}
                    />
                  </label>
                  {capturedPhotos[0] && (
                    <img src={capturedPhotos[0]} className="mt-2 rounded-lg w-full object-cover max-h-40" alt="proof" />
                  )}
                </div>
              ) : (
                proofItems.map((item, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium">{item.label}</p>
                    <label className={`flex items-center gap-2 p-3 rounded-xl border border-dashed cursor-pointer transition-colors ${capturedPhotos[i] ? "border-primary/50 bg-primary/5" : "border-white/10 hover:border-primary/30"}`} data-testid={`label-proof-item-${i}`}>
                      {capturedPhotos[i] ? <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" /> : <Camera className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      <span className="text-sm font-display text-muted-foreground">{capturedPhotos[i] ? "Captured ✓" : `Capture ${item.type}`}</span>
                      <input
                        type="file"
                        accept={item.type === "video" ? "video/*" : "image/*"}
                        capture={drop.requireInAppCamera ? "environment" : undefined}
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleCapture(i, e.target.files[0])}
                      />
                    </label>
                    {capturedPhotos[i] && item.type === "photo" && (
                      <img src={capturedPhotos[i]} className="rounded-lg w-full object-cover max-h-32" alt={item.label} />
                    )}
                  </div>
                ))
              )}
            </div>

            {drop.requireInAppCamera && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/15">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-400/60">In-app camera only — gallery uploads are not accepted for this Cash Drop.</p>
              </div>
            )}

            <Button
              onClick={() => submitProofMutation.mutate()}
              disabled={submitProofMutation.isPending || uploading || (proofItems.length > 0 && capturedPhotos.filter(Boolean).length < proofItems.length) || (proofItems.length === 0 && !capturedPhotos[0])}
              className="w-full h-12 font-display tracking-wider rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
              data-testid="button-submit-proof"
            >
              {submitProofMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "SUBMIT PROOF"}
            </Button>
          </div>
        )}

        {attempt?.status === "submitted" && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <p className="font-display font-bold text-sm text-primary">Proof Submitted — Pending Review</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Admin is reviewing your submission. You'll get a notification the moment a decision is made — tap it to come straight back here and collect your reward.
            </p>
          </div>
        )}

        {attempt?.status === "won" && <CashDropPayoutSelector dropId={id} attempt={attempt} rewardAmount={drop.rewardPerWinner} drop={drop} />}

        {attempt?.status === "rejected" && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-5 text-center space-y-2">
            <p className="font-display font-bold text-sm text-destructive">Submission Rejected</p>
            <p className="text-[11px] text-muted-foreground">{attempt.rejectionReason || "Your submission did not meet the requirements."}</p>
            {slotsLeft > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-border/30 font-display mt-2"
                onClick={() => setCapturedPhotos([])}
                data-testid="button-retry-proof"
              >
                Try Again
              </Button>
            )}
          </div>
        )}

      </div>
    </GuberLayout>
  );
}
