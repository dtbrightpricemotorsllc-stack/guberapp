import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MarketplacePhotoViewer } from "@/components/marketplace-photo-viewer";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { isStoreBuild } from "@/lib/platform";
import { GuberLayout } from "@/components/guber-layout";
import { ListingWizard } from "@/components/marketplace-wizard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceItem } from "@shared/schema";
import {
  ShieldCheck, Plus, X, MapPin, Package, Car, Laptop, Sofa, Wrench, Shirt,
  Dumbbell, AlertCircle, CheckCircle, Clock, Zap, Star, Search, Filter,
  Eye, Calendar, Flag, ChevronDown, Anchor, Truck, Tag,
  Home, Archive, Layers, ArrowUpDown, Bed, Bath, Gauge, FileText,
  DollarSign, Users, PawPrint, Info, Expand,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "All", icon: Package },
  { name: "Vehicles", icon: Car },
  { name: "Property", icon: Home },
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

const REPORT_REASONS = ["Scam", "Prohibited item", "Offensive content", "Wrong category", "Duplicate", "Other"];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const AVAILABILITY_OPTIONS = [
  { value: "available_now", label: "Available Now" },
  { value: "today", label: "Available Today" },
  { value: "this_week", label: "Available This Week" },
  { value: "appointment", label: "By Appointment" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function availabilityLabel(val: string | null | undefined) {
  return AVAILABILITY_OPTIONS.find(o => o.value === val)?.label || "Available Now";
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

function fmtPrice(n: number | null | undefined) {
  if (!n) return null;
  return `$${n.toLocaleString()}`;
}

function listingTypeLabel(t: string | null | undefined) {
  if (!t) return null;
  const map: Record<string, string> = {
    cash_sale: "Cash Only", financing: "Financing Available", bhph: "Buy Here Pay Here",
    lease: "Lease Available", trade: "Trade/Barter", parts_only: "Parts Only",
    rental: "Rental Available", for_rent: "For Rent", for_sale: "For Sale",
    short_term: "Short-Term Stay", lease_option: "Lease Option",
    owner_financing: "Owner Financing", roommate: "Roommate Wanted",
  };
  return map[t] || t.replace(/_/g, " ");
}

// ─── VERIFIED BADGE ───────────────────────────────────────────────────────────

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

// ─── PRICE DISPLAY ────────────────────────────────────────────────────────────

function PriceDisplay({ item, large }: { item: MarketplaceItem; large?: boolean }) {
  const sz = large ? "text-2xl" : "text-sm";
  const details = (item.details as any) || {};
  if (item.askingType === "free") return <span className={`${sz} font-display font-black text-emerald-400`}>FREE</span>;

  // For lease — show monthly
  if (item.listingType === "lease" && details.monthlyPayment) {
    return (
      <span className={`${sz} font-display font-black text-primary`}>
        ${details.monthlyPayment.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo (lease)</span>
      </span>
    );
  }
  // For rent — show rent
  if (item.listingType === "for_rent" && item.price) {
    return <span className={`${sz} font-display font-black text-primary`}>${item.price.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>;
  }
  if (item.makeOfferEnabled || item.askingType === "obo") {
    return (
      <span className={`${sz} font-display font-black text-primary`}>
        {item.price ? `$${item.price.toLocaleString()}` : "Make Offer"}
        <span className="text-xs font-normal text-muted-foreground ml-1">OBO</span>
      </span>
    );
  }
  return <span className={`${sz} font-display font-black text-primary`}>{item.price ? `$${item.price.toLocaleString()}` : "Contact"}</span>;
}

// ─── ITEM CARD ────────────────────────────────────────────────────────────────

function ItemCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  const photos = item.photos as string[] | null;
  const hasPhoto = photos && photos.length > 0;
  const isBoosted = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const sb = statusBadge(item.status);
  const avail = availabilityColor(item.sellerAvailability);
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";
  const details = (item.details as any) || {};
  const isSample = (item as any).isSample;
  const isVehicle = item.category === "Vehicles";
  const isProperty = item.category === "Property";

  return (
    <div
      className="glass-card rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={isBoosted
        ? { border: "1.5px solid rgba(245,165,0,0.4)", boxShadow: "0 0 16px rgba(245,165,0,0.08)" }
        : { border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={onClick}
      data-testid={`card-marketplace-${item.id}`}
    >
      {/* Photo */}
      <div className="relative h-44 bg-muted/30 flex items-center justify-center overflow-hidden">
        {hasPhoto ? (
          <img src={photos![0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Package className="w-8 h-8 opacity-30" />
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
        {isSample && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.8)", color: "#fff" }}>
              SAMPLE
            </span>
          </div>
        )}
        {!isSample && item.condition && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "#e5e7eb" }}>
              {item.condition.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-0.5">{item.category}</p>
        <h3 className="text-xs font-bold text-foreground leading-snug mb-1.5 line-clamp-2" data-testid={`text-item-title-${item.id}`}>{item.title}</h3>

        <div className="flex items-baseline gap-2 mb-1.5">
          <PriceDisplay item={item} />
          {item.listingType && (
            <span className="text-[10px] text-muted-foreground">{listingTypeLabel(item.listingType)}</span>
          )}
        </div>

        {/* Vehicle quick-facts */}
        {isVehicle && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
            {item.vehicleMileage && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Gauge className="w-2.5 h-2.5" />{item.vehicleMileage.toLocaleString()} mi</span>}
            {item.titleStatus && <span className="text-[10px] text-muted-foreground">{item.titleStatus}</span>}
            {item.sellerType && <span className="text-[10px] text-muted-foreground">{item.sellerType}</span>}
          </div>
        )}

        {/* Property quick-facts */}
        {isProperty && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
            {details.bedrooms && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Bed className="w-2.5 h-2.5" />{details.bedrooms} bed</span>}
            {details.bathrooms && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Bath className="w-2.5 h-2.5" />{details.bathrooms} bath</span>}
            {details.deposit && <span className="text-[10px] text-muted-foreground">Dep: ${details.deposit.toLocaleString()}</span>}
          </div>
        )}

        <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
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

// ─── TRANSPARENCY PANELS ──────────────────────────────────────────────────────

function VehicleTransparency({ item }: { item: MarketplaceItem }) {
  const d = (item.details as any) || {};
  const rows: { label: string; value: string; warn?: boolean }[] = [];
  if (item.vinNumber) rows.push({ label: "VIN", value: item.vinNumber });
  if (item.vehicleMileage) rows.push({ label: "Mileage", value: `${item.vehicleMileage.toLocaleString()} miles` });
  if (item.titleStatus) rows.push({ label: "Title Status", value: item.titleStatus, warn: item.titleStatus !== "Clean Title" });
  if (item.sellerType) rows.push({ label: "Seller Type", value: item.sellerType });
  if (item.listingType && item.listingType !== "cash_sale") {
    if (d.downPayment) rows.push({ label: "Down Payment", value: `$${d.downPayment.toLocaleString()}` });
    if (d.monthlyPayment) rows.push({ label: "Monthly Payment", value: `$${d.monthlyPayment.toLocaleString()}/mo` });
    if (d.termLength) rows.push({ label: "Term Length", value: d.termLength });
    if (d.interestRate) rows.push({ label: "Interest Rate", value: `${d.interestRate}%` });
    if (d.dueAtSigning) rows.push({ label: "Due at Signing", value: `$${d.dueAtSigning.toLocaleString()}` });
    if (d.mileageLimit) rows.push({ label: "Mileage Limit/yr", value: `${d.mileageLimit.toLocaleString()} mi` });
    if (d.creditCheckRequired !== undefined) rows.push({ label: "Credit Check Required", value: d.creditCheckRequired ? "Yes" : "No" });
    if (d.creditCheckRequired && d.minCreditScore) rows.push({ label: "Min Credit Score", value: String(d.minCreditScore) });
    if (d.proofOfIncomeRequired !== undefined) rows.push({ label: "Proof of Income", value: d.proofOfIncomeRequired ? "Required" : "Not Required" });
  }
  if (d.transmission) rows.push({ label: "Transmission", value: d.transmission });
  if (d.fuelType) rows.push({ label: "Fuel Type", value: d.fuelType });
  if (d.engine) rows.push({ label: "Engine", value: d.engine });
  if (d.driveType) rows.push({ label: "Drive Type", value: d.driveType });
  if (d.exteriorColor) rows.push({ label: "Exterior Color", value: d.exteriorColor });

  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)" }}>
        <Car className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-display font-bold text-muted-foreground tracking-wider">VEHICLE DETAILS</p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-center px-3 py-2 text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-bold ${r.warn ? "text-amber-400" : "text-foreground"}`}>{r.value}</span>
          </div>
        ))}
      </div>
      {d.conditionFlags && d.conditionFlags.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-2">CONDITION FLAGS</p>
          <div className="flex flex-wrap gap-1.5">
            {d.conditionFlags.map((f: string) => (
              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(0,229,118,0.08)", border: "1px solid rgba(0,229,118,0.2)", color: "#4ade80" }}>
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyTransparency({ item }: { item: MarketplaceItem }) {
  const d = (item.details as any) || {};
  const lt = item.listingType;
  const isRent = lt === "for_rent" || lt === "roommate";
  const rows: { label: string; value: string; icon?: any }[] = [];
  if (d.propertyType) rows.push({ label: "Property Type", value: d.propertyType });
  if (d.bedrooms) rows.push({ label: "Bedrooms", value: d.bedrooms, icon: Bed });
  if (d.bathrooms) rows.push({ label: "Bathrooms", value: d.bathrooms, icon: Bath });
  if (d.squareFeet) rows.push({ label: "Sq Ft", value: `${d.squareFeet.toLocaleString()} sq ft` });
  if (d.yearBuilt) rows.push({ label: "Year Built", value: String(d.yearBuilt) });
  if (isRent && d.deposit) rows.push({ label: "Security Deposit", value: `$${d.deposit.toLocaleString()}`, icon: DollarSign });
  if (d.applicationFee) rows.push({ label: "Application Fee", value: `$${d.applicationFee.toLocaleString()}` });
  if (d.availableDate) rows.push({ label: "Available Date", value: new Date(d.availableDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), icon: Calendar });
  if (d.leaseLength) rows.push({ label: "Lease Length", value: d.leaseLength });
  if (isRent) {
    if (d.incomeRequirement && d.incomeRequirement !== "None") rows.push({ label: "Income Requirement", value: d.incomeRequirement, icon: DollarSign });
    rows.push({ label: "Credit Check Required", value: d.creditCheckRequired ? "Yes" : "No" });
    if (d.creditCheckRequired && d.minCreditScore) rows.push({ label: "Min Credit Score", value: String(d.minCreditScore) });
    rows.push({ label: "Background Check", value: d.backgroundCheck ? "Required" : "Not Required" });
    rows.push({ label: "Evictions Accepted", value: d.evictionsAccepted || "No" });
    rows.push({ label: "Section 8", value: d.section8 || "No" });
    rows.push({ label: "Pets Allowed", value: d.petPolicy || "No", icon: PawPrint });
    if (d.petPolicy && d.petPolicy !== "No") {
      if (d.petDeposit) rows.push({ label: "Pet Deposit", value: `$${d.petDeposit.toLocaleString()}` });
      if (d.petRent) rows.push({ label: "Pet Rent/mo", value: `$${d.petRent.toLocaleString()}` });
    }
  }
  if (d.listingSource) rows.push({ label: "Listed By", value: d.listingSource, icon: Users });
  if (d.ownerFinancing) rows.push({ label: "Owner Financing", value: "Available" });

  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)" }}>
        <Home className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-display font-bold text-muted-foreground tracking-wider">PROPERTY DETAILS</p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-center px-3 py-2 text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-bold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
      {d.features && d.features.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-2">FEATURES</p>
          <div className="flex flex-wrap gap-1.5">
            {d.features.map((f: string) => (
              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(0,229,118,0.08)", border: "1px solid rgba(0,229,118,0.2)", color: "#4ade80" }}>
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GenericDetailsPanel({ item }: { item: MarketplaceItem }) {
  const d = (item.details as any) || {};
  const rows: { label: string; value: string }[] = [];
  if (item.brand) rows.push({ label: "Brand", value: item.brand });
  if (item.model) rows.push({ label: "Model", value: item.model });
  if (item.year) rows.push({ label: "Year", value: String(item.year) });
  if (d.toolType) rows.push({ label: "Tool Type", value: d.toolType });
  if (d.worksProper) rows.push({ label: "Works Properly", value: d.worksProper });
  if (d.batteryIncluded && d.batteryIncluded !== "N/A") rows.push({ label: "Battery Included", value: d.batteryIncluded });
  if (d.chargerIncluded && d.chargerIncluded !== "N/A") rows.push({ label: "Charger Included", value: d.chargerIncluded });
  if (d.rentalAvailable) rows.push({ label: "Rental Available", value: `Yes${d.rentalPrice ? ` – $${d.rentalPrice}/day` : ""}` });
  if (d.deviceType) rows.push({ label: "Device Type", value: d.deviceType });
  if (d.storageSize) rows.push({ label: "Storage", value: d.storageSize });
  if (d.carrier) rows.push({ label: "Carrier", value: d.carrier });
  if (d.unlocked) rows.push({ label: "Unlocked", value: d.unlocked });
  if (d.crackedScreen) rows.push({ label: "Cracked Screen", value: "Yes" });
  if (d.batteryHealth) rows.push({ label: "Battery Health", value: d.batteryHealth });
  if (d.includesCharger !== undefined) rows.push({ label: "Includes Charger", value: d.includesCharger ? "Yes" : "No" });
  if (d.furnitureType) rows.push({ label: "Type", value: d.furnitureType });
  if (d.material) rows.push({ label: "Material", value: d.material });
  if (d.color) rows.push({ label: "Color", value: d.color });
  if (d.dimensions) rows.push({ label: "Dimensions", value: d.dimensions });
  if (d.deliveryAvailable) rows.push({ label: "Delivery", value: "Available" });
  if (d.assemblyRequired) rows.push({ label: "Assembly Required", value: "Yes" });
  if (d.applianceType) rows.push({ label: "Appliance Type", value: d.applianceType });
  if (d.gasOrElectric && d.gasOrElectric !== "N/A") rows.push({ label: "Gas/Electric", value: d.gasOrElectric });
  if (d.installationAvailable) rows.push({ label: "Installation", value: "Available" });
  if (d.warrantyRemaining) rows.push({ label: "Warranty", value: "Remaining" });
  if (d.boatType) rows.push({ label: "Boat Type", value: d.boatType });
  if (d.engineType) rows.push({ label: "Engine Type", value: d.engineType });
  if (d.hours) rows.push({ label: "Engine Hours", value: d.hours });
  if (d.trailerIncluded) rows.push({ label: "Trailer Included", value: "Yes" });
  if (d.boatRuns) rows.push({ label: "Runs Well", value: d.boatRuns });
  if (d.trailerType) rows.push({ label: "Trailer Type", value: d.trailerType });
  if (d.tiresGood) rows.push({ label: "Tires", value: "Good" });
  if (d.lightsWork) rows.push({ label: "Lights", value: "Work" });
  if (d.compatibleMake || d.compatibleModel) rows.push({ label: "Fits", value: `${d.compatibleMake || ""} ${d.compatibleModel || ""}`.trim() });
  if (d.compatibleYears) rows.push({ label: "Fit Years", value: d.compatibleYears });

  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)" }}>
        <Info className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-display font-bold text-muted-foreground tracking-wider">ITEM DETAILS</p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-center px-3 py-2 text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-bold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BUYER MODALS ─────────────────────────────────────────────────────────────

const inputClass = "w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

function MakeOfferModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/marketplace/${item.id}/offer`, data),
    onSuccess: (data: any) => {
      if (data?.filtered) {
        toast({ title: "Offer not sent", description: data.message || "Below acceptable range.", variant: "destructive" });
      } else {
        toast({ title: "Offer sent!" });
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
        onClose();
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-make-offer">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Make an Offer</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Asking: <span className="text-foreground font-bold">{item.price ? `$${item.price.toLocaleString()}` : "Open"}</span> · You get 4 total offer actions.</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">YOUR OFFER ($)</label>
            <input className={inputClass} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} data-testid="input-offer-amount" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">MESSAGE (OPTIONAL)</label>
            <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Introduce yourself…" value={message} onChange={e => setMessage(e.target.value)} />
          </div>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          Accepted offers do not complete a purchase through GUBER. Buyer and seller are responsible for completing the transaction safely.
        </div>
        <Button onClick={() => { const a = parseFloat(amount); if (!a || a <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; } mutation.mutate({ offerAmount: a, message }); }}
          disabled={mutation.isPending} className="w-full premium-btn font-display" data-testid="button-submit-offer">
          {mutation.isPending ? "Sending…" : "SEND OFFER"}
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
    onSuccess: () => { toast({ title: "Viewing requested!" }); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="modal-request-viewing">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-display font-extrabold">Request a Viewing</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(245,165,0,0.06)", border: "1px solid rgba(245,165,0,0.15)" }}>
          Meet in a safe public location when possible.
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">PREFERRED DATE & TIME</label>
            <input className={inputClass} type="datetime-local" value={date} onChange={e => setDate(e.target.value)} data-testid="input-viewing-date" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground tracking-wider block mb-1.5">NOTE (OPTIONAL)</label>
            <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Any requests or notes…" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mutation.mutate({ requestedTime: date || null, note })} disabled={mutation.isPending}
          className="w-full premium-btn font-display" data-testid="button-submit-viewing">
          {mutation.isPending ? "Sending…" : "REQUEST VIEWING"}
        </Button>
      </div>
    </div>
  );
}

function RequestVIModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/${item.id}/vi-request`, {}),
    onSuccess: (data: any) => {
      toast({ title: "V&I Task Created!", description: `Job #${data.jobId} created. A local helper will verify the item.` });
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
        <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.18)" }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-display font-bold text-emerald-400">What happens next</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <li>• A hidden task is created for local GUBER helpers</li>
            <li>• An eligible helper nearby accepts and visits the item in person</li>
            <li>• They document it with photos based on a <strong className="text-foreground">{item.category}</strong> checklist</li>
            <li>• You receive a proof report — listing can earn the GUBER Verified badge</li>
            <li>• Neither buyer nor seller can accept this task</li>
          </ul>
        </div>
        <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          Verify &amp; Inspect provides visual proof and documentation only. It is not a guarantee of condition, authenticity, ownership, functionality, or future performance.
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full premium-btn font-display" data-testid="button-confirm-vi-request">
          {mutation.isPending ? "Creating Task…" : "REQUEST VERIFY & INSPECT"}
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
    onSuccess: () => { toast({ title: "Report submitted" }); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
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
            <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Describe the issue…" value={details} onChange={e => setDetails(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mutation.mutate({ reason, details })} disabled={mutation.isPending || !reason}
          className="w-full font-display" variant="destructive" data-testid="button-submit-report">
          {mutation.isPending ? "Submitting…" : "SUBMIT REPORT"}
        </Button>
      </div>
    </div>
  );
}

// ─── ITEM DETAIL MODAL ────────────────────────────────────────────────────────

function SellerOffersPanel({ item }: { item: MarketplaceItem }) {
  const { toast } = useToast();
  const [counterAmt, setCounterAmt] = useState<Record<number, string>>({});
  const [showCounter, setShowCounter] = useState<number | null>(null);

  const { data: offers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/marketplace", item.id, "offers"],
    queryFn: () => fetch(`/api/marketplace/${item.id}/offers`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ offerId, action, counterAmount }: { offerId: number; action: string; counterAmount?: number }) =>
      apiRequest("PATCH", `/api/marketplace/offers/${offerId}`, { action, counterAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace", item.id, "offers"] });
      setShowCounter(null);
      toast({ title: "Offer updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="h-10 rounded-xl bg-white/5 animate-pulse" />;
  const pending = (offers || []).filter((o: any) => ["pending", "countered"].includes(o.status));
  if (!pending.length) return null;

  return (
    <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: "1.5px solid rgba(99,102,241,0.3)" }}>
      <div className="px-3 py-2" style={{ background: "rgba(99,102,241,0.1)" }}>
        <p className="text-[11px] font-display font-bold tracking-wider" style={{ color: "#818cf8" }}>
          INCOMING OFFERS · {pending.length}
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {pending.map((offer: any) => {
          const exchanges = offer.offerActionCount ?? 0;
          const remaining = 4 - exchanges;
          const expires = offer.expiresAt ? new Date(offer.expiresAt) : null;
          const isExpired = expires ? expires < new Date() : false;
          const status = offer.status as string;
          return (
            <div key={offer.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">${Number(offer.offerAmount).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">
                    from {offer.buyerName || "Buyer"}
                    {status === "countered" && " · awaiting their response"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-display font-bold" style={{ color: remaining <= 1 ? "#f87171" : "#9ca3af" }}>
                    {remaining} exchange{remaining !== 1 ? "s" : ""} left
                  </p>
                  {expires && !isExpired && (
                    <p className="text-[10px] text-muted-foreground">
                      Expires {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {isExpired && <p className="text-[10px] text-red-400">Expired</p>}
                </div>
              </div>
              {offer.message && (
                <p className="text-xs text-muted-foreground italic">"{offer.message}"</p>
              )}
              {!isExpired && status !== "countered" && (
                <>
                  {showCounter === offer.id ? (
                    <div className="flex gap-2">
                      <input type="number" placeholder="Counter $" value={counterAmt[offer.id] || ""}
                        onChange={e => setCounterAmt(prev => ({ ...prev, [offer.id]: e.target.value }))}
                        className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white"
                        data-testid={`input-counter-${offer.id}`} />
                      <button onClick={() => actionMutation.mutate({ offerId: offer.id, action: "counter", counterAmount: parseFloat(counterAmt[offer.id] || "0") })}
                        disabled={!counterAmt[offer.id] || actionMutation.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-display font-bold disabled:opacity-40"
                        style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#818cf8" }}
                        data-testid={`button-send-counter-${offer.id}`}>Send</button>
                      <button onClick={() => setShowCounter(null)}
                        className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white transition-colors"
                        data-testid={`button-cancel-counter-${offer.id}`}>✕</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => actionMutation.mutate({ offerId: offer.id, action: "accept" })}
                        disabled={actionMutation.isPending}
                        className="flex-1 py-1.5 rounded-lg text-xs font-display font-bold disabled:opacity-40"
                        style={{ background: "rgba(0,229,118,0.15)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e676" }}
                        data-testid={`button-accept-offer-${offer.id}`}>Accept</button>
                      {remaining > 0 && (
                        <button onClick={() => setShowCounter(offer.id)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-display font-bold"
                          style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8" }}
                          data-testid={`button-counter-offer-${offer.id}`}>Counter</button>
                      )}
                      <button onClick={() => actionMutation.mutate({ offerId: offer.id, action: "decline" })}
                        disabled={actionMutation.isPending}
                        className="flex-1 py-1.5 rounded-lg text-xs font-display font-bold disabled:opacity-40"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                        data-testid={`button-decline-offer-${offer.id}`}>Decline</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemDetailModal({ item, onClose, currentUser }: { item: MarketplaceItem; onClose: () => void; currentUser?: any }) {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();
  const photos = item.photos as string[] | null;
  const [photoIdx, setPhotoIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [modal, setModal] = useState<"offer" | "viewing" | "vi" | "report" | null>(null);
  const isBoostedActive = item.boosted && item.boostedUntil && new Date(item.boostedUntil) > new Date();
  const isSeller = currentUser && item.sellerId === currentUser.id;
  const isAvailable = ["available", "active"].includes(item.status || "available");
  const location = item.city && item.state ? `${item.city}, ${item.state}` : item.locationApprox || "";
  const sb = statusBadge(item.status);
  const avail = availabilityColor(item.sellerAvailability);
  const isSample = (item as any).isSample;
  const [showBoostPanel, setShowBoostPanel] = useState(false);

  const boostMutation = useMutation({
    mutationFn: (boostType: "24h" | "3day" | "7day") =>
      apiRequest("POST", `/api/marketplace/${item.id}/boost-checkout`, { boostType }),
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
            <div className="relative h-64 bg-black/40 overflow-hidden cursor-pointer" onClick={() => setViewerOpen(true)}>
              <img src={photos[photoIdx]} alt={item.title} className="w-full h-full object-cover" />
              {/* Expand hint */}
              <div className="absolute bottom-10 right-3 p-1 rounded-md bg-black/50 backdrop-blur-sm"
                style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
                <Expand className="w-3.5 h-3.5 text-white/70" />
              </div>
              {photos.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" onClick={e => e.stopPropagation()}>
                  {photos.map((_, i) => (
                    <button key={i} onClick={() => setPhotoIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === photoIdx ? "bg-white scale-125" : "bg-white/40"}`} />
                  ))}
                </div>
              )}
              <button onClick={e => { e.stopPropagation(); onClose(); }} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 backdrop-blur-sm" data-testid="button-close-modal">
                <X className="w-4 h-4 text-white" />
              </button>
              {isSample && (
                <div className="absolute top-3 left-3">
                  <span className="text-[10px] font-display font-bold px-2 py-1 rounded-full"
                    style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>
                    SAMPLE / DELETE ME
                  </span>
                </div>
              )}
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
            {/* Status badges */}
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
              {item.listingType && (
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8" }}>
                  {listingTypeLabel(item.listingType)}
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
            </div>

            {/* Basic info row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-muted-foreground">
              {location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>}
              {item.condition && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{item.condition}</span>}
              {item.year && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Year: {item.year}</span>}
              {item.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Listed {new Date(item.createdAt).toLocaleDateString()}</span>}
            </div>

            {/* Transparency panels */}
            {item.category === "Vehicles" && <VehicleTransparency item={item} />}
            {item.category === "Property" && <PropertyTransparency item={item} />}
            {!["Vehicles", "Property"].includes(item.category) && <GenericDetailsPanel item={item} />}

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
                  <p className="text-[10px] text-muted-foreground mt-1">Verify &amp; Inspect provides visual proof only — not a guarantee of condition, authenticity, or functionality.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-display font-bold text-muted-foreground">Not Yet Verified</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">No on-site visual proof on file. Request V&amp;I below to get a local helper to document this item.</p>
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

            {/* Seller credibility */}
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-display font-bold text-foreground">{item.sellerName || "Seller"}</p>
                <div className="flex items-center gap-1.5">
                  {(item as any).sellerIdentityVerified && (
                    <span className="flex items-center gap-0.5 text-[10px] font-display font-bold" style={{ color: "#22c55e" }}>
                      <CheckCircle className="w-3 h-3" /> ID Verified
                    </span>
                  )}
                  {(item as any).sellerTrustScore >= 80 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-display font-bold" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac" }}>Trusted</span>
                  )}
                  {(item as any).sellerTrustScore >= 60 && (item as any).sellerTrustScore < 80 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-display font-bold" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#93c5fd" }}>Verified</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {(item as any).sellerRating > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] text-yellow-400">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    <span className="font-bold">{((item as any).sellerRating as number).toFixed(1)}</span>
                    <span className="text-muted-foreground">({(item as any).sellerReviewCount} reviews)</span>
                  </span>
                )}
                {(item as any).sellerCompletedJobs > 0 && (
                  <span className="text-[11px] text-muted-foreground">{(item as any).sellerCompletedJobs} jobs completed</span>
                )}
                {item.sellerType && <span className="text-[11px] text-muted-foreground">{item.sellerType}</span>}
                <span className="text-[11px]" style={{ color: availabilityColor(item.sellerAvailability).color }}>{availabilityLabel(item.sellerAvailability)}</span>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl p-3 mb-4 text-[11px] text-muted-foreground leading-relaxed"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              GUBER helps users list, discover, and verify items. GUBER does not own, inspect, guarantee, or process the sale of listed items unless a separate GUBER Verify &amp; Inspect service is requested.
            </div>

            {/* Actions */}
            {isSeller && <SellerOffersPanel item={item} />}

            {isSeller ? (
              <div className="space-y-2">
                {!isStoreBuild && !isDemoUser && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1.5px solid rgba(245,165,0,0.3)" }}>
                    <button onClick={() => setShowBoostPanel(p => !p)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-display font-bold transition-all"
                      style={{ background: "rgba(245,165,0,0.10)", color: "#f5a500" }}
                      data-testid="button-toggle-boost-panel">
                      <span className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" />
                        {isBoostedActive ? `BOOSTED · Expires ${new Date((item as any).boostedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "BOOST LISTING"}
                      </span>
                      <span className="text-muted-foreground text-[10px]">{showBoostPanel ? "▲" : "▼"}</span>
                    </button>
                    {showBoostPanel && (
                      <div className="p-3 space-y-2" style={{ background: "rgba(245,165,0,0.04)" }}>
                        <p className="text-[11px] text-muted-foreground mb-2">Higher placement in search and category results.</p>
                        {([
                          { type: "24h" as const, label: "24 Hours", price: "$2.99", desc: "Boosted badge + higher placement" },
                          { type: "3day" as const, label: "3 Days", price: "$6.99", desc: "Priority over 24h boosts" },
                          { type: "7day" as const, label: "7 Days", price: "$12.99", desc: "Top priority boost" },
                        ]).map(tier => (
                          <button key={tier.type} onClick={() => boostMutation.mutate(tier.type)}
                            disabled={boostMutation.isPending}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-display font-bold transition-all hover:scale-[1.01] disabled:opacity-60"
                            style={{ background: "rgba(245,165,0,0.12)", border: "1px solid rgba(245,165,0,0.25)", color: "#f5a500" }}
                            data-testid={`button-boost-${tier.type}`}>
                            <span className="flex flex-col items-start gap-0.5">
                              <span>{tier.label}</span>
                              <span className="text-[10px] font-normal text-muted-foreground">{tier.desc}</span>
                            </span>
                            <span>{boostMutation.isPending ? "…" : tier.price}</span>
                          </button>
                        ))}
                        {item.guberVerified && (
                          <p className="text-[10px] text-emerald-500 leading-relaxed">✓ Verified listings may rank higher — you already have a trust advantage.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => statusMutation.mutate("pending")} disabled={statusMutation.isPending || !isAvailable}
                    className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(245,165,0,0.1)", border: "1px solid rgba(245,165,0,0.25)", color: "#f5a500" }}
                    data-testid="button-mark-pending">Mark Pending</button>
                  <button onClick={() => statusMutation.mutate("sold")} disabled={statusMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                    style={{ background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.2)", color: "#9ca3af" }}
                    data-testid="button-mark-sold">Mark Sold</button>
                  {!isAvailable && (
                    <button onClick={() => statusMutation.mutate("available")} disabled={statusMutation.isPending}
                      className="flex-1 py-2.5 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40"
                      style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.25)", color: "#00e676" }}
                      data-testid="button-mark-available">Relist</button>
                  )}
                </div>
              </div>
            ) : currentUser ? (
              <div className="space-y-2">
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
                    <ShieldCheck className="w-3.5 h-3.5" /> Verify Before Buying
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
              <p className="text-center text-xs text-muted-foreground">Sign in to make an offer or request verification</p>
            )}
          </div>
        </div>
      </div>

      {modal === "offer" && <MakeOfferModal item={item} onClose={() => setModal(null)} />}
      {modal === "viewing" && <RequestViewingModal item={item} onClose={() => setModal(null)} />}
      {modal === "vi" && <RequestVIModal item={item} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportListingModal item={item} onClose={() => setModal(null)} />}
      {viewerOpen && photos && photos.length > 0 && (
        <MarketplacePhotoViewer photos={photos} initialIndex={photoIdx} onClose={() => setViewerOpen(false)} />
      )}
    </>
  );
}

// ─── MY LISTINGS TAB ──────────────────────────────────────────────────────────

function MyListingsTab({ onSelectItem }: { onSelectItem: (item: MarketplaceItem) => void }) {
  const { data: rawListings, isLoading } = useQuery<MarketplaceItem[]>({
    queryKey: ["/api/marketplace/my-listings"],
    queryFn: () => fetch("/api/marketplace/my-listings").then(r => r.json()),
  });
  const listings: MarketplaceItem[] = Array.isArray(rawListings) ? rawListings : [];

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-20" />)}</div>;
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
        const isSample = (item as any).isSample;
        return (
          <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-white/5 transition-all"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }} onClick={() => onSelectItem(item)}
            data-testid={`my-listing-${item.id}`}>
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted/30 shrink-0">
              {photos && photos[0] ? <img src={photos[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-muted-foreground m-auto mt-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.price ? `$${item.price.toLocaleString()}` : "Free"} · {item.category}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                style={{ background: sb.bg, border: `1px solid ${sb.border}`, color: sb.color }}>{sb.label}</span>
              {isSample && <span className="text-[9px] font-bold text-red-400">SAMPLE</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Marketplace() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"browse" | "my">("browse");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    priceMin: "", priceMax: "", verifiedOnly: false, sort: "default",
    makeOfferEnabled: false, listingType: "",
  });

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (activeCategory !== "All") params.set("category", activeCategory);
    if (search) params.set("search", search);
    if (filters.priceMin) params.set("priceMin", filters.priceMin);
    if (filters.priceMax) params.set("priceMax", filters.priceMax);
    if (filters.verifiedOnly) params.set("verifiedOnly", "true");
    if (filters.makeOfferEnabled) params.set("makeOfferEnabled", "true");
    if (filters.listingType) params.set("listingType", filters.listingType);
    if (filters.sort !== "default") params.set("sort", filters.sort);
    return `/api/marketplace?${params.toString()}`;
  };

  const { data: rawItems, isLoading } = useQuery<MarketplaceItem[]>({
    queryKey: ["/api/marketplace", activeCategory, search, filters],
    queryFn: () => fetch(buildUrl()).then(r => r.json()),
  });
  const items: MarketplaceItem[] = Array.isArray(rawItems) ? rawItems : [];

  const verifiedCount = items.filter(i => i.guberVerified).length;
  const hasActiveFilters = filters.priceMin || filters.priceMax || filters.verifiedOnly || filters.makeOfferEnabled || filters.listingType || filters.sort !== "default";

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-marketplace">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight">
              Marketplace <span className="text-xs font-normal text-primary ml-1 align-middle">BETA</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">List items free · Find local deals · Verify before you buy</p>
          </div>
          {user && (
            <Button size="sm" onClick={() => setShowWizard(true)}
              className="premium-btn font-display text-xs tracking-wider gap-1.5 shrink-0" data-testid="button-post-listing">
              <Plus className="w-3.5 h-3.5" /> LIST ITEM
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {[{ k: "browse", l: "Browse" }, { k: "my", l: "My Listings" }].map(({ k, l }) => (
            <button key={k} onClick={() => setTab(k as any)}
              className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
              style={tab === k
                ? { background: "rgba(0,229,118,0.12)", border: "1.5px solid rgba(0,229,118,0.3)", color: "#00e676" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
              data-testid={`tab-${k}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "my" ? (
          <MyListingsTab onSelectItem={setSelectedItem} />
        ) : (
          <>
            {/* Search */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  className="w-full bg-input border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  placeholder="Search listings…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && setSearch(searchInput)}
                  data-testid="input-search-listings"
                />
              </div>
              <button onClick={() => setSearch(searchInput)}
                className="px-3 py-2 rounded-xl text-xs font-display font-bold transition-all"
                style={{ background: "rgba(0,229,118,0.12)", border: "1px solid rgba(0,229,118,0.25)", color: "#00e676" }}>
                Search
              </button>
              <button onClick={() => setShowFilters(f => !f)}
                className="px-3 py-2 rounded-xl text-xs font-display font-bold transition-all relative"
                style={hasActiveFilters
                  ? { background: "rgba(0,229,118,0.12)", border: "1.5px solid rgba(0,229,118,0.35)", color: "#00e676" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#6b7280" }}
                data-testid="button-toggle-filters">
                <Filter className="w-3.5 h-3.5" />
                {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
              </button>
            </div>

            {/* Filters panel */}
            {showFilters && (
              <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-1">MIN PRICE</p>
                    <input type="number" placeholder="$0" className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50"
                      value={filters.priceMin} onChange={e => setFilters(f => ({ ...f, priceMin: e.target.value }))} />
                  </div>
                  <div>
                    <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-1">MAX PRICE</p>
                    <input type="number" placeholder="No limit" className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50"
                      value={filters.priceMax} onChange={e => setFilters(f => ({ ...f, priceMax: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-1.5">LISTING TYPE</p>
                  <select className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs focus:outline-none"
                    value={filters.listingType} onChange={e => setFilters(f => ({ ...f, listingType: e.target.value }))}>
                    <option value="">All Types</option>
                    <option value="cash_sale">Cash Only</option>
                    <option value="financing">Financing Available</option>
                    <option value="bhph">Buy Here Pay Here</option>
                    <option value="lease">Lease Available</option>
                    <option value="for_rent">For Rent</option>
                    <option value="for_sale">For Sale</option>
                    <option value="short_term">Short-Term Stay</option>
                    <option value="rental">Rental Available</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wider mb-1.5">SORT BY</p>
                  <select className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs focus:outline-none"
                    value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}
                    data-testid="select-sort">
                    <option value="default">Featured First</option>
                    <option value="newest">Newest First</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                    <input type="checkbox" className="accent-primary" checked={filters.verifiedOnly}
                      onChange={e => setFilters(f => ({ ...f, verifiedOnly: e.target.checked }))} />
                    Verified only
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                    <input type="checkbox" className="accent-primary" checked={filters.makeOfferEnabled}
                      onChange={e => setFilters(f => ({ ...f, makeOfferEnabled: e.target.checked }))} />
                    Open to offers
                  </label>
                </div>
                {hasActiveFilters && (
                  <button onClick={() => setFilters({ priceMin: "", priceMax: "", verifiedOnly: false, sort: "default", makeOfferEnabled: false, listingType: "" })}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display font-bold">
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* Category chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const active = activeCategory === cat.name;
                return (
                  <button key={cat.name} onClick={() => setActiveCategory(cat.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-display font-bold whitespace-nowrap transition-all shrink-0"
                    style={active
                      ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}
                    data-testid={`chip-category-${cat.name.replace(/\s/g, "-").toLowerCase()}`}>
                    <Icon className="w-3 h-3" />{cat.name}
                  </button>
                );
              })}
            </div>

            {/* Stats bar */}
            {items.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
                <span>{items.length} listing{items.length !== 1 ? "s" : ""}{activeCategory !== "All" ? ` in ${activeCategory}` : ""}</span>
                {verifiedCount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-500 font-bold">
                    <ShieldCheck className="w-3 h-3" />{verifiedCount} verified
                  </span>
                )}
              </div>
            )}

            {/* Search clear */}
            {search && (
              <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                <span>Searching: <strong className="text-foreground">"{search}"</strong></span>
                <button onClick={() => { setSearch(""); setSearchInput(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="rounded-2xl bg-white/5 animate-pulse h-56" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-display font-bold">No listings found</p>
                <p className="text-xs mt-1 mb-4">
                  {search ? `No results for "${search}"` : activeCategory !== "All" ? `No ${activeCategory} listings yet` : "Be the first to list something!"}
                </p>
                {user && (
                  <Button size="sm" onClick={() => setShowWizard(true)} className="premium-btn font-display text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> LIST ITEM
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
          </>
        )}
      </div>

      {/* Listing wizard */}
      {showWizard && (
        <ListingWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => setShowWizard(false)}
        />
      )}

      {/* Item detail */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          currentUser={user}
        />
      )}
    </GuberLayout>
  );
}
