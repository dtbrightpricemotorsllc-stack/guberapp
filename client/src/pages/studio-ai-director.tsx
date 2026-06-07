// /studio/ai-director — GUBER AI Director
// User picks a category + fills a brief → server generates 2 clips,
// music, and voiceover, assembles via FFmpeg, and returns a finished
// commercial MP4. No editing required on the user's end.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Clapperboard, CheckCircle2, Download, ChevronLeft,
  Tv2, Car, Sparkles, Truck, Camera, Dumbbell, UtensilsCrossed,
  Briefcase, Music, Mic2, Film, Play,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type DirectorCategory =
  | "home_services" | "auto" | "beauty" | "moving"
  | "events" | "fitness" | "food" | "general";

type DirectorJobStatus =
  | "pending" | "generating_clips" | "generating_audio"
  | "assembling" | "uploading" | "complete" | "failed";

type DirectorJobPoll = {
  jobId: string;
  status: DirectorJobStatus;
  stage: string;
  outputUrl?: string;
  error?: string;
};

type StudioMe = { credits: number };

// ── Config ─────────────────────────────────────────────────────────────────────
const COST = 200;

const CATEGORIES: Array<{
  id: DirectorCategory;
  label: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  color: string;
}> = [
  {
    id: "home_services", label: "Home Services", emoji: "🏠",
    icon: Tv2, blurb: "Cleaning, repairs, landscaping, HVAC…",
    color: "from-emerald-500/20 to-teal-600/20 border-emerald-500/30",
  },
  {
    id: "auto", label: "Auto Services", emoji: "🚗",
    icon: Car, blurb: "Detailing, mobile mechanic, towing…",
    color: "from-sky-500/20 to-blue-600/20 border-sky-500/30",
  },
  {
    id: "beauty", label: "Beauty & Grooming", emoji: "✂️",
    icon: Sparkles, blurb: "Barber, hair, nails, lashes…",
    color: "from-pink-500/20 to-rose-600/20 border-pink-500/30",
  },
  {
    id: "moving", label: "Moving & Delivery", emoji: "📦",
    icon: Truck, blurb: "Local moving, courier, same-day…",
    color: "from-amber-500/20 to-orange-600/20 border-amber-500/30",
  },
  {
    id: "events", label: "Events & Photography", emoji: "🎉",
    icon: Camera, blurb: "Event staff, DJ, photography…",
    color: "from-violet-500/20 to-purple-600/20 border-violet-500/30",
  },
  {
    id: "fitness", label: "Fitness & Wellness", emoji: "💪",
    icon: Dumbbell, blurb: "Personal training, massage, yoga…",
    color: "from-orange-500/20 to-red-600/20 border-orange-500/30",
  },
  {
    id: "food", label: "Food & Catering", emoji: "🍽️",
    icon: UtensilsCrossed, blurb: "Personal chef, catering, meal prep…",
    color: "from-lime-500/20 to-green-600/20 border-lime-500/30",
  },
  {
    id: "general", label: "General Business", emoji: "💼",
    icon: Briefcase, blurb: "Any service or trade…",
    color: "from-neutral-500/20 to-neutral-600/20 border-neutral-500/30",
  },
];

// ── Stage UI config ────────────────────────────────────────────────────────────
const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  generating_clips: Film,
  generating_audio: Music,
  assembling: Clapperboard,
  uploading: Loader2,
  pending: Loader2,
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function StudioAiDirectorPage() {
  const { toast } = useToast();

  const [step, setStep] = useState<"category" | "brief" | "review" | "generating" | "result">("category");
  const [category, setCategory] = useState<DirectorCategory | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const credits = meQuery.data?.credits ?? 0;
  const insufficient = credits < COST;

  // ── Polling when generating ──────────────────────────────────────────────────
  const pollQuery = useQuery<DirectorJobPoll>({
    queryKey: ["/api/studio/director/jobs", jobId],
    enabled: !!jobId && step === "generating",
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 5000;
      if (d.status === "complete" || d.status === "failed") return false;
      return 5000;
    },
  });

  // Transition to result when job completes
  const polled = pollQuery.data;
  if (polled?.status === "complete" && step === "generating" && polled.outputUrl) {
    setOutputUrl(polled.outputUrl);
    setStep("result");
  }
  if (polled?.status === "failed" && step === "generating") {
    toast({
      title: "Generation failed",
      description: polled.error || "Your credits were returned.",
      variant: "destructive",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
    setStep("review");
    setJobId(null);
  }

  // ── Generate mutation ──────────────────────────────────────────────────────
  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/ai-director", {
        category, businessName: businessName.trim(),
        tagline: tagline.trim(), description: description.trim(),
        cta: cta.trim(),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "Failed to start generation");
      }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      setJobId(data.jobId);
      setStep("generating");
    },
    onError: (e: Error) =>
      toast({ title: "Could not start generation", description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    setStep("category");
    setCategory(null);
    setBusinessName("");
    setTagline("");
    setDescription("");
    setCta("");
    setJobId(null);
    setOutputUrl(null);
    queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
  };

  const selectedCat = CATEGORIES.find((c) => c.id === category);

  // ── Step: Category ───────────────────────────────────────────────────────────
  if (step === "category") {
    return (
      <StudioToolPageShell
        title="AI Director"
        subtitle="Pick your category — the Director handles clips, music, voiceover, and final assembly. A complete commercial, no editing required."
        iconAccent="from-[#39FF14] to-emerald-600"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Clapperboard className="w-4 h-4 text-[#39FF14]" />
            <p className="text-sm font-bold text-white/80">What kind of business is this for?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setCategory(cat.id); setStep("brief"); }}
                  className={`rounded-2xl border bg-gradient-to-br p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${cat.color}`}
                  data-testid={`btn-category-${cat.id}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">{cat.emoji}</span>
                    <Icon className="w-3.5 h-3.5 text-white/60" />
                  </div>
                  <p className="font-bold text-sm leading-tight">{cat.label}</p>
                  <p className="text-[11px] text-white/50 mt-0.5 leading-tight">{cat.blurb}</p>
                </button>
              );
            })}
          </div>

          {/* What you get */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 space-y-2.5 mt-2">
            <p className="text-xs font-bold text-[#39FF14] uppercase tracking-widest">What AI Director creates</p>
            {[
              [Film, "2 AI-generated video scenes from your brief"],
              [Music, "Custom music track matched to your category"],
              [Mic2, "Professional voiceover reading your key message"],
              [Play, "Assembled, finished MP4 — ready to post"],
            ].map(([Icon, label]: any) => (
              <div key={label} className="flex items-center gap-2.5">
                <Icon className="w-3.5 h-3.5 text-white/40 shrink-0" />
                <p className="text-xs text-white/60">{label}</p>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2.5 flex items-center justify-between">
              <span className="text-xs text-white/40">Credit cost</span>
              <span className="font-black text-sm text-white">{COST} credits</span>
            </div>
          </div>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Brief ──────────────────────────────────────────────────────────────
  if (step === "brief") {
    const canContinue = businessName.trim().length > 0 && tagline.trim().length > 0;
    return (
      <StudioToolPageShell
        title="AI Director"
        subtitle="Tell the Director about your business — this becomes the creative brief."
        iconAccent="from-[#39FF14] to-emerald-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setStep("category")}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
            data-testid="btn-back-category"
          >
            <ChevronLeft className="w-4 h-4" />
            {selectedCat?.label}
          </button>

          {/* Category badge */}
          <div className={`inline-flex items-center gap-2 rounded-xl border bg-gradient-to-br px-3 py-2 ${selectedCat?.color}`}>
            <span>{selectedCat?.emoji}</span>
            <span className="text-sm font-bold">{selectedCat?.label}</span>
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Business or your name <span className="text-red-400">*</span></p>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={50}
              placeholder='e.g. "Elite Mobile Detailing" or "Marcus Johnson"'
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              data-testid="input-business-name"
            />
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Tagline or key message <span className="text-red-400">*</span></p>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={70}
              placeholder='e.g. "Fast. Reliable. Local." or "Book same-day."'
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              data-testid="input-tagline"
            />
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
              What you do <span className="text-white/25 normal-case">(optional — adds detail to scenes)</span>
            </p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder='e.g. "Mobile car detailing, available 7 days a week across Miami."'
              className="rounded-xl bg-background/50 border-border/50 text-sm resize-none"
              data-testid="textarea-description"
            />
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
              Call to action <span className="text-white/25 normal-case">(optional — default: "Call us today")</span>
            </p>
            <Input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              maxLength={60}
              placeholder='e.g. "Book now at guberapp.com" or "DM us to schedule"'
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              data-testid="input-cta"
            />
          </div>

          <Button
            onClick={() => setStep("review")}
            disabled={!canContinue}
            className="w-full bg-[#39FF14] hover:bg-[#2de010] text-black font-black h-12 text-base"
            data-testid="btn-next-review"
          >
            Preview & Generate →
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Review ─────────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <StudioToolPageShell
        title="AI Director"
        subtitle="Review your brief, then the Director takes it from here."
        iconAccent="from-[#39FF14] to-emerald-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setStep("brief")}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
            data-testid="btn-back-brief"
          >
            <ChevronLeft className="w-4 h-4" /> Edit brief
          </button>

          {/* Brief summary */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 space-y-4">
            <div className={`inline-flex items-center gap-2 rounded-xl border bg-gradient-to-br px-3 py-1.5 ${selectedCat?.color}`}>
              <span>{selectedCat?.emoji}</span>
              <span className="text-xs font-bold">{selectedCat?.label}</span>
            </div>

            <div>
              <p className="text-xl font-black leading-tight">{businessName}</p>
              <p className="text-[#39FF14] font-medium mt-1 text-sm italic">"{tagline}"</p>
            </div>

            {description && (
              <p className="text-xs text-white/50 border-t border-white/10 pt-3 leading-relaxed">{description}</p>
            )}

            <div className="border-t border-white/10 pt-3 space-y-1.5">
              {[
                [Film, "2 AI scenes matched to your category"],
                [Music, "Music composed for " + selectedCat?.label],
                [Mic2, "Voiceover: " + [businessName, tagline, cta || "Call us today"].filter(Boolean).join(" • ")],
                [Clapperboard, "FFmpeg assembly → finished MP4"],
              ].map(([Icon, label]: any) => (
                <div key={label} className="flex items-center gap-2 text-xs text-white/50">
                  <Icon className="w-3.5 h-3.5 text-white/30 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost + generate */}
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
            <span className="text-sm text-white/60">Credit cost</span>
            <span className="font-black text-base" data-testid="text-cost">{COST} cr</span>
          </div>

          {insufficient && (
            <p className="text-xs text-red-400 text-center" data-testid="text-insufficient">
              You need {COST} credits — you have {credits}. <a href="/studio/credits" className="underline">Get more →</a>
            </p>
          )}

          <div className="rounded-xl bg-black/40 border border-[#39FF14]/20 p-3">
            <p className="text-xs text-white/50 text-center leading-relaxed">
              Generation takes <strong className="text-white">3–5 minutes</strong>. The Director generates scenes, composes music,
              records voiceover, and assembles the final video automatically.
            </p>
          </div>

          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || insufficient}
            className="w-full bg-[#39FF14] hover:bg-[#2de010] text-black font-black h-12 text-base"
            data-testid="btn-generate"
          >
            {generate.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting…</>
            ) : (
              `🎬 Direct my commercial — ${COST} credits`
            )}
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Generating (polling) ────────────────────────────────────────────────
  if (step === "generating") {
    const status = polled?.status ?? "pending";
    const stage = polled?.stage ?? "Starting up…";
    const StageIcon = STAGE_ICONS[status] ?? Loader2;

    const STAGES: DirectorJobStatus[] = [
      "generating_clips", "generating_audio", "assembling", "uploading",
    ];
    const stageIdx = STAGES.indexOf(status);

    return (
      <StudioToolPageShell
        title="AI Director"
        subtitle="Your commercial is being assembled. Sit back — no touch needed."
        iconAccent="from-[#39FF14] to-emerald-600"
      >
        <div className="max-w-lg mx-auto space-y-8 py-8">
          {/* Animated icon */}
          <div className="flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center">
              <StageIcon className="w-9 h-9 text-[#39FF14] animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-black text-lg">{stage}</p>
              <p className="text-xs text-white/40 mt-1">This takes 3–5 minutes total</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="space-y-3">
            {[
              { s: "generating_clips" as DirectorJobStatus, label: "Generating video scenes", icon: Film },
              { s: "generating_audio" as DirectorJobStatus, label: "Composing music + voiceover", icon: Music },
              { s: "assembling" as DirectorJobStatus, label: "Assembling your commercial", icon: Clapperboard },
              { s: "uploading" as DirectorJobStatus, label: "Uploading finished video", icon: Loader2 },
            ].map(({ s, label, icon: Icon }, i) => {
              const done = stageIdx > i;
              const active = stageIdx === i;
              return (
                <div
                  key={s}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all ${
                    done ? "bg-[#39FF14]/10 border-[#39FF14]/30" :
                    active ? "bg-white/5 border-white/20" :
                    "bg-white/[0.02] border-white/5 opacity-40"
                  }`}
                  data-testid={`step-${s}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-[#39FF14] text-black" :
                    active ? "bg-white/10 border border-white/30" :
                    "bg-white/5"
                  }`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> :
                     active ? <Icon className="w-3.5 h-3.5 animate-spin" /> :
                     <Icon className="w-3.5 h-3.5 text-white/30" />}
                  </div>
                  <span className={`text-sm ${done ? "text-[#39FF14] font-bold" : active ? "text-white font-medium" : "text-white/30"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-white/30">
            You can leave this page — your video will be in your Studio library when it's done.
          </p>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Result ─────────────────────────────────────────────────────────────
  return (
    <StudioToolPageShell
      title="AI Director"
      subtitle="Your commercial is ready. Download and post it anywhere."
      iconAccent="from-[#39FF14] to-emerald-600"
    >
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#39FF14]" />
          <p className="font-black text-[#39FF14]">Commercial ready!</p>
          <Badge className="ml-auto bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/30 text-[10px]">
            {selectedCat?.label}
          </Badge>
        </div>

        {outputUrl && (
          <video
            src={outputUrl}
            controls
            playsInline
            autoPlay
            loop
            className="w-full rounded-2xl bg-black aspect-video border border-white/10"
            data-testid="video-result"
          />
        )}

        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-1.5">
          <p className="text-xs font-bold text-white/60">"{businessName}"</p>
          <p className="text-xs text-[#39FF14] italic">"{tagline}"</p>
        </div>

        {outputUrl && (
          <a
            href={outputUrl}
            download
            target="_blank"
            rel="noreferrer"
            data-testid="link-download"
          >
            <Button className="w-full bg-[#39FF14] hover:bg-[#2de010] text-black font-black h-12">
              <Download className="w-4 h-4 mr-2" /> Download Commercial
            </Button>
          </a>
        )}

        <Button
          variant="outline"
          onClick={reset}
          className="w-full border-white/20"
          data-testid="btn-make-another"
        >
          Make another commercial
        </Button>
      </div>
    </StudioToolPageShell>
  );
}
