import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Check, ChevronLeft, ChevronRight,
  Download, Tag, ShoppingBag,
} from "lucide-react";

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

type Step = "pick" | "customize" | "preview";

const COST = 35;

export default function StudioListingVideoPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string>("");
  const [ctaText, setCtaText] = useState("");
  const [result, setResult] = useState<{ videoFile: StudioFile; audioFile?: StudioFile } | null>(null);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const listingsQuery = useQuery<Listing[]>({ queryKey: ["/api/marketplace/my-listings"] });
  const credits = meQuery.data?.credits ?? 0;
  const insufficient = credits < COST;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/listing-video", {
        listingId: selected!.id,
        photoUrl: selectedPhoto,
        ctaText: ctaText.trim(),
      });
      return res.json() as Promise<{
        videoFile: StudioFile;
        audioFile?: StudioFile;
        balance: number;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      setResult({ videoFile: data.videoFile, audioFile: data.audioFile });
      toast({ title: "Listing video created!" });
    },
    onError: (e: Error) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  function pickListing(l: Listing) {
    setSelected(l);
    const photos = l.photos ?? [];
    const hero = l.thumbnailUrl ?? photos[0] ?? "";
    setSelectedPhoto(hero);
    const priceStr = l.price != null
      ? `$${Math.round(l.price).toLocaleString()}`
      : "Contact for price";
    setCtaText(`${priceStr} — DM to buy today!`);
    setStep("customize");
  }

  const allPhotos = (() => {
    if (!selected) return [];
    const photos = selected.photos ?? [];
    return [
      ...(selected.thumbnailUrl ? [selected.thumbnailUrl] : []),
      ...photos.filter((p) => p !== selected.thumbnailUrl),
    ].filter(Boolean) as string[];
  })();

  if (step === "pick") {
    return (
      <StudioToolPageShell
        title="Listing Video"
        subtitle="Turn your marketplace listing into a cinematic video ad."
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
              <p className="text-white/30 text-xs mt-1">
                Post something on the Marketplace first, then come back here.
              </p>
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
                      {thumb ? (
                        <img src={thumb} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <Tag className="w-5 h-5 text-white/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm line-clamp-1">{l.title}</p>
                      <p className="text-[11px] text-white/50 mt-0.5">{l.category}</p>
                      {l.price != null ? (
                        <p className="text-emerald-400 text-sm font-bold mt-1">
                          ${Math.round(l.price).toLocaleString()}
                        </p>
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

  if (step === "customize" && selected) {
    return (
      <StudioToolPageShell
        title="Listing Video"
        subtitle="Turn your marketplace listing into a cinematic video ad."
        iconAccent="from-emerald-400 to-green-600"
      >
        <div className="space-y-5 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setStep("pick")}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
            data-testid="btn-back-pick"
          >
            <ChevronLeft className="w-4 h-4" /> Change listing
          </button>

          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-3">
            {(selected.thumbnailUrl ?? selected.photos?.[0]) && (
              <img
                src={(selected.thumbnailUrl ?? selected.photos![0])!}
                className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/10"
                alt=""
              />
            )}
            <div className="min-w-0">
              <p className="font-bold text-sm line-clamp-1">{selected.title}</p>
              {selected.price != null && (
                <p className="text-emerald-400 font-bold">
                  ${Math.round(selected.price).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-white/40">{selected.category}</p>
            </div>
          </div>

          {allPhotos.length > 1 && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
                Feature photo
              </p>
              <div className="flex gap-2 flex-wrap">
                {allPhotos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedPhoto(url)}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                      selectedPhoto === url
                        ? "border-emerald-400"
                        : "border-white/10 hover:border-white/30"
                    }`}
                    data-testid={`btn-photo-${i}`}
                  >
                    <img src={url} className="w-full h-full object-cover" alt="" />
                    {selectedPhoto === url && (
                      <div className="absolute inset-0 bg-emerald-400/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
              Call to action
            </p>
            <Input
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              maxLength={80}
              className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
              placeholder='e.g. "$500 — DM to buy today!"'
              data-testid="input-cta-text"
            />
            <p className="text-[10px] text-white/30 mt-1">
              This will be included in the video prompt.
            </p>
          </div>

          <Button
            onClick={() => setStep("preview")}
            disabled={!selectedPhoto}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-11"
            data-testid="btn-next-preview"
          >
            Preview &amp; Generate <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </StudioToolPageShell>
    );
  }

  return (
    <StudioToolPageShell
      title="Listing Video"
      subtitle="Turn your marketplace listing into a cinematic video ad."
      iconAccent="from-emerald-400 to-green-600"
    >
      <div className="space-y-5 max-w-lg mx-auto">
        {result ? (
          <div className="space-y-4">
            <p className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <Check className="w-4 h-4" /> Video ready!
            </p>
            <video
              src={result.videoFile.providerUrl}
              controls
              playsInline
              className="w-full rounded-2xl bg-black aspect-video"
              data-testid="video-result"
            />
            {result.audioFile && (
              <audio
                src={result.audioFile.providerUrl}
                controls
                className="w-full"
                data-testid="audio-result"
              />
            )}
            <div className="flex gap-2">
              <a
                href={result.videoFile.providerUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex-1"
                data-testid="link-download-video"
              >
                <Button className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold">
                  <Download className="w-4 h-4 mr-1.5" /> Download Video
                </Button>
              </a>
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setStep("pick");
                  setSelected(null);
                }}
                className="border-white/20"
                data-testid="btn-make-another"
              >
                Make Another
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("customize")}
              className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
              data-testid="btn-back-customize"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              {selected && (
                <div className="flex gap-3">
                  {selectedPhoto && (
                    <img
                      src={selectedPhoto}
                      className="w-20 h-20 rounded-xl object-cover border border-white/10 shrink-0"
                      alt=""
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{selected.title}</p>
                    {selected.price != null && (
                      <p className="text-emerald-400 font-bold">
                        ${Math.round(selected.price).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-white/50 mt-1 line-clamp-2">
                      {selected.description ?? ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="border-t border-white/10 pt-3 text-xs text-white/50 space-y-1">
                <p>
                  CTA: <span className="text-white/80">{ctaText || "—"}</span>
                </p>
                <p>Generates: 5-second motion video + backing music</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <span className="text-sm text-white/60">Credit cost</span>
              <span className="font-bold text-base" data-testid="text-credit-cost">
                {COST} cr
              </span>
            </div>

            {insufficient && (
              <p className="text-xs text-red-400 text-center" data-testid="text-insufficient">
                Not enough credits. You have {credits} — need {COST}.
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
