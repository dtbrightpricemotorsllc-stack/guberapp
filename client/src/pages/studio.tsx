// ─────────────────────────────────────────────────────────────────────────────
// GUBER Studio v2 — cinematic CapCut-style shell on the session-based v2 backend.
//
// What this page is:
//   • Hero: last generated clip plays muted as a cinematic background, or an
//     animated gradient + film grain when the session is empty.
//   • Trending Templates: tap-to-start preset carousel that auto-selects the
//     right Fal tool (music → MiniMax, with reference → Kling motion-control,
//     otherwise → Wan motion 5s).
//   • Prompt + glow Generate button. Cost preview pulled from server pricing
//     (`/api/studio/tools`) — never hardcoded client-side.
//   • Session library underneath: in-session outputs only. Nothing pinned to
//     profile / resume / business / cash-drop in v2.
//
// Server contract (unchanged from v2):
//   • `/api/studio/me`            credits + tier + providerReady
//   • `/api/studio/tools`         pricing per tool key
//   • `/api/studio/session`       open
//   • `/api/studio/session/current` read
//   • `/api/studio/session/touch` heartbeat
//   • `/api/studio/session/exit`  purge
//   • `/api/studio/upload`        reference upload
//   • `/api/studio/generate/{motion-control|wan-motion|music}`
//
// Access: admin-only by default (gated by user.role === "admin"). Admins flip
// the `studio_v2` feature flag to "global" when ready to launch broadly.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isIOS } from "@/lib/platform";
import {
  Sparkles, Loader2, Image as ImageIcon, Music, Wand2, X, Download,
  Coins, ArrowLeft, Lock, ExternalLink, Plus, Play, Flame, Film,
  Building2, Megaphone, Zap, Crown, Check, ShoppingCart,
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

type ToolKey = "kling_motion_control" | "wan_motion_5s" | "wan_motion_10s" | "minimax_music";

const TIER_LABEL: Record<string, string> = {
  standard: "STANDARD",
  creator:  "CREATOR",
  business: "BUSINESS",
};

// ── Cinematic templates (CapCut-style starter prompts) ────────────────────
// Each template declares its preferred output kind. Final tool routing also
// considers whether the user has uploaded a reference image.
type Template = {
  slug: string;
  label: string;
  tag: string;
  prompt: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string }>;
  kind: "video" | "audio";
};
const TEMPLATES: Template[] = [
  {
    slug: "create-ad", label: "Create Ad", tag: "Brand", kind: "video",
    prompt: "Punchy 6-second product ad, bold typography reveal, energetic close-up, modern brand aesthetic, vibrant cinematic lighting.",
    gradient: "from-fuchsia-500 via-pink-500 to-orange-400",
    icon: Megaphone,
  },
  {
    slug: "movie-trailer", label: "Movie Trailer", tag: "Cinematic", kind: "video",
    prompt: "Epic movie trailer scene, anamorphic lens flares, slow push-in, dramatic orchestral mood, deep contrast cinematography.",
    gradient: "from-amber-500 via-rose-600 to-purple-700",
    icon: Film,
  },
  {
    slug: "luxury-promo", label: "Luxury Promo", tag: "Premium", kind: "video",
    prompt: "Luxury product reveal, glossy black surfaces, gold accents, slow rotation, soft rim light, ultra-high-end commercial feel.",
    gradient: "from-yellow-400 via-amber-600 to-neutral-900",
    icon: Crown,
  },
  {
    slug: "anime-intro", label: "Anime Intro", tag: "Stylized", kind: "video",
    prompt: "Anime-style intro, dynamic pan, vivid cel-shading, cherry blossoms swirling, motion-blur action lines, J-pop energy.",
    gradient: "from-pink-400 via-rose-400 to-indigo-500",
    icon: Sparkles,
  },
  {
    slug: "tiktok-reel", label: "TikTok Reel", tag: "Viral", kind: "video",
    prompt: "Vertical 9:16 reel, fast hook, hand-held camera energy, bold caption flash, trending color grade, scroll-stopping first frame.",
    gradient: "from-cyan-400 via-violet-500 to-fuchsia-600",
    icon: Flame,
  },
  {
    slug: "real-estate", label: "Real Estate", tag: "Listing", kind: "video",
    prompt: "Cinematic real estate walkthrough, golden-hour exterior, smooth dolly through entry, warm interior reveal, drone pull-back finale.",
    gradient: "from-emerald-400 via-teal-500 to-sky-600",
    icon: Building2,
  },
  {
    slug: "music-track", label: "Music Track", tag: "Audio", kind: "audio",
    prompt: "Uplifting cinematic strings with hopeful melody, slow build, instrumental, 30 seconds, broadcast quality.",
    gradient: "from-violet-500 via-purple-600 to-rose-500",
    icon: Music,
  },
  {
    slug: "neon-night", label: "Neon Night", tag: "Vibes", kind: "video",
    prompt: "Neon-soaked Tokyo alley at night, rain reflections, slow cinematic dolly-in, cyberpunk color grade, atmospheric haze.",
    gradient: "from-sky-400 via-blue-600 to-violet-700",
    icon: Zap,
  },
];

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

  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [outputKind, setOutputKind] = useState<"video" | "audio">("video");
  const [prompt, setPrompt] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ── Server state ──────────────────────────────────────────────────────
  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const sessionQuery = useQuery<SessionPayload>({
    queryKey: ["/api/studio/session/current"],
    refetchOnWindowFocus: false,
  });

  // ── Session lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
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
  const heroOutput = outputs[outputs.length - 1] || null;

  // Tool routing — derived from output kind + whether a reference photo is selected.
  //   audio                           → minimax_music
  //   video + reference image         → kling_motion_control (photo-driven motion)
  //   video, no reference image       → wan_motion_5s        (default)
  const activeToolKey = useMemo<ToolKey>(() => {
    if (outputKind === "audio") return "minimax_music";
    if (selectedSourceId) return "kling_motion_control";
    return "wan_motion_5s";
  }, [outputKind, selectedSourceId]);

  const activeToolPricing = useMemo(
    () => tools.find((t) => t.key === activeToolKey) || null,
    [tools, activeToolKey],
  );

  // ── Mutations ──────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ dataUrl, kind }: { dataUrl: string; kind: "image" | "video" | "audio" }) => {
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind });
      return res.json();
    },
    onSuccess: (data: { file: StudioFile }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      setSelectedSourceId(data.file.id);
      toast({ title: "Reference uploaded", description: "Your photo is ready — Generate now uses Kling motion-control." });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image only", description: "Pick a JPG / PNG / WebP.", variant: "destructive" });
      return;
    }
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
    uploadMutation.mutate({ dataUrl, kind: "image" });
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        activeToolKey === "kling_motion_control" ? "/api/studio/generate/motion-control" :
        activeToolKey === "minimax_music"        ? "/api/studio/generate/music" :
                                                   "/api/studio/generate/wan-motion";
      const body: any = { prompt: prompt.trim() };
      if (activeToolKey === "kling_motion_control") body.sourceFileId = selectedSourceId;
      if (activeToolKey === "wan_motion_5s")  body.durationSeconds = 5;
      if (activeToolKey === "wan_motion_10s") body.durationSeconds = 10;
      const res = await apiRequest("POST", endpoint, body);
      return res.json() as Promise<{ file: StudioFile; balance: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      setActiveTemplate(null);
      toast({ title: "Your clip is ready", description: "Scroll down to your library." });
    },
    onError: async (err: any) => {
      let msg = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(msg);
      if (m) { try { const p = JSON.parse(m[1]); if (p?.message) msg = p.message; } catch {} }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Couldn't generate", description: msg, variant: "destructive" });
    },
  });

  function pickTemplate(t: Template) {
    setActiveTemplate(t.slug);
    setOutputKind(t.kind);
    setPrompt(t.prompt);
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 60);
  }

  function clearReference() {
    setSelectedSourceId(null);
  }

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
  if (!isAdmin) return <StudioComingSoon />;

  const credits = me.credits;
  const tier = me.tier;
  const cost = activeToolPricing?.creditsCost ?? 0;
  const insufficient = cost > 0 && credits < cost;
  const hasInput = prompt.trim().length > 0 || selectedSourceId !== null;
  const canGenerate =
    !!activeToolPricing &&
    !generateMutation.isPending &&
    !insufficient &&
    hasInput &&
    me.providerReady;

  const selectedRefImage = uploadedImages.find((i) => i.id === selectedSourceId) || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white pb-32" data-testid="page-studio">
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Cinematic background — last clip if available, otherwise animated gradient + grain */}
        <div className="absolute inset-0 z-0">
          {heroOutput?.fileType === "output_video" ? (
            <>
              <video
                src={heroOutput.providerUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-50"
                data-testid="video-hero"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,197,94,0.22),_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.18),_transparent_50%),_radial-gradient(ellipse_at_bottom_left,_rgba(56,189,248,0.18),_transparent_55%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.85))]" />
              <div
                className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
            </>
          )}
        </div>

        <div className="relative z-10 max-w-2xl mx-auto px-5 pt-6 pb-12">
          <div className="flex items-center justify-between gap-3 mb-8">
            <button
              type="button"
              onClick={() => setConfirmExit(true)}
              className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition"
              data-testid="button-studio-exit"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Exit
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_24px_rgba(34,197,94,0.5)]">
                <Wand2 className="w-5 h-5 text-black" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">GUBER</p>
                <p className="text-sm font-black tracking-tight">STUDIO</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5"
                data-testid="text-studio-credits"
              >
                <Coins className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-xs font-bold tabular-nums">{credits}</span>
              </div>
              <Badge
                variant="outline"
                className="tracking-widest text-[9px] border-white/20 bg-white/5"
                data-testid="badge-studio-tier"
              >
                {TIER_LABEL[tier] || tier.toUpperCase()}
              </Badge>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
            Create something
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">
              cinematic.
            </span>
          </h1>
          <p className="text-sm text-white/70 mt-4 max-w-md">
            Pick a template, type a moment, hit generate. Your AI clip lands in seconds —
            ready for a reel, an ad, or a listing.
          </p>

          {!heroOutput && (
            <div className="mt-8 flex items-center gap-2 text-[11px] text-white/50">
              <Play className="w-3.5 h-3.5" />
              <span>Your first clip will play right here.</span>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-5 space-y-10">
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
            The AI provider isn't connected yet. Generation is disabled until the key is set — your credits are safe.
          </div>
        )}

        {/* ─── TRENDING TEMPLATES (CapCut-style cinematic carousel) ───── */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              Trending templates
            </h2>
            <span className="text-[10px] uppercase tracking-widest text-white/40">tap to start</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x snap-mandatory scrollbar-hide">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const active = activeTemplate === t.slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className={`shrink-0 w-40 h-56 rounded-2xl snap-start relative overflow-hidden text-left group transition-transform duration-200 ${
                    active ? "ring-2 ring-emerald-400 scale-[1.02]" : "hover:scale-[1.02]"
                  }`}
                  data-testid={`template-${t.slug}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient}`} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
                  <div className="absolute top-3 left-3">
                    <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className="text-[9px] uppercase tracking-widest bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">
                      {t.tag}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="font-black text-base leading-tight">{t.label}</p>
                    <p className="text-[10px] text-white/70 line-clamp-2 mt-1">{t.prompt}</p>
                  </div>
                  {active && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── PROMPT + REFERENCE + GENERATE ──────────────────────────── */}
        <section className="space-y-4">
          <div className="relative rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-md p-1 shadow-[0_0_60px_-15px_rgba(34,197,94,0.4)]">
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-r from-emerald-500/0 via-emerald-500/30 to-violet-500/0 opacity-0 focus-within:opacity-100 transition-opacity blur-xl pointer-events-none" />
            <Textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); if (activeTemplate) setActiveTemplate(null); }}
              placeholder={
                outputKind === "audio"
                  ? "Describe a track… uplifting cinematic strings, slow build, hopeful 30 seconds instrumental."
                  : "Describe a moment… A neon-lit panda DJ in Tokyo, slow cinematic dolly-in, vaporwave colors."
              }
              maxLength={500}
              rows={4}
              className="relative bg-transparent border-0 text-base placeholder:text-white/40 focus-visible:ring-0 resize-none rounded-3xl px-5 py-4"
              data-testid="textarea-prompt"
            />
            <div className="relative flex items-center justify-between gap-2 px-3 pb-2 pt-1">
              <div className="flex items-center gap-2 min-w-0">
                {selectedRefImage ? (
                  <div className="relative">
                    <img
                      src={selectedRefImage.providerUrl}
                      alt="reference"
                      className="w-10 h-10 rounded-lg object-cover ring-1 ring-emerald-400/50"
                      data-testid="img-active-reference"
                    />
                    <button
                      type="button"
                      onClick={clearReference}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                      data-testid="button-remove-reference"
                      aria-label="Remove reference image"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  outputKind === "video" && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFile(e.target.files?.[0])}
                        data-testid="input-source-image"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadMutation.isPending}
                        className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/5 transition disabled:opacity-50"
                        data-testid="button-pick-source"
                      >
                        {uploadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        <ImageIcon className="w-3.5 h-3.5" />
                        Reference
                      </button>
                    </>
                  )
                )}
                {activeToolPricing && (
                  <span className="text-[11px] text-white/60 truncate">
                    {activeToolPricing.label} · <span className="text-amber-300 font-semibold">{activeToolPricing.creditsCost} cr</span>
                    {activeToolPricing.durationSeconds && <> · {activeToolPricing.durationSeconds}s</>}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/40 tabular-nums">{prompt.length}/500</p>
            </div>
          </div>

          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => generateMutation.mutate()}
            className="group relative w-full h-16 rounded-2xl overflow-hidden font-black tracking-wider text-base disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-generate"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500" />
            {!generateMutation.isPending && (
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500 blur-xl opacity-50 group-hover:opacity-80 transition-opacity" />
            )}
            <div className="absolute -inset-x-20 top-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700" />
            <div className="relative flex items-center justify-center gap-2 text-black">
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Rendering…</span>
                  <span className="text-black/70 text-xs font-normal">30–90s</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  <span>GENERATE</span>
                  {activeToolPricing && (
                    <span className="text-black/80 text-xs font-normal">· {activeToolPricing.creditsCost} cr</span>
                  )}
                </>
              )}
            </div>
          </button>

          {generateMutation.isPending && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center gap-3" data-testid="status-rendering">
              <div className="relative w-10 h-10 shrink-0">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 to-violet-400 animate-pulse" />
                <div className="absolute inset-1 rounded-full bg-black flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Rendering your clip</p>
                <p className="text-[11px] text-white/60 truncate">Pixels in motion. Hang tight — leaving this page wipes the result.</p>
              </div>
            </div>
          )}

          {insufficient && !generateMutation.isPending && !isIOS && (
            <Link href="/studio/credits">
              <Button
                variant="outline"
                className="w-full border-amber-400 text-amber-300 hover:bg-amber-400/10 rounded-2xl"
                data-testid="button-buy-credits"
              >
                <ShoppingCart className="w-4 h-4 mr-2" /> Out of credits — buy a pack
              </Button>
            </Link>
          )}
          {insufficient && !generateMutation.isPending && isIOS && (
            <p className="text-center text-[11px] text-white/60" data-testid="text-ios-credits-unavailable">
              Out of credits. Top-ups aren't available in the iOS app yet — visit guberapp.app to buy more.
            </p>
          )}
        </section>

        {/* ─── LIBRARY (this session) ─────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-black tracking-tight">Your library</h2>
            {outputs.length > 0 && (
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                {outputs.length} clip{outputs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {outputs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center" data-testid="text-library-empty">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400/30 to-violet-600/30 mx-auto mb-3 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-300" />
              </div>
              <p className="text-sm font-semibold">Your first clip lives here</p>
              <p className="text-xs text-white/50 mt-1">Pick a template or write a prompt — your library fills up fast.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {outputs.map((o) => (
                <Card
                  key={o.id}
                  className="overflow-hidden bg-white/[0.03] border-white/10 hover:border-white/20 transition group"
                  data-testid={`card-clip-${o.id}`}
                >
                  <CardContent className="p-2">
                    {o.fileType === "output_video" ? (
                      <video
                        src={o.providerUrl}
                        controls
                        playsInline
                        className="w-full rounded-lg bg-black aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-violet-500/30 to-emerald-500/20 flex items-center justify-center">
                        <Music className="w-8 h-8 text-white/70" />
                      </div>
                    )}
                    {o.fileType === "output_audio" && (
                      <audio src={o.providerUrl} controls className="w-full mt-2" />
                    )}
                    <div className="flex items-center justify-between gap-1 mt-2 px-1">
                      <span className="text-[10px] text-white/50 truncate">{o.meta?.toolKey || ""}</span>
                      <a href={o.providerUrl} download target="_blank" rel="noreferrer" data-testid={`link-download-${o.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-white/70 hover:text-white hover:bg-white/10">
                          <Download className="w-3 h-3 mr-1" /> Save
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

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
