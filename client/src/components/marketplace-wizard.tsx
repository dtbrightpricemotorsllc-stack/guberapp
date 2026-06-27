import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { readListingPrefill, clearListingPrefill } from "@/lib/jac-listing-prefill";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  X, Camera, ChevronRight, ChevronLeft, Car, Home, Cpu, Wrench, Sofa, Shirt,
  Dumbbell, Archive, Anchor, Truck, Tag, Layers, ShieldCheck, Package, Zap,
  AlertCircle, Check, RefreshCw, Star, ImagePlus, ScanLine, Edit3, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadToCloudinarySigned } from "@/lib/cloudinary-upload";
import { detectContactInfo, CONTACT_WARN_MSG } from "@/lib/contact-filter";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const WIZARD_CATEGORIES = [
  { name: "Vehicles", icon: Car, desc: "Cars, trucks, SUVs, motorcycles" },
  { name: "Property", icon: Home, desc: "Rent, sale, short-term stays, land" },
  { name: "Parts", icon: Layers, desc: "Auto, moto, boat, equipment parts" },
  { name: "Boats & Marine", icon: Anchor, desc: "Boats, jet skis, marine equipment" },
  { name: "Trailers", icon: Truck, desc: "Utility, cargo, horse, equipment trailers" },
  { name: "Tools & Equipment", icon: Wrench, desc: "Construction, landscaping, hand tools" },
  { name: "Electronics", icon: Cpu, desc: "Phones, laptops, TVs, gaming" },
  { name: "Furniture", icon: Sofa, desc: "Couches, beds, tables, chairs" },
  { name: "Home & Garden", icon: Home, desc: "Decor, outdoor, garden, storage" },
  { name: "Clothing & Accessories", icon: Shirt, desc: "Clothes, shoes, bags, jewelry" },
  { name: "Collectibles", icon: Star, desc: "Sports cards, coins, memorabilia" },
  { name: "Sporting Goods", icon: Dumbbell, desc: "Fitness, bikes, hunting, fishing" },
  { name: "Appliances", icon: Archive, desc: "Washers, dryers, fridges, ovens" },
  { name: "Other", icon: Tag, desc: "Anything else" },
];

const VEHICLE_MAKES = [
  "Acura","Alfa Romeo","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler",
  "Dodge","Ferrari","Fiat","Ford","Genesis","GMC","Honda","Hyundai","Infiniti",
  "Jaguar","Jeep","Kia","Land Rover","Lexus","Lincoln","Mazda","Mercedes-Benz",
  "Mini","Mitsubishi","Nissan","Porsche","Ram","Rivian","Subaru","Tesla",
  "Toyota","Volkswagen","Volvo","Other",
];

const VEHICLE_TYPES = ["Car","Truck","SUV","Van/Minivan","Motorcycle","ATV/UTV","RV/Motorhome","Boat","Trailer","Equipment","Other"];
const TITLE_STATUSES = [
  "Clean Title – In Hand",
  "Clean Title – Not in Hand",
  "Salvage Title – In Hand",
  "Salvage Title – Not in Hand",
  "Rebuilt / Reconstructed Title",
  "Bill of Sale Only",
  "Parts Only / No Title",
  "Lien Present – Not Paid Off",
  "Unknown",
];
const CONDITION_FLAGS = [
  "Runs & Drives","Starts – Won't Drive","Inoperable","Needs Tires",
  "Needs Engine Work","Needs Transmission Work","Check Engine Light On",
  "Heat Works","AC Works","Accident History","Flood Damage","Frame Damage",
];
const VEHICLE_SELLER_TYPES = ["Private Seller","Dealer","Broker","Other"];
const VEHICLE_LISTING_TYPES = [
  { value: "cash_sale", label: "Cash Sale" },
  { value: "financing", label: "Financing Available" },
  { value: "bhph", label: "Buy Here Pay Here" },
  { value: "lease", label: "Lease Available" },
  { value: "trade", label: "Trade / Barter" },
  { value: "parts_only", label: "Parts Only" },
  { value: "rental", label: "Rental Available" },
];
const TERM_LENGTHS = ["12 months","24 months","36 months","48 months","60 months","72 months","84 months","Other"];
const PROPERTY_TYPES = ["House","Apartment","Condo","Townhome","Duplex","Mobile Home","Land","Commercial","Room","Other"];
const PROPERTY_LISTING_TYPES = [
  { value: "for_rent", label: "For Rent" },
  { value: "for_sale", label: "For Sale" },
  { value: "short_term", label: "Short-Term Stay" },
  { value: "lease_option", label: "Lease Option" },
  { value: "owner_financing", label: "Owner Financing" },
  { value: "roommate", label: "Roommate Wanted" },
];
const PROPERTY_SOURCES = ["Owner","Property Manager","Real Estate Agent","Investor","Builder"];
const INCOME_REQS = ["None","2x Rent","3x Rent","4x Rent"];
const PET_POLICIES = ["Yes","No","Dogs Only","Cats Only","Case-by-case"];
const EVICTION_OPTIONS = ["Yes","No","Case-by-case"];
const SECTION8_OPTIONS = ["Yes","No","Case-by-case"];
const PROPERTY_FEATURES = [
  "Central Heat","Central AC","Washer/Dryer","Garage","Covered Parking",
  "Pool","Waterfront","Fenced Yard","Fireplace","Furnished","Utilities Included",
  "Wheelchair Accessible","Security System","Internet Included",
];
const TOOL_TYPES = ["Construction","Landscaping","Farm","Industrial","Automotive","Hand Tools","Power Tools","Other"];
const DEVICE_TYPES = ["Smartphone","Laptop","Tablet","Desktop","TV","Gaming Console","Camera","Smart Watch","Other"];
const FURNITURE_TYPES = ["Couch/Sofa","Sectional","Bed Frame","Mattress","Dresser","Table","Chair","Desk","Shelf","Other"];
const APPLIANCE_TYPES = ["Washer","Dryer","Washer/Dryer Set","Refrigerator","Stove/Range","Dishwasher","Microwave","Freezer","Other"];
const BOAT_TYPES = ["Fishing Boat","Pontoon","Ski Boat","Cabin Cruiser","Sailboat","Jet Ski/PWC","Kayak/Canoe","Other"];
const TRAILER_TYPES = ["Utility Trailer","Cargo Trailer","Flatbed","Horse Trailer","Car Hauler","Boat Trailer","Dump Trailer","Other"];
const CONDITIONS = ["New","Like New","Good","Fair","Poor","For Parts"];
const AVAILABILITIES = [
  { value: "available_now", label: "Available Now" },
  { value: "today", label: "Available Today" },
  { value: "this_week", label: "Available This Week" },
  { value: "appointment", label: "By Appointment" },
];

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface PhotoMeta {
  url: string;
  isLive: boolean;
  source: "camera" | "gallery";
  timestamp: string;
  lat: number | null;
  lng: number | null;
  aiScanStatus: "pending" | "clean" | "flagged" | "skipped";
}

interface WizardForm {
  category: string;
  title: string;
  description: string;
  // shared
  condition: string;
  brand: string;
  model: string;
  subCategory: string;
  listingType: string;
  sellerType: string;
  // vehicle
  vinNumber: string;
  vinDecoded: boolean;
  hasVin: string; // "yes" | "no" | ""
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleTrim: string;
  vehicleMileage: string;
  titleStatus: string;
  exteriorColor: string;
  interiorColor: string;
  transmission: string;
  fuelType: string;
  engine: string;
  driveType: string;
  conditionFlags: string[];
  purchaseType: string;
  downPayment: string;
  monthlyPayment: string;
  termLength: string;
  interestRate: string;
  creditCheckRequired: boolean;
  minCreditScore: string;
  proofOfIncomeRequired: boolean;
  dueAtSigning: string;
  mileageLimit: string;
  // property
  propertyType: string;
  listingSource: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  yearBuilt: string;
  rent: string;
  deposit: string;
  availableDate: string;
  leaseLength: string;
  applicationFee: string;
  backgroundCheck: boolean;
  incomeRequirement: string;
  evictionsAccepted: string;
  section8: string;
  petPolicy: string;
  petDeposit: string;
  petRent: string;
  propertyFeatures: string[];
  nightlyRate: string;
  weeklyRate: string;
  monthlyRate: string;
  cleaningFee: string;
  maxGuests: string;
  minStay: string;
  maxStay: string;
  acreage: string;
  zoning: string;
  ownerFinancing: boolean;
  ownerDownPayment: string;
  ownerMonthlyPayment: string;
  ownerTermLength: string;
  // tools
  toolType: string;
  worksProper: string;
  batteryIncluded: string;
  chargerIncluded: string;
  rentalAvailable: boolean;
  rentalPrice: string;
  rentalDeposit: string;
  // electronics
  deviceType: string;
  storageSize: string;
  carrier: string;
  unlocked: string;
  crackedScreen: boolean;
  batteryHealth: string;
  includesCharger: boolean;
  // furniture
  furnitureType: string;
  material: string;
  itemColor: string;
  dimensions: string;
  deliveryAvailable: boolean;
  assemblyRequired: boolean;
  smokeFreeHome: boolean;
  petFreeHome: boolean;
  // appliance
  applianceType: string;
  gasOrElectric: string;
  deliveryAvailableAppliance: boolean;
  installationAvailable: boolean;
  warrantyRemaining: boolean;
  // boat
  boatType: string;
  boatLength: string;
  engineType: string;
  hours: string;
  trailerIncluded: boolean;
  boatRuns: string;
  // trailer
  trailerType: string;
  trailerLength: string;
  tiresGood: boolean;
  lightsWork: boolean;
  // parts
  partName: string;
  partNumber: string;
  compatibleMake: string;
  compatibleModel: string;
  compatibleYears: string;
  // step 4
  price: string;
  priceType: string;
  makeOfferEnabled: boolean;
  minOfferThreshold: string;
  city: string;
  state: string;
  zipcode: string;
  sellerAvailability: string;
  sellerNotes: string;
  viJobId: string;
}

const defaultForm: WizardForm = {
  category: "", title: "", description: "", condition: "", brand: "", model: "",
  subCategory: "", listingType: "", sellerType: "",
  vinNumber: "", vinDecoded: false, hasVin: "",
  vehicleYear: "", vehicleMake: "", vehicleModel: "", vehicleTrim: "",
  vehicleMileage: "", titleStatus: "", exteriorColor: "", interiorColor: "",
  transmission: "", fuelType: "", engine: "", driveType: "",
  conditionFlags: [], purchaseType: "cash_sale",
  downPayment: "", monthlyPayment: "", termLength: "", interestRate: "",
  creditCheckRequired: false, minCreditScore: "", proofOfIncomeRequired: false,
  dueAtSigning: "", mileageLimit: "",
  propertyType: "", listingSource: "", bedrooms: "", bathrooms: "",
  squareFeet: "", yearBuilt: "", rent: "", deposit: "", availableDate: "",
  leaseLength: "", applicationFee: "", backgroundCheck: false,
  incomeRequirement: "None", evictionsAccepted: "No", section8: "No",
  petPolicy: "No", petDeposit: "", petRent: "", propertyFeatures: [],
  nightlyRate: "", weeklyRate: "", monthlyRate: "", cleaningFee: "",
  maxGuests: "", minStay: "", maxStay: "",
  acreage: "", zoning: "", ownerFinancing: false,
  ownerDownPayment: "", ownerMonthlyPayment: "", ownerTermLength: "",
  toolType: "", worksProper: "", batteryIncluded: "", chargerIncluded: "",
  rentalAvailable: false, rentalPrice: "", rentalDeposit: "",
  deviceType: "", storageSize: "", carrier: "", unlocked: "", crackedScreen: false,
  batteryHealth: "", includesCharger: false,
  furnitureType: "", material: "", itemColor: "", dimensions: "",
  deliveryAvailable: false, assemblyRequired: false, smokeFreeHome: false, petFreeHome: false,
  applianceType: "", gasOrElectric: "", deliveryAvailableAppliance: false,
  installationAvailable: false, warrantyRemaining: false,
  boatType: "", boatLength: "", engineType: "", hours: "",
  trailerIncluded: false, boatRuns: "",
  trailerType: "", trailerLength: "", tiresGood: false, lightsWork: false,
  partName: "", partNumber: "", compatibleMake: "", compatibleModel: "", compatibleYears: "",
  price: "", priceType: "firm", makeOfferEnabled: false, minOfferThreshold: "",
  city: "", state: "", zipcode: "", sellerAvailability: "available_now",
  sellerNotes: "", viJobId: "",
};

// ─── VIN DECODE ──────────────────────────────────────────────────────────────

async function decodeVINFromNHTSA(vin: string) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
  if (!res.ok) throw new Error("NHTSA unavailable");
  const data = await res.json();
  const results: Array<{ Variable: string; Value: string }> = data.Results || [];
  const get = (name: string) => {
    const r = results.find(r => r.Variable === name);
    return r?.Value && r.Value !== "Not Applicable" && r.Value !== "null" ? r.Value : "";
  };
  const year = get("Model Year");
  const make = get("Make");
  const model = get("Model");
  if (!year || !make || !model) return null;
  const tc = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const cyl = get("Engine Number of Cylinders");
  const disp = get("Displacement (L)");
  const engine = [cyl && `${cyl}-cyl`, disp && `${parseFloat(disp).toFixed(1)}L`].filter(Boolean).join(" ");
  return {
    year,
    make: tc(make),
    model: tc(model),
    trim: get("Trim") || get("Series"),
    bodyClass: get("Body Class"),
    engine,
    fuelType: get("Fuel Type - Primary"),
    driveType: get("Drive Type"),
    transmission: get("Transmission Style"),
  };
}

// ─── SHARED UI HELPERS ───────────────────────────────────────────────────────

const ic = "w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50";

function FL({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-[11px] font-display font-bold text-gray-400 tracking-wider mb-1.5">
      {children}{optional && <span className="ml-1 font-normal normal-case text-gray-500">(optional)</span>}
    </label>
  );
}

function ChipSelect({ options, value, onChange, small }: {
  options: string[] | { value: string; label: string }[];
  value: string; onChange: (v: string) => void; small?: boolean;
}) {
  const sz = small ? "text-[10px] px-2 py-1" : "text-xs px-3 py-1.5";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt : opt.label;
        const active = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(active ? "" : v)}
            className={`${sz} rounded-full font-display font-bold transition-all`}
            style={active
              ? { background: "rgba(0,229,118,0.45)", border: "1.5px solid rgba(0,229,118,0.5)", color: "#00e676" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#6b7280" }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

function MultiChip({ options, values, onChange }: {
  options: string[]; values: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const active = values.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className="text-[11px] px-2.5 py-1 rounded-full font-bold transition-all"
            style={active
              ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)", color: "#6b7280" }}>
            {active && "✓ "}{opt}
          </button>
        );
      })}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[true, false].map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
          style={value === v
            ? { background: v ? "rgba(0,229,118,0.15)" : "rgba(239,68,68,0.1)", border: `1.5px solid ${v ? "rgba(0,229,118,0.4)" : "rgba(239,68,68,0.3)"}`, color: v ? "#00e676" : "#f87171" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)", color: "#6b7280" }}>
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function SField({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <select className={ic} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder || "Select…"}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function NumInput({ value, onChange, placeholder, prefix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string;
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
      <input type="number" className={`${ic} ${prefix ? "pl-7" : ""}`}
        placeholder={placeholder || "0"} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [warn, setWarn] = useState<string | null>(null);
  const handle = (v: string) => {
    const check = detectContactInfo(v);
    setWarn(check.found ? CONTACT_WARN_MSG : null);
    onChange(v);
  };
  return (
    <div className="space-y-2">
      <textarea className={`${ic} resize-none`} rows={2}
        placeholder="Meeting instructions, what's included, pickup hours… No phone numbers or emails."
        value={value} onChange={e => handle(e.target.value)} />
      {warn && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl text-xs"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{warn}</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-4 border-t border-white/[0.05]">
      <p className="text-[10px] font-display font-bold text-gray-500 tracking-widest uppercase mb-3">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── STEP 1: CATEGORY ────────────────────────────────────────────────────────

function CategoryStep({ form, setForm, onNext }: { form: WizardForm; setForm: any; onNext: () => void }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-28">
      <div className="mb-5">
        <h2 className="text-xl font-display font-extrabold text-white">What are you listing?</h2>
        <p className="text-xs text-gray-400 mt-1">Tap a category to get started</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {WIZARD_CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button key={cat.name} type="button"
              onClick={() => { setForm((f: WizardForm) => ({ ...f, category: cat.name })); onNext(); }}
              className="flex flex-col items-start gap-2 p-3.5 rounded-2xl text-left transition-all active:scale-[0.97]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
              data-testid={`cat-card-${cat.name.replace(/\s/g, "-").toLowerCase()}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.55)" }}>
                <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xs font-display font-bold text-white leading-tight">{cat.name}</p>
                <p className="text-[10px] text-gray-500 leading-tight mt-0.5 line-clamp-1">{cat.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── STEP 2: PHOTOS + BASICS ─────────────────────────────────────────────────

async function getGPS(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, enableHighAccuracy: false },
    );
  });
}

function PhotosStep({ form, setForm, photos, setPhotos, photoMeta, setPhotoMeta, onNext, onBack }: {
  form: WizardForm; setForm: any;
  photos: string[]; setPhotos: (p: string[]) => void;
  photoMeta: PhotoMeta[]; setPhotoMeta: (m: PhotoMeta[]) => void;
  onNext: () => void; onBack: () => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [contactWarn, setContactWarn] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList, source: "camera" | "gallery") => {
    if (photos.length >= 10) {
      toast({ title: "Max 10 photos per listing", variant: "destructive" });
      return;
    }
    const remaining = 10 - photos.length;
    const toUp = Array.from(files).slice(0, remaining);
    setUploading(true);

    const isLive = source === "camera";
    const timestamp = new Date().toISOString();
    const gps = isLive ? await getGPS() : null;

    const newUrls: string[] = [];
    const newMeta: PhotoMeta[] = [];

    for (const file of toUp) {
      const MAX_MB = 25;
      if (file.size > MAX_MB * 1024 * 1024) {
        toast({
          title: `Photo too large`,
          description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is ${MAX_MB} MB`,
          variant: "destructive",
        });
        continue;
      }
      const key = file.name + file.size;
      try {
        const result = await uploadToCloudinarySigned(file, {
          resourceType: "image",
          fileName: `marketplace-${Date.now()}-${file.name}`,
          onProgress: pct => setUploadProgress(prev => ({ ...prev, [key]: pct })),
        });
        newUrls.push(result.url);
        newMeta.push({
          url: result.url,
          isLive,
          source,
          timestamp,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
          aiScanStatus: isLive ? "skipped" : "pending",
        });
        setUploadProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
      } catch (err: any) {
        toast({
          title: `Upload failed: ${file.name}`,
          description: err?.message || "Check your connection and try again.",
          variant: "destructive",
        });
        console.error("[Marketplace upload error]", err);
      }
    }

    if (newUrls.length) {
      setPhotos([...photos, ...newUrls]);
      setPhotoMeta([...photoMeta, ...newMeta]);
    }
    setUploading(false);
  }, [photos, photoMeta, toast, setPhotos, setPhotoMeta]);

  const onTitleChange = (v: string) => {
    const check = detectContactInfo(v);
    setContactWarn(check.found ? CONTACT_WARN_MSG : null);
    setForm((f: WizardForm) => ({ ...f, title: v }));
  };

  const onDescChange = (v: string) => {
    const check = detectContactInfo(v);
    setContactWarn(check.found ? CONTACT_WARN_MSG : null);
    setForm((f: WizardForm) => ({ ...f, description: v }));
  };

  const [scanningBarcode, setScanningBarcode] = useState(false);

  const scanBarcode = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    (input as any).capture = "environment";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setScanningBarcode(true);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise(r => { img.onload = r; });
      let found = false;
      try {
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
          });
          const codes: any[] = await detector.detect(img);
          if (codes.length > 0) {
            found = true;
            const barcode = codes[0].rawValue as string;
            URL.revokeObjectURL(url);
            try {
              const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
              const data = await res.json();
              if (data.items?.[0]) {
                const item = data.items[0];
                setForm((f: WizardForm) => ({
                  ...f,
                  title: item.title || f.title,
                  brand: item.brand || f.brand,
                  model: item.model || f.model,
                  description: item.description || f.description,
                }));
                toast({ title: "Item found!", description: item.title });
              } else {
                toast({ title: `Barcode: ${barcode}`, description: "Not in database — fill in details below." });
              }
            } catch {
              toast({ title: "Lookup failed", description: "Fill in details manually." });
            }
          }
        }
      } catch {}
      URL.revokeObjectURL(url);
      setScanningBarcode(false);
      if (!found) toast({ title: "No barcode detected", description: "Take a clear photo of the barcode or fill in manually.", variant: "destructive" });
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
  };

  const inProgress = Object.keys(uploadProgress).length > 0;
  const isVehicle = form.category === "Vehicles";
  const [vinScanning, setVinScanning] = useState(false);

  const scanVinInline = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    (input as any).capture = "environment";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setVinScanning(true);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise(r => { img.onload = r; });
      let found = false;
      try {
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["code_128", "qr_code", "data_matrix", "code_39", "code_93"] });
          const codes: any[] = await detector.detect(img);
          for (const code of codes) {
            const raw = (code.rawValue as string).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
            if (/^[A-HJ-NPR-Z0-9]{17}$/.test(raw)) {
              found = true;
              URL.revokeObjectURL(url);
              try {
                const data = await decodeVINFromNHTSA(raw);
                const autoTitle = data ? `${data.year} ${data.make} ${data.model}`.trim() : "";
                setForm((f: WizardForm) => ({ ...f, hasVin: "yes", vinDecoded: !!data, vinNumber: raw,
                  vehicleYear: data?.year || f.vehicleYear, vehicleMake: data?.make || f.vehicleMake,
                  vehicleModel: data?.model || f.vehicleModel, vehicleTrim: data?.trim || f.vehicleTrim,
                  bodyStyle: data?.bodyStyle || f.bodyStyle, engine: data?.engine || f.engine,
                  fuelType: data?.fuelType || f.fuelType, driveType: data?.driveType || f.driveType,
                  transmission: data?.transmission || f.transmission,
                  title: f.title || autoTitle,
                }));
                toast({ title: data ? "VIN scanned & decoded!" : `VIN found: ${raw}`,
                  description: data ? `${data.year} ${data.make} ${data.model}` : "Enter details on next step." });
              } catch { toast({ title: "VIN scan failed", variant: "destructive" }); }
              break;
            }
          }
        }
      } catch {}
      URL.revokeObjectURL(url);
      setVinScanning(false);
      if (!found) {
        setForm((f: WizardForm) => ({ ...f, hasVin: "yes" }));
        toast({ title: "No VIN barcode detected", description: "Enter your 17-digit VIN manually below.", variant: "destructive" });
      }
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
  };

  return (
    <>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pb-28">
      <div>
        <h2 className="text-xl font-display font-extrabold text-white">Photos & Basics</h2>
        <p className="text-xs text-gray-400 mt-1">{form.category} · All fields optional — add what you have</p>
      </div>

      {/* ── SECTION 1: VIN (Vehicles only, first) ─────────────────── */}
      {isVehicle && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
          <div>
            <p className="text-[11px] font-display font-bold text-gray-400 tracking-wider">VIN LOOKUP</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Scan or enter to auto-fill year, make, model, trim & more</p>
          </div>

          {!form.hasVin ? (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={scanVinInline} disabled={vinScanning || uploading}
                className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
                style={{ background: "rgba(0,229,118,0.07)", border: "1.5px solid rgba(0,229,118,0.55)" }}
                data-testid="button-vin-scan-photo">
                {vinScanning ? <RefreshCw className="w-5 h-5 text-primary animate-spin" /> : <ScanLine className="w-5 h-5 text-primary" />}
                <span className="text-[10px] font-display font-bold text-primary">{vinScanning ? "Scanning…" : "Scan VIN"}</span>
              </button>
              <button type="button" onClick={() => setForm((f: WizardForm) => ({ ...f, hasVin: "yes" }))}
                className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                data-testid="button-vin-enter-photo">
                <Edit3 className="w-5 h-5 text-gray-300" />
                <span className="text-[10px] font-display font-bold text-gray-300">Enter VIN</span>
              </button>
              <button type="button" onClick={() => setForm((f: WizardForm) => ({ ...f, hasVin: "no" }))}
                className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid="button-vin-skip-photo">
                <SkipForward className="w-5 h-5 text-gray-500" />
                <span className="text-[10px] font-display font-bold text-gray-500">No VIN</span>
              </button>
            </div>
          ) : form.hasVin === "yes" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input className={`${ic} flex-1 font-mono uppercase`} placeholder="17-char VIN"
                  value={form.vinNumber || ""} maxLength={17}
                  onChange={e => setForm((f: WizardForm) => ({ ...f, vinNumber: e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "") }))}
                  data-testid="input-vin-number-photo" />
                <button type="button" onClick={async () => {
                  const vin = (form.vinNumber || "").toUpperCase().trim();
                  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { toast({ title: "Invalid VIN", description: "17 characters required", variant: "destructive" }); return; }
                  try {
                    const data = await decodeVINFromNHTSA(vin);
                    if (data) {
                      const autoTitle = `${data.year} ${data.make} ${data.model}`.trim();
                      setForm((f: WizardForm) => ({ ...f, vinDecoded: true, vehicleYear: data.year || f.vehicleYear, vehicleMake: data.make || f.vehicleMake, vehicleModel: data.model || f.vehicleModel, vehicleTrim: data.trim || f.vehicleTrim, bodyStyle: data.bodyStyle || f.bodyStyle, engine: data.engine || f.engine, fuelType: data.fuelType || f.fuelType, driveType: data.driveType || f.driveType, transmission: data.transmission || f.transmission, title: f.title || autoTitle }));
                      toast({ title: "VIN decoded!", description: `${data.year} ${data.make} ${data.model}` });
                    } else { toast({ title: "VIN not found", description: "Fill in details on the next step.", variant: "destructive" }); }
                  } catch { toast({ title: "Decode failed", variant: "destructive" }); }
                }}
                  className="px-3 py-2.5 rounded-xl text-xs font-display font-bold transition-all active:scale-95"
                  style={{ background: "rgba(0,229,118,0.7)", border: "1px solid rgba(0,229,118,0.3)", color: "#00e676" }}
                  data-testid="button-decode-vin-photo">
                  Decode
                </button>
              </div>
              {form.vinDecoded && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <Check className="w-3 h-3" /> Decoded — details pre-filled on next step
                </div>
              )}
              <button type="button" onClick={() => setForm((f: WizardForm) => ({ ...f, hasVin: undefined, vinNumber: "", vinDecoded: false }))}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors" data-testid="button-vin-reset">
                ← Clear VIN
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">Skipped — fill in details manually on next step</span>
              <button type="button" onClick={() => setForm((f: WizardForm) => ({ ...f, hasVin: undefined }))}
                className="text-[10px] text-gray-400 hover:text-white" data-testid="button-vin-undo-skip">Undo</button>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 2: PHOTOS ─────────────────────────────────────── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
        <div>
          <p className="text-[11px] font-display font-bold text-gray-400 tracking-wider">PHOTOS ({photos.length}/10)</p>
          <p className="text-[10px] text-gray-600 mt-0.5">At least 1 photo required — live camera photos are trusted more by buyers</p>
        </div>

        {/* Uploaded thumbnails */}
        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {photos.map((p, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group" data-testid={`img-listing-photo-${i}`}>
                <img src={p} alt="" className="w-full h-full object-cover" />
                {photoMeta[i] && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-0.5" style={{ background: "rgba(0,0,0,0.65)" }}>
                    <span className="text-[9px] font-bold" style={{ color: photoMeta[i].isLive ? "#00e676" : "#f59e0b" }}>
                      {photoMeta[i].isLive ? "📷 LIVE" : "🖼 UPLOAD"}
                    </span>
                  </div>
                )}
                <button type="button"
                  onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setPhotoMeta(photoMeta.filter((_, j) => j !== i)); }}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                  data-testid={`button-remove-photo-${i}`}>
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {inProgress && (
          <div className="space-y-1">
            {Object.entries(uploadProgress).map(([k, pct]) => (
              <div key={k} className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#00e676" }} />
              </div>
            ))}
            <p className="text-[10px] text-gray-400">{uploading ? "Uploading…" : "Processing…"}</p>
          </div>
        )}

        {/* Add photo buttons */}
        {photos.length < 10 && !inProgress && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading}
              className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97] disabled:opacity-50"
              style={{ background: "rgba(0,229,118,0.07)", border: "1.5px solid rgba(0,229,118,0.55)" }}
              data-testid="button-take-photo">
              <Camera className="w-6 h-6 text-primary" />
              <span className="text-xs font-display font-bold text-primary">Take Photo</span>
              <span className="text-[10px] text-gray-500 text-center leading-tight">GPS + timestamp</span>
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading}
              className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97] disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
              data-testid="button-upload-gallery">
              <ImagePlus className="w-6 h-6 text-gray-400" />
              <span className="text-xs font-display font-bold text-gray-300">From Gallery</span>
              <span className="text-[10px] text-gray-500 text-center leading-tight">Up to {10 - photos.length} · 25 MB max</span>
            </button>
          </div>
        )}

        {/* Barcode assist — non-vehicle, non-property */}
        {!isVehicle && form.category !== "Property" && (
          <button type="button" onClick={scanBarcode} disabled={scanningBarcode || uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-display font-bold text-gray-400 hover:text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ border: "1px solid rgba(0,229,118,0.55)", background: "rgba(255,255,255,0.03)" }}
            data-testid="button-scan-barcode">
            {scanningBarcode ? <><RefreshCw className="w-4 h-4 animate-spin" /> Looking up item…</> : <><ScanLine className="w-4 h-4" /> Scan Barcode — Auto-Fill Details</>}
          </button>
        )}

        {photos.length > 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl text-[10px] text-gray-500 leading-relaxed"
            style={{ background: "rgba(0,229,118,0.04)", border: "1px solid rgba(0,229,118,0.1)" }}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>Live camera photos with GPS are trusted more by buyers. Uploaded photos are flagged for AI screening.</span>
          </div>
        )}
      </div>

      {/* ── SECTION 3: TITLE & NOTES ──────────────────────────────── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
        <p className="text-[11px] font-display font-bold text-gray-400 tracking-wider">LISTING BASICS</p>

        <div>
          <FL optional>TITLE</FL>
          <input className={ic}
            placeholder={isVehicle ? "e.g. 2019 Honda Accord Sport – 82k miles" : form.category === "Property" ? "e.g. 3 BR House – Mobile, AL" : "e.g. Item title"}
            value={form.title} onChange={e => onTitleChange(e.target.value)}
            data-testid="input-listing-title" />
          {isVehicle && <p className="text-[10px] text-gray-500 mt-1">Auto-fills from VIN decode above</p>}
        </div>

        <div>
          <FL optional>SPECIAL NOTES</FL>
          <p className="text-[10px] text-gray-600 mb-1.5">Known issues, what's included, pickup notes — major details go on the next screen</p>
          <textarea className={`${ic} resize-none`} rows={2}
            placeholder="Any extra context for buyers…"
            value={form.description} onChange={e => onDescChange(e.target.value)}
            data-testid="textarea-listing-description" />
        </div>

        {contactWarn && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{contactWarn}</span>
          </div>
        )}
      </div>

    </div>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
      onChange={e => e.target.files && handleFiles(e.target.files, "camera")} />
    <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
      onChange={e => e.target.files && handleFiles(e.target.files, "gallery")} />
    </>
  );
}

// ─── STEP 3a: VEHICLE BUILDER ─────────────────────────────────────────────────

function VehicleBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const { toast } = useToast();
  const [decoding, setDecoding] = useState(false);
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));

  const applyVINDecode = (vin: string, data: Awaited<ReturnType<typeof decodeVINFromNHTSA>>) => {
    if (!data) return;
    setForm((f: WizardForm) => ({
      ...f, vinDecoded: true, vinNumber: vin,
      vehicleYear: data.year || f.vehicleYear,
      vehicleMake: data.make || f.vehicleMake,
      vehicleModel: data.model || f.vehicleModel,
      vehicleTrim: data.trim || f.vehicleTrim,
      engine: data.engine || f.engine,
      fuelType: data.fuelType || f.fuelType,
      driveType: data.driveType || f.driveType,
      transmission: data.transmission || f.transmission,
    }));
  };

  const handleDecodeVIN = async () => {
    const vin = form.vinNumber.toUpperCase().trim();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      toast({ title: "Invalid VIN", description: "VINs are 17 characters — no I, O, or Q.", variant: "destructive" });
      return;
    }
    setDecoding(true);
    try {
      const data = await decodeVINFromNHTSA(vin);
      if (!data) {
        toast({ title: "VIN not recognized", description: "Fill in year, make, and model below.", variant: "destructive" });
        return;
      }
      applyVINDecode(vin, data);
      toast({ title: "VIN decoded!", description: `${data.year} ${data.make} ${data.model}` });
    } catch {
      toast({ title: "Decode failed", description: "Check your connection or enter details below.", variant: "destructive" });
    } finally { setDecoding(false); }
  };

  const scanVin = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    (input as any).capture = "environment";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise(r => { img.onload = r; });
      let found = false;
      try {
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["code_128", "qr_code", "data_matrix", "code_39", "code_93"],
          });
          const codes: any[] = await detector.detect(img);
          for (const code of codes) {
            const raw = (code.rawValue as string).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
            if (/^[A-HJ-NPR-Z0-9]{17}$/.test(raw)) {
              found = true;
              set("hasVin", "yes");
              URL.revokeObjectURL(url);
              setDecoding(true);
              try {
                const data = await decodeVINFromNHTSA(raw);
                applyVINDecode(raw, data);
                toast({ title: data ? "VIN scanned & decoded!" : `VIN found: ${raw}`,
                  description: data ? `${data.year} ${data.make} ${data.model}` : "Enter details below." });
              } finally { setDecoding(false); }
              break;
            }
          }
        }
      } catch {}
      URL.revokeObjectURL(url);
      if (!found) {
        set("hasVin", "yes");
        toast({ title: "No VIN barcode detected", description: "Enter your 17-digit VIN manually below.", variant: "destructive" });
      }
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
  };

  const years = Array.from({ length: 77 }, (_, i) => String(2026 - i));
  const showFinanceFields = ["financing", "bhph"].includes(form.purchaseType);
  const showLeaseFields = form.purchaseType === "lease";

  return (
    <div className="space-y-5">

      {/* ── VIN FIRST ─────────────────────────────────────────────── */}
      <Section title="VIN Lookup">
        <p className="text-[10px] text-gray-500 -mt-1">Found on the door jamb, dashboard, or your title</p>

        {/* Scan / Enter / Skip — big action buttons */}
        {!form.hasVin && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button"
              onClick={scanVin}
              disabled={decoding}
              className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
              style={{ background: "rgba(0,229,118,0.07)", border: "1.5px solid rgba(0,229,118,0.55)" }}
              data-testid="button-vin-scan">
              {decoding ? <RefreshCw className="w-5 h-5 text-primary animate-spin" /> : <ScanLine className="w-5 h-5 text-primary" />}
              <span className="text-[10px] font-display font-bold text-primary">{decoding ? "Scanning…" : "Scan VIN"}</span>
            </button>
            <button type="button"
              onClick={() => set("hasVin", "yes")}
              className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
              data-testid="button-vin-enter">
              <Edit3 className="w-5 h-5 text-gray-300" />
              <span className="text-[10px] font-display font-bold text-gray-300">Enter VIN</span>
            </button>
            <button type="button"
              onClick={() => set("hasVin", "no")}
              className="flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}
              data-testid="button-vin-skip">
              <SkipForward className="w-5 h-5 text-gray-500" />
              <span className="text-[10px] font-display font-bold text-gray-500">Skip VIN</span>
            </button>
          </div>
        )}

        {form.hasVin === "yes" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className={`${ic} flex-1 font-mono tracking-wider uppercase`}
                placeholder="17-character VIN"
                value={form.vinNumber} onChange={e => set("vinNumber", e.target.value.toUpperCase())}
                maxLength={17} data-testid="input-vin" />
              <button type="button" onClick={handleDecodeVIN}
                disabled={decoding || form.vinNumber.length !== 17}
                className="px-3 py-2 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-40 shrink-0"
                style={{ background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.7)", color: "#00e676" }}
                data-testid="button-decode-vin">
                {decoding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Decode"}
              </button>
            </div>
            {form.vinDecoded && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                <Check className="w-3.5 h-3.5" /> Auto-filled from VIN · Edit below if needed
              </div>
            )}
            <button type="button" onClick={() => set("hasVin", "")}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
              ← Change VIN option
            </button>
          </div>
        )}

        {form.hasVin === "no" && (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-[11px] text-gray-500">Filling in year, make, and model below.</div>
            <button type="button" onClick={() => set("hasVin", "")}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors shrink-0">
              ← Back
            </button>
          </div>
        )}
      </Section>

      <Section title="Listing Type">
        <ChipSelect options={VEHICLE_LISTING_TYPES} value={form.purchaseType} onChange={v => set("purchaseType", v)} />
        <div>
          <FL>SELLER TYPE</FL>
          <ChipSelect options={VEHICLE_SELLER_TYPES} value={form.sellerType} onChange={v => set("sellerType", v)} />
        </div>
      </Section>

      <Section title="Vehicle Info">
        <div>
          <FL>VEHICLE TYPE</FL>
          <SField value={form.subCategory} onChange={v => set("subCategory", v)} options={VEHICLE_TYPES} placeholder="Select type" />
        </div>

        <Row2>
          <div>
            <FL>YEAR</FL>
            <SField value={form.vehicleYear} onChange={v => set("vehicleYear", v)} options={years} placeholder="Year" />
          </div>
          <div>
            <FL>MAKE</FL>
            <SField value={form.vehicleMake} onChange={v => set("vehicleMake", v)} options={VEHICLE_MAKES} placeholder="Make" />
          </div>
        </Row2>
        <Row2>
          <div>
            <FL>MODEL</FL>
            <input className={ic} placeholder="Model" value={form.vehicleModel} onChange={e => set("vehicleModel", e.target.value)} />
          </div>
          <div>
            <FL optional>TRIM</FL>
            <input className={ic} placeholder="Trim / Series" value={form.vehicleTrim} onChange={e => set("vehicleTrim", e.target.value)} />
          </div>
        </Row2>
        <Row2>
          <div>
            <FL>MILEAGE</FL>
            <NumInput value={form.vehicleMileage} onChange={v => set("vehicleMileage", v)} placeholder="e.g. 82000" />
          </div>
          <div>
            <FL optional>EXT COLOR</FL>
            <input className={ic} placeholder="Color" value={form.exteriorColor} onChange={e => set("exteriorColor", e.target.value)} />
          </div>
        </Row2>
        <Row2>
          <div>
            <FL optional>TRANSMISSION</FL>
            <SField value={form.transmission} onChange={v => set("transmission", v)}
              options={["Automatic","Manual","CVT","Semi-Auto","Other"]} placeholder="Transmission" />
          </div>
          <div>
            <FL optional>FUEL TYPE</FL>
            <SField value={form.fuelType} onChange={v => set("fuelType", v)}
              options={["Gasoline","Diesel","Electric","Hybrid","Plug-in Hybrid","Flex Fuel","Other"]} placeholder="Fuel" />
          </div>
        </Row2>
      </Section>

      <Section title="Title / Ownership">
        <ChipSelect options={TITLE_STATUSES} value={form.titleStatus} onChange={v => set("titleStatus", v)} small />
      </Section>

      <Section title="Condition (check all that apply)">
        <MultiChip options={CONDITION_FLAGS} values={form.conditionFlags}
          onChange={v => set("conditionFlags", v)} />
      </Section>

      {(showFinanceFields || showLeaseFields) && (
        <Section title={showLeaseFields ? "Lease Terms" : "Financing Terms"}>
          {showLeaseFields ? (
            <>
              <Row2>
                <div><FL>MONTHLY PAYMENT</FL><NumInput value={form.monthlyPayment} onChange={v => set("monthlyPayment", v)} placeholder="299" prefix="$" /></div>
                <div><FL>DUE AT SIGNING</FL><NumInput value={form.dueAtSigning} onChange={v => set("dueAtSigning", v)} placeholder="2000" prefix="$" /></div>
              </Row2>
              <Row2>
                <div><FL>LEASE LENGTH</FL><SField value={form.termLength} onChange={v => set("termLength", v)} options={["24 months","36 months","48 months"]} placeholder="Length" /></div>
                <div><FL>MILEAGE LIMIT/YR</FL><NumInput value={form.mileageLimit} onChange={v => set("mileageLimit", v)} placeholder="12000" /></div>
              </Row2>
            </>
          ) : (
            <>
              <Row2>
                <div><FL>DOWN PAYMENT</FL><NumInput value={form.downPayment} onChange={v => set("downPayment", v)} placeholder="2500" prefix="$" /></div>
                <div><FL>MONTHLY PAYMENT</FL><NumInput value={form.monthlyPayment} onChange={v => set("monthlyPayment", v)} placeholder="299" prefix="$" /></div>
              </Row2>
              <Row2>
                <div><FL>TERM LENGTH</FL><SField value={form.termLength} onChange={v => set("termLength", v)} options={TERM_LENGTHS} placeholder="Term" /></div>
                <div><FL optional>INTEREST RATE</FL><NumInput value={form.interestRate} onChange={v => set("interestRate", v)} placeholder="9.9" /></div>
              </Row2>
            </>
          )}
          <div>
            <FL>CREDIT CHECK REQUIRED</FL>
            <YesNo value={form.creditCheckRequired} onChange={v => set("creditCheckRequired", v)} />
          </div>
          {form.creditCheckRequired && (
            <div>
              <FL optional>MINIMUM CREDIT SCORE</FL>
              <NumInput value={form.minCreditScore} onChange={v => set("minCreditScore", v)} placeholder="580" />
            </div>
          )}
          <div>
            <FL>PROOF OF INCOME REQUIRED</FL>
            <YesNo value={form.proofOfIncomeRequired} onChange={v => set("proofOfIncomeRequired", v)} />
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── STEP 3b: PROPERTY BUILDER ────────────────────────────────────────────────

function PropertyBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  const lt = form.listingType;
  const isRent = lt === "for_rent" || lt === "roommate";
  const isSale = lt === "for_sale" || lt === "owner_financing" || lt === "lease_option";
  const isShort = lt === "short_term";
  const isLand = form.propertyType === "Land";

  return (
    <div className="space-y-5">
      <Section title="Listing Type">
        <ChipSelect options={PROPERTY_LISTING_TYPES} value={form.listingType} onChange={v => set("listingType", v)} />
      </Section>

      <Section title="Property Details">
        <Row2>
          <div>
            <FL>PROPERTY TYPE</FL>
            <SField value={form.propertyType} onChange={v => set("propertyType", v)} options={PROPERTY_TYPES} placeholder="Type" />
          </div>
          <div>
            <FL>LISTING SOURCE</FL>
            <SField value={form.listingSource} onChange={v => set("listingSource", v)} options={PROPERTY_SOURCES} placeholder="Source" />
          </div>
        </Row2>

        {!isLand && (
          <>
            <div>
              <FL>BEDROOMS</FL>
              <ChipSelect options={["Studio","1","2","3","4","5","6+"]} value={form.bedrooms} onChange={v => set("bedrooms", v)} />
            </div>
            <div>
              <FL>BATHROOMS</FL>
              <ChipSelect options={["1","1.5","2","2.5","3","3+"]} value={form.bathrooms} onChange={v => set("bathrooms", v)} />
            </div>
            <Row2>
              <div><FL optional>SQ FT</FL><NumInput value={form.squareFeet} onChange={v => set("squareFeet", v)} placeholder="1200" /></div>
              <div><FL optional>YEAR BUILT</FL><NumInput value={form.yearBuilt} onChange={v => set("yearBuilt", v)} placeholder="1995" /></div>
            </Row2>
          </>
        )}
        {isLand && (
          <Row2>
            <div><FL optional>ACREAGE</FL><input className={ic} placeholder="e.g. 2.5 acres" value={form.acreage} onChange={e => set("acreage", e.target.value)} /></div>
            <div><FL optional>ZONING</FL><SField value={form.zoning} onChange={v => set("zoning", v)} options={["Residential","Commercial","Agricultural","Industrial","Mixed","Unknown"]} placeholder="Zoning" /></div>
          </Row2>
        )}
      </Section>

      {isRent && (
        <Section title="Rental Info">
          <Row2>
            <div><FL>MONTHLY RENT</FL><NumInput value={form.rent} onChange={v => set("rent", v)} placeholder="1200" prefix="$" /></div>
            <div><FL optional>SECURITY DEPOSIT</FL><NumInput value={form.deposit} onChange={v => set("deposit", v)} placeholder="1200" prefix="$" /></div>
          </Row2>
          <Row2>
            <div><FL optional>APPLICATION FEE</FL><NumInput value={form.applicationFee} onChange={v => set("applicationFee", v)} placeholder="50" prefix="$" /></div>
            <div><FL optional>AVAILABLE DATE</FL><input type="date" className={ic} value={form.availableDate} onChange={e => set("availableDate", e.target.value)} /></div>
          </Row2>
          <div>
            <FL optional>LEASE LENGTH</FL>
            <SField value={form.leaseLength} onChange={v => set("leaseLength", v)}
              options={["Month-to-month","6 months","12 months","18 months","24 months","Other"]} placeholder="Lease length" />
          </div>
        </Section>
      )}

      {isSale && (
        <Section title="Sale Info">
          <div><FL>ASKING PRICE</FL><NumInput value={form.price} onChange={v => set("price", v)} placeholder="150000" prefix="$" /></div>
          <div>
            <FL>OWNER FINANCING AVAILABLE</FL>
            <YesNo value={form.ownerFinancing} onChange={v => set("ownerFinancing", v)} />
          </div>
          {form.ownerFinancing && (
            <>
              <Row2>
                <div><FL>DOWN PAYMENT</FL><NumInput value={form.ownerDownPayment} onChange={v => set("ownerDownPayment", v)} placeholder="5000" prefix="$" /></div>
                <div><FL>MONTHLY PAYMENT</FL><NumInput value={form.ownerMonthlyPayment} onChange={v => set("ownerMonthlyPayment", v)} placeholder="800" prefix="$" /></div>
              </Row2>
              <div><FL>TERM LENGTH</FL><SField value={form.ownerTermLength} onChange={v => set("ownerTermLength", v)} options={TERM_LENGTHS} placeholder="Term" /></div>
            </>
          )}
        </Section>
      )}

      {isShort && (
        <Section title="Short-Term Rates">
          <Row2>
            <div><FL>NIGHTLY RATE</FL><NumInput value={form.nightlyRate} onChange={v => set("nightlyRate", v)} placeholder="75" prefix="$" /></div>
            <div><FL optional>WEEKLY RATE</FL><NumInput value={form.weeklyRate} onChange={v => set("weeklyRate", v)} placeholder="450" prefix="$" /></div>
          </Row2>
          <Row2>
            <div><FL optional>CLEANING FEE</FL><NumInput value={form.cleaningFee} onChange={v => set("cleaningFee", v)} placeholder="50" prefix="$" /></div>
            <div><FL optional>SECURITY DEPOSIT</FL><NumInput value={form.deposit} onChange={v => set("deposit", v)} placeholder="200" prefix="$" /></div>
          </Row2>
          <Row2>
            <div><FL optional>MAX GUESTS</FL><NumInput value={form.maxGuests} onChange={v => set("maxGuests", v)} placeholder="4" /></div>
            <div><FL optional>MIN STAY (nights)</FL><NumInput value={form.minStay} onChange={v => set("minStay", v)} placeholder="1" /></div>
          </Row2>
        </Section>
      )}

      {isRent && (
        <Section title="Rental Requirements">
          <div>
            <FL>INCOME REQUIREMENT</FL>
            <ChipSelect options={INCOME_REQS} value={form.incomeRequirement} onChange={v => set("incomeRequirement", v)} />
          </div>
          <div>
            <FL>CREDIT CHECK REQUIRED</FL>
            <YesNo value={form.creditCheckRequired} onChange={v => set("creditCheckRequired", v)} />
          </div>
          {form.creditCheckRequired && (
            <div><FL optional>MINIMUM CREDIT SCORE</FL><NumInput value={form.minCreditScore} onChange={v => set("minCreditScore", v)} placeholder="580" /></div>
          )}
          <div>
            <FL>BACKGROUND CHECK REQUIRED</FL>
            <YesNo value={form.backgroundCheck} onChange={v => set("backgroundCheck", v)} />
          </div>
          <Row2>
            <div>
              <FL>EVICTIONS ACCEPTED</FL>
              <SField value={form.evictionsAccepted} onChange={v => set("evictionsAccepted", v)} options={EVICTION_OPTIONS} />
            </div>
            <div>
              <FL>SECTION 8</FL>
              <SField value={form.section8} onChange={v => set("section8", v)} options={SECTION8_OPTIONS} />
            </div>
          </Row2>
          <div>
            <FL>PETS ALLOWED</FL>
            <ChipSelect options={PET_POLICIES} value={form.petPolicy} onChange={v => set("petPolicy", v)} />
          </div>
          {form.petPolicy !== "No" && form.petPolicy && (
            <Row2>
              <div><FL optional>PET DEPOSIT</FL><NumInput value={form.petDeposit} onChange={v => set("petDeposit", v)} placeholder="300" prefix="$" /></div>
              <div><FL optional>PET RENT/MO</FL><NumInput value={form.petRent} onChange={v => set("petRent", v)} placeholder="25" prefix="$" /></div>
            </Row2>
          )}
        </Section>
      )}

      {(isRent || isShort) && (
        <Section title="Features & Amenities">
          <MultiChip options={PROPERTY_FEATURES} values={form.propertyFeatures}
            onChange={v => set("propertyFeatures", v)} />
        </Section>
      )}
    </div>
  );
}

// ─── STEP 3c: GENERIC BUILDERS ────────────────────────────────────────────────

function ToolsBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Tool Details">
        <div><FL>TOOL TYPE</FL><SField value={form.toolType} onChange={v => set("toolType", v)} options={TOOL_TYPES} placeholder="Select type" /></div>
        <Row2>
          <div><FL optional>BRAND</FL><input className={ic} placeholder="DeWalt, Stihl…" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>MODEL</FL><input className={ic} placeholder="Model" value={form.model} onChange={e => set("model", e.target.value)} /></div>
        </Row2>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <div>
          <FL>WORKS PROPERLY</FL>
          <ChipSelect options={["Yes","No","Partially","Unknown"]} value={form.worksProper} onChange={v => set("worksProper", v)} />
        </div>
        <Row2>
          <div>
            <FL>BATTERY INCLUDED</FL>
            <ChipSelect options={["Yes","No","N/A"]} value={form.batteryIncluded} onChange={v => set("batteryIncluded", v)} small />
          </div>
          <div>
            <FL>CHARGER INCLUDED</FL>
            <ChipSelect options={["Yes","No","N/A"]} value={form.chargerIncluded} onChange={v => set("chargerIncluded", v)} small />
          </div>
        </Row2>
      </Section>
      <Section title="Rental Option">
        <div><FL>RENTAL AVAILABLE</FL><YesNo value={form.rentalAvailable} onChange={v => set("rentalAvailable", v)} /></div>
        {form.rentalAvailable && (
          <Row2>
            <div><FL>RENTAL RATE/DAY</FL><NumInput value={form.rentalPrice} onChange={v => set("rentalPrice", v)} placeholder="50" prefix="$" /></div>
            <div><FL optional>DEPOSIT</FL><NumInput value={form.rentalDeposit} onChange={v => set("rentalDeposit", v)} placeholder="100" prefix="$" /></div>
          </Row2>
        )}
      </Section>
    </div>
  );
}

function ElectronicsBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  const isPhone = form.deviceType === "Smartphone";
  return (
    <div className="space-y-5">
      <Section title="Device Details">
        <div><FL>DEVICE TYPE</FL><SField value={form.deviceType} onChange={v => set("deviceType", v)} options={DEVICE_TYPES} placeholder="Select type" /></div>
        <Row2>
          <div><FL optional>BRAND</FL><input className={ic} placeholder="Apple, Samsung…" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>MODEL</FL><input className={ic} placeholder="Model" value={form.model} onChange={e => set("model", e.target.value)} /></div>
        </Row2>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <div>
          <FL>WORKS PROPERLY</FL>
          <ChipSelect options={["Yes","No","Partially"]} value={form.worksProper} onChange={v => set("worksProper", v)} />
        </div>
        <Row2>
          <div><FL optional>STORAGE</FL><input className={ic} placeholder="256GB" value={form.storageSize} onChange={e => set("storageSize", e.target.value)} /></div>
          <div>
            <FL>INCLUDES CHARGER</FL>
            <YesNo value={form.includesCharger} onChange={v => set("includesCharger", v)} />
          </div>
        </Row2>
        {isPhone && (
          <>
            <Row2>
              <div><FL optional>CARRIER</FL><input className={ic} placeholder="AT&T, Verizon…" value={form.carrier} onChange={e => set("carrier", e.target.value)} /></div>
              <div>
                <FL>UNLOCKED</FL>
                <ChipSelect options={["Yes","No","Unknown"]} value={form.unlocked} onChange={v => set("unlocked", v)} small />
              </div>
            </Row2>
            <Row2>
              <div>
                <FL>CRACKED SCREEN</FL>
                <YesNo value={form.crackedScreen} onChange={v => set("crackedScreen", v)} />
              </div>
              <div><FL optional>BATTERY HEALTH</FL><input className={ic} placeholder="89%" value={form.batteryHealth} onChange={e => set("batteryHealth", e.target.value)} /></div>
            </Row2>
          </>
        )}
      </Section>
    </div>
  );
}

function FurnitureBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Furniture Details">
        <div><FL>FURNITURE TYPE</FL><SField value={form.furnitureType} onChange={v => set("furnitureType", v)} options={FURNITURE_TYPES} placeholder="Select type" /></div>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <Row2>
          <div><FL optional>MATERIAL</FL><input className={ic} placeholder="Wood, fabric…" value={form.material} onChange={e => set("material", e.target.value)} /></div>
          <div><FL optional>COLOR</FL><input className={ic} placeholder="Color" value={form.itemColor} onChange={e => set("itemColor", e.target.value)} /></div>
        </Row2>
        <div><FL optional>DIMENSIONS</FL><input className={ic} placeholder='e.g. 84" W x 38" D' value={form.dimensions} onChange={e => set("dimensions", e.target.value)} /></div>
        <Row2>
          <div>
            <FL>DELIVERY AVAILABLE</FL>
            <YesNo value={form.deliveryAvailable} onChange={v => set("deliveryAvailable", v)} />
          </div>
          <div>
            <FL>ASSEMBLY REQUIRED</FL>
            <YesNo value={form.assemblyRequired} onChange={v => set("assemblyRequired", v)} />
          </div>
        </Row2>
        <Row2>
          <div>
            <FL>SMOKE-FREE HOME</FL>
            <YesNo value={form.smokeFreeHome} onChange={v => set("smokeFreeHome", v)} />
          </div>
          <div>
            <FL>PET-FREE HOME</FL>
            <YesNo value={form.petFreeHome} onChange={v => set("petFreeHome", v)} />
          </div>
        </Row2>
      </Section>
    </div>
  );
}

function ApplianceBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Appliance Details">
        <div><FL>APPLIANCE TYPE</FL><SField value={form.applianceType} onChange={v => set("applianceType", v)} options={APPLIANCE_TYPES} placeholder="Select type" /></div>
        <Row2>
          <div><FL optional>BRAND</FL><input className={ic} placeholder="Whirlpool…" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>MODEL</FL><input className={ic} placeholder="Model #" value={form.model} onChange={e => set("model", e.target.value)} /></div>
        </Row2>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <div>
          <FL>WORKS PROPERLY</FL>
          <ChipSelect options={["Yes","No","Partially"]} value={form.worksProper} onChange={v => set("worksProper", v)} />
        </div>
        <div><FL optional>GAS OR ELECTRIC</FL><ChipSelect options={["Gas","Electric","Both","N/A"]} value={form.gasOrElectric} onChange={v => set("gasOrElectric", v)} small /></div>
        <Row2>
          <div>
            <FL>DELIVERY AVAILABLE</FL>
            <YesNo value={form.deliveryAvailableAppliance} onChange={v => set("deliveryAvailableAppliance", v)} />
          </div>
          <div>
            <FL>INSTALLATION AVAILABLE</FL>
            <YesNo value={form.installationAvailable} onChange={v => set("installationAvailable", v)} />
          </div>
        </Row2>
        <div>
          <FL>WARRANTY REMAINING</FL>
          <YesNo value={form.warrantyRemaining} onChange={v => set("warrantyRemaining", v)} />
        </div>
      </Section>
    </div>
  );
}

function BoatBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Boat Details">
        <div><FL>BOAT TYPE</FL><SField value={form.boatType} onChange={v => set("boatType", v)} options={BOAT_TYPES} placeholder="Select type" /></div>
        <Row2>
          <div><FL optional>MAKE/BRAND</FL><input className={ic} placeholder="Tracker, Lund…" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>MODEL</FL><input className={ic} placeholder="Model" value={form.model} onChange={e => set("model", e.target.value)} /></div>
        </Row2>
        <Row2>
          <div><FL optional>YEAR</FL><NumInput value={form.vehicleYear} onChange={v => set("vehicleYear", v)} placeholder="2015" /></div>
          <div><FL optional>LENGTH (ft)</FL><NumInput value={form.boatLength} onChange={v => set("boatLength", v)} placeholder="18" /></div>
        </Row2>
        <Row2>
          <div><FL optional>ENGINE TYPE</FL><SField value={form.engineType} onChange={v => set("engineType", v)} options={["Outboard","Inboard","Stern Drive","Jet","Electric","Other"]} placeholder="Engine" /></div>
          <div><FL optional>HOURS</FL><NumInput value={form.hours} onChange={v => set("hours", v)} placeholder="250" /></div>
        </Row2>
        <div><FL>TITLE / OWNERSHIP</FL><ChipSelect options={TITLE_STATUSES} value={form.titleStatus} onChange={v => set("titleStatus", v)} small /></div>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <Row2>
          <div><FL>RUNS WELL</FL><ChipSelect options={["Yes","No","Needs Work"]} value={form.boatRuns} onChange={v => set("boatRuns", v)} small /></div>
          <div><FL>TRAILER INCLUDED</FL><YesNo value={form.trailerIncluded} onChange={v => set("trailerIncluded", v)} /></div>
        </Row2>
      </Section>
    </div>
  );
}

function TrailerBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Trailer Details">
        <div><FL>TRAILER TYPE</FL><SField value={form.trailerType} onChange={v => set("trailerType", v)} options={TRAILER_TYPES} placeholder="Select type" /></div>
        <Row2>
          <div><FL optional>MAKE</FL><input className={ic} placeholder="PJ, Big Tex…" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>YEAR</FL><NumInput value={form.vehicleYear} onChange={v => set("vehicleYear", v)} placeholder="2018" /></div>
        </Row2>
        <Row2>
          <div><FL optional>LENGTH (ft)</FL><NumInput value={form.trailerLength} onChange={v => set("trailerLength", v)} placeholder="16" /></div>
          <div><FL optional>VIN</FL><input className={`${ic} font-mono`} placeholder="If available" value={form.vinNumber} onChange={e => set("vinNumber", e.target.value)} /></div>
        </Row2>
        <div><FL>TITLE / OWNERSHIP</FL><ChipSelect options={TITLE_STATUSES} value={form.titleStatus} onChange={v => set("titleStatus", v)} small /></div>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
        <Row2>
          <div><FL>TIRES GOOD</FL><YesNo value={form.tiresGood} onChange={v => set("tiresGood", v)} /></div>
          <div><FL>LIGHTS WORK</FL><YesNo value={form.lightsWork} onChange={v => set("lightsWork", v)} /></div>
        </Row2>
      </Section>
    </div>
  );
}

function PartsBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Part Details">
        <Row2>
          <div><FL optional>BRAND</FL><input className={ic} placeholder="Brand" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>PART NUMBER</FL><input className={ic} placeholder="OEM #" value={form.partNumber} onChange={e => set("partNumber", e.target.value)} /></div>
        </Row2>
        <div><FL>CONDITION</FL><ChipSelect options={["New","Used","Refurbished","For Parts"]} value={form.condition} onChange={v => set("condition", v)} /></div>
      </Section>
      <Section title="Compatibility">
        <Row2>
          <div><FL optional>FITS MAKE</FL><SField value={form.compatibleMake} onChange={v => set("compatibleMake", v)} options={VEHICLE_MAKES} placeholder="Make" /></div>
          <div><FL optional>FITS MODEL</FL><input className={ic} placeholder="Model" value={form.compatibleModel} onChange={e => set("compatibleModel", e.target.value)} /></div>
        </Row2>
        <div><FL optional>FITS YEARS</FL><input className={ic} placeholder="e.g. 2015-2020" value={form.compatibleYears} onChange={e => set("compatibleYears", e.target.value)} /></div>
      </Section>
    </div>
  );
}

function GenericBuilder({ form, setForm }: { form: WizardForm; setForm: any }) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <Section title="Item Details">
        <Row2>
          <div><FL optional>BRAND</FL><input className={ic} placeholder="Brand" value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
          <div><FL optional>MODEL</FL><input className={ic} placeholder="Model" value={form.model} onChange={e => set("model", e.target.value)} /></div>
        </Row2>
        <div><FL>CONDITION</FL><ChipSelect options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} /></div>
      </Section>
    </div>
  );
}

// ─── STEP 3: DETAILS ROUTER ───────────────────────────────────────────────────

function DetailsStep({ form, setForm, onNext, onBack }: {
  form: WizardForm; setForm: any; onNext: () => void; onBack: () => void;
}) {
  const cat = form.category;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-28">
      <div className="mb-5">
        <h2 className="text-xl font-display font-extrabold text-white">{cat} Details</h2>
        <p className="text-xs text-gray-400 mt-1">Fill in what applies — more info means fewer back-and-forths</p>
      </div>
      <div className="space-y-5">
        {cat === "Vehicles" && <VehicleBuilder form={form} setForm={setForm} />}
        {cat === "Property" && <PropertyBuilder form={form} setForm={setForm} />}
        {cat === "Tools & Equipment" && <ToolsBuilder form={form} setForm={setForm} />}
        {cat === "Electronics" && <ElectronicsBuilder form={form} setForm={setForm} />}
        {cat === "Furniture" && <FurnitureBuilder form={form} setForm={setForm} />}
        {cat === "Appliances" && <ApplianceBuilder form={form} setForm={setForm} />}
        {cat === "Boats & Marine" && <BoatBuilder form={form} setForm={setForm} />}
        {cat === "Trailers" && <TrailerBuilder form={form} setForm={setForm} />}
        {cat === "Parts" && <PartsBuilder form={form} setForm={setForm} />}
        {!["Vehicles","Property","Tools & Equipment","Electronics","Furniture","Appliances","Boats & Marine","Trailers","Parts"].includes(cat) && (
          <GenericBuilder form={form} setForm={setForm} />
        )}
      </div>
    </div>
  );
}

// ─── STEP 4: PRICE, LOCATION & REVIEW ────────────────────────────────────────

function PriceLocationStep({ form, setForm, photos, onBack, onSubmit, isSubmitting }: {
  form: WizardForm; setForm: any; photos: string[];
  onBack: () => void; onSubmit: () => void; isSubmitting: boolean;
}) {
  const set = (k: keyof WizardForm, v: any) => setForm((f: WizardForm) => ({ ...f, [k]: v }));
  const { user } = useAuth();
  const isProperty = form.category === "Property";
  const isVehicle = form.category === "Vehicles";
  const skipPrice = isProperty && (form.listingType === "for_rent" || form.listingType === "roommate");

  // Auto-title for vehicles
  const autoTitle = () => {
    if (!isVehicle) return;
    const parts = [form.vehicleYear, form.vehicleMake, form.vehicleModel, form.vehicleTrim].filter(Boolean);
    if (form.titleStatus) parts.push("–", form.titleStatus);
    if (form.vehicleMileage) parts.push("–", `${parseInt(form.vehicleMileage).toLocaleString()} Miles`);
    if (parts.length > 0) set("title", parts.join(" "));
  };

  // Auto-title for property
  const autoPropertyTitle = () => {
    if (!isProperty) return;
    const ltLabel: Record<string, string> = { for_rent: "for Rent", for_sale: "for Sale", short_term: "– Short-Term Stay", lease_option: "– Lease Option", owner_financing: "– Owner Financing", roommate: "– Roommate Wanted" };
    const bed = form.bedrooms ? `${form.bedrooms} BR ` : "";
    const lt = ltLabel[form.listingType] || "";
    const city = form.city ? ` – ${form.city}, ${form.state || ""}`.trim() : "";
    const t = `${bed}${form.propertyType || "Property"} ${lt}${city}`.trim();
    if (t) set("title", t);
  };

  const reviewLines: { label: string; value: string }[] = [
    { label: "Category", value: form.category },
    ...(form.subCategory ? [{ label: "Type", value: form.subCategory }] : []),
    ...(form.listingType ? [{ label: "Listing Type", value: form.listingType.replace(/_/g, " ") }] : []),
    ...(form.sellerType ? [{ label: "Seller Type", value: form.sellerType }] : []),
    ...(isVehicle && form.vehicleYear ? [{ label: "Vehicle", value: `${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel} ${form.vehicleTrim}`.trim() }] : []),
    ...(isVehicle && form.vehicleMileage ? [{ label: "Mileage", value: `${parseInt(form.vehicleMileage).toLocaleString()} miles` }] : []),
    ...(isVehicle && form.titleStatus ? [{ label: "Title", value: form.titleStatus }] : []),
    ...(isVehicle && form.vinNumber ? [{ label: "VIN", value: form.vinNumber }] : []),
    ...(form.condition ? [{ label: "Condition", value: form.condition }] : []),
    { label: "Photos", value: `${photos.length} photo${photos.length !== 1 ? "s" : ""}` },
    ...(form.city && form.state ? [{ label: "Location", value: `${form.city}, ${form.state}` }] : []),
  ].filter(r => r.value && r.value.trim());

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 pb-28">
      <div>
        <h2 className="text-xl font-display font-extrabold text-white">Price & Location</h2>
        <p className="text-xs text-gray-400 mt-1">Almost done — review before posting</p>
      </div>

      {/* Price */}
      {!skipPrice && (
        <Section title="Price">
          <div>
            <FL>PRICE TYPE</FL>
            <div className="flex gap-2">
              {[
                { v: "firm", l: "Firm" },
                { v: "free", l: "Free" },
                { v: "obo", l: "Open to Offers" },
              ].map(({ v, l }) => (
                <button key={v} type="button"
                  onClick={() => set("priceType", v)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-display font-bold transition-all"
                  style={form.priceType === v
                    ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)", color: "#6b7280" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {form.priceType !== "free" && (
            <div>
              <FL>{isVehicle && form.purchaseType === "lease" ? "MONTHLY PAYMENT" : isVehicle ? "ASKING PRICE" : isProperty ? "PRICE" : "ASKING PRICE"}</FL>
              <NumInput value={form.price} onChange={v => set("price", v)} placeholder="0.00" prefix="$" />
            </div>
          )}
          {form.priceType === "obo" && (
            <div>
              <FL optional>MINIMUM OFFER (hidden from buyers)</FL>
              <NumInput value={form.minOfferThreshold} onChange={v => set("minOfferThreshold", v)} placeholder="0.00" prefix="$" />
              <p className="text-[10px] text-gray-500 mt-1">Offers below this threshold are auto-filtered — you're never notified</p>
            </div>
          )}
        </Section>
      )}

      {/* Location */}
      <Section title="Location">
        <div className="flex gap-2">
          <div className="flex-1">
            <FL>CITY</FL>
            <input className={ic} placeholder="City" value={form.city} onChange={e => set("city", e.target.value)} data-testid="input-listing-city" />
          </div>
          <div className="w-20">
            <FL>STATE</FL>
            <select className={ic} value={form.state} onChange={e => set("state", e.target.value)} data-testid="select-listing-state">
              <option value="">ST</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <FL optional>ZIP CODE</FL>
          <input className={ic} placeholder="ZIP code" value={form.zipcode} onChange={e => set("zipcode", e.target.value)} />
        </div>
      </Section>

      {/* Availability */}
      <Section title="Seller Availability">
        <ChipSelect options={AVAILABILITIES} value={form.sellerAvailability} onChange={v => set("sellerAvailability", v)} />
      </Section>

      {/* Auto-generate title */}
      {(isVehicle || isProperty) && (
        <Section title="Listing Title">
          <input className={ic} placeholder="Title (auto-generate or type your own)" value={form.title}
            onChange={e => set("title", e.target.value)} data-testid="input-listing-title-step4" />
          <button type="button"
            onClick={isVehicle ? autoTitle : autoPropertyTitle}
            className="text-xs text-primary/80 hover:text-primary transition-colors font-display font-bold flex items-center gap-1">
            <Zap className="w-3 h-3" /> Auto-generate title
          </button>
        </Section>
      )}

      {/* V&I link */}
      <Section title="GUBER Verify & Inspect">
        <div className="rounded-xl p-3" style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.18)" }}>
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-display font-bold text-emerald-400">Already have a V&I job?</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">Enter a completed V&I job ID to earn the GUBER Verified badge on your listing.</p>
          <input className={ic} placeholder="V&I Job ID (optional)" value={form.viJobId}
            onChange={e => set("viJobId", e.target.value)} data-testid="input-listing-vi-job" />
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes for Buyer">
        <NoteField value={form.sellerNotes} onChange={v => set("sellerNotes", v)} />
      </Section>

      {/* Review summary */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,229,118,0.55)" }}>
        <div className="px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-[11px] font-display font-bold text-gray-400 tracking-wider">LISTING SUMMARY</p>
        </div>
        <div className="p-3 space-y-1.5">
          {form.title && <p className="text-sm font-bold text-white">{form.title}</p>}
          {reviewLines.map(r => (
            <div key={r.label} className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{r.label}</span>
              <span className="text-gray-300 text-right max-w-[60%] capitalize">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-3 text-[11px] text-gray-500 leading-relaxed"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,229,118,0.55)" }}>
        GUBER does not process sales. All transactions are between buyer and seller. Listings expire after 30 days.
      </div>

    </div>
  );
}

// ─── MAIN WIZARD ─────────────────────────────────────────────────────────────

export function ListingWizard({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(defaultForm);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta[]>([]);


  // Auto-populate city/state from user's zipcode on mount
  useEffect(() => {
    if (!user?.zipcode) return;
    setForm(f => ({ ...f, zipcode: user.zipcode! }));
    fetch(`/api/zip-lookup?zip=${encodeURIComponent(user.zipcode)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { city: string; state: string } | null) => {
        if (data?.city && data?.state) {
          setForm(f => ({ ...f, city: f.city || data.city, state: f.state || data.state }));
        }
      })
      .catch(() => {});
  }, [user?.zipcode]);

  // ── JAC prefill: auto-populate form from listing-collect conversation ──
  useEffect(() => {
    const prefill = readListingPrefill();
    if (!prefill || !["vehicle", "item", "house"].includes(prefill.type)) return;
    const c = prefill.collected;
    clearListingPrefill();
    if (prefill.type === "vehicle") {
      setForm(f => ({
        ...f,
        category: "Vehicles",
        title: c.title || [c.year, c.make, c.model].filter(Boolean).join(" ") || f.title,
        vehicleYear: String(c.year || f.vehicleYear),
        vehicleMake: c.make || f.vehicleMake,
        vehicleModel: c.model || f.vehicleModel,
        vehicleMileage: c.mileage ? String(c.mileage) : f.vehicleMileage,
        condition: c.condition || f.condition,
        price: c.price ? String(c.price) : f.price,
        zipcode: c.zipcode || f.zipcode,
      }));
    } else if (prefill.type === "item") {
      setForm(f => ({
        ...f,
        category: c.category || f.category,
        title: c.title || f.title,
        description: c.description || f.description,
        condition: c.condition || f.condition,
        price: c.price ? String(c.price) : f.price,
        zipcode: c.zipcode || f.zipcode,
      }));
    } else if (prefill.type === "house") {
      setForm(f => ({
        ...f,
        category: "Property",
        listingType: c.listing_type || f.listingType,
        bedrooms: c.bedrooms ? String(c.bedrooms) : f.bedrooms,
        bathrooms: c.bathrooms ? String(c.bathrooms) : f.bathrooms,
        price: c.price ? String(c.price) : f.price,
        rent: c.price ? String(c.price) : f.rent,
        zipcode: c.zipcode || f.zipcode,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/marketplace", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-listings"] });
      toast({ title: "Listing posted!", description: "Your item is now live in Marketplace." });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const buildPayload = () => {
    const isVehicle = form.category === "Vehicles";
    const isProperty = form.category === "Property";

    const details: Record<string, any> = {};
    if (isVehicle) {
      if (form.vehicleTrim) details.trim = form.vehicleTrim;
      if (form.exteriorColor) details.exteriorColor = form.exteriorColor;
      if (form.interiorColor) details.interiorColor = form.interiorColor;
      if (form.transmission) details.transmission = form.transmission;
      if (form.fuelType) details.fuelType = form.fuelType;
      if (form.engine) details.engine = form.engine;
      if (form.driveType) details.driveType = form.driveType;
      if (form.conditionFlags.length) details.conditionFlags = form.conditionFlags;
      const fin = ["financing","bhph","lease"].includes(form.purchaseType);
      if (fin) {
        if (form.downPayment) details.downPayment = parseFloat(form.downPayment);
        if (form.monthlyPayment) details.monthlyPayment = parseFloat(form.monthlyPayment);
        if (form.termLength) details.termLength = form.termLength;
        if (form.interestRate) details.interestRate = parseFloat(form.interestRate);
        details.creditCheckRequired = form.creditCheckRequired;
        if (form.creditCheckRequired && form.minCreditScore) details.minCreditScore = parseInt(form.minCreditScore);
        details.proofOfIncomeRequired = form.proofOfIncomeRequired;
        if (form.purchaseType === "lease") {
          if (form.dueAtSigning) details.dueAtSigning = parseFloat(form.dueAtSigning);
          if (form.mileageLimit) details.mileageLimit = parseInt(form.mileageLimit);
        }
      }
    } else if (isProperty) {
      if (form.propertyType) details.propertyType = form.propertyType;
      if (form.listingSource) details.listingSource = form.listingSource;
      if (form.bedrooms) details.bedrooms = form.bedrooms;
      if (form.bathrooms) details.bathrooms = form.bathrooms;
      if (form.squareFeet) details.squareFeet = parseInt(form.squareFeet);
      if (form.yearBuilt) details.yearBuilt = parseInt(form.yearBuilt);
      if (form.deposit) details.deposit = parseFloat(form.deposit);
      if (form.availableDate) details.availableDate = form.availableDate;
      if (form.leaseLength) details.leaseLength = form.leaseLength;
      if (form.applicationFee) details.applicationFee = parseFloat(form.applicationFee);
      if (form.incomeRequirement && form.incomeRequirement !== "None") details.incomeRequirement = form.incomeRequirement;
      details.creditCheckRequired = form.creditCheckRequired;
      if (form.creditCheckRequired && form.minCreditScore) details.minCreditScore = parseInt(form.minCreditScore);
      details.backgroundCheck = form.backgroundCheck;
      if (form.evictionsAccepted) details.evictionsAccepted = form.evictionsAccepted;
      if (form.section8) details.section8 = form.section8;
      if (form.petPolicy) details.petPolicy = form.petPolicy;
      if (form.petDeposit) details.petDeposit = parseFloat(form.petDeposit);
      if (form.petRent) details.petRent = parseFloat(form.petRent);
      if (form.propertyFeatures.length) details.features = form.propertyFeatures;
      if (form.nightlyRate) details.nightlyRate = parseFloat(form.nightlyRate);
      if (form.weeklyRate) details.weeklyRate = parseFloat(form.weeklyRate);
      if (form.monthlyRate) details.monthlyRate = parseFloat(form.monthlyRate);
      if (form.cleaningFee) details.cleaningFee = parseFloat(form.cleaningFee);
      if (form.maxGuests) details.maxGuests = parseInt(form.maxGuests);
      if (form.minStay) details.minStay = parseInt(form.minStay);
      if (form.maxStay) details.maxStay = parseInt(form.maxStay);
      if (form.acreage) details.acreage = form.acreage;
      if (form.zoning) details.zoning = form.zoning;
      details.ownerFinancing = form.ownerFinancing;
      if (form.ownerFinancing) {
        if (form.ownerDownPayment) details.ownerDownPayment = parseFloat(form.ownerDownPayment);
        if (form.ownerMonthlyPayment) details.ownerMonthlyPayment = parseFloat(form.ownerMonthlyPayment);
        if (form.ownerTermLength) details.ownerTermLength = form.ownerTermLength;
      }
    } else {
      if (form.toolType) details.toolType = form.toolType;
      if (form.worksProper) details.worksProper = form.worksProper;
      if (form.batteryIncluded) details.batteryIncluded = form.batteryIncluded;
      if (form.chargerIncluded) details.chargerIncluded = form.chargerIncluded;
      if (form.rentalAvailable) { details.rentalAvailable = true; if (form.rentalPrice) details.rentalPrice = parseFloat(form.rentalPrice); if (form.rentalDeposit) details.rentalDeposit = parseFloat(form.rentalDeposit); }
      if (form.deviceType) details.deviceType = form.deviceType;
      if (form.storageSize) details.storageSize = form.storageSize;
      if (form.carrier) details.carrier = form.carrier;
      if (form.unlocked) details.unlocked = form.unlocked;
      if (form.crackedScreen) details.crackedScreen = true;
      if (form.batteryHealth) details.batteryHealth = form.batteryHealth;
      if (form.includesCharger !== undefined) details.includesCharger = form.includesCharger;
      if (form.furnitureType) details.furnitureType = form.furnitureType;
      if (form.material) details.material = form.material;
      if (form.itemColor) details.color = form.itemColor;
      if (form.dimensions) details.dimensions = form.dimensions;
      if (form.deliveryAvailable) details.deliveryAvailable = true;
      if (form.assemblyRequired) details.assemblyRequired = true;
      if (form.smokeFreeHome) details.smokeFreeHome = true;
      if (form.petFreeHome) details.petFreeHome = true;
      if (form.applianceType) details.applianceType = form.applianceType;
      if (form.gasOrElectric) details.gasOrElectric = form.gasOrElectric;
      if (form.deliveryAvailableAppliance) details.deliveryAvailable = true;
      if (form.installationAvailable) details.installationAvailable = true;
      if (form.warrantyRemaining) details.warrantyRemaining = true;
      if (form.boatType) details.boatType = form.boatType;
      if (form.boatLength) details.boatLength = form.boatLength;
      if (form.engineType) details.engineType = form.engineType;
      if (form.hours) details.hours = form.hours;
      if (form.trailerIncluded) details.trailerIncluded = true;
      if (form.boatRuns) details.boatRuns = form.boatRuns;
      if (form.trailerType) details.trailerType = form.trailerType;
      if (form.trailerLength) details.trailerLength = form.trailerLength;
      if (form.tiresGood) details.tiresGood = true;
      if (form.lightsWork) details.lightsWork = true;
      if (form.partNumber) details.partNumber = form.partNumber;
      if (form.compatibleMake) details.compatibleMake = form.compatibleMake;
      if (form.compatibleModel) details.compatibleModel = form.compatibleModel;
      if (form.compatibleYears) details.compatibleYears = form.compatibleYears;
    }

    // Price
    const rent = isProperty && (form.listingType === "for_rent" || form.listingType === "roommate") ? parseFloat(form.rent) || null : null;
    const salePriceForProperty = isProperty && (form.listingType === "for_sale" || form.listingType === "owner_financing") ? parseFloat(form.price) || null : null;
    let price: number | null = rent ?? salePriceForProperty ?? (form.priceType !== "free" && form.price ? parseFloat(form.price) : null);

    // Auto-generate title if empty
    let title = form.title.trim();
    if (!title) {
      if (isVehicle) {
        const parts = [form.vehicleYear, form.vehicleMake, form.vehicleModel, form.vehicleTrim].filter(Boolean);
        if (form.titleStatus) parts.push("–", form.titleStatus);
        if (form.vehicleMileage) parts.push("–", `${parseInt(form.vehicleMileage).toLocaleString()} Miles`);
        title = parts.join(" ").trim() || "Vehicle Listing";
      } else if (isProperty) {
        const bed = form.bedrooms ? `${form.bedrooms} BR ` : "";
        title = `${bed}${form.propertyType || "Property"} ${form.listingType?.replace(/_/g, " ") || ""}`.trim() || "Property Listing";
      } else {
        title = `${form.brand || ""} ${form.model || ""} ${form.category}`.trim() || "Item Listing";
      }
    }

    return {
      title,
      description: form.description || null,
      category: form.category,
      condition: form.condition || null,
      price,
      askingType: form.priceType === "obo" ? "obo" : form.priceType === "free" ? "free" : "fixed",
      priceType: form.priceType,
      makeOfferEnabled: form.priceType === "obo",
      minOfferThreshold: form.priceType === "obo" && form.minOfferThreshold ? parseFloat(form.minOfferThreshold) : null,
      brand: isVehicle ? form.vehicleMake || null : form.brand || null,
      model: isVehicle ? form.vehicleModel || null : form.model || null,
      year: (isVehicle || form.category === "Boats & Marine" || form.category === "Trailers") && form.vehicleYear ? parseInt(form.vehicleYear) : null,
      subCategory: form.subCategory || (isProperty ? form.propertyType : null) || null,
      listingType: form.listingType || form.purchaseType || null,
      sellerType: form.sellerType || null,
      vinNumber: form.vinNumber || null,
      vehicleMileage: form.vehicleMileage ? parseInt(form.vehicleMileage) : null,
      titleStatus: form.titleStatus || null,
      purchaseType: form.purchaseType || null,
      details: Object.keys(details).length > 0 ? { ...details, photoMeta: photoMeta.length ? photoMeta : undefined } : (photoMeta.length ? { photoMeta } : null),
      city: form.city,
      state: form.state,
      zipcode: form.zipcode || user?.zipcode || null,
      locationApprox: `${form.city}, ${form.state}`,
      sellerAvailability: form.sellerAvailability,
      photos,
      viJobId: form.viJobId ? parseInt(form.viJobId) : null,
      status: "available",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  };

  const DRAFT_KEY = `guber_draft_${user?.id ?? "anon"}`;

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, form, photos, photoMeta }));
      toast({ title: "Draft saved", description: "Pick up where you left off next time." });
      onClose();
    } catch {
      toast({ title: "Couldn't save draft", variant: "destructive" });
    }
  };

  const doSubmit = async () => {
    let city = form.city;
    let state = form.state;
    // If missing, try to resolve from zipcode first
    if ((!city || !state) && form.zipcode) {
      try {
        const r = await fetch(`/api/zip-lookup?zip=${encodeURIComponent(form.zipcode)}`);
        if (r.ok) {
          const data = await r.json();
          if (data.city) { city = data.city; setForm(f => ({ ...f, city: data.city, state: data.state })); }
          if (data.state) { state = data.state; }
        }
      } catch {}
    }
    if (!city || !state) {
      toast({ title: "Location required", description: "Please enter your city and state on the Price & Location step.", variant: "destructive" });
      setStep(4);
      return;
    }

    const isVehicleCategory = form.category === "Vehicles";
    const priceNum = form.price ? parseFloat(form.price) : 0;

    // Price floor validation
    if (isVehicleCategory && form.priceType !== "free" && priceNum > 0 && priceNum < 100) {
      toast({ title: "Price too low", description: "Price must be at least $100.", variant: "destructive" });
      setStep(4);
      return;
    }

    // Mileage floor validation
    const mileageNum = form.vehicleMileage ? parseInt(form.vehicleMileage) : 0;
    if (isVehicleCategory && form.vehicleMileage && mileageNum < 2) {
      toast({ title: "Invalid mileage", description: "Mileage must be at least 2 miles.", variant: "destructive" });
      setStep(4);
      return;
    }

    // Required fields: VIN is optional. If no VIN, all manual vehicle fields must be filled.
    if (isVehicleCategory && !form.vinNumber) {
      if (!form.vehicleMake || !form.vehicleModel || !form.vehicleYear) {
        toast({ title: "Please complete all required fields before posting.", description: "If you don't have a VIN, fill in Make, Model, and Year manually.", variant: "destructive" });
        setStep(3);
        return;
      }
    }

    mutation.mutate({ ...buildPayload(), city, state });
  };

  const handleWizardNext = () => {
    if (step === 4) {
      doSubmit();
    } else {
      if (step === 2 && photos.length === 0) {
        toast({ title: "At least 1 photo required", description: "Take a photo or upload from your gallery.", variant: "destructive" });
        return;
      }
      setStep(s => s + 1);
    }
  };

  const handleSubmit = () => {
    doSubmit();
  };

  const STEP_LABELS = ["Category", "Photos", "Details", "Price & Location"];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-lg bg-[#0e0e0e] border border-white/8 rounded-t-3xl flex flex-col"
        style={{ height: "94dvh", borderTop: "1.5px solid rgba(0,229,118,0.45)" }}
        data-testid="modal-listing-wizard">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-display font-bold text-gray-500 tracking-widest">LIST AN ITEM · FREE</p>
              <p className="text-sm font-display font-bold text-white">Step {step} of 4 — {STEP_LABELS[step - 1]}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/8 transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex-1 h-1 rounded-full transition-all"
                style={{ background: i <= step ? "rgba(0,229,118,0.8)" : "rgba(255,255,255,0.08)" }} />
            ))}
          </div>
        </div>

        {/* Step content */}
        {step === 1 && <CategoryStep form={form} setForm={setForm} onNext={() => setStep(2)} />}
        {step === 2 && <PhotosStep form={form} setForm={setForm} photos={photos} setPhotos={setPhotos}
          photoMeta={photoMeta} setPhotoMeta={setPhotoMeta}
          onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <DetailsStep form={form} setForm={setForm} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <PriceLocationStep form={form} setForm={setForm} photos={photos}
          onBack={() => setStep(3)} onSubmit={handleSubmit} isSubmitting={mutation.isPending} />}

        {/* Fixed bottom action bar — steps 2-4 */}
        {step > 1 && (
          <div className="shrink-0 px-4 pt-3 border-t border-white/[0.06]"
            style={{ background: "#0e0e0e", paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-3 py-3 rounded-xl text-xs font-display font-bold text-gray-400 hover:text-white transition-colors shrink-0"
                style={{ border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid="button-wizard-back">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button type="button" onClick={handleSaveDraft}
                className="px-3 py-3 rounded-xl text-xs font-display font-bold text-gray-400 hover:text-white transition-colors shrink-0"
                style={{ border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid="button-save-draft">
                Save Draft
              </button>
              <button type="button" onClick={handleWizardNext}
                disabled={mutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-display font-bold disabled:opacity-50 transition-all"
                style={{ background: "rgba(0,229,118,0.45)", border: "1.5px solid rgba(0,229,118,0.45)", color: "#00e676" }}
                data-testid={step === 4 ? "button-submit-listing" : "button-wizard-next"}>
                {step === 4
                  ? (mutation.isPending ? "Posting…" : "POST LISTING — FREE")
                  : step === 3 ? "Next: Review →"
                  : "Next: Details →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
