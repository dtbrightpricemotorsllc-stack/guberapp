import { useState, useEffect, useMemo } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Lock, FileText, Zap, DollarSign, MapPin, Navigation, ShieldCheck, Check, TrendingUp, Users, Clock, Camera, Video, MapPinned, Layers } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type DetailOptionSet } from "@shared/schema";
import { TASK_TIERS, PRICING_MODES, type TaskTierId, type PricingModeId } from "@shared/task-tiers";

const mainCategories = [
  "On-Demand Help", "General Labor", "Skilled Labor",
  "Verify & Inspect", "Barter Labor", "Marketplace",
];

function filterNotesContent(text: string): string {
  const patterns = [
    /(\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/gi,
    /(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)/gi,
    /(@\w{2,})/gi,
    /((facebook|instagram|snapchat|twitter|tiktok|linkedin|whatsapp|telegram|signal|venmo|cashapp|zelle)[\s.:\/]*\w*)/gi,
    /(https?:\/\/[^\s]+)/gi,
    /(www\.[^\s]+)/gi,
  ];
  let clean = text;
  for (const p of patterns) {
    clean = clean.replace(p, "[removed]");
  }
  return clean;
}

export default function PostJob() {
  const { user, isDemoUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const initialCategory = params.get("category") || "";
  const initialService = params.get("service") || "";
  const wasCancelled = params.get("cancelled") === "true";

  const viTitle = params.get("viTitle") || "";
  const viDescription = params.get("viDescription") || "";
  const viUseCaseName = params.get("useCaseName") || "";
  const viCatalogServiceTypeName = params.get("catalogServiceTypeName") || "";
  const viVerifyInspectCategory = params.get("verifyInspectCategory") || "";
  const viJobDetailsRaw = params.get("jobDetails") || "";

  let viJobDetails: Record<string, string> | null = null;
  if (viJobDetailsRaw) {
    try {
      viJobDetails = JSON.parse(decodeURIComponent(viJobDetailsRaw));
    } catch { }
  }

  const isVIJob = initialCategory === "Verify & Inspect" && !!viTitle;

  const [category, setCategory] = useState(initialCategory);
  const [serviceType, setServiceType] = useState(initialService);
  const [generalNotes, setGeneralNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [location_, setJobLocation] = useState("");
  const [zip, setZip] = useState(user?.zipcode || "");
  const [exactLat, setExactLat] = useState<number | null>(null);
  const [exactLng, setExactLng] = useState<number | null>(null);
  const [urgentSwitch, setUrgentSwitch] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [jobDetails, setJobDetails] = useState<Record<string, any>>({});
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [barterNeed, setBarterNeed] = useState("");
  const [barterOffering, setBarterOffering] = useState("");
  const [barterEstimatedValue, setBarterEstimatedValue] = useState("");
  const [autoIncreaseEnabled, setAutoIncreaseEnabled] = useState(false);
  const [autoIncreaseAmount, setAutoIncreaseAmount] = useState("");
  const [autoIncreaseMax, setAutoIncreaseMax] = useState("");
  const [autoIncreaseIntervalMins, setAutoIncreaseIntervalMins] = useState("60");
  const [taskTier, setTaskTier] = useState<TaskTierId | "">("");
  const [pricingModeSelection, setPricingModeSelection] = useState<PricingModeId>("fixed");

  const { data: businessProfile } = useQuery<any>({
    queryKey: ["/api/business/profile"],
    retry: false,
    enabled: !!user && user.accountType === "business",
  });
  const isBusinessAccount = !!businessProfile;

  const isOnlineCategory = category === "Marketplace";

  const { data: checklists, isLoading: isLoadingChecklists } = useQuery<DetailOptionSet[]>({
    queryKey: ["/api/checklist-options", { category, serviceType }],
    enabled: !!category && (isVIJob || !!serviceType),
    queryFn: async ({ queryKey }) => {
      const [, { category, serviceType }] = queryKey as [string, { category: string, serviceType: string }];
      const res = await apiRequest("GET", `/api/checklist-options?category=${encodeURIComponent(category)}${serviceType ? `&serviceTypeName=${encodeURIComponent(serviceType)}` : ""}`);
      return res.json();
    }
  });

  const handleGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not available", description: "Your browser doesn't support location access.", variant: "destructive" });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setExactLat(latitude);
        setExactLng(longitude);
        try {
          const resp = await fetch(`/api/places/reverse-geocode?lat=${latitude}&lng=${longitude}`, { credentials: "include" });
          if (resp.ok) {
            const data = await resp.json();
            setJobLocation(data.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            if (data.zip) setZip(data.zip);
          } else {
            setJobLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            toast({ title: "Location set", description: "Enter your ZIP code manually for best results." });
          }
        } catch {
          setJobLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setGpsLoading(false);
      },
      () => {
        toast({ title: "Location denied", description: "Please allow location access or enter your address manually.", variant: "destructive" });
        setGpsLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    if (wasCancelled) {
      toast({ title: "Payment Cancelled", description: "Your job was not posted.", variant: "destructive" });
    }
  }, [wasCancelled]);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({ queryKey: ["/api/config"] });
  const mapsKey = config?.googleMapsApiKey;

  const { data: services } = useQuery<string[]>({
    queryKey: ["/api/services", category],
    enabled: !!category && category !== "Verify & Inspect",
  });

  useEffect(() => {
    if (category && serviceType && services && !services.includes(serviceType)) {
      setServiceType("");
    }
  }, [category, services]);

  const effectiveServiceType = isVIJob ? viCatalogServiceTypeName : serviceType;
  const effectiveCategory = category || (isVIJob ? "Verify & Inspect" : "");

  const { data: pricingSuggestion } = useQuery<{
    suggestedRangeLow: number;
    suggestedRangeHigh: number;
    minPayout: number;
    estimatedMinutes: number;
    complexityTier: string;
    nearbyHelpers: number;
  }>({
    queryKey: ["/api/pricing-suggestion", { serviceType: effectiveServiceType, category: effectiveCategory, urgent: urgentSwitch, zip, minutes: estimatedMinutes }],
    enabled: !!effectiveServiceType && !!effectiveCategory && effectiveCategory !== "Barter Labor",
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceType: effectiveServiceType,
        category: effectiveCategory,
        urgent: String(urgentSwitch),
      });
      if (zip && zip.length === 5) params.set("zip", zip);
      if (estimatedMinutes) params.set("minutes", estimatedMinutes);
      const res = await apiRequest("GET", `/api/pricing-suggestion?${params}`);
      return res.json();
    },
  });

  const { data: proofRequirements } = useQuery<{
    template: { name: string; requiredPhotoCount: number; requiredVideo: boolean; videoDuration: string | null; geoRequired: boolean } | null;
    items: { label: string; instruction: string; mediaType: string; quantityRequired: number; geoRequired: boolean }[];
  }>({
    queryKey: ["/api/proof-requirements", viCatalogServiceTypeName],
    enabled: !!viCatalogServiceTypeName && isVIJob,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/proof-requirements?catalogServiceTypeName=${encodeURIComponent(viCatalogServiceTypeName)}`);
      return res.json();
    },
  });

  const isOG = user?.day1OG === true;
  const budgetNum = budget ? parseFloat(budget) : 0;
  const urgentFee = urgentSwitch ? (isOG ? 0 : 10) : 0;
  const totalCharge = budgetNum + urgentFee;
  const isBarter = category === "Barter Labor";
  const isSkilledLabor = category === "Skilled Labor";
  const isGeneralLabor = category === "General Labor";
  const locationRequired = !isOnlineCategory && !isBarter;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        category,
        budget: isBarter ? 0 : budgetNum,
        location: location_,
        locationApprox: zip ? `${zip} area` : null,
        zip,
        urgentSwitch,
        ...(exactLat !== null && exactLng !== null ? { lat: exactLat, lng: exactLng } : {}),
      };

      if (estimatedMinutes) {
        payload.estimatedMinutes = estimatedMinutes;
        payload.estimatedDurationHours = parseFloat(estimatedMinutes) / 60;
      }

      if (isVIJob) {
        payload.useCaseName = viUseCaseName;
        payload.catalogServiceTypeName = viCatalogServiceTypeName;
        payload.verifyInspectCategory = viVerifyInspectCategory;
        payload.jobDetails = viJobDetails;
        payload.serviceType = viCatalogServiceTypeName;
      } else {
        payload.serviceType = serviceType;
        payload.jobDetails = jobDetails;
        if (generalNotes) {
          payload.description = filterNotesContent(generalNotes);
        }
      }

      if (isBarter) {
        if (barterNeed) payload.barterNeed = filterNotesContent(barterNeed);
        if (barterOffering) payload.barterOffering = filterNotesContent(barterOffering);
        if (barterEstimatedValue) payload.barterEstimatedValue = barterEstimatedValue;
      }

      if (!isBarter && autoIncreaseEnabled && autoIncreaseAmount && autoIncreaseMax) {
        payload.autoIncreaseEnabled = true;
        payload.autoIncreaseAmount = parseFloat(autoIncreaseAmount);
        payload.autoIncreaseMax = parseFloat(autoIncreaseMax);
        payload.autoIncreaseIntervalMins = parseInt(autoIncreaseIntervalMins) || 60;
      }

      if (isBusinessAccount && taskTier) {
        payload.taskTier = taskTier;
      }
      if (isBusinessAccount && pricingModeSelection) {
        payload.pricingMode = pricingModeSelection;
      }

      const resp = await apiRequest("POST", "/api/jobs/create-checkout", payload);
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: "Job Posted!", description: "Your job is now live. You'll pay when you confirm a worker." });
      setLocation("/my-jobs");
    },
    onError: (err: any) => {
      if (err.message?.includes("ID_REQUIRED") || err.status === 403) {
        toast({ title: "ID Verification Required", description: "Go to Profile → Trust & Credentials to upload your ID.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const minPayoutError = useMemo(() => {
    if (isBarter || !pricingSuggestion || budgetNum <= 0) return "";
    if (budgetNum < pricingSuggestion.minPayout) {
      return `Minimum payout for this service is $${pricingSuggestion.minPayout}`;
    }
    return "";
  }, [isBarter, pricingSuggestion, budgetNum]);

  const canSubmit = useMemo(() => {
    if (!category) return false;
    if (category === "Verify & Inspect") {
      if (!isVIJob) return false;
      if (budgetNum <= 0 || minPayoutError) return false;
      return true;
    }
    if (!serviceType) return false;
    if (!isBarter && budgetNum <= 0) return false;
    if (!isBarter && minPayoutError) return false;
    if (isBarter && (!barterNeed.trim() || !barterOffering.trim())) return false;
    if (locationRequired && zip.length < 5) return false;

    if (checklists) {
      const requiredChecklists = checklists.filter(c => c.required);
      for (const rc of requiredChecklists) {
        const val = jobDetails[rc.name];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          return false;
        }
      }
    }
    if (!isBarter && autoIncreaseEnabled) {
      const amt = parseFloat(autoIncreaseAmount);
      const max = parseFloat(autoIncreaseMax);
      if (!amt || amt <= 0 || !max || max <= budgetNum) return false;
    }
    return true;
  }, [category, isVIJob, serviceType, isBarter, budgetNum, minPayoutError, locationRequired, zip, checklists, jobDetails, barterNeed, barterOffering, autoIncreaseEnabled, autoIncreaseAmount, autoIncreaseMax]);

  const handleJobDetailChange = (name: string, value: any) => {
    setJobDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleNotesChange = (val: string) => {
    const clean = filterNotesContent(val);
    setGeneralNotes(clean);
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-post-job">
        <h1 className="text-xl font-display font-bold mb-1 tracking-tight animate-fade-in">Post a Job</h1>
        <p className="text-sm text-muted-foreground mb-5 animate-fade-in">Fill in the details below to create your job listing</p>

        <Card className="glass-card rounded-xl p-6 space-y-5 animate-slide-up">

          {isVIJob && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 guber-text-purple" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-display">Verify & Inspect Job</span>
              </div>

              <div className="glass-card-strong rounded-md p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Job Title</Label>
                  <p className="text-sm font-display font-semibold" data-testid="text-vi-title">{viTitle}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Description</Label>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-vi-description">{viDescription}</p>
                </div>
                {viJobDetails && Object.keys(viJobDetails).length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Details</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(viJobDetails).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-xs">
                          {k}: {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/20 premium-border">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground">
                  Title and description are system-generated and cannot be edited.
                </p>
              </div>
            </div>
          )}

          {!isVIJob && (
            <>
              <div className="space-y-2">
                <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Category</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setServiceType(""); setGeneralNotes(""); }}>
                  <SelectTrigger className="premium-input rounded-md" data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {mainCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {category === "Verify & Inspect" && (
                <div className="p-4 rounded-md glass-card-strong premium-border-purple">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-sm font-display font-semibold">Use the V&I Wizard</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Verify & Inspect jobs must be created through the V&I page to ensure proper service selection.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/verify-inspect")}
                        data-testid="button-go-vi"
                      >
                        Go to Verify & Inspect
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {category && category !== "Verify & Inspect" && services && (
                <div className="space-y-2">
                  <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Service Type</Label>
                  <Select value={serviceType} onValueChange={(v) => { setServiceType(v); setJobDetails({}); }}>
                    <SelectTrigger className="premium-input rounded-md" data-testid="select-service">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(isGeneralLabor || isSkilledLabor) && serviceType && (
                <div className="space-y-2">
                  <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Estimated Time Needed
                  </Label>
                  <Select value={estimatedMinutes} onValueChange={setEstimatedMinutes}>
                    <SelectTrigger className="premium-input rounded-md" data-testid="select-estimated-time">
                      <SelectValue placeholder="Select estimated time (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                      <SelectItem value="240">4+ hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Helps workers plan and adjusts pricing guidance
                  </p>
                </div>
              )}

              {isBarter && serviceType && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="w-4 h-4" style={{ color: "#14B8A6" }} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-display">Barter Details</span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
                      What do you need? <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={barterNeed}
                      onChange={(e) => setBarterNeed(e.target.value.slice(0, 300))}
                      className="premium-input rounded-md min-h-[60px]"
                      placeholder="Describe what you need help with (e.g., 'Need help moving furniture', 'Need yard work done')..."
                      maxLength={300}
                      data-testid="input-barter-need"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
                      What are you offering in exchange? <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={barterOffering}
                      onChange={(e) => setBarterOffering(e.target.value.slice(0, 300))}
                      className="premium-input rounded-md min-h-[60px]"
                      placeholder="Describe what you're offering (e.g., 'I'll cook a meal', 'Guitar lessons', 'Help moving furniture')..."
                      maxLength={300}
                      data-testid="input-barter-offering"
                    />
                    <p className="text-[10px] text-muted-foreground">No contact info allowed — it will be removed.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
                      Estimated value of your offering
                    </Label>
                    <Select value={barterEstimatedValue} onValueChange={setBarterEstimatedValue}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-barter-value">
                        <SelectValue placeholder="Approximate value (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Under $25">Under $25</SelectItem>
                        <SelectItem value="$25–$50">$25–$50</SelectItem>
                        <SelectItem value="$50–$100">$50–$100</SelectItem>
                        <SelectItem value="$100–$200">$100–$200</SelectItem>
                        <SelectItem value="$200+">$200+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
                      Estimated time needed
                    </Label>
                    <Select value={estimatedMinutes} onValueChange={setEstimatedMinutes}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-barter-time">
                        <SelectValue placeholder="How long will the job take? (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="180">3 hours</SelectItem>
                        <SelectItem value="240">4+ hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {category && serviceType && checklists && checklists.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="w-4 h-4 guber-text-green" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-display">Service Details</span>
                  </div>
                  {checklists.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
                        {c.label} {c.required && <span className="text-destructive">*</span>}
                      </Label>

                      {c.fieldType === "single_select" && (
                        <Select
                          value={jobDetails[c.name] || ""}
                          onValueChange={(v) => handleJobDetailChange(c.name, v)}
                        >
                          <SelectTrigger className="premium-input rounded-md">
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                          <SelectContent>
                            {c.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}

                      {c.fieldType === "multi_select" && (
                        <ToggleGroup
                          type="multiple"
                          value={jobDetails[c.name] || []}
                          onValueChange={(v) => handleJobDetailChange(c.name, v)}
                          className="flex flex-wrap justify-start gap-2"
                        >
                          {c.options?.map(opt => (
                            <ToggleGroupItem
                              key={opt}
                              value={opt}
                              className="px-3 py-1 h-auto text-xs rounded-full border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                            >
                              {opt}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      )}

                      {c.fieldType === "yes_no" && (
                        <ToggleGroup
                          type="single"
                          value={jobDetails[c.name] || ""}
                          onValueChange={(v) => handleJobDetailChange(c.name, v)}
                          className="flex justify-start gap-2"
                        >
                          <ToggleGroupItem
                            value="Yes"
                            className="flex-1 px-3 py-1 h-auto text-xs rounded-md border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          >
                            Yes
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="No"
                            className="flex-1 px-3 py-1 h-auto text-xs rounded-md border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          >
                            No
                          </ToggleGroupItem>
                        </ToggleGroup>
                      )}

                      {c.fieldType === "number_input" && (
                        <Input
                          type="number"
                          className="premium-input rounded-md"
                          value={jobDetails[c.name] || ""}
                          onChange={(e) => handleJobDetailChange(c.name, e.target.value)}
                          placeholder="Enter number"
                        />
                      )}

                      {c.fieldType === "text_input" && (
                        <Input
                          type="text"
                          className="premium-input rounded-md"
                          value={jobDetails[c.name] || ""}
                          onChange={(e) => handleJobDetailChange(c.name, filterNotesContent(e.target.value))}
                          placeholder={c.label}
                          maxLength={200}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isSkilledLabor && serviceType && user?.tier === "community" && (
                <div className="flex items-start gap-2 rounded-xl p-3"
                  style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-display font-bold text-orange-400 mb-0.5">Tier requirement may apply</p>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      This service type may require <strong>Verified</strong> tier or higher to post. If your tier is too low you'll be notified at checkout. Upgrade via your profile.
                    </p>
                  </div>
                </div>
              )}

              {category && serviceType && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Additional Notes (optional)</Label>
                    <span className="text-[10px] text-muted-foreground">{generalNotes.length}/300</span>
                  </div>
                  <Textarea
                    value={generalNotes}
                    onChange={(e) => handleNotesChange(e.target.value.slice(0, 300))}
                    className="premium-input rounded-md min-h-[80px]"
                    placeholder="Any additional details (no contact info allowed)..."
                    maxLength={300}
                    data-testid="input-general-notes"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Contact information will be automatically removed.
                  </p>
                </div>
              )}
            </>
          )}

          {pricingSuggestion && !isBarter && (effectiveServiceType || isVIJob) && (
            <div className="rounded-lg p-4 space-y-3 animate-fade-in" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }} data-testid="pricing-guidance-box">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-display font-bold text-purple-400/90 uppercase tracking-wider">Pricing Guidance</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-display">Suggested</span>
                  </div>
                  <p className="text-sm font-display font-bold" data-testid="text-suggested-range">
                    ${pricingSuggestion.suggestedRangeLow}–${pricingSuggestion.suggestedRangeHigh}
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-display">Nearby</span>
                  </div>
                  <p className="text-sm font-display font-bold" data-testid="text-nearby-helpers">
                    {pricingSuggestion.nearbyHelpers} helper{pricingSuggestion.nearbyHelpers !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-display">Est. Time</span>
                  </div>
                  <p className="text-sm font-display font-bold" data-testid="text-estimated-time">
                    {pricingSuggestion.estimatedMinutes < 60
                      ? `${pricingSuggestion.estimatedMinutes} min`
                      : `${Math.round(pricingSuggestion.estimatedMinutes / 60 * 10) / 10} hr`}
                  </p>
                </div>
              </div>
              {pricingSuggestion.minPayout > 0 && (
                <p className="text-[10px] text-muted-foreground/70 text-center">
                  Minimum payout: <strong>${pricingSuggestion.minPayout}</strong>
                </p>
              )}
            </div>
          )}

          {isBusinessAccount && !isBarter && (
            <div className="space-y-4 rounded-xl p-4 animate-fade-in" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)" }} data-testid="section-task-tier">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-display font-bold text-indigo-400/90 uppercase tracking-wider">Task Tier</span>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Select Complexity Tier</Label>
                <Select value={taskTier} onValueChange={(v) => setTaskTier(v as TaskTierId)}>
                  <SelectTrigger className="premium-input rounded-md" data-testid="select-task-tier">
                    <SelectValue placeholder="Choose a tier (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TIERS.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>{tier.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {taskTier && (() => {
                const selectedTier = TASK_TIERS.find((t) => t.id === taskTier);
                return selectedTier ? (
                  <div className="rounded-lg p-3 space-y-2 bg-indigo-500/5 border border-indigo-500/15">
                    <p className="text-xs font-display font-semibold text-indigo-400/80">{selectedTier.description}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Est. Time</p>
                        <p className="text-sm font-display font-bold">{selectedTier.estimatedTimeMin}–{selectedTier.estimatedTimeMax} min</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Typical Pay</p>
                        <p className="text-sm font-display font-bold">${selectedTier.typicalPayMin}–${selectedTier.typicalPayMax}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">Examples: {selectedTier.examples.join(", ")}</p>
                    {budgetNum > 0 && budgetNum < selectedTier.typicalPayMin && (
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <p className="text-[10px] text-amber-400/80">Your offer is below the typical range for this tier. Workers may be less likely to accept.</p>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="space-y-2">
                <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Pricing Mode</Label>
                <div className="grid gap-2">
                  {PRICING_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPricingModeSelection(mode.id as PricingModeId)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${pricingModeSelection === mode.id ? "border-indigo-500/50 bg-indigo-500/10" : "border-border/20 bg-muted/5 hover:border-border/40"}`}
                      data-testid={`button-pricing-mode-${mode.id}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${pricingModeSelection === mode.id ? "border-indigo-400 bg-indigo-400" : "border-border/40"}`} />
                      <div>
                        <p className="text-sm font-display font-semibold">{mode.label}</p>
                        <p className="text-[10px] text-muted-foreground/60">{mode.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {pricingModeSelection === "request_quotes" && (
                  <p className="text-[10px] text-muted-foreground/50 italic">Quote requests are visible — workers will respond with bids. Full submission flow coming soon.</p>
                )}
              </div>
            </div>
          )}

          {!isBarter && category !== "Verify & Inspect" && (
            <div className="space-y-2">
              <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Service Price ($)</Label>
              <Input value={budget} onChange={(e) => setBudget(e.target.value)}
                type="number" className="premium-input rounded-md"
                placeholder={pricingSuggestion ? `Min $${pricingSuggestion.minPayout}` : "0.00"}
                data-testid="input-budget" />
              {minPayoutError && (
                <p className="text-[10px] text-destructive font-display" data-testid="text-min-payout-error">{minPayoutError}</p>
              )}
            </div>
          )}

          {isVIJob && !isBarter && (
            <div className="space-y-2">
              <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Service Price ($)</Label>
              <Input value={budget} onChange={(e) => setBudget(e.target.value)}
                type="number" className="premium-input rounded-md"
                placeholder={pricingSuggestion ? `Min $${pricingSuggestion.minPayout}` : "0.00"}
                data-testid="input-budget" />
              {minPayoutError && (
                <p className="text-[10px] text-destructive font-display" data-testid="text-min-payout-error-vi">{minPayoutError}</p>
              )}
            </div>
          )}

          {!isBarter && budgetNum > 0 && (
            <div className="p-4 rounded-md glass-card-strong premium-border space-y-3" data-testid="auto-increase-section">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="font-display font-semibold text-sm">Auto Pay Increase</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Automatically raise your offer if no one accepts
                  </p>
                </div>
                <Switch
                  checked={autoIncreaseEnabled}
                  onCheckedChange={setAutoIncreaseEnabled}
                  data-testid="switch-auto-increase"
                />
              </div>

              {autoIncreaseEnabled && (
                <div className="space-y-3 pt-2 border-t border-border/20 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Increase By ($)</Label>
                      <Input
                        type="number"
                        value={autoIncreaseAmount}
                        onChange={(e) => setAutoIncreaseAmount(e.target.value)}
                        className="premium-input rounded-md"
                        placeholder="5"
                        min="1"
                        data-testid="input-auto-increase-amount"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Max Payout ($)</Label>
                      <Input
                        type="number"
                        value={autoIncreaseMax}
                        onChange={(e) => setAutoIncreaseMax(e.target.value)}
                        className="premium-input rounded-md"
                        placeholder={budgetNum > 0 ? `${Math.ceil(budgetNum * 2)}` : "100"}
                        min={budgetNum > 0 ? String(budgetNum + 1) : "1"}
                        data-testid="input-auto-increase-max"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Increase Every</Label>
                    <Select value={autoIncreaseIntervalMins} onValueChange={setAutoIncreaseIntervalMins}>
                      <SelectTrigger className="premium-input rounded-md" data-testid="select-auto-increase-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="360">6 hours</SelectItem>
                        <SelectItem value="720">12 hours</SelectItem>
                        <SelectItem value="1440">24 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {autoIncreaseAmount && autoIncreaseMax && parseFloat(autoIncreaseMax) > budgetNum && (
                    <div className="rounded-md p-2.5 bg-emerald-500/[0.06] border border-emerald-500/15">
                      <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                        Starting at <strong>${budgetNum}</strong>, increasing by <strong>${parseFloat(autoIncreaseAmount)}</strong> every {
                          parseInt(autoIncreaseIntervalMins) < 60
                            ? `${autoIncreaseIntervalMins} min`
                            : parseInt(autoIncreaseIntervalMins) === 60
                              ? "1 hour"
                              : `${parseInt(autoIncreaseIntervalMins) / 60} hours`
                        } up to <strong>${parseFloat(autoIncreaseMax)}</strong>
                      </p>
                    </div>
                  )}
                  {autoIncreaseMax && parseFloat(autoIncreaseMax) <= budgetNum && (
                    <p className="text-[10px] text-destructive font-display">Max payout must be higher than current budget</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Location {locationRequired && <span className="text-destructive">*</span>}
              </Label>
              <button
                type="button"
                onClick={handleGPS}
                disabled={gpsLoading}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-display font-bold tracking-wider transition-colors disabled:opacity-50"
                data-testid="button-use-gps"
              >
                {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                USE MY LOCATION
              </button>
            </div>
            <PlacesAutocomplete
              value={location_}
              onChange={(v) => { setJobLocation(v); setExactLat(null); setExactLng(null); }}
              onPlaceSelect={(place) => {
                setJobLocation(place.name ? `${place.name}, ${place.address}` : place.address);
                if (place.zip) setZip(place.zip);
                setExactLat(place.lat);
                setExactLng(place.lng);
              }}
              placeholder={locationRequired ? "Enter your job address..." : "Enter address (optional)"}
              data-testid="input-location"
            />
            {locationRequired && zip.length < 5 && (
              <p className="text-[10px] text-muted-foreground/60 font-display mt-1">ZIP code required — select an address from the suggestions</p>
            )}
          </div>

          {!isBarter && (
            <div className="flex items-center justify-between gap-2 p-4 rounded-md glass-card-strong premium-border">
              <div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <p className="font-display font-semibold text-sm">Urgent Job</p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isOG ? "FREE (OG Perk)" : isDemoUser ? "Platform fee" : "$10 surcharge"}
                </p>
              </div>
              <Switch checked={urgentSwitch} onCheckedChange={setUrgentSwitch} data-testid="switch-urgent" />
            </div>
          )}

          {!isBarter && budgetNum > 0 && (
            <div className="p-4 rounded-md glass-card-strong premium-border-glow space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Service Price
                </span>
                <span className="font-display" data-testid="text-service-price">${budgetNum.toFixed(2)}</span>
              </div>
              {urgentSwitch && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Urgent Fee
                  </span>
                  <span data-testid="text-urgent-fee">{isOG ? <span className="guber-text-green font-display font-semibold">FREE (OG)</span> : isDemoUser ? <span className="text-muted-foreground font-display">Included</span> : `$${urgentFee.toFixed(2)}`}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 font-bold pt-2 border-t border-border/20">
                <span className="font-display">Total</span>
                <span className="guber-text-green font-display text-base" data-testid="text-total">{isDemoUser ? `$${budgetNum.toFixed(2)}` : `$${totalCharge.toFixed(2)}`}</span>
              </div>
            </div>
          )}

          {isVIJob && proofRequirements && (proofRequirements.items.length > 0 || proofRequirements.template) && (
            <div className="rounded-lg p-4 space-y-3 animate-fade-in" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }} data-testid="proof-requirements-preview">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-green-400" />
                <span className="text-xs font-display font-bold text-green-400/90 uppercase tracking-wider">Worker Will Need To Provide</span>
              </div>
              <div className="space-y-2">
                {proofRequirements.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {item.mediaType === "video" ? (
                      <Video className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <Camera className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-[11px] font-display font-semibold">{item.label}</p>
                      {item.instruction && (
                        <p className="text-[10px] text-muted-foreground/70">{item.instruction}</p>
                      )}
                      <div className="flex gap-2 mt-0.5">
                        {item.quantityRequired > 1 && (
                          <span className="text-[9px] text-muted-foreground/50">{item.quantityRequired}x required</span>
                        )}
                        {item.geoRequired && (
                          <span className="text-[9px] text-green-400/60 flex items-center gap-0.5"><MapPinned className="w-2.5 h-2.5" /> GPS verified</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {proofRequirements.template && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-green-400/10">
                  {proofRequirements.template.requiredPhotoCount > 0 && (
                    <Badge variant="secondary" className="text-[9px] gap-1"><Camera className="w-2.5 h-2.5" />{proofRequirements.template.requiredPhotoCount} photos</Badge>
                  )}
                  {proofRequirements.template.requiredVideo && (
                    <Badge variant="secondary" className="text-[9px] gap-1"><Video className="w-2.5 h-2.5" />Video {proofRequirements.template.videoDuration || ""}</Badge>
                  )}
                  {proofRequirements.template.geoRequired && (
                    <Badge variant="secondary" className="text-[9px] gap-1"><MapPinned className="w-2.5 h-2.5" />GPS required</Badge>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-[10px] font-display font-bold tracking-widest text-amber-400/80 uppercase">Posting Rules</p>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              You are responsible for the accuracy of your job posting. Illegal, unsafe, or prohibited jobs are not allowed and may be removed without notice.
            </p>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              GUBER allows visual verification, errands, inspections, documentation, and general task-based services. Jobs involving <strong className="text-muted-foreground/80">illegal activity</strong>, <strong className="text-muted-foreground/80">hazardous physical labor</strong>, or <strong className="text-muted-foreground/80">licensed professional services without credentials</strong> are prohibited.
            </p>
            {(category === "Skilled Labor" || category === "General Labor") && (
              <p className="text-[11px] text-amber-400/70 leading-relaxed mt-1">
                For skilled/physical work, ensure providers have the appropriate licensing and insurance for the task you are posting.
              </p>
            )}
            {category === "Verify & Inspect" && (
              <p className="text-[11px] text-purple-400/70 leading-relaxed mt-1">
                V&I jobs are limited to visual documentation only. Do not request structural, engineering, legal, medical, or code-compliance opinions.
              </p>
            )}
          </div>

          <div className="rounded-md p-3 bg-muted/20 premium-border flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isBarter
                ? (isDemoUser ? "A platform fee is charged when you post a barter listing. No additional payment is needed when you confirm a helper." : "A $10 platform fee is charged when you post a barter listing. No additional payment is needed when you confirm a helper.")
                : "Your job goes live immediately — no payment required until you confirm a worker."}
            </p>
          </div>

          {user && !(user as any).idVerified && (
            <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "hsl(30 85% 50% / 0.1)", border: "1px solid hsl(30 85% 50% / 0.3)" }}>
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(30 85% 55%)" }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "hsl(30 85% 60%)" }}>
                ID verification required to post. Go to <strong>Profile → Trust & Credentials</strong> to upload your ID.
              </p>
            </div>
          )}

          <Button onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending || !canSubmit || (category === "Verify & Inspect" && !isVIJob)}
            className="w-full font-display tracking-wider premium-btn bg-secondary text-secondary-foreground border border-secondary-border rounded-md gap-2"
            data-testid="button-post-job">
            {checkoutMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isBarter ? (
              <><DollarSign className="w-5 h-5" /> {isDemoUser ? "POST BARTER JOB" : "POST BARTER JOB — $10 FEE"}</>
            ) : (
              <><Lock className="w-5 h-5" /> POST JOB — FREE</>
            )}
          </Button>
        </Card>
      </div>
    </GuberLayout>
  );
}
