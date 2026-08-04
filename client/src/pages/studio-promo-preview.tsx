// GUBER Studio — Promo Video Render Target (Quality v2)
// Loaded by: (1) live preview iframe, (2) Playwright headless for MP4 export.
// Scene transitions are setTimeout-based → Playwright fake clock controls them.
// In-scene animations are Framer Motion (rAF-based) → also fake-clock controlled.

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Data types ────────────────────────────────────────────────────────────────

export interface PromoData {
  brandName: string;

  tagline?: string;

  productDescription: string;

  stylePreset: string;

  callToAction?: string;

  images: string[];

  imageFocus?: ("top" | "center" | "bottom")[];

  logoUrl?: string;

  features?: string[];

  targetDuration: number; // seconds
  /** Font id from FONT_OPTIONS — undefined means use the style preset's default system font */

  fontId?: string;
}

export interface FontOption {
  id: string;
  label: string;
  hint: string;
  /** woff2 filename under /fonts/. null = system font, no injection needed. */
  file: string | null;
  /** CSS font-family name to use in @font-face + font-family declarations */
  family: string | null;
  /** Preview sample string shown in the selector */
  preview: string;
}
interface StyleTheme {
  bg: string;
  bg2: string;
  accent: string;
  accent2: string;
  text: string;
  subtext: string;
  titleFont: string;
  bodyFont: string;
  td: number;            // transition duration
  ease: string;
  toneColor: string;     // rgba for color-tone overlay on images
  imageFilter: string;   // CSS filter for images
  accentDark: string;    // darker accent for text on light accent bg
}

// ── Themes ────────────────────────────────────────────────────────────────────

const THEMES: Record<string, StyleTheme> = {
  energetic: {
    bg: "#080808", bg2: "#0f0f0f",
    accent: "#FFD600", accent2: "#FF8C00",
    text: "#ffffff", subtext: "#d0d0d0",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, Helvetica, sans-serif",
    td: 0.22, ease: "backOut",
    toneColor: "rgba(255,180,0,0.07)",
    imageFilter: "contrast(1.12) saturate(1.2)",
    accentDark: "#000",
  },
  professional: {
    bg: "#0a1628", bg2: "#0f1f3d",
    accent: "#4A90E2", accent2: "#1d6fd4",
    text: "#ffffff", subtext: "#a8c0dc",
    titleFont: "Georgia, 'Times New Roman', serif",
    bodyFont: '"Trebuchet MS", Arial, sans-serif',
    td: 0.5, ease: "easeInOut",
    toneColor: "rgba(40,100,200,0.08)",
    imageFilter: "contrast(1.08) saturate(0.95) brightness(0.97)",
    accentDark: "#fff",
  },
  luxury: {
    bg: "#100d07", bg2: "#1a150d",
    accent: "#C9A84C", accent2: "#e8c878",
    text: "#f5f0e8", subtext: "#c0a97a",
    titleFont: '"Palatino Linotype", Palatino, Georgia, serif',
    bodyFont: "Georgia, serif",
    td: 0.85, ease: "easeOut",
    toneColor: "rgba(180,130,30,0.1)",
    imageFilter: "contrast(1.05) saturate(0.85) sepia(0.12)",
    accentDark: "#000",
  },
  friendly: {
    bg: "#081a15", bg2: "#0d2420",
    accent: "#2DD4BF", accent2: "#06b6d4",
    text: "#ffffff", subtext: "#99e8da",
    titleFont: '"Trebuchet MS", Arial, sans-serif',
    bodyFont: "Arial, Helvetica, sans-serif",
    td: 0.38, ease: "easeOut",
    toneColor: "rgba(0,200,180,0.07)",
    imageFilter: "contrast(1.06) saturate(1.1)",
    accentDark: "#000",
  },
  dramatic: {
    bg: "#040004", bg2: "#0e000a",
    accent: "#E53E3E", accent2: "#c0392b",
    text: "#ffffff", subtext: "#fca5a5",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, Helvetica, sans-serif",
    td: 0.3, ease: "easeIn",
    toneColor: "rgba(200,30,30,0.1)",
    imageFilter: "contrast(1.18) saturate(0.8) brightness(0.9)",
    accentDark: "#fff",
  },
  bold: {
    bg: "#060c18", bg2: "#0c1830",
    accent: "#FF6B2B", accent2: "#ea4c0d",
    text: "#ffffff", subtext: "#fed7aa",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, Helvetica, sans-serif",
    td: 0.28, ease: "backOut",
    toneColor: "rgba(255,100,30,0.08)",
    imageFilter: "contrast(1.1) saturate(1.15)",
    accentDark: "#fff",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split text into word spans with staggered animation */
function WordReveal({
  text, delay = 0, stagger = 0.07,
  style,
}: {
  text: string; delay?: number; stagger?: number; style?: React.CSSProperties;
}) {
  const words = text.trim().split(/\s+/);
  return (
    <span style={{ display: "inline" }}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: delay + i * stagger, duration: 0.35, ease: "easeOut" }}
          style={{ display: "inline-block", marginRight: "0.28em", ...style }}
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

/** Persistent logo bug in top-right corner */
function LogoBug({ logoUrl }: { logoUrl: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      style={{
        position: "absolute", top: 24, right: 28, zIndex: 50,
        maxWidth: 160, maxHeight: 64,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))",
      }}
    >
      <img src={logoUrl} alt="logo" style={{ maxWidth: 160, maxHeight: 64, objectFit: "contain" }} />
    </motion.div>
  );
}

/** Vignette + tone overlay (on every scene) */
function SceneChrome({ theme, logoUrl }: { theme: StyleTheme; logoUrl?: string }) {
  return (
    <>
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
        background: "radial-gradient(ellipse 110% 90% at 50% 50%, transparent 40%, rgba(0,0,0,0.72) 100%)",
      }} />
      {/* Persistent logo bug */}
      {logoUrl && <div style={{ position: "absolute", inset: 0, zIndex: 20 }}><LogoBug logoUrl={logoUrl} /></div>}
    </>
  );
}

/** Horizontal accent divider line */
function AccentLine({ theme, delay = 0, width = 100 }: { theme: StyleTheme; delay?: number; width?: number }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      style={{
        height: 3, width,
        background: `linear-gradient(to right, ${theme.accent}, ${theme.accent2}, transparent)`,
        transformOrigin: "left", borderRadius: 2, margin: "14px 0",
      }}
    />
  );
}

/** Full-image with focal point + color grade + tone overlay */
function StyledImage({
  src, focus = "center", theme, style,
}: {
  src: string; focus?: "top" | "center" | "bottom"; theme: StyleTheme; style?: React.CSSProperties;
}) {
  const posY = focus === "top" ? "20%" : focus === "bottom" ? "80%" : "50%";
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      <img
        src={src} alt=""
        style={{
          width: "100%", height: "100%",
          objectFit: "cover", objectPosition: `50% ${posY}`,
          filter: theme.imageFilter,
        }}
      />
      {/* Color tone overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: theme.toneColor,
        mixBlendMode: "multiply",
      }} />
    </div>
  );
}

// ── Scene 0 — Brand Reveal ────────────────────────────────────────────────────

function BrandScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const img = data.images[0];
  const focus = data.imageFocus?.[0] ?? "center";
  const hasImg = !!img;

  return (
    <motion.div
      key="brand" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: theme.td }}
      style={{ position: "absolute", inset: 0, overflow: "hidden",
        background: `linear-gradient(145deg, ${theme.bg} 0%, ${theme.bg2} 100%)` }}
    >
      {/* Background image — faded, right-biased */}
      {hasImg && (
        <motion.div
          initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ duration: theme.td * 3, ease: "easeOut" }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "52%" }}
        >
          <StyledImage src={img} focus={focus} theme={theme} />
          {/* Fade left edge into bg */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 240,
            background: `linear-gradient(to right, ${theme.bg}, transparent)`,
          }} />
          {/* Fade right edge */}
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0, width: 80,
            background: `linear-gradient(to left, ${theme.bg}, transparent)`,
          }} />
        </motion.div>
      )}

      {/* Left accent bar */}
      <motion.div
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ duration: theme.td * 2.5, ease: theme.ease }}
        style={{
          position: "absolute", left: 0, top: "15%", bottom: "15%", width: 6,
          background: `linear-gradient(to bottom, ${theme.accent}, ${theme.accent2})`,
          transformOrigin: "top", borderRadius: "0 3px 3px 0",
        }}
      />

      {/* Content */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: hasImg ? "55%" : "85%",
        padding: "0 72px",
        display: "flex", flexDirection: "column", justifyContent: "center",
        zIndex: 5,
      }}>
        {/* Brand name */}
        <motion.div
          initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ duration: theme.td * 2, delay: 0.12, ease: theme.ease }}
        >
          <div style={{
            fontFamily: theme.titleFont,
            fontSize: hasImg ? 78 : 100,
            fontWeight: 900,
            color: theme.text,
            lineHeight: 1.0,
            letterSpacing: -1,
            textTransform: "uppercase",
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
          }}>
            {data.brandName}
          </div>
        </motion.div>

        <AccentLine theme={theme} delay={0.4} width={140} />

        {/* Tagline — word-by-word */}
        {data.tagline && (
          <div style={{
            fontFamily: theme.bodyFont, fontSize: 30,
            color: theme.subtext, lineHeight: 1.45,
            fontStyle: "italic", maxWidth: 480,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}>
            <WordReveal text={data.tagline} delay={0.55} />
          </div>
        )}
      </div>

      <SceneChrome theme={theme} logoUrl={data.logoUrl} />
    </motion.div>
  );
}

// ── Scene 1 — Key Highlights ──────────────────────────────────────────────────

function HighlightsScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const features = (data.features ?? []).filter(Boolean).slice(0, 3);
  const img = data.images[1] ?? data.images[0];
  const focus = data.imageFocus?.[1] ?? data.imageFocus?.[0] ?? "center";

  return (
    <motion.div
      key="highlights" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -60 }}
      transition={{ duration: theme.td * 1.2 }}
      style={{ position: "absolute", inset: 0, overflow: "hidden",
        background: `linear-gradient(165deg, ${theme.bg2} 0%, ${theme.bg} 100%)` }}
    >
      {/* Background image very dim */}
      {img && (
        <>
          <StyledImage src={img} focus={focus} theme={theme} />
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(to right, ${theme.bg}f0 0%, ${theme.bg}cc 55%, ${theme.bg}88 100%)`,
          }} />
        </>
      )}
      {!img && (
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 30% 50%, ${theme.accent}18 0%, transparent 60%)`,
        }} />
      )}

      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{
          position: "absolute", top: 48, left: 72,
          fontFamily: theme.bodyFont, fontSize: 18, fontWeight: 700,
          color: theme.accent, letterSpacing: 4, textTransform: "uppercase",
          zIndex: 5,
        }}
      >
        Why Choose {data.brandName}
      </motion.div>

      {/* Feature rows */}
      <div style={{
        position: "absolute", top: "50%", left: 72, right: 72,
        transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 28, zIndex: 5,
      }}>
        {features.map((f, i) => (
          <motion.div
            key={i}
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.25 + i * 0.4, ease: "easeOut" }}
            style={{ display: "flex", alignItems: "center", gap: 28 }}
          >
            {/* Number badge */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: theme.titleFont, fontSize: 26, fontWeight: 900,
              color: theme.accentDark,
              boxShadow: `0 4px 16px ${theme.accent}55`,
            }}>
              {i + 1}
            </div>

            <div style={{ flex: 1 }}>
              {/* Accent underline */}
              <motion.div
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.4, ease: "easeOut" }}
                style={{
                  height: 2, background: `${theme.accent}60`,
                  transformOrigin: "left", marginBottom: 6,
                }}
              />
              <div style={{
                fontFamily: theme.titleFont, fontSize: 36, fontWeight: 900,
                color: theme.text, lineHeight: 1.15,
                textShadow: "0 2px 12px rgba(0,0,0,0.7)",
              }}>
                <WordReveal text={f} delay={0.3 + i * 0.4} stagger={0.05} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <SceneChrome theme={theme} logoUrl={data.logoUrl} />
    </motion.div>
  );
}

// ── Scene 2 — Product Showcase ────────────────────────────────────────────────

function ProductScene({ data, theme, imgIdx }: { data: PromoData; theme: StyleTheme; imgIdx: number }) {
  const img = data.images[imgIdx] ?? data.images[0];
  const focus = data.imageFocus?.[imgIdx] ?? data.imageFocus?.[0] ?? "center";

  return (
    <motion.div
      key="product" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: theme.td * 1.5 }}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {img ? (
        <motion.div
          initial={{ scale: 1.0 }} animate={{ scale: 1.09 }}
          transition={{ duration: 14, ease: "linear" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <StyledImage src={img} focus={focus} theme={theme} />
        </motion.div>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: theme.bg }} />
      )}

      {/* Top color bar */}
      <motion.div
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 5,
          background: `linear-gradient(to right, ${theme.accent}, ${theme.accent2})`,
          transformOrigin: "left", zIndex: 10,
        }}
      />

      {/* Gradient overlay — heavier at bottom */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 5,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0) 75%)",
      }} />

      {/* Brand name top-left */}
      <motion.div
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.25 }}
        style={{
          position: "absolute", top: 32, left: 60, zIndex: 15,
          fontFamily: theme.titleFont, fontSize: 28, fontWeight: 900,
          color: theme.accent, letterSpacing: 2, textTransform: "uppercase",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}
      >
        {data.brandName}
      </motion.div>

      {/* Description bottom */}
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.35, ease: "easeOut" }}
        style={{ position: "absolute", bottom: 60, left: 60, right: 200, zIndex: 15 }}
      >
        <div style={{
          height: 3, width: 80, borderRadius: 2, marginBottom: 14,
          background: `linear-gradient(to right, ${theme.accent}, transparent)`,
        }} />
        <div style={{
          fontFamily: theme.bodyFont, fontSize: 34, fontWeight: 600,
          color: "#ffffff", lineHeight: 1.38,
          textShadow: "0 2px 10px rgba(0,0,0,0.9)",
        }}>
          <WordReveal
            text={data.productDescription.length > 110
              ? data.productDescription.slice(0, 110) + "…"
              : data.productDescription}
            delay={0.45} stagger={0.04}
          />
        </div>
      </motion.div>

      <SceneChrome theme={theme} logoUrl={data.logoUrl} />
    </motion.div>
  );
}

// ── Scene 3 — CTA ─────────────────────────────────────────────────────────────

function CTAScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const cta = data.callToAction || "Learn More";
  // Pick last available image as dim background
  const img = data.images[data.images.length - 1];

  return (
    <motion.div
      key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: theme.td * 1.2 }}
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        background: `linear-gradient(160deg, ${theme.bg} 0%, ${theme.bg2} 60%, ${theme.bg} 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Dim background image */}
      {img && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 0.13 }}
          transition={{ duration: 1.2 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <StyledImage src={img} focus="center" theme={theme} />
        </motion.div>
      )}

      {/* Radial glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle at 50% 55%, ${theme.accent}26 0%, transparent 65%)`,
      }} />

      {/* Corner marks */}
      {[
        { top: 0, left: 0, bx: "right", by: "bottom" },
        { top: 0, right: 0, bx: "left", by: "bottom" },
        { bottom: 0, left: 0, bx: "right", by: "top" },
        { bottom: 0, right: 0, bx: "left", by: "top" },
      ].map((pos, i) => (
        <motion.div key={i}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
          style={{ position: "absolute", ...pos, zIndex: 5 }}
        >
          <div style={{
            width: 32, height: 3,
            background: theme.accent, opacity: 0.6,
            ...(pos.bx === "left" ? { borderLeft: `3px solid ${theme.accent}` } : { borderRight: `3px solid ${theme.accent}` }),
          }} />
        </motion.div>
      ))}

      {/* CTA pill */}
      <motion.div
        initial={{ scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "backOut" }}
        style={{ zIndex: 10, textAlign: "center", marginBottom: 36 }}
      >
        <motion.div
          animate={{ boxShadow: [`0 8px 40px ${theme.accent}44`, `0 12px 60px ${theme.accent}88`, `0 8px 40px ${theme.accent}44`] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
            borderRadius: 14, padding: "28px 80px", display: "inline-block",
          }}
        >
          <div style={{
            fontFamily: theme.titleFont, fontSize: 60, fontWeight: 900,
            color: theme.accentDark === "#000" ? "#000" : "#fff",
            textTransform: "uppercase", letterSpacing: 3, lineHeight: 1,
          }}>
            {cta}
          </div>
        </motion.div>
      </motion.div>

      {/* Brand */}
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        style={{ zIndex: 10, textAlign: "center" }}
      >
        <div style={{
          fontFamily: theme.titleFont, fontSize: 44, fontWeight: 900,
          color: theme.text, textTransform: "uppercase", letterSpacing: 4,
          textShadow: "0 2px 12px rgba(0,0,0,0.7)",
        }}>
          {data.brandName}
        </div>
        {data.tagline && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.75, duration: 0.4 }}
          >
            <div style={{
              fontFamily: theme.bodyFont, fontSize: 24,
              color: theme.subtext, marginTop: 10, fontStyle: "italic",
            }}>
              {data.tagline}
            </div>
          </motion.div>
        )}
      </motion.div>

      <SceneChrome theme={theme} logoUrl={data.logoUrl} />
    </motion.div>
  );
}

// ── Scene scheduler ───────────────────────────────────────────────────────────

function buildTimeline(data: PromoData): {
  scene: number; startMs: number; endMs: number;
}[] {
  const d = data.targetDuration * 1000;
  const hasFeatures = (data.features ?? []).filter(Boolean).length > 0;
  const hasExtraImg = data.images.length >= 2;
  const longEnough = data.targetDuration >= 10;

  // Decide which scenes to include
  const scenes: number[] = [0]; // always Brand
  if (hasFeatures && longEnough) scenes.push(1);
  scenes.push(2);                // always Product
  if (hasExtraImg && longEnough && !hasFeatures) scenes.push(3); // Secondary only if no features
  scenes.push(99);               // always CTA (sentinel)

  // Weights — Brand gets 25%, Features 25%, Product 35%, Secondary 20%, CTA 20%
  const weights: Record<number, number> = { 0: 0.25, 1: 0.25, 2: 0.35, 3: 0.20, 99: 0.20 };
  const included = scenes.slice(0, -1); // exclude CTA from weight sum, CTA always gets remainder
  const sumW = included.reduce((s, sc) => s + weights[sc], 0);
  const ctaW = 0.20;
  const scale = (1 - ctaW) / sumW;

  let cursor = 0;
  const timeline: { scene: number; startMs: number; endMs: number }[] = [];
  for (let i = 0; i < included.length; i++) {
    const sc = included[i];
    const dur = Math.round(d * weights[sc] * scale);
    timeline.push({ scene: sc, startMs: cursor, endMs: cursor + dur });
    cursor += dur;
  }
  // CTA gets the remainder
  timeline.push({ scene: 99, startMs: cursor, endMs: d });
  return timeline;
}

// ── Player ────────────────────────────────────────────────────────────────────

function PromoPlayer({ data, titleFont }: { data: PromoData; titleFont?: string }) {
  const baseTheme = THEMES[data.stylePreset] ?? THEMES.professional;
  // Override titleFont if a custom font was injected
  const theme: StyleTheme = titleFont
    ? { ...baseTheme, titleFont: `"${titleFont}", ${baseTheme.titleFont}` }
    : baseTheme;
  const [sceneIdx, setSceneIdx] = useState(0);

  const timeline = buildTimeline(data);

  useEffect(() => {
    const timers = timeline.slice(1).map(({ startMs }, i) =>
      setTimeout(() => setSceneIdx(i + 1), startMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [data.targetDuration, data.stylePreset, data.features?.join(",")]);

  const current = timeline[sceneIdx];
  const productImgIdx = (data.features ?? []).filter(Boolean).length > 0 ? 1 : 1;

  const renderScene = () => {
    const sceneId = current?.scene ?? 0;
    if (sceneId === 0) return <BrandScene data={data} theme={theme} />;
    if (sceneId === 1) return <HighlightsScene data={data} theme={theme} />;
    if (sceneId === 2) return <ProductScene data={data} theme={theme} imgIdx={productImgIdx} />;
    if (sceneId === 3) return <ProductScene key="product2" data={data} theme={theme} imgIdx={2} />;
    return <CTAScene data={data} theme={theme} />;
  };

  return (
    <div
      style={{
        width: 1280, height: 720,
        position: "relative", overflow: "hidden",
        background: theme.bg,
      }}
    >
      <AnimatePresence mode="wait">
        {renderScene()}
      </AnimatePresence>
      <div className="promo-ready" style={{ display: "none" }} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioPromoPreviewPage() {
  const [data, setData] = useState<PromoData | null>(null);
  /** CSS font-family string for the injected custom font, or undefined */
  const [injectedFont, setInjectedFont] = useState<string | undefined>(undefined);
  /** true once font is ready (either system font, or custom font has been injected) */
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("d");
    if (raw) {
      try { setData(JSON.parse(atob(decodeURIComponent(raw)))); }
      catch (e) { console.error("Failed to parse promo data", e); }
    }
  }, []);

  // Inject selected font as a base64 @font-face so no external network request
  // is needed during headless Playwright rendering.
  useEffect(() => {
    if (!data) return;

    const fontOpt = FONT_OPTIONS.find((f) => f.id === (data.fontId ?? "system"));
    if (!fontOpt || !fontOpt.file || !fontOpt.family) {
      // System font — no injection needed
      setFontReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/fonts/${fontOpt.file}`);
        if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        // Convert to base64
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        const dataUri = `data:font/woff2;base64,${b64}`;
        if (cancelled) return;

        // Inject @font-face into document
        const style = document.createElement("style");
        style.textContent = `@font-face{font-family:"${fontOpt.family}";src:url("${dataUri}") format("woff2");font-weight:700 900;font-style:normal;font-display:block;}`;
        document.head.appendChild(style);

        // Ask browser to load the font
        await document.fonts.load(`700 1em "${fontOpt.family}"`).catch(() => {});
        if (cancelled) return;
        setInjectedFont(fontOpt.family);
      } catch (e) {
        console.warn("Custom font injection failed, using system font:", e);
      } finally {
        if (!cancelled) setFontReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [data]);

  const scale =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth / 1280, window.innerHeight / 720)
      : 1;

  if (!data || !fontReady) {
    // Keep blank — promo-ready must NOT appear until fonts are loaded
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }} />
    );
  }

  const isHeadless = new URL(window.location.href).searchParams.get("headless") === "1";

  if (isHeadless) {
    // Playwright captures at exactly 1280×720 — no scaling
    return (
      <div style={{ width: 1280, height: 720, overflow: "hidden", background: "#000" }}>
        <PromoPlayer data={data} titleFont={injectedFont} />
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <PromoPlayer data={data} titleFont={injectedFont} />
      </div>
    </div>
  );
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "system",     label: "Default",    hint: "Style preset font",       file: null,                   family: null,             preview: "Aa" },
  { id: "montserrat", label: "Montserrat", hint: "Bold modern sans-serif",  file: "montserrat-900.woff2", family: "Montserrat",     preview: "Aa" },
  { id: "playfair",   label: "Playfair",   hint: "Elegant serif",           file: "playfair-700.woff2",   family: "Playfair Display", preview: "Aa" },
  { id: "oswald",     label: "Oswald",     hint: "Condensed & punchy",      file: "oswald-700.woff2",     family: "Oswald",         preview: "Aa" },
  { id: "nunito",     label: "Nunito",     hint: "Friendly & rounded",      file: "nunito-700.woff2",     family: "Nunito",         preview: "Aa" },
  { id: "raleway",    label: "Raleway",    hint: "Sleek & elegant",         file: "raleway-700.woff2",    family: "Raleway",        preview: "Aa" },
];
