// GUBER Studio — For You feed (Phase 3, Kling-style Explore tab).
//
// Full-bleed vertical scroll of admin-curated `studio_featured_clips`.
// Each clip plays autoplay/muted/loop, IntersectionObserver pauses any
// video that isn't on screen so we don't burn the user's battery or
// CDN bandwidth on a 12-card feed. Tap "Recreate" → /studio?prompt=...
// and the studio page prefills the textarea + scrolls to it.
//
// Like / Share are cosmetic for now (Phase 3 ships the surface; the
// social graph + share API are a follow-up).
//
// Hidden behind a nav entry on /studio so the legacy v2 surface still
// works for anyone deep-linking.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, Share2, Sparkles, Wand2, Loader2, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FeaturedClip = {
  id: number;
  slug: string;
  label: string;
  caption: string;
  videoUrl: string;
  posterUrl: string | null;
};

// Each card is its own component so the IntersectionObserver only
// observes one <video> per ref and we don't have to re-keying the
// observer when the list changes.
function ExploreCard({
  clip,
  muted,
  onToggleMute,
  onRecreate,
  onFailed,
}: {
  clip: FeaturedClip;
  muted: boolean;
  onToggleMute: () => void;
  onRecreate: () => void;
  onFailed: (id: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  function share() {
    const url = `${window.location.origin}/studio/explore#${clip.slug}`;
    if (navigator.share) {
      navigator.share({ title: clip.label, text: clip.caption, url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied", description: "Share away." }),
      () => toast({ title: "Couldn't copy", variant: "destructive" }),
    );
  }

  return (
    <section
      id={clip.slug}
      className="relative h-screen w-full snap-start snap-always flex items-center justify-center bg-black"
      data-testid={`explore-card-${clip.slug}`}
    >
      <video
        ref={ref}
        src={clip.videoUrl}
        poster={clip.posterUrl ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onError={() => onFailed(clip.id)}
        className="absolute inset-0 w-full h-full object-cover"
        data-testid={`video-explore-${clip.slug}`}
      />

      {/* gradient washes for legibility */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none" />

      {/* mute toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/70 transition"
        aria-label={muted ? "Unmute" : "Mute"}
        data-testid={`button-mute-${clip.slug}`}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* right-side action rail */}
      <div className="absolute right-3 bottom-32 z-10 flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className="flex flex-col items-center gap-1 text-white"
          aria-label="Like"
          data-testid={`button-like-${clip.slug}`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition ${liked ? "bg-rose-500/90 border-rose-400" : "bg-black/40 border-white/15 hover:bg-black/60"}`}>
            <Heart className={`w-6 h-6 ${liked ? "fill-white text-white" : "text-white"}`} />
          </div>
          <span className="text-[10px] font-bold tabular-nums">{liked ? "1" : "—"}</span>
        </button>
        <button
          type="button"
          onClick={share}
          className="flex flex-col items-center gap-1 text-white"
          aria-label="Share"
          data-testid={`button-share-${clip.slug}`}
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center hover:bg-black/60 transition">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-bold">Share</span>
        </button>
      </div>

      {/* bottom caption + recreate */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 pb-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase tracking-widest bg-emerald-400/90 text-black px-2 py-1 rounded-full font-black">
            Trending
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/60">@guber</span>
        </div>
        <p className="font-black text-2xl leading-tight text-white drop-shadow">{clip.label}</p>
        <p className="text-sm text-white/80 mt-2 line-clamp-3 leading-snug">{clip.caption}</p>
        <button
          type="button"
          onClick={onRecreate}
          className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-300 text-black font-black px-6 py-3 text-sm shadow-[0_0_24px_rgba(34,197,94,0.45)] hover:shadow-[0_0_36px_rgba(34,197,94,0.65)] transition"
          data-testid={`button-recreate-${clip.slug}`}
        >
          <Wand2 className="w-4 h-4" /> Recreate this
        </button>
      </div>
    </section>
  );
}

// Map a featured clip → the most appropriate dedicated tool route. We
// look at the slug + caption text first (sharper signal than label), then
// fall back to /studio/text-to-video which can handle any prompt.
function routeForClip(clip: FeaturedClip): { path: string; query: string } {
  const hay = `${clip.slug} ${clip.caption} ${clip.label}`.toLowerCase();
  const params = new URLSearchParams({ prompt: clip.caption, ref: clip.slug });
  if (/(music|song|track|score|beat|audio|instrumental)/.test(hay)) {
    return { path: "/studio/music", query: params.toString() };
  }
  if (/(commercial|ad\b|advert|brand|product reveal|spot)/.test(hay)) {
    return { path: "/studio/commercial", query: params.toString() };
  }
  if (/(portrait|photo|reference|mirror)/.test(hay)) {
    return { path: "/studio/mirror-motion", query: params.toString() };
  }
  return { path: "/studio/text-to-video", query: params.toString() };
}

export default function StudioExplore() {
  const [, navigate] = useLocation();
  const featuredQuery = useQuery<FeaturedClip[]>({ queryKey: ["/api/studio/featured"] });
  const [muted, setMuted] = useState(true);
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());

  const visibleClips = useMemo(
    () => (featuredQuery.data ?? []).filter((c) => !failedIds.has(c.id)),
    [featuredQuery.data, failedIds],
  );

  useEffect(() => {
    const prev = document.title;
    document.title = "Explore — GUBER Studio";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prev;
      meta.remove();
    };
  }, []);

  function recreate(clip: FeaturedClip) {
    const { path, query } = routeForClip(clip);
    navigate(`${path}?${query}`);
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black text-white">
        {/* sticky header */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <Link href="/studio">
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-1.5 text-xs text-white/80 hover:text-white px-2 py-1.5 rounded-lg bg-black/30 backdrop-blur-md border border-white/10"
              data-testid="button-explore-back"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Studio
            </button>
          </Link>
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/30 backdrop-blur-md border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-black tracking-tight">For You</span>
          </div>
          <div className="w-16" />
        </div>

        {featuredQuery.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        )}

        {!featuredQuery.isLoading && visibleClips.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Sparkles className="w-8 h-8 text-emerald-400" />
            <p className="font-black text-lg">No clips yet</p>
            <p className="text-sm text-white/60 max-w-xs">Featured clips will appear here once an admin curates them.</p>
            <Link href="/studio">
              <button type="button" className="mt-4 px-5 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-white/90 transition">
                Back to Studio
              </button>
            </Link>
          </div>
        )}

        {/* vertical snap feed */}
        <div className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide">
          {visibleClips.map((clip) => (
            <ExploreCard
              key={clip.id}
              clip={clip}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onRecreate={() => recreate(clip)}
              onFailed={(id) =>
                setFailedIds((prev) => {
                  if (prev.has(id)) return prev;
                  const next = new Set(prev);
                  next.add(id);
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
