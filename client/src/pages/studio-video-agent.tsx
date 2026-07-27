// GUBER Studio — Smart Asset-Aware AI Video Agent
// 5-slot image grid + natural-language instruction → 30-second AI video

import { useRef, useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Upload, X, Loader2, Play, Download, CheckCircle2,
  Sparkles, Film, ImageIcon, Mic, Scissors, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageSlot = { slot: number; url: string; name: string; tags: string[] };
type AgentLog  = { ts: number; phase: number; message: string };

type JobStatus = {
  jobId: string;
  status: "running" | "complete" | "error";
  phase: number;
  logs: AgentLog[];
  manifest: Record<string, string[]> | null;
  videoUrl: string | null;
  error: string | null;
};

const PHASE_ICONS = [
  null,
  <ImageIcon key="1" className="w-3.5 h-3.5" />,   // Phase 1
  <Scissors key="2" className="w-3.5 h-3.5" />,     // Phase 2
  <Mic key="3" className="w-3.5 h-3.5" />,           // Phase 3
  <Film key="4" className="w-3.5 h-3.5" />,          // Phase 4
];

const PHASE_LABELS = ["", "Vision Indexing", "Edit & Composite", "Script & Voice", "Video Render"];

const PHASE_COLORS: Record<number, string> = {
  1: "text-cyan-400",
  2: "text-violet-400",
  3: "text-emerald-400",
  4: "text-amber-400",
};

// ── Slot component ────────────────────────────────────────────────────────────

function ImageSlotCard({
  slot,
  data,
  onUpload,
  onRemove,
}: {
  slot: number;
  data: ImageSlot | null;
  onUpload: (slot: number, file: File) => void;
  onRemove: (slot: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(slot, file);
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden border transition-all duration-200"
      style={{
        aspectRatio: "1/1",
        background: data
          ? "transparent"
          : "hsl(222 47% 7%)",
        borderColor: data
          ? "hsl(270 100% 65% / 0.4)"
          : "hsl(222 47% 18%)",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {data ? (
        <>
          <img
            src={data.url}
            alt={data.name}
            className="w-full h-full object-cover"
          />
          {/* Tags */}
          {data.tags.length > 0 && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-4">
              <div className="flex flex-wrap gap-1">
                {data.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(270 100% 65% / 0.25)", color: "hsl(270 100% 80%)", border: "1px solid hsl(270 100% 65% / 0.3)" }}
                  >
                    {t}
                  </span>
                ))}
                {data.tags.length > 4 && (
                  <span className="text-[10px] text-white/40">+{data.tags.length - 4}</span>
                )}
              </div>
            </div>
          )}
          {/* Remove */}
          <button
            onClick={() => onRemove(slot)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
          {/* Slot badge */}
          <div
            className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "hsl(270 100% 65% / 0.7)", color: "#fff" }}
          >
            #{slot}
          </div>
        </>
      ) : (
        <button
          className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
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
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(slot, f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs, status }: { logs: AgentLog[]; status: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div
      className="rounded-xl font-mono text-xs overflow-y-auto"
      style={{
        background: "hsl(222 47% 4%)",
        border: "1px solid hsl(222 47% 14%)",
        minHeight: 180,
        maxHeight: 260,
        padding: "12px 14px",
      }}
    >
      {logs.length === 0 && (
        <p className="text-white/25 italic">Agent logs will appear here…</p>
      )}
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2 mb-1 leading-relaxed">
          <span style={{ color: "hsl(222 47% 45%)", flexShrink: 0 }}>
            {new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span
            className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 rounded ${PHASE_COLORS[l.phase] ?? "text-white/50"}`}
          >
            P{l.phase}
          </span>
          <span className="text-white/75 break-words min-w-0">{l.message}</span>
        </div>
      ))}
      {status === "running" && (
        <div className="flex items-center gap-2 mt-2 text-white/40">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          <span>Running…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudioVideoAgentPage() {
  const { toast } = useToast();
  const [slots, setSlots] = useState<(ImageSlot | null)[]>(Array(5).fill(null));
  const [uploading, setUploading] = useState<Set<number>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Apply manifest tags to slots when Phase 1 completes
  useEffect(() => {
    if (!job?.manifest) return;
    setSlots((prev) =>
      prev.map((s, i) => {
        if (!s) return s;
        const key = `Image ${s.slot}`;
        const tags = job.manifest?.[key] ?? [];
        return tags.length ? { ...s, tags } : s;
      }),
    );
  }, [job?.manifest]);

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const uploadImage = useCallback(async (slot: number, file: File) => {
    setUploading((s) => new Set(s).add(slot));
    try {
      const dataUrl = await compressImageToDataUrl(file, 1200, 0.85);
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind: "image" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Upload failed");
      }
      const { file: f } = await res.json();
      setSlots((prev) => {
        const next = [...prev];
        next[slot - 1] = { slot, url: f.providerUrl, name: `Image ${slot}`, tags: [] };
        return next;
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading((s) => { const n = new Set(s); n.delete(slot); return n; });
    }
  }, [toast]);

  const removeSlot = useCallback((slot: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slot - 1] = null;
      return next;
    });
  }, []);

  async function startAgent() {
    const images = slots.filter(Boolean) as ImageSlot[];
    if (images.length === 0) {
      toast({ title: "Add at least one image", variant: "destructive" });
      return;
    }
    if (!instruction.trim()) {
      toast({ title: "Enter an instruction", variant: "destructive" });
      return;
    }
    setRunning(true);
    setJob(null);
    setJobId(null);

    try {
      const res = await apiRequest("POST", "/api/studio/agent/start", {
        images: images.map((s) => ({ slot: s.slot, name: s.name, url: s.url })),
        instruction: instruction.trim(),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Failed to start agent");
      }
      const { jobId: id } = await res.json();
      setJobId(id);

      // Poll every 3 seconds
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
              toast({ title: "🎬 Video ready!", description: "Your video has been generated." });
            } else {
              toast({ title: "Agent error", description: data.error ?? "Unknown error", variant: "destructive" });
            }
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      setRunning(false);
      toast({ title: "Agent failed to start", description: err.message, variant: "destructive" });
    }
  }

  const filledSlots = slots.filter(Boolean).length;
  const canRun = filledSlots > 0 && instruction.trim().length > 5 && !running && uploading.size === 0;

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "hsl(222 47% 3%)" }}
    >
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
            style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(200 100% 60%))" }}
          >
            <Layers className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Video Agent</h1>
            <p className="text-[10px] text-white/40 leading-none mt-0.5">Smart Asset-Aware AI · 4-Phase Pipeline</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Phase badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[1, 2, 3, 4].map((p) => (
            <div
              key={p}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0"
              style={{
                background: job && job.phase >= p
                  ? "hsl(270 100% 65% / 0.15)"
                  : "hsl(222 47% 9%)",
                border: `1px solid ${job && job.phase >= p ? "hsl(270 100% 65% / 0.3)" : "hsl(222 47% 16%)"}`,
                color: job && job.phase >= p ? "hsl(270 100% 78%)" : "hsl(222 47% 55%)",
              }}
            >
              {PHASE_ICONS[p]}
              {PHASE_LABELS[p]}
            </div>
          ))}
        </div>

        {/* Image grid */}
        <div>
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
            Upload Images <span className="text-white/25 font-normal normal-case tracking-normal ml-1">— up to 5, drag & drop or tap</span>
          </p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, i) => {
              const slot = i + 1;
              const isUploading = uploading.has(slot);
              return (
                <div key={slot} className="relative">
                  {isUploading ? (
                    <div
                      className="rounded-2xl flex items-center justify-center"
                      style={{
                        aspectRatio: "1/1",
                        background: "hsl(222 47% 7%)",
                        border: "1px solid hsl(270 100% 65% / 0.3)",
                      }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                    </div>
                  ) : (
                    <ImageSlotCard
                      slot={slot}
                      data={slots[i]}
                      onUpload={uploadImage}
                      onRemove={removeSlot}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {filledSlots > 0 && (
            <p className="text-xs text-white/35 mt-2">
              {filledSlots} image{filledSlots > 1 ? "s" : ""} loaded — tags appear after the agent indexes them
            </p>
          )}
        </div>

        {/* Instruction */}
        <div>
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
            Natural Language Instruction
          </p>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={running}
            rows={4}
            maxLength={800}
            placeholder={`Describe what you want, referencing images by number.\n\nExample: "Remove the dog from Image 1, combine the edited Image 1 with Image 2 for the main scene, and use Image 3 as an animated logo at the end."`}
            className="rounded-xl text-sm resize-none"
            style={{
              background: "hsl(222 47% 6%)",
              border: "1px solid hsl(222 47% 16%)",
              color: "hsl(0 0% 90%)",
            }}
          />
          <p className="text-[11px] text-white/25 mt-1.5">
            Reference any image by number — the agent understands your intent.
          </p>
        </div>

        {/* Run button */}
        <Button
          onClick={startAgent}
          disabled={!canRun}
          className="w-full h-12 text-sm font-bold rounded-xl relative overflow-hidden"
          style={{
            background: canRun
              ? "linear-gradient(135deg, hsl(270 100% 58%), hsl(200 100% 52%))"
              : "hsl(222 47% 12%)",
            color: canRun ? "#fff" : "hsl(222 47% 40%)",
            border: "none",
          }}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Agent running… this takes 10–20 min
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Run Video Agent
            </span>
          )}
        </Button>

        {/* Log panel */}
        {(job || running) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                Agent Activity
              </p>
              {job?.phase ? (
                <span
                  className={`text-xs font-semibold ${PHASE_COLORS[job.phase] ?? ""}`}
                >
                  Phase {job.phase}: {PHASE_LABELS[job.phase]}
                </span>
              ) : null}
            </div>
            <LogPanel logs={job?.logs ?? []} status={job?.status ?? "running"} />
          </div>
        )}

        {/* Manifest preview */}
        {job?.manifest && Object.keys(job.manifest).length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ background: "hsl(222 47% 6%)", border: "1px solid hsl(222 47% 14%)" }}
          >
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
              Asset Manifest
            </p>
            <div className="space-y-2">
              {Object.entries(job.manifest).map(([imgName, tags]) => (
                <div key={imgName} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-white/60 w-16 flex-shrink-0">{imgName}</span>
                  <div className="flex flex-wrap gap-1">
                    {(tags as string[]).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: "hsl(222 47% 12%)", color: "hsl(0 0% 70%)", border: "1px solid hsl(222 47% 20%)" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success + video player */}
        {job?.status === "complete" && job.videoUrl && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}
          >
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(270 100% 65% / 0.08)", borderBottom: "1px solid hsl(270 100% 65% / 0.15)" }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Your video is ready</span>
            </div>
            <video
              src={job.videoUrl}
              controls
              playsInline
              className="w-full"
              style={{ background: "#000", maxHeight: 400 }}
            />
            <div className="px-4 py-3" style={{ background: "hsl(222 47% 5%)" }}>
              <a
                href={job.videoUrl}
                download="guber-studio-video.mp4"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs rounded-lg"
                  style={{ borderColor: "hsl(270 100% 65% / 0.4)", color: "hsl(270 100% 78%)", background: "transparent" }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Error state */}
        {job?.status === "error" && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "hsl(0 80% 20% / 0.3)", border: "1px solid hsl(0 80% 50% / 0.3)", color: "hsl(0 80% 75%)" }}
          >
            <strong>Agent error:</strong> {job.error}
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
