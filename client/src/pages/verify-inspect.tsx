import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  Lock,
  ChevronRight,
  CheckCircle,
  Camera,
  Video,
  MapPin,
  Clock,
  FileText,
  Shield,
  Sparkles,
  AlertCircle,
  Navigation,
  Package,
  Search,
  Tag,
  Zap,
} from "lucide-react";
import verifyInspectImg from "@assets/category-images/verify_inspect.png";
import propertySiteImg from "@assets/file_0000000010f471fd8230bcff69ab47cb_1772458042326.png";
import onlineItemsImg from "@assets/file_00000000bc5871f8b88e63dbfa6c16d2_1772458082754.png";
import wheelsWingsImg from "@assets/file_00000000a5947230b8561e43d9c81c1f_1772458107399.png";
import quickCheckImg from "@assets/file_000000001e2471f586eaaf945485317c_1772458167013.png";
import pavSalvageImg from "@assets/pav_salvage_yard.png";
import formPropertyImg from "@assets/category-images/vi_property_site_check.png";
import formOnlineImg from "@assets/category-images/vi_online_items.png";
import formWheelsImg from "@assets/category-images/vi_wheels_wings_water.png";
import formQuickImg from "@assets/category-images/vi_quick_check.png";
import formPavImg from "@assets/category-images/vi_pav_salvage.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  VICategory,
  UseCase,
  CatalogServiceType,
  DetailOptionSet,
  ProofTemplate,
} from "@shared/schema";

const TIER_ORDER = ["community", "verified", "credentialed", "elite"];

const TIMING_WINDOWS = [
  "ASAP (within 2 hours)",
  "Today (within 8 hours)",
  "Tomorrow",
  "Within 3 days",
  "Within 1 week",
  "Flexible / No rush",
];

const ACCESS_INSTRUCTIONS = [
  "Public access - no special instructions",
  "Gate code will be provided after lock",
  "Meet at front entrance",
  "Key lockbox - code provided after lock",
  "Contact on arrival for access",
  "Open lot / yard - walk in",
];

const VEHICLE_TYPES = [
  "Car / Sedan", "SUV / Crossover", "Truck / Pickup", "Van / Minivan",
  "Motorcycle", "RV / Camper", "Boat / Watercraft", "Trailer",
  "ATV / UTV", "Aircraft / Ultralight", "Other",
];

const ONLINE_PLATFORMS = [
  "Facebook Marketplace", "eBay", "Craigslist", "OfferUp",
  "Mercari", "Poshmark", "Amazon", "Etsy", "Other Website",
];

const PROPERTY_TYPES = [
  "Single Family Home", "Condo / Townhouse", "Apartment / Multi-Unit",
  "Commercial Property", "Vacant Land / Lot", "Storage Unit / Warehouse",
  "Other",
];

const ONLINE_SITUATIONS_META: Record<string, {
  icon: typeof Navigation;
  purpose: string;
  typicalUse: string;
  estimatedTime: string;
  proofItems: string[];
}> = {
  "Seller Location Check": {
    icon: Navigation,
    purpose: "Verify the seller's address is real before you drive there",
    typicalUse: "Before I drive 2 hours for this item, is this address even real?",
    estimatedTime: "2–5 min",
    proofItems: ["Building/house/business photo", "Street view photo", "Address number photo", "Observation note"],
  },
  "Item Exists Verification": {
    icon: Package,
    purpose: "Confirm the item from the listing actually exists at the location",
    typicalUse: "Is this item actually there, or is this a scam listing?",
    estimatedTime: "3–5 min",
    proofItems: ["Photo of item", "Wide shot showing item at location", "Presence note"],
  },
  "Condition Quick Check": {
    icon: Search,
    purpose: "Get close-up photos of wear, damage, and flaws before buying",
    typicalUse: "The listing photos look too good — what does it really look like?",
    estimatedTime: "5–10 min",
    proofItems: ["Overview photos (×2)", "Closeup photos of wear/damage (×2)", "Condition note"],
  },
  "Serial / Model Tag Confirmation": {
    icon: Tag,
    purpose: "Verify the serial number or model label matches the listing",
    typicalUse: "Is the serial number real and does it match what the seller claims?",
    estimatedTime: "2–5 min",
    proofItems: ["Item overview photo", "Serial tag / model label photo", "Matching note"],
  },
  "Electronics Power-On Proof": {
    icon: Zap,
    purpose: "Confirm an electronic device powers on and the screen works",
    typicalUse: "Does this laptop actually turn on, or is it dead?",
    estimatedTime: "5–10 min",
    proofItems: ["Device overview photo", "Powered-on screen photo", "Ports/connections photo", "Serial/model tag photo"],
  },
};

const ONLINE_ITEM_CATEGORIES = [
  "Electronics", "Furniture", "Tools", "Appliances", "Collectibles", "Outdoor Equipment", "Other"
];

const ONLINE_PLATFORM_OPTIONS = [
  "Facebook Marketplace", "Craigslist", "OfferUp", "eBay", "Mercari", "Other"
];

type SmartFormConfig = {
  showAccess: boolean;
  showPropertyType: boolean;
  showVehicleType: boolean;
  showOnlinePlatform: boolean;
  showListingUrl: boolean;
  showVinField: boolean;
  showMakeModelFields: boolean;
  accessLabel: string;
  showPartDescription?: boolean;
  showSourceVehicle?: boolean;
  showLocationName?: boolean;
  showLocationType?: boolean;
  showRowSection?: boolean;
  showSearchRadius?: boolean;
  showContactPermission?: boolean;
  showBountyToggle?: boolean;
};

const EXTERIOR_USE_CASE_KEYWORDS = ["exterior", "drive-by", "drive by", "vacancy", "occupancy", "hoa", "neighborhood", "curbside", "quick"];

type SituationField = {
  name: string;
  label: string;
  type: "yesno" | "dropdown" | "note";
  options?: string[];
  required?: boolean;
};

const PROPERTY_SITUATION_FIELDS: Record<string, SituationField[]> = {
  "Move-In Condition Baseline": [
    { name: "propertyType", label: "Property Type", type: "dropdown", options: ["House", "Apartment", "Condo", "Townhome", "Room", "Studio"], required: true },
    { name: "bedrooms", label: "Bedrooms", type: "dropdown", options: ["Studio", "1", "2", "3", "4", "5+"], required: true },
    { name: "bathrooms", label: "Bathrooms", type: "dropdown", options: ["1", "1.5", "2", "2.5", "3", "4+"], required: true },
    { name: "interiorPhotos", label: "Interior Photos Required", type: "yesno", required: true },
    { name: "appliancePhotos", label: "Appliance Photos", type: "yesno" },
    { name: "damageDocumentation", label: "Document Any Pre-Existing Damage", type: "yesno" },
  ],
  "Move-Out / Deposit Protection Check": [
    { name: "propertyType", label: "Property Type", type: "dropdown", options: ["House", "Apartment", "Condo", "Townhome", "Room", "Studio"], required: true },
    { name: "interiorCondition", label: "Overall Interior Condition", type: "dropdown", options: ["Good", "Fair", "Poor", "Significant Damage"], required: true },
    { name: "damageDocumentation", label: "Document Any Damage", type: "yesno", required: true },
    { name: "applianceCheck", label: "Appliance Condition Check", type: "yesno" },
    { name: "trashOrItems", label: "Trash or Personal Items Left Behind", type: "yesno" },
  ],
  "Airbnb Turnover / Host Check": [
    { name: "bedsPresent", label: "Beds Properly Set", type: "yesno", required: true },
    { name: "cleanlinessCheck", label: "Cleanliness Level", type: "dropdown", options: ["Clean & Guest Ready", "Needs Light Cleaning", "Needs Deep Cleaning", "Not Acceptable"], required: true },
    { name: "linensTowels", label: "Linens & Towels", type: "dropdown", options: ["Present & Fresh", "Present but Need Washing", "Missing"] },
    { name: "bathroomCondition", label: "Bathroom Condition", type: "dropdown", options: ["Good", "Fair", "Poor"] },
    { name: "kitchenCondition", label: "Kitchen Condition", type: "dropdown", options: ["Good", "Fair", "Poor"] },
    { name: "suppliesStocked", label: "Supplies Stocked for Next Guest", type: "yesno" },
  ],
  "Remote Landlord Routine Check": [
    { name: "exteriorCondition", label: "Exterior Condition", type: "dropdown", options: ["Good", "Fair", "Poor", "Damaged"], required: true },
    { name: "generalCondition", label: "General Property Condition", type: "dropdown", options: ["Good", "Fair", "Concerns Noted", "Immediate Attention Needed"], required: true },
    { name: "yardCondition", label: "Yard / Grounds", type: "dropdown", options: ["Maintained", "Overgrown", "Neglected"] },
    { name: "safetyItemsVisible", label: "Safety Items Visible (smoke detectors, etc.)", type: "yesno" },
  ],
  "Vacancy / Occupancy Confirmation": [
    { name: "vehiclesPresent", label: "Vehicles Present", type: "yesno", required: true },
    { name: "lightsActivity", label: "Lights or Activity Visible", type: "yesno", required: true },
    { name: "mailboxStatus", label: "Mailbox Status", type: "dropdown", options: ["Empty", "Full / Overflowing", "Unknown / Inaccessible"] },
    { name: "exteriorPhotos", label: "Exterior Photos Required", type: "yesno", required: true },
  ],
  "Exterior Only Check": [
    { name: "exteriorPhotos", label: "Full Exterior Photo Set", type: "yesno", required: true },
    { name: "yardCondition", label: "Yard Condition", type: "dropdown", options: ["Maintained", "Overgrown", "Neglected", "N/A"] },
    { name: "structureCondition", label: "Structure Condition", type: "dropdown", options: ["Good", "Fair", "Poor", "Damaged"], required: true },
  ],
  "HOA/Neighborhood Drive-By": [
    { name: "propertyExterior", label: "Property Exterior Status", type: "dropdown", options: ["Compliant", "Violations Visible", "Unable to Assess"], required: true },
    { name: "neighborhoodCondition", label: "Neighborhood Condition", type: "dropdown", options: ["Good", "Fair", "Poor"] },
    { name: "visibleViolations", label: "Visible Violations (trash, junk, etc.)", type: "yesno" },
  ],
  "Utilities/Fixtures Visual Check": [
    { name: "waterMeterVisible", label: "Water Meter Visible", type: "yesno", required: true },
    { name: "powerMeterVisible", label: "Power / Electric Meter Visible", type: "yesno", required: true },
    { name: "exteriorFixtures", label: "Exterior Fixtures Condition", type: "dropdown", options: ["Present & Intact", "Damaged", "Missing", "N/A"] },
  ],
  "Mail / Package Accumulation Check": [
    { name: "mailboxPhoto", label: "Mailbox Photo", type: "yesno", required: true },
    { name: "packagesPresent", label: "Packages Present", type: "yesno" },
    { name: "frontDoorArea", label: "Front Door Area", type: "dropdown", options: ["Clear", "Packages Piled Up", "Cluttered / Debris"] },
  ],
  "Door / Lock Security Check": [
    { name: "doorCondition", label: "Door Condition", type: "dropdown", options: ["Good", "Fair", "Damaged", "Broken"], required: true },
    { name: "locksVisible", label: "Locks Appear Functional", type: "yesno", required: true },
    { name: "brokenWindows", label: "Broken Windows or Entry Points", type: "yesno" },
  ],
  "Damage Documentation Check": [
    { name: "damageType", label: "Type of Damage", type: "dropdown", options: ["Water / Flood", "Fire / Smoke", "Vandalism", "Structural", "Pest / Mold", "Other"], required: true },
    { name: "damagePhotos", label: "Close-Up Damage Photos", type: "yesno", required: true },
    { name: "wideAreaPhotos", label: "Wide Area / Context Photos", type: "yesno", required: true },
  ],
  "Renovation / Work Progress Check": [
    { name: "workProgressPhotos", label: "Work Progress Photos", type: "yesno", required: true },
    { name: "materialsPresent", label: "Materials / Supplies On-Site", type: "yesno" },
    { name: "contractorActivity", label: "Contractor Activity Visible", type: "yesno" },
    { name: "workStage", label: "Work Stage", type: "dropdown", options: ["Just Started", "In Progress", "Nearly Complete", "Complete / Walkthrough Needed"] },
  ],
  "Vehicle / Activity Presence Check": [
    { name: "vehiclesPresent", label: "Vehicles Present", type: "yesno", required: true },
    { name: "drivewayPhoto", label: "Driveway / Parking Area Photo", type: "yesno", required: true },
    { name: "activityLevel", label: "General Activity Level", type: "dropdown", options: ["None", "Low", "Normal", "High"] },
  ],
  "Guest Activity / Party Check": [
    { name: "vehiclesPresent", label: "Vehicles Present (count if possible)", type: "yesno", required: true },
    { name: "noiseActivity", label: "Noise / Activity Level", type: "dropdown", options: ["None", "Moderate", "Loud", "Party / Gathering"], required: true },
    { name: "exteriorPhotos", label: "Exterior Photos", type: "yesno", required: true },
    { name: "shortVideo", label: "Short Video Clip (optional)", type: "yesno" },
  ],
  "Land Condition Check": [
    { name: "terrainDescription", label: "Terrain Type", type: "dropdown", options: ["Flat", "Rolling / Sloped", "Rocky", "Wooded", "Mixed"], required: true },
    { name: "vegetation", label: "Vegetation / Growth", type: "dropdown", options: ["Clear", "Light", "Dense", "Overgrown"], required: true },
    { name: "debrisDumping", label: "Debris or Dumping Present", type: "yesno" },
    { name: "wideLandPhotos", label: "Wide Landscape Photos Required", type: "yesno", required: true },
  ],
  "Land Access Verification": [
    { name: "roadAccessPhoto", label: "Road Access Photo", type: "yesno", required: true },
    { name: "gatePresence", label: "Gate Present", type: "yesno" },
    { name: "roadCondition", label: "Road / Access Condition", type: "dropdown", options: ["Paved", "Gravel", "Dirt / Passable", "Impassable"], required: true },
  ],
  "Boundary Marker / Fence Check": [
    { name: "fencePresence", label: "Fence Present", type: "yesno", required: true },
    { name: "cornerMarkers", label: "Corner Markers Visible", type: "yesno" },
    { name: "boundaryIndicators", label: "Boundary Indicators", type: "dropdown", options: ["Clearly Marked", "Partially Visible", "None Visible"] },
  ],
  "Illegal Dumping / Encroachment Check": [
    { name: "trashPresent", label: "Trash / Dumping Present", type: "yesno", required: true },
    { name: "abandonedVehicles", label: "Abandoned Vehicles", type: "yesno" },
    { name: "neighborEncroachment", label: "Neighbor / Structure Encroachment", type: "yesno" },
  ],
  "Utility Proximity Check": [
    { name: "powerPolesVisible", label: "Power Poles Visible", type: "yesno" },
    { name: "transformersVisible", label: "Transformers / Junction Boxes", type: "yesno" },
    { name: "waterMetersVisible", label: "Water Meters Visible", type: "yesno" },
    { name: "nearbyStructures", label: "Nearby Structures / Buildings", type: "yesno" },
  ],
};

function isSimpleUseCase(useCaseName: string | undefined): boolean {
  if (!useCaseName) return false;
  const lower = useCaseName.toLowerCase();
  return EXTERIOR_USE_CASE_KEYWORDS.some((kw) => lower.includes(kw));
}

const SIMPLE_DETAIL_FIELDS = ["propertyType", "photoIntensity"];

function filterDetailOptions(opts: any[], useCaseName: string | undefined): any[] {
  if (!opts) return [];
  if (isSimpleUseCase(useCaseName)) {
    return opts.filter((o) => SIMPLE_DETAIL_FIELDS.includes(o.name));
  }
  return opts;
}

function getSmartFormConfig(categoryName: string | undefined): SmartFormConfig {
  switch (categoryName) {
    case "Property & Site Check":
      return {
        showAccess: true,
        showPropertyType: false,
        showVehicleType: false,
        showOnlinePlatform: false,
        showListingUrl: false,
        showVinField: false,
        showMakeModelFields: false,
        accessLabel: "Property Access"
      };
    case "Wheels, Wings & Water":
      return {
        showAccess: true,
        showPropertyType: false,
        showVehicleType: true,
        showOnlinePlatform: false,
        showListingUrl: false,
        showVinField: true,
        showMakeModelFields: true,
        accessLabel: "Vehicle Access"
      };
    case "Online Items":
      return {
        showAccess: false,
        showPropertyType: false,
        showVehicleType: false,
        showOnlinePlatform: false,
        showListingUrl: true,
        showVinField: false,
        showMakeModelFields: false,
        accessLabel: ""
      };
    case "Quick Check":
      return {
        showAccess: true,
        showPropertyType: false,
        showVehicleType: false,
        showOnlinePlatform: false,
        showListingUrl: false,
        showVinField: false,
        showMakeModelFields: false,
        accessLabel: "Location Access"
      };
    case "Part Availability Verification":
      return {
        showAccess: true,
        showPropertyType: false,
        showVehicleType: false,
        showOnlinePlatform: false,
        showListingUrl: false,
        showVinField: false,
        showMakeModelFields: false,
        accessLabel: "Location Access",
        showPartDescription: true,
        showSourceVehicle: true,
        showLocationName: true,
        showLocationType: true,
        showRowSection: true,
        showSearchRadius: true,
        showContactPermission: true,
        showBountyToggle: true,
      };
    default:
      return {
        showAccess: true,
        showPropertyType: false,
        showVehicleType: false,
        showOnlinePlatform: false,
        showListingUrl: false,
        showVinField: false,
        showMakeModelFields: false,
        accessLabel: "Access Instructions"
      };
  }
}

function StepNumber({ num, active, completed }: { num: number; active: boolean; completed: boolean }) {
  return (
    <div
      className={`step-indicator ${active ? "active" : ""} flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold font-display transition-all duration-300 ${
        completed
          ? "bg-primary text-primary-foreground shadow-[0_0_10px_hsl(152_100%_44%/0.3)]"
          : active
          ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_hsl(152_100%_44%/0.2)]"
          : "bg-muted/60 text-muted-foreground border border-border/30"
      }`}
    >
      {completed ? <CheckCircle className="w-3.5 h-3.5" /> : num}
    </div>
  );
}

export default function VerifyInspect() {
  const { user, isDemoUser } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();

  useEffect(() => {
    const p = new URLSearchParams(searchStr);
    if (p.get("cancelled") === "true") {
      toast({
        title: "Payment cancelled",
        description: "No charge was made. Your request wasn't submitted — try again when ready.",
      });
      window.history.replaceState({}, "", "/verify-inspect");
    }
  }, []);
  const [showLanding, setShowLanding] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<number | null>(null);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<number | null>(null);
  const [detailValues, setDetailValues] = useState<Record<string, string>>({});
  const [timingWindow, setTimingWindow] = useState<string>("");
  const [accessInstruction, setAccessInstruction] = useState<string>("");
  const [smartFormValues, setSmartFormValues] = useState<Record<string, string>>({});
  const [vibudget, setViBudget] = useState<string>("");
  const [vizip, setViZip] = useState<string>("");
  const [viurgent, setViUrgent] = useState(false);
  const [isBounty, setIsBounty] = useState(false);

  const { data: viCategories, isLoading: catsLoading, isError: catsError, refetch: catsRefetch } = useQuery<VICategory[]>({
    queryKey: ["/api/catalog/vi-categories"],
  });

  const { data: useCases, isLoading: ucsLoading } = useQuery<UseCase[]>({
    queryKey: ["/api/catalog/use-cases", selectedCategoryId],
    enabled: !!selectedCategoryId,
  });

  const { data: serviceTypes, isLoading: stsLoading } = useQuery<CatalogServiceType[]>({
    queryKey: ["/api/catalog/service-types", selectedUseCaseId],
    enabled: !!selectedUseCaseId,
  });

  const { data: detailOptions, isLoading: dosLoading } = useQuery<DetailOptionSet[]>({
    queryKey: ["/api/catalog/detail-options", selectedCategoryId],
    enabled: !!selectedCategoryId,
  });

  const selectedCategory = useMemo(
    () => viCategories?.find((c) => c.id === selectedCategoryId) ?? null,
    [viCategories, selectedCategoryId]
  );

  const selectedUseCase = useMemo(
    () => useCases?.find((uc) => uc.id === selectedUseCaseId) ?? null,
    [useCases, selectedUseCaseId]
  );

  const selectedServiceType = useMemo(
    () => serviceTypes?.find((st) => st.id === selectedServiceTypeId) ?? null,
    [serviceTypes, selectedServiceTypeId]
  );

  const { data: proofTemplate } = useQuery<ProofTemplate & { checklistItems?: any[] }>({
    queryKey: ["/api/catalog/proof-template", selectedServiceType?.proofTemplateId],
    enabled: !!selectedServiceType?.proofTemplateId,
  });

  const userTierIdx = TIER_ORDER.indexOf(user?.tier || "community");

  function canAccessUseCase(uc: UseCase): boolean {
    const reqIdx = TIER_ORDER.indexOf(uc.minTier || "community");
    return userTierIdx >= reqIdx;
  }

  function canAccessServiceType(st: CatalogServiceType): boolean {
    const reqIdx = TIER_ORDER.indexOf(st.minTier || "community");
    return userTierIdx >= reqIdx;
  }

  function isOpenToAll(uc: UseCase): boolean {
    return (uc.minTier || "community") === "community";
  }

  const isOnlineItems = selectedCategory?.name === "Online Items";

  const generatedTitle = useMemo(() => {
    if (!selectedUseCase || !selectedServiceType) return "";
    if (isOnlineItems) {
      const cat = smartFormValues["itemCategory"] || "";
      return cat ? `${selectedUseCase.name} — ${cat}` : `${selectedUseCase.name} — Online Item`;
    }
    if (selectedCategory?.name === "Part Availability Verification") {
      const part = smartFormValues["partDescription"] || "Part";
      const loc = smartFormValues["locationName"] || "Location";
      const radius = smartFormValues["searchRadius"] || "";
      if (selectedUseCase.name.includes("Radius") || selectedUseCase.name.includes("Multiple")) {
        return `Part Search: ${part} within ${radius}`;
      }
      return `Part Verify: ${part} @ ${loc}`;
    }
    return `${selectedUseCase.name} - ${selectedServiceType.name}`;
  }, [selectedUseCase, selectedServiceType, selectedCategory, smartFormValues, isOnlineItems]);

  const generatedDescription = useMemo(() => {
    if (!selectedServiceType) return "";
    let desc =
      selectedServiceType.descriptionTemplate ||
      selectedServiceType.description ||
      "";
    const detailParts = Object.entries(detailValues)
      .filter(([, v]) => v && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    if (detailParts.length > 0) {
      desc += "\n\nDetails:\n" + detailParts.join("\n");
    }
    if (timingWindow) {
      desc += `\n\nTiming: ${timingWindow}`;
    }
    if (accessInstruction) {
      desc += `\nAccess: ${accessInstruction}`;
    }
    return desc;
  }, [selectedServiceType, detailValues, timingWindow, accessInstruction]);

  const visibleDetailOptions = useMemo(
    () => filterDetailOptions(detailOptions || [], selectedUseCase?.name),
    [detailOptions, selectedUseCase?.name]
  );

  const situationFields: SituationField[] | null = useMemo(() => {
    if (selectedCategory?.name !== "Property & Site Check") return null;
    return PROPERTY_SITUATION_FIELDS[selectedUseCase?.name || ""] ?? null;
  }, [selectedCategory?.name, selectedUseCase?.name]);

  const allDetailsFilled = useMemo(() => {
    if (isOnlineItems) return true;
    if (situationFields) {
      const required = situationFields.filter((f) => f.required);
      return required.every((f) => detailValues[f.name] && detailValues[f.name] !== "");
    }
    if (!visibleDetailOptions || visibleDetailOptions.length === 0) return true;
    const requiredOpts = visibleDetailOptions.filter((d) => d.required);
    return requiredOpts.every((d) => detailValues[d.name] && detailValues[d.name] !== "");
  }, [isOnlineItems, situationFields, visibleDetailOptions, detailValues]);

  const budgetNum = vibudget ? parseFloat(vibudget) : 0;
  const isOG = user?.day1OG === true;
  const urgentFee = viurgent ? (isOG ? 0 : 10) : 0;
  const totalCharge = budgetNum + urgentFee;

  const canProceed =
    selectedCategoryId &&
    selectedUseCaseId &&
    selectedServiceTypeId &&
    allDetailsFilled &&
    (selectedCategory?.name === "Online Items" || selectedCategory?.name === "Part Availability Verification" || !!timingWindow) &&
    (selectedCategory?.name !== "Part Availability Verification" || (
      smartFormValues["partDescription"] &&
      (!(selectedUseCase?.name.includes("Specific") || selectedUseCase?.name.includes("Search Known")) || smartFormValues["locationName"])
    )) &&
    budgetNum > 0 &&
    vizip.length >= 5;

  const currentStep = !selectedUseCaseId ? 1 : !selectedServiceTypeId ? 2 : !allDetailsFilled ? 3 : (selectedCategory?.name !== "Online Items" && selectedCategory?.name !== "Part Availability Verification" && !timingWindow) ? 4 : !(budgetNum > 0 && vizip.length >= 5) ? 5 : 6;

  const smartFormConfig = useMemo(
    () => getSmartFormConfig(selectedCategory?.name),
    [selectedCategory]
  );

  function handleSmartFormChange(name: string, value: string) {
    setSmartFormValues(prev => ({ ...prev, [name]: value }));
  }

  function handleCategoryChange(val: string) {
    const id = parseInt(val);
    setSelectedCategoryId(id);
    setSelectedUseCaseId(null);
    setSelectedServiceTypeId(null);
    setDetailValues({});
    setTimingWindow("");
    setAccessInstruction("");
    setSmartFormValues({});
  }

  function handleUseCaseChange(val: string) {
    const id = parseInt(val);
    setSelectedUseCaseId(id);
    setSelectedServiceTypeId(null);
  }

  function handleServiceTypeChange(val: string) {
    const id = parseInt(val);
    setSelectedServiceTypeId(id);
  }

  useEffect(() => {
    if (!stsLoading && serviceTypes && serviceTypes.length === 1 && !selectedServiceTypeId) {
      setSelectedServiceTypeId(serviceTypes[0].id);
    }
  }, [serviceTypes, stsLoading, selectedServiceTypeId]);

  function handleDetailChange(name: string, value: string) {
    setDetailValues((prev) => ({ ...prev, [name]: value }));
  }

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const allJobDetails = { ...detailValues, ...smartFormValues };
      if (accessInstruction) allJobDetails["Access"] = accessInstruction;
      if (timingWindow) allJobDetails["Timing"] = timingWindow;
      const payload = {
        category: "Verify & Inspect",
        verifyInspectCategory: selectedCategory?.name || "",
        useCaseName: selectedUseCase?.name || "",
        catalogServiceTypeName: selectedServiceType?.name || "",
        jobDetails: Object.keys(allJobDetails).length > 0 ? allJobDetails : undefined,
        budget: budgetNum,
        location: `${vizip} area`,
        locationApprox: `${vizip} area`,
        zip: vizip,
        urgentSwitch: viurgent,
        isBounty: isBounty,
        serviceType: selectedServiceType?.name || "",
      };
      const resp = await apiRequest("POST", "/api/jobs/create-checkout", payload);
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Request submitted!" });
        navigate("/vi-requests");
      }
    },
    onError: (err: any) => {
      const msg = err?.message || String(err);
      const isAuth = msg.includes("401") || msg.toLowerCase().includes("unauthorized");
      toast({
        title: isAuth ? "Session expired" : "Could not submit",
        description: isAuth
          ? "Please log out and log back in, then try again."
          : msg,
        variant: "destructive",
      });
    },
  });

  const GRID_CATEGORIES = [
    { name: "Property & Site Check", img: propertySiteImg, wide: false },
    { name: "Online Items", img: onlineItemsImg, wide: false },
    { name: "Wheels, Wings & Water", img: wheelsWingsImg, wide: false },
    { name: "Quick Check", img: quickCheckImg, wide: false },
    { name: "Part Availability Verification", img: pavSalvageImg, wide: true },
  ];

  function handleLandingSelect(catName: string) {
    const cat = viCategories?.find((c) => c.name === catName);
    if (cat) {
      handleCategoryChange(cat.id.toString());
      setShowLanding(false);
    } else {
      toast({
        title: "Try again",
        description: "Still loading categories, please wait a moment.",
        variant: "destructive",
      });
    }
  }

  if (!user?.idVerified) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-full bg-muted/30 border border-border flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-foreground mb-2">ID Verification Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You need to verify your ID before you can submit a Verify &amp; Inspect request.
              It only takes a few minutes.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Link href="/profile">
              <Button className="w-full" data-testid="button-verify-id-cta">Verify My ID Now</Button>
            </Link>
            <Button variant="ghost" onClick={() => history.back()} data-testid="button-vi-gate-back">Go Back</Button>
          </div>
        </div>
      </GuberLayout>
    );
  }

  if (showLanding) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-verify-inspect">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="mb-3 gap-1 text-muted-foreground px-0" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>

          <div className="relative rounded-2xl overflow-hidden mb-5 min-h-[120px]"
               style={{ border: "1.5px solid hsl(275 90% 65% / 0.5)", boxShadow: "0 0 18px hsl(275 90% 65% / 0.12)" }}>
            <img src={verifyInspectImg} alt="Verify & Inspect" className="absolute inset-0 w-full h-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
            <div className="relative p-5">
              <p className="text-[9px] font-display font-bold tracking-widest text-primary/80 uppercase mb-1">GUBER</p>
              <h1 className="text-2xl font-display font-black text-white tracking-tight leading-tight">Verify &amp; Inspect</h1>
              <p className="text-white/50 text-xs mt-1">Visual proof jobs — on-site verification</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/50 mb-3 uppercase">Inspection Categories</p>
            {catsError ? (
              <div className="text-center py-10">
                <AlertCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
                <p className="text-muted-foreground font-display text-sm mb-3">Could not load categories</p>
                <button
                  onClick={() => catsRefetch()}
                  className="text-xs font-display text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/10 transition-colors"
                  data-testid="button-retry-vi-categories"
                >
                  Retry
                </button>
              </div>
            ) : catsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-44 rounded-2xl bg-muted/20 animate-pulse" />)}
                <div className="col-span-2 h-36 rounded-2xl bg-muted/20 animate-pulse" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {GRID_CATEGORIES.map((lc) => {
                  const cat = viCategories?.find((c) => c.name === lc.name);
                  const isPAV = lc.name === "Part Availability Verification";
                  return (
                    <button
                      key={lc.name}
                      onClick={() => handleLandingSelect(lc.name)}
                      disabled={catsLoading && !cat}
                      className={`relative rounded-2xl overflow-hidden flex flex-col items-end justify-end transition-all active:scale-95 hover:scale-[1.02] ${lc.wide ? "col-span-2 h-36" : "aspect-square"}`}
                      style={{ background: "#0d0d1a", border: "1.5px solid hsl(275 90% 65% / 0.75)", boxShadow: "0 0 12px hsl(275 90% 65% / 0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}
                      data-testid={`button-vi-category-${lc.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    >
                      <img
                        src={lc.img}
                        alt={lc.name}
                        className="absolute inset-0 w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                      />
                      <div className={`absolute inset-0 bg-gradient-to-t ${isPAV ? "from-black/80 via-black/30 to-transparent" : "from-black/40 to-transparent"}`} />
                      {isPAV && (
                        <div className="absolute bottom-0 left-0 p-3 w-full">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Sparkles className="w-3 h-3 text-yellow-400" />
                            <span className="text-[9px] font-bold text-yellow-400/90 uppercase tracking-widest">Bounty Mode</span>
                          </div>
                          <p className="text-white font-display font-black text-sm tracking-tight">PART AVAILABILITY VERIFICATION</p>
                          <p className="text-white/50 text-[10px] mt-0.5">Salvage yards · Shops · Private sellers · Auction lots</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[10px] font-display text-muted-foreground/40 tracking-widest">OR</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <button
            onClick={() => navigate("/vi-requests")}
            className="w-full h-14 rounded-2xl font-display font-bold text-sm tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
            data-testid="button-browse-vi-requests"
          >
            <Shield className="w-4 h-4" />
            TAKE REQUESTS — BROWSE OPEN REQUESTS
          </button>
        </div>
      </GuberLayout>
    );
  }

  return (
    <GuberLayout>
      <div
        className="max-w-lg mx-auto px-4 py-6"
        data-testid="page-verify-inspect"
      >
        <button
          onClick={() => { setShowLanding(true); setSelectedCategoryId(null); setSelectedUseCaseId(null); setSelectedServiceTypeId(null); setDetailValues({}); setTimingWindow(""); setAccessInstruction(""); setSmartFormValues({}); }}
          className="mb-3 gap-1 text-muted-foreground px-0 flex items-center text-sm hover:text-foreground transition-colors"
          data-testid="button-back-dashboard"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>

        <div className="mb-6 animate-fade-in">
          {(() => {
            const FORM_IMGS: Record<string, string> = {
              "Property & Site Check": formPropertyImg,
              "Online Items": formOnlineImg,
              "Wheels, Wings & Water": formWheelsImg,
              "Quick Check": formQuickImg,
              "Part Availability Verification": formPavImg,
            };
            const catImg = selectedCategory?.name ? FORM_IMGS[selectedCategory.name] : undefined;
            return catImg ? (
              <div className="relative rounded-2xl overflow-hidden mb-4" style={{ height: 90, border: "1.5px solid hsl(275 90% 65% / 0.4)", boxShadow: "0 0 14px hsl(275 90% 65% / 0.10)" }}>
                <img src={catImg} alt={selectedCategory?.name} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-center px-4">
                  <p className="text-[9px] font-display font-bold tracking-widest text-primary/80 uppercase mb-0.5">GUBER · VERIFY &amp; INSPECT</p>
                  <h1 className="text-lg font-display font-black text-white tracking-tight leading-tight">{selectedCategory?.name}</h1>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 guber-text-purple" />
                <h1 className="text-2xl font-display font-bold guber-text-purple tracking-tight">VERIFY / INSPECT</h1>
              </div>
            );
          })()}
          <p className="text-sm text-muted-foreground">
            Build your inspection request step by step
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                {s > 1 && (
                  <div className={`w-6 h-0.5 rounded-full transition-all duration-500 ${s < currentStep ? "bg-primary" : s === currentStep ? "bg-primary/40" : "bg-muted/40"}`} />
                )}
                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${s < currentStep ? "bg-primary shadow-[0_0_6px_hsl(152_100%_44%/0.4)]" : s === currentStep ? "bg-primary/60 animate-pulse-glow" : "bg-muted/40"}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-xl animate-fade-in"
            style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)" }}
            data-testid="step-category-locked"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-bold text-foreground">{selectedCategory?.name}</span>
            </div>
            <button
              onClick={() => { setShowLanding(true); setSelectedCategoryId(null); setSelectedUseCaseId(null); setSelectedServiceTypeId(null); setDetailValues({}); setTimingWindow(""); setAccessInstruction(""); setSmartFormValues({}); }}
              className="text-[11px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
              data-testid="button-change-category"
            >
              Change
            </button>
          </div>

          <Card className="glass-card rounded-xl p-5 animate-slide-up" data-testid="step-situation">
            <div className="flex items-center gap-2.5 mb-3">
              <StepNumber num={1} active={currentStep === 1} completed={currentStep > 1} />
              <span className="font-display font-semibold text-sm tracking-wide">Situation</span>
            </div>
            {ucsLoading ? (
              <Skeleton className="h-10 w-full rounded-md" data-testid="skeleton-situations" />
            ) : isOnlineItems && useCases && useCases.length > 0 ? (
              <div className="space-y-3" data-testid="online-situations-grid">
                <p className="text-xs text-muted-foreground mb-1">What do you need verified?</p>
                {useCases.map((uc) => {
                  const meta = ONLINE_SITUATIONS_META[uc.name] ?? {
                    icon: Package,
                    purpose: uc.description || "Online item verification",
                    typicalUse: "Verify an item from an online listing",
                    estimatedTime: "5–10 min",
                    proofItems: ["Photo documentation"],
                  };
                  const Icon = meta.icon;
                  const isSelected = selectedUseCaseId === uc.id;
                  return (
                    <button
                      key={uc.id}
                      onClick={() => handleUseCaseChange(uc.id.toString())}
                      className={`w-full text-left rounded-xl p-4 transition-all border-2 ${
                        isSelected
                          ? "border-purple-500/60 bg-purple-500/10 shadow-[0_0_16px_hsl(275_90%_65%/0.15)]"
                          : "border-white/8 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/5"
                      }`}
                      data-testid={`btn-online-situation-${uc.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-purple-500/20" : "bg-white/5"
                        }`}>
                          <Icon className={`w-4.5 h-4.5 ${isSelected ? "text-purple-400" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-display font-bold text-sm ${isSelected ? "text-purple-300" : "text-foreground"}`}>
                              {uc.name}
                            </span>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400/80">
                              {meta.estimatedTime}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground/70 italic mt-1 leading-relaxed">
                            "{meta.typicalUse}"
                          </p>
                          {isSelected && (
                            <div className="mt-2.5 space-y-1 border-t border-white/5 pt-2.5">
                              <span className="text-[9px] font-display text-muted-foreground/50 uppercase tracking-widest">
                                Helper will provide
                              </span>
                              {meta.proofItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <CheckCircle className="w-3 h-3 text-primary shrink-0" />
                                  <span>{item}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>
                  );
                })}

                {selectedUseCase && (() => {
                  const previewMeta = ONLINE_SITUATIONS_META[selectedUseCase.name] ?? {
                    purpose: selectedUseCase.description || "Online item verification",
                    estimatedTime: "5–10 min",
                    proofItems: ["Photo documentation"],
                  };
                  return (
                    <div
                      className="rounded-xl p-4 mt-2"
                      style={{ background: "rgba(0,230,118,0.04)", border: "1.5px solid rgba(0,230,118,0.2)" }}
                      data-testid="online-job-preview"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-display font-bold text-primary uppercase tracking-widest">Generated Job Preview</span>
                      </div>
                      <p className="font-display font-bold text-sm text-foreground">
                        {selectedUseCase.name} — Online Item
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{previewMeta.purpose}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">
                          <Clock className="w-2.5 h-2.5 mr-1" />
                          {previewMeta.estimatedTime}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">
                          <Camera className="w-2.5 h-2.5 mr-1" />
                          {previewMeta.proofItems.length} proof items
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 border-t border-white/5 pt-2.5">
                        <span className="text-[9px] font-display text-muted-foreground/50 uppercase tracking-widest">
                          Helper will provide
                        </span>
                        {previewMeta.proofItems.map((item: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <CheckCircle className="w-3 h-3 text-primary shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : useCases && useCases.length > 0 ? (
              <>
                <Select
                  value={selectedUseCaseId?.toString() || ""}
                  onValueChange={handleUseCaseChange}
                >
                  <SelectTrigger className="premium-input rounded-md" data-testid="select-situation">
                    <SelectValue placeholder="What's your situation?" />
                  </SelectTrigger>
                  <SelectContent>
                    {useCases.map((uc) => {
                      const accessible = canAccessUseCase(uc);
                      const openAll = isOpenToAll(uc);
                      return (
                        <SelectItem
                          key={uc.id}
                          value={uc.id.toString()}
                          disabled={!accessible}
                          data-testid={`option-situation-${uc.id}`}
                        >
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>{uc.name}</span>
                            {!accessible && (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Lock className="w-3 h-3" />
                                <span className="text-[10px]">Requires {uc.minTier}</span>
                              </span>
                            )}
                            {openAll && (
                              <span className="text-[10px] guber-text-green font-semibold">OPEN TO ALL</span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedUseCase?.description && (
                  <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                    {selectedUseCase.description}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No options available for this category.</p>
            )}
          </Card>

          {selectedUseCaseId && !stsLoading && serviceTypes && serviceTypes.length > 1 && (
            <Card className="glass-card rounded-xl p-5 animate-slide-up" data-testid="step-proof-package">
              <div className="flex items-center gap-2.5 mb-3">
                <StepNumber num={2} active={currentStep === 2} completed={currentStep > 2} />
                <span className="font-display font-semibold text-sm tracking-wide">Proof Package</span>
              </div>
              <Select
                value={selectedServiceTypeId?.toString() || ""}
                onValueChange={handleServiceTypeChange}
              >
                <SelectTrigger className="premium-input rounded-md" data-testid="select-proof-package">
                  <SelectValue placeholder="Choose your proof package" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((st) => {
                    const accessible = canAccessServiceType(st);
                    return (
                      <SelectItem
                        key={st.id}
                        value={st.id.toString()}
                        disabled={!accessible}
                        data-testid={`option-proof-package-${st.id}`}
                      >
                        <span className="flex items-center gap-2 flex-wrap">
                          <span>{st.name}</span>
                          {!accessible && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Lock className="w-3 h-3" />
                              <span className="text-[10px]">Requires {st.minTier}</span>
                            </span>
                          )}
                          {st.credentialRequired && (
                            <Shield className="w-3 h-3 text-amber-500" />
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedServiceType?.description && (
                <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                  {selectedServiceType.description}
                </p>
              )}
            </Card>
          )}
          {selectedUseCaseId && stsLoading && (
            <Card className="glass-card rounded-xl p-5 animate-slide-up">
              <Skeleton className="h-10 w-full rounded-md" data-testid="skeleton-proof-packages" />
            </Card>
          )}

          {selectedServiceTypeId && selectedCategoryId && (
            <Card className="glass-card rounded-xl p-5 animate-slide-up" data-testid="step-details">
              <div className="flex items-center gap-2.5 mb-3">
                <StepNumber num={3} active={currentStep === 3} completed={currentStep > 3} />
                <span className="font-display font-semibold text-sm tracking-wide">Details</span>
              </div>
              {isOnlineItems ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                      Item Category <span className="text-muted-foreground/50 text-[10px]">(optional)</span>
                    </label>
                    <Select value={smartFormValues.itemCategory || ""} onValueChange={(v) => handleSmartFormChange("itemCategory", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-online-item-category">
                        <SelectValue placeholder="What type of item?" />
                      </SelectTrigger>
                      <SelectContent>
                        {ONLINE_ITEM_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} data-testid={`option-item-cat-${cat}`}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                      Online Platform <span className="text-muted-foreground/50 text-[10px]">(optional)</span>
                    </label>
                    <Select value={smartFormValues.onlinePlatform || ""} onValueChange={(v) => handleSmartFormChange("onlinePlatform", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-online-platform">
                        <SelectValue placeholder="Where is the item listed?" />
                      </SelectTrigger>
                      <SelectContent>
                        {ONLINE_PLATFORM_OPTIONS.map((op) => (
                          <SelectItem key={op} value={op} data-testid={`option-platform-${op}`}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : dosLoading ? (
                <Skeleton className="h-10 w-full rounded-md" data-testid="skeleton-details" />
              ) : situationFields && situationFields.length > 0 ? (
                <div className="space-y-3">
                  {situationFields.map((field) => (
                    <div key={field.name}>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      {field.type === "yesno" ? (
                        <div className="flex gap-2">
                          {["Yes", "No"].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleDetailChange(field.name, opt)}
                              className={`flex-1 h-9 rounded-lg text-xs font-display font-bold tracking-wider transition-all ${detailValues[field.name] === opt ? "bg-primary text-primary-foreground shadow-[0_0_8px_hsl(152_100%_44%/0.3)]" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"}`}
                              data-testid={`btn-detail-${field.name}-${opt.toLowerCase()}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : field.type === "dropdown" ? (
                        <Select
                          value={detailValues[field.name] || ""}
                          onValueChange={(v) => handleDetailChange(field.name, v)}
                        >
                          <SelectTrigger className="premium-input rounded-md" data-testid={`select-detail-${field.name}`}>
                            <SelectValue placeholder={`Select ${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options || []).map((o) => (
                              <SelectItem key={o} value={o} data-testid={`option-detail-${field.name}-${o}`}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : visibleDetailOptions && visibleDetailOptions.length > 0 ? (
                <div className="space-y-3">
                  {visibleDetailOptions
                    .filter((opt) => {
                      const isCommercialOrLand = ["Commercial Property", "Vacant Land / Lot"].includes(detailValues["propertyType"] || "");
                      if (isCommercialOrLand && ["bedrooms", "bathrooms", "areasRequired"].includes(opt.name)) return false;
                      return true;
                    })
                    .map((opt) => (
                    <div key={opt.id}>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        {opt.label}
                        {opt.required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Select
                        value={detailValues[opt.name] || ""}
                        onValueChange={(v) => handleDetailChange(opt.name, v)}
                      >
                        <SelectTrigger className="premium-input rounded-md" data-testid={`select-detail-${opt.name}`}>
                          <SelectValue placeholder={`Select ${opt.label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {((opt.options as string[]) || []).map((o) => (
                            <SelectItem key={o} value={o} data-testid={`option-detail-${opt.name}-${o}`}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No additional details needed.</p>
              )}
            </Card>
          )}

          {selectedServiceTypeId && (
            <Card className="glass-card rounded-xl p-5 animate-slide-up" data-testid="step-constraints">
              <div className="flex items-center gap-2.5 mb-3">
                <StepNumber num={4} active={currentStep === 4} completed={currentStep > 4} />
                <span className="font-display font-semibold text-sm tracking-wide">Constraints</span>
              </div>
              <div className="space-y-3">
                {selectedCategory?.name !== "Online Items" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <Clock className="w-3 h-3" /> Timing Window
                      <span className="text-destructive">*</span>
                    </label>
                    <Select value={timingWindow} onValueChange={setTimingWindow}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-timing-window">
                        <SelectValue placeholder="When do you need this?" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMING_WINDOWS.map((tw) => (
                          <SelectItem key={tw} value={tw} data-testid={`option-timing-${tw}`}>
                            {tw}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showPropertyType && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> Property Type
                    </label>
                    <Select value={smartFormValues.propertyType || ""} onValueChange={(v) => handleSmartFormChange("propertyType", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-property-type">
                        <SelectValue placeholder="Select property type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt} data-testid={`option-property-${pt}`}>{pt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showVehicleType && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> Vehicle Type
                    </label>
                    <Select value={smartFormValues.vehicleType || ""} onValueChange={(v) => handleSmartFormChange("vehicleType", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-vehicle-type">
                        <SelectValue placeholder="Select vehicle type" />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TYPES.map((vt) => (
                          <SelectItem key={vt} value={vt} data-testid={`option-vehicle-${vt}`}>{vt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showVinField && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> VIN (Last 6 or Full)
                    </label>
                    <input
                      type="text"
                      className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                      placeholder="Enter VIN"
                      value={smartFormValues.vin || ""}
                      onChange={(e) => handleSmartFormChange("vin", e.target.value)}
                      data-testid="input-vin"
                    />
                  </div>
                )}

                {smartFormConfig.showMakeModelFields && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                        Make
                      </label>
                      <input
                        type="text"
                        className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                        placeholder="e.g. Toyota"
                        value={smartFormValues.make || ""}
                        onChange={(e) => handleSmartFormChange("make", e.target.value)}
                        data-testid="input-make"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                        Model
                      </label>
                      <input
                        type="text"
                        className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                        placeholder="e.g. Camry"
                        value={smartFormValues.model || ""}
                        onChange={(e) => handleSmartFormChange("model", e.target.value)}
                        data-testid="input-model"
                      />
                    </div>
                  </div>
                )}

                {smartFormConfig.showPropertyType && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> Property Type
                    </label>
                    <Select value={smartFormValues.propertyType || ""} onValueChange={(v) => handleSmartFormChange("propertyType", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-property-type">
                        <SelectValue placeholder="Select property type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt} data-testid={`option-property-${pt}`}>{pt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showOnlinePlatform && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> Platform
                    </label>
                    <Select value={smartFormValues.onlinePlatform || ""} onValueChange={(v) => handleSmartFormChange("onlinePlatform", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-online-platform">
                        <SelectValue placeholder="Where is the item listed?" />
                      </SelectTrigger>
                      <SelectContent>
                        {ONLINE_PLATFORMS.map((op) => (
                          <SelectItem key={op} value={op} data-testid={`option-platform-${op}`}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showListingUrl && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <FileText className="w-3 h-3" /> Listing Reference
                    </label>
                    <Select value={smartFormValues.listingRef || ""} onValueChange={(v) => handleSmartFormChange("listingRef", v)}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-listing-ref">
                        <SelectValue placeholder="How to find the listing" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Link provided after lock">Link provided after lock</SelectItem>
                        <SelectItem value="Search by item name on platform">Search by item name on platform</SelectItem>
                        <SelectItem value="Screenshot provided after lock">Screenshot provided after lock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {smartFormConfig.showAccess && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                      <MapPin className="w-3 h-3" /> {smartFormConfig.accessLabel}
                    </label>
                    <Select value={accessInstruction} onValueChange={setAccessInstruction}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-access-instruction">
                        <SelectValue placeholder="How to access the location" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_INSTRUCTIONS.map((ai) => (
                          <SelectItem key={ai} value={ai} data-testid={`option-access-${ai}`}>{ai}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedCategory?.name === "Part Availability Verification" && (
                  <div className="space-y-4 pt-2 border-t border-white/5">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        Describe the part/item <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                        placeholder="e.g. Left Front Fender, Intact"
                        value={smartFormValues.partDescription || ""}
                        onChange={(e) => handleSmartFormChange("partDescription", e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        Vehicle year/make/model (if applicable)
                      </label>
                      <input
                        type="text"
                        className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                        placeholder="e.g. 2018 Toyota Camry"
                        value={smartFormValues.sourceVehicle || ""}
                        onChange={(e) => handleSmartFormChange("sourceVehicle", e.target.value)}
                      />
                    </div>

                    {(selectedUseCase?.name.includes("Specific") || selectedUseCase?.name.includes("Search Known")) && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                          Location name or address <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                          placeholder="e.g. Pull-A-Part East"
                          value={smartFormValues.locationName || ""}
                          onChange={(e) => handleSmartFormChange("locationName", e.target.value)}
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        Location Type
                      </label>
                      <Select value={smartFormValues.locationType || ""} onValueChange={(v) => handleSmartFormChange("locationType", v)}>
                        <SelectTrigger className="premium-input rounded-md">
                          <SelectValue placeholder="Select location type" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Salvage Yard", "Repair Shop", "Private Seller", "Auction Lot", "Copart-IAA", "Farm", "Storage", "Other"].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        Row, section, or area (if known)
                      </label>
                      <input
                        type="text"
                        className="premium-input rounded-md w-full px-3 py-2 text-sm bg-background border border-input"
                        placeholder="e.g. Row 42, Import Section"
                        value={smartFormValues.rowSection || ""}
                        onChange={(e) => handleSmartFormChange("rowSection", e.target.value)}
                      />
                    </div>

                    {selectedUseCase?.name.includes("Radius") && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                          Search Radius
                        </label>
                        <Select value={smartFormValues.searchRadius || ""} onValueChange={(v) => handleSmartFormChange("searchRadius", v)}>
                          <SelectTrigger className="premium-input rounded-md">
                            <SelectValue placeholder="Select radius" />
                          </SelectTrigger>
                          <SelectContent>
                            {["10mi", "25mi", "50mi", "100mi"].map(r => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-display tracking-wide">
                        Does the owner/seller know about this request?
                      </label>
                      <div className="flex gap-2">
                        {["Yes", "No"].map(val => (
                          <Button
                            key={val}
                            type="button"
                            variant={smartFormValues.contactPermission === val ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleSmartFormChange("contactPermission", val)}
                            className="flex-1"
                          >
                            {val}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="p-4 rounded-xl border-2 transition-all cursor-pointer"
                      style={{
                        borderColor: isBounty ? "hsl(152 100% 44% / 0.5)" : "hsl(255 10% 20% / 0.5)",
                        backgroundColor: isBounty ? "hsl(152 100% 44% / 0.05)" : "transparent"
                      }}
                      onClick={() => setIsBounty(!isBounty)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className={`w-4 h-4 ${isBounty ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`font-display font-bold text-sm ${isBounty ? "text-primary" : "text-muted-foreground"}`}>
                            BOUNTY MODE
                          </span>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${isBounty ? "bg-primary" : "bg-muted"}`}>
                           <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isBounty ? "left-5.5" : "left-0.5"}`} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {isBounty
                          ? "Any nearby helper can submit proof. First approved proof wins the bounty."
                          : "Standard request: One helper is assigned and works the job privately."}
                      </p>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl">
                      <p className="text-[10px] font-display font-bold text-purple-400 uppercase tracking-widest mb-1">
                        Budget Guidance
                      </p>
                      <p className="text-xs text-purple-300/70">
                        {isDemoUser ? "Budget varies by use case." :
                         selectedUseCase?.name.includes("Specific") ? "$8–$15 typical for single location check." :
                         selectedUseCase?.name.includes("Known Place") ? "$15–$25 typical for full yard search." :
                         selectedUseCase?.name.includes("Radius") ? "$25–$40 typical for multi-location radius search." :
                         "$15–$30 typical for lead verification."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {selectedServiceType?.proofTemplateId && proofTemplate && (
            <Card className="glass-card rounded-xl p-5 premium-border-glow animate-slide-up" data-testid="step-proof">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-secondary/20 text-secondary text-xs font-bold font-display border border-secondary/30">
                  6
                </div>
                <span className="font-display font-semibold text-sm tracking-wide">Proof Package</span>
                <Badge variant="secondary" className="text-[10px] ml-auto" style={{ background: "hsl(275 85% 62% / 0.2)", color: "hsl(275 85% 70%)", border: "1px solid hsl(275 85% 62% / 0.3)" }}>
                  Auto-selected
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mb-3 pl-9 leading-relaxed">
                Your helper must submit this proof before you can approve and release payment. It's matched to your service type automatically.
              </p>
              <div className="bg-muted/30 rounded-xl p-3.5 space-y-2.5 border border-white/[0.06]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-display font-semibold">{proofTemplate.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {proofTemplate.requiredPhotoCount != null && proofTemplate.requiredPhotoCount > 0 && (
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 text-primary">
                      <Camera className="w-3 h-3" />
                      {proofTemplate.requiredPhotoCount} photo{proofTemplate.requiredPhotoCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {proofTemplate.requiredVideo && (
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400">
                      <Video className="w-3 h-3" />
                      Video{proofTemplate.videoDuration ? ` (${proofTemplate.videoDuration})` : ""}
                    </span>
                  )}
                  {proofTemplate.geoRequired && (
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <MapPin className="w-3 h-3" />
                      GPS required
                    </span>
                  )}
                </div>
                {proofTemplate.checklistItems && proofTemplate.checklistItems.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-t border-white/[0.05] pt-2.5">
                    <span className="text-[10px] font-display text-muted-foreground/50 uppercase tracking-wider">
                      Helper checklist ({proofTemplate.checklistItems.length} items)
                    </span>
                    {proofTemplate.checklistItems.map((item: any) => (
                      <div key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        <span>{item.label}{item.instruction ? <span className="opacity-50"> — {item.instruction}</span> : null}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {generatedTitle && (
            <Card className="glass-card rounded-xl p-5 premium-border-glow animate-slide-up" data-testid="step-review">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-display font-semibold text-sm tracking-wide">
                  Review: Generated Job
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">
                    Title
                  </span>
                  <p
                    className="text-sm font-display font-semibold mt-0.5"
                    data-testid="text-generated-title"
                  >
                    {generatedTitle}
                  </p>
                </div>
                {generatedDescription && (
                  <div>
                    <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">
                      Description
                    </span>
                    <p
                      className="text-sm whitespace-pre-line text-muted-foreground mt-0.5 leading-relaxed"
                      data-testid="text-generated-description"
                    >
                      {generatedDescription}
                    </p>
                  </div>
                )}
                {selectedCategory && (
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <Badge variant="outline" className="text-[10px] bg-muted/30">
                      {selectedCategory.name}
                    </Badge>
                    {selectedUseCase && (
                      <>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] bg-muted/30">
                          {selectedUseCase.name}
                        </Badge>
                      </>
                    )}
                    {selectedServiceType && (
                      <>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] bg-muted/30">
                          {selectedServiceType.name}
                        </Badge>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {(selectedCategory?.name === "Online Items" || !!timingWindow) && (
            <Card className="glass-card rounded-xl p-5 animate-slide-up" data-testid="step-payment-details">
              <div className="flex items-center gap-2.5 mb-4">
                <StepNumber num={5} active={currentStep === 5} completed={currentStep > 5} />
                <span className="font-display font-semibold text-sm tracking-wide">Payment & Location</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                    <MapPin className="w-3 h-3" /> ZIP Code (Request Location)
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className="premium-input rounded-md w-full px-3 py-2.5 text-sm bg-background border border-input"
                    placeholder="5-digit ZIP"
                    value={vizip}
                    onChange={(e) => setViZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    data-testid="input-vi-zip"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1 font-display tracking-wide">
                    Your Offer — How much will you pay?
                    <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="premium-input rounded-md w-full pl-7 pr-3 py-2.5 text-sm bg-background border border-input"
                      placeholder="0.00"
                      value={vibudget}
                      onChange={(e) => setViBudget(e.target.value)}
                      data-testid="input-vi-budget"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">This is what you'll offer to pay the verifier.</p>
                </div>

                <div
                  className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all"
                  style={{ background: viurgent ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${viurgent ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}` }}
                  onClick={() => setViUrgent(!viurgent)}
                  data-testid="toggle-urgent"
                >
                  <div>
                    <p className="text-sm font-display font-semibold" style={{ color: viurgent ? "#ef4444" : "#9ca3af" }}>URGENT REQUEST</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {isOG ? "FREE for Day-1 OG members" : isDemoUser ? "Urgent fee applies" : "+ $10 urgent fee"}
                    </p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-all ${viurgent ? "bg-red-500" : "bg-muted/30"} relative`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${viurgent ? "left-[22px]" : "left-0.5"}`} />
                  </div>
                </div>

                {budgetNum > 0 && (
                  <div className="rounded-xl p-3.5" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.15)" }}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-display">Your Offer</span>
                      <span className="font-bold text-foreground">${budgetNum.toFixed(2)}</span>
                    </div>
                    {urgentFee > 0 && !isDemoUser && (
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-muted-foreground font-display">Urgent Fee</span>
                        <span className="font-bold" style={{ color: "#ef4444" }}>+${urgentFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t border-white/10 mt-2 pt-2 flex items-center justify-between">
                      <span className="text-xs font-display font-bold text-muted-foreground tracking-wider">TOTAL</span>
                      <span className="font-display font-black text-lg" style={{ color: "#00e676" }}>{isDemoUser ? `$${budgetNum.toFixed(2)}` : `$${totalCharge.toFixed(2)}`}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Button
            className="w-full h-14 font-display tracking-wider font-bold text-sm rounded-2xl gap-2"
            style={{
              background: canProceed ? "linear-gradient(135deg, #00e676, #00b050)" : "rgba(255,255,255,0.05)",
              color: canProceed ? "#0a0a0f" : "#4b5563",
              border: canProceed ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
            disabled={!canProceed || checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate()}
            data-testid="button-submit-vi-request"
          >
            {checkoutMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                {isDemoUser ? "SUBMIT REQUEST" : `SUBMIT REQUEST — PAY $${totalCharge > 0 ? totalCharge.toFixed(2) : "0.00"}`}
              </>
            )}
          </Button>
        </div>
      </div>
    </GuberLayout>
  );
}
