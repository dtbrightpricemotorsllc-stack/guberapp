import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Check, ChevronLeft, ChevronRight,
  Download, Tag, ShoppingBag, Music, Mic,
  MicOff, Play, Pause, Volume2, Sparkles,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type Listing = {
  id: number;
  title: string;
  description: string | null;
  price: number | null;
  category: string;
  photos: string[] | null;
  thumbnailUrl: string | null;
  city: string | null;
  state: string | null;
  condition: string | null;
  brand: string | null;
  model: string | null;
};

type StudioFile = {
  id: number;
  fileType: string;
  providerUrl: string;
  meta?: Record<string, unknown>;
};

type StudioMe = { credits: number };

type GenerationResult = {
  slideClips: StudioFile[];
  fantasyFile: StudioFile;
  musicFile: StudioFile;
  narrationFile: StudioFile | null;
  balance: number;
};

type Step = "pick" | "narrate" | "vibe" | "preview";

// ── Config ───────────────────────────────────────────────────────────────────
const VOICES = [
  { id: "alloy",   label: "Alloy",   desc: "Neutral, balanced" },
  { id: "echo",    label: "Echo",    desc: "Calm male" },
  { id: "fable",   label: "Fable",   desc: "Warm storyteller" },
  { id: "onyx",    label: "Onyx",    desc: "Deep, authoritative" },
  { id: "nova",    label: "Nova",    desc: "Upbeat female" },
  { id: "shimmer", label: "Shimmer", desc: "Bright, friendly" },
] as const;
type VoiceId = typeof VOICES[number]["id"];

const MUSIC_GENRES = [
  { id: "luxury",   label: "Luxury",   emoji: "✨", color: "from-amber-500/20 to-yellow-600/20 border-amber-500/30" },
  { id: "upbeat",   label: "Upbeat",   emoji: "🔥", color: "from-orange-500/20 to-red-500/20 border-orange-500/30" },
  { id: "chill",    label: "Chill",    emoji: "🌊", color: "from-sky-500/20 to-cyan-500/20 border-sky-500/30" },
  { id: "dramatic", label: "Dramatic", emoji: "⚡", color: "from-purple-500/20 to-violet-600/20 border-purple-500/30" },
  { id: "romantic", label: "Romantic", emoji: "💜", color: "from-pink-500/20 to-rose-500/20 border-pink-500/30" },
  { id: "hype",     label: "Hype",     emoji: "💎", color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30" },
] as const;
type MusicGenreId = typeof MUSIC_GENRES[number]["id"];

function computeCost(photoCount: number, hasVoice: boolean): number {
  return photoCount * 30 + 30 + 5 + (hasVoice ? 5 : 0);
}

function getFantasyPrompt(title: string, category: string, description: string): string {
  const text = `${title} ${category} ${description}`.toLowerCase();
  if (/car|truck|vehicle|auto|sedan|suv|pickup|jeep|tesla|bmw|mercedes|ford|chevy|corvette|mustang|camaro|porsche/.test(text))
    return `${title} cruising along a scenic coastal highway at golden hour, cinematic car commercial, low angle wide shot, dramatic sky`;
  if (/motorcycle|bike|harley|yamaha|kawasaki|ducati/.test(text))
    return `${title} riding through winding mountain canyon roads at sunset, cinematic motorcycle advertisement, dramatic lighting`;
  if (/boat|yacht|pontoon|jet ski|watercraft|sailboat/.test(text))
    return `${title} gliding across crystal clear turquoise ocean waters at golden sunset, luxury lifestyle`;
  if (/home|house|real estate|property|condo|apartment/.test(text))
    return `Beautifully staged modern home interior with warm ambient lighting, cozy family atmosphere, tasteful furniture, architectural photography`;
  if (/jewelry|ring|necklace|bracelet|diamond|gold|earring/.test(text))
    return `${title} sparkling brilliantly under luxury studio lighting, macro close-up, premium jewelry advertisement`;
  if (/watch|rolex|omega|timepiece/.test(text))
    return `${title} on a wrist in a luxury lifestyle setting, cinematic close-up, premium watch advertisement`;
  if (/dress|shirt|clothing|fashion|shoes|sneaker|outfit|jacket/.test(text))
    return `Fashion model wearing ${title} on a high-end urban street, editorial photography, dramatic natural lighting`;
  if (/laptop|iphone|phone|computer|gaming|console|playstation|xbox|tv/.test(text))
    return `${title} in a sleek modern minimalist workspace, cinematic tech advertisement, clean aesthetic`;
  if (/sofa|couch|bed|table|chair|furniture/.test(text))
    return `${title} in a beautifully designed modern living room, warm golden hour lighting, interior design showcase`;
  if (/snow|ski|snowboard/.test(text))
    return `${title} in action on pristine powder snow slopes, cinematic winter sports photography, dramatic mountain backdrop`;
  if (/bicycle|dirt bike|atv|quad/.test(text))
    return `${title} blazing through a scenic outdoor trail, dynamic action shot, adventurous spirit, dramatic lighting`;
  return `Cinematic lifestyle showcase featuring ${title}, beautiful natural setting, golden hour lighting, luxury advertisement aesthetic`;
}

function buildNarration(listing: Listing): string {
  const price = listing.price != null ? `$${Math.round(listing.price).toLocaleString()}` : null;
  const parts = [
    `Introducing the ${listing.title}.`,
    listing.description ? listing.description.slice(0, 180) : "",
    price ? `Priced at ${price}.` : "",
    listing.city ? `Located in ${listing.city}${listing.state ? `, ${listing.state}` : ""}.` : "",
    "Don't miss out — reach out today.",
  ].filter(Boolean);
  return parts.join(" ");
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudioListingVideoPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [selectedPhotoUrls, setSelectedPhotoUrls] = useState<string[]>([]);
  const [narrationText, setNarrationText] = useState("");
  const [voiceId, setVoiceId] = useState<VoiceId | null>(null);
  const [musicGenre, setMusicGenre] = useState<MusicGenreId>("luxury");
  const [fantasyPrompt, setFantasyPrompt] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [playingClipIdx, setPlayingClipIdx] = useState(0);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const listingsQuery = useQuery<Listing[]>({ queryKey: ["/api/marketplace/my-listings"] });
  const credits = meQuery.data?.credits ?? 0;

  const cost = computeCost(selectedPhotoUrls.length || 1, voiceId !== null);
  const insufficient = credits < cost;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/listing-video", {
        listingId: selected!.id,
        selectedPhotoUrls,
        narrationText: narrationText.trim(),
        voiceId: voiceId ?? undefined,
        musicGenre,
        fantasyPrompt: fantasyPrompt.trim(),
      });
      return res.json() as Promise<GenerationResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      setResult(data);
      setPlayingClipIdx(0);
      toast({ title: "Listing video package ready!" });
    },
    onError: (e: Error) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  function pickListing(l: Listing) {
    setSelected(l);
    const photos = [
      ...(l.thumbnailUrl ? [l.thumbnailUrl] : []),
      ...(l.photos ?? []).filter((p) => p !== l.thumbnailUrl),
    ].filter(Boolean) as string[];
    const initial = photos.slice(0, Math.min(3, photos.length));
    setSelectedPhotoUrls(initial);
    setNarrationText(buildNarration(l));
    setFantasyPrompt(getFantasyPrompt(l.title, l.category, l.description ?? ""));
    setStep("narrate");
  }

  function togglePhoto(url: string) {
    setSelectedPhotoUrls((prev) => {
      if (prev.includes(url)) {
        return prev.length > 1 ? prev.filter((u) => u !== url) : prev;
      }
      return prev.length < 3 ? [...prev, url] : prev;
    });
  }

  const allPhotos = (() => {
    if (!selected) return [];
    return [
      ...(selected.thumbnailUrl ? [selected.thumbnailUrl] : []),
      ...(selected.photos ?? []).filter((p) => p !== selected.thumbnailUrl),
    ].filter(Boolean) as string[];
  })();

  // ── Step: Pick ──────────────────────────────────────────────────────────────
  if (step === "pick") {
    return (
      <StudioToolPageShell
        title="Listing Video"
        subtitle="Animated slideshow + narration + music + fantasy ending for your listing."
        iconAccent="from-emerald-400 to-green-600"
      >
        <div className="space-y-4 max-w-lg mx-auto">
          <p className="text-sm text-white/60">Pick a listing to feature:</p>
          {listingsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : !listingsQuery.data?.length ? (
            <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center">
              <ShoppingBag className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No active listings found.</p>
              <p className="text-white/30 text-xs mt-1">Post something on the Marketplace first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listingsQuery.data.map((l) => {
                const thumb = l.thumbnailUrl ?? l.photos?.[0];
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pickListing(l)}
                    className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.07] p-3 text-left transition-all"
                    data-testid={`btn-pick-listing-${l.id}`}
                  >
                    <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                      {thumb ? <img src={thumb} className="w-full h-full object-cover" alt="" /> : <Tag className="w-5 h-5 text-white/30" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm line-clamp-1">{l.title}</p>
                      <p className="text-[11px] text-white/50 mt-0.5">{l.category}</p>
                      {l.price != null ? (
                        <p className="text-emerald-400 text-sm font-bold mt-1">${Math.round(l.price).toLocaleString()}</p>
                      ) : (
                        <p className="text-white/40 text-xs mt-1">Contact for price</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Narrate ───────────────────────────────────────────────────────────
  if (step === "narrate" && selected) {
    return (
      <StudioToolPageShell
        title="Listing Video"
        subtitle="Animated slideshow + narration + music + fantasy ending for your listing."
        iconAccent="from-emerald-400 to-green-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          <button type="button" onClick={() => setStep("pick")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors" data-testid="btn-back-pick">
            <ChevronLeft className="w-4 h-4" /> Change listing
          </button>

          {/* Photo selection */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
              Photos for slideshow <span className="text-white/30 normal-case">(select up to 3)</span>
            </p>
            <div className="flex gap-2 flex-wrap">
              {allPhotos.map((url, i) => {
                const active = selectedPhotoUrls.includes(url);
                const order = selectedPhotoUrls.indexOf(url) + 1;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => togglePhoto(url)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${active ? "border-emerald-400" : "border-white/10 hover:border-white/30 opacity-50"}`}
                    data-testid={`btn-photo-${i}`}
                  >
                    <img src={url} className="w-full h-full object-cover" alt="" />
                    {active && (
                      <div className="absolute inset-0 bg-emerald-400/20 flex items-center justify-center">
                        <span className="bg-emerald-400 text-black font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center">{order}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/30 mt-1.5">Each selected photo becomes a 5-second animated clip. Numbers show order.</p>
          </div>

          {/* Narration text */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Narration script</p>
            <Textarea
              value={narrationText}
              onChange={(e) => setNarrationText(e.target.value)}
              maxLength={500}
              rows={4}
              className="rounded-xl bg-background/50 border-border/50 text-sm resize-none"
              placeholder="What should the narrator say about your listing?"
              data-testid="textarea-narration"
            />
            <p className="text-[10px] text-white/30 mt-1">{narrationText.length}/500 chars</p>
          </div>

          {/* Voice selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40 uppercase tracking-widest">Narrator voice</p>
              <button
                type="button"
                onClick={() => setVoiceId(voiceId ? null : "nova")}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                data-testid="btn-toggle-narration"
              >
                {voiceId ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5" />}
                {voiceId ? "Narration on" : "No narration"}
              </button>
            </div>
            {voiceId && (
              <div className="grid grid-cols-3 gap-2">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={`rounded-xl border p-2 text-left transition-all ${voiceId === v.id ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
                    data-testid={`btn-voice-${v.id}`}
                  >
                    <p className="font-bold text-xs">{v.label}</p>
                    <p className="text-[10px] text-white/40 leading-tight">{v.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={() => setStep("vibe")}
            disabled={selectedPhotoUrls.length === 0}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-11"
            data-testid="btn-next-vibe"
          >
            Next: Pick the Vibe <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Vibe ──────────────────────────────────────────────────────────────
  if (step === "vibe" && selected) {
    return (
      <StudioToolPageShell
        title="Listing Video"
        subtitle="Animated slideshow + narration + music + fantasy ending for your listing."
        iconAccent="from-emerald-400 to-green-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          <button type="button" onClick={() => setStep("narrate")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors" data-testid="btn-back-narrate">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {/* Music genre */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Music className="w-3 h-3" /> Background music genre
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MUSIC_GENRES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setMusicGenre(g.id)}
                  className={`rounded-xl border bg-gradient-to-br p-3 text-left transition-all ${g.color} ${musicGenre === g.id ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-black" : "hover:opacity-90"}`}
                  data-testid={`btn-genre-${g.id}`}
                >
                  <span className="text-lg">{g.emoji}</span>
                  <p className="font-bold text-xs mt-1">{g.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Fantasy ending */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Fantasy ending scene
            </p>
            <p className="text-[11px] text-white/30 mb-2">AI-generated dream clip — give buyers the vision. Edit or leave as-is.</p>
            <Textarea
              value={fantasyPrompt}
              onChange={(e) => setFantasyPrompt(e.target.value)}
              maxLength={300}
              rows={3}
              className="rounded-xl bg-background/50 border-border/50 text-sm resize-none"
              placeholder="Describe the fantasy ending scene..."
              data-testid="textarea-fantasy"
            />
            <p className="text-[10px] text-white/30 mt-1">{fantasyPrompt.length}/300 chars — be cinematic and specific</p>
          </div>

          <Button
            onClick={() => setStep("preview")}
            disabled={!fantasyPrompt.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-11"
            data-testid="btn-next-preview"
          >
            Preview &amp; Generate <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  // ── Step: Preview / Result ──────────────────────────────────────────────────
  return (
    <StudioToolPageShell
      title="Listing Video"
      subtitle="Animated slideshow + narration + music + fantasy ending for your listing."
      iconAccent="from-emerald-400 to-green-600"
    >
      <div className="space-y-5 max-w-lg mx-auto">
        {result ? (
          <ResultView
            result={result}
            playingClipIdx={playingClipIdx}
            setPlayingClipIdx={setPlayingClipIdx}
            onReset={() => { setResult(null); setStep("pick"); setSelected(null); }}
          />
        ) : (
          <>
            <button type="button" onClick={() => setStep("vibe")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors" data-testid="btn-back-vibe">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            {/* Summary */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              <div className="flex gap-3">
                {selectedPhotoUrls[0] && (
                  <img src={selectedPhotoUrls[0]} className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0" alt="" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm">{selected?.title}</p>
                  {selected?.price != null && <p className="text-emerald-400 font-bold">${Math.round(selected.price).toLocaleString()}</p>}
                </div>
              </div>
              <div className="border-t border-white/10 pt-3 text-xs text-white/50 space-y-1">
                <p>📸 {selectedPhotoUrls.length} photo{selectedPhotoUrls.length !== 1 ? "s" : ""} → animated slideshow</p>
                <p>🎵 Music: {MUSIC_GENRES.find(g => g.id === musicGenre)?.label}</p>
                <p>{voiceId ? `🎙 Narration: ${VOICES.find(v => v.id === voiceId)?.label} voice` : "🔇 No narration"}</p>
                <p>✨ Fantasy ending: {fantasyPrompt.slice(0, 60)}…</p>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-1.5 text-xs">
              {selectedPhotoUrls.map((_, i) => (
                <div key={i} className="flex justify-between text-white/60">
                  <span>Slideshow clip {i + 1} (5s)</span><span>30 cr</span>
                </div>
              ))}
              <div className="flex justify-between text-white/60"><span>Fantasy ending clip (5s)</span><span>30 cr</span></div>
              <div className="flex justify-between text-white/60"><span>Background music</span><span>5 cr</span></div>
              {voiceId && <div className="flex justify-between text-white/60"><span>Narration voice</span><span>5 cr</span></div>}
              <div className="flex justify-between font-bold text-white border-t border-white/10 pt-1.5">
                <span>Total</span><span data-testid="text-total-cost">{cost} cr</span>
              </div>
            </div>

            {insufficient && (
              <p className="text-xs text-red-400 text-center" data-testid="text-insufficient">
                Need {cost} credits — you have {credits}. Earn more credits to continue.
              </p>
            )}

            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || insufficient}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-12 text-base"
              data-testid="btn-generate"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating all clips in parallel… (~90s)
                </>
              ) : (
                `Generate for ${cost} credits`
              )}
            </Button>
          </>
        )}
      </div>
    </StudioToolPageShell>
  );
}

// ── Result viewer ─────────────────────────────────────────────────────────────
function ResultView({
  result,
  playingClipIdx,
  setPlayingClipIdx,
  onReset,
}: {
  result: GenerationResult;
  playingClipIdx: number;
  setPlayingClipIdx: (i: number) => void;
  onReset: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const allClips = [...result.slideClips, result.fantasyFile];
  const current = allClips[playingClipIdx];
  const labels = [
    ...result.slideClips.map((_, i) => `Showcase Clip ${i + 1}`),
    "✨ Fantasy Ending",
  ];

  function handleVideoEnded() {
    if (playingClipIdx < allClips.length - 1) {
      setPlayingClipIdx(playingClipIdx + 1);
      setTimeout(() => videoRef.current?.play(), 100);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-emerald-400 flex items-center gap-2">
        <Check className="w-4 h-4" /> Listing video package ready!
      </p>

      {/* Main video player */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-white/10">
        <video
          ref={videoRef}
          key={current.providerUrl}
          src={current.providerUrl}
          controls
          playsInline
          autoPlay
          onEnded={handleVideoEnded}
          className="w-full h-full object-contain"
          data-testid="video-main"
        />
        <div className="absolute top-2 left-2 bg-black/70 rounded-lg px-2 py-1 text-xs font-bold text-white/80">
          {labels[playingClipIdx]}
        </div>
      </div>

      {/* Clip strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {allClips.map((clip, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setPlayingClipIdx(i); setTimeout(() => videoRef.current?.play(), 100); }}
            className={`relative shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition-all ${playingClipIdx === i ? "border-emerald-400" : "border-white/10 hover:border-white/30"}`}
            data-testid={`btn-clip-${i}`}
          >
            <video src={clip.providerUrl} className="w-full h-full object-cover" muted />
            {playingClipIdx === i && (
              <div className="absolute inset-0 flex items-center justify-center bg-emerald-400/20">
                <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] text-white/70 py-0.5">
              {i < result.slideClips.length ? `Clip ${i + 1}` : "Fantasy"}
            </div>
          </button>
        ))}
      </div>

      {/* Audio */}
      {(result.musicFile || result.narrationFile) && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-widest">Audio</p>
          {result.musicFile && (
            <div className="space-y-1">
              <p className="text-xs text-white/60 flex items-center gap-1"><Music className="w-3 h-3" /> Music</p>
              <audio src={result.musicFile.providerUrl} controls className="w-full h-8" data-testid="audio-music" />
            </div>
          )}
          {result.narrationFile && (
            <div className="space-y-1">
              <p className="text-xs text-white/60 flex items-center gap-1"><Mic className="w-3 h-3" /> Narration</p>
              <audio src={result.narrationFile.providerUrl} controls className="w-full h-8" data-testid="audio-narration" />
            </div>
          )}
        </div>
      )}

      {/* Downloads */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-widest">Download</p>
        <div className="grid grid-cols-2 gap-2">
          {allClips.map((clip, i) => (
            <a key={i} href={clip.providerUrl} download target="_blank" rel="noreferrer" data-testid={`link-download-clip-${i}`}>
              <Button variant="outline" size="sm" className="w-full border-white/15 text-xs">
                <Download className="w-3 h-3 mr-1" /> {labels[i]}
              </Button>
            </a>
          ))}
          {result.musicFile && (
            <a href={result.musicFile.providerUrl} download target="_blank" rel="noreferrer" data-testid="link-download-music">
              <Button variant="outline" size="sm" className="w-full border-white/15 text-xs">
                <Download className="w-3 h-3 mr-1" /> Music
              </Button>
            </a>
          )}
          {result.narrationFile && (
            <a href={result.narrationFile.providerUrl} download target="_blank" rel="noreferrer" data-testid="link-download-narration">
              <Button variant="outline" size="sm" className="w-full border-white/15 text-xs">
                <Download className="w-3 h-3 mr-1" /> Narration
              </Button>
            </a>
          )}
        </div>
      </div>

      <Button variant="outline" onClick={onReset} className="w-full border-white/20" data-testid="btn-make-another">
        Make Another Listing Video
      </Button>
    </div>
  );
}
