import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StudioVideo, StudioVibe } from "@shared/schema";
import {
  Sparkles, Image as ImageIcon, Coins, Lock, Loader2, Download, Wand2,
  Share2, FileText, Briefcase, Gift, Crown, Check, Play, Flame,
  Film, Building2, Music, Megaphone, Zap, ChevronDown, Plus, X,
} from "lucide-react";
import { Link } from "wouter";
import { isStoreBuild } from "@/lib/platform";
import { useAuth } from "@/lib/auth-context";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type StudioSubscription = {
  status: string;
  monthlyCredits: number;
  label: string | null;
  cancelAtPeriodEnd: boolean;
};
type StudioMe = {
  credits: number;
  tier: string;
  day1OG: boolean;
  providerReady: boolean;
  subscription: StudioSubscription | null;
};
type Pack = { id: string; credits: number; priceCents: number; label: string };
type StudioTier = {
  id: "creator" | "business";
  label: string;
  priceCents: number;
  monthlyCredits: number;
  description: string;
  features: string[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

const TIER_LABEL: Record<string, string> = {
  standard: "STANDARD",
  creator: "CREATOR",
  business: "BUSINESS",
};

// Cinematic starter templates — CapCut-style preset prompts. These render
// even when the server-side vibes table is empty, so the carousel always
// has inspiration. Selecting one fills the prompt textarea.
type Template = {
  slug: string;
  label: string;
  tag: string;
  prompt: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string }>;
};
const TEMPLATES: Template[] = [
  {
    slug: "create-ad", label: "Create Ad", tag: "Brand",
    prompt: "Punchy 6-second product ad, bold typography reveal, energetic close-up, modern brand aesthetic, vibrant cinematic lighting.",
    gradient: "from-fuchsia-500 via-pink-500 to-orange-400",
    icon: Megaphone,
  },
  {
    slug: "movie-trailer", label: "Movie Trailer", tag: "Cinematic",
    prompt: "Epic movie trailer scene, anamorphic lens flares, slow push-in, dramatic orchestral mood, deep contrast cinematography.",
    gradient: "from-amber-500 via-rose-600 to-purple-700",
    icon: Film,
  },
  {
    slug: "luxury-promo", label: "Luxury Promo", tag: "Premium",
    prompt: "Luxury product reveal, glossy black surfaces, gold accents, slow rotation, soft rim light, ultra-high-end commercial feel.",
    gradient: "from-yellow-400 via-amber-600 to-neutral-900",
    icon: Crown,
  },
  {
    slug: "anime-intro", label: "Anime Intro", tag: "Stylized",
    prompt: "Anime-style intro, dynamic pan, vivid cel-shading, cherry blossoms swirling, motion-blur action lines, J-pop energy.",
    gradient: "from-pink-400 via-rose-400 to-indigo-500",
    icon: Sparkles,
  },
  {
    slug: "tiktok-reel", label: "TikTok Reel", tag: "Viral",
    prompt: "Vertical 9:16 reel, fast hook, hand-held camera energy, bold caption flash, trending color grade, scroll-stopping first frame.",
    gradient: "from-cyan-400 via-violet-500 to-fuchsia-600",
    icon: Flame,
  },
  {
    slug: "real-estate", label: "Real Estate", tag: "Listing",
    prompt: "Cinematic real estate walkthrough, golden-hour exterior, smooth dolly through entry, warm interior reveal, drone pull-back finale.",
    gradient: "from-emerald-400 via-teal-500 to-sky-600",
    icon: Building2,
  },
  {
    slug: "music-video", label: "Music Video", tag: "Beats",
    prompt: "Music video cut, neon city night, slow-mo silhouette walk, beat-matched flicker, lens flares, retro VHS grain.",
    gradient: "from-violet-500 via-purple-600 to-rose-500",
    icon: Music,
  },
  {
    slug: "neon-night", label: "Neon Night", tag: "Vibes",
    prompt: "Neon-soaked Tokyo alley at night, rain reflections, slow cinematic dolly-in, cyberpunk color grade, atmospheric haze.",
    gradient: "from-sky-400 via-blue-600 to-violet-700",
    icon: Zap,
  },
];

export default function StudioPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [prompt, setPrompt] = useState("");
  const [vibeId, setVibeId] = useState<number | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<{ base64: string; preview: string } | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { data: me, isLoading: meLoading } = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const { data: vibes } = useQuery<StudioVibe[]>({ queryKey: ["/api/studio/vibes"] });
  const { data: history } = useQuery<StudioVideo[]>({ queryKey: ["/api/studio/videos"] });
  const { data: packs } = useQuery<Pack[]>({ queryKey: ["/api/studio/packs"] });
  const { data: tiers } = useQuery<StudioTier[]>({ queryKey: ["/api/studio/tiers"] });

  const credits = me?.credits ?? 0;
  const tier = me?.tier ?? "standard";
  const subscription = me?.subscription ?? null;
  const isSubscribed = !!subscription;
  const isCancelPending = !!subscription?.cancelAtPeriodEnd;

  const subscribeMutation = useMutation({
    mutationFn: async (tierId: "creator" | "business") => {
      const res = await apiRequest("POST", "/api/stripe/studio-subscription-checkout", { tier: tierId });
      return res.json() as Promise<{ checkoutUrl?: string; message?: string }>;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else toast({ title: "Checkout failed", description: data.message || "Try again.", variant: "destructive" });
    },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const cancelSubMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/cancel-studio-subscription", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Subscription cancelled", description: "Your tier reverts to standard once the current period ends." });
    },
    onError: (err: any) => toast({ title: "Couldn't cancel", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate", {
        prompt: prompt.trim(),
        vibeId: vibeId ?? undefined,
        sourceImageBase64: sourceImage?.base64,
      });
      return res.json();
    },
    onSuccess: () => {
      setPrompt("");
      setSourceImage(null);
      setActiveTemplate(null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      toast({ title: "Clip ready!", description: "Your generation just landed below." });
    },
    onError: async (err: any) => {
      let message = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(message);
      if (m) {
        try { const parsed = JSON.parse(m[1]); if (parsed?.message) message = parsed.message; } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Couldn't generate", description: message, variant: "destructive" });
    },
  });

  const buyPackMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", "/api/stripe/studio-credits-checkout", { packId });
      return res.json() as Promise<{ checkoutUrl?: string; message?: string }>;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else toast({ title: "Checkout failed", description: data.message || "Try again.", variant: "destructive" });
    },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Image only", description: "Pick a JPG/PNG/WebP.", variant: "destructive" }); return; }
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Too large", description: "Max 8MB.", variant: "destructive" }); return; }
    const base64 = await fileToBase64(file);
    setSourceImage({ base64, preview: URL.createObjectURL(file) });
  };

  const pickTemplate = (t: Template) => {
    setActiveTemplate(t.slug);
    setPrompt(t.prompt);
    // Smooth scroll the prompt into view so creators feel the response.
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      promptRef.current?.focus();
    }, 50);
  };

  // Surface Stripe success/cancel returns
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("credits") === "success") {
      toast({ title: "Payment received!", description: "Your credits will appear momentarily." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] }), 2500);
      window.history.replaceState({}, "", "/studio");
    } else if (params.get("credits") === "cancel") {
      toast({ title: "Checkout canceled", description: "No charge was made." });
      window.history.replaceState({}, "", "/studio");
    } else if (params.get("subscription") === "success") {
      toast({ title: "Subscription active!", description: "Welcome to your new Studio tier." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] }), 2500);
      window.history.replaceState({}, "", "/studio");
    } else if (params.get("subscription") === "cancel") {
      toast({ title: "Checkout canceled", description: "No subscription was started." });
      window.history.replaceState({}, "", "/studio");
    }
  }, [toast]);

  const hasInput = prompt.trim().length > 0 || !!sourceImage || !!vibeId;
  const canGenerate = hasInput && credits >= 1 && !generateMutation.isPending;
  const isLowCredits = credits < 1;

  const sortedHistory = useMemo(
    () => (history || []).filter((v) => v.status === "succeeded" || v.status === "pending"),
    [history],
  );
  const heroClip = useMemo(
    () => sortedHistory.find((v) => v.status === "succeeded" && v.videoUrl) || null,
    [sortedHistory],
  );

  if (!isAdmin) {
    return (
      <GuberLayout>
        <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white flex items-center justify-center px-6" data-testid="page-studio-locked">
          <div className="max-w-md text-center space-y-5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold">GUBER Studio</h1>
            <p className="text-neutral-400">
              Studio is in private beta and not yet available to the public. We're putting the finishing touches on it — check back soon.
            </p>
            <Link href="/" className="inline-block">
              <Button variant="outline" data-testid="button-studio-back-home">Back to Home</Button>
            </Link>
          </div>
        </div>
      </GuberLayout>
    );
  }

  return (
    <GuberLayout>
      <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white" data-testid="page-studio">
        {/* ─── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Cinematic background — last clip if available, otherwise animated gradient */}
          <div className="absolute inset-0 z-0">
            {heroClip?.videoUrl ? (
              <>
                <video
                  src={heroClip.videoUrl}
                  poster={heroClip.thumbnailUrl ?? undefined}
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
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.25),_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_rgba(236,72,153,0.2),_transparent_50%),_radial-gradient(ellipse_at_bottom_left,_rgba(56,189,248,0.18),_transparent_55%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.85))]" />
                {/* Subtle film grain */}
                <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay" style={{
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }} />
              </>
            )}
          </div>

          <div className="relative z-10 max-w-2xl mx-auto px-5 pt-8 pb-12">
            <div className="flex items-center justify-between gap-3 mb-8">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-[0_0_24px_rgba(168,85,247,0.5)]">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-display">GUBER</p>
                  <p className="text-sm font-display font-black tracking-tight">STUDIO</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPricing(true)}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 hover:bg-white/15 transition"
                  data-testid="chip-credits"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-xs font-bold tabular-nums" data-testid="text-credits-balance">
                    {meLoading ? "—" : credits}
                  </span>
                </button>
                <Badge variant="outline" className="font-display tracking-widest text-[9px] border-white/20 bg-white/5" data-testid="badge-studio-tier">
                  {TIER_LABEL[tier] || tier.toUpperCase()}
                </Badge>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tight leading-[1.05]">
              Create something
              <br />
              <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
                cinematic.
              </span>
            </h1>
            <p className="text-sm text-white/70 mt-4 max-w-md">
              Pick a vibe, type a moment, hit generate. Your AI clip lands in seconds — ready for a reel, an ad, or a listing.
            </p>

            {!heroClip && (
              <div className="mt-8 flex items-center gap-2 text-[11px] text-white/50">
                <Play className="w-3.5 h-3.5" />
                <span>Your first clip will play right here.</span>
              </div>
            )}
          </div>
        </section>

        <div className="max-w-2xl mx-auto px-5 pb-24 space-y-10">
          {/* Provider not configured */}
          {me && !me.providerReady && (
            <Card className="p-4 border-amber-500/30 bg-amber-500/5 text-amber-100">
              <p className="text-sm font-semibold mb-1">Studio is launching soon</p>
              <p className="text-xs text-white/70">
                Generation is paused while we finish the AI provider connection. Your credits are safe and will work the moment we go live.
              </p>
            </Card>
          )}

          {/* ─── TEMPLATES (CapCut-style cinematic presets) ─────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-display font-black tracking-tight flex items-center gap-2">
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
                    onClick={() => pickTemplate(t)}
                    className={`shrink-0 w-40 h-56 rounded-2xl snap-start relative overflow-hidden text-left group transition-transform duration-200 ${active ? "ring-2 ring-fuchsia-400 scale-[1.02]" : "hover:scale-[1.02]"}`}
                    data-testid={`template-${t.slug}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient}`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    {/* Subtle moving sheen */}
                    <div className="absolute -inset-x-12 top-0 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
                    <div className="absolute top-3 left-3">
                      <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                        <Icon className="w-4.5 h-4.5 text-white" />
                      </div>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="text-[9px] uppercase tracking-widest font-display bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">
                        {t.tag}
                      </span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="font-display font-black text-base leading-tight">{t.label}</p>
                      <p className="text-[10px] text-white/70 line-clamp-2 mt-1">{t.prompt}</p>
                    </div>
                    {active && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-fuchsia-500 flex items-center justify-center shadow-lg">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ─── VIBES (server-driven, when present) ─────────────────────── */}
          {vibes && vibes.length > 0 && (
            <section>
              <h2 className="text-xl font-display font-black tracking-tight mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-fuchsia-400" />
                Featured vibes
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x snap-mandatory scrollbar-hide">
                <button
                  onClick={() => setVibeId(null)}
                  className={`shrink-0 w-32 h-44 rounded-2xl border-2 snap-start flex flex-col items-center justify-center gap-1.5 ${vibeId === null ? "border-fuchsia-400 bg-white/5" : "border-white/10 bg-white/[0.02]"}`}
                  data-testid="button-vibe-none"
                >
                  <X className="w-5 h-5 text-white/50" />
                  <span className="text-[10px] uppercase tracking-widest font-display text-white/60">No Vibe</span>
                </button>
                {vibes.map((v) => {
                  const locked = v.tierRequired !== "standard" && tier === "standard";
                  return (
                    <button
                      key={v.id}
                      disabled={locked}
                      onClick={() => setVibeId(v.id === vibeId ? null : v.id)}
                      className={`shrink-0 w-32 h-44 rounded-2xl border-2 snap-start relative overflow-hidden text-left transition-transform ${vibeId === v.id ? "border-fuchsia-400 scale-[1.02]" : "border-white/10 hover:scale-[1.02]"} ${locked ? "opacity-50" : ""}`}
                      data-testid={`button-vibe-${v.slug}`}
                    >
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt={v.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/30 via-violet-600/20 to-black" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-2.5">
                        <p className="text-[12px] font-bold leading-tight">{v.name}</p>
                        {locked && (
                          <span className="text-[9px] uppercase tracking-widest text-amber-300 flex items-center gap-1 mt-0.5">
                            <Lock className="w-2.5 h-2.5" /> {v.tierRequired}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ─── PROMPT + GENERATE ───────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="relative rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-md p-1 shadow-[0_0_60px_-15px_rgba(168,85,247,0.4)]">
              {/* Glow ring on focus */}
              <div className="absolute -inset-px rounded-3xl bg-gradient-to-r from-fuchsia-500/0 via-fuchsia-500/30 to-violet-500/0 opacity-0 focus-within:opacity-100 transition-opacity blur-xl pointer-events-none" />
              <Textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); if (activeTemplate) setActiveTemplate(null); }}
                placeholder="Describe a moment… A neon-lit panda DJ in Tokyo, slow cinematic dolly-in, vaporwave colors."
                maxLength={500}
                rows={4}
                className="relative bg-transparent border-0 text-base placeholder:text-white/40 focus-visible:ring-0 resize-none rounded-3xl px-5 py-4"
                data-testid="input-prompt"
              />
              <div className="relative flex items-center justify-between gap-2 px-3 pb-2 pt-1">
                <div className="flex items-center gap-1">
                  {sourceImage ? (
                    <div className="relative">
                      <img src={sourceImage.preview} alt="ref" className="w-10 h-10 rounded-lg object-cover ring-1 ring-white/20" />
                      <button
                        onClick={() => setSourceImage(null)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                        data-testid="button-remove-source"
                        aria-label="Remove reference image"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
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
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/5 transition"
                        data-testid="button-pick-source"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <ImageIcon className="w-3.5 h-3.5" />
                        Reference
                      </button>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-white/40 tabular-nums">{prompt.length}/500</p>
              </div>
            </div>

            <button
              disabled={!canGenerate}
              onClick={() => generateMutation.mutate()}
              className="group relative w-full h-16 rounded-2xl overflow-hidden font-display font-black tracking-wider text-base disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-generate"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-400" />
              {!generateMutation.isPending && (
                <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-400 blur-xl opacity-50 group-hover:opacity-80 transition-opacity" />
              )}
              {/* Animated sheen on the button */}
              <div className="absolute -inset-x-20 top-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700" />
              <div className="relative flex items-center justify-center gap-2 text-white">
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Rendering your clip…</span>
                    <span className="text-white/70 text-xs font-normal">30–90s</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    <span>GENERATE</span>
                    <span className="text-white/80 text-xs font-normal">· 1 credit</span>
                  </>
                )}
              </div>
            </button>

            {generateMutation.isPending && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
                <div className="relative w-10 h-10 shrink-0">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-400 animate-pulse" />
                  <div className="absolute inset-1 rounded-full bg-black flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">Rendering frames</p>
                  <p className="text-[11px] text-white/60 truncate">Pixels in motion. You can leave this page — your clip will be in your library.</p>
                </div>
              </div>
            )}

            {isLowCredits && !generateMutation.isPending && (
              <button
                onClick={() => setShowPricing(true)}
                className="w-full text-center text-xs text-amber-300 hover:text-amber-200 transition"
                data-testid="link-low-credits"
              >
                You're out of credits. Tap to grab a pack.
              </button>
            )}
          </section>

          {/* ─── RECENT CREATIONS ────────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-display font-black tracking-tight">Your library</h2>
              {sortedHistory.length > 0 && (
                <span className="text-[10px] uppercase tracking-widest text-white/40">{sortedHistory.length} clip{sortedHistory.length === 1 ? "" : "s"}</span>
              )}
            </div>
            {!history ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-44 rounded-2xl bg-white/5" />
                <Skeleton className="h-44 rounded-2xl bg-white/5" />
              </div>
            ) : sortedHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center" data-testid="text-history-empty">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500/30 to-violet-600/30 mx-auto mb-3 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-fuchsia-300" />
                </div>
                <p className="text-sm font-semibold">Your first clip lives here</p>
                <p className="text-xs text-white/50 mt-1">Pick a template or write a prompt — your library fills up fast.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {sortedHistory.map((v) => (
                  <Card
                    key={v.id}
                    className="overflow-hidden bg-white/[0.03] border-white/10 hover:border-white/20 transition group"
                    data-testid={`card-clip-${v.id}`}
                  >
                    <div className="relative">
                      {v.videoUrl ? (
                        <video
                          src={v.videoUrl}
                          poster={v.thumbnailUrl ?? undefined}
                          controls
                          playsInline
                          className="w-full aspect-square object-cover bg-black"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-gradient-to-br from-fuchsia-500/10 to-violet-600/10 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-fuchsia-300" />
                          <span className="text-[10px] uppercase tracking-widest text-white/50">rendering</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-[11px] line-clamp-2 leading-tight text-white/80">{v.prompt}</p>
                      {v.videoUrl && (
                        <div className="flex items-center gap-1 mt-2">
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-white/70 hover:text-white hover:bg-white/10">
                            <a href={v.videoUrl} download data-testid={`link-download-${v.id}`}>
                              <Download className="w-3 h-3 mr-1" /> Save
                            </a>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-white/70 hover:text-white hover:bg-white/10" data-testid={`button-saveto-${v.id}`}>
                                <Share2 className="w-3 h-3 mr-1" /> Use in…
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild>
                                <Link href={`/resume?studioVideoId=${v.id}`} data-testid={`saveto-resume-${v.id}`}>
                                  <FileText className="w-4 h-4 mr-2" /> My Resume
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/biz/dashboard?studioVideoId=${v.id}`} data-testid={`saveto-promo-${v.id}`}>
                                  <Briefcase className="w-4 h-4 mr-2" /> Business Promo
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/host-drop/new?studioVideoId=${v.id}`} data-testid={`saveto-drop-${v.id}`}>
                                  <Gift className="w-4 h-4 mr-2" /> Cash Drop
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ─── PRICING (collapsed by default — creativity first) ──────── */}
          {!isStoreBuild && (
            <section>
              <button
                onClick={() => setShowPricing((s) => !s)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white/5 hover:bg-white/[0.07] border border-white/10 px-5 py-4 transition"
                data-testid="button-toggle-pricing"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Coins className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold">More credits & upgrades</p>
                    <p className="text-[11px] text-white/50">Top up your balance or unlock pro features</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-white/50 transition-transform ${showPricing ? "rotate-180" : ""}`} />
              </button>

              {showPricing && (
                <div className="mt-5 space-y-8">
                  {/* Credit packs */}
                  <div id="buy">
                    <h3 className="text-xs uppercase tracking-widest font-display text-white/60 mb-3 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5" /> Credit packs
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(packs || []).map((p, i) => {
                        const featured = i === 1;
                        return (
                          <Card
                            key={p.id}
                            className={`p-4 text-center bg-white/[0.03] border-white/10 hover:border-white/25 transition relative overflow-hidden ${featured ? "ring-1 ring-fuchsia-400/40" : ""}`}
                            data-testid={`card-pack-${p.id}`}
                          >
                            {featured && (
                              <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-fuchsia-500 text-white px-2 py-0.5 rounded-full">
                                Popular
                              </span>
                            )}
                            <p className="font-display text-[10px] uppercase tracking-widest text-white/50">{p.label}</p>
                            <p className="text-3xl font-black font-display mt-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">{p.credits}</p>
                            <p className="text-[10px] text-white/50 uppercase tracking-widest">credits</p>
                            <p className="text-lg font-bold mt-2">${(p.priceCents / 100).toFixed(0)}</p>
                            <Button
                              className="w-full mt-3"
                              size="sm"
                              disabled={buyPackMutation.isPending}
                              onClick={() => buyPackMutation.mutate(p.id)}
                              data-testid={`button-buy-${p.id}`}
                            >
                              {buyPackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buy"}
                            </Button>
                          </Card>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subscriptions */}
                  <div id="upgrade">
                    <h3 className="text-xs uppercase tracking-widest font-display text-white/60 mb-3 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5" /> Studio tiers
                    </h3>

                    {isSubscribed && subscription ? (
                      <Card className="p-4 border-fuchsia-400/30 bg-fuchsia-500/[0.06]" data-testid="card-current-subscription">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-widest font-display text-fuchsia-300">Current plan</p>
                            <p className="text-lg font-bold mt-1" data-testid="text-current-tier">{subscription.label || tier.toUpperCase()}</p>
                            <p className="text-xs text-white/60 mt-1">
                              {isCancelPending ? (
                                <>Plan ends at the close of the current billing period. Existing credits stay yours.</>
                              ) : (
                                <>{subscription.monthlyCredits} credits drop into your balance every month. Status: <span className="font-semibold">{subscription.status}</span>.</>
                              )}
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" data-testid="button-cancel-subscription" disabled={cancelSubMutation.isPending || isCancelPending}>
                                {cancelSubMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : isCancelPending ? "Cancellation pending" : "Cancel"}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel Studio subscription?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Your tier reverts to standard at the end of the current billing period. Existing credits stay in your balance, but you'll lose access to locked vibes and tier-only features.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-keep-subscription">Keep it</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancelSubMutation.mutate()} data-testid="button-confirm-cancel">Cancel anyway</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(tiers || []).map((t) => (
                          <Card
                            key={t.id}
                            className={`p-4 bg-white/[0.03] border-white/10 hover:border-white/25 transition ${t.id === "creator" ? "ring-1 ring-fuchsia-400/30" : "ring-1 ring-amber-400/30"}`}
                            data-testid={`card-tier-${t.id}`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="font-display text-sm uppercase tracking-widest font-bold">{t.label}</p>
                              <p className="text-xl font-black font-display">${(t.priceCents / 100).toFixed(0)}<span className="text-[10px] text-white/50 font-normal">/mo</span></p>
                            </div>
                            <p className="text-[11px] text-white/60 mt-1">{t.monthlyCredits} credits/month included</p>
                            <ul className="mt-3 space-y-1.5">
                              {t.features.map((f, i) => (
                                <li key={i} className="text-xs flex items-start gap-1.5 text-white/80">
                                  <Check className="w-3 h-3 text-fuchsia-400 mt-0.5 shrink-0" />
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                            <Button
                              className="w-full mt-3"
                              size="sm"
                              disabled={subscribeMutation.isPending}
                              onClick={() => subscribeMutation.mutate(t.id)}
                              data-testid={`button-subscribe-${t.id}`}
                            >
                              {subscribeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upgrade to ${t.label}`}
                            </Button>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <p className="text-[10px] text-white/40 text-center pt-4">
            By generating you agree to the GUBER <Link href="/acceptable-use" className="underline hover:text-white/70">Acceptable Use Policy</Link>.
          </p>
        </div>
      </div>
    </GuberLayout>
  );
}
