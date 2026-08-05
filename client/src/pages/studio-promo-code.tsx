// GUBER Studio — Code-Based Promo Video Wizard (Quality v2)
// Logo · Brand · Highlights · Product · Style · Images w/ focal points · Duration → Real MP4

import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Upload, X, Loader2, Download, CheckCircle2,
  Sparkles, Megaphone, Zap, Award, Gem, Smile, Flame, Target,
  Play, RefreshCw, Eye, Star, Music, VolumeX,
} from "lucide-react";
import type { PromoData } from "./studio-promo-preview";
import { FONT_OPTIONS } from "./studio-promo-preview";

// ── Constants ─────────────────────────────────────────────────────────────────
import { useRef, useState, useCallback, useEffect } from "react";

const STYLE_PRESETS = [
  { id: "energetic",    label: "Energetic",    sub: "Fast-paced & bold",       icon: <Zap className="w-4 h-4" />,    accent: "#FFD600" },
  { id: "professional", label: "Professional", sub: "Clean & authoritative",   icon: <Award className="w-4 h-4" />,  accent: "#4A90E2" },
  { id: "luxury",       label: "Luxury",       sub: "Elegant & premium",       icon: <Gem className="w-4 h-4" />,    accent: "#C9A84C" },
  { id: "friendly",     label: "Friendly",     sub: "Warm & approachable",     icon: <Smile className="w-4 h-4" />,  accent: "#2DD4BF" },
  { id: "dramatic",     label: "Dramatic",     sub: "Intense & cinematic",     icon: <Flame className="w-4 h-4" />,  accent: "#E53E3E" },
  { id: "bold",         label: "Bold",         sub: "Direct & impactful",      icon: <Target className="w-4 h-4" />, accent: "#FF6B2B" },
];

const DURATION_OPTIONS = [5, 10, 15, 20, 30] as const;

type Dur = typeof DURATION_OPTIONS[number];
type Focus = "top" | "center" | "bottom";

const MUSIC_TRACKS = [
  { id: "drive",   file: "drive.mp3",   label: "Drive",   mood: "Energetic & forward",    color: "hsl(45 100% 58%)" },
  { id: "inspire", file: "inspire.mp3", label: "Inspire", mood: "Motivational & uplifting", color: "hsl(152 100% 44%)" },
  { id: "ambient", file: "ambient.mp3", label: "Ambient", mood: "Smooth & background",     color: "hsl(200 100% 55%)" },
  { id: "surge",   file: "surge.mp3",   label: "Surge",   mood: "Bold & intense",          color: "hsl(25 100% 57%)" },
  { id: "pulse",   file: "pulse.mp3",   label: "Pulse",   mood: "Upbeat & dynamic",        color: "hsl(280 80% 65%)" },
  { id: "deep",    file: "deep.mp3",    label: "Deep",    mood: "Cinematic & dramatic",    color: "hsl(0 70% 55%)" },
] as const;
function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-white/35 uppercase tracking-widest mb-2">{children}</p>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-4 space-y-4 ${className}`}
      style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 13%)" }}
    >
      {children}
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, maxLength, disabled, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; disabled?: boolean; multiline?: boolean;
}) {
  const base = {
    value, disabled, maxLength, placeholder,
    onChange: (e: React.ChangeEvent<any>) => onChange(e.target.value),
    className: "w-full rounded-xl text-sm px-4 py-3 outline-none transition-colors",
    style: {
      background: "hsl(222 47% 5%)", border: "1px solid hsl(222 47% 15%)",
      color: "hsl(0 0% 90%)", resize: "none" as const,
    },
  };
  return (
    <div>
      <SL>{label}</SL>
      {multiline ? <textarea {...base} rows={3} /> : <input {...base} type="text" />}
    </div>
  );
}

// ── Logo upload slot ──────────────────────────────────────────────────────────

function LogoSlot({
  url, uploading, onUpload, onRemove,
}: {
  url: string | null; uploading: boolean;
  onUpload: (file: File) => void; onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <SL>Brand Logo <span className="text-white/20 font-normal normal-case tracking-normal ml-1">— transparent PNG recommended</span></SL>
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer transition-all hover:border-white/20"
        style={{
          height: 80,
          background: url ? "hsl(222 47% 8%)" : "hsl(222 47% 5%)",
          border: `1px dashed ${url ? "hsl(25 100% 55% / 0.4)" : "hsl(222 47% 18%)"}`,
        }}
        onClick={() => !url && !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}
      >
        {uploading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : url ? (
          <div className="w-full h-full flex items-center px-4 gap-4">
            <img src={url} alt="logo" className="max-h-12 max-w-[160px] object-contain" />
            <span className="text-xs text-white/40 flex-1">Logo uploaded — appears in corner of every scene</span>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-white/25 hover:text-red-400 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center gap-2 text-white/25">
            <Upload className="w-4 h-4" />
            <span className="text-sm">Upload logo (PNG, SVG)</span>
          </div>
        )}
        <input
          ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

// ── Image slot with focal point ───────────────────────────────────────────────

function ImageSlot({
  slot, data, focus, uploading, onUpload, onRemove, onFocusChange,
}: {
  slot: number;
  data: { url: string } | null;
  focus: Focus;
  uploading: boolean;
  onUpload: (slot: number, file: File) => void;
  onRemove: (slot: number) => void;
  onFocusChange: (slot: number, f: Focus) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const FOCUSES: Focus[] = ["top", "center", "bottom"];

  return (
    <div className="flex flex-col gap-1.5">
      {/* Thumbnail */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          aspectRatio: "4/3",
          background: uploading || data ? "hsl(222 47% 8%)" : "hsl(222 47% 5%)",
          border: `1px solid ${data ? "hsl(25 100% 55% / 0.35)" : "hsl(222 47% 16%)"}`,
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onUpload(slot, f); }}
      >
        {uploading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-white/30" />
          </div>
        ) : data ? (
          <>
            <img
              src={data.url} alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: `50% ${focus === "top" ? "20%" : focus === "bottom" ? "80%" : "50%"}` }}
            />
            <button
              onClick={() => onRemove(slot)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
            <div className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "hsl(25 100% 55% / 0.75)", color: "#fff" }}>
              #{slot}
            </div>
          </>
        ) : (
          <button
            className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/25 hover:text-white/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            <span className="text-[10px]">Img {slot}</span>
          </button>
        )}
        <input
          ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(slot, f); e.target.value = ""; }}
        />
      </div>

      {/* Focal point — only show when image uploaded */}
      {data && (
        <div className="flex gap-1">
          {FOCUSES.map((f) => (
            <button
              key={f}
              onClick={() => onFocusChange(slot, f)}
              className="flex-1 text-[9px] font-semibold rounded-md py-0.5 transition-all capitalize"
              style={{
                background: focus === f ? "hsl(25 100% 55% / 0.25)" : "hsl(222 47% 8%)",
                border: `1px solid ${focus === f ? "hsl(25 100% 55% / 0.5)" : "hsl(222 47% 16%)"}`,
                color: focus === f ? "hsl(25 100% 70%)" : "hsl(222 47% 45%)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackCard({
  track, selected, playing, onSelect, onTogglePlay,
}: {
  track: typeof MUSIC_TRACKS[number];
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onTogglePlay: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl p-3 transition-all"
      style={{
        background: selected ? "hsl(222 47% 11%)" : "hsl(222 47% 7%)",
        border: `1px solid ${selected ? track.color + "55" : "hsl(222 47% 16%)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: playing ? track.color + "30" : "hsl(222 47% 14%)",
            border: `1px solid ${playing ? track.color + "60" : "hsl(222 47% 22%)"}`,
          }}
          title={playing ? "Stop preview" : "Play preview"}
        >
          {playing
            ? <Square className="w-2.5 h-2.5" style={{ color: track.color }} />
            : <Play className="w-2.5 h-2.5" style={{ color: selected ? track.color : "hsl(0 0% 50%)" }} />}
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold" style={{ color: selected ? track.color : "hsl(0 0% 75%)" }}>
              {track.label}
            </span>
            {selected && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: track.color + "25", color: track.color }}>
                Selected
              </span>
            )}
          </div>
          <p className="text-[10px] truncate" style={{ color: selected ? "hsl(0 0% 55%)" : "hsl(222 47% 40%)" }}>
            {track.mood}
          </p>
        </div>
      </div>
      {/* Mini waveform decoration */}
      <div className="mt-2 flex items-end gap-0.5 h-4">
        {[3,6,4,8,5,7,3,9,6,4,7,5,8,4,6,3,7,5,4,6].map((h, i) => (
          <div key={i} className="flex-1 rounded-full transition-all"
            style={{
              height: `${(h / 9) * 100}%`,
              background: selected ? `${track.color}${playing ? "cc" : "55"}` : "hsl(222 47% 22%)",
            }}
          />
        ))}
      </div>
    </button>
  );
}
export default function StudioPromoCodePage() {
  const { toast } = useToast();

  // Brand
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline]     = useState("");

  // Product
  const [productDesc, setProductDesc] = useState("");
  const [cta, setCta]                 = useState("");

  // Highlights
  const [features, setFeatures] = useState(["", "", ""]);

  // Style + font + duration
  const [styleId, setStyleId]   = useState("professional");
  const [fontId, setFontId]     = useState("system");
  const [duration, setDuration] = useState<Dur>(15);

  // Music
  const [musicTrackId, setMusicTrackId]   = useState<string | null>(null); // null = no music
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Logo
  const [logoUrl, setLogoUrl]           = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Images
  const [slots, setSlots]       = useState<({ url: string } | null)[]>(Array(5).fill(null));
  const [focuses, setFocuses]   = useState<Focus[]>(Array(5).fill("center"));
  const [uploading, setUploading] = useState<Set<number>>(new Set());

  // Render state
  const [previewKey, setPreviewKey]     = useState(0);
  const [showPreview, setShowPreview]   = useState(false);
  const [renderState, setRenderState]   = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // ── Upload helpers ─────────────────────────────────────────────────────────

  const uploadLogo = useCallback(async (file: File) => {
    setLogoUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind: "image" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Upload failed"); }
      const { file: f } = await res.json();
      setLogoUrl(f.providerUrl);
    } catch (err: any) {
      toast({ title: "Logo upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }, [toast]);

  const uploadImage = useCallback(async (slot: number, file: File) => {
    setUploading((s) => new Set(s).add(slot));
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind: "image" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Upload failed"); }
      const { file: f } = await res.json();
      setSlots((prev) => { const n = [...prev]; n[slot - 1] = { url: f.providerUrl }; return n; });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading((s) => { const n = new Set(s); n.delete(slot); return n; });
    }
  }, [toast]);

  const setFeature = (i: number, v: string) =>
    setFeatures((prev) => { const n = [...prev]; n[i] = v; return n; });

  const toggleTrackPreview = useCallback((trackId: string, file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingTrackId === trackId) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      audioRef.current?.pause();
      const audio = new Audio(`/music/${file}`);
      audio.volume = 0.5;
      audio.addEventListener("ended", () => setPlayingTrackId(null));
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingTrackId(trackId);
    }
  }, [playingTrackId]);

  // ── Build PromoData ────────────────────────────────────────────────────────

  const promoData: PromoData = {
    brandName: brandName || "YOUR BRAND",
    tagline: tagline || undefined,
    productDescription: productDesc || "Your product or service description.",
    stylePreset: styleId,
    callToAction: cta || "Learn More",
    images: (slots.filter(Boolean) as { url: string }[]).map((s) => s.url),
    imageFocus: focuses,
    logoUrl: logoUrl ?? undefined,
    features: features.filter(Boolean),
    targetDuration: duration,
    fontId,
  };

  // encodeURIComponent(JSON.stringify(...)) handles all Unicode correctly (apostrophes, emojis,
  // curly quotes, etc.).  The old btoa() layer crashed on anything outside Latin-1 — removed.
  let previewUrl: string;
  try {
    previewUrl = `/studio/promo/preview?d=${encodeURIComponent(JSON.stringify(promoData))}&t=${previewKey}`;
  } catch (encodeErr) {
    if (import.meta.env.DEV) {
      console.error("[studio/promo] failed to encode promo data for preview URL:", encodeErr);
    }
    previewUrl = "/studio/promo/preview";   // fallback — preview page will show empty
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function exportVideo() {
    if (!brandName.trim()) {
      toast({ title: "Enter your brand name first", variant: "destructive" });
      return;
    }
    setRenderState("rendering");
    setRenderProgress(0);
    setVideoUrl(null);
    setErrorMsg(null);

    // Stop any playing preview before render starts
    audioRef.current?.pause();
    setPlayingTrackId(null);

    try {
      const selectedTrack = MUSIC_TRACKS.find((t) => t.id === musicTrackId);
      const res = await apiRequest("POST", "/api/studio/promo/render", {
        ...promoData,
        brandName: brandName.trim(),
        productDescription: productDesc.trim() || "Discover what we offer.",
        musicTrack: selectedTrack?.file ?? null,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Render failed"); }
      const { renderId } = await res.json();

      const totalFrames = duration * 24;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pr = await apiRequest("GET", `/api/studio/promo/render/${renderId}/status`);
          if (!pr.ok) return;
          const { status, frame, videoUrl: url, error } = await pr.json();
          if (frame) setRenderProgress(Math.round((frame / totalFrames) * 100));
          if (status === "complete" && url) {
            clearInterval(pollRef.current!);
            setVideoUrl(url);
            setRenderState("done");
            setRenderProgress(100);
            toast({ title: "🎬 Promo video ready!" });
          } else if (status === "error") {
            clearInterval(pollRef.current!);
            setErrorMsg(error || "Render failed");
            setRenderState("error");
          }
        } catch {}
      }, 1200);
    } catch (err: any) {
      setRenderState("error");
      setErrorMsg(err.message);
    }
  }

  const canExport = brandName.trim().length > 0 && renderState !== "rendering" && uploading.size === 0;
  const selectedStyle = STYLE_PRESETS.find((s) => s.id === styleId)!;

  // ── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 47% 3%)" }}>

      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: "hsl(222 47% 3% / 0.95)", borderBottom: "1px solid hsl(222 47% 11%)", backdropFilter: "blur(12px)" }}
      >
        <Link href="/studio">
          <button className="p-1.5 rounded-lg hover:bg-white/8 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white/50" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))" }}>
            <Megaphone className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Promo Video</h1>
            <p className="text-[10px] text-white/35 leading-none mt-0.5">Framer Motion → Playwright → ffmpeg → MP4</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "hsl(152 100% 44% / 0.12)", color: "hsl(152 100% 44%)", border: "1px solid hsl(152 100% 44% / 0.25)" }}>
            FREE
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Logo */}
        <Card>
          <LogoSlot url={logoUrl} uploading={logoUploading} onUpload={uploadLogo} onRemove={() => setLogoUrl(null)} />
        </Card>

        {/* Brand */}
        <Card>
          <TextField label="Brand / Business Name *" value={brandName} onChange={setBrandName}
            placeholder="e.g. ItsLaw, MYTTORN, B4U Repo" maxLength={60} disabled={renderState === "rendering"} />
          <TextField label="Tagline (optional)" value={tagline} onChange={setTagline}
            placeholder='e.g. "Justice You Can Trust"  ·  "Fast. Reliable. 24/7."' maxLength={80} disabled={renderState === "rendering"} />
        </Card>

        {/* Product */}
        <Card>
          <TextField label="What are you promoting?" value={productDesc} onChange={setProductDesc}
            placeholder="e.g. Full-service immigration law firm. Licensed attorneys, free consultations, serving all 50 states."
            maxLength={300} multiline disabled={renderState === "rendering"} />
          <TextField label="Call to Action" value={cta} onChange={setCta}
            placeholder="e.g.  Call Now   ·   Book Free Consult   ·   Download the App" maxLength={60} disabled={renderState === "rendering"} />
        </Card>

        {/* Highlights */}
        <Card>
          <div>
            <SL>Key Highlights <span className="text-white/20 font-normal normal-case tracking-normal ml-1">— up to 3, shown as numbered feature callouts</span></SL>
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{ background: features[i] ? `${selectedStyle.accent}33` : "hsl(222 47% 10%)", color: features[i] ? selectedStyle.accent : "hsl(222 47% 35%)", border: `1px solid ${features[i] ? selectedStyle.accent + "44" : "hsl(222 47% 18%)"}` }}>
                    {i + 1}
                  </div>
                  <input
                    type="text"
                    value={features[i]}
                    onChange={(e) => setFeature(i, e.target.value)}
                    maxLength={60}
                    placeholder={["e.g. Licensed & Certified", "Free Consultations", "Fast Response Times"][i]}
                    disabled={renderState === "rendering"}
                    className="flex-1 rounded-xl text-sm px-3 py-2 outline-none transition-colors"
                    style={{
                      background: "hsl(222 47% 5%)", border: "1px solid hsl(222 47% 15%)",
                      color: "hsl(0 0% 88%)",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Style */}
        <div>
          <SL>Video Style</SL>
          <div className="grid grid-cols-3 gap-2">
            {STYLE_PRESETS.map((s) => {
              const active = styleId === s.id;
              return (
                <button
                  key={s.id}
                  disabled={renderState === "rendering"}
                  onClick={() => { setStyleId(s.id); setShowPreview(false); }}
                  className="text-left rounded-xl p-3 transition-all disabled:opacity-40"
                  style={{
                    background: active ? "hsl(222 47% 10%)" : "hsl(222 47% 6%)",
                    border: `1px solid ${active ? s.accent + "55" : "hsl(222 47% 14%)"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: active ? s.accent : "hsl(222 47% 45%)" }}>
                    {s.icon}
                    <span className="text-xs font-bold">{s.label}</span>
                  </div>
                  <p className="text-[10px] leading-snug" style={{ color: active ? "hsl(0 0% 58%)" : "hsl(222 47% 38%)" }}>{s.sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font */}
        <div>
          <SL>Brand Name Font</SL>
          <div className="grid grid-cols-3 gap-2">
            {FONT_OPTIONS.map((f) => {
              const active = fontId === f.id;
              return (
                <button
                  key={f.id}
                  disabled={renderState === "rendering"}
                  onClick={() => { setFontId(f.id); setShowPreview(false); }}
                  className="text-left rounded-xl p-3 transition-all disabled:opacity-40"
                  style={{
                    background: active ? "hsl(222 47% 10%)" : "hsl(222 47% 6%)",
                    border: `1px solid ${active ? selectedStyle.accent + "55" : "hsl(222 47% 14%)"}`,
                  }}
                >
                  <div
                    className="text-lg font-bold leading-none mb-1"
                    style={{
                      fontFamily: f.family ? `"${f.family}", system-ui, sans-serif` : "inherit",
                      color: active ? selectedStyle.accent : "hsl(0 0% 80%)",
                    }}
                  >
                    {f.preview}
                  </div>
                  <div className="text-[11px] font-semibold" style={{ color: active ? "hsl(0 0% 80%)" : "hsl(222 47% 55%)" }}>
                    {f.label}
                  </div>
                  <div className="text-[10px] leading-tight mt-0.5" style={{ color: active ? "hsl(0 0% 55%)" : "hsl(222 47% 38%)" }}>
                    {f.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Images */}
        <div>
          <SL>
            Scene Images <span className="text-white/20 font-normal normal-case tracking-normal ml-1">— up to 5 · tap Top/Center/Bottom to control crop</span>
          </SL>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <ImageSlot
                key={i + 1}
                slot={i + 1}
                data={slots[i]}
                focus={focuses[i]}
                uploading={uploading.has(i + 1)}
                onUpload={uploadImage}
                onRemove={(slot) => { setSlots((p) => { const n = [...p]; n[slot - 1] = null; return n; }); }}
                onFocusChange={(slot, f) => { setFocuses((p) => { const n = [...p]; n[slot - 1] = f; return n; }); }}
              />
            ))}
          </div>
          <p className="text-[11px] text-white/20 mt-2">
            #1 Brand scene · #2 Highlights bg · #2–3 Product showcase · #4 Secondary shot · Last = CTA texture
          </p>
        </div>

        {/* Duration */}
        <div>
          <SL>Video Length</SL>
          <div className="flex gap-2 flex-wrap">
            {DURATION_OPTIONS.map((d) => {
              const active = duration === d;
              return (
                <button
                  key={d}
                  disabled={renderState === "rendering"}
                  onClick={() => { setDuration(d); setShowPreview(false); }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: active ? "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))" : "hsl(222 47% 8%)",
                    border: `1px solid ${active ? "transparent" : "hsl(222 47% 17%)"}`,
                    color: active ? "#fff" : "hsl(222 47% 55%)",
                  }}
                >
                  {d}s
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/22 mt-1.5">
            Render ≈ {Math.round(duration * 1.5)}–{Math.round(duration * 2.5)}s · 24fps · 1280×720 · libx264
            {features.filter(Boolean).length > 0 && duration >= 10 ? " · 4 scenes" : " · 3 scenes"}
          </p>
        </div>

        {/* Music */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SL>Background Music</SL>
            <Music className="w-3 h-3 text-white/30 -mt-2" />
          </div>

          {/* No-music option */}
          <button
            onClick={() => setMusicTrackId(null)}
            disabled={renderState === "rendering"}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-2 transition-all disabled:opacity-40"
            style={{
              background: musicTrackId === null ? "hsl(222 47% 11%)" : "hsl(222 47% 7%)",
              border: `1px solid ${musicTrackId === null ? "hsl(222 47% 32%)" : "hsl(222 47% 16%)"}`,
            }}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(222 47% 14%)", border: "1px solid hsl(222 47% 22%)" }}>
              <VolumeX className="w-3.5 h-3.5 text-white/40" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold" style={{ color: musicTrackId === null ? "hsl(0 0% 80%)" : "hsl(0 0% 50%)" }}>
                No Music
                {musicTrackId === null && (
                  <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(222 47% 20%)", color: "hsl(222 47% 60%)" }}>Default</span>
                )}
              </p>
              <p className="text-[10px]" style={{ color: "hsl(222 47% 40%)" }}>Silent export — voice-over or sound added later</p>
            </div>
          </button>

          {/* Track grid */}
          <div className="grid grid-cols-2 gap-2">
            {MUSIC_TRACKS.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                selected={musicTrackId === track.id}
                playing={playingTrackId === track.id}
                onSelect={() => { if (renderState !== "rendering") setMusicTrackId(track.id); }}
                onTogglePlay={(e) => toggleTrackPreview(track.id, track.file, e)}
              />
            ))}
          </div>

          <p className="text-[11px] text-white/22 mt-1.5">
            Mixed at −18 dB so it never drowns a voice-over &nbsp;·&nbsp; Royalty-free
          </p>
        </div>

        {/* Live preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL>Live Preview</SL>
            <button
              onClick={() => { setPreviewKey((k) => k + 1); setShowPreview(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(222 47% 17%)", color: "hsl(0 0% 55%)" }}
            >
              {showPreview ? <RefreshCw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {showPreview ? "Replay" : "Preview Animation"}
            </button>
          </div>
          {showPreview ? (
            <div className="rounded-2xl overflow-hidden" style={{ aspectRatio: "16/9", background: "#000", border: "1px solid hsl(222 47% 13%)" }}>
              <iframe key={previewKey} src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} title="Promo Preview" />
            </div>
          ) : (
            <div
              className="rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/2 transition-colors"
              style={{ aspectRatio: "16/9", background: "hsl(222 47% 4%)", border: "1px dashed hsl(222 47% 16%)" }}
              onClick={() => { setPreviewKey((k) => k + 1); setShowPreview(true); }}
            >
              <Eye className="w-8 h-8 text-white/12" />
              <p className="text-sm text-white/25">Click to preview your animation</p>
              {brandName && (
                <p className="text-xs text-white/18">{selectedStyle.label} · {duration}s · {brandName}</p>
              )}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="space-y-2">
          <Button
            onClick={exportVideo}
            disabled={!canExport}
            className="w-full h-12 text-sm font-bold rounded-xl"
            style={{
              background: canExport ? "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))" : "hsl(222 47% 10%)",
              color: canExport ? "#fff" : "hsl(222 47% 38%)", border: "none",
            }}
          >
            {renderState === "rendering" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering {duration}s video… {renderProgress > 0 ? `${renderProgress}%` : "starting"}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Export {duration}s MP4
              </span>
            )}
          </Button>

          {renderState === "rendering" && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(222 47% 10%)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${renderProgress}%`,
                  background: "linear-gradient(to right, hsl(25 100% 55%), hsl(45 100% 58%))",
                }}
              />
            </div>
          )}
        </div>

        {/* Success */}
        {renderState === "done" && videoUrl && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(25 100% 55% / 0.35)" }}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(25 100% 55% / 0.08)", borderBottom: "1px solid hsl(25 100% 55% / 0.18)" }}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{duration}s promo video ready</span>
              <Star className="w-3.5 h-3.5 text-yellow-400 ml-1" />
            </div>
            <video src={videoUrl} controls playsInline autoPlay className="w-full" style={{ background: "#000", maxHeight: 400 }} />
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: "hsl(222 47% 4%)" }}>
              <a href={videoUrl} download={`${brandName.replace(/\s+/g, "-").toLowerCase()}-promo.mp4`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2 text-xs rounded-lg"
                  style={{ borderColor: "hsl(25 100% 55% / 0.35)", color: "hsl(25 100% 68%)", background: "transparent" }}>
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </Button>
              </a>
              <button onClick={() => { setRenderState("idle"); setVideoUrl(null); setShowPreview(false); }}
                className="text-xs text-white/25 hover:text-white/45 ml-auto">
                Make another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {renderState === "error" && errorMsg && (
          <div className="rounded-xl px-4 py-3"
            style={{ background: "hsl(0 80% 18% / 0.3)", border: "1px solid hsl(0 80% 48% / 0.3)", color: "hsl(0 80% 72%)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold mb-0.5">Render error</p>
                <p className="text-xs opacity-75">{errorMsg}</p>
              </div>
              <button onClick={() => { setRenderState("idle"); setErrorMsg(null); }} className="text-xs opacity-45 hover:opacity-70">Dismiss</button>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
