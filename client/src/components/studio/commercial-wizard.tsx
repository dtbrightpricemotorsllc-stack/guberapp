// Commercial Builder form (task-549).
// Multi-step: vertical → photo → business info → preview → generate.
// Server composite: motion + music + optional voiceover. ~200 cr per ad.
//
// task-549: lifted out of the legacy Dialog wrapper. Now rendered as a full
// page at /studio/commercial.
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { isStoreBuild } from "@/lib/platform";
import {
  Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, Check, Download,
} from "lucide-react";
import {
  COMMERCIAL_VERTICALS, CUSTOM_VERTICAL, OPENAI_TTS_VOICES,
} from "@shared/commercial-verticals";

type StudioFile = { id: number; providerUrl: string; fileType: string };

const STEPS = ["vertical", "photo", "info", "preview"] as const;
type Step = typeof STEPS[number];

export function CommercialWizardForm({
  uploadedImages,
  onUpload,
  initialPrompt,
  uploadPending,
  credits,
  cost,
}: {
  uploadedImages: StudioFile[];
  onUpload: (file: File) => void;
  initialPrompt?: string;
  uploadPending: boolean;
  credits: number;
  cost: number;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("vertical");
  const [vertical, setVertical] = useState<string>("");
  const [customVertical, setCustomVertical] = useState("");
  const [productPhotoFileId, setProductPhotoFileId] = useState<number | null>(null);
  const [businessName, setBusinessName] = useState("");
  // initialPrompt arrives from /studio/explore "Recreate this" — seeds
  // the business description so the user lands with intent preserved.
  const [businessDescription, setBusinessDescription] = useState(initialPrompt ?? "");
  const [ctaText, setCtaText] = useState("Call today");
  const [voiceId, setVoiceId] = useState<string>("none");

  const insufficient = credits < cost;
  const allVerticals = [...COMMERCIAL_VERTICALS, CUSTOM_VERTICAL];
  const verticalObj = allVerticals.find((v) => v.slug === vertical) || null;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/commercial", {
        vertical,
        customVertical: vertical === "custom" ? customVertical.trim() : undefined,
        productPhotoFileId,
        businessName: businessName.trim(),
        businessDescription: businessDescription.trim(),
        ctaText: ctaText.trim(),
        voiceId: voiceId === "none" ? null : voiceId,
      });
      return res.json() as Promise<{ files: any[]; balance: number; voiceSkippedReason: string | null }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({
        title: "Commercial built",
        description: data.voiceSkippedReason
          ? `Motion + music are in your library. (Voiceover skipped: ${data.voiceSkippedReason})`
          : "Motion, music, and voiceover are in your library.",
      });
      navigate("/studio");
    },
    onError: async (err: any) => {
      let msg = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(msg);
      if (m) { try { const p = JSON.parse(m[1]); if (p?.message) msg = p.message; } catch {} }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Commercial failed", description: msg, variant: "destructive" });
    },
  });

  function next() {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  }
  function back() {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  }

  const canAdvance =
    step === "vertical" ? !!vertical && (vertical !== "custom" || customVertical.trim().length > 1)
    : step === "photo" ? !!productPhotoFileId
    : step === "info" ? businessName.trim().length > 0 && businessDescription.trim().length > 0 && ctaText.trim().length > 0
    : true;

  function downloadBrandKit() {
    const json = JSON.stringify({
      verticalSlug: vertical,
      customVertical: vertical === "custom" ? customVertical : null,
      businessName, businessDescription, ctaText, voiceId,
    }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${businessName || "brand"}-kit.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Per-vertical accent gradients so the picker feels cinematic instead
  // of a wall of identical dark squares (round-6 polish).
  const VERTICAL_GRADIENT: Record<string, string> = {
    "auto-repair": "from-orange-500/30 to-rose-600/20",
    restaurant: "from-amber-500/30 to-rose-500/20",
    fitness: "from-rose-500/30 to-fuchsia-600/20",
    "real-estate": "from-emerald-400/30 to-teal-600/20",
    "lawn-care": "from-lime-400/30 to-emerald-600/20",
    dental: "from-sky-400/25 to-cyan-500/20",
    plumbing: "from-blue-500/30 to-sky-600/20",
    "salon-beauty": "from-pink-400/30 to-fuchsia-500/20",
    "retail-boutique": "from-fuchsia-500/30 to-violet-600/20",
    photographer: "from-violet-500/30 to-purple-600/20",
    "coffee-shop": "from-amber-700/30 to-amber-500/20",
    "bar-nightlife": "from-purple-600/30 to-indigo-700/20",
    "law-firm": "from-slate-500/30 to-neutral-600/20",
    "medical-clinic": "from-cyan-400/25 to-emerald-500/20",
    "pet-grooming": "from-yellow-400/25 to-orange-500/20",
    construction: "from-amber-600/30 to-orange-700/20",
    "auto-dealer": "from-red-500/30 to-rose-700/20",
    moving: "from-orange-400/30 to-amber-600/20",
    cleaning: "from-cyan-400/25 to-blue-500/20",
    tutoring: "from-emerald-400/25 to-cyan-500/20",
    "real-estate-agent": "from-yellow-500/30 to-amber-700/20",
    "event-venue": "from-fuchsia-500/30 to-pink-600/20",
    "spa-wellness": "from-teal-400/25 to-emerald-500/20",
    "tech-saas": "from-indigo-500/30 to-violet-700/20",
    "non-profit": "from-emerald-400/25 to-teal-600/20",
    custom: "from-amber-300/30 to-yellow-500/20",
  };

  return (
    <div className="space-y-5" data-testid="form-commercial">
      {/* Step pills — replaces the small uppercase line. Reads like a
          progress meter so users feel the wizard is alive. */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const idx = STEPS.indexOf(step);
          const reached = i <= idx;
          return (
            <div key={s} className="flex-1 flex items-center gap-1.5">
              <div
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  reached
                    ? "bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400"
                    : "bg-white/10"
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
          Step {STEPS.indexOf(step) + 1} of {STEPS.length}
        </p>
        <p className="text-base sm:text-lg font-black tracking-tight mt-0.5">
          {step === "vertical" ? "Pick your vertical"
            : step === "photo" ? "Add a product photo"
            : step === "info" ? "Business info"
            : "Preview & generate"}
        </p>
      </div>

      {/* ── Step 1: vertical ────────────────────────────────────────── */}
      {step === "vertical" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {allVerticals.map((v) => {
              const selected = vertical === v.slug;
              const gradient = VERTICAL_GRADIENT[v.slug] ?? "from-white/10 to-white/5";
              return (
                <button
                  key={v.slug}
                  type="button"
                  onClick={() => setVertical(v.slug)}
                  className={`group relative p-3 rounded-2xl border text-center transition-all duration-200 overflow-hidden min-h-[88px] ${
                    selected
                      ? "border-emerald-400/80 ring-2 ring-emerald-400/40 shadow-[0_0_24px_rgba(52,211,153,0.35)] scale-[1.03]"
                      : "border-white/10 hover:border-white/25 hover:scale-[1.02]"
                  }`}
                  data-testid={`button-vertical-${v.slug}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_60%)]" />
                  <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700" />
                  <div className="relative">
                    <div className="text-2xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">{v.emoji}</div>
                    <div className="text-[10.5px] mt-1.5 leading-tight font-bold text-white/90">{v.label}</div>
                  </div>
                  {selected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3 text-black" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {vertical === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-vert" className="text-xs uppercase tracking-widest text-white/60">Your vertical</Label>
              <Input
                id="custom-vert"
                value={customVertical}
                onChange={(e) => setCustomVertical(e.target.value)}
                maxLength={40}
                placeholder="e.g. drone photography"
                className="bg-white/5 border-white/15 text-white"
                data-testid="input-custom-vertical"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: photo ───────────────────────────────────────────── */}
      {step === "photo" && (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
            data-testid="input-commercial-photo"
          />
          <div className="grid grid-cols-3 gap-2">
            {uploadedImages.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setProductPhotoFileId(img.id)}
                className={`aspect-square rounded-lg overflow-hidden border-2 ${productPhotoFileId === img.id ? "border-emerald-400" : "border-white/15"}`}
                data-testid={`button-commercial-photo-${img.id}`}
              >
                <img src={img.providerUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadPending}
              className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-white/40 disabled:opacity-50"
              data-testid="button-commercial-upload"
            >
              {uploadPending
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <><ImageIcon className="w-5 h-5 text-white/60" /><span className="text-[10px] text-white/60">Upload</span></>}
            </button>
          </div>
          <p className="text-[11px] text-white/50">A clear, well-lit product or hero photo gives the best ad.</p>
        </div>
      )}

      {/* ── Step 3: info ────────────────────────────────────────────── */}
      {step === "info" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="biz-name" className="text-xs uppercase tracking-widest text-white/60">Business name</Label>
            <Input id="biz-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={80} className="bg-white/5 border-white/15 text-white" data-testid="input-business-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-desc" className="text-xs uppercase tracking-widest text-white/60">Business description</Label>
            <Textarea id="biz-desc" value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} maxLength={400} rows={3} placeholder="What you do, who you serve, why you're different." className="bg-white/5 border-white/15 text-white placeholder:text-white/40" data-testid="textarea-business-description" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-cta" className="text-xs uppercase tracking-widest text-white/60">Call-to-action</Label>
            <Input id="biz-cta" value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={80} placeholder="Book today · 555-0100" className="bg-white/5 border-white/15 text-white" data-testid="input-cta-text" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-white/60">Voiceover (optional)</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger className="bg-white/5 border-white/15 text-white" data-testid="select-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No voiceover</SelectItem>
                {OPENAI_TTS_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── Step 4: preview ─────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 text-xs text-white/80">
            <div><span className="text-white/50">Vertical:</span> {verticalObj?.label}{vertical === "custom" && ` — ${customVertical}`}</div>
            <div><span className="text-white/50">Business:</span> {businessName}</div>
            <div><span className="text-white/50">CTA:</span> {ctaText}</div>
            <div><span className="text-white/50">Voiceover:</span> {voiceId === "none" ? "None" : OPENAI_TTS_VOICES.find((v) => v.id === voiceId)?.label}</div>
            <div><span className="text-white/50">Description:</span> <span className="text-white/70">{businessDescription}</span></div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
            Composite render: motion + music + optional voiceover. Music will retry once on failure; if it still fails your credits are fully refunded.
          </div>
          <button
            type="button"
            onClick={downloadBrandKit}
            className="w-full text-[11px] text-white/60 hover:text-white py-2 border border-white/10 rounded-lg flex items-center justify-center gap-1.5"
            data-testid="button-download-brand-kit"
          >
            <Download className="w-3 h-3" /> Save brand kit (.json) for re-use
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          variant="outline"
          onClick={step === "vertical" ? () => navigate("/studio") : back}
          className="border-white/15 bg-transparent text-white hover:bg-white/5"
          data-testid="button-commercial-back"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> {step === "vertical" ? "Cancel" : "Back"}
        </Button>
        {step !== "preview" ? (
          <Button
            disabled={!canAdvance}
            onClick={next}
            className="bg-emerald-400 text-black hover:bg-emerald-300"
            data-testid="button-commercial-next"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            disabled={insufficient || generate.isPending}
            onClick={() => generate.mutate()}
            className="bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 text-black font-black hover:opacity-90"
            data-testid="button-commercial-generate"
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
            {isStoreBuild ? "Generate" : (insufficient ? `Need ${cost} cr` : `Generate · ${cost} cr`)}
          </Button>
        )}
      </div>
    </div>
  );
}
