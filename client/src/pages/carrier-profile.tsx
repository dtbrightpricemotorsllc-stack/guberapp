import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Truck, ShieldCheck, Loader2, Check } from "lucide-react";

const EQUIPMENT_TYPES = [
  { value: "open", label: "Open Trailer" },
  { value: "enclosed", label: "Enclosed Trailer" },
  { value: "rollback", label: "Rollback / Flatbed" },
  { value: "hotshot", label: "Hotshot" },
  { value: "lowboy", label: "Lowboy" },
  { value: "multi_car", label: "Multi-Car" },
  { value: "flatbed", label: "Flatbed" },
  { value: "step_deck", label: "Step Deck" },
];

const PAYMENT_METHODS = [
  { value: "ach", label: "ACH / Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "zelle", label: "Zelle" },
  { value: "cashapp", label: "Cash App" },
  { value: "paypal", label: "PayPal" },
  { value: "comchek", label: "Comchek / TCH" },
];

function MultiToggle({ options, value, onChange }: {
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
            onClick={() => onChange(sel ? (value || []).filter((x: string) => x !== o.value) : [...(value || []), o.value])}
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all"
            style={sel
              ? { background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function CarrierProfilePage() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ profile: any }>({
    queryKey: ["/api/carrier-profile"],
  });

  const profile = data?.profile;

  const [equipmentTypes, setEquipmentTypes] = useState<string[]>(profile?.equipmentTypes || []);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<string[]>(profile?.acceptedPaymentMethods || []);
  const [dotNumber, setDotNumber] = useState(profile?.dotNumber || "");
  const [mcNumber, setMcNumber] = useState(profile?.mcNumber || "");
  const [insuranceAmount, setInsuranceAmount] = useState(profile?.insuranceAmount ? String(profile.insuranceAmount) : "");
  const [serviceArea, setServiceArea] = useState(profile?.serviceArea || "");
  const [bio, setBio] = useState(profile?.bio || "");

  const mutation = useMutation({
    mutationFn: (d: any) => apiRequest("PUT", "/api/carrier-profile", d),
    onSuccess: () => {
      toast({ title: "Profile saved!", description: "Your carrier profile is live." });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-profile"] });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  function handleSave() {
    mutation.mutate({
      equipmentTypes: equipmentTypes.length ? equipmentTypes : undefined,
      acceptedPaymentMethods: acceptedPaymentMethods.length ? acceptedPaymentMethods : undefined,
      dotNumber: dotNumber || undefined,
      mcNumber: mcNumber || undefined,
      insuranceAmount: insuranceAmount ? parseFloat(insuranceAmount) : undefined,
      serviceArea: serviceArea || undefined,
      bio: bio || undefined,
    });
  }

  if (isLoading) {
    return (
      <GuberLayout title="Carrier Profile" showBack backHref="/load-board">
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </GuberLayout>
    );
  }

  return (
    <GuberLayout title="Carrier Profile" showBack backHref="/load-board">
      <div className="px-4 pb-28 pt-2 space-y-5">

        {/* Header */}
        <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(30,58,138,0.3),rgba(37,99,235,0.15))", border: "1px solid rgba(59,130,246,0.2)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.2)" }}>
              <Truck className="w-5 h-5 text-blue-400" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-display font-black text-blue-300">Carrier Profile</p>
              <p className="text-[10px] text-blue-400/60 mt-0.5">Your identity stays private until a shipper connects</p>
            </div>
          </div>
          {profile?.identityVerified && (
            <div className="flex items-center gap-1.5 text-xs font-display font-bold text-emerald-400 mt-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Identity Verified
            </div>
          )}
          {profile?.completedTransports > 0 && (
            <p className="text-xs text-muted-foreground/50 mt-1">{profile.completedTransports} completed transports</p>
          )}
        </div>

        {/* Equipment */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider">Equipment I Operate</p>
          <MultiToggle options={EQUIPMENT_TYPES} value={equipmentTypes} onChange={setEquipmentTypes} />
        </div>

        {/* Credentials */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider">Credentials</p>
          <p className="text-[10px] text-muted-foreground/40">Shown only to shippers after they pay the connection fee</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground/60">DOT Number</Label>
              <Input value={dotNumber} onChange={e => setDotNumber(e.target.value)} placeholder="1234567" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono" data-testid="input-dot-number" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/60">MC Number</Label>
              <Input value={mcNumber} onChange={e => setMcNumber(e.target.value)} placeholder="MC-123456" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono" data-testid="input-mc-number" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/60">Insurance Amount ($)</Label>
            <Input value={insuranceAmount} onChange={e => setInsuranceAmount(e.target.value)} placeholder="1000000" type="number" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-insurance-amount" />
            <p className="text-[9px] text-muted-foreground/30 mt-1">Only the amount is shown publicly, not the certificate</p>
          </div>
        </div>

        {/* Payment methods */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider">Payment Methods I Accept</p>
          <p className="text-[10px] text-muted-foreground/40">Shown only after connection</p>
          <MultiToggle options={PAYMENT_METHODS} value={acceptedPaymentMethods} onChange={setAcceptedPaymentMethods} />
        </div>

        {/* Service area + bio */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider">About</p>
          <div>
            <Label className="text-xs text-muted-foreground/60">Service Area</Label>
            <Input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. Texas, Oklahoma, Southeast US" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-service-area" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/60">Bio / Notes for Shippers</Label>
            <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Years of experience, specialty loads, anything shippers should know..." className="mt-1 rounded-xl bg-background/50 border-border/50 text-sm resize-none" rows={3} data-testid="input-bio" />
          </div>
        </div>

        {/* Privacy notice */}
        <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
            🔒 <strong className="text-muted-foreground/60">Privacy</strong> — Your real name, DOT/MC numbers, insurance certificate, payment methods, and contact info are never shown publicly. Shippers see only your GUBER ID, rating, equipment types, and insurance coverage amount. Full details unlock only after they pay the connection fee.
          </p>
        </div>

        <Button
          className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
          style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)" }}
          onClick={handleSave}
          disabled={mutation.isPending}
          data-testid="button-save-carrier-profile"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" /> Save Carrier Profile</>}
        </Button>
      </div>
    </GuberLayout>
  );
}
