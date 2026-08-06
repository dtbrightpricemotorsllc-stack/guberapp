import { useState, useRef, useEffect } from "react";
import { notifyUploadStart, notifyUploadDone, notifyUploadError } from "@/lib/upload-events";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, ChevronLeft, ChevronRight, Upload, Shield, Clock, Globe, Image, CheckCircle2 } from "lucide-react";
import type { BusinessProfile } from "@shared/schema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const INDUSTRIES = [
  "Insurance", "Property Management", "Survey & Inspection", "Automotive",
  "Lending & Finance", "Real Estate", "Retail", "Government & Municipal",
  "Healthcare", "Logistics & Delivery", "Construction", "Other",
];

const CONTACT_METHODS = ["Email", "Phone", "Text / SMS", "Any"];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DRAFT_KEY = "guber_biz_onboarding_draft";

const STEPS = [
  { label: "Company Info",   icon: Building2 },
  { label: "Location",       icon: Globe },
  { label: "Online & Media", icon: Image },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => {
        const done    = i < step;
        const current = i === step;
        const StepIcon = STEPS[i].icon;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={
                done    ? { background: "#a855f7", border: "2px solid #a855f7" } :
                current ? { background: "rgba(168,85,247,0.15)", border: "2px solid #a855f7" } :
                          { background: "hsl(var(--muted))", border: "2px solid transparent" }
              }
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : (
                <StepIcon className="w-3.5 h-3.5" style={{ color: current ? "#a855f7" : "#6b7280" }} />
              )}
            </div>
            <div
              className="w-full h-1 rounded-full transition-all"
              style={{ background: done ? "#a855f7" : current ? "rgba(168,85,247,0.3)" : "hsl(var(--muted))" }}
            />
            <p className="text-[9px] font-display tracking-wider" style={{ color: current ? "#a855f7" : "#6b7280" }}>
              {STEPS[i].label.toUpperCase()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

type HoursEntry = { open: string; close: string; closed: boolean };
type BusinessHours = Record<string, HoursEntry>;

function defaultHours(): BusinessHours {
  return Object.fromEntries(DAYS.map(d => [d, { open: "09:00", close: "17:00", closed: false }]));
}

export default function BusinessOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existing } = useQuery<BusinessProfile>({
    queryKey: ["/api/business/profile"],
    retry: false,
  });

  const [step, setStep] = useState(0);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    // Step 0 — Company Info
    companyName: "",
    billingEmail: "",
    companyLogo: "",
    industry: "",
    contactPerson: "",
    contactPhone: "",
    description: "",
    // Step 1 — Location & Contact
    address: "",
    zipCode: "",
    serviceArea: "",
    preferredContactMethod: "",
    // Step 2 — Online Presence & Media
    website: "",
    productsServices: "",
    businessDescription: "",
    businessHours: defaultHours() as BusinessHours,
    socialLinks: { instagram: "", facebook: "", linkedin: "", twitter: "" } as Record<string, string>,
    photoUrls: [] as string[],
  });

  // Restore from existing profile
  useEffect(() => {
    if (existing) {
      setForm(f => ({
        ...f,
        companyName:            existing.companyName || "",
        billingEmail:           existing.billingEmail || "",
        companyLogo:            existing.companyLogo || "",
        industry:               (existing as any).industry || "",
        contactPerson:          (existing as any).contactPerson || "",
        contactPhone:           (existing as any).contactPhone || "",
        description:            (existing as any).description || "",
        address:                (existing as any).address || "",
        zipCode:                (existing as any).zipCode || "",
        serviceArea:            (existing as any).serviceArea || "",
        preferredContactMethod: (existing as any).preferredContactMethod || "",
        website:                (existing as any).website || "",
        productsServices:       (existing as any).productsServices || "",
        businessDescription:    (existing as any).businessDescription || "",
        businessHours:          (existing as any).businessHours || defaultHours(),
        socialLinks:            (existing as any).socialLinks || { instagram: "", facebook: "", linkedin: "", twitter: "" },
        photoUrls:              (existing as any).photoUrls || [],
      }));
      if (existing.companyLogo) setLogoPreview(existing.companyLogo);
    }
  }, [existing]);

  // Load localStorage draft (only if no existing saved profile)
  useEffect(() => {
    if (existing?.companyName) return; // prefer server data
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        setForm(f => ({ ...f, ...draft }));
        if (draft.companyLogo) setLogoPreview(draft.companyLogo);
        toast({ title: "Draft restored", description: "Your previous progress was loaded." });
      }
    } catch {}
  }, [existing]);

  // Auto-save draft to localStorage on form change
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/business/profile", form);
      return res.json() as Promise<BusinessProfile>;
    },
    onSuccess: (savedProfile) => {
      queryClient.setQueryData(["/api/business/profile"], savedProfile);
      queryClient.invalidateQueries({ queryKey: ["/api/business/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast({ title: "Business profile saved!" });
      navigate("/biz/dashboard?fromOnboarding=1");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSaveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
    toast({ title: "Draft saved", description: "Your progress has been saved locally." });
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    notifyUploadStart();
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/upload-photo", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      setForm(f => ({ ...f, companyLogo: data.url }));
      setLogoPreview(data.url);
      notifyUploadDone();
    } catch {
      notifyUploadError("Logo upload failed");
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const setHours = (day: string, field: keyof HoursEntry, value: string | boolean) => {
    setForm(f => ({
      ...f,
      businessHours: {
        ...f.businessHours,
        [day]: { ...f.businessHours[day], [field]: value },
      },
    }));
  };

  const isStep0Valid = !!form.companyName;
  const canSave = isStep0Valid;

  // ── Step 0: Company Info ──────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="space-y-5">
      {/* Logo */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Logo</Label>
        <div className="flex items-center gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 rounded-2xl border-2 border-dashed border-border/30 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden"
            data-testid="button-upload-logo"
          >
            {logoPreview ? (
              <img src={logoPreview} className="w-full h-full object-cover" alt="logo" />
            ) : (
              uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Upload a square logo</p>
            <p className="text-[10px] text-muted-foreground">PNG, JPG — shown on your posts</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
        </div>
      </div>

      {/* Company Name */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Name *</Label>
        <Input value={form.companyName}
          onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))}
          placeholder="Acme Corp" className="bg-background border-border/30"
          data-testid="input-company-name" />
      </div>

      {/* Industry */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Industry</Label>
        <Select value={form.industry} onValueChange={(v) => setForm(f => ({ ...f, industry: v }))}>
          <SelectTrigger className="bg-background border-border/30" data-testid="select-industry">
            <SelectValue placeholder="Select your industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map(ind => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Company Description */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Description</Label>
        <Textarea value={form.description}
          onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of your company..." className="bg-background border-border/30 min-h-[80px] text-sm"
          maxLength={500} data-testid="input-description" />
      </div>

      {/* Contact Person */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Contact Person</Label>
        <Input value={form.contactPerson}
          onChange={(e) => setForm(f => ({ ...f, contactPerson: e.target.value }))}
          placeholder="Jane Smith" className="bg-background border-border/30"
          data-testid="input-contact-person" />
      </div>

      {/* Contact Phone */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Contact Phone</Label>
        <Input value={form.contactPhone}
          onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))}
          placeholder="555-000-0000" type="tel" className="bg-background border-border/30"
          data-testid="input-contact-phone" />
      </div>

      {/* Billing Email */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Billing Email</Label>
        <Input value={form.billingEmail}
          onChange={(e) => setForm(f => ({ ...f, billingEmail: e.target.value }))}
          placeholder="billing@yourcompany.com" type="email" className="bg-background border-border/30"
          data-testid="input-billing-email" />
      </div>
    </div>
  );

  // ── Step 1: Location & Contact ────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Business Address</Label>
        <Input value={form.address}
          onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
          placeholder="123 Main St, City, State" className="bg-background border-border/30"
          data-testid="input-address" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">ZIP Code</Label>
        <Input value={form.zipCode}
          onChange={(e) => setForm(f => ({ ...f, zipCode: e.target.value }))}
          placeholder="27601" className="bg-background border-border/30 max-w-[160px]"
          data-testid="input-zip-code" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Service Area</Label>
        <Input value={form.serviceArea}
          onChange={(e) => setForm(f => ({ ...f, serviceArea: e.target.value }))}
          placeholder="e.g. Triangle, NC metro area or nationwide"
          className="bg-background border-border/30"
          data-testid="input-service-area" />
        <p className="text-[10px] text-muted-foreground">Describe the geographic area you serve</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Preferred Contact Method</Label>
        <Select value={form.preferredContactMethod} onValueChange={(v) => setForm(f => ({ ...f, preferredContactMethod: v }))}>
          <SelectTrigger className="bg-background border-border/30" data-testid="select-preferred-contact">
            <SelectValue placeholder="How do you prefer to be contacted?" />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Business Hours */}
      <div className="space-y-2">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Business Hours
        </Label>
        <div className="rounded-xl border border-border/20 overflow-hidden">
          {DAYS.map((day, i) => {
            const h = form.businessHours[day] || { open: "09:00", close: "17:00", closed: false };
            return (
              <div key={day} className={`flex items-center gap-2 px-3 py-2 ${i % 2 === 0 ? "bg-muted/30" : ""}`}>
                <span className="w-8 text-[11px] font-display font-bold text-muted-foreground">{day}</span>
                <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={!h.closed}
                    onChange={e => setHours(day, "closed", !e.target.checked)}
                    className="w-3.5 h-3.5 rounded"
                    data-testid={`hours-open-${day}`}
                  />
                  <span className="text-[10px] text-muted-foreground">Open</span>
                </label>
                {!h.closed && (
                  <>
                    <input type="time" value={h.open}
                      onChange={e => setHours(day, "open", e.target.value)}
                      className="text-[11px] bg-background border border-border/30 rounded px-1 py-0.5"
                      data-testid={`hours-open-time-${day}`} />
                    <span className="text-[10px] text-muted-foreground">–</span>
                    <input type="time" value={h.close}
                      onChange={e => setHours(day, "close", e.target.value)}
                      className="text-[11px] bg-background border border-border/30 rounded px-1 py-0.5"
                      data-testid={`hours-close-time-${day}`} />
                  </>
                )}
                {h.closed && <span className="text-[10px] text-muted-foreground">Closed</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Step 2: Online Presence & Media ───────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Website</Label>
        <Input value={form.website}
          onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
          placeholder="https://yourcompany.com" type="url" className="bg-background border-border/30"
          data-testid="input-website" />
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Social Media</Label>
        {[
          { key: "instagram", label: "Instagram", placeholder: "@yourbusiness" },
          { key: "facebook",  label: "Facebook",  placeholder: "facebook.com/yourbusiness" },
          { key: "linkedin",  label: "LinkedIn",  placeholder: "linkedin.com/company/..." },
          { key: "twitter",   label: "X / Twitter", placeholder: "@handle" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] font-display w-20 text-muted-foreground">{label}</span>
            <Input value={form.socialLinks[key] || ""}
              onChange={(e) => setForm(f => ({ ...f, socialLinks: { ...f.socialLinks, [key]: e.target.value } }))}
              placeholder={placeholder} className="bg-background border-border/30 text-sm flex-1"
              data-testid={`input-social-${key}`} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Products & Services</Label>
        <Textarea value={form.productsServices}
          onChange={(e) => setForm(f => ({ ...f, productsServices: e.target.value }))}
          placeholder="List your main products or services..."
          className="bg-background border-border/30 min-h-[80px] text-sm"
          maxLength={600} data-testid="input-products-services" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Detailed Business Description</Label>
        <Textarea value={form.businessDescription}
          onChange={(e) => setForm(f => ({ ...f, businessDescription: e.target.value }))}
          placeholder="In-depth description of your business, history, mission..."
          className="bg-background border-border/30 min-h-[100px] text-sm"
          maxLength={1000} data-testid="input-business-description" />
      </div>
    </div>
  );

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate("/account-settings")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider transition-colors"
          data-testid="button-back">
          <ChevronLeft className="w-3.5 h-3.5" /> {step > 0 ? "Back" : "Account Settings"}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-black text-xl">Business Setup</h1>
            <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
        </div>

        <ProgressBar step={step} total={STEPS.length} />

        <div className="bg-card rounded-2xl border border-border/20 p-5">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            className="flex-shrink-0 h-11 px-4 font-display text-xs tracking-wider rounded-xl border-border/30"
            data-testid="button-save-draft"
          >
            Save Draft
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !isStep0Valid}
              className="flex-1 h-11 font-display tracking-wider rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2"
              data-testid="button-next-step"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={() => existing?.companyName ? saveMutation.mutate() : setConfirmSubmitOpen(true)}
              disabled={saveMutation.isPending || !canSave}
              className="flex-1 h-11 font-display tracking-wider rounded-xl bg-primary text-primary-foreground"
              data-testid="button-save-business"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : existing?.companyName ? "UPDATE PROFILE" : "CREATE ACCOUNT"}
            </Button>
          )}
        </div>

        {/* Save and continue later */}
        <button
          onClick={() => { handleSaveDraft(); navigate("/biz/dashboard"); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors font-display tracking-wider py-1"
          data-testid="button-save-continue-later"
        >
          Save and continue later →
        </button>

        <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Convert to Business Account?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>This moves your account into the GUBER Business system.</p>
                  <p>Business accounts are for hiring workers, sponsoring cash drops, managing campaigns, and reviewing field work.</p>
                  <p className="font-medium text-foreground">This should be treated as permanent once approved.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-stay-personal-onboarding">Stay Personal</AlertDialogCancel>
              <AlertDialogAction data-testid="button-confirm-biz-create" onClick={() => saveMutation.mutate()}>
                Continue to Business Setup
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="rounded-xl border border-white/[0.06] bg-muted/10 p-4 space-y-2">
          <p className="text-[11px] font-display font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Shield className="w-3 h-3" /> What you get
          </p>
          {["Post bulk verification jobs via CSV upload", "Create custom inspection templates", "Business dashboard with stats + proof review", "Task tier pricing guidance for accurate budgets", "Downloadable GUBER Verification Reports"].map(item => (
            <div key={item} className="flex items-start gap-2">
              <span className="text-primary/50 mt-0.5">·</span>
              <p className="text-[11px] text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </GuberLayout>
  );
}
