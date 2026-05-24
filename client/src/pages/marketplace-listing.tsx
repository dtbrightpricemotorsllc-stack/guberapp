import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ShieldCheck, MapPin, Clock, Package, AlertCircle, ArrowLeft, Eye, MessageCircle, Zap, Expand, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MarketplacePhotoViewer } from "@/components/marketplace-photo-viewer";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isStoreBuild } from "@/lib/platform";
import { ExternalPurchaseSheet } from "@/components/external-purchase-sheet";
import type { MarketplaceItem } from "@shared/schema";

function statusLabel(status: string | null | undefined) {
  if (status === "sold") return "Sold";
  if (status === "pending") return "Sale Pending";
  if (status === "expired" || status === "removed") return "No Longer Available";
  return "Available";
}

function JsonLd({ item, seoTitle, seoDescription, canonicalUrl }: {
  item: MarketplaceItem;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
}) {
  const photos = item.photos as string[] | null;
  const details = (item.details as any) || {};
  const cat = (item.category || "").toLowerCase();
  const isVehicle = ["vehicles", "parts", "boats & marine", "trailers"].includes(cat);
  const isProperty = ["property"].includes(cat);

  const offerBlock = {
    "@type": "Offer",
    availability: item.status === "available"
      ? "https://schema.org/InStock"
      : "https://schema.org/Discontinued",
    priceCurrency: "USD",
    ...(item.price ? { price: item.price.toFixed(2) } : {}),
    seller: { "@type": "Person", name: item.sellerName || "GUBER Seller" },
  };

  let schema: Record<string, any>;

  if (isVehicle) {
    schema = {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: item.title,
      description: item.description || seoDescription,
      url: canonicalUrl,
      offers: offerBlock,
      ...(item.brand ? { brand: { "@type": "Brand", name: item.brand } } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(item.year ? { vehicleModelDate: String(item.year) } : {}),
      ...(item.condition ? { itemCondition: item.condition === "New" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition" } : {}),
      ...(details.mileage ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: details.mileage, unitCode: "SMI" } } : {}),
      ...(details.vin ? { vehicleIdentificationNumber: details.vin } : {}),
      ...(details.fuelType ? { fuelType: details.fuelType } : {}),
      ...(details.transmission ? { vehicleTransmission: details.transmission } : {}),
      ...(details.driveWheelConfig ? { driveWheelConfiguration: details.driveWheelConfig } : {}),
      ...(photos && photos.length > 0 ? { image: photos } : {}),
    };
  } else if (isProperty) {
    schema = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: item.title,
      description: item.description || seoDescription,
      url: canonicalUrl,
      offers: offerBlock,
      ...(item.city && item.state ? { address: { "@type": "PostalAddress", addressLocality: item.city, addressRegion: item.state, addressCountry: "US" } } : {}),
      ...(details.bedrooms ? { numberOfRooms: details.bedrooms } : {}),
      ...(details.sqft ? { floorSize: { "@type": "QuantitativeValue", value: details.sqft, unitCode: "FTK" } } : {}),
      ...(photos && photos.length > 0 ? { image: photos } : {}),
    };
  } else {
    schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.title,
      description: item.description || seoDescription,
      url: canonicalUrl,
      offers: offerBlock,
      ...(item.brand ? { brand: { "@type": "Brand", name: item.brand } } : {}),
      ...(photos && photos.length > 0 ? { image: photos } : {}),
      ...(item.category ? { category: item.category } : {}),
      ...(item.condition ? { itemCondition: item.condition === "New" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition" } : {}),
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function MarketplaceListing() {
  const { slug } = useParams();
  const [, navigate] = useLocation();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [buyerOrderSessionId, setBuyerOrderSessionId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("buyer_order") === "paid" && params.get("session_id")) {
      setBuyerOrderSessionId(params.get("session_id"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
      <>
        <title>Listing Not Found | GUBER</title>
        <meta name="robots" content="noindex, nofollow" />
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-xl font-display font-bold">Listing Not Found</h1>
          <p className="text-muted-foreground text-sm">This listing may have been sold, removed, or expired.</p>
          <Button onClick={() => navigate("/marketplace")} className="premium-btn font-display">Browse Marketplace</Button>
        </div>
      </>
    );
  }

  const photos = item.photos as string[] | null;
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";
  const isIndexable = ["available"].includes(item.status || "available");
  const canonicalUrl = `https://guberapp.app/marketplace/p/${item.publicSlug || slug}`;

  // SEO copy
  const categoryLabel = item.category || "item";
  const seoTitle = `${item.title}${location ? ` for sale in ${location}` : ""} | GUBER`;
  const seoDescription = `View this ${categoryLabel} listing on GUBER. Contact the seller, request a viewing, or use GUBER Verify & Inspect before buying.${item.description ? " " + item.description.slice(0, 100) : ""}`;
  const ogImage = photos && photos[0] ? photos[0] : "https://guberapp.app/icon-1024.png";

  const price = item.price
    ? `$${item.price.toLocaleString()}`
    : item.askingType === "free"
    ? "Free"
    : "Contact for price";

  const isBoostedActive = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const hasVin = !!item.vinNumber;

  const buyerOrderMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/${item.id}/buyer-order/checkout`, { slug: item.publicSlug || slug }),
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not start checkout", variant: "destructive" });
    },
  });

  const handleBuyerOrderClick = () => {
    if (!user) { navigate("/auth"); return; }
    buyerOrderMutation.mutate();
  };

  return (
    <>
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />
      <link rel="canonical" href={canonicalUrl} />
      <meta name="robots" content={isIndexable ? "index, follow" : "noindex, nofollow"} />

      {/* Open Graph */}
      <meta property="og:type" content="product" />
      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="GUBER" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seoTitle} />
      <meta name="twitter:description" content={seoDescription} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      <JsonLd item={item} seoTitle={seoTitle} seoDescription={seoDescription} canonicalUrl={canonicalUrl} />

      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/marketplace")} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-display font-bold truncate flex-1">{item.title}</span>
          {isBoostedActive && (
            <span className="flex items-center gap-1 text-[10px] font-display font-extrabold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "rgba(245,165,0,0.18)", border: "1.5px solid rgba(245,165,0,0.35)", color: "#f5a500" }}>
              <Zap className="w-2.5 h-2.5" /> FEATURED
            </span>
          )}
        </div>

        {/* Photo gallery */}
        {photos && photos.length > 0 ? (
          <div className="relative h-64 sm:h-80 bg-black overflow-hidden cursor-pointer" onClick={() => setViewerOpen(true)} data-testid="photo-gallery-hero">
            <img src={photos[photoIdx]} alt={item.title} className="w-full h-full object-cover" />
            {/* Expand hint */}
            <div className="absolute bottom-10 right-3 p-1 rounded-md bg-black/50 backdrop-blur-sm"
              style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
              <Expand className="w-3.5 h-3.5 text-white/70" />
            </div>
            {/* Dot nav for multiple photos */}
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" onClick={e => e.stopPropagation()}>
                {photos.map((_, i) => (
                  <button key={i} onClick={() => setPhotoIdx(i)}
                    className={`rounded-full transition-all ${i === photoIdx ? "bg-white scale-125" : "bg-white/40"}`}
                    style={{ width: i === photoIdx ? 16 : 6, height: 6 }}
                    data-testid={`button-photo-dot-${i}`} />
                ))}
              </div>
            )}
            {/* Prev / next arrows */}
            {photos.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i > 0 ? i - 1 : photos.length - 1)); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
                  data-testid="button-photo-prev">
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i < photos.length - 1 ? i + 1 : 0)); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
                  data-testid="button-photo-next">
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center bg-muted/20">
            <Package className="w-14 h-14 text-muted-foreground" />
          </div>
        )}
        {viewerOpen && photos && photos.length > 0 && (
          <MarketplacePhotoViewer photos={photos} initialIndex={photoIdx} onClose={() => setViewerOpen(false)} />
        )}

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Status badges */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`text-xs font-display font-bold px-2.5 py-1 rounded-full ${isIndexable ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-gray-500/10 text-gray-400 border border-gray-500/20"}`}>
              {statusLabel(item.status)}
            </span>
            {item.guberVerified && (
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <ShieldCheck className="w-3 h-3" /> GUBER VERIFIED
              </span>
            )}
            {isBoostedActive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(245,165,0,0.12)", border: "1px solid rgba(245,165,0,0.3)", color: "#f5a500" }}>
                <Zap className="w-3 h-3" /> FEATURED
                <InfoHint title="Featured Listing" description="This listing has been boosted by the seller. It appears higher in search results for a limited time." />
              </span>
            )}
          </div>

          {/* Title & price */}
          <p className="text-xs font-display font-bold text-muted-foreground tracking-wider mb-1">{item.category}</p>
          <h1 className="text-2xl font-display font-extrabold leading-tight mb-2">{item.title}</h1>
          <p className="text-2xl font-display font-black text-primary mb-4">{price}
            {(item.makeOfferEnabled || item.askingType === "obo") && (
              <span className="text-sm font-normal text-muted-foreground ml-2 inline-flex items-center gap-0.5">· Open to Offers
                <InfoHint title="Open to Offers" description="The seller is open to offers below the listed price. Use the 'Make Offer' button to propose a price." />
              </span>
            )}
          </p>

          {/* Details */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-6 text-sm text-muted-foreground">
            {location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{location}</span>}
            {item.condition && <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" />{item.condition}</span>}
            {item.year && <span>Year: {item.year}</span>}
            {item.brand && <span>Brand: {item.brand}</span>}
            {item.model && <span>Model: {item.model}</span>}
            {item.createdAt && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Listed {new Date(item.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            )}
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
              <p className="text-xs text-muted-foreground mt-2">Verify &amp; Inspect provides visual proof and documentation only. It is not a guarantee of condition, authenticity, ownership, functionality, or future performance.</p>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div className="mb-6">
              <h2 className="text-sm font-display font-bold text-muted-foreground tracking-wider mb-3">DESCRIPTION</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* ── Buyer's Order ── */}
          {hasVin && (
            <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(0,180,80,0.05)", border: "1px solid rgba(0,180,80,0.18)" }} data-testid="section-buyer-order">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-display font-bold text-primary">Buyer's Order</span>
                <InfoHint
                  title="What is a Buyer's Order?"
                  description="A Buyer's Order is a downloadable PDF of this vehicle listing's key information — formatted for sharing with banks, credit unions, or insurance providers."
                  bullets={[
                    "Email to your bank or credit union",
                    "Check insurance quotes",
                    "Share with a spouse or co-buyer",
                    "Print and review before meeting the seller",
                  ]}
                  warning="This is NOT financing, loan approval, a purchase contract, inspection report, or vehicle history report. It is listing information only."
                />
              </div>

              {buyerOrderSessionId ? (
                <div className="space-y-2">
                  <p className="text-xs text-emerald-400 font-display font-bold">✓ Payment confirmed — your Buyer's Order is ready.</p>
                  <a
                    href={`/api/marketplace/${item.id}/buyer-order/pdf?session_id=${buyerOrderSessionId}`}
                    download
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-display font-bold text-black transition-colors"
                    style={{ background: "#00e676" }}
                    data-testid="button-download-buyer-order"
                  >
                    <Download className="w-4 h-4" /> Download Buyer's Order PDF
                  </a>
                  <p className="text-[10px] text-muted-foreground text-center">Save the link above — you can re-download anytime using the same page URL.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Get a clean PDF of this vehicle's information to share with your bank, insurer, or partner.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    VIN: <span className="font-mono font-bold text-foreground/60 tracking-widest">
                      {(item.vinNumber || "").slice(0, -4).replace(/./g, "•")}{(item.vinNumber || "").slice(-4)}
                    </span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">(full VIN included in PDF)</span>
                  </p>
                  {isStoreBuild ? (
                    <ExternalPurchaseSheet
                      product="marketplace_buyer_order"
                      options={{ itemId: String(item.id), slug: item.publicSlug || slug || "" }}
                    >
                      {({ onPress, loading }) => (
                        <Button
                          className="w-full font-display text-sm gap-2"
                          style={{ background: "rgba(0,180,80,0.12)", border: "1px solid rgba(0,180,80,0.35)", color: "#00e676" }}
                          onClick={() => { if (!user) { navigate("/auth"); return; } onPress(); }}
                          disabled={loading}
                          data-testid="button-get-buyer-order"
                        >
                          {loading ? (
                            <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" /> Opening checkout…</span>
                          ) : (
                            <><Download className="w-4 h-4" /> Download Buyer's Order — $1.00</>
                          )}
                        </Button>
                      )}
                    </ExternalPurchaseSheet>
                  ) : (
                    <Button
                      className="w-full font-display text-sm gap-2"
                      style={{ background: "rgba(0,180,80,0.12)", border: "1px solid rgba(0,180,80,0.35)", color: "#00e676" }}
                      onClick={handleBuyerOrderClick}
                      disabled={buyerOrderMutation.isPending}
                      data-testid="button-get-buyer-order"
                    >
                      {buyerOrderMutation.isPending ? (
                        <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" /> Opening checkout…</span>
                      ) : (
                        <><Download className="w-4 h-4" /> Download Buyer's Order — $1.00</>
                      )}
                    </Button>
                  )}
                  {!user && (
                    <p className="text-[10px] text-muted-foreground text-center">Sign in required to purchase</p>
                  )}
                </div>
              )}
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
            GUBER helps users list, discover, and verify items. GUBER does not own, inspect, guarantee, or process the sale of listed items unless a separate GUBER Verify &amp; Inspect service is requested. Meet in a safe public location when possible.
          </div>

          {/* CTA */}
          {isIndexable && (
            <div className="space-y-3">
              <Button className="w-full premium-btn font-display" onClick={() => navigate(`/marketplace`)}>
                <MessageCircle className="w-4 h-4 mr-2" /> Open in GUBER App
              </Button>
              <p className="text-center text-xs text-muted-foreground">Sign in to contact seller, make an offer, or request Verify &amp; Inspect</p>
            </div>
          )}

          {/* GUBER branding */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">Listed on <span className="font-display font-bold text-primary">GUBER</span> · Local listings with Verify &amp; Inspect built in</p>
          </div>
        </div>
      </div>
    </>
  );
}
