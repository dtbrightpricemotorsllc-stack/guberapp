// GUBER Studio — Promo Video Render Target
// This page is loaded by both:
//   1. The live preview iframe in the main promo page
//   2. Playwright headless browser for frame-by-frame MP4 export
//
// Scene transitions use setTimeout — Playwright's fake clock controls these in headless mode.
// In-scene animations use Framer Motion (rAF-based) — also controlled by Playwright's fake clock.

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromoData {
  brandName: string;
  tagline?: string;
  productDescription: string;
  stylePreset: string;
  callToAction?: string;
  images: string[];
  targetDuration: number; // seconds
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
  transitionDuration: number;
  ease: string;
}

// ── Style themes ──────────────────────────────────────────────────────────────

const THEMES: Record<string, StyleTheme> = {
  energetic: {
    bg: "#0a0a0a", bg2: "#111111",
    accent: "#FFD600", accent2: "#FF8C00",
    text: "#ffffff", subtext: "#cccccc",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, sans-serif",
    transitionDuration: 0.25, ease: "backOut",
  },
  professional: {
    bg: "#0d1b2e", bg2: "#162544",
    accent: "#4A90E2", accent2: "#2563EB",
    text: "#ffffff", subtext: "#b8cce8",
    titleFont: "Georgia, serif",
    bodyFont: '"Trebuchet MS", sans-serif',
    transitionDuration: 0.5, ease: "easeInOut",
  },
  luxury: {
    bg: "#13100a", bg2: "#1c160d",
    accent: "#C9A84C", accent2: "#E8C878",
    text: "#f5f0e8", subtext: "#c8b99a",
    titleFont: "Palatino, Georgia, serif",
    bodyFont: "Georgia, serif",
    transitionDuration: 0.9, ease: "easeOut",
  },
  friendly: {
    bg: "#0a1f1a", bg2: "#0d2820",
    accent: "#2DD4BF", accent2: "#06B6D4",
    text: "#ffffff", subtext: "#a7f3d0",
    titleFont: '"Trebuchet MS", Arial, sans-serif',
    bodyFont: "Arial, sans-serif",
    transitionDuration: 0.4, ease: "easeOut",
  },
  dramatic: {
    bg: "#050005", bg2: "#0f000a",
    accent: "#E53E3E", accent2: "#C0392B",
    text: "#ffffff", subtext: "#fca5a5",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, sans-serif",
    transitionDuration: 0.35, ease: "easeIn",
  },
  bold: {
    bg: "#080f1e", bg2: "#0f1a30",
    accent: "#FF6B2B", accent2: "#EA4C0D",
    text: "#ffffff", subtext: "#fed7aa",
    titleFont: '"Arial Black", Impact, sans-serif',
    bodyFont: "Arial, sans-serif",
    transitionDuration: 0.3, ease: "backOut",
  },
};

// ── Scene 1 — Brand Reveal ────────────────────────────────────────────────────

function BrandScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const hasImage = data.images.length > 0;

  return (
    <motion.div
      key="brand"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: theme.transitionDuration }}
      style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
        display: "flex", alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* Accent bar left */}
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: theme.transitionDuration * 2, ease: theme.ease }}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 8,
          background: `linear-gradient(to bottom, ${theme.accent}, ${theme.accent2})`,
          transformOrigin: "top",
        }}
      />

      {/* Diagonal accent stripe */}
      <motion.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 0.07 }}
        transition={{ duration: theme.transitionDuration * 3, ease: "easeOut" }}
        style={{
          position: "absolute", top: -100, left: -50,
          width: 500, height: 900,
          background: theme.accent,
          transform: "rotate(15deg)",
        }}
      />

      {/* Content left half */}
      <div style={{
        flex: "0 0 auto",
        width: hasImage ? "52%" : "80%",
        padding: "0 80px",
        zIndex: 1,
      }}>
        {/* Brand name */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: theme.transitionDuration * 2, delay: 0.15, ease: theme.ease }}
        >
          <div style={{
            fontFamily: theme.titleFont,
            fontSize: hasImage ? 72 : 96,
            fontWeight: 900,
            color: theme.text,
            lineHeight: 1.05,
            letterSpacing: -1,
            textTransform: "uppercase",
            textShadow: `0 4px 20px rgba(0,0,0,0.5)`,
          }}>
            {data.brandName}
          </div>
        </motion.div>

        {/* Accent divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: theme.transitionDuration * 2, delay: 0.35, ease: "easeOut" }}
          style={{
            height: 4, width: 120,
            background: `linear-gradient(to right, ${theme.accent}, ${theme.accent2})`,
            margin: "20px 0",
            transformOrigin: "left",
            borderRadius: 2,
          }}
        />

        {/* Tagline */}
        {data.tagline && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: theme.transitionDuration * 2, delay: 0.5 }}
          >
            <div style={{
              fontFamily: theme.bodyFont,
              fontSize: 28,
              color: theme.subtext,
              lineHeight: 1.4,
              fontStyle: "italic",
            }}>
              {data.tagline}
            </div>
          </motion.div>
        )}
      </div>

      {/* Image right half */}
      {hasImage && (
        <motion.div
          initial={{ x: 120, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: theme.transitionDuration * 3, delay: 0.2, ease: "easeOut" }}
          style={{
            flex: 1,
            height: "100%",
            position: "relative",
          }}
        >
          {/* Gradient fade on left edge */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 200, zIndex: 1,
            background: `linear-gradient(to right, ${theme.bg}, transparent)`,
          }} />
          <img
            src={data.images[0]}
            alt=""
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
            }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Scene 2 — Product Showcase ────────────────────────────────────────────────

function ProductScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const image = data.images.length > 1 ? data.images[1] : data.images[0];

  return (
    <motion.div
      key="product"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: theme.transitionDuration }}
      style={{ position: "absolute", inset: 0, background: theme.bg, overflow: "hidden" }}
    >
      {/* Full-bleed image with Ken Burns */}
      {image && (
        <motion.div
          initial={{ scale: 1.0 }}
          animate={{ scale: 1.08 }}
          transition={{ duration: 12, ease: "linear" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <img
            src={image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        </motion.div>
      )}

      {/* Dark overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.0) 100%)",
      }} />

      {/* Accent bar top */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 6,
          background: `linear-gradient(to right, ${theme.accent}, ${theme.accent2})`,
          transformOrigin: "left",
        }}
      />

      {/* Brand name top left */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        style={{
          position: "absolute", top: 36, left: 60,
          fontFamily: theme.titleFont, fontSize: 32, fontWeight: 900,
          color: theme.accent, letterSpacing: 1, textTransform: "uppercase",
        }}
      >
        {data.brandName}
      </motion.div>

      {/* Product description bottom */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
        style={{ position: "absolute", bottom: 60, left: 60, right: 60 }}
      >
        <div style={{
          fontFamily: theme.bodyFont, fontSize: 36,
          color: theme.text, lineHeight: 1.4, fontWeight: 600,
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}>
          {data.productDescription.length > 120
            ? data.productDescription.slice(0, 120) + "…"
            : data.productDescription}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Scene 3 — CTA Close ───────────────────────────────────────────────────────

function CTAScene({ data, theme }: { data: PromoData; theme: StyleTheme }) {
  const cta = data.callToAction || "Learn More";
  const image = data.images.length > 2 ? data.images[2] : (data.images.length > 1 ? data.images[1] : data.images[0]);

  return (
    <motion.div
      key="cta"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: theme.transitionDuration }}
      style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(160deg, ${theme.bg} 0%, ${theme.bg2} 60%, ${theme.bg} 100%)`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background image if available, dimmed */}
      {image && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.12 }}
          transition={{ duration: 1 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </motion.div>
      )}

      {/* Radial glow */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: `radial-gradient(circle at 50% 50%, ${theme.accent}22 0%, transparent 70%)`,
      }} />

      {/* Corner accents */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{
          position: "absolute", top: 0, left: 0,
          width: 120, height: 8,
          background: `linear-gradient(to right, ${theme.accent}, transparent)`,
        }}
      />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        style={{
          position: "absolute", top: 0, left: 0,
          width: 8, height: 120,
          background: `linear-gradient(to bottom, ${theme.accent}, transparent)`,
        }}
      />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: 120, height: 8,
          background: `linear-gradient(to left, ${theme.accent}, transparent)`,
        }}
      />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: 8, height: 120,
          background: `linear-gradient(to top, ${theme.accent}, transparent)`,
        }}
      />

      {/* CTA button */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "backOut" }}
        style={{ zIndex: 1, textAlign: "center" }}
      >
        <div style={{
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
          borderRadius: 12,
          padding: "28px 72px",
          display: "inline-block",
          marginBottom: 40,
          boxShadow: `0 8px 40px ${theme.accent}55`,
        }}>
          <div style={{
            fontFamily: theme.titleFont,
            fontSize: 56,
            fontWeight: 900,
            color: "#000000",
            textTransform: "uppercase",
            letterSpacing: 2,
            lineHeight: 1,
          }}>
            {cta}
          </div>
        </div>
      </motion.div>

      {/* Brand name */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        style={{ zIndex: 1, textAlign: "center" }}
      >
        <div style={{
          fontFamily: theme.titleFont,
          fontSize: 42, fontWeight: 900,
          color: theme.text, textTransform: "uppercase",
          letterSpacing: 3,
        }}>
          {data.brandName}
        </div>
        {data.tagline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
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
    </motion.div>
  );
}

// ── Main player ───────────────────────────────────────────────────────────────

function PromoPlayer({ data, isHeadless }: { data: PromoData; isHeadless: boolean }) {
  const theme = THEMES[data.stylePreset] ?? THEMES.professional;
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    // These setTimeout calls are controlled by Playwright's fake clock in headless mode
    const d = data.targetDuration * 1000;
    const t1 = setTimeout(() => setSceneIndex(1), d * 0.30);
    const t2 = setTimeout(() => setSceneIndex(2), d * 0.80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [data.targetDuration]);

  const scenes = [
    <BrandScene key="brand" data={data} theme={theme} />,
    <ProductScene key="product" data={data} theme={theme} />,
    <CTAScene key="cta" data={data} theme={theme} />,
  ];

  return (
    <div
      className={isHeadless ? "" : "promo-player"}
      style={{
        width: 1280, height: 720,
        position: "relative", overflow: "hidden",
        background: theme.bg,
        // Centre in viewport for preview
        transformOrigin: "top left",
      }}
    >
      <AnimatePresence mode="wait">
        {scenes[sceneIndex]}
      </AnimatePresence>

      {/* "Ready" marker for Playwright waitForSelector */}
      <div className="promo-ready" style={{ display: "none" }} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioPromoPreviewPage() {
  const [data, setData] = useState<PromoData | null>(null);
  const [isHeadless, setIsHeadless] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("d");
    const headless = url.searchParams.get("headless") === "1";
    setIsHeadless(headless);
    if (raw) {
      try { setData(JSON.parse(atob(decodeURIComponent(raw)))); }
      catch { console.error("Failed to parse promo data"); }
    }
  }, []);

  if (!data) {
    return (
      <div style={{
        width: "100vw", height: "100vh", background: "#000",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div className="promo-ready" style={{ display: "none" }} />
      </div>
    );
  }

  // Scale to fit viewport for browser preview
  const scaleStyle = isHeadless ? {} : {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    overflow: "hidden",
  };

  const innerStyle = isHeadless ? {} : {
    transform: `scale(${Math.min(window.innerWidth / 1280, window.innerHeight / 720)})`,
    transformOrigin: "center center" as const,
  };

  return (
    <div style={scaleStyle}>
      <div style={innerStyle}>
        <PromoPlayer data={data} isHeadless={isHeadless} />
      </div>
    </div>
  );
}
