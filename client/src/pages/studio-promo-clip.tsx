import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Check, ChevronLeft, Download, Star, Music,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type StudioFile = {
  id: number;
  fileType: string;
  providerUrl: string;
  meta?: Record<string, unknown>;
};

type StudioMe = { credits: number };

type GenerationResult = {
  videoFile: StudioFile;
  musicFile: StudioFile;
  balance: number;
};

// ── Config ───────────────────────────────────────────────────────────────────
const MUSIC_GENRES = [
  { id: "luxury",   label: "Luxury",   emoji: "✨", color: "from-amber-500/20 to-yellow-600/20 border-amber-500/30" },
  { id: "upbeat",   label: "Upbeat",   emoji: "🔥", color: "from-orange-500/20 to-red-500/20 border-orange-500/30" },
  { id: "chill",    label: "Chill",    emoji: "🌊", color: "from-sky-500/20 to-cyan-500/20 border-sky-500/30" },
  { id: "dramatic", label: "Dramatic", emoji: "⚡", color: "from-purple-500/20 to-violet-600/20 border-purple-500/30" },
  { id: "romantic", label: "Romantic", emoji: "💜", color: "from-pink-500/20 to-rose-500/20 border-pink-500/30" },
  { id: "hype",     label: "Hype",     emoji: "💎", color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30" },
] as const;
type MusicGenreId = typeof MUSIC_GENRES[number]["id"];

const COST = 35;

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudioPromoClipPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<"build" | "preview">("build");

  // Form state
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [musicGenre, setMusicGenre] = useState<MusicGenreId>("upbeat");
  const [result, setResult] = useState<GenerationResult | null>(null);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const credits = meQuery.data?.credits ?? 0;
  const insufficient = credits < COST;

  const canNext = name.trim().length > 0 && tagline.trim().length > 0;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/promo-clip", {
        name: name.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        musicGenre,
      });
      return res.json() as Promise<GenerationResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      setResult(data);
      toast({ title: "Promo clip ready!" });
    },
    onError: (e: Error) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  // ── Build step ──────────────────────────────────────────────────────────────
  if (step === "build" && !result) {
    return (
      <StudioToolPageShell
        title="Promo Clip"
        subtitle="5-second cinematic promo video with matching music. No photos needed."
        iconAccent="from-amber-400 to-yellow-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          {/* Name / brand */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Your name or brand</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              placeholder='e.g. "Marcus Johnson" or "Elite Cuts Barbershop"'
              data-testid="input-name"
            />
          </div>

          {/* Tagline */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Tagline</p>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={80}
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              placeholder='e.g. "Fast. Reliable. Local."'
              data-testid="input-tagline"
            />
          </div>

          {/* What you do */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
              What you do <span className="text-white/25 normal-case">(optional — adds detail to the scene)</span>
            </p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              className="rounded-xl bg-background/50 border-border/50 text-sm resize-none"
              placeholder='e.g. "Mobile car detailing, available 7 days a week in Miami."'
              data-testid="textarea-description"
            />
          </div>

          {/* Music genre */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Music className="w-3 h-3" /> Music vibe
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MUSIC_GENRES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setMusicGenre(g.id)}
                  className={`rounded-xl border bg-gradient-to-br p-3 text-left transition-all ${g.color} ${musicGenre === g.id ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-black" : "hover:opacity-90"}`}
                  data-testid={`btn-genre-${g.id}`}
                >
                  <span className="text-lg">{g.emoji}</span>
                  <p className="font-bold text-xs mt-1">{g.label}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => setStep("preview")}
            disabled={!canNext}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold h-11"
            data-testid="btn-next-preview"
          >
            Preview &amp; Generate →
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Preview / Result ────────────────────────────────────────────────────────
  return (
    <StudioToolPageShell
      title="Promo Clip"
      subtitle="5-second cinematic promo video with matching music. No photos needed."
      iconAccent="from-amber-400 to-yellow-600"
    >
      <div className="space-y-5 max-w-lg mx-auto">
        {result ? (
          // ── Result ─────────────────────────────────────────────────────────
          <div className="space-y-4">
            <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <Check className="w-4 h-4" /> Promo clip ready!
            </p>

            <video
              src={result.videoFile.providerUrl}
              controls
              playsInline
              autoPlay
              loop
              className="w-full rounded-2xl bg-black aspect-video border border-white/10"
              data-testid="video-result"
            />

            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-widest">Music</p>
              <audio
                src={result.musicFile.providerUrl}
                controls
                className="w-full h-8"
                data-testid="audio-music"
              />
            </div>

            <div className="flex gap-2">
              <a
                href={result.videoFile.providerUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex-1"
                data-testid="link-download-video"
              >
                <Button className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold">
                  <Download className="w-4 h-4 mr-1.5" /> Download Clip
                </Button>
              </a>
              <a
                href={result.musicFile.providerUrl}
                download
                target="_blank"
                rel="noreferrer"
                data-testid="link-download-music"
              >
                <Button variant="outline" className="border-white/20">
                  <Download className="w-4 h-4 mr-1.5" /> Music
                </Button>
              </a>
            </div>

            <Button
              variant="outline"
              onClick={() => { setResult(null); setStep("build"); setName(""); setTagline(""); setDescription(""); }}
              className="w-full border-white/20"
              data-testid="btn-make-another"
            >
              Make Another
            </Button>
          </div>
        ) : (
          // ── Preview ─────────────────────────────────────────────────────────
          <>
            <button
              type="button"
              onClick={() => setStep("build")}
              className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
              data-testid="btn-back"
            >
              <ChevronLeft className="w-4 h-4" /> Edit
            </button>

            {/* Summary */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-bold text-sm">{name}</p>
                  <p className="text-amber-400 text-sm italic">"{tagline}"</p>
                </div>
              </div>
              {description && (
                <p className="text-xs text-white/50 border-t border-white/10 pt-3">{description}</p>
              )}
              <div className="border-t border-white/10 pt-3 text-xs text-white/50 space-y-1">
                <p>🎵 Music: {MUSIC_GENRES.find((g) => g.id === musicGenre)?.label}</p>
                <p>🎬 5-second cinematic text-to-video</p>
              </div>
            </div>

            {/* Cost */}
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <span className="text-sm text-white/60">Credit cost</span>
              <span className="font-bold text-base" data-testid="text-cost">{COST} cr</span>
            </div>

            {insufficient && (
              <p className="text-xs text-red-400 text-center" data-testid="text-insufficient">
                Need {COST} credits — you have {credits}.
              </p>
            )}

            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || insufficient}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold h-12 text-base"
              data-testid="btn-generate"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating (~60s)…
                </>
              ) : (
                `Generate for ${COST} credits`
              )}
            </Button>
          </>
        )}
      </div>
    </StudioToolPageShell>
  );
}
