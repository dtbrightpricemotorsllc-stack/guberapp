import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Truck, ShieldCheck, Loader2, Check, Upload, Clock,
  AlertTriangle, X, Star, Zap, Crown,
} from "lucide-react";

// ── constants ──────────────────────────────────────────────────────────────────

const CYAN_ACTIVE   = { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" };
const CYAN_INACTIVE = { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" };

const EQUIPMENT_TYPES = [
  { value: "open",      label: "Open Trailer" },
  { value: "enclosed",  label: "Enclosed" },
  { value: "rollback",  label: "Rollback / Flatbed" },
  { value: "hotshot",   label: "Hotshot" },
  { value: "lowboy",    label: "Lowboy" },
  { value: "multi_car", label: "Multi-Car" },
  { value: "flatbed",   label: "Flatbed" },
  { value: "step_deck", label: "Step Deck" },
  { value: "gooseneck", label: "Gooseneck" },
  { value: "tow_truck", label: "Tow Truck" },
];

const PAYMENT_METHODS = [
  { value: "ach",    label: "ACH / Bank" },
  { value: "check",  label: "Check" },
  { value: "zelle",  label: "Zelle" },
  { value: "cashapp",label: "Cash App" },
  { value: "paypal", label: "PayPal" },
  { value: "comchek",label: "Comchek" },
  { value: "venmo",  label: "Venmo" },
  { value: "wire",   label: "Wire Transfer" },
];

const CREDENTIAL_TYPES: {
  key: string; label: string; hint: string; required: boolean;
  grantsBadge?: string;
}[] = [
  { key: "cdl",               label: "CDL License",          hint: "Commercial Driver's License — required for most commercial transport",  required: true,  grantsBadge: "CDL Verified" },
  { key: "dot",               label: "USDOT Number",         hint: "Proves you are registered with the Federal Motor Carrier Safety Admin", required: true },
  { key: "mc",                label: "MC Authority",         hint: "Motor Carrier authority (interstate commerce)",                         required: false, grantsBadge: "MC Authority" },
  { key: "insurance",         label: "Liability Insurance",  hint: "Carrier liability certificate — COI naming GUBER as certificate holder",required: true,  grantsBadge: "Insured" },
  { key: "cargo_insurance",   label: "Cargo Insurance",      hint: "Cargo/freight coverage for transported goods",                          required: false, grantsBadge: "Cargo Insured" },
  { key: "equipment_photo",   label: "Equipment Photos",     hint: "Clear photos of your trailer/truck (exterior + interior)",              required: false },
  { key: "vehicle_registration", label: "Vehicle Registration", hint: "Current truck and trailer registration documents",                  required: false },
  { key: "experience_letter", label: "Experience Letter",    hint: "Reference letter or dispatch agreement proving transport experience",   required: false, grantsBadge: "Experienced" },
  { key: "dealer_license",    label: "Dealer License",       hint: "Required for dealer transport — state dealer/transporter plate",         required: false, grantsBadge: "Dealer Transport" },
  { key: "oversize_permit",   label: "Oversize Permit",      hint: "State oversize/overweight permit for flatbed / heavy haul",             required: false, grantsBadge: "Oversize Capable" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Check; color: string }> = {
  not_submitted: { label: "Not Submitted", icon: Upload,        color: "text-muted-foreground/40" },
  pending:       { label: "Under Review",  icon: Clock,         color: "text-amber-400" },
  approved:      { label: "Approved",      icon: Check,         color: "text-cyan-400" },
  rejected:      { label: "Rejected",      icon: AlertTriangle, color: "text-red-400" },
  expired:       { label: "Expired",       icon: AlertTriangle, color: "text-orange-400" },
};

const CARRIER_TIERS = [
  {
    value: "basic",
    label: "Basic",
    price: 0,
    priceLabel: "Free",
    features: ["Up to 5 offers/month", "Standard placement", "Basic profile badge"],
    icon: Truck,
    color: "text-muted-foreground/60",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
  },
  {
    value: "pro",
    label: "Carrier Pro",
    price: 29,
    priceLabel: "$29/mo",
    features: ["Priority load access", "GPS tracking feature", "Up to 20 offers/month", "Pro badge on profile"],
    icon: Zap,
    color: "text-cyan-400",
    bg: "rgba(8,145,178,0.08)",
    border: "rgba(6,182,212,0.2)",
  },
  {
    value: "business",
    label: "Carrier Business",
    price: 79,
    priceLabel: "$79/mo",
    features: ["Unlimited offers", "Premium carrier badge", "Higher-value load access", "Business tools", "GPS tracking"],
    icon: Crown,
    color: "text-violet-400",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
  },
];

// ── helper ─────────────────────────────────────────────────────────────────────

function MultiChip({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const sel = (value || []).includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(sel ? (value || []).filter(x => x !== o.value) : [...(value || []), o.value])}
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all"
            style={sel ? CYAN_ACTIVE : CYAN_INACTIVE}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function CarrierProfilePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Detect Stripe success redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sub_success")) {
      toast({ title: "Subscription activated!", description: "Your carrier subscription is now live." });
      window.history.replaceState({}, "", "/carrier-profile");
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-profile"] });
    }
  }, []);

  const { data, isLoading } = useQuery<{ profile: any; credentials: any[] }>({
    queryKey: ["/api/carrier-profile"],
  });

  const profile     = data?.profile;
  const credentials = data?.credentials || [];

  const [equipmentTypes,         setEquipmentTypes]         = useState<string[]>([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<string[]>([]);
  const [dotNumber,               setDotNumber]              = useState("");
  const [mcNumber,                setMcNumber]               = useState("");
  const [insuranceAmount,         setInsuranceAmount]        = useState("");
  const [serviceArea,             setServiceArea]            = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "credentials" | "subscription">("profile");

  // Populate once profile loads
  const [populated, setPopulated] = useState(false);
  useEffect(() => {
    if (profile && !populated) {
      setEquipmentTypes(profile.equipmentTypes || []);
      setAcceptedPaymentMethods(profile.acceptedPaymentMethods || []);
      setDotNumber(profile.dotNumber || "");
      setMcNumber(profile.mcNumber || "");
      setInsuranceAmount(profile.insuranceAmount ? String(profile.insuranceAmount) : "");
      setServiceArea(profile.serviceArea || "");
      setPopulated(true);
    }
  }, [profile, populated]);

  // ── credential upload ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, "uploading" | "done" | "error">>({});

  const uploadMutation = useMutation({
    mutationFn: async ({ type, dataUrl }: { type: string; dataUrl: string }) => {
      const res = await apiRequest("POST", `/api/carrier-profile/credentials/${type}/upload`, { dataUrl });
      return res.json();
    },
    onSuccess: (_, { type }) => {
      setUploadStatus(prev => ({ ...prev, [type]: "done" }));
      toast({ title: "Document submitted!", description: "Under review — we'll notify you within 1–2 business days." });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-profile"] });
    },
    onError: (err: any, { type }) => {
      setUploadStatus(prev => ({ ...prev, [type]: "error" }));
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    },
  });

  function handleUploadClick(credType: string) {
    if (!profile) {
      toast({ variant: "destructive", title: "Save your profile first", description: "Tap 'Save Profile' before uploading credentials." });
      return;
    }
    setUploadingType(credType);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingType) return;
    const type = uploadingType;
    setUploadStatus(prev => ({ ...prev, [type]: "uploading" }));
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({ type, dataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setUploadingType(null);
  }

  // ── subscription checkout ──
  const subMutation = useMutation({
    mutationFn: async (tier: string) => {
      const res = await apiRequest("POST", "/api/carrier-profile/subscription/checkout", { tier });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  // ── profile save ──
  const saveMutation = useMutation({
    mutationFn: (d: any) => apiRequest("PUT", "/api/carrier-profile", d),
    onSuccess: () => {
      toast({ title: "Profile saved!", description: "Your carrier profile is updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-profile"] });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  function handleSave() {
    saveMutation.mutate({
      equipmentTypes:         equipmentTypes.length ? equipmentTypes : undefined,
      acceptedPaymentMethods: acceptedPaymentMethods.length ? acceptedPaymentMethods : undefined,
      dotNumber:              dotNumber || undefined,
      mcNumber:               mcNumber || undefined,
      insuranceAmount:        insuranceAmount ? parseFloat(insuranceAmount) : undefined,
      serviceArea:            serviceArea || undefined,
    });
  }

  if (isLoading) {
    return (
      <GuberLayout title="Carrier Profile" showBack backHref="/load-board">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      </GuberLayout>
    );
  }

  // Credential helpers
  function credStatus(key: string) {
    const c = credentials.find(x => x.credentialType === key);
    return c?.status || "not_submitted";
  }

  const approvedCredentials = credentials.filter(c => c.status === "approved").map(c => c.credentialType);
  const verifiedCount   = approvedCredentials.length;
  const totalRequired   = CREDENTIAL_TYPES.filter(c => c.required).length;
  const isCredentialed  = profile?.credentialsVerified || verifiedCount >= totalRequired;
  const currentTier     = profile?.subscriptionTier || "basic";

  return (
    <GuberLayout title="Carrier Profile" showBack backHref="/load-board">
      {/* Hidden file input for credential uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="px-4 pb-28 pt-2">

        {/* Header */}
        <div
          className="rounded-2xl p-4 mb-5"
          style={{
            background: "linear-gradient(135deg,rgba(8,145,178,0.18),rgba(14,116,144,0.1))",
            border: "1px solid rgba(6,182,212,0.25)",
            boxShadow: "0 0 24px rgba(6,182,212,0.06)",
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.15)" }}>
              <Truck className="w-5 h-5 text-cyan-400" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-black text-cyan-300">Carrier Profile</p>
              <p className="text-[10px] text-cyan-400/50 mt-0.5">Identity stays private until a shipper connects</p>
            </div>
            {currentTier !== "basic" && (
              <span
                className="shrink-0 text-[9px] font-display font-black px-2 py-1 rounded-lg"
                style={{ background: currentTier === "business" ? "rgba(139,92,246,0.15)" : "rgba(6,182,212,0.12)", color: currentTier === "business" ? "#c4b5fd" : "#67e8f9" }}
              >
                {currentTier.toUpperCase()}
              </span>
            )}
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-2 mt-2">
            {profile?.identityVerified && (
              <StatusChip icon={<ShieldCheck className="w-3 h-3" />} label="Identity Verified" color="text-cyan-400" bg="rgba(6,182,212,0.1)" />
            )}
            {profile?.insuranceVerified && (
              <StatusChip icon={<Check className="w-3 h-3" />} label="Insurance Verified" color="text-cyan-400" bg="rgba(6,182,212,0.1)" />
            )}
            {isCredentialed && (
              <StatusChip icon={<ShieldCheck className="w-3 h-3" />} label="GUBER Credentialed" color="text-cyan-300" bg="rgba(6,182,212,0.15)" />
            )}
            {profile?.completedTransports > 0 && (
              <StatusChip icon={<Truck className="w-3 h-3" />} label={`${profile.completedTransports} completed`} color="text-muted-foreground/60" bg="rgba(255,255,255,0.06)" />
            )}
          </div>

          {/* Credential progress */}
          {verifiedCount < totalRequired && (
            <div className="mt-3">
              <div className="flex justify-between text-[9px] text-muted-foreground/40 mb-1">
                <span>Credential progress</span>
                <span>{verifiedCount}/{totalRequired} required</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(verifiedCount / totalRequired) * 100}%`, background: "linear-gradient(90deg,#0891b2,#06b6d4)" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl p-1 mb-5" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["profile", "credentials", "subscription"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 rounded-lg py-2 text-[10px] font-display font-bold transition-all capitalize"
              style={activeTab === tab ? CYAN_ACTIVE : { color: "rgba(255,255,255,0.4)" }}
              data-testid={`tab-${tab}`}
            >
              {tab === "credentials" ? "Creds & Docs" : tab === "subscription" ? "Plans" : "Profile"}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            <Section label="Equipment I Operate">
              <MultiChip options={EQUIPMENT_TYPES} value={equipmentTypes} onChange={setEquipmentTypes} />
            </Section>

            <Section label="DOT & MC Numbers">
              <p className="text-[9px] text-muted-foreground/30 mb-2">Only revealed after a shipper pays the connection fee</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">DOT Number</Label>
                  <Input value={dotNumber} onChange={e => setDotNumber(e.target.value)} placeholder="1234567"
                    className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono" data-testid="input-dot-number" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">MC Number</Label>
                  <Input value={mcNumber} onChange={e => setMcNumber(e.target.value)} placeholder="MC-123456"
                    className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono" data-testid="input-mc-number" />
                </div>
              </div>
            </Section>

            <Section label="Insurance Coverage">
              <div>
                <Label className="text-[10px] text-muted-foreground/50">Coverage Amount ($)</Label>
                <Input value={insuranceAmount} onChange={e => setInsuranceAmount(e.target.value)} placeholder="1000000" type="number"
                  className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-insurance-amount" />
                <p className="text-[9px] text-muted-foreground/25 mt-1">Amount shown publicly. Certificate only after connection.</p>
              </div>
            </Section>

            <Section label="Service Area">
              <Input value={serviceArea} onChange={e => setServiceArea(e.target.value)}
                placeholder="e.g. Texas, Oklahoma, Southeast US"
                className="rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-service-area" />
            </Section>

            <Section label="Payment Methods I Accept">
              <p className="text-[9px] text-muted-foreground/30 mb-2">Shown only after connection</p>
              <MultiChip options={PAYMENT_METHODS} value={acceptedPaymentMethods} onChange={setAcceptedPaymentMethods} />
            </Section>

            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                🔒 <strong className="text-muted-foreground/50">Privacy</strong> — Real name, DOT/MC, insurance cert, and payment methods are never shown publicly.
                Shippers see only your GUBER ID, rating, equipment types, and coverage amount. Full details unlock after they pay the connection fee.
              </p>
            </div>

            <Button
              className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={CYAN_ACTIVE}
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-carrier-profile"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" /> Save Profile</>}
            </Button>
          </div>
        )}

        {/* ── CREDENTIALS TAB ── */}
        {activeTab === "credentials" && (
          <div className="space-y-3">
            {/* Badge earned notice */}
            <div
              className="rounded-xl p-3 flex items-center gap-2.5 mb-4"
              style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <p className="text-xs font-display font-bold text-cyan-300">
                  {isCredentialed ? "GUBER Credentialed Carrier" : "Complete credentials to earn the badge"}
                </p>
                <p className="text-[9px] text-cyan-400/50 mt-0.5">
                  Each approved credential earns a public badge · Badges only show after admin approval
                </p>
              </div>
            </div>

            {/* Approved badges row */}
            {approvedCredentials.length > 0 && (
              <div className="rounded-xl p-3 mb-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[9px] font-display font-black text-muted-foreground/30 uppercase tracking-widest mb-2">Your Active Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {CREDENTIAL_TYPES.filter(c => approvedCredentials.includes(c.key) && c.grantsBadge).map(c => (
                    <span
                      key={c.key}
                      className="flex items-center gap-1 text-[10px] font-display font-bold px-2 py-1 rounded-lg text-cyan-400"
                      style={{ background: "rgba(6,182,212,0.1)" }}
                    >
                      <ShieldCheck className="w-3 h-3" /> {c.grantsBadge}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {CREDENTIAL_TYPES.map(cred => {
              const status  = credStatus(cred.key);
              const sc      = STATUS_CONFIG[status];
              const StatusIcon = sc.icon;
              const isUploading = uploadStatus[cred.key] === "uploading";
              const canUpload   = status === "not_submitted" || status === "rejected" || status === "expired";

              return (
                <div
                  key={cred.key}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{
                    background: status === "approved"
                      ? "rgba(6,182,212,0.06)"
                      : "rgba(255,255,255,0.04)",
                    border: status === "approved"
                      ? "1px solid rgba(6,182,212,0.2)"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                  data-testid={`credential-${cred.key}`}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: status === "approved"
                        ? "rgba(6,182,212,0.12)"
                        : status === "pending"
                        ? "rgba(245,158,11,0.1)"
                        : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <StatusIcon className={`w-4 h-4 ${sc.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-display font-bold text-foreground">{cred.label}</p>
                      {cred.required && status !== "approved" && (
                        <span className="text-[8px] font-display font-black px-1.5 py-0.5 rounded text-red-400" style={{ background: "rgba(239,68,68,0.1)" }}>
                          REQUIRED
                        </span>
                      )}
                      {cred.grantsBadge && status === "approved" && (
                        <span className="text-[8px] font-display font-black px-1.5 py-0.5 rounded text-cyan-400" style={{ background: "rgba(6,182,212,0.12)" }}>
                          BADGE ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 mt-0.5 leading-relaxed">{cred.hint}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <p className={`text-[10px] font-display font-bold ${sc.color}`}>{sc.label}</p>
                      {status === "rejected" && (
                        <span className="text-[9px] text-red-400/60"> — resubmit a clearer document</span>
                      )}
                    </div>
                  </div>

                  {canUpload && (
                    <button
                      className="shrink-0 text-[10px] font-display font-black px-3 py-2 rounded-lg transition-all flex items-center gap-1.5"
                      style={isUploading ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" } : CYAN_ACTIVE}
                      onClick={() => !isUploading && handleUploadClick(cred.key)}
                      disabled={isUploading}
                      data-testid={`button-upload-${cred.key}`}
                    >
                      {isUploading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><Upload className="w-3 h-3" /> Upload</>
                      }
                    </button>
                  )}

                  {status === "pending" && (
                    <span className="shrink-0 text-[9px] font-display font-bold text-amber-400/60 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Review
                    </span>
                  )}
                </div>
              );
            })}

            <div className="rounded-xl p-3 mt-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                📋 <strong className="text-muted-foreground/50">Admin review</strong> — All submitted documents are reviewed by GUBER staff within 1–2 business days.
                Documents are stored privately and never shared with shippers. Approved credentials earn public badges visible to shippers.
              </p>
            </div>
          </div>
        )}

        {/* ── SUBSCRIPTION TAB ── */}
        {activeTab === "subscription" && (
          <div className="space-y-4">
            <div className="rounded-xl p-3 mb-2" style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.15)" }}>
              <p className="text-xs font-display font-bold text-cyan-300 mb-0.5">Carrier Plans</p>
              <p className="text-[9px] text-cyan-400/50">
                Upgrade to unlock premium load access, GPS tracking, and the verified carrier badge. Cancel anytime.
              </p>
            </div>

            {CARRIER_TIERS.map(tier => {
              const isCurrent = currentTier === tier.value;
              const TierIcon  = tier.icon;
              return (
                <div
                  key={tier.value}
                  className="rounded-2xl p-4"
                  style={{
                    background: isCurrent ? tier.bg : "rgba(255,255,255,0.03)",
                    border: `1.5px solid ${isCurrent ? tier.border : "rgba(255,255,255,0.07)"}`,
                    boxShadow: isCurrent ? `0 0 20px ${tier.bg}` : "none",
                  }}
                  data-testid={`card-tier-${tier.value}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: isCurrent ? tier.bg : "rgba(255,255,255,0.05)", border: `1px solid ${tier.border}` }}
                      >
                        <TierIcon className={`w-4 h-4 ${tier.color}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-display font-black ${isCurrent ? tier.color : "text-foreground"}`}>{tier.label}</p>
                        {isCurrent && (
                          <p className="text-[9px] font-display font-bold text-muted-foreground/40 mt-0.5">Current plan</p>
                        )}
                      </div>
                    </div>
                    <p className={`text-xl font-display font-black shrink-0 ${isCurrent ? tier.color : "text-muted-foreground/50"}`}>
                      {tier.priceLabel}
                    </p>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {tier.features.map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs">
                        <Check className={`w-3 h-3 shrink-0 ${tier.color}`} />
                        <span className="text-foreground/70">{f}</span>
                      </div>
                    ))}
                  </div>

                  {!isCurrent && tier.value !== "basic" && (
                    <Button
                      className="w-full rounded-xl h-10 font-display font-black text-sm"
                      style={tier.value === "business"
                        ? { background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff" }
                        : CYAN_ACTIVE}
                      onClick={() => subMutation.mutate(tier.value)}
                      disabled={subMutation.isPending}
                      data-testid={`button-subscribe-${tier.value}`}
                    >
                      {subMutation.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : `Upgrade to ${tier.label} — ${tier.priceLabel}`
                      }
                    </Button>
                  )}

                  {isCurrent && tier.value !== "basic" && (
                    <p className="text-center text-[10px] text-muted-foreground/40 font-display font-bold">
                      ✓ Active — manage at stripe.com/billing
                    </p>
                  )}

                  {isCurrent && tier.value === "basic" && (
                    <p className="text-[9px] text-muted-foreground/30 text-center">
                      Upgrade to unlock more features
                    </p>
                  )}
                </div>
              );
            })}

            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                💳 <strong className="text-muted-foreground/50">Billing</strong> — Subscriptions are processed securely via Stripe and renew monthly.
                Cancel anytime. Premium carrier badge and priority placement activate immediately after payment.
                No refunds for partial months.
              </p>
            </div>
          </div>
        )}
      </div>
    </GuberLayout>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-widest">{label}</p>
      {children}
    </div>
  );
}

function StatusChip({ icon, label, color, bg }: { icon: ReactNode; label: string; color: string; bg: string }) {
  return (
    <div className={`flex items-center gap-1 text-[10px] font-display font-bold px-2 py-1 rounded-lg ${color}`} style={{ background: bg }}>
      {icon}
      {label}
    </div>
  );
}
