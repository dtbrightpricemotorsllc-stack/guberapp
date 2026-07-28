// GUBER Studio — Promo Video Subagent
// Guided wizard: brand + product + style + audience + CTA + images → AI promo video
// No manual prompt writing — the AI builds the brief automatically.

import { useRef, useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Upload, X, Loader2, Download, CheckCircle2,
  Sparkles, Film, ImageIcon, Mic, Scissors, Megaphone,
  Zap, Award, Gem, Smile, Flame, Target,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageSlot = { slot: number; url: string; name: string };
type AgentLog  = { ts: number; phase: number; message: string };

type JobStatus = {
  jobId: string;
  status: "running" | "complete" | "error";
  phase: number;
  logs: AgentLog[];
  manifest: Record<string, string[]> | null;
  videoUrl: string | null;
  error: string | null;
  targetDuration?: number;
};

// ── Style presets ─────────────────────────────────────────────────────────────

type StylePreset = {
  id: string;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  accent: string;
  description: string;
};

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "energetic",
    label: "Energetic",
    tagline: "Fast-paced & bold",
    icon: <Zap className="w-5 h-5" />,
    accent: "hsl(45 100% 58%)",
    description: "Dynamic zooms, fast cuts, high energy — grabs attention instantly",
  },
  {
    id: "professional",
    label: "Professional",
    tagline: "Clean & authoritative",
    icon: <Award className="w-5 h-5" />,
    accent: "hsl(200 100% 55%)",
    description: "Steady movements, polished presentation, corporate confidence",
  },
  {
    id: "luxury",
    label: "Luxury",
    tagline: "Elegant & premium",
    icon: <Gem className="w-5 h-5" />,
    accent: "hsl(270 100% 70%)",
    description: "Slow cinematic reveals, elegant transitions, aspirational feel",
  },
  {
    id: "friendly",
    label: "Friendly",
    tagline: "Warm & approachable",
    icon: <Smile className="w-5 h-5" />,
    accent: "hsl(152 100% 44%)",
    description: "Soft pans, warm atmosphere, inviting and trustworthy tone",
  },
  {
    id: "dramatic",
    label: "Dramatic",
    tagline: "Intense & cinematic",
    icon: <Flame className="w-5 h-5" />,
    accent: "hsl(0 80% 60%)",
    description: "High-contrast zooms, intense atmosphere, powerful emotional impact",
  },
  {
    id: "bold",
    label: "Bold",
    tagline: "Direct & impactful",
    icon: <Target className="w-5 h-5" />,
    accent: "hsl(25 100% 55%)",
    description: "Strong confident cuts, impactful visuals, no-nonsense message",
  },
];

const PHASE_LABELS = ["", "Vision Indexing", "Edit & Composite", "Script & Voice", "Video Render"];
const PHASE_COLORS: Record<number, string> = {
  1: "text-cyan-400", 2: "text-violet-400", 3: "text-emerald-400", 4: "text-amber-400",
};
const PHASE_ICONS = [
  null,
  <ImageIcon key="1" className="w-3.5 h-3.5" />,
  <Scissors key="2" className="w-3.5 h-3.5" />,
  <Mic key="3" className="w-3.5 h-3.5" />,
  <Film key="4" className="w-3.5 h-3.5" />,
];

const DURATION_OPTIONS = [5, 10, 15, 20, 30] as const;
type DurationOption = typeof DURATION_OPTIONS[number];

// ── Image slot ────────────────────────────────────────────────────────────────

function ImageSlotCard({
  slot, data, onUpload, onRemove,
}: {
  slot: number;
  data: ImageSlot | null;
  onUpload: (slot: number, file: File) => void;
  onRemove: (slot: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="relative rounded-2xl overflow-hidden border transition-all duration-200"
      style={{
        aspectRatio: "1/1",
        background: data ? "transparent" : "hsl(222 47% 7%)",
        borderColor: data ? "hsl(270 100% 65% / 0.4)" : "hsl(222 47% 18%)",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onUpload(slot, f); }}
    >
      {data ? (
        <>
          <img src={data.url} alt={data.name} className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(slot)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
          <div
            className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "hsl(270 100% 65% / 0.7)", color: "#fff" }}
          >
            #{slot}
          </div>
        </>
      ) : (
        <button
          className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30 hover:text-white/60 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-5 h-5" />
          <span className="text-xs font-medium">Image {slot}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(slot, f); e.target.value = ""; }}
      />
    </div>
  );
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs, status }: { logs: AgentLog[]; status: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs.length]);
  return (
    <div
      className="rounded-xl font-mono text-xs overflow-y-auto"
      style={{ background: "hsl(222 47% 4%)", border: "1px solid hsl(222 47% 14%)", minHeight: 160, maxHeight: 240, padding: "12px 14px" }}
    >
      {logs.length === 0 && <p className="text-white/25 italic">Agent logs will appear here…</p>}
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2 mb-1 leading-relaxed">
          <span style={{ color: "hsl(222 47% 45%)", flexShrink: 0 }}>
            {new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 rounded ${PHASE_COLORS[l.phase] ?? "text-white/50"}`}>
            P{l.phase}
          </span>
          <span className="text-white/75 break-words min-w-0">{l.message}</span>
        </div>
      ))}
      {status === "running" && (
        <div className="flex items-center gap-2 mt-2 text-white/40">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          <span>Generating your promo video… this takes a few minutes per scene</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">{children}</p>
  );
}

// ── Text input ────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, maxLength, disabled, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; disabled?: boolean; multiline?: boolean;
}) {
  const shared = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    disabled,
    maxLength,
    placeholder,
    className: "w-full rounded-xl text-sm px-4 py-3 transition-colors outline-none focus:ring-1",
    style: {
      background: "hsl(222 47% 6%)",
      border: "1px solid hsl(222 47% 16%)",
      color: "hsl(0 0% 90%)",
      resize: "none" as const,
    },
  };
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {multiline
        ? <textarea {...shared} rows={3} />
        : <input {...shared} type="text" />
      }
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudioPromoAgentPage() {
  const { toast } = useToast();

  // Form state
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [styleId, setStyleId] = useState<string>("professional");
  const [duration, setDuration] = useState<DurationOption>(15);

  // Image slots
  const [slots, setSlots] = useState<(ImageSlot | null)[]>(Array(5).fill(null));
  const [uploading, setUploading] = useState<Set<number>>(new Set());

  // Job state
  const [job, setJob] = useState<JobStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Resume latest job on mount
  useEffect(() => {
    (async () => {
      setResuming(true);
      try {
        const res = await apiRequest("GET", "/api/studio/promo/latest");
        if (!res.ok) return;
        const { job: latestJob } = await res.json();
        if (!latestJob) return;
        setJob(latestJob);
        if (latestJob.status === "running") { setRunning(true); startPolling(latestJob.jobId); }
      } catch {}
      finally { setResuming(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pr = await apiRequest("GET", `/api/studio/agent/status/${id}`);
        if (!pr.ok) return;
        const data: JobStatus = await pr.json();
        setJob(data);
        if (data.status === "complete" || data.status === "error") {
          clearInterval(pollRef.current!);
          setRunning(false);
          if (data.status === "complete") {
            toast({ title: "🎬 Promo video ready!" });
          } else {
            toast({ title: "Agent error", description: data.error ?? "Unknown error", variant: "destructive" });
          }
        }
      } catch {}
    }, 3000);
  }

  const uploadImage = useCallback(async (slot: number, file: File) => {
    setUploading((s) => new Set(s).add(slot));
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind: "image" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Upload failed"); }
      const { file: f } = await res.json();
      setSlots((prev) => { const next = [...prev]; next[slot - 1] = { slot, url: f.providerUrl, name: `Image ${slot}` }; return next; });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading((s) => { const n = new Set(s); n.delete(slot); return n; });
    }
  }, [toast]);

  const removeSlot = useCallback((slot: number) => {
    setSlots((prev) => { const next = [...prev]; next[slot - 1] = null; return next; });
  }, []);

  async function generate() {
    if (!brandName.trim()) { toast({ title: "Enter your brand name", variant: "destructive" }); return; }
    if (!productDesc.trim()) { toast({ title: "Describe your product or service", variant: "destructive" }); return; }
    const images = slots.filter(Boolean) as ImageSlot[];
    if (images.length === 0) { toast({ title: "Upload at least one image", variant: "destructive" }); return; }

    setRunning(true);
    setJob(null);

    try {
      const res = await apiRequest("POST", "/api/studio/promo/start", {
        brandName: brandName.trim(),
        tagline: tagline.trim(),
        productDescription: productDesc.trim(),
        stylePreset: styleId,
        targetAudience: targetAudience.trim() || "general audience",
        callToAction: callToAction.trim() || "Learn more",
        images: images.map((s) => ({ slot: s.slot, name: s.name, url: s.url })),
        targetDuration: duration,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Failed to start"); }
      const { jobId } = await res.json();
      startPolling(jobId);
    } catch (err: any) {
      setRunning(false);
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    }
  }

  function dismiss() {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null);
    setRunning(false);
  }

  const filledSlots = slots.filter(Boolean).length;
  const canGenerate = brandName.trim().length > 0 && productDesc.trim().length > 0 &&
    filledSlots > 0 && !running && uploading.size === 0;

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
            <p className="text-[10px] text-white/40 leading-none mt-0.5">AI-Generated Promotional Video</p>
          </div>
        </div>
        {resuming && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-white/35">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking…
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Phase badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[1, 2, 3, 4].map((p) => (
            <div
              key={p}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0"
              style={{
                background: job && job.phase >= p ? "hsl(25 100% 55% / 0.15)" : "hsl(222 47% 9%)",
                border: `1px solid ${job && job.phase >= p ? "hsl(25 100% 55% / 0.3)" : "hsl(222 47% 16%)"}`,
                color: job && job.phase >= p ? "hsl(25 100% 70%)" : "hsl(222 47% 55%)",
              }}
            >
              {PHASE_ICONS[p]}
              {PHASE_LABELS[p]}
            </div>
          ))}
        </div>

        {/* Resume banner */}
        {job && !running && job.status === "running" && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "hsl(25 100% 55% / 0.08)", border: "1px solid hsl(25 100% 55% / 0.2)" }}
          >
            <Loader2 className="w-4 h-4 text-orange-400 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Previous promo job found</p>
              <p className="text-xs text-white/50">Your {job.targetDuration}s promo video is still generating.</p>
            </div>
            <button
              onClick={() => { setRunning(true); startPolling(job.jobId); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: "hsl(25 100% 55% / 0.2)", color: "hsl(25 100% 70%)" }}
            >
              Resume
            </button>
          </div>
        )}

        {/* ── Brand info ── */}
        <div className="space-y-4">
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 13%)" }}
          >
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Brand</p>
            <Field
              label="Brand / Business Name *"
              value={brandName}
              onChange={setBrandName}
              placeholder="e.g. B4U Repo, City Towing, Apex Services"
              disabled={running}
              maxLength={80}
            />
            <Field
              label="Tagline (optional)"
              value={tagline}
              onChange={setTagline}
              placeholder="e.g. Fast. Reliable. Affordable."
              disabled={running}
              maxLength={120}
            />
          </div>

          {/* ── Product/service ── */}
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 13%)" }}
          >
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Product / Service</p>
            <Field
              label="What are you promoting? *"
              value={productDesc}
              onChange={setProductDesc}
              placeholder="e.g. 24/7 tow truck and repo services across Mobile County. Licensed, insured, fast response."
              disabled={running}
              maxLength={400}
              multiline
            />
            <Field
              label="Target audience"
              value={targetAudience}
              onChange={setTargetAudience}
              placeholder="e.g. car dealerships, lenders, local businesses, homeowners"
              disabled={running}
              maxLength={120}
            />
            <Field
              label="Call to action"
              value={callToAction}
              onChange={setCallToAction}
              placeholder="e.g. Call us now, Download the app, Visit guberapp.com"
              disabled={running}
              maxLength={100}
            />
          </div>
        </div>

        {/* ── Style picker ── */}
        <div>
          <SectionLabel>Video Style</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STYLE_PRESETS.map((s) => {
              const active = styleId === s.id;
              return (
                <button
                  key={s.id}
                  disabled={running}
                  onClick={() => setStyleId(s.id)}
                  className="text-left rounded-xl p-3 transition-all duration-150 disabled:opacity-40"
                  style={{
                    background: active ? `${s.accent}18` : "hsl(222 47% 7%)",
                    border: `1px solid ${active ? `${s.accent}55` : "hsl(222 47% 16%)"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1" style={{ color: active ? s.accent : "hsl(222 47% 55%)" }}>
                    {s.icon}
                    <span className="text-xs font-bold">{s.label}</span>
                  </div>
                  <p className="text-[10px] leading-snug" style={{ color: active ? "hsl(0 0% 70%)" : "hsl(222 47% 45%)" }}>
                    {s.tagline}
                  </p>
                </button>
              );
            })}
          </div>
          {selectedStyle && (
            <p className="text-[11px] text-white/30 mt-1.5">{selectedStyle.description}</p>
          )}
        </div>

        {/* ── Images ── */}
        <div>
          <SectionLabel>
            Product / Brand Images *
            <span className="text-white/20 font-normal normal-case tracking-normal ml-1">— up to 5, drag & drop or tap</span>
          </SectionLabel>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, i) => {
              const slot = i + 1;
              const isUploading = uploading.has(slot);
              return (
                <div key={slot} className="relative">
                  {isUploading ? (
                    <div
                      className="rounded-2xl flex items-center justify-center"
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
          {filledSlots > 0 && (
            <p className="text-xs text-white/35 mt-2">{filledSlots} image{filledSlots > 1 ? "s" : ""} ready</p>
          )}
        </div>

        {/* ── Duration ── */}
        <div>
          <SectionLabel>Video Length</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {DURATION_OPTIONS.map((d) => {
              const active = duration === d;
              return (
                <button
                  key={d}
                  disabled={running}
                  onClick={() => setDuration(d)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-40"
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
            {duration <= 15
              ? `${duration / 5} scene${duration / 5 > 1 ? "s" : ""} × 5 s`
              : `${duration / 10} scenes × 10 s`}
            {" "}· Longer = more render time
          </p>
        </div>

        {/* ── Generate button ── */}
        <Button
          onClick={generate}
          disabled={!canGenerate}
          className="w-full h-12 text-sm font-bold rounded-xl"
          style={{
            background: canGenerate
              ? "linear-gradient(135deg, hsl(25 100% 55%), hsl(45 100% 58%))"
              : "hsl(222 47% 12%)",
            color: canGenerate ? "#fff" : "hsl(222 47% 40%)",
            border: "none",
          }}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating your promo video… you can close this and come back
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Generate {duration}s Promo Video
            </span>
          )}
        </Button>

        {running && (
          <p className="text-center text-xs text-white/30 -mt-3">
            Job saves to the server for 24 hours — close the app and return any time.
          </p>
        )}

        {/* ── Log panel ── */}
        {(job || running) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>Agent Activity</SectionLabel>
              {job?.phase ? (
                <span className={`text-xs font-semibold ${PHASE_COLORS[job.phase] ?? ""}`}>
                  Phase {job.phase}: {PHASE_LABELS[job.phase]}
                </span>
              ) : null}
            </div>
            <LogPanel logs={job?.logs ?? []} status={job?.status ?? "running"} />
          </div>
        )}

        {/* ── Success ── */}
        {job?.status === "complete" && job.videoUrl && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(25 100% 55% / 0.4)" }}>
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(25 100% 55% / 0.1)", borderBottom: "1px solid hsl(25 100% 55% / 0.2)" }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Your {job.targetDuration}s promo is ready</span>
            </div>
            <video
              src={job.videoUrl}
              controls
              playsInline
              className="w-full"
              style={{ background: "#000", maxHeight: 400 }}
            />
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: "hsl(222 47% 5%)" }}>
              <a href={job.videoUrl} download="guber-promo-video.mp4" target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs rounded-lg"
                  style={{ borderColor: "hsl(25 100% 55% / 0.4)", color: "hsl(25 100% 70%)", background: "transparent" }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </Button>
              </a>
              <button onClick={dismiss} className="text-xs text-white/30 hover:text-white/50 ml-auto">
                Make another
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {job?.status === "error" && (
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: "hsl(0 80% 20% / 0.3)", border: "1px solid hsl(0 80% 50% / 0.3)", color: "hsl(0 80% 75%)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold mb-0.5">Agent error</p>
                <p className="text-xs opacity-80">{job.error}</p>
              </div>
              <button onClick={dismiss} className="text-xs opacity-50 hover:opacity-80 flex-shrink-0 mt-0.5">Dismiss</button>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
