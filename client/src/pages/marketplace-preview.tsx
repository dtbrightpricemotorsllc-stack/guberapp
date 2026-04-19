import { useState } from "react";
import { useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ArrowLeft, Bell, ChevronRight, MapPin, Tag, CheckCircle } from "lucide-react";

const ALL_LISTINGS = [
  {
    id: "f1",
    title: "Lamborghini Murciélago LP 640",
    subtitle: "2007 · Orange · 14,200 mi",
    price: "$329,900",
    category: "Vehicles",
    location: "Miami, FL",
    image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#EF4444",
  },
  {
    id: "f2",
    title: "4 Bedroom Modern Home",
    subtitle: "2,800 sqft · Pool · 2-Car Garage",
    price: "$899,000",
    category: "Real Estate",
    location: "Scottsdale, AZ",
    image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80&auto=format&fit=crop",
    condition: "Excellent",
    accent: "#F59E0B",
  },
  {
    id: "f3",
    title: "Rolex Submariner Date",
    subtitle: "Ref. 126610LN · Box & Papers",
    price: "$14,500",
    category: "Watches & Jewelry",
    location: "New York, NY",
    image: "https://images.unsplash.com/photo-1523170335258-f08c61524f47?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#22C55E",
  },
  {
    id: "f4",
    title: "Segway Ninebot Electric Scooter",
    subtitle: "Max G30P · 40-mile range",
    price: "$350",
    category: "Transportation",
    location: "Austin, TX",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80&auto=format&fit=crop",
    condition: "Good",
    accent: "#14B8A6",
  },
  {
    id: "f5",
    title: "AirPods Pro (2nd Gen)",
    subtitle: "USB-C · Open box · Sealed tips",
    price: "$25",
    category: "Electronics",
    location: "Chicago, IL",
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#8B5CF6",
  },
  {
    id: "f6",
    title: "Vintage Vinyl Records (Lot of 12)",
    subtitle: "Soul, Jazz & Funk · 70s–80s",
    price: "$20",
    category: "Books & Media",
    location: "Nashville, TN",
    image: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=600&q=80&auto=format&fit=crop",
    condition: "Good",
    accent: "#F97316",
  },
  {
    id: "f7",
    title: "Ferrari F8 Tributo",
    subtitle: "2021 · Rosso Corsa · 3,100 mi",
    price: "$289,000",
    category: "Vehicles",
    location: "Los Angeles, CA",
    image: "https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=600&q=80&auto=format&fit=crop",
    condition: "Excellent",
    accent: "#EF4444",
  },
  {
    id: "f8",
    title: "Hermès Birkin 35",
    subtitle: "Togo Leather · Gold Hardware",
    price: "$24,000",
    category: "Fashion & Accessories",
    location: "New York, NY",
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#F59E0B",
  },
  {
    id: "f9",
    title: "Custom Gaming PC Build",
    subtitle: "RTX 4090 · i9-14900K · 64GB DDR5",
    price: "$4,200",
    category: "Electronics",
    location: "Seattle, WA",
    image: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#8B5CF6",
  },
  {
    id: "f10",
    title: "Air Jordan 1 Retro High OG",
    subtitle: "Chicago · Size 10 · DS",
    price: "$1,800",
    category: "Fashion & Accessories",
    location: "Atlanta, GA",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80&auto=format&fit=crop",
    condition: "New",
    accent: "#EF4444",
  },
  {
    id: "f11",
    title: "Trek Domane SLR 9 Road Bike",
    subtitle: "Carbon · 56cm · Shimano Dura-Ace",
    price: "$6,500",
    category: "Sports & Fitness",
    location: "Denver, CO",
    image: "https://images.unsplash.com/photo-1558981852-426c6c22a060?w=600&q=80&auto=format&fit=crop",
    condition: "Good",
    accent: "#22C55E",
  },
  {
    id: "f12",
    title: "Martin D-28 Acoustic Guitar",
    subtitle: "2019 · Sitka Spruce · OHSC",
    price: "$2,100",
    category: "Musical Instruments",
    location: "Nashville, TN",
    image: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&q=80&auto=format&fit=crop",
    condition: "Excellent",
    accent: "#F97316",
  },
  {
    id: "f13",
    title: "DJI Mavic 3 Pro Drone",
    subtitle: "Fly More Combo · ND Filters",
    price: "$1,650",
    category: "Electronics",
    location: "Phoenix, AZ",
    image: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=600&q=80&auto=format&fit=crop",
    condition: "Like New",
    accent: "#14B8A6",
  },
  {
    id: "f14",
    title: "2019 Chevrolet Camaro SS",
    subtitle: "6.2L V8 · Rapid Blue · 18,400 mi",
    price: "$38,500",
    category: "Vehicles",
    location: "Dallas, TX",
    image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80&auto=format&fit=crop",
    condition: "Excellent",
    accent: "#EF4444",
  },
];

function FakeListingCard({ listing }: { listing: typeof ALL_LISTINGS[0] }) {
  return (
    <div
      className="glass-card rounded-2xl overflow-hidden select-none"
      style={{ border: "1px solid rgba(255,255,255,0.07)", pointerEvents: "none" }}
      data-testid={`card-preview-listing-${listing.id}`}
    >
      <div className="relative h-44 bg-muted/20 overflow-hidden">
        <img
          src={listing.image}
          alt={listing.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = "none";
            const placeholder = el.parentElement?.querySelector(".img-placeholder") as HTMLElement | null;
            if (placeholder) placeholder.style.display = "flex";
          }}
        />
        <div
          className="img-placeholder absolute inset-0 items-center justify-center text-2xl"
          style={{ display: "none", background: "linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))" }}
        >
          🖼️
        </div>
        <div className="absolute top-2.5 left-2.5">
          <span
            className="text-[9px] font-display font-black px-2 py-0.5 rounded-full tracking-[0.15em]"
            style={{ background: "rgba(0,0,0,0.65)", color: "#a3a3a3", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            PREVIEW
          </span>
        </div>
        <div className="absolute top-2.5 right-2.5">
          <span
            className="text-[9px] font-display font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", color: "#e5e7eb", backdropFilter: "blur(6px)" }}
          >
            {listing.condition.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="p-3.5">
        <p className="text-[10px] font-display font-bold tracking-wider mb-0.5" style={{ color: listing.accent + "99" }}>
          {listing.category.toUpperCase()}
        </p>
        <h3 className="text-sm font-bold text-foreground leading-snug mb-0.5 line-clamp-1">{listing.title}</h3>
        <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">{listing.subtitle}</p>
        <div className="flex items-center justify-between">
          <span className="text-base font-display font-black" style={{ color: listing.accent }}>{listing.price}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />{listing.location}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MarketplacePreview() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [listings] = useState(() =>
    [...ALL_LISTINGS].sort(() => Math.random() - 0.5).slice(0, 6)
  );

  const handleNotifyMe = () => {
    toast({
      title: "You're on the list! 🎉",
      description: "We'll notify you when Marketplace launches in your area.",
    });
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-marketplace-preview">

        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-marketplace"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-display font-semibold">Back</span>
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-display font-extrabold text-foreground tracking-tight">Marketplace</h1>
            <span className="text-xl">🚧</span>
          </div>
          <p className="text-sm text-muted-foreground font-display">
            A smarter way to buy and sell — powered by real verification.
          </p>
        </div>

        {/* Coming soon message */}
        <div
          className="rounded-2xl p-5 mb-6"
          style={{
            background: "linear-gradient(135deg,rgba(239,68,68,0.08),rgba(190,18,60,0.05))",
            border: "1.5px solid rgba(239,68,68,0.2)",
          }}
        >
          <p className="text-xs font-display font-black tracking-[0.18em] text-rose-400 mb-3">COMING SOON</p>
          <div className="space-y-2.5 mb-4">
            {[
              "Buy with verified confidence — no surprises",
              "Request a GUBER inspection before you purchase",
              "Avoid scams completely with proof-backed listings",
            ].map((point) => (
              <div key={point} className="flex items-start gap-2.5">
                <CheckCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/80 leading-snug">{point}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground italic leading-relaxed">
            This isn't just listings — it's proof-backed buying.
          </p>
        </div>

        {/* Notify Me */}
        <Button
          onClick={handleNotifyMe}
          className="w-full h-12 gap-2 rounded-2xl font-display tracking-[0.1em] text-sm font-bold mb-8"
          style={{
            background: "linear-gradient(135deg,rgba(239,68,68,0.8),rgba(190,18,60,0.8))",
            border: "1px solid rgba(239,68,68,0.4)",
          }}
          data-testid="button-notify-me"
        >
          <Bell className="w-4 h-4" />
          NOTIFY ME WHEN IT'S LIVE
        </Button>

        {/* Example Listings */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-display font-bold text-foreground tracking-[0.15em] uppercase">Example Listings</p>
            <span className="text-[10px] font-display text-muted-foreground ml-1">· Display only</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {listings.map((listing) => (
              <FakeListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>

        {/* V&I connector */}
        <button
          onClick={() => navigate("/verify-inspect")}
          className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg,rgba(139,92,246,0.1),rgba(91,33,182,0.07))",
            border: "1.5px solid rgba(139,92,246,0.25)",
          }}
          data-testid="button-vi-link-marketplace"
        >
          <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(139,92,246,0.2)" }}>
            <ShieldCheck className="w-5 h-5 text-violet-400" strokeWidth={1.8} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-display font-bold text-violet-300 leading-tight">
              💡 Don't buy blind
            </p>
            <p className="text-[11px] text-violet-300/50 mt-0.5">Use Verify & Inspect today →</p>
          </div>
          <ChevronRight className="w-4 h-4 text-violet-400/50 shrink-0" />
        </button>

      </div>
    </GuberLayout>
  );
}
