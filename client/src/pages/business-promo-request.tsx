// GUBER Promotion Request Form — /business/promotion
// Public, no auth required. 3-step form with Cloudinary uploads.

import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Megaphone, CheckCircle2, Loader2, ChevronRight,
  Upload, X, Image as ImageIcon,
} from "lucide-react";
import { GuberLogo } from "@/components/guber-logo";

const PURPLE = "#a855f7";
const TEAL   = "#00E5E5";
const GREEN  = "#00e576";

const CAMPAIGN_TYPES = [
  "Business Spotlight", "Social Media Campaign", "Cash Drop Sponsorship",
  "Treasure Hunt", "Grand Opening", "Local Activation / Event",
  "App Feature / Push Notification", "Brand Partnership", "Custom Campaign",
];

const BUDGET_RANGES = [
  "Under $500", "$500 – $2,000", "$2,000 – $5,000",
  "$5,000 – $15,000", "$15,000+", "Not sure",
];

// Upload a single image via our server-side proxy (server validates size + MIME, then stores to Cloudinary).
// Client pre-checks size for a fast UX error; server enforces it unconditionally.
const BIZ_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const BIZ_ASSET_ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

async function uploadBizAsset(file: File, onProgress?: (p: number) => void): Promise<string> {
  if (file.size > BIZ_ASSET_MAX_BYTES) {
    throw new Error(`File too large — max ${Math.round(BIZ_ASSET_MAX_BYTES / 1024 / 1024)} MB`);
  }
  if (!BIZ_ASSET_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Only image files are allowed (jpg, png, gif, webp)");
  }
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve((JSON.parse(xhr.responseText) as { url: string }).url); }
        catch { reject(new Error("Upload returned invalid response")); }
      } else {
        const msg = (() => { try { return (JSON.parse(xhr.responseText) as { error?: string }).error; } catch { return null; } })();
        if (xhr.status === 413) reject(new Error("File too large — max 8 MB"));
        else reject(new Error(msg || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("POST", "/api/public/upload/biz-asset");
    xhr.send(fd);
  });
}

type UploadState = { url: string | null; uploading: boolean; progress: number; error: string | null };
const initUpload = (): UploadState => ({ url: null, uploading: false, progress: 0, error: null });

export default function BusinessPromoRequest() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("");
  const logoRef  = useRef<HTMLInputElement>(null);
  const promoRef = useRef<HTMLInputElement>(null);
  const [logoUpload, setLogoUpload]   = useState<UploadState>(initUpload);
  const [promoUpload, setPromoUpload] = useState<UploadState>(initUpload);

  const [form, setForm] = useState({
    businessName: "", contactName: "", phone: "", email: "", website: "",
    campaignGoal: "", campaignType: "", desiredStartDate: "", targetCity: "",
    desiredCustomerAction: "", budgetRange: "", additionalDetails: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("source") || params.get("utm_source") || "";
    if (src) setSource(src.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "-").slice(0, 80));
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const step1Valid = form.businessName.trim() && form.contactName.trim() && form.phone.trim() && form.email.trim() && form.campaignGoal.trim();
  const step2Valid = form.campaignType && form.budgetRange;
  const canSubmit = step1Valid && step2Valid;

  async function handleUpload(
    file: File,
    setter: React.Dispatch<React.SetStateAction<UploadState>>,
  ) {
    setter({ url: null, uploading: true, progress: 0, error: null });
    try {
      const url = await uploadBizAsset(file, (p) => setter(s => ({ ...s, progress: p })));
      setter({ url, uploading: false, progress: 100, error: null });
    } catch (err: any) {
      setter({ url: null, uploading: false, progress: 0, error: err.message });
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/promotion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          logoUrl:       logoUpload.url  || undefined,
          promoImageUrl: promoUpload.url || undefined,
          source:        source || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast({ title: "Submission Failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-16" data-testid="page-promo-success">
        <div className="relative z-10 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(0,229,229,0.15)", border: "1.5px solid rgba(0,229,229,0.35)" }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: TEAL }} />
          </div>
          <div className="mx-auto mb-6 w-fit"><GuberLogo size="md" /></div>
          <h1 className="text-2xl font-display font-black tracking-wider mb-3">
            Promotion Request Received
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            A Guber Global representative will review your campaign brief and reach out within 1–2 business days.
          </p>
          <div className="flex flex-col gap-3 max-w-sm mx-auto">
            <Link href="/business"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm font-bold transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${TEAL}, #0099aa)`, color: "#000" }}>
              ← BACK TO BUSINESS HUB
            </Link>
            <a href="tel:3364841536"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.12em] text-sm transition-all active:scale-95"
              style={{ background: "rgba(0,229,229,0.08)", border: `1px solid rgba(0,229,229,0.25)`, color: TEAL }}>
              CALL (336) 484-1536
            </a>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((step - 1) / 2) * 100;

  return (
    <div className="min-h-screen bg-background" data-testid="page-promo-request">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/3 w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: `radial-gradient(circle, ${TEAL}, transparent 60%)` }} />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-5 py-10">
        <Link href="/business"
          className="inline-flex items-center gap-1.5 text-xs font-display tracking-wider mb-8 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-back">
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO BUSINESS HUB
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-fit"><GuberLogo size="sm" /></div>
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "rgba(0,229,229,0.1)", border: "1px solid rgba(0,229,229,0.25)", color: TEAL }}>
            <Megaphone className="w-3 h-3" /> PROMOTION REQUEST
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-2">
            Request a Promotion
          </h1>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-sm mx-auto">
            Tell us what result you want. Guber Global LLC will recommend the right promotional approach.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-[10px] font-display tracking-widest text-muted-foreground mb-2">
            <span style={{ color: step >= 1 ? TEAL : undefined }}>STEP 1</span>
            <span style={{ color: step >= 2 ? TEAL : undefined }}>STEP 2</span>
            <span style={{ color: step >= 3 ? TEAL : undefined }}>STEP 3</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${step === 1 ? 33 : step === 2 ? 66 : 100}%`, background: `linear-gradient(90deg, ${TEAL}, ${PURPLE})` }} />
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${TEAL}, ${PURPLE}, transparent)` }} />

          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            {/* ── STEP 1: Campaign Basics ── */}
            {step === 1 && (
              <div className="space-y-4" data-testid="step-1">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">Campaign Basics</h2>
                  <p className="text-xs text-muted-foreground">Tell us about your business and what you want to accomplish.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="BUSINESS NAME *">
                    <Input value={form.businessName} onChange={set("businessName")} placeholder="Your business name" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-business-name" />
                  </Field>
                  <Field label="CONTACT NAME *">
                    <Input value={form.contactName} onChange={set("contactName")} placeholder="Your full name" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-contact-name" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="PHONE *">
                    <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-phone" />
                  </Field>
                  <Field label="EMAIL *">
                    <Input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-email" />
                  </Field>
                </div>
                <Field label="WEBSITE (OPTIONAL)">
                  <Input type="url" value={form.website} onChange={set("website")} placeholder="https://yourbusiness.com" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-website" />
                </Field>
                <Field label="CAMPAIGN GOAL *">
                  <Textarea value={form.campaignGoal} onChange={set("campaignGoal")} placeholder="What result do you want from this campaign? e.g. Get 100 new customers in our first month, drive foot traffic for our grand opening, promote our app launch..." className="rounded-xl text-sm border-0 min-h-[100px]" style={{ background: "hsl(var(--muted))" }} maxLength={2000} data-testid="input-campaign-goal" />
                </Field>
                <Button type="button" disabled={!step1Valid} onClick={() => setStep(2)} className="w-full h-12 font-display text-[11px] tracking-[0.2em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${TEAL}, ${PURPLE})`, color: "#000" }} data-testid="btn-next-step-2">
                  NEXT: CAMPAIGN DETAILS <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* ── STEP 2: Campaign Details ── */}
            {step === 2 && (
              <div className="space-y-4" data-testid="step-2">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">Campaign Details</h2>
                  <p className="text-xs text-muted-foreground">Help us understand the scope and goals of your campaign.</p>
                </div>
                <Field label="CAMPAIGN TYPE *">
                  <Select value={form.campaignType} onValueChange={v => setForm(f => ({ ...f, campaignType: v }))}>
                    <SelectTrigger className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="select-campaign-type">
                      <SelectValue placeholder="Select campaign type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="DESIRED START DATE (OPTIONAL)">
                    <Input type="date" value={form.desiredStartDate} onChange={set("desiredStartDate")} className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-start-date" />
                  </Field>
                  <Field label="TARGET CITY / AREA (OPTIONAL)">
                    <Input value={form.targetCity} onChange={set("targetCity")} placeholder="e.g. Charlotte, NC" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="input-target-city" />
                  </Field>
                </div>
                <Field label="DESIRED CUSTOMER ACTION (OPTIONAL)">
                  <Input value={form.desiredCustomerAction} onChange={set("desiredCustomerAction")} placeholder="e.g. Visit our store, scan a QR code, download the app, share on social media..." className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} maxLength={500} data-testid="input-customer-action" />
                </Field>
                <Field label="BUDGET RANGE *">
                  <Select value={form.budgetRange} onValueChange={v => setForm(f => ({ ...f, budgetRange: v }))}>
                    <SelectTrigger className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="select-budget">
                      <SelectValue placeholder="Select budget range" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_RANGES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-white/10">
                    ← BACK
                  </Button>
                  <Button type="button" disabled={!step2Valid} onClick={() => setStep(3)} className="flex-1 h-11 font-display text-[11px] tracking-[0.18em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${TEAL}, ${PURPLE})`, color: "#000" }} data-testid="btn-next-step-3">
                    NEXT: ASSETS <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Assets & Submit ── */}
            {step === 3 && (
              <div className="space-y-5" data-testid="step-3">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">Assets &amp; Details</h2>
                  <p className="text-xs text-muted-foreground">Upload your logo and a campaign image, then tell us anything else we should know.</p>
                </div>

                {/* Logo upload */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    BUSINESS LOGO (OPTIONAL)
                  </Label>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" data-testid="input-logo-file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setLogoUpload); }} />
                  <AssetUploadBox
                    upload={logoUpload}
                    label="Upload Logo"
                    onPick={() => logoRef.current?.click()}
                    onClear={() => setLogoUpload(initUpload())}
                    color={TEAL}
                    testId="logo-upload-box"
                  />
                </div>

                {/* Promo image upload */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    PROMO / CAMPAIGN IMAGE (OPTIONAL)
                  </Label>
                  <input ref={promoRef} type="file" accept="image/*" className="hidden" data-testid="input-promo-file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setPromoUpload); }} />
                  <AssetUploadBox
                    upload={promoUpload}
                    label="Upload Campaign Image"
                    onPick={() => promoRef.current?.click()}
                    onClear={() => setPromoUpload(initUpload())}
                    color={PURPLE}
                    testId="promo-upload-box"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    ADDITIONAL DETAILS (OPTIONAL)
                  </Label>
                  <Textarea value={form.additionalDetails} onChange={set("additionalDetails")} placeholder="Anything else about your business, audience, past campaigns, or specific requirements..." className="rounded-xl text-sm border-0 min-h-[80px]" style={{ background: "hsl(var(--muted))" }} maxLength={2000} data-testid="input-additional-details" />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-white/10">
                    ← BACK
                  </Button>
                  <Button type="submit" disabled={loading || !canSubmit || logoUpload.uploading || promoUpload.uploading} className="flex-1 h-11 font-display text-[11px] tracking-[0.18em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${TEAL}, ${PURPLE})`, color: "#000" }} data-testid="btn-submit">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>SUBMIT REQUEST <ChevronRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">
                  No account required. A Guber Global representative will contact you within 1–2 business days.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function AssetUploadBox({
  upload, label, onPick, onClear, color, testId,
}: {
  upload: UploadState;
  label: string;
  onPick: () => void;
  onClear: () => void;
  color: string;
  testId?: string;
}) {
  if (upload.url) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "hsl(var(--muted))" }} data-testid={testId}>
        <img src={upload.url} alt="uploaded" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">Uploaded successfully</p>
          <p className="text-[10px] text-muted-foreground truncate">{upload.url.split("/").pop()}</p>
        </div>
        <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  if (upload.uploading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "hsl(var(--muted))" }} data-testid={testId}>
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color }} />
        <div className="flex-1">
          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${upload.progress}%`, background: color }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Uploading… {upload.progress}%</p>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onPick}
      className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl transition-all hover:opacity-80 active:scale-[0.99]"
      style={{ background: `${color}08`, border: `1.5px dashed ${color}40` }} data-testid={testId}>
      <ImageIcon className="w-6 h-6" style={{ color }} />
      <p className="text-xs font-display tracking-wider" style={{ color }}>{label}</p>
      {upload.error && <p className="text-[10px] text-red-400">{upload.error}</p>}
    </button>
  );
}
