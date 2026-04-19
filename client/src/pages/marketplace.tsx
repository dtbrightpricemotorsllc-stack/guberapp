import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { isStoreBuild } from "@/lib/platform";
import { GuberLayout } from "@/components/guber-layout";
import marketplaceImg from "@assets/category-images/marketplace.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceItem } from "@shared/schema";
import {
  ShieldCheck, Plus, X, ChevronRight, Tag, MapPin,
  Package, Car, Laptop, Sofa, Wrench, Shirt, BookOpen,
  Dumbbell, AlertCircle, CheckCircle, Clock, Zap, Star,
} from "lucide-react";
import { useLocation } from "wouter";

const CATEGORIES = [
  { name: "All", icon: Package },
  { name: "Vehicles", icon: Car },
  { name: "Electronics", icon: Laptop },
  { name: "Furniture", icon: Sofa },
  { name: "Tools & Equipment", icon: Wrench },
  { name: "Clothing", icon: Shirt },
  { name: "Sporting Goods", icon: Dumbbell },
  { name: "Books & Media", icon: BookOpen },
  { name: "Other", icon: Tag },
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

function VerifiedBadge({ item }: { item: MarketplaceItem }) {
  if (!item.guberVerified) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(107,114,128,0.15)", color: "#9ca3af", border: "1px solid rgba(107,114,128,0.2)" }}>
        <AlertCircle className="w-2.5 h-2.5" />
        UNVERIFIED
      </span>
    );
  }
  const date = item.verificationDate ? new Date(item.verificationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,180,80,0.12)", color: "#16a34a", border: "1px solid rgba(0,180,80,0.25)" }}
      title={`Verified by ${item.verifiedByName || "GUBER Inspector"}${date ? ` on ${date}` : ""}`}>
      <ShieldCheck className="w-2.5 h-2.5" />
      GUBER VERIFIED{date ? ` · ${date}` : ""}
    </span>
  );
}

function PriceDisplay({ item }: { item: MarketplaceItem }) {
  if (item.askingType === "free") return (
    <span className="text-lg font-display font-black text-emerald-400">FREE</span>
  );
  if (item.askingType === "obo") return (
    <span className="text-lg font-display font-black text-primary">
      {item.price ? `$${item.price.toLocaleString()}` : "Make Offer"} <span className="text-xs font-normal text-muted-foreground">OBO</span>
    </span>
  );
  return (
    <span className="text-lg font-display font-black text-primary">
      {item.price ? `$${item.price.toLocaleString()}` : "Contact"}
    </span>
  );
}

function ItemCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  const photos = item.photos as string[] | null;
  const hasPhoto = photos && photos.length > 0;
  const isBoosted = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  return (
    <div
      className="glass-card rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={isBoosted
        ? { border: "1.5px solid rgba(245,165,0,0.4)", boxShadow: "0 0 16px rgba(245,165,0,0.08)" }
        : { border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={onClick}
      data-testid={`card-marketplace-${item.id}`}
    >
      <div className="relative h-44 bg-muted/30 flex items-center justify-center overflow-hidden">
        {hasPhoto ? (
          <img src={photos![0]} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Package className="w-10 h-10" />
            <span className="text-[10px] font-display tracking-wider">NO PHOTO</span>
          </div>
        )}
        {item.guberVerified && (
          <div className="absolute top-2.5 left-2.5">
            <VerifiedBadge item={item} />
          </div>
        )}
        {isBoosted && (
          <div className="absolute bottom-2 left-2.5">
            <span className="flex items-center gap-1 text-[9px] font-display font-extrabold px-2 py-0.5 rounded-full tracking-wider"
              style={{ background: "rgba(245,165,0,0.92)", color: "#1a0d00", backdropFilter: "blur(6px)" }}>
              <Zap className="w-2.5 h-2.5" /> FEATURED
            </span>
          </div>
        )}
        {item.condition && (
          <div className="absolute top-2.5 right-2.5">
            <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.55)", color: "#e5e7eb", backdropFilter: "blur(6px)" }}>
              {item.condition.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">{item.category}</p>
        <h3 className="text-sm font-bold text-foreground leading-snug mb-2 line-clamp-2" data-testid={`text-item-title-${item.id}`}>{item.title}</h3>
        <div className="flex items-center justify-between">
          <PriceDisplay item={item} />
          {item.locationApprox && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />
              {item.locationApprox}
            </span>
          )}
        </div>
        {!item.guberVerified && (
          <div className="mt-2">
            <VerifiedBadge item={item} />
          </div>
        )}
      </div>
    </div>
  );
}

function ItemDetailModal({ item, onClose, currentUser }: { item: MarketplaceItem; onClose: () => void; currentUser?: any }) {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();
  const photos = item.photos as string[] | null;
  const [photoIdx, setPhotoIdx] = useState(0);
  const isBoostedActive = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const isSeller = currentUser && item.sellerId === currentUser.id;
  const verificationDate = item.verificationDate
    ? new Date(item.verificationDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const boostMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/${item.id}/boost-checkout`, {}),
    onSuccess: (data: any) => { if (data?.checkoutUrl) window.location.href = data.checkoutUrl; },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl max-h-[90vh] overflow-y-auto"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
        data-testid="modal-item-detail"
      >
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
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center bg-muted/20">
            <Package className="w-12 h-12 text-muted-foreground" />
          </div>
        )}

        <div className="p-5">
          {isBoostedActive && (
            <div className="flex items-center gap-2 px-5 pt-4 pb-0">
              <span className="flex items-center gap-1.5 text-[10px] font-display font-extrabold px-2.5 py-1 rounded-full tracking-wider"
                style={{ background: "rgba(245,165,0,0.18)", border: "1.5px solid rgba(245,165,0,0.35)", color: "#f5a500" }}>
                <Zap className="w-3 h-3" /> FEATURED LISTING
              </span>
              {item.boostedUntil && (
                <span className="text-[10px] text-muted-foreground font-display">
                  until {new Date(item.boostedUntil).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">{item.category}</p>
              <h2 className="text-xl font-display font-extrabold text-foreground leading-tight">{item.title}</h2>
            </div>
            <button onClick={onClose} className="ml-3 p-1.5 rounded-full hover:bg-white/10 transition-colors" data-testid="button-close-modal">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <PriceDisplay item={item} />
            {item.condition && (
              <Badge variant="outline" className="text-[10px] font-display">{item.condition}</Badge>
            )}
          </div>

          <div className="rounded-xl p-3.5 mb-4"
            style={item.guberVerified
              ? { background: "rgba(0,180,80,0.08)", border: "1px solid rgba(0,180,80,0.2)" }
              : { background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.15)" }}>
            {item.guberVerified ? (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-display font-bold text-emerald-400">GUBER Verified Item</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This item was physically inspected by a certified GUBER inspector
                  {item.verifiedByName ? ` (${item.verifiedByName})` : ""}
                  {verificationDate ? ` on ${verificationDate}` : ""}.
                  {item.verificationNotes && ` Notes: ${item.verificationNotes}`}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-display font-bold text-muted-foreground">Not Yet Verified</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This item has not been verified by a GUBER inspector. Consider requesting a V&I inspection for buyer confidence.
                </p>
              </>
            )}
          </div>

          {item.description && (
            <div className="mb-4">
              <h4 className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-2">DESCRIPTION</h4>
              <p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
            {item.locationApprox && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.locationApprox}</span>
            )}
            {item.sellerName && (
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />Seller: {item.sellerName}</span>
            )}
            {item.createdAt && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
                Listed {new Date(item.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {isSeller && (
            <div className="mb-3">
              {isBoostedActive ? (
                <div className="flex items-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-display font-bold"
                  style={{ background: "rgba(245,165,0,0.1)", border: "1px solid rgba(245,165,0,0.2)", color: "#f5a500" }}>
                  <Zap className="w-3.5 h-3.5" />
                  Featured until {new Date(item.boostedUntil!).toLocaleDateString()} — your listing appears first
                </div>
              ) : (!isStoreBuild && !isDemoUser) ? (
                <button
                  onClick={() => boostMutation.mutate()}
                  disabled={boostMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-display font-bold tracking-wider transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                  style={{ background: "rgba(245,165,0,0.15)", border: "1.5px solid rgba(245,165,0,0.35)", color: "#f5a500" }}
                  data-testid="button-boost-listing"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {boostMutation.isPending ? "Loading..." : "BOOST TO FEATURED — $4.99 / 7 DAYS"}
                </button>
              ) : null}
            </div>
          )}

          {!isSeller && (
            <a
              href={`mailto:support@guberapp.com?subject=Interested in: ${encodeURIComponent(item.title)}&body=I am interested in listing #${item.id}.`}
              className="block w-full text-center py-3.5 rounded-xl font-display font-bold text-sm tracking-wider premium-btn"
              data-testid="button-contact-seller"
            >
              CONTACT SELLER
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function PostListingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    title: "", description: "", category: "", condition: "",
    price: "", askingType: "fixed", zipcode: "", viJobId: "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/marketplace", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      toast({ title: "Listing posted!", description: "Your item is now live in the Marketplace." });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.title || !form.category) {
      toast({ title: "Required fields", description: "Title and category are required.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      ...form,
      price: form.price ? parseFloat(form.price) : null,
      viJobId: form.viJobId ? parseInt(form.viJobId) : null,
    });
  };

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl max-h-[92vh] overflow-y-auto"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
        data-testid="modal-post-listing"
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-extrabold">Post a Listing</h2>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <div className="rounded-xl p-3.5 mb-5"
            style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.18)" }}>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-display font-bold text-emerald-400 mb-0.5">Boost trust with GUBER Verification</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Link a completed V&I job ID to get the GUBER Verified badge. Buyers trust verified items more and listings sell faster.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">TITLE *</label>
              <input className={inputClass} placeholder="e.g. 2019 Honda Civic – pre-inspected" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-listing-title" />
            </div>

            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">CATEGORY *</label>
              <select className={inputClass} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} data-testid="select-listing-category">
                <option value="">Select category</option>
                {CATEGORIES.filter(c => c.name !== "All").map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">CONDITION</label>
              <select className={inputClass} value={form.condition}
                onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} data-testid="select-listing-condition">
                <option value="">Select condition</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">ASKING TYPE</label>
              <div className="flex gap-2">
                {[["fixed", "Fixed Price"], ["obo", "OBO"], ["free", "Free"]].map(([val, label]) => (
                  <button key={val} onClick={() => setForm(f => ({ ...f, askingType: val }))}
                    className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
                    style={form.askingType === val
                      ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
                    data-testid={`button-asking-${val}`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {form.askingType !== "free" && (
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">PRICE ($)</label>
                <input className={inputClass} type="number" placeholder="0.00" value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))} data-testid="input-listing-price" />
              </div>
            )}

            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">DESCRIPTION</label>
              <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Describe the item, its history, any issues..."
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                data-testid="textarea-listing-description" />
            </div>

            <div>
              <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">ZIP CODE</label>
              <input className={inputClass} placeholder="e.g. 27401" value={form.zipcode}
                onChange={e => setForm(f => ({ ...f, zipcode: e.target.value }))} data-testid="input-listing-zip" />
            </div>

            <div>
              <label className="text-xs font-display font-bold text-emerald-400/80 tracking-wider block mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                V&I JOB ID (OPTIONAL — FOR GUBER VERIFIED BADGE)
              </label>
              <input className={inputClass} placeholder="Paste the V&I job ID if already inspected"
                value={form.viJobId} onChange={e => setForm(f => ({ ...f, viJobId: e.target.value }))}
                data-testid="input-listing-vi-job" />
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                If a V&I inspector already verified this item (e.g. car inspection, property check), enter the job ID to auto-attach the verification report and earn the GUBER Verified badge.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              onClick={() => { onClose(); navigate("/verify-inspect"); }}
              className="w-full flex items-center gap-3 p-3.5 text-left transition-all hover:bg-white/5"
              data-testid="button-get-inspected-first"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,180,80,0.12)", border: "1px solid rgba(0,180,80,0.2)" }}>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold text-emerald-400 mb-0.5">Item not yet inspected?</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Get a V&I first — then list with the GUBER Verified badge for higher buyer trust.
                </p>
              </div>
              <Star className="w-3.5 h-3.5 text-emerald-400/40 shrink-0" />
            </button>
          </div>

          <Button onClick={handleSubmit} disabled={mutation.isPending}
            className="w-full premium-btn font-display mt-4" data-testid="button-submit-listing">
            {mutation.isPending ? "Posting..." : "POST LISTING"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);

  const { data: items = [], isLoading } = useQuery<MarketplaceItem[]>({
    queryKey: ["/api/marketplace", activeCategory !== "All" ? activeCategory : undefined],
    queryFn: () => {
      const url = activeCategory !== "All"
        ? `/api/marketplace?category=${encodeURIComponent(activeCategory)}`
        : "/api/marketplace";
      return fetch(url).then(r => r.json());
    },
  });

  const verifiedItems = items.filter(i => i.guberVerified);
  const displayItems = items;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-marketplace">
        <div className="relative mb-5 rounded-2xl overflow-hidden h-28 animate-fade-in" data-testid="banner-marketplace-image">
          <img
            src={marketplaceImg}
            alt="Marketplace"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-end justify-between">
            <div>
              <p className="font-display font-extrabold text-white text-lg tracking-tight leading-none">GUBER Marketplace</p>
              <p className="text-white/90 text-xs mt-0.5">Verified items only — real people, real inspections</p>
            </div>
            {user && (
              <Button size="sm" onClick={() => setShowPostModal(true)}
                className="premium-btn font-display text-xs tracking-wider gap-1.5 shrink-0" data-testid="button-post-listing">
                <Plus className="w-3.5 h-3.5" />
                LIST ITEM
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-2xl p-3.5 mb-5 flex items-start gap-3"
          style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.15)" }}>
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-display font-bold text-emerald-400 mb-0.5">What is GUBER Marketplace?</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Items for sale that have been physically verified by a GUBER inspector — not just described, but actually checked.
              Got a car inspected but the buyer backed out? List it here with your verification report attached.
              Everything legal is welcome.
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-none">
          {CATEGORIES.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => setActiveCategory(name)}
              className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-display font-bold tracking-wider transition-all"
              style={activeCategory === name
                ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
              data-testid={`button-category-${name.toLowerCase().replace(/\s/g, "-")}`}
            >
              <Icon className="w-3 h-3" />
              {name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-52" />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-display font-bold text-muted-foreground">No listings yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeCategory !== "All" ? `No ${activeCategory} items listed.` : "Be the first to list a verified item."}
              </p>
            </div>
            {user && (
              <Button size="sm" onClick={() => setShowPostModal(true)}
                className="premium-btn font-display text-xs" data-testid="button-first-listing">
                <Plus className="w-3.5 h-3.5 mr-1" />
                List an Item
              </Button>
            )}
          </div>
        ) : (
          <>
            {verifiedItems.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-display font-bold text-emerald-400 tracking-widest">
                  GUBER VERIFIED ({verifiedItems.length})
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {displayItems.map(item => (
                <ItemCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
              ))}
            </div>

            {!user && (
              <div className="mt-6 rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-sm font-display font-bold mb-1">Want to sell?</p>
                <p className="text-xs text-muted-foreground mb-3">Sign in to list your verified items</p>
                <Button size="sm" onClick={() => navigate("/login")} className="premium-btn font-display text-xs"
                  data-testid="button-signin-to-list">
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
        <PostListingModal
          onClose={() => setShowPostModal(false)}
          onSuccess={() => setShowPostModal(false)}
        />
      )}
    </GuberLayout>
  );
}
