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
import { Link, useSearch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { isStoreBuild } from "@/lib/platform";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { StudioWelcomeTour } from "@/components/studio/studio-welcome-tour";
import { MobileReturnBanner } from "@/components/mobile-return-banner";
import {
  Sparkles, Loader2, Image as ImageIcon, Music, Wand2, X, Download,
  Coins, ArrowLeft, Lock, ExternalLink, Plus, Play, Flame, Film,
  Building2, Megaphone, Zap, Crown, Check, ShoppingCart, ShoppingBag, RotateCcw, Gamepad2,
  Repeat, ChevronRight, UserRound, Settings, Rocket, Camera, Video, Cpu, Layers, Star, Clapperboard,
} from "lucide-react";

// Map icon key strings (stored in DB) to lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap, film: Film, music: Music, flame: Flame, megaphone: Megaphone,
  image: ImageIcon, gamepad2: Gamepad2, repeat: Repeat, crown: Crown,
  building2: Building2, star: Star, sparkles: Sparkles, wand2: Wand2,
  rocket: Rocket, camera: Camera, video: Video, cpu: Cpu, layers: Layers, bolt: Zap,
};

// ── Types ──────────────────────────────────────────────────────────────────
type StudioMe = {
  credits: number;
  tier: "free" | "standard" | "business" | "enterprise";
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
  tileImageUrl?: string | null;
};
type StudioFile = {
  id: number;
  sessionId: number;
  fileType: "upload_image" | "upload_video" | "upload_audio" | "output_video" | "output_audio" | "output_image";
  providerUrl: string;
  resourceType: "image" | "video" | "raw";
  meta: any;
  createdAt: string;
};
type StudioSession = { id: number; status: string; startedAt: string };
type SessionPayload = { session: StudioSession | null; files: StudioFile[] };
type FreeQuota = {
  enabled: boolean;
  day: string;
  dailyLimit: number;
  used: number;
  remaining: number;
};

type ToolKey = "kling_motion_control" | "wan_motion_5s" | "wan_motion_10s" | "minimax_music" | "flux_quick_pic";

// Force-download Cloudinary URLs by injecting `fl_attachment/` after `/upload/`.
// Mirrors the helper in client/src/components/media-lightbox.tsx.
function toAttachment(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("cloudinary.com")) return url;
    const marker = "/upload/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return url;
    const after = u.pathname.slice(idx + marker.length);
    if (after.startsWith("fl_attachment")) return url;
    u.pathname = u.pathname.slice(0, idx + marker.length) + "fl_attachment/" + after;
    return u.toString();
  } catch {
    return url;
  }
}

const TIER_LABEL: Record<string, string> = {
  free:       "Free Plan",
  standard:   "Standard Plan",
  business:   "Business Plan",
  enterprise: "Enterprise Plan",
};

// Phase-2.5: Top-level tools grid (Kling-style "what can I make?" surface).
// Each entry maps to a concrete generator. `costToolKey` looks up live
// pricing from /api/studio/tools so the chip updates if admins reprice.
// `kind` controls the prompt placeholder + tool routing in the prompt box.
// `wizard` opens the Mirror Motion / Commercial Builder dialogs directly.
// `dbKey` is the studio_model_pricing.tool_key used to fetch + set the tile
// background image — may differ from the frontend `key`.
type ToolTile = {
  key: string;
  label: string;
  blurb: string;
  kind: "video" | "audio" | "image";
  icon: React.ComponentType<{ className?: string }>;
  costToolKey: string | null;
  dbKey: string;
  starterPrompt?: string;
  href: string;
  badge?: string;
  accent: string; // neon hex accent color
};
const TOOL_TILES: ToolTile[] = [
  {
    key: "quick-pic", label: "Quick Pic", blurb: "AI image",
    kind: "image", icon: ImageIcon, costToolKey: null, dbKey: "flux_quick_pic", badge: "Free",
    accent: "#00e676",
    href: "/studio/quick-pic",
  },
  {
    key: "text-to-video", label: "Text → Video", blurb: "Motion clip",
    kind: "video", icon: Film, costToolKey: "wan_motion_5s", dbKey: "wan_motion_5s",
    accent: "#a78bfa",
    href: "/studio/text-to-video",
  },
  {
    key: "mirror-motion-tile", label: "Mirror Motion", blurb: "Photo + video",
    kind: "video", icon: Repeat, costToolKey: "mirror_motion", dbKey: "mirror_motion",
    accent: "#f472b6",
    href: "/studio/mirror-motion",
  },
  {
    key: "build-commercial-tile", label: "Build Ad", blurb: "Full commercial",
    kind: "video", icon: Megaphone, costToolKey: "commercial_builder", dbKey: "commercial_builder",
    badge: "New",
    accent: "#fbbf24",
    href: "/studio/commercial",
  },
  {
    key: "music", label: "Music", blurb: "Instrumental track",
    kind: "audio", icon: Music, costToolKey: "minimax_music", dbKey: "minimax_music",
    accent: "#818cf8",
    href: "/studio/music",
  },
  {
    key: "avatar", label: "Avatar", blurb: "AI portrait",
    kind: "image", icon: UserRound, costToolKey: null, dbKey: "avatar",
    badge: "New",
    accent: "#38bdf8",
    href: "/studio/avatar",
  },
  {
    key: "listing-video", label: "Listing Video", blurb: "Sell faster",
    kind: "video", icon: ShoppingBag, costToolKey: "listing_video", dbKey: "listing_video",
    badge: "New",
    accent: "#34d399",
    href: "/studio/listing-video",
  },
  {
    key: "promo-clip", label: "Promo Clip", blurb: "5-sec promo",
    kind: "video", icon: Star, costToolKey: "promo_clip", dbKey: "promo_clip",
    badge: "New",
    accent: "#f59e0b",
    href: "/studio/promo-clip",
  },
  {
    key: "ai-director", label: "AI Director", blurb: "Complete ad",
    kind: "video", icon: Clapperboard, costToolKey: "ai_director", dbKey: "ai_director",
    badge: "New",
    accent: "#39FF14",
    href: "/studio/ai-director",
  },
];

// ── Cinematic templates (CapCut-style starter prompts) ────────────────────
// Each template declares its preferred output kind. Final tool routing also
// considers whether the user has uploaded a reference image.
//
// `videoUrl` (optional) — a short looping preview clip rendered behind the
// gradient. Cards without a URL fall back to the gradient cleanly. The
// initial seed uses public Cloudinary demo videos so the page feels alive
// today; admins should swap these out for our own AI-generated cinematic
// loops via the admin curation UI added in the Trends-rail follow-up.
type Template = {
  slug: string;
  label: string;
  tag: string;
  prompt: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string }>;
  kind: "video" | "audio" | "image";
  wizard?: "mirror_motion" | "commercial_builder";  // task-521
  videoUrl?: string;
  posterUrl?: string;
};
const TEMPLATES: Template[] = [
  {
    slug: "quick-pic", label: "Quick Pic", tag: "Free · 3/day", kind: "image",
    prompt: "A cinematic portrait of a golden retriever wearing aviator sunglasses, dramatic studio lighting, hyper-detailed.",
    gradient: "from-emerald-400 via-teal-500 to-cyan-500",
    icon: ImageIcon,
  },
  {
    slug: "build-commercial", label: "Build a Commercial", tag: "Ad Builder", kind: "video",
    prompt: "Step-by-step ad: vertical → photo → business info → motion + music + voiceover.",
    gradient: "from-emerald-400 via-cyan-500 to-violet-600",
    icon: Megaphone,
    wizard: "commercial_builder",
  },
  {
    slug: "mirror-motion", label: "Mirror Motion", tag: "Your Clip → Motion", kind: "video",
    prompt: "Drop a photo + paste any video URL → motion-cloned video. 16 cr per second.",
    gradient: "from-violet-500 via-fuchsia-500 to-rose-500",
    icon: Repeat,
    wizard: "mirror_motion",
  },
  {
    slug: "gig-ad", label: "Gig Ad", tag: "Promote Yourself", kind: "video",
    prompt: "High-energy self-promo clip, confident subject center-frame, bold on-screen text intro, neon accent lighting, vertical format, scroll-stopping first second.",
    gradient: "from-emerald-500 via-teal-500 to-cyan-600",
    icon: Zap,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/rafting.mp4",
  },
  {
    slug: "create-ad", label: "Brand Ad", tag: "30-sec Spot", kind: "video",
    prompt: "Punchy 6-second product ad, bold typography reveal, energetic close-up, modern brand aesthetic, vibrant cinematic lighting.",
    gradient: "from-fuchsia-500 via-pink-500 to-orange-400",
    icon: Megaphone,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/kitten_fighting.mp4",
  },
  {
    slug: "movie-trailer", label: "Cinematic", tag: "Epic Scale", kind: "video",
    prompt: "Epic movie trailer scene, anamorphic lens flares, slow push-in, dramatic orchestral mood, deep contrast cinematography.",
    gradient: "from-amber-500 via-rose-600 to-purple-700",
    icon: Film,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/elephants.mp4",
  },
  {
    slug: "luxury-promo", label: "Luxury Promo", tag: "Premium Feel", kind: "video",
    prompt: "Luxury product reveal, glossy black surfaces, gold accents, slow rotation, soft rim light, ultra-high-end commercial feel.",
    gradient: "from-yellow-400 via-amber-600 to-neutral-900",
    icon: Crown,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/sea_turtle.mp4",
  },
  {
    slug: "tiktok-reel", label: "Viral Reel", tag: "Hook-First", kind: "video",
    prompt: "Vertical 9:16 reel, fast hook in first 2 seconds, hand-held camera energy, bold caption flash, trending color grade, scroll-stopping first frame.",
    gradient: "from-cyan-400 via-violet-500 to-fuchsia-600",
    icon: Flame,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/dog.mp4",
  },
  {
    slug: "listing-spotlight", label: "Listing Spotlight", tag: "Sell It", kind: "video",
    prompt: "Cinematic product showcase, dramatic reveal from black, rotating 360 close-up, clean studio lighting, premium feel, ends with bold price reveal.",
    gradient: "from-emerald-400 via-teal-500 to-sky-600",
    icon: Building2,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/cld-sample-video.mp4",
  },
  {
    slug: "music-track", label: "Music Track", tag: "Audio", kind: "audio",
    prompt: "Uplifting cinematic strings with hopeful melody, slow build, instrumental, 30 seconds, broadcast quality.",
    gradient: "from-violet-500 via-purple-600 to-rose-500",
    icon: Music,
  },
  {
    slug: "neon-night", label: "Cyberpunk Night", tag: "Vibes", kind: "video",
    prompt: "Neon-soaked Tokyo alley at night, rain reflections, slow cinematic dolly-in, cyberpunk color grade, atmospheric haze.",
    gradient: "from-sky-400 via-blue-600 to-violet-700",
    icon: Zap,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/snowboarding.mp4",
  },
  {
    slug: "game-highlight", label: "Game Highlight", tag: "Esports", kind: "video",
    prompt: "Esports-style highlight reel, fast zoom-in on the action, glitchy speedlines, neon overlay, high-energy 5-second hype clip.",
    gradient: "from-lime-400 via-emerald-500 to-cyan-600",
    icon: Gamepad2,
    videoUrl: "https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_400/sample.mp4",
  },
];

// Lazy looping preview behind a template card. Uses IntersectionObserver to
// only load + play when in view; pauses when scrolled off. `preload="none"`
// + `poster` keep first paint cheap. Errors silently fall through to the
// gradient layer behind it.
function TemplateVideoLoop({
  src,
  poster,
  onUnavailable,
}: {
  src: string;
  poster?: string;
  // Round-4 review: when a video fails to load, the parent rail should
  // remove the entire card — not just hide the <video>. Parent passes a
  // callback that adds the slug to a failedSlugs Set.
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!el.src) el.src = src;
            el.play().catch(() => {});
          } else {
            try { el.pause(); } catch {}
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);
  if (hidden) return null;
  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      onError={() => { setHidden(true); onUnavailable?.(); }}
      className="absolute inset-0 w-full h-full object-cover opacity-90"
    />
  );
}

// ── Studio-disabled fallback (studio_v2 flag is OFF) ───────────────────────
function StudioDisabled() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 px-6" data-testid="page-studio-disabled">
      <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
        <Lock className="w-8 h-8 text-emerald-400" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">GUBER Studio</h1>
        <p className="text-white/60 text-sm max-w-xs leading-relaxed">
          Studio is temporarily unavailable. Please check back soon.
        </p>
      </div>
      <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-xl">
        <Link href="/">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Link>
      </Button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function StudioPageV2() {
  const { toast } = useToast();
  const { user } = useAuth();
  // task-550: studio_v2 in shared/feature-flags.ts is the single source of
  // truth for the rollout. Flag default is global ON; flipping it off in
  // /admin/qa/flags is the kill switch that hides Studio for everyone.
  const studioFlag = useFeatureFlag("studio_v2");

  const [, navigate] = useLocation();
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [outputKind, setOutputKind] = useState<"video" | "audio" | "image">("video");
  const [prompt, setPrompt] = useState("");
  // Explicit Exit confirm. Sessions live 24h after last activity, so this
  // is purely a "are you sure you want to leave Studio?" navigation guard
  // — it does NOT call /api/studio/session/exit and does not purge.
  const [confirmExit, setConfirmExit] = useState(false);
  // Phase 3 — `/studio?prompt=...&kind=video` prefills from the For You
  // feed's "Recreate this" button. We consume the value once on mount,
  // strip the query string so a refresh doesn't re-trigger the focus,
  // and scroll/focus into the prompt textarea.
  const searchString = useSearch();
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [tilePickerOpenId, setTilePickerOpenId] = useState<number | null>(null);
  const [openTilePreview, setOpenTilePreview] = useState<string | null>(null);
  const closePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const lowCreditNoticeRef = useRef(false);
  const isAdmin = user?.role === "admin";

  // ── Server state ──────────────────────────────────────────────────────
  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const sessionQuery = useQuery<SessionPayload>({
    queryKey: ["/api/studio/session/current"],
    refetchOnWindowFocus: false,
  });
  const freeQuotaQuery = useQuery<FreeQuota>({
    queryKey: ["/api/studio/free-quota"],
    refetchOnWindowFocus: false,
  });
  // Phase-2 Trends rail. Public endpoint, fine to fail silently — if empty,
  // the rail renders nothing and the templates carousel takes the top slot.
  const featuredQuery = useQuery<Array<{ id: number; slug: string; label: string; caption: string; videoUrl: string; posterUrl: string | null }>>({
    queryKey: ["/api/studio/featured"],
    refetchOnWindowFocus: false,
  });
  // Admin-managed prompt templates. If non-empty, overrides the hardcoded
  // TEMPLATES array so admins can update the carousel without a deploy.
  const dbTemplatesQuery = useQuery<Array<{
    id: number; slug: string; label: string; tag: string; prompt: string;
    gradientKey: string; iconKey: string; kind: string; videoUrl: string | null;
    posterUrl: string | null; wizardKey: string | null; position: number; active: boolean;
  }>>({
    queryKey: ["/api/studio/templates"],
    refetchOnWindowFocus: false,
  });

  // Phase-3 prefill from /studio/explore "Recreate this" — runs once.
  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    if (prefillConsumedRef.current) return;
    if (!searchString) return;
    const params = new URLSearchParams(searchString);
    const incoming = params.get("prompt");
    const kind = params.get("kind");
    if (!incoming) return;
    prefillConsumedRef.current = true;
    setPrompt(incoming);
    if (kind === "video" || kind === "audio" || kind === "image") setOutputKind(kind);
    // Strip the query string so refresh doesn't retrigger.
    window.history.replaceState({}, "", "/studio");
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 120);
  }, [searchString]);

  // ── Session lifecycle ─────────────────────────────────────────────────
  const studioReady = !!user && studioFlag.enabled;
  useEffect(() => {
    if (!studioReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/studio/session", { method: "POST", credentials: "include" });
        if (!cancelled && res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
        }
      } catch {}
    })();
    // task-549: removed beforeunload + unmount session-purge. Sessions now
    // live for 24h after last activity (server cron handles cleanup), so
    // tabbing away or hopping between tool pages no longer wipes uploads
    // and clips. We still heartbeat so an actively-used session never
    // times out within the day.
    const touchTimer = window.setInterval(() => {
      fetch("/api/studio/session/touch", { method: "POST", credentials: "include" }).catch(() => {});
    }, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(touchTimer);
    };
  }, [studioReady]);

  // ── Derived state ──────────────────────────────────────────────────────
  const tools = toolsQuery.data ?? [];
  const me = meQuery.data;
  // Map dbKey → tileImageUrl for fast lookup in the tile grid.
  const tileImgMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const t of tools) { if (t.tileImageUrl) m[t.key] = t.tileImageUrl; }
    return m;
  }, [tools]);

  // Admin mutation: assign a generated image as a tool tile background.
  const setTileImageMutation = useMutation({
    mutationFn: async ({ toolDbKey, imageUrl }: { toolDbKey: string; imageUrl: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/studio/tools/${toolDbKey}/tile-image`, { imageUrl });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onMutate: async ({ toolDbKey, imageUrl }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/studio/tools"] });
      const prev = queryClient.getQueryData<Array<{ key: string; tileImageUrl?: string | null }>>(["/api/studio/tools"]);
      queryClient.setQueryData<Array<{ key: string; tileImageUrl?: string | null }>>(
        ["/api/studio/tools"],
        (old) => old?.map((t) => t.key === toolDbKey ? { ...t, tileImageUrl: imageUrl } : t) ?? old,
      );
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/tools"] });
      setTilePickerOpenId(null);
      toast({ title: "Tile background updated" });
    },
    onError: (e: Error, _vars, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/studio/tools"], ctx.prev);
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    },
  });
  const files = sessionQuery.data?.files ?? [];
  const uploadedImages = files.filter((f) => f.fileType === "upload_image");
  const outputs = files.filter((f) => f.fileType === "output_video" || f.fileType === "output_audio" || f.fileType === "output_image");
  const heroOutput = outputs[outputs.length - 1] || null;
  const freeQuota = freeQuotaQuery.data;
  const freeQuickPicEnabled = freeQuota?.enabled ?? true;
  // Round-4 review: track failed video URLs so we drop dead cards out
  // of the rails entirely instead of leaving a card-shaped hole. Both
  // sets are populated by TemplateVideoLoop's onUnavailable callback.
  const [failedTemplateSlugs, setFailedTemplateSlugs] = useState<Set<string>>(new Set());
  const [failedFeaturedIds, setFailedFeaturedIds] = useState<Set<number>>(new Set());

  // Build the effective templates list: DB rows if any, otherwise hardcoded TEMPLATES.
  const effectiveTemplates = useMemo<Template[]>(() => {
    const dbRows = dbTemplatesQuery.data;
    if (!dbRows || dbRows.length === 0) return TEMPLATES;
    return dbRows.map((r) => ({
      slug: r.slug,
      label: r.label,
      tag: r.tag,
      prompt: r.prompt,
      gradient: r.gradientKey,
      icon: ICON_MAP[r.iconKey] ?? Zap,
      kind: r.kind as Template["kind"],
      wizard: (r.wizardKey as Template["wizard"]) ?? undefined,
      videoUrl: r.videoUrl ?? undefined,
      posterUrl: r.posterUrl ?? undefined,
    }));
  }, [dbTemplatesQuery.data]);

  const visibleTemplates = useMemo(
    () => effectiveTemplates.filter((t) =>
      (t.slug !== "quick-pic" || freeQuickPicEnabled) &&
      !failedTemplateSlugs.has(t.slug),
    ),
    [effectiveTemplates, freeQuickPicEnabled, failedTemplateSlugs],
  );

  // Low-credit nudge — fire once per page-load when balance drops to ≤3.
  useEffect(() => {
    if (!me) return;
    if (me.credits > 0 && me.credits <= 3 && !lowCreditNoticeRef.current && !isStoreBuild) {
      lowCreditNoticeRef.current = true;
      toast({
        title: `${me.credits} credit${me.credits === 1 ? "" : "s"} left — top up?`,
        description: "Grab a pack so your next generation doesn't stall.",
      });
    }
    if (me.credits > 3) lowCreditNoticeRef.current = false;
  }, [me, toast]);

  // Tool routing — derived from output kind + whether a reference photo is selected.
  //   audio                           → minimax_music
  //   video + reference image         → kling_motion_control (photo-driven motion)
  //   video, no reference image       → wan_motion_5s        (default)
  const activeToolKey = useMemo<ToolKey>(() => {
    if (outputKind === "image") return "flux_quick_pic";
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
    let dataUrl: string;
    try {
      dataUrl = await compressImageToDataUrl(file);
    } catch (e: any) {
      toast({ title: "Couldn't use that photo", description: e?.message || "Try a different image.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate({ dataUrl, kind: "image" });
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        activeToolKey === "flux_quick_pic"       ? "/api/studio/generate/quick-pic" :
        activeToolKey === "kling_motion_control" ? "/api/studio/generate/motion-control" :
        activeToolKey === "minimax_music"        ? "/api/studio/generate/music" :
                                                   "/api/studio/generate/wan-motion";
      const body: any = { prompt: prompt.trim() };
      if (activeToolKey === "kling_motion_control") body.sourceFileId = selectedSourceId;
      if (activeToolKey === "wan_motion_5s")  body.durationSeconds = 5;
      if (activeToolKey === "wan_motion_10s") body.durationSeconds = 10;
      const res = await apiRequest("POST", endpoint, body);
      return res.json() as Promise<{ file: StudioFile; balance?: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/free-quota"] });
      setActiveTemplate(null);
      toast({
        title: activeToolKey === "flux_quick_pic" ? "Your Quick Pic is ready" : "Your clip is ready",
        description: "Scroll down to your library.",
      });
    },
    onError: async (err: any) => {
      let msg = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(msg);
      if (m) { try { const p = JSON.parse(m[1]); if (p?.message) msg = p.message; } catch {} }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/free-quota"] });
      toast({ title: "Couldn't generate", description: msg, variant: "destructive" });
    },
  });

  // task-549: every tool now lives on a dedicated page. Templates with a
  // wizard slug map onto the matching route; everything else still drops
  // its prompt into the inline Quick Pic / inline-text generator below.
  function pickTemplate(t: Template) {
    // Preserve template intent: pass the starter prompt as ?prompt= so the
    // dedicated page lands with the same text the user just tapped on.
    const q = t.prompt ? `?prompt=${encodeURIComponent(t.prompt)}` : "";
    if (t.wizard === "mirror_motion") { navigate(`/studio/mirror-motion${q}`); return; }
    if (t.wizard === "commercial_builder") { navigate(`/studio/commercial${q}`); return; }
    if (t.kind === "audio") { navigate(`/studio/music${q}`); return; }
    if (t.kind === "video") { navigate(`/studio/text-to-video${q}`); return; }
    if (t.kind === "image") { navigate(`/studio/quick-pic${q}`); return; }
    setActiveTemplate(t.slug);
    setOutputKind(t.kind);
    setPrompt(t.prompt);
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 60);
  }

  // task-549: tool-tile tap → navigate to the dedicated tool page.
  // Quick Pic stays inline on /studio so the homepage retains an
  // immediate "type & ship" surface.
  function pickToolTile(tile: ToolTile) {
    if (tile.href && tile.href !== "/studio") {
      navigate(tile.href);
      return;
    }
    setActiveTemplate(null);
    setOutputKind(tile.kind);
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 60);
  }

  function clearReference() {
    setSelectedSourceId(null);
  }

  // ── Loading / auth / flag states ───────────────────────────────────────
  if (studioFlag.isLoading || meQuery.isLoading || toolsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!studioFlag.enabled) return <StudioDisabled />;
  if (!me) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6">
        <p>You need to be signed in to use the Studio.</p>
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }
  const credits = me.credits;
  const tier = me.tier;
  const cost = activeToolPricing?.creditsCost ?? 0;
  const isFreeTool = activeToolKey === "flux_quick_pic";
  const freeRemaining = freeQuota?.remaining ?? 0;
  const freeQuotaActive = isFreeTool && (freeQuota?.enabled ?? true);
  const freeExhausted = freeQuotaActive && freeRemaining <= 0;
  const insufficient = !isFreeTool && cost > 0 && credits < cost;
  const hasInput = isFreeTool
    ? prompt.trim().length > 0
    : prompt.trim().length > 0 || selectedSourceId !== null;
  const canGenerate =
    !!activeToolPricing &&
    !generateMutation.isPending &&
    !insufficient &&
    !freeExhausted &&
    hasInput &&
    me.providerReady;

  const selectedRefImage = uploadedImages.find((i) => i.id === selectedSourceId) || null;

  const studioSearchParams = new URLSearchParams(searchString);
  const studioPurchaseSuccess =
    studioSearchParams.get("credits") === "success" ||
    studioSearchParams.get("subscription") === "success";

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white pb-32 overflow-x-hidden" data-testid="page-studio">
      <MobileReturnBanner show={studioPurchaseSuccess} paramsToStrip={["credits", "subscription"]} />
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
          ) : heroOutput?.fileType === "output_image" ? (
            <>
              <img
                src={heroOutput.providerUrl}
                alt="latest Quick Pic"
                className="absolute inset-0 w-full h-full object-cover opacity-50"
                data-testid="img-hero"
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
            {/* task-552: wrapper testid lets the welcome tour spotlight
                both credits chip + plan pill in a single highlight. */}
            <div className="flex items-center gap-2" data-testid="group-studio-credits-plan">
              {isStoreBuild ? (
                <div
                  className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5"
                  data-testid="text-studio-credits"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-xs font-bold tabular-nums">{credits}</span>
                </div>
              ) : (
                <Link
                  href="/studio/credits"
                  className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 hover:bg-white/15 transition"
                  data-testid="text-studio-credits"
                  aria-label="Open credit packs"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-xs font-bold tabular-nums">{credits}</span>
                  <Plus className="w-3 h-3 text-white/60" />
                </Link>
              )}
              {(freeQuota?.enabled ?? true) && (
                <div
                  className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 backdrop-blur-md border border-emerald-400/30 px-3 py-1.5"
                  data-testid="text-studio-free-quota"
                  title={`Free Quick Pics reset daily at 00:00 UTC`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-xs font-bold tabular-nums text-emerald-100">
                    {freeQuota?.remaining ?? 3}
                  </span>
                  <span className="text-[10px] text-emerald-200/80 hidden sm:inline">free</span>
                </div>
              )}
              {isStoreBuild ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-white/20 bg-white/5 px-2.5 py-1"
                  data-testid="badge-studio-tier"
                >
                  {TIER_LABEL[tier] || tier}
                </Badge>
              ) : (
                <Link
                  href="/studio/credits"
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition border backdrop-blur-md ${
                    tier === "free"
                      ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-100 hover:bg-emerald-400/25"
                      : "bg-gradient-to-r from-emerald-400/30 via-violet-400/30 to-fuchsia-400/30 border-white/20 text-white hover:from-emerald-400/40 hover:via-violet-400/40 hover:to-fuchsia-400/40"
                  }`}
                  data-testid="badge-studio-tier"
                  aria-label="Manage subscription plan"
                >
                  {tier === "free" ? <Sparkles className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
                  <span>{TIER_LABEL[tier] || tier}</span>
                </Link>
              )}
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
            No crew. No editing. Type a prompt and get a professional-grade clip — ready for socials, ads, or listings in seconds.
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {["Video", "Image", "Music", "Ads", "Motion"].map((cap) => (
              <span key={cap} className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)", color: "rgba(0,230,118,0.9)" }}>
                {cap}
              </span>
            ))}
          </div>

          {/* Phase-2.5: Hero promo banner. Free users see an upgrade nudge
              with the cheapest plan's effective per-credit price. Paid
              users see a "what's new" promo. Hidden on store builds. */}
          {!isStoreBuild && (
            <Link href="/studio/credits">
              <div
                className="mt-6 group relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-emerald-500/15 via-violet-500/15 to-fuchsia-500/15 backdrop-blur-md p-4 hover:border-white/30 transition cursor-pointer"
                data-testid="hero-promo-banner"
              >
                <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
                <div className="relative flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-violet-500 flex items-center justify-center shrink-0">
                    {tier === "free" ? <Crown className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">
                      {tier === "free"
                        ? "Subscribers save up to 80% per credit"
                        : "5 pro tools · Image · Video · Music · Mirror · Ads"}
                    </p>
                    <p className="text-[11px] text-white/70 mt-0.5">
                      {tier === "free"
                        ? "Unlock Standard, Business or Enterprise — monthly credits included."
                        : "Tap to manage your plan or top up credits."}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
                </div>
              </div>
            </Link>
          )}

          {!heroOutput && !generateMutation.isPending && (
            <div className="mt-8 relative rounded-2xl overflow-hidden" style={{ height: "158px" }}>
              <video
                autoPlay loop muted playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-40"
                src="https://res.cloudinary.com/demo/video/upload/q_auto:eco,w_640/rafting.mp4"
                onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-emerald-400">AI Studio</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-base font-black text-white leading-snug">Your creation lands here</p>
                <p className="text-[11px] text-white/50">Pick a tool below or tap a template to start</p>
              </div>
              <Link href="/studio/explore"
                className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-white/70 transition">
                See examples <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Shimmer skeleton in the hero while a clip is rendering. */}
          {generateMutation.isPending && (
            <div
              className="mt-8 relative h-44 sm:h-56 w-full rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]"
              data-testid="hero-shimmer"
              aria-busy="true"
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                style={{ animation: "studioShimmer 1.6s linear infinite", backgroundSize: "200% 100%" }}
              />
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/70">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
                <span>Rendering your clip…</span>
              </div>
              <style>{`@keyframes studioShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
            </div>
          )}

          {/* Hero post-gen action row — Replay / Download / Try another.
              Replay is video-only; for audio outputs we hide it to avoid a no-op. */}
          {heroOutput && (
            <div className="mt-8 flex flex-wrap items-center gap-2" data-testid="hero-actions">
              {heroOutput.fileType === "output_video" && (
                <button
                  type="button"
                  onClick={() => {
                    const v = document.querySelector<HTMLVideoElement>('[data-testid="video-hero"]');
                    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 transition"
                  data-testid="button-hero-replay"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Replay
                </button>
              )}
              {heroOutput.fileType === "output_audio" && (
                <audio
                  src={heroOutput.providerUrl}
                  controls
                  className="h-9"
                  data-testid="audio-hero-player"
                />
              )}
              <a
                href={toAttachment(heroOutput.providerUrl)}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 transition"
                data-testid="button-hero-download"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button
                type="button"
                onClick={() => {
                  setActiveTemplate(null);
                  setPrompt("");
                  setSelectedSourceId(null);
                  setTimeout(() => {
                    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    promptRef.current?.focus();
                  }, 60);
                }}
                className="flex items-center gap-1.5 rounded-full bg-emerald-400 text-black px-3 py-1.5 text-xs font-bold hover:bg-emerald-300 transition"
                data-testid="button-hero-try-another"
              >
                <Sparkles className="w-3.5 h-3.5" /> Try another
              </button>
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
          <Button asChild size="sm" variant="outline" className="border-violet-500/50 text-violet-300 hover:bg-violet-900/40 text-[11px] h-7 px-2 rounded-lg shrink-0">
            <Link href="/admin/qa/flags">
              Flags <ExternalLink className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>

        {/* Provider down warning */}
        {!me.providerReady && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100" data-testid="banner-provider-down">
            The AI provider isn't connected yet. Generation is disabled until the key is set — your credits are safe.
          </div>
        )}

        {/* ─── TOOLS GRID (Phase-2.5 Kling-style "what can I make?") ──── */}
        <section data-testid="section-tool-tiles">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-emerald-400" />
              All tools
            </h2>
            <span className="text-[10px] uppercase tracking-widest text-white/40">tap to create</span>
          </div>
          {/* task-549: removed per-tile credit chips — pricing varies by length
              and quality, so showing one number on the tile was misleading.
              Only the genuinely-free Quick Pic still flashes a "Free" badge.
              The grid is fluid (2 → 3 → 5 cols) so it never overflows on phones. */}
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-3">
            {TOOL_TILES.map((tile) => {
              const TileIcon = tile.icon;
              const tileBg = tileImgMap[tile.dbKey];
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => pickToolTile(tile)}
                  className="group relative aspect-square rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 active:scale-95 text-left"
                  style={{
                    background: "#07070f",
                    border: `1.5px solid ${tile.accent}38`,
                    boxShadow: `0 0 18px ${tile.accent}18, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  }}
                  data-testid={`tool-tile-${tile.key}`}
                >
                  {/* full-bleed background image when admin has set one */}
                  {tileBg && (
                    <img
                      src={tileBg}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {/* radial color bloom behind icon */}
                  <div
                    className="absolute inset-0"
                    style={{ background: `radial-gradient(ellipse at 50% 55%, ${tile.accent}${tileBg ? "22" : "30"} 0%, transparent 68%)` }}
                  />
                  {/* bottom fade for text legibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  {/* shimmer sweep on hover */}
                  <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700 pointer-events-none" />
                  {/* badge */}
                  {tile.badge && (
                    <div className="absolute top-2 left-2">
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-black"
                        style={{ background: `${tile.accent}22`, color: tile.accent, border: `1px solid ${tile.accent}55` }}
                      >
                        {tile.badge}
                      </span>
                    </div>
                  )}
                  {/* icon */}
                  <div className="absolute inset-0 flex items-center justify-center pb-6">
                    <TileIcon
                      className="w-11 h-11"
                      style={{ color: tile.accent, filter: `drop-shadow(0 0 12px ${tile.accent}88)` }}
                    />
                  </div>
                  {/* label + blurb */}
                  <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
                    <p className="font-black text-[13px] leading-tight text-white truncate">{tile.label}</p>
                    <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: `${tile.accent}cc` }}>{tile.blurb}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── TRENDING NOW (Phase-2 admin-curated featured clips) ─────── */}
        {(featuredQuery.data?.length ?? 0) > 0 && (
          <section data-testid="section-featured-clips">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Trending now
              </h2>
              <Link
                href="/studio/explore"
                className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 transition"
                data-testid="link-studio-explore"
              >
                For You feed <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x snap-mandatory scrollbar-hide">
              {featuredQuery.data!.filter((c) => !failedFeaturedIds.has(c.id)).map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => {
                    setPrompt(clip.caption);
                    setActiveTemplate(null);
                    requestAnimationFrame(() => {
                      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      promptRef.current?.focus();
                    });
                  }}
                  className="shrink-0 w-56 h-72 rounded-3xl snap-start relative overflow-hidden text-left group transition-transform duration-200 hover:scale-[1.02] ring-1 ring-white/10"
                  data-testid={`featured-clip-${clip.slug}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 via-violet-500/20 to-fuchsia-500/30" />
                  <TemplateVideoLoop
                    src={clip.videoUrl}
                    poster={clip.posterUrl ?? undefined}
                    onUnavailable={() => setFailedFeaturedIds((s) => new Set(s).add(clip.id))}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
                  <div className="absolute top-3 left-3">
                    <span className="text-[9px] uppercase tracking-widest bg-emerald-400/90 text-black px-2 py-1 rounded-full font-bold">
                      Trending
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-black text-lg leading-tight">{clip.label}</p>
                    <p className="text-[11px] text-white/75 line-clamp-3 mt-1.5 leading-snug">{clip.caption}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ─── TRENDING TEMPLATES (CapCut-style cinematic carousel) ───── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              Trending templates
            </h2>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => navigate("/admin/studio")}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-400/70 hover:text-emerald-400 transition-colors bg-emerald-400/10 hover:bg-emerald-400/20 px-2 py-1 rounded-lg"
                  data-testid="button-admin-studio-manage"
                >
                  <Settings className="w-3 h-3" /> Manage
                </button>
              )}
              <span className="text-[10px] uppercase tracking-widest text-white/40">tap to start</span>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x snap-mandatory scrollbar-hide">
            {visibleTemplates.map((t) => {
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
                  {t.videoUrl && (
                    <TemplateVideoLoop
                      src={t.videoUrl}
                      poster={t.posterUrl}
                      onUnavailable={() => setFailedTemplateSlugs((s) => new Set(s).add(t.slug))}
                    />
                  )}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)] mix-blend-overlay" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
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
                  : outputKind === "image"
                  ? "Describe a picture… a neon-lit panda DJ in Tokyo at night, vaporwave colors, hyper-detailed."
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
                  outputKind === "video" && !isFreeTool && (
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
                    {activeToolPricing.label} ·{" "}
                    {isFreeTool && freeQuotaActive ? (
                      <span className="text-emerald-300 font-semibold">FREE · {freeRemaining} left</span>
                    ) : (
                      <span className="text-amber-300 font-semibold">{activeToolPricing.creditsCost} cr</span>
                    )}
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
                    <span className="text-black/80 text-xs font-normal">
                      · {isFreeTool && freeQuotaActive ? "FREE" : `${activeToolPricing.creditsCost} cr`}
                    </span>
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
                <p className="text-[11px] text-white/60 truncate">Pixels in motion. Hang tight — your session sticks around for 24h.</p>
              </div>
            </div>
          )}

          {/* Explicit cost-preview line — required UX contract. */}
          {activeToolPricing && (
            <p className="text-center text-[12px] text-white/70" data-testid="text-cost-preview">
              {isFreeTool && freeQuotaActive ? (
                <>
                  Quick Pics are <span className="font-bold text-emerald-300">FREE</span> · {freeRemaining} of {freeQuota?.dailyLimit ?? 3} left today (UTC).
                </>
              ) : (
                <>
                  This clip costs <span className="font-bold text-amber-300">{activeToolPricing.creditsCost}</span> credit{activeToolPricing.creditsCost === 1 ? "" : "s"}
                  {activeToolPricing.durationSeconds && <> · ~{activeToolPricing.durationSeconds}s</>}.
                </>
              )}
            </p>
          )}

          {freeExhausted && !generateMutation.isPending && (
            <p className="text-center text-[12px] text-amber-200" data-testid="text-free-quota-exhausted">
              You've used your {freeQuota?.dailyLimit ?? 3} free Quick Pics for today. Resets at 00:00 UTC.
            </p>
          )}

          {insufficient && !generateMutation.isPending && !isStoreBuild && (
            <Button
              asChild
              variant="outline"
              className="w-full border-amber-400 text-amber-300 hover:bg-amber-400/10 rounded-2xl"
              data-testid="button-buy-credits"
            >
              <Link href="/studio/credits">
                <ShoppingCart className="w-4 h-4 mr-2" /> Out of credits — buy a pack
              </Link>
            </Button>
          )}
          {insufficient && !generateMutation.isPending && isStoreBuild && (
            <p className="text-center text-[11px] text-white/60" data-testid="text-store-credits-unavailable">
              Out of credits. Top-ups aren't available in the app yet — visit guberapp.app to buy more.
            </p>
          )}
        </section>

        {/* ─── LIBRARY (this session) ─────────────────────────────────── */}
        <section data-testid="section-library">
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
                    ) : o.fileType === "output_image" ? (
                      <img
                        src={o.providerUrl}
                        alt="Quick Pic"
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
                      <a href={toAttachment(o.providerUrl)} download target="_blank" rel="noreferrer" data-testid={`link-download-${o.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-white/70 hover:text-white hover:bg-white/10">
                          <Download className="w-3 h-3 mr-1" /> Save
                        </Button>
                      </a>
                    </div>
                    {/* Admin: set this image as a tool tile background */}
                    {isAdmin && o.fileType === "output_image" && (
                      <div className="mt-1.5 px-1">
                        {tilePickerOpenId === o.id ? (
                          <div className="rounded-xl border border-white/10 bg-black/60 backdrop-blur-md p-2 space-y-1">
                            <p className="text-[9px] uppercase tracking-widest text-white/40 px-1 pb-1">Set as tile background</p>
                            {TOOL_TILES.map((tile) => {
                              const hasThisImg = tileImgMap[tile.dbKey] === o.providerUrl;
                              const currentBg = tileImgMap[tile.dbKey];
                              return (
                                <button
                                  key={tile.dbKey}
                                  type="button"
                                  disabled={setTileImageMutation.isPending}
                                  onClick={() => setTileImageMutation.mutate({ toolDbKey: tile.dbKey, imageUrl: o.providerUrl })}
                                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-semibold transition hover:bg-white/10 flex items-center gap-2"
                                  style={{ color: tile.accent }}
                                  data-testid={`btn-set-tile-${tile.dbKey}`}
                                >
                                  {currentBg ? (
                                    <Popover
                                      open={openTilePreview === tile.dbKey}
                                      onOpenChange={(v) => { if (!v) setOpenTilePreview(null); }}
                                    >
                                      <PopoverTrigger asChild>
                                        <span
                                          className="flex-shrink-0 rounded cursor-pointer"
                                          onMouseEnter={() => {
                                            if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current);
                                            setOpenTilePreview(tile.dbKey);
                                          }}
                                          onMouseLeave={() => {
                                            closePreviewTimer.current = setTimeout(() => setOpenTilePreview(null), 80);
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenTilePreview((prev) => prev === tile.dbKey ? null : tile.dbKey);
                                          }}
                                        >
                                          <img
                                            src={currentBg}
                                            alt=""
                                            className="w-7 h-7 rounded object-cover ring-1 ring-white/20 block"
                                            data-testid={`thumb-tile-${tile.dbKey}`}
                                          />
                                        </span>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        side="left"
                                        sideOffset={8}
                                        className="p-1 bg-black/90 border-white/10 rounded-lg shadow-2xl w-auto"
                                        onMouseEnter={() => {
                                          if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current);
                                          setOpenTilePreview(tile.dbKey);
                                        }}
                                        onMouseLeave={() => {
                                          closePreviewTimer.current = setTimeout(() => setOpenTilePreview(null), 80);
                                        }}
                                        data-testid={`tooltip-tile-${tile.dbKey}`}
                                      >
                                        <img
                                          src={currentBg}
                                          alt={`${tile.label} tile preview`}
                                          className="w-40 h-[90px] rounded object-cover block"
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    <span className="w-7 h-7 rounded flex-shrink-0 bg-white/10 ring-1 ring-white/10" data-testid={`thumb-tile-${tile.dbKey}-empty`} />
                                  )}
                                  <span className="flex-1">{tile.label}{hasThisImg ? " ✓" : ""}</span>
                                </button>
                              );
                            })}
                            {/* Remove background — only shown for tiles that already have any background set */}
                            {TOOL_TILES.filter((tile) => tileImgMap[tile.dbKey]).map((tile) => (
                              <button
                                key={`remove-${tile.dbKey}`}
                                type="button"
                                disabled={setTileImageMutation.isPending}
                                onClick={() => setTileImageMutation.mutate({ toolDbKey: tile.dbKey, imageUrl: null })}
                                className="w-full text-left px-2 py-1 rounded-lg text-[10px] text-red-400/70 hover:text-red-400 hover:bg-white/5 transition"
                                data-testid={`btn-remove-tile-${tile.dbKey}`}
                              >
                                ✕ Remove: {tile.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setTilePickerOpenId(null)}
                              className="w-full text-left px-2 py-1 text-[10px] text-white/30 hover:text-white/60 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full h-7 text-[10px] text-white/50 hover:text-white hover:bg-white/10"
                            onClick={() => setTilePickerOpenId(o.id)}
                            data-testid={`btn-open-tile-picker-${o.id}`}
                          >
                            📌 Set as tile
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Provider attribution footer — required UX contract. */}
        <div className="text-center" data-testid="footer-provider-chip">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/40 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5">
            <Sparkles className="w-3 h-3 text-emerald-400/70" />
            Powered by Fal.ai · Kling · Wan · MiniMax
          </span>
        </div>
      </div>

      {/* Exit confirm — purely a navigation guard. Sessions live 24h after
          last activity; nothing is purged when the user leaves Studio. */}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white" data-testid="dialog-studio-exit">
          <DialogHeader>
            <DialogTitle>Leave Studio?</DialogTitle>
            <DialogDescription className="text-white/70">
              Your session sticks around for 24 hours, so any clips and uploads
              will still be here when you come back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setConfirmExit(false)}
              data-testid="button-exit-cancel"
            >
              Stay
            </Button>
            <Button
              type="button"
              className="bg-white text-black hover:bg-white/90 font-bold"
              onClick={() => { setConfirmExit(false); navigate("/"); }}
              data-testid="button-exit-confirm"
            >
              Leave Studio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* task-552: first-time welcome tour. Renders nothing for users who
          have already seen it (localStorage). Quietly self-dismisses on
          Skip / Done / X. */}
      <StudioWelcomeTour userId={user?.id ?? null} />
    </div>
  );
}
