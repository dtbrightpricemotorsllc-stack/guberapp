// /studio/avatar — AI Avatar Creator
// Users upload a selfie/photo and generate a stylised AI portrait avatar.
// Powered by fal-ai/flux-pro (with an ip-adapter reference image).
// Palette: sky-blue (#38bdf8) so it reads as portrait at a glance.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, UserRound, Upload, X, Sparkles } from "lucide-react";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { isStoreBuild } from "@/lib/platform";

type StudioMe = { credits: number };

const STYLE_CHIPS = [
  { label: "Cinematic portrait",  prompt: "Cinematic portrait photograph, soft volumetric lighting, shallow depth of field, professional color grade, ultra-detailed." },
  { label: "Anime",               prompt: "Anime style portrait illustration, clean line art, vibrant colors, expressive eyes, Studio Ghibli inspired aesthetic." },
  { label: "Oil painting",        prompt: "Classical oil painting portrait, rich impasto texture, warm chiaroscuro lighting, museum-quality fine art aesthetic." },
  { label: "Neon cyberpunk",      prompt: "Neon cyberpunk portrait, holographic reflections, city lights bokeh, electric blue and magenta palette, futuristic dystopian." },
  { label: "Watercolor",          prompt: "Loose watercolor portrait, soft washes of color, delicate linework, painterly texture, dreamy impressionist mood." },
  { label: "3D render",           prompt: "Photorealistic 3D rendered portrait, subsurface scattering skin, octane render, studio HDRI lighting, 8K resolution." },
];

export default function StudioAvatarPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [style, setStyle] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const credits = meQuery.data?.credits ?? 0;

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please upload a JPG or PNG photo.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB per photo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPhotoDataUrl(url);
      setPhotoPreview(url);
    };
    reader.readAsDataURL(file);
  }

  const generate = useMutation({
    mutationFn: async () => {
      if (!photoDataUrl) throw new Error("Upload a photo first.");
      // 1. Upload reference photo to studio session storage
      const uploadRes = await apiRequest("POST", "/api/studio/upload", {
        dataUrl: photoDataUrl,
        mimeType: photoDataUrl.split(";")[0].replace("data:", ""),
        filename: "avatar-ref.jpg",
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || "Photo upload failed.");
      }
      const { url: refUrl } = await uploadRes.json();

      // 2. Generate avatar using Wan / Flux quick pic with image reference
      const genRes = await apiRequest("POST", "/api/studio/generate/quick-pic", {
        prompt: style || STYLE_CHIPS[0].prompt,
        referenceImageUrl: refUrl,
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed.");
      }
      return genRes.json();
    },
    onSuccess: (data) => {
      setResultUrl(data?.url ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      toast({ title: "Avatar ready!", description: "Long-press or tap Download to save." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const canGenerate = !!photoDataUrl && !generate.isPending;

  return (
    <StudioToolPageShell title="Avatar" accentColor="#38bdf8">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16 space-y-6">

        {/* Hero label */}
        <div className="text-center space-y-1">
          <div
            className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "#07070f", border: "1.5px solid #38bdf855", boxShadow: "0 0 24px #38bdf830" }}
          >
            <UserRound className="w-7 h-7" style={{ color: "#38bdf8", filter: "drop-shadow(0 0 10px #38bdf888)" }} />
          </div>
          <h1 className="text-2xl font-black text-white">Avatar Creator</h1>
          <p className="text-sm text-white/50">Upload a selfie · pick a style · get your AI portrait</p>
        </div>

        {/* Photo upload */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Your photo</p>
          {photoPreview ? (
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-white/10">
              <img src={photoPreview} alt="Reference" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => { setPhotoDataUrl(null); setPhotoPreview(null); setResultUrl(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90 transition"
                data-testid="button-avatar-remove-photo"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition hover:border-sky-400/60 hover:bg-sky-400/5"
              style={{ borderColor: "#38bdf830", background: "#07070f" }}
              data-testid="button-avatar-upload"
            >
              <Upload className="w-8 h-8" style={{ color: "#38bdf8" }} />
              <span className="text-sm text-white/50">Tap to upload a selfie</span>
              <span className="text-xs text-white/30">JPG · PNG · max 10 MB</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            data-testid="input-avatar-file"
          />
        </div>

        {/* Style chips */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Style</p>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_CHIPS.map((chip) => {
              const active = style === chip.prompt;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setStyle(active ? "" : chip.prompt)}
                  className="text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: active ? "#38bdf818" : "#07070f",
                    border: `1.5px solid ${active ? "#38bdf8" : "#38bdf822"}`,
                    color: active ? "#38bdf8" : "rgba(255,255,255,0.55)",
                    boxShadow: active ? "0 0 12px #38bdf828" : "none",
                  }}
                  data-testid={`chip-style-${chip.label.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Result */}
        {resultUrl && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">Your avatar</p>
            <div
              className="relative w-full aspect-square rounded-2xl overflow-hidden"
              style={{ border: "1.5px solid #38bdf840", boxShadow: "0 0 28px #38bdf820" }}
            >
              <img src={resultUrl} alt="Generated avatar" className="w-full h-full object-cover" data-testid="img-avatar-result" />
            </div>
            <a
              href={resultUrl}
              download="my-avatar.jpg"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition"
              style={{ background: "#38bdf815", border: "1.5px solid #38bdf840", color: "#38bdf8" }}
              data-testid="link-avatar-download"
            >
              Download
            </a>
          </div>
        )}

        {/* Generate button */}
        {!isStoreBuild && (
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={() => generate.mutate()}
            className="w-full h-14 text-base font-black rounded-2xl transition-all"
            style={{
              background: canGenerate ? "linear-gradient(135deg,#38bdf8,#818cf8)" : "#1e293b",
              color: canGenerate ? "#000" : "#475569",
              boxShadow: canGenerate ? "0 0 28px #38bdf840" : "none",
              border: "none",
            }}
            data-testid="button-avatar-generate"
          >
            {generate.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Generating…</span>
            ) : (
              <span className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Generate Avatar</span>
            )}
          </Button>
        )}

        <p className="text-center text-xs text-white/30 leading-relaxed">
          Avatar generation uses your Quick Pic credits.{" "}
          <a href="/studio/credits" className="underline text-white/50">Get more credits →</a>
        </p>
      </div>
    </StudioToolPageShell>
  );
}
