import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { isStoreBuild } from "@/lib/platform";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceItem } from "@shared/schema";
import { useLocation } from "wouter";
import {
  ShieldCheck, Plus, X, MapPin, Package, Car, Laptop, Sofa, Wrench, Shirt,
  Dumbbell, AlertCircle, CheckCircle, Clock, Zap, Star, Search, Filter,
  Eye, MessageCircle, Calendar, Flag, ChevronDown, Anchor, Truck, Tag,
  Home, Archive, Layers, ArrowUpDown, RefreshCw, Camera,
} from "lucide-react";

const CATEGORIES = [
  { name: "All", icon: Package },
  { name: "Vehicles", icon: Car },
  { name: "Parts", icon: Layers },
  { name: "Boats & Marine", icon: Anchor },
  { name: "Trailers", icon: Truck },
  { name: "Tools & Equipment", icon: Wrench },
  { name: "Electronics", icon: Laptop },
  { name: "Furniture", icon: Sofa },
  { name: "Home & Garden", icon: Home },
  { name: "Clothing & Accessories", icon: Shirt },
  { name: "Collectibles", icon: Star },
  { name: "Sporting Goods", icon: Dumbbell },
  { name: "Appliances", icon: Archive },
  { name: "Other", icon: Tag },
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

const AVAILABILITY_OPTIONS = [
  { value: "available_now", label: "Available Now" },
  { value: "today", label: "Available Today" },
  { value: "this_week", label: "Available This Week" },
  { value: "appointment", label: "By Appointment" },
];

const REPORT_REASONS = ["Scam", "Prohibited item", "Offensive content", "Wrong category", "Duplicate", "Other"];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function availabilityLabel(val: string | null | undefined) {
  const found = AVAILABILITY_OPTIONS.find(o => o.value === val);
  return found?.label || "Available Now";
}

function availabilityColor(val: string | null | undefined) {
  if (val === "available_now") return { bg: "rgba(0,229,118,0.12)", border: "rgba(0,229,118,0.3)", color: "#00e676" };
  if (val === "today") return { bg: "rgba(245,165,0,0.1)", border: "rgba(245,165,0,0.3)", color: "#f5a500" };
  if (val === "this_week") return { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.3)", color: "#818cf8" };
  return { bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)", color: "#9ca3af" };
}

function statusBadge(status: string | null | undefined) {
  const s = status || "available";
  if (s === "available" || s === "active") return { label: "Available", color: "#00e676", bg: "rgba(0,229,118,0.1)", border: "rgba(0,229,118,0.25)" };
  if (s === "pending") return { label: "Pending", color: "#f5a500", bg: "rgba(245,165,0,0.1)", border: "rgba(245,165,0,0.25)" };
  if (s === "sold") return { label: "Sold", color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)" };
  if (s === "expired") return { label: "Expired", color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)" };
  if (s === "removed") return { label: "Removed", color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)" };
  return { label: "Available", color: "#00e676", bg: "rgba(0,229,118,0.1)", border: "rgba(0,229,118,0.25)" };
}

function VerifiedBadge({ item }: { item: MarketplaceItem }) {
  if (!item.guberVerified) return null;
  const date = item.verificationDate
    ? new Date(item.verificationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,180,80,0.12)", color: "#16a34a", border: "1px solid rgba(0,180,80,0.25)" }}>
      <ShieldCheck className="w-2.5 h-2.5" />
      GUBER VERIFIED{date ? ` · ${date}` : ""}
    </span>
  );
}

function PriceDisplay({ item, large }: { item: MarketplaceItem; large?: boolean }) {
  const sz = large ? "text-2xl" : "text-base";
  if (item.askingType === "free") return <span className={`${sz} font-display font-black text-emerald-400`}>FREE</span>;
  if (item.makeOfferEnabled || item.askingType === "obo") return (
    <span className={`${sz} font-display font-black text-primary`}>
      {item.price ? `$${item.price.toLocaleString()}` : "Make Offer"}
      <span className="text-xs font-normal text-muted-foreground ml-1">Open to Offers</span>
    </span>
  );
  return <span className={`${sz} font-display font-black text-primary`}>{item.price ? `$${item.price.toLocaleString()}` : "Contact"}</span>;
}

function ItemCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  const photos = item.photos as string[] | null;
  const hasPhoto = photos && photos.length > 0;
  const isBoosted = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const sb = statusBadge(item.status);
  const avail = availabilityColor(item.sellerAvailability);
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";

  return (
    <div
      className="glass-card rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={isBoosted
        ? { border: "1.5px solid rgba(245,165,0,0.4)", boxShadow: "0 0 16px rgba(245,165,0,0.08)" }
        : { border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={onClick}
      data-testid={`card-marketplace-${item.id}`}
    >
      <div className="relative h-40 bg-muted/30 flex items-center justify-center overflow-hidden">
        {hasPhoto ? (
          <img src={photos![0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Package className="w-8 h-8" />
          </div>
        )}
        {item.guberVerified && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,180,80,0.9)", color: "#fff" }}>
              <ShieldCheck className="w-2 h-2" /> VERIFIED
            </span>
          </div>
        )}
        {isBoosted && (
          <div className="absolute bottom-2 left-2">
            <span className="flex items-center gap-1 text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded-full tracking-wider"
              style={{ background: "rgba(245,165,0,0.92)", color: "#1a0d00" }}>
              <Zap className="w-2 h-2" /> FEATURED
            </span>
          </div>
        )}
        {item.condition && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "#e5e7eb" }}>
              {item.condition.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-0.5">{item.category}</p>
        <h3 className="text-xs font-bold text-foreground leading-snug mb-1.5 line-clamp-2" data-testid={`text-item-title-${item.id}`}>{item.title}</h3>
        <PriceDisplay item={item} />
        <div className="flex items-center justify-between mt-1.5 flex-wrap gap-1">
          {location && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />{location}
            </span>
          )}
          <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: avail.bg, border: `1px solid ${avail.border}`, color: avail.color }}>
            {availabilityLabel(item.sellerAvailability)}
          </span>
        </div>
        {(item.status && item.status !== "available" && item.status !== "active") && (
          <div className="mt-1.5">
            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color }}>
              {sb.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MakeOfferModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/marketplace/${item.id}/offer`, data),
    onSuccess: (data: any) => {
      if (data?.filtered) {
        toast({ title: "Offer not sent", description: data.message || "This offer is below the seller's acceptable range.", variant: "destructive" });
      } else {
        toast({ title: "Offer sent!", description: "The seller will be notified. You'll get a notification on their response." });
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
        onClose();
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
    mutation.mutate({ offerAmount: amt, message });
  };

  const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-make-offer">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Make an Offer</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Asking: <span className="text-foreground font-bold">{item.price ? `$${item.price.toLocaleString()}` : "Open"}</span> · You get 4 total offer actions. Low offers may be filtered automatically.</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">YOUR OFFER ($)</label>
            <input className={inputClass} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} data-testid="input-offer-amount" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">MESSAGE (OPTIONAL)</label>
            <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Introduce yourself or explain your offer..." value={message} onChange={e => setMessage(e.target.value)} />
          </div>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          Accepted offers do not complete a purchase through GUBER. Buyer and seller are responsible for completing the transaction safely.
        </div>
        <Button onClick={handleSubmit} disabled={mutation.isPending} className="w-full premium-btn font-display" data-testid="button-submit-offer">
          {mutation.isPending ? "Sending..." : "SEND OFFER"}
        </Button>
      </div>
    </div>
  );
}

function RequestViewingModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/marketplace/${item.id}/viewing`, data),
    onSuccess: () => {
      toast({ title: "Viewing requested!", description: "The seller will be notified and can approve, decline, or suggest another time." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-request-viewing">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Request a Viewing</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(245,165,0,0.06)", border: "1px solid rgba(245,165,0,0.15)" }}>
          Meet in a safe public location when possible. Do not share private address information until you are comfortable.
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">PREFERRED DATE & TIME</label>
            <input className={inputClass} type="datetime-local" value={date} onChange={e => setDate(e.target.value)} data-testid="input-viewing-date" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">NOTE (OPTIONAL)</label>
            <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Any special requests or notes for the seller..." value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mutation.mutate({ requestedTime: date || null, note })} disabled={mutation.isPending}
          className="w-full premium-btn font-display" data-testid="button-submit-viewing">
          {mutation.isPending ? "Sending..." : "REQUEST VIEWING"}
        </Button>
      </div>
    </div>
  );
}

function RequestVIModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/${item.id}/vi-request`, {}),
    onSuccess: (data: any) => {
      toast({ title: "V&I Task Created!", description: `A local GUBER helper will document the item. Job #${data.jobId} created.` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-request-vi">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Request Verify & Inspect</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.18)" }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-display font-bold text-emerald-400">What happens next</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <li>• A hidden task is created for local GUBER helpers</li>
            <li>• An eligible helper nearby accepts and visits the item in person</li>
            <li>• They document it with photos based on a <strong className="text-foreground">{item.category}</strong> checklist</li>
            <li>• You receive a proof report — the listing can earn the GUBER Verified badge</li>
            <li>• Neither buyer nor seller can accept this task</li>
          </ul>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          Verify & Inspect provides visual proof and documentation only. It is not a guarantee of condition, authenticity, ownership, functionality, or future performance.
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full premium-btn font-display" data-testid="button-confirm-vi-request">
          {mutation.isPending ? "Creating Task..." : "REQUEST VERIFY & INSPECT"}
        </Button>
      </div>
    </div>
  );
}

function ContactSellerModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/marketplace/${item.id}/contact`, data),
    onSuccess: () => {
      toast({ title: "Message sent!", description: "The seller has been notified." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-contact-seller">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Contact Seller</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Seller: <span className="text-foreground font-bold">{item.sellerName || "GUBER Seller"}</span></p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">YOUR MESSAGE</label>
            <textarea className={`${inputClass} resize-none`} rows={4} placeholder={`Hi, I'm interested in your listing: ${item.title}`}
              value={message} onChange={e => setMessage(e.target.value)} data-testid="textarea-contact-message" />
          </div>
        </div>
        <Button onClick={() => mutation.mutate({ message })} disabled={mutation.isPending || !message.trim()}
          className="w-full premium-btn font-display" data-testid="button-send-contact-message">
          {mutation.isPending ? "Sending..." : "SEND MESSAGE"}
        </Button>
      </div>
    </div>
  );
}

function ReportListingModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/marketplace/${item.id}/report`, data),
    onSuccess: () => {
      toast({ title: "Report submitted", description: "Our team will review this listing." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-report-listing">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Report Listing</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">REASON</label>
            <select className={inputClass} value={reason} onChange={e => setReason(e.target.value)} data-testid="select-report-reason">
              <option value="">Select reason</option>
              {REPORT_REASONS.map(r => <option key={r} value={r.toLowerCase().replace(/\s/g, "_")}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">DETAILS (OPTIONAL)</label>
            <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Describe the issue..." value={details} onChange={e => setDetails(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mutation.mutate({ reason, details })} disabled={mutation.isPending || !reason}
          className="w-full font-display" variant="destructive" data-testid="button-submit-report">
          {mutation.isPending ? "Submitting..." : "SUBMIT REPORT"}
        </Button>
      </div>
    </div>
  );
}

function ItemDetailModal({ item, onClose, currentUser }: { item: MarketplaceItem; onClose: () => void; currentUser?: any }) {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();
  const photos = item.photos as string[] | null;
  const [photoIdx, setPhotoIdx] = useState(0);
  const [modal, setModal] = useState<"offer" | "viewing" | "vi" | "contact" | "report" | null>(null);
  const isBoostedActive = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const isSeller = currentUser && item.sellerId === currentUser.id;
  const isAvailable = ["available", "active"].includes(item.status || "available");
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";
  const sb = statusBadge(item.status);
  const avail = availabilityColor(item.sellerAvailability);

  const boostMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/${item.id}/boost-checkout`, {}),
    onSuccess: (data: any) => { if (data?.checkoutUrl) window.location.href = data.checkoutUrl; },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/marketplace/${item.id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-listings"] });
      toast({ title: "Listing updated" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const verificationDate = item.verificationDate
    ? new Date(item.verificationDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
        <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl max-h-[92vh] overflow-y-auto"
          onClick={e => e.stopPropagation()} data-testid="modal-item-detail">

          {/* Photo gallery */}
          {photos && photos.length > 0 ? (
            <div className="relative h-64 bg-black/40 overflow-hidden">
              <img src={photos[photoIdx]} alt={item.title} className="w-full h-full object-cover" />
              {photos.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <button key={i} onClick={() => setPhotoIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === photoIdx ? "bg-white scale-125" : "bg-white/40"}`} />
                  ))}
                </div>
              )}
              <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 backdrop-blur-sm" data-testid="button-close-modal">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center bg-muted/20 relative">
              <Package className="w-12 h-12 text-muted-foreground" />
              <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10" data-testid="button-close-modal">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          )}

          <div className="p-5">
            {/* Status + boost */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color }}>{sb.label}</span>
              <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                style={{ background: avail.bg, border: `1px solid ${avail.border}`, color: avail.color }}>
                {availabilityLabel(item.sellerAvailability)}
              </span>
              {isBoostedActive && (
                <span className="flex items-center gap-1 text-[10px] font-display font-extrabold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(245,165,0,0.18)", border: "1.5px solid rgba(245,165,0,0.35)", color: "#f5a500" }}>
                  <Zap className="w-2.5 h-2.5" /> FEATURED
                </span>
              )}
            </div>

            {/* Title + price */}
            <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">{item.category}</p>
            <h2 className="text-xl font-display font-extrabold text-foreground leading-tight mb-2">{item.title}</h2>
            <div className="flex items-center gap-3 mb-4">
              <PriceDisplay item={item} large />
              {item.makeOfferEnabled && (
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8" }}>
                  OPEN TO OFFERS
                </span>
              )}
              {!item.makeOfferEnabled && item.askingType !== "obo" && (
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.2)", color: "#9ca3af" }}>
                  FIRM PRICE
                </span>
              )}
            </div>

            {/* Details row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-muted-foreground">
              {location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>}
              {item.condition && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{item.condition}</span>}
              {item.year && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Year: {item.year}</span>}
              {item.brand && <span>Brand: {item.brand}</span>}
              {item.model && <span>Model: {item.model}</span>}
              {item.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Listed {new Date(item.createdAt).toLocaleDateString()}</span>}
            </div>

            {/* V&I status */}
            <div className="rounded-xl p-3.5 mb-4"
              style={item.guberVerified
                ? { background: "rgba(0,180,80,0.08)", border: "1px solid rgba(0,180,80,0.2)" }
                : { background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.12)" }}>
              {item.guberVerified ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-display font-bold text-emerald-400">GUBER Verified Item</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A local GUBER helper documented this item on-site with photos
                    {item.verifiedByName ? ` (${item.verifiedByName})` : ""}
                    {verificationDate ? ` on ${verificationDate}` : ""}.
                    {item.verificationNotes && ` Notes: ${item.verificationNotes}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Verify & Inspect provides visual proof only — not a guarantee of condition, authenticity, or functionality.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-display font-bold text-muted-foreground">Not Yet Verified</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">No on-site visual proof on file. Request V&I below to get a local helper to document this item.</p>
                </>
              )}
            </div>

            {/* Description */}
            {item.description && (
              <div className="mb-4">
                <h4 className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-2">DESCRIPTION</h4>
                <p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p>
              </div>
            )}

            {/* Seller availability */}
            <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{item.sellerName || "Seller"}</span>
              <span>·</span>
              <span style={{ color: availabilityColor(item.sellerAvailability).color }}>{availabilityLabel(item.sellerAvailability)}</span>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              GUBER helps users list, discover, and verify items. GUBER does not own, inspect, guarantee, or process the sale of listed items unless a separate GUBER Verify & Inspect service is requested.
            </div>

            {/* Seller actions */}
            {isSeller ? (
              <div className="space-y-2">
                {!isBoostedActive && !isStoreBuild && !isDemoUser && (
                  <button onClick={() => boostMutation.mutate()} disabled={boostMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-display font-bold transition-all hover:scale-[1.01] disabled:opacity-60"
                    style={{ background: "rgba(245,165,0,0.15)", border: "1.5px solid rgba(245,165,0,0.35)", color: "#f5a500" }}
                    data-testid="button-boost-listing">
                    <Zap className="w-3.5 h-3.5" />
                    {boostMutation.isPending ? "Loading..." : "BOOST TO FEATURED — $4.99 / 7 DAYS"}
                  </button>
                )}
                <div className="flex gap-2">
                  <button onClick={() => statusMutation.mutate("pending")} disabled={statusMutation.isPending || !isAvailable}
                    className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(245,165,0,0.1)", border: "1px solid rgba(245,165,0,0.25)", color: "#f5a500" }}
                    data-testid="button-mark-pending">
                    Mark Pending
                  </button>
                  <button onClick={() => statusMutation.mutate("sold")} disabled={statusMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.2)", color: "#9ca3af" }}
                    data-testid="button-mark-sold">
                    Mark Sold
                  </button>
                  {!isAvailable && (
                    <button onClick={() => statusMutation.mutate("available")} disabled={statusMutation.isPending}
                      className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                      style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.25)", color: "#00e676" }}
                      data-testid="button-mark-available">
                      Relist
                    </button>
                  )}
                </div>
              </div>
            ) : currentUser ? (
              <div className="space-y-2">
                <button onClick={() => setModal("contact")}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-display font-bold premium-btn"
                  data-testid="button-contact-seller">
                  <MessageCircle className="w-4 h-4" /> CONTACT SELLER
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setModal("viewing")} disabled={!isAvailable}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8" }}
                    data-testid="button-request-viewing">
                    <Eye className="w-3.5 h-3.5" /> Request Viewing
                  </button>
                  <button onClick={() => setModal("vi")} disabled={!isAvailable}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(0,180,80,0.1)", border: "1px solid rgba(0,180,80,0.25)", color: "#16a34a" }}
                    data-testid="button-request-vi">
                    <ShieldCheck className="w-3.5 h-3.5" /> Request V&I
                  </button>
                </div>
                {(item.makeOfferEnabled || item.askingType === "obo") && isAvailable && (
                  <button onClick={() => setModal("offer")}
                    className="w-full py-2.5 rounded-xl text-xs font-display font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#e5e7eb" }}
                    data-testid="button-make-offer">
                    Make an Offer
                  </button>
                )}
                <button onClick={() => setModal("report")}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-display font-bold text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-report-listing">
                  <Flag className="w-3 h-3" /> Report Listing
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">Sign in to contact seller or request verification</p>
            )}
          </div>
        </div>
      </div>

      {modal === "offer" && <MakeOfferModal item={item} onClose={() => setModal(null)} />}
      {modal === "viewing" && <RequestViewingModal item={item} onClose={() => setModal(null)} />}
      {modal === "vi" && <RequestVIModal item={item} onClose={() => setModal(null)} />}
      {modal === "contact" && <ContactSellerModal item={item} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportListingModal item={item} onClose={() => setModal(null)} />}
    </>
  );
}

function PostListingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "", category: "", condition: "", price: "", priceType: "firm",
    makeOfferEnabled: false, minOfferThreshold: "", description: "",
    city: "", state: "", zipcode: "", brand: "", model: "", year: "",
    sellerAvailability: "available_now", sellerNotes: "", viJobId: "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/marketplace", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-listings"] });
      toast({ title: "Listing posted!", description: "Your item is now live in Marketplace Beta." });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handlePhotoUpload = useCallback(async (files: FileList) => {
    if (photos.length >= 6) return toast({ title: "Max 6 photos", variant: "destructive" });
    const remaining = 6 - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of toUpload) {
      if (file.size > 20 * 1024 * 1024) { toast({ title: `${file.name} too large (max 20MB)`, variant: "destructive" }); continue; }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", "ml_default");
      try {
        const r = await fetch("https://api.cloudinary.com/v1_1/guber/image/upload", { method: "POST", body: fd });
        if (r.ok) { const j = await r.json(); uploaded.push(j.secure_url); }
      } catch {
        toast({ title: `Failed to upload ${file.name}`, description: "Try again", variant: "destructive" });
      }
    }
    if (uploaded.length) setPhotos(p => [...p, ...uploaded]);
    setUploading(false);
  }, [photos, toast]);

  const handleSubmit = () => {
    if (!form.title) return toast({ title: "Title is required", variant: "destructive" });
    if (!form.category) return toast({ title: "Category is required", variant: "destructive" });
    if (!form.city || !form.state) return toast({ title: "City and state are required", variant: "destructive" });
    mutation.mutate({
      title: form.title,
      description: form.description,
      category: form.category,
      condition: form.condition || null,
      price: form.priceType !== "free" && form.price ? parseFloat(form.price) : null,
      askingType: form.makeOfferEnabled ? "obo" : form.priceType === "free" ? "free" : "fixed",
      priceType: form.priceType,
      makeOfferEnabled: form.makeOfferEnabled,
      minOfferThreshold: form.makeOfferEnabled && form.minOfferThreshold ? parseFloat(form.minOfferThreshold) : null,
      brand: form.brand || null,
      model: form.model || null,
      year: form.year ? parseInt(form.year) : null,
      city: form.city,
      state: form.state,
      zipcode: form.zipcode || user?.zipcode || null,
      locationApprox: `${form.city}, ${form.state}`,
      sellerAvailability: form.sellerAvailability,
      photos,
      sellerNotes: form.sellerNotes || null,
      viJobId: form.viJobId ? parseInt(form.viJobId) : null,
      status: "available",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  };

  const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl max-h-[94vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} data-testid="modal-post-listing">
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-display font-extrabold">List an Item</h2>
              <p className="text-xs text-muted-foreground">Free to post · Physical items only</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">TITLE *</label>
              <input className={inputClass} placeholder="e.g. 2019 Honda Civic – 80k miles, clean title"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-listing-title" />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">CATEGORY *</label>
              <select className={inputClass} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} data-testid="select-listing-category">
                <option value="">Select category</option>
                {CATEGORIES.filter(c => c.name !== "All").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {/* Price type */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">PRICE TYPE *</label>
              <div className="flex gap-2">
                {[["firm", "Firm Price"], ["free", "Free"]].map(([val, label]) => (
                  <button key={val} onClick={() => setForm(f => ({ ...f, priceType: val, makeOfferEnabled: false }))}
                    className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
                    style={form.priceType === val && !form.makeOfferEnabled
                      ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
                    data-testid={`button-pricetype-${val}`}>{label}</button>
                ))}
                <button onClick={() => setForm(f => ({ ...f, priceType: "firm", makeOfferEnabled: true }))}
                  className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
                  style={form.makeOfferEnabled
                    ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
                  data-testid="button-pricetype-offers">Open to Offers</button>
              </div>
            </div>

            {/* Price */}
            {form.priceType !== "free" && (
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">
                  {form.makeOfferEnabled ? "ASKING PRICE ($)" : "PRICE ($)"} *
                </label>
                <input className={inputClass} type="number" placeholder="0.00"
                  value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} data-testid="input-listing-price" />
              </div>
            )}

            {/* Hidden minimum */}
            {form.makeOfferEnabled && (
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">
                  MINIMUM OFFER THRESHOLD ($) — HIDDEN FROM BUYERS
                </label>
                <input className={inputClass} type="number" placeholder="Offers below this are auto-filtered silently"
                  value={form.minOfferThreshold} onChange={e => setForm(f => ({ ...f, minOfferThreshold: e.target.value }))} data-testid="input-min-threshold" />
                <p className="text-[10px] text-muted-foreground mt-1">Buyers below this threshold see "offer below acceptable range" — you're never notified</p>
              </div>
            )}

            {/* Condition */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">CONDITION</label>
              <select className={inputClass} value={form.condition}
                onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} data-testid="select-listing-condition">
                <option value="">Select condition</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Optional: brand/model/year */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">BRAND</label>
                <input className={inputClass} placeholder="e.g. Honda" value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">MODEL</label>
                <input className={inputClass} placeholder="e.g. Civic" value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">YEAR</label>
                <input className={inputClass} type="number" placeholder="2019" value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">DESCRIPTION *</label>
              <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Describe the item, its history, any issues..."
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                data-testid="textarea-listing-description" />
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">LOCATION *</label>
              <div className="flex gap-2 mb-2">
                <input className={inputClass} placeholder="City" value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))} data-testid="input-listing-city" />
                <select className={`${inputClass} w-28`} value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))} data-testid="select-listing-state">
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <input className={inputClass} placeholder="ZIP code (optional)" value={form.zipcode}
                onChange={e => setForm(f => ({ ...f, zipcode: e.target.value }))} data-testid="input-listing-zip" />
            </div>

            {/* Seller availability */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">SELLER AVAILABILITY *</label>
              <select className={inputClass} value={form.sellerAvailability}
                onChange={e => setForm(f => ({ ...f, sellerAvailability: e.target.value }))} data-testid="select-listing-availability">
                {AVAILABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Controls how quickly offer expiration kicks in</p>
            </div>

            {/* Photos */}
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">
                PHOTOS ({photos.length}/6)
              </label>
              {photos.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden">
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 6 && (
                <label className="flex items-center justify-center gap-2 py-3 rounded-xl cursor-pointer text-xs font-display font-bold text-muted-foreground transition-all hover:text-foreground"
                  style={{ border: "1px dashed rgba(255,255,255,0.15)" }} data-testid="label-photo-upload">
                  <Camera className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Add Photos (max 6)"}
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => e.target.files && handlePhotoUpload(e.target.files)} disabled={uploading} />
                </label>
              )}
            </div>

            {/* V&I link */}
            <div>
              <label className="text-xs font-display font-bold text-emerald-400/80 tracking-wider block mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> V&I JOB ID (OPTIONAL — FOR VERIFIED BADGE)
              </label>
              <input className={inputClass} placeholder="Enter V&I job ID if already documented"
                value={form.viJobId} onChange={e => setForm(f => ({ ...f, viJobId: e.target.value }))}
                data-testid="input-listing-vi-job" />
            </div>

            <div className="rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              GUBER does not process the sale of marketplace items. The sale happens between buyer and seller. Listings expire after 30 days.
            </div>

            <Button onClick={handleSubmit} disabled={mutation.isPending || uploading}
              className="w-full premium-btn font-display" data-testid="button-submit-listing">
              {mutation.isPending ? "Posting..." : "POST LISTING — FREE"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyListingsTab({ onSelectItem }: { onSelectItem: (item: MarketplaceItem) => void }) {
  const { data: listings = [], isLoading } = useQuery<MarketplaceItem[]>({
    queryKey: ["/api/marketplace/my-listings"],
    queryFn: () => fetch("/api/marketplace/my-listings").then(r => r.json()),
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2].map(i => <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-20" />)}
    </div>
  );

  if (!listings.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-display font-bold">No listings yet</p>
      <p className="text-xs mt-1">Tap LIST ITEM to post your first listing</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {listings.map(item => {
        const sb = statusBadge(item.status);
        const photos = item.photos as string[] | null;
        return (
          <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-white/5 transition-all"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }} onClick={() => onSelectItem(item)}
            data-testid={`my-listing-${item.id}`}>
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted/30 shrink-0">
              {photos && photos[0] ? <img src={photos[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-muted-foreground m-auto mt-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.price ? `$${item.price.toLocaleString()}` : "Free"}</p>
            </div>
            <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color }}>{sb.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Marketplace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"browse" | "my">("browse");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    priceMin: "", priceMax: "", verifiedOnly: false, sort: "default", makeOfferEnabled: false,
  });

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (activeCategory !== "All") params.set("category", activeCategory);
    if (search) params.set("search", search);
    if (filters.priceMin) params.set("priceMin", filters.priceMin);
    if (filters.priceMax) params.set("priceMax", filters.priceMax);
    if (filters.verifiedOnly) params.set("verifiedOnly", "true");
    if (filters.makeOfferEnabled) params.set("makeOfferEnabled", "true");
    if (filters.sort !== "default") params.set("sort", filters.sort);
    return `/api/marketplace?${params.toString()}`;
  };

  const { data: items = [], isLoading } = useQuery<MarketplaceItem[]>({
    queryKey: ["/api/marketplace", activeCategory, search, filters],
    queryFn: () => fetch(buildUrl()).then(r => r.json()),
  });

  const handleSearch = () => setSearch(searchInput);

  const verifiedCount = items.filter(i => i.guberVerified).length;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-marketplace">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">Marketplace <span className="text-xs font-normal text-primary ml-1 align-middle">BETA</span></h1>
            <p className="text-xs text-muted-foreground mt-0.5">List items. Find deals. Request verification before you buy.</p>
          </div>
          {user && (
            <Button size="sm" onClick={() => setShowPostModal(true)}
              className="premium-btn font-display text-xs tracking-wider gap-1.5 shrink-0" data-testid="button-post-listing">
              <Plus className="w-3.5 h-3.5" /> LIST ITEM
            </Button>
          )}
        </div>

        {/* Tabs */}
        {user && (
          <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {([["browse", "Browse"], ["my", "My Listings"]] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all"
                style={tab === t
                  ? { background: "rgba(0,229,118,0.15)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e676" }
                  : { color: "#6b7280" }}
                data-testid={`tab-${t}`}>{label}</button>
            ))}
          </div>
        )}

        {tab === "my" ? (
          <MyListingsTab onSelectItem={setSelectedItem} />
        ) : (
          <>
            {/* Search */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-input border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  placeholder="Search listings..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  data-testid="input-search"
                />
              </div>
              <button onClick={handleSearch} className="px-3 py-2.5 rounded-xl text-xs font-display font-bold transition-all"
                style={{ background: "rgba(0,229,118,0.15)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e676" }}
                data-testid="button-search">
                Search
              </button>
              <button onClick={() => setShowFilters(f => !f)}
                className="px-3 py-2.5 rounded-xl text-xs font-display font-bold transition-all"
                style={showFilters
                  ? { background: "rgba(0,229,118,0.15)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e676" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#6b7280" }}
                data-testid="button-toggle-filters">
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-display font-bold text-muted-foreground block mb-1">MIN PRICE</label>
                    <input className="w-full bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
                      type="number" placeholder="$0" value={filters.priceMin} onChange={e => setFilters(f => ({ ...f, priceMin: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-display font-bold text-muted-foreground block mb-1">MAX PRICE</label>
                    <input className="w-full bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
                      type="number" placeholder="No limit" value={filters.priceMax} onChange={e => setFilters(f => ({ ...f, priceMax: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-display font-bold text-muted-foreground block mb-1">SORT BY</label>
                  <select className="w-full bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                    value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))} data-testid="select-sort">
                    <option value="default">Verified & Boosted First</option>
                    <option value="newest">Newest First</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={filters.verifiedOnly} onChange={e => setFilters(f => ({ ...f, verifiedOnly: e.target.checked }))}
                      className="rounded" data-testid="checkbox-verified-only" />
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" /> Verified only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={filters.makeOfferEnabled} onChange={e => setFilters(f => ({ ...f, makeOfferEnabled: e.target.checked }))}
                      className="rounded" />
                    <span className="text-xs text-muted-foreground">Open to offers</span>
                  </label>
                </div>
                <button onClick={() => { setFilters({ priceMin: "", priceMax: "", verifiedOnly: false, sort: "default", makeOfferEnabled: false }); setSearch(""); setSearchInput(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <RefreshCw className="w-3 h-3" /> Clear all filters
                </button>
              </div>
            )}

            {/* Category chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
              {CATEGORIES.map(({ name, icon: Icon }) => (
                <button key={name} onClick={() => setActiveCategory(name)}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-display font-bold tracking-wider transition-all"
                  style={activeCategory === name
                    ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
                  data-testid={`button-category-${name.toLowerCase().replace(/[\s&]/g, "-")}`}>
                  <Icon className="w-3 h-3" />{name}
                </button>
              ))}
            </div>

            {/* Verified count */}
            {verifiedCount > 0 && !isLoading && (
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-display font-bold text-emerald-400 tracking-widest">GUBER VERIFIED ({verifiedCount})</span>
              </div>
            )}

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-52" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-display font-bold text-muted-foreground">No listings found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {search ? `No results for "${search}"` : activeCategory !== "All" ? `No ${activeCategory} items listed` : "Be the first to list an item"}
                  </p>
                </div>
                {user && (
                  <Button size="sm" onClick={() => setShowPostModal(true)} className="premium-btn font-display text-xs" data-testid="button-first-listing">
                    <Plus className="w-3.5 h-3.5 mr-1" /> List an Item
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {items.map(item => (
                  <ItemCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
                ))}
              </div>
            )}

            {/* Not signed in CTA */}
            {!user && items.length > 0 && (
              <div className="mt-6 rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-sm font-display font-bold mb-1">Want to sell?</p>
                <p className="text-xs text-muted-foreground mb-3">Sign in to list items and contact sellers</p>
                <Button size="sm" onClick={() => navigate("/login")} className="premium-btn font-display text-xs" data-testid="button-signin-to-list">
                  SIGN IN TO LIST
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} currentUser={user} />
      )}

      {showPostModal && (
        <PostListingModal onClose={() => setShowPostModal(false)} onSuccess={() => setShowPostModal(false)} />
      )}
    </GuberLayout>
  );
}
