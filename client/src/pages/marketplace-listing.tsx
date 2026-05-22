import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ShieldCheck, MapPin, Clock, Package, AlertCircle, ArrowLeft, Eye, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceItem } from "@shared/schema";

function statusLabel(status: string | null | undefined) {
  if (status === "sold") return "Sold";
  if (status === "pending") return "Sale Pending";
  if (status === "expired" || status === "removed") return "No Longer Available";
  return "Available";
}

export default function MarketplaceListing() {
  const { slug } = useParams();
  const [, navigate] = useLocation();

  const { data: item, isLoading, error } = useQuery<MarketplaceItem>({
    queryKey: ["/api/marketplace/slug", slug],
    queryFn: () => fetch(`/api/marketplace/slug/${slug}`).then(r => {
      if (!r.ok) throw new Error("Listing not found");
      return r.json();
    }),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-xl font-display font-bold">Listing Not Found</h1>
        <p className="text-muted-foreground text-sm">This listing may have been sold, removed, or expired.</p>
        <Button onClick={() => navigate("/marketplace")} className="premium-btn font-display">Browse Marketplace</Button>
      </div>
    );
  }

  const photos = item.photos as string[] | null;
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";
  const isAvailable = ["available", "active"].includes(item.status || "available");
  const seoTitle = `${item.title}${location ? ` for sale in ${location}` : ""} | GUBER`;
  const seoDescription = `View this listing on GUBER. Contact seller, request a viewing, or use GUBER Verify & Inspect before buying. ${item.description?.slice(0, 100) || ""}`;
  const price = item.price ? `$${item.price.toLocaleString()}` : item.askingType === "free" ? "Free" : "Contact for price";

  return (
    <>
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />
      {(!isAvailable) && <meta name="robots" content="noindex" />}
      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:type" content="website" />
      {photos && photos[0] && <meta property="og:image" content={photos[0]} />}

      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/marketplace")} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-display font-bold truncate">{item.title}</span>
        </div>

        {/* Photo */}
        {photos && photos.length > 0 ? (
          <div className="relative h-64 sm:h-80 bg-black overflow-hidden">
            <img src={photos[0]} alt={item.title} className="w-full h-full object-cover" />
            {photos.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                +{photos.length - 1} more
              </div>
            )}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center bg-muted/20">
            <Package className="w-14 h-14 text-muted-foreground" />
          </div>
        )}

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Status */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`text-xs font-display font-bold px-2.5 py-1 rounded-full ${isAvailable ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-gray-500/10 text-gray-400 border border-gray-500/20"}`}>
              {statusLabel(item.status)}
            </span>
            {item.guberVerified && (
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <ShieldCheck className="w-3 h-3" /> GUBER VERIFIED
              </span>
            )}
          </div>

          {/* Title & price */}
          <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">{item.category}</p>
          <h1 className="text-2xl font-display font-extrabold leading-tight mb-2">{item.title}</h1>
          <p className="text-2xl font-display font-black text-primary mb-4">{price}
            {(item.makeOfferEnabled || item.askingType === "obo") && <span className="text-sm font-normal text-muted-foreground ml-2">· Open to Offers</span>}
          </p>

          {/* Details */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-6 text-sm text-muted-foreground">
            {location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{location}</span>}
            {item.condition && <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" />{item.condition}</span>}
            {item.year && <span>Year: {item.year}</span>}
            {item.brand && <span>Brand: {item.brand}</span>}
            {item.model && <span>Model: {item.model}</span>}
            {item.createdAt && <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Listed {new Date(item.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
          </div>

          {/* V&I badge */}
          {item.guberVerified && (
            <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.2)" }}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-display font-bold text-emerald-400">GUBER Verified Item</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A local GUBER helper documented this item on-site with photos.
                {item.verifiedByName ? ` Verified by ${item.verifiedByName}.` : ""}
                {item.verificationDate ? ` On ${new Date(item.verificationDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Verify & Inspect provides visual proof and documentation only. It is not a guarantee of condition, authenticity, ownership, functionality, or future performance.</p>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div className="mb-6">
              <h2 className="text-sm font-display font-bold text-muted-foreground tracking-wider mb-3">DESCRIPTION</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* Seller */}
          <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">SELLER</p>
            <p className="text-sm font-bold">{item.sellerName || "GUBER Seller"}</p>
            {item.sellerAvailability && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.sellerAvailability === "available_now" ? "Available Now" :
                  item.sellerAvailability === "today" ? "Available Today" :
                    item.sellerAvailability === "this_week" ? "Available This Week" : "By Appointment"}
              </p>
            )}
          </div>

          {/* Disclaimer */}
          <div className="rounded-2xl p-4 mb-6 text-xs text-muted-foreground leading-relaxed"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            GUBER helps users list, discover, and verify items. GUBER does not own, inspect, guarantee, or process the sale of listed items unless a separate GUBER Verify & Inspect service is requested. Meet in a safe public location when possible. Do not share private address information until you are comfortable.
          </div>

          {/* CTA */}
          {isAvailable && (
            <div className="space-y-3">
              <Button className="w-full premium-btn font-display" onClick={() => navigate(`/marketplace`)}>
                <MessageCircle className="w-4 h-4 mr-2" /> Open in GUBER App
              </Button>
              <p className="text-center text-xs text-muted-foreground">Sign in to contact seller, make an offer, or request Verify & Inspect</p>
            </div>
          )}

          {/* GUBER branding */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">Listed on <span className="font-display font-bold text-primary">GUBER</span> · Simple listings with Verify & Inspect built in</p>
          </div>
        </div>
      </div>
    </>
  );
}
