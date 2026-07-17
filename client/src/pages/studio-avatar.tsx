// /studio/avatar — GUVATAR Character Creator
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, Upload, X, Sparkles, UserRound, Box, Camera,
  Wand2, Download, RefreshCw, CheckCircle2,
} from "lucide-react";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { isStoreBuild } from "@/lib/platform";
import { compressImageToDataUrl } from "@/lib/image-compress";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "starter" | "mesh" | "photo" | "describe";

const TABS: { id: Tab; label: string; shortLabel: string; icon: typeof UserRound }[] = [
  { id: "starter",  label: "Pick a Starter",  shortLabel: "Starter",  icon: Box },
  { id: "mesh",     label: "Import Mesh",      shortLabel: "Mesh",     icon: Box },
  { id: "photo",    label: "Upload a Photo",   shortLabel: "Photo",    icon: Camera },
  { id: "describe", label: "Describe It (AI)", shortLabel: "AI",       icon: Sparkles },
];

const STARTER_PRESETS = [
  { id: "human-m",  label: "Human · Male",   emoji: "🧑" },
  { id: "human-f",  label: "Human · Female", emoji: "👩" },
  { id: "cyber",    label: "Cyberpunk",       emoji: "🤖" },
  { id: "fantasy",  label: "Fantasy Hero",   emoji: "🧝" },
  { id: "athlete",  label: "Athlete",         emoji: "🏃" },
  { id: "exec",     label: "Executive",       emoji: "💼" },
];

const STYLE_CHIPS = [
  { label: "Cinematic",   prompt: "Cinematic portrait photograph, soft volumetric lighting, shallow depth of field, professional color grade, ultra-detailed." },
  { label: "Anime",       prompt: "Anime style portrait illustration, clean line art, vibrant colors, expressive eyes, Studio Ghibli inspired aesthetic." },
  { label: "Oil Paint",   prompt: "Classical oil painting portrait, rich impasto texture, warm chiaroscuro lighting, museum-quality fine art." },
  { label: "Cyberpunk",   prompt: "Neon cyberpunk portrait, holographic reflections, city lights bokeh, electric blue and magenta palette." },
  { label: "Watercolor",  prompt: "Loose watercolor portrait, soft washes of color, delicate linework, painterly texture, dreamy impressionist mood." },
  { label: "3D Render",   prompt: "Photorealistic 3D rendered portrait, subsurface scattering skin, octane render, studio HDRI lighting, 8K." },
];

const DESCRIBE_EXAMPLES = [
  "A fierce warrior with silver armor and glowing blue eyes",
  "A friendly neighborhood tech wizard with a hoodie",
  "A mysterious traveler with an ancient map tattoo",
];

// ─── Accent colours ───────────────────────────────────────────────────────────
const ACCENT  = "#38bdf8";   // sky-400
const ACCENT2 = "#818cf8";   // indigo-400
const DARK    = "#050810";

// ─── Component ────────────────────────────────────────────────────────────────
export default function StudioAvatarPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── tab — switching resets all branch-scoped fields ──
  const [activeTab, setActiveTab] = useState<Tab>("starter");
  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    setStarterPick(null);
    setCharName("");
    setPhotoDataUrl(null);
    setPhotoPreview(null);
    setPhotoStyle(STYLE_CHIPS[0].prompt);
    setDescPrompt("");
    setResultUrl(null);
    setActiveTab(tab);
  }

  // ── starter tab ──
  const [starterPick, setStarterPick]   = useState<string | null>(null);
  const [charName,    setCharName]      = useState("");

  // ── photo tab ──
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoStyle,   setPhotoStyle]   = useState(STYLE_CHIPS[0].prompt);

  // ── describe tab ──
  const [descPrompt, setDescPrompt]     = useState("");

  // ── result ──
  const [resultUrl, setResultUrl]       = useState<string | null>(null);

  const meQuery = useQuery<{ credits: number }>({ queryKey: ["/api/studio/me"] });
  const credits = meQuery.data?.credits ?? 0;

  // ── file handler — does NOT touch activeTab ──────────────────────────────
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please upload a JPG or PNG photo.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    try {
      const url = await compressImageToDataUrl(file);
      setPhotoDataUrl(url);
      setPhotoPreview(url);
      setResultUrl(null);
    } catch (e: any) {
      toast({ title: "Couldn't use that photo", description: e?.message || "Try a different image.", variant: "destructive" });
    }
  }

  // ── generation mutation ───────────────────────────────────────────────────
  const generate = useMutation({
    mutationFn: async () => {
      let prompt = "";
      let referenceImageUrl: string | undefined;

      if (activeTab === "photo") {
        if (!photoDataUrl) throw new Error("Upload a photo first.");
        const uploadRes = await apiRequest("POST", "/api/studio/upload", {
          dataUrl:  photoDataUrl,
          mimeType: photoDataUrl.split(";")[0].replace("data:", ""),
          filename: "avatar-ref.jpg",
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error((err as any).error || "Photo upload failed.");
        }
        const { url } = await uploadRes.json();
        referenceImageUrl = url;
        prompt = photoStyle;
      } else if (activeTab === "starter") {
        const preset = STARTER_PRESETS.find(p => p.id === starterPick);
        prompt = `GUVATAR character portrait, ${preset?.label ?? "human"} archetype, ${charName ? `named ${charName},` : ""} cinematic lighting, detailed professional character art.`;
      } else if (activeTab === "describe") {
        if (!descPrompt.trim()) throw new Error("Describe your character first.");
        prompt = `GUVATAR character portrait: ${descPrompt}. Cinematic lighting, detailed professional character art.`;
      } else {
        throw new Error("Select a creation method above.");
      }

      const genRes = await apiRequest("POST", "/api/studio/generate/quick-pic", {
        prompt,
        ...(referenceImageUrl ? { referenceImageUrl } : {}),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error((err as any).error || "Generation failed.");
      }
      return genRes.json();
    },
    onSuccess: (data) => {
      setResultUrl(data?.url ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      toast({ title: "Character ready!", description: "Long-press or tap Download to save." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  // ── derive CTA readiness ──────────────────────────────────────────────────
  const canGenerate = !generate.isPending && (
    (activeTab === "photo"    && !!photoDataUrl) ||
    (activeTab === "starter"  && !!starterPick) ||
    (activeTab === "describe" && descPrompt.trim().length > 3)
  );

  // ── iOS store placeholder ─────────────────────────────────────────────────
  if (isStoreBuild) {
    return (
      <StudioToolPageShell
        title="GUVATAR"
        subtitle="AI character & avatar creator"
        iconAccent="from-sky-400 to-indigo-500"
      >
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
               style={{ background: DARK, border: `1.5px solid ${ACCENT}33` }}>
            <UserRound className="w-8 h-8" style={{ color: ACCENT }} />
          </div>
          <p className="text-sm text-white/40 font-medium leading-relaxed">
            Updating — come try later.
          </p>
        </div>
      </StudioToolPageShell>
    );
  }

  return (
    <StudioToolPageShell
      title="GUVATAR"
      subtitle="Create a character · get your AI portrait"
      iconAccent="from-sky-400 to-indigo-500"
    >
      {/* ── GUVATAR brand bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between -mt-2 mb-1">
        <div>
          <h2 className="text-xl font-black tracking-tight" style={{ color: ACCENT }}>
            Create a Character
          </h2>
          <p className="text-xs text-white/40 mt-0.5 leading-snug">
            Every character becomes a draft ready for the GUVATAR Engine.
          </p>
        </div>
        <div className="text-right text-xs text-white/30 font-semibold shrink-0">
          <span className="text-amber-300 font-black">{credits}</span> cr
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-5">
        <div className="flex overflow-x-auto scrollbar-none px-4 sm:px-5 gap-1 border-b border-white/8">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-3 text-[13px] font-bold whitespace-nowrap transition-all shrink-0"
                style={{
                  color:      active ? ACCENT : "rgba(255,255,255,0.4)",
                  borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent",
                  marginBottom: "-1px",
                }}
                data-testid={`tab-avatar-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab panels ────────────────────────────────────────────── */}
      <div className="min-h-[360px]">

        {/* STARTER */}
        {activeTab === "starter" && (
          <div className="space-y-5 pt-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-white/40 block mb-2">
                Character Name <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Give your character a name…"
                value={charName}
                onChange={e => setCharName(e.target.value)}
                maxLength={40}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none"
                style={{ background: "#0d0d1a", border: `1px solid ${ACCENT}22` }}
                data-testid="input-avatar-char-name"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Starter Base</p>
              <div className="grid grid-cols-3 gap-2">
                {STARTER_PRESETS.map(p => {
                  const active = starterPick === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setStarterPick(active ? null : p.id)}
                      className="flex flex-col items-center gap-1.5 py-4 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background:   active ? `${ACCENT}15` : "#0d0d1a",
                        border:       `1.5px solid ${active ? ACCENT : ACCENT + "22"}`,
                        color:        active ? ACCENT : "rgba(255,255,255,0.55)",
                        boxShadow:    active ? `0 0 16px ${ACCENT}25` : "none",
                      }}
                      data-testid={`starter-${p.id}`}
                    >
                      <span className="text-2xl">{p.emoji}</span>
                      <span className="text-[11px] text-center leading-tight">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {!starterPick && (
              <p className="text-center text-xs text-white/30 pt-2">
                Pick a starter base above to unlock generation.
              </p>
            )}
          </div>
        )}

        {/* MESH */}
        {activeTab === "mesh" && (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center gap-4 pt-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                 style={{ background: DARK, border: `1.5px solid ${ACCENT}33` }}>
              <Box className="w-8 h-8" style={{ color: ACCENT, opacity: 0.5 }} />
            </div>
            <div>
              <p className="font-bold text-white/80 text-sm">Mesh Import</p>
              <p className="text-xs text-white/35 mt-1 max-w-[260px] leading-relaxed">
                Updating — come try later.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                  style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}44` }}>
              Updating
            </span>
          </div>
        )}

        {/* PHOTO */}
        {activeTab === "photo" && (
          <div className="space-y-4 pt-4">
            {/* Upload area */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                Your Reference Photo
              </p>

              {photoPreview ? (
                <div className="relative w-full rounded-2xl overflow-hidden"
                     style={{ aspectRatio: "1/1", border: `1.5px solid ${ACCENT}44`, boxShadow: `0 0 28px ${ACCENT}18` }}>
                  <img src={photoPreview} alt="Reference" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setPhotoDataUrl(null); setPhotoPreview(null); setResultUrl(null); }}
                    className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition"
                    style={{ background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.15)" }}
                    data-testid="button-avatar-remove-photo"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                       style={{ background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    <span className="text-[11px] font-bold" style={{ color: ACCENT }}>Photo loaded</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl transition-all"
                  style={{
                    aspectRatio: "16/9",
                    background: DARK,
                    border: `2px dashed ${ACCENT}33`,
                  }}
                  data-testid="button-avatar-upload"
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                       style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}44` }}>
                    <Upload className="w-5 h-5" style={{ color: ACCENT }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white/80">Tap to upload a selfie</p>
                    <p className="text-xs text-white/35 mt-0.5">JPG · PNG · WebP · max 10 MB</p>
                  </div>
                </button>
              )}

              {/* Hidden input — onChange must NOT change activeTab */}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";      // reset so same file can be re-picked
                  if (f) handleFile(f);    // handleFile never touches activeTab
                }}
                data-testid="input-avatar-file"
              />
            </div>

            {/* Style picker */}
            {photoPreview && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Portrait Style</p>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_CHIPS.map(chip => {
                    const active = photoStyle === chip.prompt;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => setPhotoStyle(chip.prompt)}
                        className="text-left px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                        style={{
                          background: active ? `${ACCENT}18` : "#0d0d1a",
                          border: `1.5px solid ${active ? ACCENT : ACCENT + "22"}`,
                          color: active ? ACCENT : "rgba(255,255,255,0.55)",
                          boxShadow: active ? `0 0 12px ${ACCENT}28` : "none",
                        }}
                        data-testid={`chip-style-${chip.label.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DESCRIBE */}
        {activeTab === "describe" && (
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-white/40 block mb-2">
                Describe Your Character
              </label>
              <textarea
                rows={4}
                placeholder="Describe your character in detail…"
                value={descPrompt}
                onChange={e => setDescPrompt(e.target.value)}
                maxLength={400}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none resize-none leading-relaxed"
                style={{ background: "#0d0d1a", border: `1px solid ${ACCENT}22` }}
                data-testid="input-avatar-describe"
              />
              <p className="text-right text-[11px] text-white/25 mt-1">{descPrompt.length}/400</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                Need inspiration?
              </p>
              <div className="flex flex-col gap-1.5">
                {DESCRIBE_EXAMPLES.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDescPrompt(ex)}
                    className="text-left px-3 py-2.5 rounded-xl text-xs text-white/50 transition-all hover:text-white/80"
                    style={{ background: "#0d0d1a", border: `1px solid ${ACCENT}18` }}
                  >
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Result ─────────────────────────────────────────────────── */}
      {resultUrl && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">Your Character</p>
          <div className="relative w-full rounded-2xl overflow-hidden"
               style={{ aspectRatio: "1/1", border: `1.5px solid ${ACCENT}44`, boxShadow: `0 0 32px ${ACCENT}20` }}>
            <img src={resultUrl} alt="Generated avatar" className="w-full h-full object-cover" data-testid="img-avatar-result" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={resultUrl}
              download="guvatar-character.jpg"
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition no-underline"
              style={{ background: `${ACCENT}15`, border: `1.5px solid ${ACCENT}44`, color: ACCENT }}
              data-testid="link-avatar-download"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
            <button
              type="button"
              onClick={() => { setResultUrl(null); generate.reset(); }}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition"
              style={{ background: "#0d0d1a", border: "1.5px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
              data-testid="button-avatar-regenerate"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
          </div>
        </div>
      )}

      {/* ── Generate button ─────────────────────────────────────────── */}
      <Button
        type="button"
        disabled={!canGenerate}
        onClick={() => generate.mutate()}
        className="w-full h-14 text-base font-black rounded-2xl transition-all"
        style={{
          background: canGenerate
            ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`
            : "#0d0d1a",
          color:     canGenerate ? "#000" : "rgba(255,255,255,0.2)",
          boxShadow: canGenerate ? `0 0 32px ${ACCENT}40` : "none",
          border:    canGenerate ? "none" : "1px solid rgba(255,255,255,0.08)",
        }}
        data-testid="button-avatar-generate"
      >
        {generate.isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Generating character…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" /> Generate Character
          </span>
        )}
      </Button>

      <p className="text-center text-xs text-white/25 leading-relaxed pb-2">
        Uses Quick Pic credits.{" "}
        <a href="/studio/credits" className="underline text-white/40">Get credits →</a>
      </p>
    </StudioToolPageShell>
  );
}
