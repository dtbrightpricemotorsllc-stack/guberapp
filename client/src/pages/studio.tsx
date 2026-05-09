// ─────────────────────────────────────────────────────────────────────────────
// GUBER Studio v2 — session-based AI generation tool (Phase 1).
//
// Access: admin-only by default. Admins can launch to all users by flipping
// the "studio_v2" feature flag to "global" in the Feature Flag Console.
//
// What this page is:
//   • Tool picker (3 Fal.ai endpoints), upload-as-needed, prompt templates,
//     cost preview, generate, in-page preview, download.
//   • Generated media is TEMPORARY. Leaving the page, refreshing, or sitting
//     idle for 30 minutes triggers a server-side purge of every clip and file
//     produced this session. Nothing is saved to the user's profile.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isIOS } from "@/lib/platform";
import {
  Sparkles, Loader2, Upload, Image as ImageIcon, Music, Video, Wand2, X,
  Download, Coins, ArrowLeft, ShoppingCart, Lock, ExternalLink, ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type StudioMe = {
  credits: number;
  tier: "standard" | "creator" | "business";
  day1OG: boolean;
  providerReady: boolean;
  subscription: { status: string; monthlyCredits: number; label: string | null; cancelAtPeriodEnd: boolean } | null;
};
type StudioTool = {
  key: string;
  label: string;
  description: string | null;
  creditsCost: number;
  durationSeconds: number | null;
};
type StudioFile = {
  id: number;
  sessionId: number;
  fileType: "upload_image" | "upload_video" | "upload_audio" | "output_video" | "output_audio";
  providerUrl: string;
  resourceType: "image" | "video" | "raw";
  meta: any;
  createdAt: string;
};
type StudioSession = { id: number; status: string; startedAt: string };
type SessionPayload = { session: StudioSession | null; files: StudioFile[] };

// ── Tool metadata ──────────────────────────────────────────────────────────
type ToolKey = "kling_motion_control" | "wan_motion_5s" | "wan_motion_10s" | "minimax_music";
const TOOL_META: Record<ToolKey, { icon: any; needsImage: boolean; outputKind: "video" | "audio" }> = {
  kling_motion_control: { icon: Video,  needsImage: true,  outputKind: "video" },
  wan_motion_5s:        { icon: Wand2,  needsImage: false, outputKind: "video" },
  wan_motion_10s:       { icon: Wand2,  needsImage: false, outputKind: "video" },
  minimax_music:        { icon: Music,  needsImage: false, outputKind: "audio" },
};

// ── Prompt templates ───────────────────────────────────────────────────────
const STUDIO_TEMPLATES: Record<ToolKey, Array<{ label: string; prompt: string }>> = {
  kling_motion_control: [
    { label: "Golden hour push-in",   prompt: "Slow push-in toward the subject, bokeh background gradually sharpens, warm golden-hour glow, cinematic" },
    { label: "360° orbit",            prompt: "Camera orbits the subject in a smooth 180° arc, natural window light, cinematic color grade" },
    { label: "Upward reveal",         prompt: "Gentle upward tilt reveal from foreground to subject, wide angle, documentary style, soft diffused light" },
    { label: "Dramatic zoom out",     prompt: "Start extreme close-up then slowly pull back to reveal the full environment, atmospheric haze, wide shot" },
  ],
  wan_motion_5s: [
    { label: "City skyline timelapse", prompt: "Timelapse of clouds rolling over a city skyline at dusk, cinematic color grade, wide angle, 5 seconds" },
    { label: "Product rotation",       prompt: "Close-up product shot rotating slowly on a clean white surface, soft studio lighting, sharp focus" },
    { label: "Rainy night street",     prompt: "Person walking down a rainy street at night, neon reflections on wet pavement, slow motion, cinematic" },
    { label: "Nature reveal",          prompt: "Camera pushes through tall grass to reveal a sunlit meadow, morning golden light, cinematic 5s" },
  ],
  wan_motion_10s: [
    { label: "Aerial forest drift",   prompt: "Aerial shot drifting slowly over a forest canopy at sunrise, mist in the valleys, golden light piercing the trees, 10s" },
    { label: "Urban commute blur",    prompt: "Busy intersection at rush hour, slow-motion, people and traffic blurring past a still camera, street-level, 10s" },
    { label: "Ocean sunrise",         prompt: "Waves rolling onto an empty beach at sunrise, wide angle, warm colors, peaceful 10-second motion" },
    { label: "Skyscraper rising",     prompt: "Low-angle shot looking up at a glass skyscraper, clouds drifting past, dramatic perspective, 10s" },
  ],
  minimax_music: [
    { label: "Hopeful morning",     prompt: "Uplifting acoustic guitar and strings, slow build, hopeful morning feeling, 30 seconds instrumental" },
    { label: "Cinematic tension",   prompt: "Dark ambient electronic, tension-building, cinematic suspense, sparse piano hits, deep bass pulse" },
    { label: "Lo-fi late night",    prompt: "Lo-fi hip-hop with muted trumpet, nostalgic, late night study vibes, soft vinyl crackle, mellow" },
    { label: "Epic adventure",      prompt: "Orchestral epic adventure theme, swelling strings, driving percussion, heroic brass, builds to climax" },
  ],
};

// ── Coming Soon gate (non-admin) ───────────────────────────────────────────
function StudioComingSoon() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 px-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
        <Lock className="w-8 h-8 text-emerald-400" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">GUBER Studio</h1>
        <p className="text-white/60 text-sm max-w-xs leading-relaxed">
          AI-powered content creation is coming soon. Admins are currently testing — we'll open it up shortly.
        </p>
      </div>
      <Link href="/">
        <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Button>
      </Link>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function StudioPageV2() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"video" | "audio" | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  // ── Server state ──────────────────────────────────────────────────────
  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const sessionQuery = useQuery<SessionPayload>({
    queryKey: ["/api/studio/session/current"],
    refetchOnWindowFocus: false,
  });

  // ── Session lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return; // don't open sessions for non-admins hitting the gate
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/studio/session", { method: "POST", credentials: "include" });
        if (!cancelled && res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
        }
      } catch {}
    })();

    const beforeUnload = () => {
      try {
        if (navigator.sendBeacon) navigator.sendBeacon("/api/studio/session/exit");
        else fetch("/api/studio/session/exit", { method: "POST", credentials: "include", keepalive: true });
      } catch {}
    };
    window.addEventListener("beforeunload", beforeUnload);

    const touchTimer = window.setInterval(() => {
      fetch("/api/studio/session/touch", { method: "POST", credentials: "include" }).catch(() => {});
    }, 4 * 60 * 1000);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", beforeUnload);
      window.clearInterval(touchTimer);
      try {
        if (navigator.sendBeacon) navigator.sendBeacon("/api/studio/session/exit");
        else fetch("/api/studio/session/exit", { method: "POST", credentials: "include", keepalive: true });
      } catch {}
    };
  }, [isAdmin]);

  // ── Derived state ──────────────────────────────────────────────────────
  const tools = toolsQuery.data ?? [];
  const me = meQuery.data;
  const files = sessionQuery.data?.files ?? [];
  const uploadedImages = files.filter((f) => f.fileType === "upload_image");
  const outputs = files.filter((f) => f.fileType === "output_video" || f.fileType === "output_audio");

  const activeToolMeta = activeTool ? TOOL_META[activeTool] : null;
  const activeToolPricing = useMemo(
    () => tools.find((t) => t.key === activeTool) || null,
    [tools, activeTool],
  );
  const templates = activeTool ? STUDIO_TEMPLATES[activeTool] : [];

  // ── Mutations ──────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ dataUrl, kind }: { dataUrl: string; kind: "image" | "video" | "audio" }) => {
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind });
      return res.json();
    },
    onSuccess: (data: { file: StudioFile }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      setSelectedSourceId(data.file.id);
      toast({ title: "Reference uploaded" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  async function handleFile(file: File, kind: "image" | "video" | "audio") {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too big", description: "Keep references under 25 MB.", variant: "destructive" });
      return;
    }
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ""));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    });
    uploadMutation.mutate({ dataUrl, kind });
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!activeTool) throw new Error("Pick a tool first");
      const endpoint =
        activeTool === "kling_motion_control" ? "/api/studio/generate/motion-control" :
        activeTool === "minimax_music"        ? "/api/studio/generate/music" :
                                                "/api/studio/generate/wan-motion";
      const body: any = { prompt };
      if (activeToolMeta?.needsImage || (activeTool.startsWith("wan_motion") && selectedSourceId)) {
        body.sourceFileId = selectedSourceId;
      }
      if (activeTool === "wan_motion_10s") body.durationSeconds = 10;
      if (activeTool === "wan_motion_5s")  body.durationSeconds = 5;
      const res = await apiRequest("POST", endpoint, body);
      return res.json() as Promise<{ file: StudioFile; balance: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      setPreviewUrl(data.file.providerUrl);
      setPreviewKind(activeToolMeta?.outputKind ?? "video");
      toast({ title: "Generated", description: "Your clip is ready below." });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  // ── Loading / auth states ──────────────────────────────────────────────
  if (meQuery.isLoading || toolsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6">
        <p>You need to be signed in to use the Studio.</p>
        <Link href="/auth"><Button>Sign in</Button></Link>
      </div>
    );
  }

  // Non-admins see the coming soon gate
  if (!isAdmin) return <StudioComingSoon />;

  const insufficient = activeToolPricing ? me.credits < activeToolPricing.creditsCost : false;
  const needsImageButMissing = !!activeToolMeta?.needsImage && !selectedSourceId;
  const canGenerate =
    !!activeTool &&
    !generateMutation.isPending &&
    !insufficient &&
    !needsImageButMissing &&
    (prompt.trim().length > 0 || selectedSourceId !== null);

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-black/80 border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            className="flex items-center gap-2 text-sm text-white/80"
            data-testid="button-studio-exit"
          >
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-bold tracking-wide">GUBER STUDIO</span>
          </div>
          <div className="flex items-center gap-2 text-sm" data-testid="text-studio-credits">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-semibold">{me.credits}</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Admin-only banner */}
        <div className="rounded-xl border border-violet-500/40 bg-violet-950/40 px-4 py-3 text-xs text-violet-200 flex items-start gap-3">
          <Lock className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-violet-100 mb-0.5">Admin preview — Studio is not yet live for users</p>
            <p className="text-violet-300/80 leading-relaxed">
              Flip the <strong>GUBER Studio v2</strong> feature flag to <strong>Global</strong> when ready to launch.
            </p>
          </div>
          <Link href="/admin/qa/flags" className="shrink-0">
            <Button size="sm" variant="outline" className="border-violet-500/50 text-violet-300 hover:bg-violet-900/40 text-[11px] h-7 px-2 rounded-lg">
              Flags <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Session-temporary disclaimer */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <strong className="font-bold">Heads up:</strong> Everything you make here lives only for this session.
          Closing this page, refreshing, or 30 minutes of idle wipes your uploads and clips.
        </div>

        {/* Provider down warning */}
        {!me.providerReady && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100" data-testid="banner-provider-down">
            The AI provider isn't connected yet (FAL_KEY missing). Generation is disabled until the key is set.
          </div>
        )}

        {/* Tool picker */}
        <section>
          <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">Pick a tool</h2>
          <div className="grid grid-cols-1 gap-2">
            {tools.map((t) => {
              const meta = TOOL_META[t.key as ToolKey];
              const Icon = meta?.icon ?? Wand2;
              const selected = activeTool === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setActiveTool(t.key as ToolKey);
                    setSelectedSourceId(null);
                    setPreviewUrl(null);
                    setPrompt("");
                  }}
                  className={`text-left rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
                    selected
                      ? "border-emerald-400 bg-emerald-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                  data-testid={`button-tool-${t.key}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-emerald-400 text-black" : "bg-white/10 text-white"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.label}</p>
                      {meta?.needsImage && (
                        <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">photo required</Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-white/60 leading-snug mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-amber-400">{t.creditsCost} cr</p>
                    {t.durationSeconds && <p className="text-[10px] text-white/50">{t.durationSeconds}s</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Prompt templates */}
        {activeTool && templates.length > 0 && (
          <section data-testid="section-templates">
            <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">Templates</h2>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => setPrompt(tpl.prompt)}
                  className={`text-left rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                    prompt === tpl.prompt
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                  data-testid={`button-template-${tpl.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span className="font-semibold block mb-0.5">{tpl.label}</span>
                  <span className="text-white/50 line-clamp-2 text-[10px] leading-relaxed">{tpl.prompt}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Reference uploader */}
        {activeTool && (activeToolMeta?.needsImage || activeTool.startsWith("wan_motion")) && (
          <section data-testid="section-reference">
            <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">
              Reference photo {activeToolMeta?.needsImage ? "" : "(optional)"}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <label className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/60 cursor-pointer hover:border-emerald-400 hover:text-emerald-400 transition-colors">
                {uploadMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span className="text-[10px] mt-1 font-semibold">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], "image")}
                  data-testid="input-upload-image"
                />
              </label>
              {uploadedImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedSourceId(img.id)}
                  className={`relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 ${
                    selectedSourceId === img.id ? "border-emerald-400" : "border-white/10"
                  }`}
                  data-testid={`button-pick-image-${img.id}`}
                >
                  <img src={img.providerUrl} alt="reference" className="w-full h-full object-cover" />
                  {selectedSourceId === img.id && (
                    <span className="absolute inset-0 bg-emerald-400/20 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-emerald-300" />
                    </span>
                  )}
                </button>
              ))}
            </div>
            {needsImageButMissing && (
              <p className="text-[11px] text-amber-300 mt-1">This tool needs a reference photo to generate.</p>
            )}
          </section>
        )}

        {/* Prompt */}
        {activeTool && (
          <section>
            <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">Prompt</h2>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder={
                activeTool === "minimax_music"
                  ? "e.g. uplifting cinematic strings, slow build, hopeful"
                  : "e.g. slow dolly-in on a busy diner at golden hour, cinematic"
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 resize-none"
              data-testid="textarea-prompt"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-white/50">{prompt.length}/500</span>
              {activeToolPricing && (
                <span className="text-[11px] text-white/70">
                  Cost: <span className="font-bold text-amber-400">{activeToolPricing.creditsCost} cr</span>
                  {activeToolPricing.durationSeconds && <> · ~{activeToolPricing.durationSeconds}s</>}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Generate */}
        {activeTool && (
          <section>
            <Button
              size="lg"
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate || !me.providerReady}
              className="w-full bg-emerald-400 hover:bg-emerald-300 text-black font-bold rounded-2xl h-14"
              data-testid="button-generate"
            >
              {generateMutation.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="w-5 h-5 mr-2" /> Generate</>
              )}
            </Button>
            {insufficient && !isIOS && (
              <Link href="/studio/credits">
                <Button
                  variant="outline"
                  className="w-full mt-2 border-amber-400 text-amber-300 hover:bg-amber-400/10 rounded-2xl"
                  data-testid="button-buy-credits"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" /> Out of credits — buy a pack
                </Button>
              </Link>
            )}
            {insufficient && isIOS && (
              <p className="w-full mt-2 text-center text-[11px] text-white/60" data-testid="text-ios-credits-unavailable">
                Out of credits. Top-ups aren't available in the iOS app yet — visit guberapp.app to buy more.
              </p>
            )}
          </section>
        )}

        {/* Latest preview */}
        {previewUrl && previewKind && (
          <section data-testid="section-preview">
            <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">Result</h2>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-3">
                {previewKind === "video" ? (
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    className="w-full rounded-xl bg-black aspect-video object-cover"
                    data-testid="video-preview"
                  />
                ) : (
                  <audio src={previewUrl} controls className="w-full" data-testid="audio-preview" />
                )}
                <div className="flex gap-2 mt-3">
                  <a href={previewUrl} download target="_blank" rel="noreferrer" className="flex-1">
                    <Button
                      variant="outline"
                      className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl"
                      data-testid="button-download-preview"
                    >
                      <Download className="w-4 h-4 mr-2" /> Download
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Session history */}
        {outputs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold tracking-[0.22em] uppercase text-white/60 mb-3">
              This session ({outputs.length})
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {outputs.map((o) => (
                <Card key={o.id} className="bg-white/5 border-white/10 overflow-hidden">
                  <CardContent className="p-2">
                    {o.fileType === "output_video" ? (
                      <video
                        src={o.providerUrl}
                        controls
                        playsInline
                        muted
                        className="w-full rounded-lg bg-black aspect-video object-cover"
                      />
                    ) : (
                      <audio src={o.providerUrl} controls className="w-full" />
                    )}
                    <div className="flex items-center justify-between mt-2 px-1">
                      <span className="text-[10px] text-white/50 truncate">{o.meta?.toolKey || ""}</span>
                      <a href={o.providerUrl} download target="_blank" rel="noreferrer">
                        <Download className="w-3.5 h-3.5 text-white/70 hover:text-emerald-400" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Exit confirm */}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Leave Studio?</DialogTitle>
            <DialogDescription className="text-white/70">
              Your uploads and generated clips will be permanently deleted. Download anything you want to keep first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmExit(false)} data-testid="button-exit-cancel">
              Stay
            </Button>
            <Link href="/">
              <Button
                className="bg-red-500 hover:bg-red-400 text-white"
                onClick={() => {
                  try {
                    if (navigator.sendBeacon) navigator.sendBeacon("/api/studio/session/exit");
                    else fetch("/api/studio/session/exit", { method: "POST", credentials: "include", keepalive: true });
                  } catch {}
                }}
                data-testid="button-exit-confirm"
              >
                <X className="w-4 h-4 mr-1" /> Discard & Leave
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
