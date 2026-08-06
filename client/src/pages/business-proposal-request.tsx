// GUBER Digital Proposal Request Form — /business/proposal
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
  ArrowLeft, Cpu, CheckCircle2, Loader2, ChevronRight,
  Upload, X, Image as ImageIcon, FileText,
} from "lucide-react";
import { GuberLogo } from "@/components/guber-logo";

const PURPLE = "#a855f7";
const TEAL   = "#00E5E5";
const GREEN  = "#00e576";

const PROJECT_TYPES = [
  "Mobile App (iOS/Android)", "Web App / Portal", "Business Website",
  "E-Commerce Store", "AI Assistant / Chatbot", "Booking / Scheduling System",
  "Customer Portal", "Automation / Integration", "Point of Sale System",
  "Custom Digital Solution",
];

const BUDGET_RANGES = [
  "Under $1,000", "$1,000 – $5,000", "$5,000 – $15,000",
  "$15,000 – $50,000", "$50,000+", "Not sure",
];

const TIMELINES = [
  "ASAP (within 30 days)", "1–3 months", "3–6 months",
  "6–12 months", "No specific deadline",
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

type UploadSlot = { url: string; name: string };
type MultiUpload = { slots: UploadSlot[]; uploading: boolean; progress: number; error: string | null };
const initMulti = (): MultiUpload => ({ slots: [], uploading: false, progress: 0, error: null });

export default function BusinessProposalRequest() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("");
  const screenshotRef = useRef<HTMLInputElement>(null);
  const [screenshots, setScreenshots] = useState<MultiUpload>(initMulti());

  const [form, setForm] = useState({
    businessName: "", contactName: "", phone: "", email: "",
    whatBusinessDoes: "", projectType: "", problemToSolve: "",
    intendedUsers: "", desiredFeatures: "", websitesTheyLike: "",
    budgetRange: "", desiredTimeline: "", additionalNotes: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("source") || params.get("utm_source") || "";
    if (src) setSource(src.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "-").slice(0, 80));
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const step1Valid = form.businessName.trim() && form.contactName.trim() && form.phone.trim() && form.email.trim() && form.whatBusinessDoes.trim() && form.projectType;
  const step2Valid = form.problemToSolve.trim() && form.desiredFeatures.trim() && form.budgetRange;
  const canSubmit = step1Valid && step2Valid;

  async function handleScreenshotUpload(file: File) {
    if (screenshots.slots.length >= 3) return;
    setScreenshots(s => ({ ...s, uploading: true, progress: 0, error: null }));
    try {
      const url = await uploadBizAsset(file, (p) => setScreenshots(s => ({ ...s, progress: p })));
      setScreenshots(s => ({
        ...s, uploading: false, progress: 100,
        slots: [...s.slots, { url, name: file.name }],
      }));
    } catch (err: any) {
      setScreenshots(s => ({ ...s, uploading: false, progress: 0, error: err.message }));
    }
  }

  function removeScreenshot(i: number) {
    setScreenshots(s => ({ ...s, slots: s.slots.filter((_, idx) => idx !== i) }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/digital-proposal-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          screenshotUrls: screenshots.slots.map(s => s.url),
          documentUrls:   [],
          source:          source || undefined,
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-16" data-testid="page-proposal-success">
        <div className="relative z-10 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.35)" }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: GREEN }} />
          </div>
          <div className="mx-auto mb-6 w-fit"><GuberLogo size="md" /></div>
          <h1 className="text-2xl font-display font-black tracking-wider mb-3">
            Digital Proposal Received
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            A Guber Global representative will review your project brief and reach out within 1–2 business days to discuss scope and next steps.
          </p>
          <div className="flex flex-col gap-3 max-w-sm mx-auto">
            <Link href="/business"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.15em] text-sm font-bold transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${GREEN}, #009944)`, color: "#000" }}>
              ← BACK TO BUSINESS HUB
            </Link>
            <a href="https://isellapps.store" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-display tracking-[0.12em] text-sm transition-all active:scale-95"
              style={{ background: "rgba(0,229,118,0.08)", border: `1px solid rgba(0,229,118,0.25)`, color: GREEN }}>
              VIEW APP DEMOS →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-proposal-request">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: `radial-gradient(circle, ${GREEN}, transparent 60%)` }} />
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
            style={{ background: "rgba(0,229,118,0.1)", border: "1px solid rgba(0,229,118,0.25)", color: GREEN }}>
            <Cpu className="w-3 h-3" /> DIGITAL PROPOSAL REQUEST
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black tracking-wider mb-2">
            Request a Digital Proposal
          </h1>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-sm mx-auto">
            No technical knowledge required. Tell us what you want to accomplish, and Guber Global LLC will recommend the right solution.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-[10px] font-display tracking-widest text-muted-foreground mb-2">
            <span style={{ color: step >= 1 ? GREEN : undefined }}>STEP 1</span>
            <span style={{ color: step >= 2 ? GREEN : undefined }}>STEP 2</span>
            <span style={{ color: step >= 3 ? GREEN : undefined }}>STEP 3</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${step === 1 ? 33 : step === 2 ? 66 : 100}%`, background: `linear-gradient(90deg, ${GREEN}, ${PURPLE})` }} />
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${GREEN}, ${PURPLE}, transparent)` }} />

          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            {/* ── STEP 1: About Your Business ── */}
            {step === 1 && (
              <div className="space-y-4" data-testid="step-1">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">About Your Business</h2>
                  <p className="text-xs text-muted-foreground">Tell us about yourself and what kind of digital project you need.</p>
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
                <Field label="WHAT DOES YOUR BUSINESS DO? *">
                  <Textarea value={form.whatBusinessDoes} onChange={set("whatBusinessDoes")} placeholder="Briefly describe your business, services, products, and how you currently serve customers..." className="rounded-xl text-sm border-0 min-h-[90px]" style={{ background: "hsl(var(--muted))" }} maxLength={2000} data-testid="input-what-business-does" />
                </Field>
                <Field label="PROJECT TYPE *">
                  <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
                    <SelectTrigger className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="select-project-type">
                      <SelectValue placeholder="What do you want built?" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="button" disabled={!step1Valid} onClick={() => setStep(2)} className="w-full h-12 font-display text-[11px] tracking-[0.2em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${GREEN}, ${PURPLE})`, color: "#000" }} data-testid="btn-next-step-2">
                  NEXT: PROJECT DETAILS <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* ── STEP 2: Project Details ── */}
            {step === 2 && (
              <div className="space-y-4" data-testid="step-2">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">Project Details</h2>
                  <p className="text-xs text-muted-foreground">No technical knowledge needed — describe what you want to accomplish.</p>
                </div>
                <Field label="PROBLEM TO SOLVE *">
                  <Textarea value={form.problemToSolve} onChange={set("problemToSolve")} placeholder="What problem does this project solve? What pain point are you addressing? e.g. Customers can't book appointments online, we lose track of orders, staff waste time on manual tasks..." className="rounded-xl text-sm border-0 min-h-[100px]" style={{ background: "hsl(var(--muted))" }} maxLength={2000} data-testid="input-problem" />
                </Field>
                <Field label="DESIRED FEATURES *">
                  <Textarea value={form.desiredFeatures} onChange={set("desiredFeatures")} placeholder="What do you want the app/site to do? List the most important features. e.g. Online booking calendar, payment processing, staff schedule, customer login, push notifications..." className="rounded-xl text-sm border-0 min-h-[100px]" style={{ background: "hsl(var(--muted))" }} maxLength={3000} data-testid="input-features" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="INTENDED USERS (OPTIONAL)">
                    <Input value={form.intendedUsers} onChange={set("intendedUsers")} placeholder="e.g. Customers, internal staff, both" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} maxLength={500} data-testid="input-users" />
                  </Field>
                  <Field label="APPS/SITES YOU LIKE (OPTIONAL)">
                    <Input value={form.websitesTheyLike} onChange={set("websitesTheyLike")} placeholder="e.g. Uber Eats, Square, Calendly" className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} maxLength={500} data-testid="input-websites-like" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="BUDGET RANGE *">
                    <Select value={form.budgetRange} onValueChange={v => setForm(f => ({ ...f, budgetRange: v }))}>
                      <SelectTrigger className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="select-budget">
                        <SelectValue placeholder="Select budget" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUDGET_RANGES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="DESIRED TIMELINE (OPTIONAL)">
                    <Select value={form.desiredTimeline} onValueChange={v => setForm(f => ({ ...f, desiredTimeline: v }))}>
                      <SelectTrigger className="rounded-xl h-11 text-sm border-0" style={{ background: "hsl(var(--muted))" }} data-testid="select-timeline">
                        <SelectValue placeholder="Select timeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMELINES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-white/10">
                    ← BACK
                  </Button>
                  <Button type="button" disabled={!step2Valid} onClick={() => setStep(3)} className="flex-1 h-11 font-display text-[11px] tracking-[0.18em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${GREEN}, ${PURPLE})`, color: "#000" }} data-testid="btn-next-step-3">
                    NEXT: ASSETS <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Assets & Notes ── */}
            {step === 3 && (
              <div className="space-y-5" data-testid="step-3">
                <div className="mb-5">
                  <h2 className="text-base font-display font-black tracking-wide mb-1">Assets &amp; Notes</h2>
                  <p className="text-xs text-muted-foreground">Upload any screenshots or reference images (up to 3), then add any final notes.</p>
                </div>

                {/* Screenshot uploads */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    REFERENCE SCREENSHOTS (OPTIONAL — UP TO 3)
                  </Label>
                  <input ref={screenshotRef} type="file" accept="image/*" className="hidden"
                    data-testid="input-screenshot-file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshotUpload(f); e.target.value = ""; }} />
                  <div className="space-y-2" data-testid="screenshot-upload-area">
                    {screenshots.slots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "hsl(var(--muted))" }}>
                        <img src={slot.url} alt={`screenshot-${i}`} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{slot.name}</p>
                          <p className="text-[10px] text-muted-foreground">Uploaded</p>
                        </div>
                        <button type="button" onClick={() => removeScreenshot(i)} className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {screenshots.uploading && (
                      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "hsl(var(--muted))" }}>
                        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: GREEN }} />
                        <div className="flex-1">
                          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${screenshots.progress}%`, background: GREEN }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">Uploading… {screenshots.progress}%</p>
                        </div>
                      </div>
                    )}
                    {screenshots.slots.length < 3 && !screenshots.uploading && (
                      <button type="button" onClick={() => screenshotRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl transition-all hover:opacity-80"
                        style={{ background: `${GREEN}08`, border: `1.5px dashed ${GREEN}40` }}
                        data-testid="btn-add-screenshot">
                        <ImageIcon className="w-4 h-4" style={{ color: GREEN }} />
                        <span className="text-xs font-display tracking-wider" style={{ color: GREEN }}>
                          {screenshots.slots.length === 0 ? "Upload Screenshot or Reference Image" : "Add Another Screenshot"}
                        </span>
                      </button>
                    )}
                    {screenshots.error && <p className="text-[10px] text-red-400">{screenshots.error}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-display tracking-[0.12em] uppercase text-muted-foreground">
                    ADDITIONAL NOTES (OPTIONAL)
                  </Label>
                  <Textarea value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Anything else we should know — existing software you use, integrations needed, branding guidelines, special requirements..." className="rounded-xl text-sm border-0 min-h-[80px]" style={{ background: "hsl(var(--muted))" }} maxLength={2000} data-testid="input-additional-notes" />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-11 rounded-xl text-xs font-display tracking-wider border-white/10">
                    ← BACK
                  </Button>
                  <Button type="submit" disabled={loading || !canSubmit || screenshots.uploading} className="flex-1 h-11 font-display text-[11px] tracking-[0.18em] rounded-xl font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${GREEN}, ${PURPLE})`, color: "#000" }} data-testid="btn-submit">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>SUBMIT PROPOSAL <ChevronRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">
                  No account required. A Guber Global representative will reach out within 1–2 business days.
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
