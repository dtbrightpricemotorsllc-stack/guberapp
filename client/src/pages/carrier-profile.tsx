import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Truck, ShieldCheck, Loader2, Check, Upload, Clock, AlertTriangle, X,
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
  { value: "ach",       label: "ACH / Bank" },
  { value: "check",     label: "Check" },
  { value: "zelle",     label: "Zelle" },
  { value: "cashapp",   label: "Cash App" },
  { value: "paypal",    label: "PayPal" },
  { value: "comchek",   label: "Comchek" },
  { value: "venmo",     label: "Venmo" },
  { value: "wire",      label: "Wire Transfer" },
];

const CREDENTIAL_TYPES: { key: string; label: string; hint: string; required: boolean }[] = [
  { key: "cdl",                label: "CDL License",           hint: "Commercial Driver's License", required: true },
  { key: "dot",                label: "USDOT Number",          hint: "DOT registration number",      required: true },
  { key: "mc",                 label: "MC Authority",          hint: "Motor Carrier authority",      required: false },
  { key: "insurance",          label: "Liability Insurance",   hint: "Carrier liability certificate", required: true },
  { key: "cargo_insurance",    label: "Cargo Insurance",       hint: "Cargo/freight coverage",       required: false },
  { key: "equipment_photo",    label: "Equipment Photos",      hint: "Photos of your trailer/truck",  required: false },
  { key: "vehicle_registration",label: "Vehicle Registration", hint: "Truck/trailer registration",   required: false },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Check; color: string }> = {
  not_submitted: { label: "Not Submitted", icon: Upload,         color: "text-muted-foreground/40" },
  pending:       { label: "Under Review",  icon: Clock,          color: "text-amber-400" },
  approved:      { label: "Approved",      icon: Check,          color: "text-cyan-400" },
  rejected:      { label: "Rejected",      icon: AlertTriangle,  color: "text-red-400" },
  expired:       { label: "Expired",       icon: AlertTriangle,  color: "text-orange-400" },
};

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

  const { data, isLoading } = useQuery<{ profile: any; credentials: any[] }>({
    queryKey: ["/api/carrier-profile"],
  });

  const profile     = data?.profile;
  const credentials = data?.credentials || [];

  const [equipmentTypes,        setEquipmentTypes]        = useState<string[]>(profile?.equipmentTypes || []);
  const [acceptedPaymentMethods,setAcceptedPaymentMethods]= useState<string[]>(profile?.acceptedPaymentMethods || []);
  const [dotNumber,              setDotNumber]             = useState(profile?.dotNumber || "");
  const [mcNumber,               setMcNumber]              = useState(profile?.mcNumber || "");
  const [insuranceAmount,        setInsuranceAmount]       = useState(profile?.insuranceAmount ? String(profile.insuranceAmount) : "");
  const [serviceArea,            setServiceArea]           = useState(profile?.serviceArea || "");
  const [yearsExperience,        setYearsExperience]       = useState(profile?.yearsExperience ? String(profile.yearsExperience) : "");
  const [maxLoadWeight,          setMaxLoadWeight]         = useState(profile?.maxLoadWeight ? String(profile.maxLoadWeight) : "");
  const [activeTab, setActiveTab] = useState<"profile" | "credentials">("profile");

  // populate from loaded data after query
  if (profile && !equipmentTypes.length && profile.equipmentTypes?.length) {
    setEquipmentTypes(profile.equipmentTypes);
  }

  const mutation = useMutation({
    mutationFn: (d: any) => apiRequest("PUT", "/api/carrier-profile", d),
    onSuccess: () => {
      toast({ title: "Profile saved!", description: "Your carrier profile is updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-profile"] });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  function handleSave() {
    mutation.mutate({
      equipmentTypes:        equipmentTypes.length ? equipmentTypes : undefined,
      acceptedPaymentMethods: acceptedPaymentMethods.length ? acceptedPaymentMethods : undefined,
      dotNumber:             dotNumber || undefined,
      mcNumber:              mcNumber || undefined,
      insuranceAmount:       insuranceAmount ? parseFloat(insuranceAmount) : undefined,
      serviceArea:           serviceArea || undefined,
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

  // credential status lookup
  function credStatus(key: string) {
    const c = credentials.find(x => x.credentialType === key);
    return c?.status || "not_submitted";
  }

  const verifiedCount = credentials.filter(c => c.status === "approved").length;
  const totalRequired = CREDENTIAL_TYPES.filter(c => c.required).length;
  const isCredentialed = profile?.credentialsVerified || verifiedCount >= totalRequired;

  return (
    <GuberLayout title="Carrier Profile" showBack backHref="/load-board">
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
              <p className="text-[10px] text-cyan-400/50 mt-0.5">Your identity stays private until a shipper connects</p>
            </div>
          </div>

          {/* Status chips row */}
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

          {/* Credential progress bar */}
          {verifiedCount < totalRequired && (
            <div className="mt-3">
              <div className="flex justify-between text-[9px] text-muted-foreground/40 mb-1">
                <span>Credential progress</span>
                <span>{verifiedCount}/{totalRequired} required</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(verifiedCount / totalRequired) * 100}%`,
                    background: "linear-gradient(90deg,#0891b2,#06b6d4)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl p-1 mb-5" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["profile", "credentials"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 rounded-lg py-2 text-xs font-display font-bold transition-all capitalize"
              style={activeTab === tab ? CYAN_ACTIVE : { color: "rgba(255,255,255,0.4)" }}
              data-testid={`tab-${tab}`}
            >
              {tab === "credentials" ? "Credentials & Docs" : "Profile"}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            {/* Equipment */}
            <Section label="Equipment I Operate">
              <MultiChip options={EQUIPMENT_TYPES} value={equipmentTypes} onChange={setEquipmentTypes} />
            </Section>

            {/* DOT / MC */}
            <Section label="DOT & MC Numbers">
              <p className="text-[9px] text-muted-foreground/30 mb-2">Only shown after a shipper pays the connection fee</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">DOT Number</Label>
                  <Input
                    value={dotNumber}
                    onChange={e => setDotNumber(e.target.value)}
                    placeholder="1234567"
                    className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono"
                    data-testid="input-dot-number"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">MC Number</Label>
                  <Input
                    value={mcNumber}
                    onChange={e => setMcNumber(e.target.value)}
                    placeholder="MC-123456"
                    className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono"
                    data-testid="input-mc-number"
                  />
                </div>
              </div>
            </Section>

            {/* Insurance */}
            <Section label="Insurance Coverage">
              <div>
                <Label className="text-[10px] text-muted-foreground/50">Coverage Amount ($)</Label>
                <Input
                  value={insuranceAmount}
                  onChange={e => setInsuranceAmount(e.target.value)}
                  placeholder="1000000"
                  type="number"
                  className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm"
                  data-testid="input-insurance-amount"
                />
                <p className="text-[9px] text-muted-foreground/25 mt-1">Coverage amount shown publicly. Certificate only revealed after connection.</p>
              </div>
            </Section>

            {/* Service area (structured) */}
            <Section label="Service Area">
              <Input
                value={serviceArea}
                onChange={e => setServiceArea(e.target.value)}
                placeholder="e.g. Texas, Oklahoma, Southeast US"
                className="rounded-xl h-10 bg-background/50 border-border/50 text-sm"
                data-testid="input-service-area"
              />
            </Section>

            {/* Payment methods */}
            <Section label="Payment Methods I Accept">
              <p className="text-[9px] text-muted-foreground/30 mb-2">Shown only after connection</p>
              <MultiChip options={PAYMENT_METHODS} value={acceptedPaymentMethods} onChange={setAcceptedPaymentMethods} />
            </Section>

            {/* Privacy notice */}
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                🔒 <strong className="text-muted-foreground/50">Privacy</strong> — Real name, DOT/MC numbers, insurance certificate, and payment methods are never shown publicly. Shippers see only your GUBER ID, rating, equipment types, and coverage amount. Full details unlock only after they pay the connection fee.
              </p>
            </div>

            <Button
              className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={CYAN_ACTIVE}
              onClick={handleSave}
              disabled={mutation.isPending}
              data-testid="button-save-carrier-profile"
            >
              {mutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Check className="w-4 h-4 mr-2" /> Save Profile</>
              }
            </Button>
          </div>
        )}

        {/* ── CREDENTIALS TAB ── */}
        {activeTab === "credentials" && (
          <div className="space-y-3">
            <div
              className="rounded-xl p-3 flex items-center gap-2.5 mb-4"
              style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <p className="text-xs font-display font-bold text-cyan-300">
                  {isCredentialed ? "GUBER Credentialed Carrier" : "Complete credentials to earn badge"}
                </p>
                <p className="text-[9px] text-cyan-400/50 mt-0.5">
                  Credentialed carriers get priority placement and shipper trust
                </p>
              </div>
            </div>

            {CREDENTIAL_TYPES.map(cred => {
              const status = credStatus(cred.key);
              const sc = STATUS_CONFIG[status];
              const StatusIcon = sc.icon;
              return (
                <div
                  key={cred.key}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-display font-bold text-foreground">{cred.label}</p>
                      {cred.required && status !== "approved" && (
                        <span className="text-[8px] font-display font-black px-1.5 py-0.5 rounded text-red-400" style={{ background: "rgba(239,68,68,0.1)" }}>
                          REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 mt-0.5">{cred.hint}</p>
                    <p className={`text-[10px] font-display font-bold mt-1 ${sc.color}`}>{sc.label}</p>
                  </div>
                  {status === "not_submitted" || status === "rejected" ? (
                    <button
                      className="shrink-0 text-[10px] font-display font-black px-3 py-1.5 rounded-lg transition-all"
                      style={CYAN_ACTIVE}
                      onClick={() => {
                        toast({
                          title: "Document upload",
                          description: "Contact support@guber.app to submit credentials during beta.",
                        });
                      }}
                      data-testid={`button-upload-${cred.key}`}
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}

            <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                📋 <strong className="text-muted-foreground/50">Admin review</strong> — All submitted documents are reviewed by GUBER staff within 1–2 business days. Approved credentials earn you the GUBER Credentialed badge visible to shippers.
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
    <div
      className={`flex items-center gap-1 text-[10px] font-display font-bold px-2 py-1 rounded-lg ${color}`}
      style={{ background: bg }}
    >
      {icon}
      {label}
    </div>
  );
}
