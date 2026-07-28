// GUBER Studio — Code-Based Promo Video
// Fill in brand/product/style → live animated preview → export real MP4
// Rendered by Playwright + Framer Motion + ffmpeg — no AI generation fees.

import { useRef, useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Upload, X, Loader2, Download, CheckCircle2,
  Sparkles, Megaphone, Zap, Award, Gem, Smile, Flame, Target,
  Play, RefreshCw, Eye,
} from "lucide-react";
import type { PromoData } from "./studio-promo-preview";

// ── Style presets ─────────────────────────────────────────────────────────────

const STYLE_PRESETS = [
  { id: "energetic",    label: "Energetic",    tagline: "Fast-paced & bold",       icon: <Zap className="w-4 h-4" />,    accent: "hsl(45 100% 58%)" },
  { id: "professional", label: "Professional", tagline: "Clean & authoritative",   icon: <Award className="w-4 h-4" />,  accent: "hsl(200 100% 55%)" },
  { id: "luxury",       label: "Luxury",       tagline: "Elegant & premium",       icon: <Gem className="w-4 h-4" />,    accent: "hsl(42 68% 55%)" },
  { id: "friendly",     label: "Friendly",     tagline: "Warm & approachable",     icon: <Smile className="w-4 h-4" />,  accent: "hsl(172 70% 50%)" },
  { id: "dramatic",     label: "Dramatic",     tagline: "Intense & cinematic",     icon: <Flame className="w-4 h-4" />,  accent: "hsl(0 70% 55%)" },
  { id: "bold",         label: "Bold",         tagline: "Direct & impactful",      icon: <Target className="w-4 h-4" />, accent: "hsl(20 100% 57%)" },
];

const DURATION_OPTIONS = [5, 10, 15, 20, 30] as const;
type DurationOption = typeof DURATION_OPTIONS[number];

// ── Image slot ────────────────────────────────────────────────────────────────

function ImageSlotCard({
  slot, data, onUpload, onRemove,
}: {
  slot: number; data: { url: string } | null;
  onUpload: (slot: number, file: File) => void;
  onRemove: (slot: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="relative rounded-xl overflow-hidden border transition-all"
      style={{
        aspectRatio: "1/1",
        background: data ? "transparent" : "hsl(222 47% 7%)",
        borderColor: data ? "hsl(25 100% 55% / 0.4)" : "hsl(222 47% 18%)",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onUpload(slot, f); }}
    >
      {data ? (
        <>
          <img src={data.url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(slot)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80"
          >
            <X className="w-3 h-3 text-white" />
          </button>
          <div
            className="absolute top-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded-full"
            style={{ background: "hsl(25 100% 55% / 0.7)", color: "#fff" }}
          >
            #{slot}
          </div>
        </>
      ) : (
        <button
          className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/30 hover:text-white/60"
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
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">{children}</p>;
}

function InputField({
  label, value, onChange, placeholder, maxLength, disabled, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; disabled?: boolean; multiline?: boolean;
}) {
  const shared = {
    value, disabled, maxLength, placeholder,
    onChange: (e: React.ChangeEvent<any>) => onChange(e.target.value),
    className: "w-full rounded-xl text-sm px-4 py-3 outline-none transition-colors",
    style: {
      background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 16%)",
      color: "hsl(0 0% 90%)", resize: "none" as const,
    },
  };
  return (
    <div>
      <SL>{label}</SL>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type="text" />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudioPromoCodePage() {
  const { toast } = useToast();

  const [brandName, setBrandName]     = useState("");
  const [tagline, setTagline]         = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [cta, setCta]                 = useState("");
  const [styleId, setStyleId]         = useState("professional");
  const [duration, setDuration]       = useState<DurationOption>(15);

  const [slots, setSlots]       = useState<({ url: string; name: string } | null)[]>(Array(5).fill(null));
  const [uploading, setUploading] = useState<Set<number>>(new Set());

  const [previewKey, setPreviewKey]   = useState(0);    // bump to reload iframe
  const [showPreview, setShowPreview] = useState(false);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Build PromoData for the preview iframe
  const promoData: PromoData = {
    brandName: brandName || "YOUR BRAND",
    tagline: tagline || undefined,
    productDescription: productDesc || "Your product or service description here.",
    stylePreset: styleId,
    callToAction: cta || "Learn More",
    images: (slots.filter(Boolean) as { url: string }[]).map((s) => s.url),
    targetDuration: duration,
  };

  const previewUrl =
    `/studio/promo/preview?d=${encodeURIComponent(btoa(JSON.stringify(promoData)))}&t=${previewKey}`;

  const uploadImage = useCallback(async (slot: number, file: File) => {
    setUploading((s) => new Set(s).add(slot));
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind: "image" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Upload failed"); }
      const { file: f } = await res.json();
      setSlots((prev) => { const n = [...prev]; n[slot - 1] = { url: f.providerUrl, name: `Image ${slot}` }; return n; });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading((s) => { const n = new Set(s); n.delete(slot); return n; });
    }
  }, [toast]);

  const removeSlot = useCallback((slot: number) => {
    setSlots((prev) => { const n = [...prev]; n[slot - 1] = null; return n; });
  }, []);

  async function exportVideo() {
    if (!brandName.trim()) { toast({ title: "Enter your brand name", variant: "destructive" }); return; }
    setRenderState("rendering");
    setRenderProgress(0);
    setVideoUrl(null);
    setErrorMsg(null);

    try {
      const res = await apiRequest("POST", "/api/studio/promo/render", {
        brandName: brandName.trim(),
        tagline: tagline.trim() || undefined,
        productDescription: productDesc.trim() || "Discover what we offer.",
        stylePreset: styleId,
        callToAction: cta.trim() || "Learn More",
        images: (slots.filter(Boolean) as { url: string }[]).map((s) => s.url),
        targetDuration: duration,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Render failed");
      }
      const { renderId } = await res.json();

      // Poll for progress
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
            toast({ title: "🎬 Promo video exported!" });
          } else if (status === "error") {
            clearInterval(pollRef.current!);
            setErrorMsg(error || "Render failed");
            setRenderState("error");
          }
        } catch {}
      }, 1000);
    } catch (err: any) {
      setRenderState("error");
      setErrorMsg(err.message);
    }
  }

  const filledSlots = slots.filter(Boolean).length;
  const canExport = brandName.trim().length > 0 && renderState !== "rendering" && uploading.size === 0;
  const selectedStyle = STYLE_PRESETS.find((s) => s.id === styleId)!;

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 47% 3%)" }}>

      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: "hsl(222 47% 3% / 0.95)", borderBottom: "1px solid hsl(222 47% 12%)", backdropFilter: "blur(12px)" }}
      >
        <Link href="/studio">
          <button className="p-1.5 rounded-lg hover:bg-white/8 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))" }}
          >
            <Megaphone className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Promo Video</h1>
            <p className="text-[10px] text-white/40 leading-none mt-0.5">React + Framer Motion → Real MP4 Export</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-white/30 hidden sm:block">No AI generation fees</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 44%)", border: "1px solid hsl(152 100% 44% / 0.3)" }}
          >
            FREE
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Brand ── */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 13%)" }}
        >
          <SL>Brand</SL>
          <InputField label="Brand / Business Name *" value={brandName} onChange={setBrandName}
            placeholder="e.g. B4U Repo, Apex Services, City Towing" maxLength={60} disabled={renderState === "rendering"} />
          <InputField label="Tagline (optional)" value={tagline} onChange={setTagline}
            placeholder="e.g. Fast. Reliable. 24/7." maxLength={80} disabled={renderState === "rendering"} />
        </div>

        {/* ── Product ── */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 13%)" }}
        >
          <SL>Product / Service</SL>
          <InputField label="What are you promoting?" value={productDesc} onChange={setProductDesc}
            placeholder="e.g. 24/7 tow truck and repo services. Licensed, insured, fast response across Mobile County."
            maxLength={300} multiline disabled={renderState === "rendering"} />
          <InputField label="Call to Action" value={cta} onChange={setCta}
            placeholder="e.g. Call Now, Download the App, Visit guberapp.com"
            maxLength={60} disabled={renderState === "rendering"} />
        </div>

        {/* ── Style ── */}
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
                    background: active ? `hsl(222 47% 11%)` : "hsl(222 47% 7%)",
                    border: `1px solid ${active ? s.accent + "60" : "hsl(222 47% 16%)"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: active ? s.accent : "hsl(222 47% 50%)" }}>
                    {s.icon}
                    <span className="text-xs font-bold">{s.label}</span>
                  </div>
                  <p className="text-[10px] leading-snug" style={{ color: active ? "hsl(0 0% 65%)" : "hsl(222 47% 40%)" }}>
                    {s.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Images ── */}
        <div>
          <SL>
            Images <span className="text-white/20 font-normal normal-case tracking-normal ml-1">— up to 5</span>
          </SL>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, i) => {
              const slot = i + 1;
              return (
                <div key={slot}>
                  {uploading.has(slot) ? (
                    <div
                      className="rounded-xl flex items-center justify-center"
                      style={{ aspectRatio: "1/1", background: "hsl(222 47% 7%)", border: "1px solid hsl(25 100% 55% / 0.3)" }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                    </div>
                  ) : (
                    <ImageSlotCard slot={slot} data={slots[i]} onUpload={uploadImage} onRemove={removeSlot} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Duration ── */}
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
                    background: active ? "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))" : "hsl(222 47% 9%)",
                    border: `1px solid ${active ? "transparent" : "hsl(222 47% 18%)"}`,
                    color: active ? "#fff" : "hsl(222 47% 60%)",
                  }}
                >
                  {d}s
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/25 mt-1.5">
            Render time ≈ {Math.round(duration * 1.5)}–{Math.round(duration * 2.5)}s &nbsp;·&nbsp; Encoded by ffmpeg on this server
          </p>
        </div>

        {/* ── Live preview ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL>Live Preview</SL>
            <button
              onClick={() => { setPreviewKey((k) => k + 1); setShowPreview(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 18%)", color: "hsl(0 0% 60%)" }}
            >
              {showPreview ? <RefreshCw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {showPreview ? "Replay" : "Preview Animation"}
            </button>
          </div>

          {showPreview ? (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ aspectRatio: "16/9", background: "#000", border: "1px solid hsl(222 47% 14%)" }}
            >
              <iframe
                key={previewKey}
                src={previewUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Promo Preview"
              />
            </div>
          ) : (
            <div
              className="rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/3 transition-colors"
              style={{ aspectRatio: "16/9", background: "hsl(222 47% 5%)", border: "1px dashed hsl(222 47% 18%)" }}
              onClick={() => { setPreviewKey((k) => k + 1); setShowPreview(true); }}
            >
              <Eye className="w-8 h-8 text-white/15" />
              <p className="text-sm text-white/30">Click to preview your animation</p>
              {brandName && (
                <p className="text-xs text-white/20">
                  {selectedStyle.label} style · {duration}s
                  {brandName ? ` · ${brandName}` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Export button ── */}
        <div className="space-y-2">
          <Button
            onClick={exportVideo}
            disabled={!canExport}
            className="w-full h-12 text-sm font-bold rounded-xl"
            style={{
              background: canExport
                ? "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))"
                : "hsl(222 47% 12%)",
              color: canExport ? "#fff" : "hsl(222 47% 40%)",
              border: "none",
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
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "hsl(222 47% 12%)" }}
            >
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

        {/* ── Success ── */}
        {renderState === "done" && videoUrl && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(25 100% 55% / 0.4)" }}>
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(25 100% 55% / 0.1)", borderBottom: "1px solid hsl(25 100% 55% / 0.2)" }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{duration}s promo video ready</span>
            </div>
            <video
              src={videoUrl}
              controls
              playsInline
              autoPlay
              className="w-full"
              style={{ background: "#000", maxHeight: 400 }}
            />
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: "hsl(222 47% 5%)" }}>
              <a href={videoUrl} download={`${brandName.replace(/\s+/g, "-").toLowerCase()}-promo.mp4`} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline" size="sm"
                  className="gap-2 text-xs rounded-lg"
                  style={{ borderColor: "hsl(25 100% 55% / 0.4)", color: "hsl(25 100% 70%)", background: "transparent" }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </Button>
              </a>
              <button
                onClick={() => { setRenderState("idle"); setVideoUrl(null); setShowPreview(false); }}
                className="text-xs text-white/30 hover:text-white/50 ml-auto"
              >
                Make another
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {renderState === "error" && errorMsg && (
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: "hsl(0 80% 20% / 0.3)", border: "1px solid hsl(0 80% 50% / 0.3)", color: "hsl(0 80% 75%)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold mb-0.5">Render error</p>
                <p className="text-xs opacity-80">{errorMsg}</p>
              </div>
              <button
                onClick={() => { setRenderState("idle"); setErrorMsg(null); }}
                className="text-xs opacity-50 hover:opacity-80 flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
