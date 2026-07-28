// GUBER Studio — simplified 2-tool hub
// Job 1: Quick Pic (image generation via prompt or upload)
// Job 2: Video Agent (Smart Asset-Aware AI Video, 4-phase pipeline)

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Coins, ImageIcon, Layers, ChevronRight, Sparkles, Zap, Megaphone } from "lucide-react";

type StudioMe = {
  credits: number;
  tier: "free" | "standard" | "business" | "enterprise";
  providerReady: boolean;
};

const TIER_COLOR: Record<string, string> = {
  free: "hsl(222 47% 45%)",
  standard: "hsl(270 100% 65%)",
  business: "hsl(45 100% 60%)",
  enterprise: "hsl(152 100% 44%)",
};

export default function StudioPage() {
  const { user } = useAuth();

  const meQuery = useQuery<StudioMe>({
    queryKey: ["/api/studio/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/studio/me");
      if (!res.ok) throw new Error("Failed to load Studio info");
      return res.json();
    },
  });
  const me = meQuery.data;

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 47% 3%)" }}>

      {/* Header */}
      <div
        className="px-5 pt-10 pb-6"
        style={{ borderBottom: "1px solid hsl(222 47% 10%)" }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(270 100% 58%), hsl(200 100% 52%))" }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-none">GUBER Studio</h1>
            <p className="text-[11px] text-white/35 leading-none mt-0.5">AI Creative Tools</p>
          </div>
        </div>

        {/* Credits bar */}
        {me ? (
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: "hsl(222 47% 7%)", border: "1px solid hsl(222 47% 14%)" }}
          >
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4" style={{ color: TIER_COLOR[me.tier] }} />
              <span className="text-sm font-semibold text-white">
                {me.credits.toLocaleString()} credits
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: `${TIER_COLOR[me.tier]}22`, color: TIER_COLOR[me.tier], border: `1px solid ${TIER_COLOR[me.tier]}44` }}
              >
                {me.tier}
              </span>
              <Link href="/studio/credits">
                <span className="text-[11px] text-white/30 hover:text-white/60 transition-colors cursor-pointer">
                  Get credits →
                </span>
              </Link>
            </div>
          </div>
        ) : (
          <div
            className="h-12 rounded-xl animate-pulse"
            style={{ background: "hsl(222 47% 7%)" }}
          />
        )}
      </div>

      {/* Tool cards */}
      <div className="px-4 py-6 space-y-4 max-w-lg mx-auto">

        {/* Tool 1 — Quick Pic */}
        <Link href="/studio/quick-pic">
          <div
            className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99]"
            style={{
              background: "hsl(222 47% 7%)",
              border: "1px solid hsl(152 100% 44% / 0.25)",
            }}
          >
            {/* Glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 30% 50%, hsl(152 100% 44% / 0.08), transparent 70%)" }}
            />

            <div className="relative flex items-center gap-4 px-5 py-5">
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(152 100% 30%), hsl(200 100% 40%))" }}
              >
                <ImageIcon className="w-7 h-7 text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-base font-bold text-white">Quick Pic</h2>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 60%)", border: "1px solid hsl(152 100% 44% / 0.25)" }}
                  >
                    Free
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-snug">
                  Generate images from a text prompt or uploaded reference. Powered by Flux.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-[11px] text-white/35">
                    <Zap className="w-3 h-3" />
                    Prompt-to-image
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-white/35">
                    <ImageIcon className="w-3 h-3" />
                    Upload reference
                  </div>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* Tool 2 — Promo Video */}
        <Link href="/studio/promo">
          <div
            className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99]"
            style={{
              background: "hsl(222 47% 7%)",
              border: "1px solid hsl(25 100% 55% / 0.25)",
            }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 30% 50%, hsl(25 100% 55% / 0.08), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-4 px-5 py-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(25 100% 45%), hsl(45 100% 52%))" }}
              >
                <Megaphone className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-base font-bold text-white">Promo Video</h2>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(25 100% 55% / 0.15)", color: "hsl(25 100% 70%)", border: "1px solid hsl(25 100% 55% / 0.25)" }}
                  >
                    New
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-snug">
                  Fill in your brand, product, and style — the AI writes the brief and generates a polished promo video automatically.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {["No prompt needed", "6 style presets", "5–30s video"].map((tag) => (
                    <div key={tag} className="flex items-center gap-1 text-[11px] text-white/35">
                      <Sparkles className="w-3 h-3" />
                      {tag}
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* Tool 3 — Video Agent */}
        <Link href="/studio/video-agent">
          <div
            className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99]"
            style={{
              background: "hsl(222 47% 7%)",
              border: "1px solid hsl(270 100% 65% / 0.25)",
            }}
          >
            {/* Glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 30% 50%, hsl(270 100% 65% / 0.08), transparent 70%)" }}
            />

            {/* Animated shimmer badge */}
            <div
              className="absolute top-4 right-14 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: "hsl(270 100% 65% / 0.15)", color: "hsl(270 100% 78%)", border: "1px solid hsl(270 100% 65% / 0.3)" }}
            >
              New
            </div>

            <div className="relative flex items-center gap-4 px-5 py-5">
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(270 100% 50%), hsl(200 100% 52%))" }}
              >
                <Layers className="w-7 h-7 text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white mb-0.5">Video Agent</h2>
                <p className="text-sm text-white/50 leading-snug">
                  Upload up to 5 images. The AI indexes, edits, composites, writes a script, records a voiceover, and renders a 30-second video.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {["Vision AI", "Inpainting", "Kling Video", "ElevenLabs"].map((tag) => (
                    <div key={tag} className="flex items-center gap-1 text-[11px] text-white/35">
                      <Sparkles className="w-3 h-3" />
                      {tag}
                    </div>
                  ))}
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
            </div>

            {/* 4-phase pipeline strip */}
            <div
              className="px-5 py-2.5 flex items-center gap-0"
              style={{ borderTop: "1px solid hsl(270 100% 65% / 0.12)" }}
            >
              {[
                { label: "Index", color: "hsl(200 100% 55%)" },
                { label: "Edit", color: "hsl(270 100% 65%)" },
                { label: "Voice", color: "hsl(152 100% 44%)" },
                { label: "Render", color: "hsl(45 100% 60%)" },
              ].map((p, i) => (
                <div key={p.label} className="flex items-center">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: p.color, background: `${p.color}18`, border: `1px solid ${p.color}30` }}
                  >
                    {p.label}
                  </span>
                  {i < 3 && <span className="text-white/15 mx-1 text-xs">→</span>}
                </div>
              ))}
            </div>
          </div>
        </Link>

        {/* Footer hint */}
        <p className="text-center text-[11px] text-white/20 pt-2">
          More tools coming soon · <Link href="/studio/credits"><span className="text-white/35 hover:text-white/50 cursor-pointer">Manage credits</span></Link>
        </p>
      </div>
    </div>
  );
}
