import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail, Phone, Globe, ChevronRight, Check, Printer, ArrowDown } from "lucide-react";
import { INVESTOR_CONFIG as C } from "@/lib/investor-config";
import { SocialLinks } from "@/components/social-links";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import winnerJamie from "@assets/Screenshot_20260426_204611_Facebook_1778199034008.jpg";
import winnerKyle from "@assets/Screenshot_20260426_064824_Facebook_1778199034038.jpg";
import winnerKlin from "@assets/Screenshot_20260420_042305_Facebook_1778199034079.jpg";
import winnerJames from "@assets/Screenshot_20260331_102503_Facebook_1778199034115.jpg";
import winnerExtra from "@assets/Screenshot_20260414_205025_Facebook_1778199034088.jpg";
import engagementShot from "@assets/Screenshot_20260427_203110_Business_Suite_1778199033998.jpg";
import creativeLaunch from "@assets/Screenshot_20260426_064428_Facebook_1778199034069.jpg";
import creativeViWheels from "@assets/Screenshot_20260507_013238_ChatGPT_1778199033938.jpg";
import creativeViHandsfree from "@assets/Screenshot_20260506_221503_ChatGPT_1778199033949.jpg";
import wildDragway from "@assets/Screenshot_20260503_172006_Facebook_1778199033959.jpg";
import wildDriver from "@assets/Screenshot_20260504_141354_Messages_1778199033968.jpg";
import appMap from "@assets/Screenshot_20260404_200228_Gallery_1778199034097.jpg";
import appDashboard from "@assets/Screenshot_20260429_192406_Gallery_1778199033986.jpg";
import appVi from "@assets/Screenshot_20260404_182235_Chrome_1778199034106.jpg";
import appPostJob from "@assets/Screenshot_20260426_161934_GUBER_1778199034124.jpg";
import appStudio from "@assets/app-screen-studio_investor.jpg";
import appAiNot from "@assets/ai_or_not_1242x2688_1778347842236.png";

const PROOF_ASSETS: Record<string, string> = {
  "winner-jamie": winnerJamie,
  "winner-kyle": winnerKyle,
  "winner-klin": winnerKlin,
  "winner-james": winnerJames,
  "winner-extra": winnerExtra,
  "engagement": engagementShot,
  "creative-launch": creativeLaunch,
  "creative-vi-wheels": creativeViWheels,
  "creative-vi-handsfree": creativeViHandsfree,
  "wild-dragway": wildDragway,
  "wild-driver": wildDriver,
  "app-map": appMap,
  "app-dashboard": appDashboard,
  "app-vi": appVi,
  "app-postjob": appPostJob,
  "app-studio": appStudio,
  "app-ainot": appAiNot,
};

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out will-change-[opacity,transform] ${className}`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const NEON_GREEN = "#39FF14";
const NEON_PURPLE = "#D100FF";
const NEON_CYAN = "hsl(190 95% 55%)";

export default function Investors() {
  // SEO: set title + noindex + OG tags. Symmetric restore on unmount.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = C.meta.title;
    type Snap = { el: HTMLMetaElement; created: boolean; prev: string | null };
    const snaps: Snap[] = [];
    const upsert = (attr: "name" | "property", key: string, value: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      let created = false;
      let prev: string | null = null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created = true;
      } else {
        prev = el.getAttribute("content");
      }
      el.setAttribute("content", value);
      snaps.push({ el, created, prev });
    };
    upsert("name", "robots", "noindex,nofollow,noarchive");
    upsert("name", "description", C.meta.description);
    upsert("property", "og:title", C.meta.title);
    upsert("property", "og:description", C.meta.description);
    upsert("property", "og:type", "website");
    return () => {
      document.title = prevTitle;
      for (const s of snaps) {
        if (s.created) {
          s.el.remove();
        } else if (s.prev === null) {
          s.el.removeAttribute("content");
        } else {
          s.el.setAttribute("content", s.prev);
        }
      }
    };
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground investor-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        .investor-root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background:
            radial-gradient(1100px 540px at 12% -8%, rgba(209, 0, 255, 0.10), transparent 60%),
            radial-gradient(900px 460px at 92% 8%, rgba(57, 255, 20, 0.06), transparent 60%),
            radial-gradient(800px 460px at 50% 110%, rgba(57, 255, 20, 0.04), transparent 60%),
            #060606;
          color: #f5f5f7;
          letter-spacing: -0.005em;
          -webkit-font-smoothing: antialiased;
        }
        .investor-root * { font-family: inherit; }
        .investor-root .text-muted-foreground { color: #a8a8b3; }

        .ink-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }
        .neon-rule {
          height: 1px;
          background: linear-gradient(90deg, transparent, ${NEON_GREEN} 30%, ${NEON_PURPLE} 70%, transparent);
          opacity: .35;
        }

        /* Inter for everything; Oxanium replaced for cleaner premium look */
        .num-font { font-family: 'Inter', sans-serif; letter-spacing: 0.02em; font-feature-settings: 'tnum' 1, 'cv11' 1; }

        /* Refined pills — subtler chrome */
        .pill {
          display: inline-flex; align-items: center; gap: .4em;
          padding: .35em .9em; border-radius: 999px;
          font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
          backdrop-filter: blur(10px);
        }
        .pill-green { background: rgba(57, 255, 20, 0.08); color: ${NEON_GREEN}; border: 1px solid rgba(57, 255, 20, 0.22); }
        .pill-purple { background: rgba(209, 0, 255, 0.08); color: ${NEON_PURPLE}; border: 1px solid rgba(209, 0, 255, 0.22); }
        .pill-cyan { background: rgba(56, 220, 255, 0.07); color: ${NEON_CYAN}; border: 1px solid rgba(56, 220, 255, 0.22); }
        .pill-amber { background: rgba(255, 200, 60, 0.08); color: #ffcc44; border: 1px solid rgba(255, 200, 60, 0.22); }

        /* Glass cards — match home page restraint */
        .inv-card {
          background: rgba(20, 20, 22, 0.6);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
        }
        .inv-card-hover { transition: transform .35s ease, border-color .35s ease, box-shadow .35s ease; }
        .inv-card-hover:hover {
          transform: translateY(-3px);
          border-color: rgba(57, 255, 20, 0.25);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 24px rgba(57, 255, 20, 0.06);
        }

        /* Softer text glow — accent jewelry, not noise */
        .glow-text-green { text-shadow: 0 0 24px rgba(57, 255, 20, 0.22); }
        .glow-text-purple { text-shadow: 0 0 24px rgba(209, 0, 255, 0.22); }

        /* Headline tightening to match home */
        .investor-root h1, .investor-root h2, .investor-root h3, .investor-root h4 {
          letter-spacing: -0.025em;
        }

        /* Single gradient CTA — purple → green, like home */
        .inv-cta-primary {
          background: linear-gradient(135deg, ${NEON_PURPLE}, ${NEON_GREEN}) !important;
          color: #060606 !important;
          font-weight: 800 !important;
          letter-spacing: 0.16em !important;
          box-shadow: 0 12px 32px rgba(209, 0, 255, 0.25), 0 8px 22px rgba(57, 255, 20, 0.18) !important;
          border: none !important;
        }
        .inv-cta-primary:hover { filter: brightness(1.08); }

        /* Section rhythm — generous like home (96px desktop / 64px mobile) */
        .inv-section { padding-top: 64px; padding-bottom: 64px; border-top: 1px solid rgba(255,255,255,0.04); }
        @media (min-width: 720px) {
          .inv-section { padding-top: 96px; padding-bottom: 96px; }
        }

        /* Eyebrow refinement */
        .inv-eyebrow {
          font-size: 11px;
          letter-spacing: 0.20em;
          text-transform: uppercase;
          color: #8a8a96;
          font-weight: 600;
        }

        @media print {
          @page { size: letter; margin: 0.4in; }
          .no-print { display: none !important; }
          .investor-root { background: white !important; color: black !important; }
          .investor-root, .investor-root * { color: black !important; text-shadow: none !important; }
          .inv-card { background: white !important; border: 1px solid #ccc !important; box-shadow: none !important; backdrop-filter: none !important; }
          .pill, .pill-green, .pill-purple, .pill-cyan, .pill-amber { background: #f3f3f3 !important; color: black !important; border-color: #ccc !important; }
          .inv-cta-primary { background: #000 !important; color: white !important; }
          section { page-break-inside: avoid; break-inside: avoid; }
          .ink-grid, .neon-rule { display: none !important; }
        }
      `}</style>

      {/* Sticky header */}
      <header className="no-print sticky top-0 z-40 border-b border-white/10" style={{ background: "hsl(225 25% 3% / 0.85)", backdropFilter: "blur(18px)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="GUBER" className="h-8 object-contain" style={{ mixBlendMode: "screen" }} data-testid="img-investor-logo" />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground num-font">Private Investor Brief</span>
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: NEON_GREEN }}>Confidential</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs uppercase tracking-[0.15em] num-font border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/30 transition"
              data-testid="button-print-pdf"
            >
              <Printer className="w-3.5 h-3.5" />
              Save as PDF
            </button>
            <a
              href={`mailto:${C.meta.contactEmail}`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-xs uppercase tracking-[0.18em] num-font font-bold inv-cta-primary"
              data-testid="button-header-contact"
            >
              <Mail className="w-3.5 h-3.5" /> Contact
            </a>
          </div>
        </div>
        <div className="neon-rule" />
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden" id="section-hero">
        <div className="absolute inset-0 ink-grid pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-5 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <Reveal>
            <span className="pill pill-green num-font" data-testid="text-hero-eyebrow">{C.hero.eyebrow}</span>
          </Reveal>
          <Reveal delay={80}>
            <h1
              className="mt-7 leading-[1] glow-text-green"
              style={{
                fontSize: "clamp(3.4rem, 11vw, 8.4rem)",
                fontWeight: 700,
                letterSpacing: "-0.015em",
                color: "white",
                background: `linear-gradient(180deg, #ffffff 0%, #ffffff 55%, ${NEON_GREEN} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
              data-testid="text-hero-headline"
            >
              {C.hero.headline}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p
              className="mt-5 font-bold max-w-3xl"
              style={{
                fontSize: "clamp(1.4rem, 3.2vw, 2rem)",
                letterSpacing: "-0.02em",
                color: NEON_GREEN,
              }}
              data-testid="text-hero-tagline"
            >
              {C.hero.tagline}
            </p>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-5 text-base sm:text-lg max-w-2xl leading-relaxed" style={{ color: "#a8a8b3" }} data-testid="text-hero-sub">
              {C.hero.sub}
            </p>
          </Reveal>
          <Reveal delay={280}>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => scrollToId(C.hero.primaryCta.target)}
                className="h-12 px-8 rounded-full num-font text-sm uppercase font-bold inline-flex items-center justify-center gap-2 inv-cta-primary"
                data-testid="button-hero-primary"
              >
                {C.hero.primaryCta.label} <ArrowDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToId(C.hero.secondaryCta.target)}
                className="h-12 px-8 rounded-full num-font text-sm uppercase tracking-[0.18em] font-bold inline-flex items-center justify-center gap-2 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/30 transition"
                data-testid="button-hero-secondary"
              >
                {C.hero.secondaryCta.label} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <p className="mt-12 text-[10px] uppercase tracking-[0.22em] num-font" style={{ color: "#6a6a76" }}>{C.meta.confidentialNote}</p>
          </Reveal>
        </div>
      </section>

      {/* 01 · FOUR CRACKS */}
      <Section id="section-cracks" eyebrow={`01 · ${C.cracks.eyebrow}`} headline={C.cracks.headline}>
        <div className="space-y-4 sm:space-y-5">
          {C.cracks.items.map((it, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="inv-card p-5 sm:p-7 flex items-baseline gap-5 sm:gap-7" data-testid={`crack-${i}`}>
                <span className="num-font font-bold text-xs sm:text-sm tracking-[0.25em] text-muted-foreground flex-shrink-0">{it.num}</span>
                <div className="text-lg sm:text-2xl font-bold leading-tight text-white">
                  {it.text} <span style={{ color: NEON_PURPLE }} className="glow-text-purple">{it.accent}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 02 · WHAT GUBER IS */}
      <Section id="section-what" eyebrow={`02 · ${C.whatIsGuber.eyebrow}`} headline={C.whatIsGuber.headline} sub={C.whatIsGuber.sub}>
        <div className="grid md:grid-cols-3 gap-5">
          {C.whatIsGuber.pillars.map((p, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="inv-card p-7 inv-card-hover h-full" data-testid={`card-what-${i}`}>
                <h4 className="text-xl font-bold mb-3 text-white">{p.title}</h4>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 03 · WORKER SIDE */}
      <Section id="section-worker" eyebrow={`03 · ${C.workerSide.eyebrow}`} headline={C.workerSide.headline} sub={C.workerSide.sub}>
        <Reveal>
          <div className="inv-card p-7 sm:p-9" style={{ borderColor: `${NEON_GREEN}55`, boxShadow: `0 0 32px rgba(57,255,20,.06)` }}>
            <ul className="space-y-3.5 mb-5">
              {C.workerSide.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-worker-${i}`}>
                  <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-white/10 pt-5">
              <p className="text-base sm:text-lg font-bold" style={{ color: NEON_GREEN }} data-testid="text-worker-closer">{C.workerSide.closer}</p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 04 · HIRER SIDE */}
      <Section id="section-hirer" eyebrow={`04 · ${C.hirerSide.eyebrow}`} headline={C.hirerSide.headline} sub={C.hirerSide.sub}>
        <Reveal>
          <div className="inv-card p-7 sm:p-9" style={{ borderColor: `${NEON_PURPLE}55`, boxShadow: `0 0 32px rgba(209,0,255,.06)` }}>
            <ul className="space-y-3.5 mb-5">
              {C.hirerSide.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-hirer-${i}`}>
                  <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_PURPLE }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-white/10 pt-5">
              <p className="text-base sm:text-lg font-bold" style={{ color: NEON_PURPLE }} data-testid="text-hirer-closer">{C.hirerSide.closer}</p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 05 · V&I ORIGIN — GT500 */}
      <Section id="section-vi-origin" eyebrow={`05 · ${C.viOrigin.eyebrow}`} headline={C.viOrigin.headline}>
        <div className="grid lg:grid-cols-5 gap-6">
          <Reveal className="lg:col-span-3">
            <div className="space-y-4 text-sm sm:text-base leading-relaxed" style={{ color: "#cfd2d6" }}>
              {C.viOrigin.paragraphs.map((p, i) => (
                <p key={i} data-testid={`text-vi-origin-${i}`}>{p}</p>
              ))}
            </div>
            <div className="mt-7 p-5 sm:p-6 rounded-2xl border-l-4" style={{ borderColor: NEON_PURPLE, background: "rgba(209,0,255,0.06)" }}>
              <p className="text-base sm:text-xl font-bold leading-snug text-white" data-testid="text-vi-origin-pullquote">"{C.viOrigin.pullQuote}"</p>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-2" delay={120}>
            <div className="inv-card overflow-hidden h-full flex items-center justify-center p-6 sm:p-8" style={{ borderColor: `${NEON_PURPLE}55`, background: "radial-gradient(ellipse at center, rgba(209,0,255,.08), transparent 70%)" }}>
              <img src="/investor/verify-inspect-shield.png" alt="Verify & Inspect" loading="lazy" className="w-full max-w-[260px] h-auto object-contain" style={{ filter: "drop-shadow(0 0 40px rgba(209,0,255,.35))" }} />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 06 · OTHER SIDE OF WHY — 17 YEARS */}
      <Section id="section-other-why" eyebrow={`06 · ${C.otherSideOfWhy.eyebrow}`} headline={C.otherSideOfWhy.headline}>
        <div className="grid lg:grid-cols-2 gap-8">
          <Reveal>
            <div className="space-y-4 text-sm sm:text-base leading-relaxed" style={{ color: "#cfd2d6" }}>
              {C.otherSideOfWhy.paragraphs.map((p, i) => (
                <p key={i} data-testid={`text-other-why-${i}`}>{p}</p>
              ))}
              <div className="mt-3 p-5 rounded-2xl border-l-4" style={{ borderColor: NEON_PURPLE, background: "linear-gradient(90deg, rgba(209,0,255,.10), transparent 80%)" }}>
                <p className="text-base sm:text-xl font-bold leading-snug text-white" data-testid="text-other-why-realization">{C.otherSideOfWhy.realizationLine}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex flex-col gap-4">
              <div className="num-font text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: NEON_GREEN }}>GUBER makes it visible</div>
              <div className="grid grid-cols-2 gap-2.5">
                {C.otherSideOfWhy.visibilityPillars.map((p, i) => (
                  <div key={i} className="inv-card p-3 text-center text-sm font-bold text-white" data-testid={`text-visibility-pillar-${i}`}>{p}</div>
                ))}
              </div>
              <div className="mt-2 p-5 rounded-2xl" style={{ border: `1px solid ${NEON_GREEN}55`, background: "rgba(57,255,20,.04)" }}>
                <div className="text-base sm:text-lg font-bold text-white" data-testid="text-other-why-closing">{C.otherSideOfWhy.closingHeadline}</div>
                <div className="text-base sm:text-lg font-bold mt-1" style={{ color: NEON_GREEN }}>{C.otherSideOfWhy.closingAccent}</div>
                <div className="text-xs sm:text-sm italic mt-3" style={{ color: "#a8a8b3" }}>{C.otherSideOfWhy.closingFooter}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 07 · V&I — HOW IT WORKS */}
      <Section id="section-vi" eyebrow="07 · Verify & Inspect — How it works" headline={C.viHighlight.headline} sub={C.viHighlight.sub}>
        <div className="inv-card p-7 sm:p-9" style={{ borderColor: `${NEON_PURPLE}55`, boxShadow: `0 0 40px hsl(275 90% 65% / .08)` }}>
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <ul className="space-y-4">
                {C.viHighlight.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-vi-bullet-${i}`}>
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_PURPLE }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4 lg:border-l lg:border-white/10 lg:pl-8">
              <div className="num-font text-[11px] uppercase tracking-[0.18em]" style={{ color: NEON_PURPLE }}>Pricing</div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-vi-pricing">{C.viHighlight.pricing}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="pill pill-purple num-font">Vehicles</span>
                <span className="pill pill-purple num-font">Properties</span>
                <span className="pill pill-purple num-font">Marketplace</span>
                <span className="pill pill-purple num-font">Salvage</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 08 · FROM FICTION TO REALITY */}
      <Section id="section-fiction" eyebrow={`08 · ${C.fictionToReality.eyebrow}`} headline={C.fictionToReality.headline}>
        <div className="grid lg:grid-cols-2 gap-8">
          <Reveal>
            <div className="inv-card p-6 sm:p-7">
              <div className="space-y-3.5">
                {C.fictionToReality.rows.map((r, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-5 pb-3 border-b border-white/5 last:border-b-0 last:pb-0" data-testid={`fiction-row-${i}`}>
                    <div className="num-font font-bold text-base sm:min-w-[160px] text-white">{r.title}</div>
                    <div className="text-sm sm:text-base text-muted-foreground leading-snug"><span className="font-bold" style={{ color: NEON_CYAN }}>{r.system}</span> — {r.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex flex-wrap gap-3 sm:gap-4 mb-4">
              {C.fictionToReality.notHeadline.map((n, i) => (
                <div key={i} className="text-xl sm:text-2xl font-extrabold line-through text-muted-foreground/70" data-testid={`text-not-${i}`}>{n}</div>
              ))}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white mb-5 leading-snug">
              GUBER grounds the same core idea — through <span style={{ color: NEON_GREEN }} className="glow-text-green">permission-based participation.</span>
            </div>
            <div className="p-5 sm:p-6 rounded-2xl" style={{ border: `2px solid ${NEON_GREEN}`, background: "rgba(57,255,20,.06)" }}>
              <div className="text-xl sm:text-2xl font-extrabold leading-tight" style={{ color: NEON_GREEN }} data-testid="text-optin-title">{C.fictionToReality.optInBlock.title}</div>
              <div className="text-sm sm:text-base font-bold text-white mt-2.5">{C.fictionToReality.optInBlock.sub}</div>
              <div className="text-sm text-muted-foreground mt-3 leading-relaxed">{C.fictionToReality.optInBlock.body}</div>
            </div>
            <p className="mt-5 text-sm sm:text-base text-muted-foreground leading-relaxed" data-testid="text-fiction-consequence">{C.fictionToReality.consequence}</p>
          </Reveal>
        </div>
      </Section>

      {/* 09 · TRUST AS A SERVICE */}
      <Section id="section-trust" eyebrow={`09 · ${C.trustAsService.eyebrow}`} headline={C.trustAsService.headline} sub={C.trustAsService.sub}>
        <Reveal>
          <div className="text-center mb-10 sm:mb-12">
            <div className="font-extrabold text-muted-foreground/60 italic" style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05 }}>Software can guess.</div>
            <div className="font-extrabold mt-3 glow-text-green" style={{ color: NEON_GREEN, fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05 }} data-testid="text-trust-accent">{C.trustAsService.accent}</div>
          </div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {C.trustAsService.primitives.map((p, i) => (
            <Reveal key={i} delay={(i % 4) * 60}>
              <div className="inv-card p-6 inv-card-hover h-full" data-testid={`card-primitive-${i}`}>
                <h4 className="num-font text-sm uppercase tracking-[0.12em] mb-3" style={{ color: NEON_GREEN }}>{p.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 10 · LIVE MAP */}
      <Section id="section-live-map" eyebrow={`10 · ${C.liveMap.eyebrow}`} headline={C.liveMap.headline} sub={C.liveMap.sub}>
        <Reveal>
          <div className="inv-card overflow-hidden flex items-center justify-center p-6 sm:p-12" style={{ borderColor: `${NEON_GREEN}55`, background: "radial-gradient(ellipse at center, rgba(57,255,20,.06), transparent 70%)" }}>
            <img src="/investor/map-phone.jpg" alt="GUBER live opportunity map" loading="lazy" className="max-w-full sm:max-w-md h-auto rounded-2xl" style={{ filter: "drop-shadow(0 0 60px rgba(57,255,20,.22))" }} data-testid="img-live-map" />
          </div>
        </Reveal>
      </Section>

      {/* 11 · CASH DROPS — cashDropMargin moved here */}
      {C.cashDropMargin && (
        <Section id="section-cashdrop-margin" eyebrow={`11 · ${C.cashDropMargin.eyebrow}`} headline={C.cashDropMargin.headline} sub={C.cashDropMargin.sub}>
          <div className="grid lg:grid-cols-5 gap-5">
            <Reveal className="lg:col-span-3">
              <div className="inv-card p-7 h-full">
                <ul className="space-y-3.5 mb-5">
                  {C.cashDropMargin.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-cashdrop-bullet-${i}`}>
                      <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 pt-5">
                  <div className="num-font text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: NEON_PURPLE }}>Stripe migration plan</div>
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#d8d8de" }} data-testid="text-cashdrop-stripe-plan">{C.cashDropMargin.onPlatformPlan}</p>
                </div>
              </div>
            </Reveal>
            <Reveal className="lg:col-span-2" delay={120}>
              <div className="inv-card p-7 h-full flex flex-col items-center justify-center text-center" style={{ borderColor: `${NEON_GREEN}55`, boxShadow: `0 0 32px hsl(152 100% 44% / .08)` }}>
                <div className="num-font font-extrabold glow-text-green" style={{ color: NEON_GREEN, fontSize: "clamp(56px, 7vw, 96px)", lineHeight: 1 }}>~60%</div>
                <div className="num-font text-xs uppercase tracking-[0.18em] mt-2 text-muted-foreground">gross platform margin</div>
                <div className="text-sm mt-1 text-white">on every sponsor dollar</div>
                <div className="mt-6 num-font font-extrabold glow-text-green" style={{ color: NEON_GREEN, fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 1 }}>27</div>
                <div className="num-font text-xs uppercase tracking-[0.18em] mt-2 text-muted-foreground">drops live in market</div>
              </div>
            </Reveal>
          </div>
        </Section>
      )}

      {/* 12 · BADGER */}
      <Section id="section-badger" eyebrow={`12 · ${C.badger.eyebrow}`} headline={C.badger.headline} sub={C.badger.sub}>
        <div className="grid lg:grid-cols-5 gap-6 items-center">
          <Reveal className="lg:col-span-2">
            <div className="flex items-center justify-center p-6 sm:p-8 inv-card" style={{ borderColor: `${NEON_PURPLE}55`, background: "radial-gradient(ellipse at center, rgba(209,0,255,.12), transparent 70%)" }}>
              <img src="/investor/mascot.png" alt="GUBER Badger" loading="lazy" className="w-full max-w-[280px] h-auto object-contain" style={{ filter: "drop-shadow(0 0 50px rgba(57,255,20,.28))" }} data-testid="img-badger" />
            </div>
          </Reveal>
          <Reveal className="lg:col-span-3" delay={120}>
            <ul className="space-y-3.5">
              {C.badger.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-badger-${i}`}>
                  <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_PURPLE }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      {/* 13 · AI OR NOT */}
      <Section id="section-ai-or-not" eyebrow={`13 · ${C.aiOrNot.eyebrow}`} headline={C.aiOrNot.headline} sub={C.aiOrNot.sub}>
        <div className="grid lg:grid-cols-5 gap-6 items-center">
          <Reveal className="lg:col-span-3">
            <div className="inv-card p-7" style={{ borderColor: `${NEON_CYAN}55` }}>
              <ul className="space-y-3.5">
                {C.aiOrNot.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-ainot-${i}`}>
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_CYAN }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-2" delay={120}>
            <div className="inv-card overflow-hidden flex items-center justify-center bg-black/40 p-4">
              <img src="/investor/ai-or-not-ui.jpg" alt="AI or Not" loading="lazy" className="w-full max-w-[260px] h-auto rounded-xl" data-testid="img-ainot" />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 14 · CORE PLATFORM */}
      <Section id="section-product" eyebrow="14 · Core platform" headline={C.product.headline} sub={C.product.sub}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {C.product.cards.map((c, i) => (
            <Reveal key={i} delay={(i % 4) * 60}>
              <div className="inv-card p-5 inv-card-hover h-full" data-testid={`card-product-${i}`}>
                <h4 className="num-font text-sm uppercase tracking-[0.1em] mb-2" style={{ color: NEON_GREEN }}>{c.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 15 · GUBER STUDIO */}
      <Section id="section-studio" eyebrow={C.studio.eyebrow} headline={C.studio.headline} sub={C.studio.sub}>
        <div className="grid lg:grid-cols-5 gap-6">
          <Reveal className="lg:col-span-3">
            <div className="inv-card p-7 sm:p-8 h-full" style={{ borderColor: `${NEON_PURPLE}55`, boxShadow: `0 0 36px rgba(209, 0, 255, 0.08)` }}>
              <div className="flex items-center gap-2 mb-5">
                <span className="pill pill-purple num-font">Live BETA</span>
                <span className="pill pill-green num-font">Monetized</span>
              </div>
              <ul className="space-y-3.5 mb-6">
                {C.studio.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-studio-bullet-${i}`}>
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: NEON_PURPLE }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/10 pt-5">
                <div className="num-font text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: NEON_PURPLE }}>The purpose</div>
                <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#d8d8de" }} data-testid="text-studio-purpose">{C.studio.purpose}</p>
              </div>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-2" delay={120}>
            <div className="inv-card overflow-hidden h-full flex flex-col" data-testid="card-studio-screenshot">
              <div className="relative aspect-[9/16] bg-black/40 overflow-hidden">
                <img src={appStudio} alt={C.studio.screenshot.title} loading="lazy" className="w-full h-full object-contain" data-testid="img-studio-screenshot" />
                <div className="absolute top-2 left-2">
                  <span className="pill pill-purple num-font">Live in production</span>
                </div>
              </div>
              <div className="p-4">
                <div className="num-font text-[11px] uppercase tracking-[0.12em] mb-1" style={{ color: NEON_PURPLE }}>{C.studio.screenshot.title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{C.studio.screenshot.caption}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 06 · REVENUE STREAMS */}
      <Section id="section-business" eyebrow="16 · Revenue streams" headline={C.business.headline} sub={C.business.sub}>
        <Reveal>
          <div className="inv-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-5 py-4 num-font text-xs uppercase tracking-[0.12em]" style={{ color: NEON_GREEN }}>Stream</th>
                    <th className="text-left px-5 py-4 num-font text-xs uppercase tracking-[0.12em]" style={{ color: NEON_GREEN }}>Who pays</th>
                    <th className="text-left px-5 py-4 num-font text-xs uppercase tracking-[0.12em]" style={{ color: NEON_GREEN }}>Price</th>
                    <th className="text-left px-5 py-4 num-font text-xs uppercase tracking-[0.12em]" style={{ color: NEON_GREEN }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {C.business.rows.map((r, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition" data-testid={`row-revenue-${i}`}>
                      <td className="px-5 py-3 text-white">{r.stream}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.who}</td>
                      <td className="px-5 py-3 num-font font-semibold" style={{ color: NEON_GREEN }}>{r.price}</td>
                      <td className="px-5 py-3">
                        <span className={`pill ${r.status === "Live" ? "pill-green" : r.status === "Emerging" ? "pill-purple" : "pill-amber"}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile stacked */}
            <div className="md:hidden divide-y divide-white/10">
              {C.business.rows.map((r, i) => (
                <div key={i} className="p-4" data-testid={`row-revenue-mobile-${i}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{r.stream}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.who}</div>
                    </div>
                    <span className={`pill flex-shrink-0 ${r.status === "Live" ? "pill-green" : r.status === "Emerging" ? "pill-purple" : "pill-amber"}`}>{r.status}</span>
                  </div>
                  <div className="num-font font-bold text-base" style={{ color: NEON_GREEN }}>{r.price}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 07 · WHY NOW */}
      <Section id="section-why-now" eyebrow="17 · Why now" headline={C.whyNow.headline} sub={C.whyNow.sub}>
        <div className="grid sm:grid-cols-2 gap-5">
          {C.whyNow.cards.map((c, i) => (
            <Reveal key={i} delay={(i % 2) * 80}>
              <div className="inv-card p-6 inv-card-hover h-full" data-testid={`card-whynow-${i}`}>
                <h4 className="num-font text-sm uppercase tracking-[0.12em] mb-3" style={{ color: i % 2 === 0 ? NEON_GREEN : NEON_PURPLE }}>{c.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 08 · TRACTION */}
      <Section id="section-traction" eyebrow="18 · Traction" headline={C.traction.headline} sub={C.traction.note}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {C.traction.stats.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="inv-card p-5 inv-card-hover h-full" data-testid={`stat-${i}`}>
                <div className="num-font font-extrabold text-3xl sm:text-4xl glow-text-green" style={{ color: NEON_GREEN }}>{s.value}</div>
                <div className="num-font text-[11px] uppercase tracking-[0.12em] mt-2 text-white">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mb-8 inv-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" data-testid="row-googleplay-launch">
            <div>
              <div className="num-font text-[11px] uppercase tracking-[0.15em]" style={{ color: NEON_GREEN }}>Public launch — Google Play</div>
              <div className="text-xs text-muted-foreground mt-1">Native Android live in market. Apple App Store submission in progress.</div>
            </div>
            <div className="num-font text-sm font-semibold text-white" data-testid="text-googleplay-launch-date">
              {C.traction.googlePlayLaunchDate || C.traction.googlePlayLaunchPlaceholder}
            </div>
          </div>
        </Reveal>
        <Reveal>
          <div className="inv-card p-6 sm:p-8 mb-6" style={{ borderColor: `${NEON_GREEN}55` }}>
            <h3 className="num-font text-sm uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }}>Platform state today</h3>
            <ul className="space-y-3">
              {C.traction.state.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground" data-testid={`text-state-${i}`}>
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="inv-card p-6 sm:p-8">
            <h3 className="num-font text-sm uppercase tracking-[0.15em] mb-4" style={{ color: NEON_PURPLE }}>Infrastructure already in the ground</h3>
            <ul className="space-y-3">
              {C.traction.infra.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground" data-testid={`text-infra-${i}`}>
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 inv-card p-5">
            <div>
              <div className="num-font text-sm uppercase tracking-[0.15em]" style={{ color: NEON_GREEN }}>Active across our channels</div>
              <div className="text-xs text-muted-foreground mt-1">Pre-launch traction is also visible on social — feel free to look around.</div>
            </div>
            <SocialLinks size="md" testIdPrefix="link-investor-social" variant="tile" />
          </div>
        </Reveal>
      </Section>

      {/* 09 · PROOF — REAL USERS, REAL CASH, REAL MARKETING */}
      <Section id="section-proof" eyebrow="19 · Proof in market" headline={C.proof.headline} sub={C.proof.sub}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {C.proof.winners.map((w, i) => (
            <Reveal key={w.asset} delay={(i % 3) * 80}>
              <div className="inv-card overflow-hidden inv-card-hover h-full flex flex-col" data-testid={`card-winner-${i}`}>
                <div className="relative aspect-[3/4] bg-black/40 overflow-hidden">
                  <img
                    src={PROOF_ASSETS[w.asset]}
                    alt={`${w.name} — ${w.quote}`}
                    loading="lazy"
                    className="w-full h-full object-contain"
                    data-testid={`img-winner-${i}`}
                  />
                  <div className="absolute top-2 left-2">
                    <span className="pill pill-green num-font">Real user</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-sm text-white font-semibold leading-snug" data-testid={`text-winner-quote-${i}`}>"{w.quote}"</div>
                  <div className="num-font text-[11px] uppercase tracking-[0.12em] mt-2" style={{ color: NEON_GREEN }} data-testid={`text-winner-name-${i}`}>{w.name}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="text-[11px] text-muted-foreground italic mb-12" data-testid="text-proof-consent">{C.proof.consentNote}</div>
        </Reveal>

        {/* Marketing creatives */}
        <Reveal>
          <h3 className="num-font text-xl sm:text-2xl font-bold text-white mb-2" data-testid="text-creatives-headline">{C.proof.creatives.headline}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{C.proof.creatives.sub}</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {C.proof.creatives.items.map((c, i) => (
            <Reveal key={c.asset} delay={i * 80}>
              <div className="inv-card overflow-hidden inv-card-hover h-full flex flex-col" data-testid={`card-creative-${i}`}>
                <div className="relative aspect-[4/5] bg-black/40 overflow-hidden">
                  <img src={PROOF_ASSETS[c.asset]} alt={c.title} loading="lazy" className="w-full h-full object-contain" data-testid={`img-creative-${i}`} />
                  <div className="absolute top-2 left-2">
                    <span className="pill pill-purple num-font">Marketing</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="num-font text-[11px] uppercase tracking-[0.12em] mb-1" style={{ color: NEON_PURPLE }}>{c.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{c.caption}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* In the wild — grassroots brand presence */}
        <Reveal>
          <h3 className="num-font text-xl sm:text-2xl font-bold text-white mb-2" data-testid="text-wild-headline">{C.proof.inTheWild.headline}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{C.proof.inTheWild.sub}</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          {C.proof.inTheWild.items.map((s, i) => (
            <Reveal key={s.asset} delay={i * 80}>
              <div className="inv-card overflow-hidden inv-card-hover h-full flex flex-col sm:flex-row" data-testid={`card-wild-${i}`}>
                <div className="relative sm:w-1/2 aspect-[4/3] sm:aspect-auto bg-black/40 overflow-hidden">
                  <img src={PROOF_ASSETS[s.asset]} alt={s.title} loading="lazy" className="w-full h-full object-contain" data-testid={`img-wild-${i}`} />
                  <div className="absolute top-2 left-2">
                    <span className="pill pill-cyan num-font">In the wild</span>
                  </div>
                </div>
                <div className="p-5 sm:w-1/2 flex flex-col justify-center">
                  <div className="num-font text-[11px] uppercase tracking-[0.12em] mb-2" style={{ color: NEON_CYAN }}>{s.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{s.caption}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* App shots */}
        <Reveal>
          <h3 className="num-font text-xl sm:text-2xl font-bold text-white mb-2" data-testid="text-appshots-headline">{C.proof.appShots.headline}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{C.proof.appShots.sub}</p>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {C.proof.appShots.items.map((a, i) => (
            <Reveal key={a.asset} delay={(i % 4) * 60}>
              <div className="inv-card overflow-hidden inv-card-hover h-full flex flex-col" data-testid={`card-appshot-${i}`}>
                <div className="relative aspect-[9/19] bg-black/40 overflow-hidden">
                  <img src={PROOF_ASSETS[a.asset]} alt={a.title} loading="lazy" className="w-full h-full object-contain" data-testid={`img-appshot-${i}`} />
                  <div className="absolute top-2 left-2">
                    <span className="pill pill-green num-font">Live</span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="num-font text-[10px] uppercase tracking-[0.12em] mb-1 text-white">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{a.caption}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 10 · FOUNDER STORY */}
      <Section id="section-founder" eyebrow="20 · Founder" headline={C.founder.headline}>
        <Reveal>
          <div className="inv-card p-7 sm:p-9" style={{ borderColor: `${NEON_GREEN}33` }}>
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                {(C.founder as any).photo && (
                  <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${NEON_GREEN}55`, boxShadow: `0 0 24px ${NEON_GREEN}22` }}>
                    <img src={(C.founder as any).photo} alt={C.founder.name} className="w-full h-auto block" data-testid="img-founder-photo" />
                  </div>
                )}
                <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Built by</div>
                <div className="text-2xl font-bold text-white" data-testid="text-founder-name-section">{C.founder.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{C.founder.role}</div>
                <div className="mt-5">
                  <span className="pill pill-green num-font">Solo-built · ~18 months</span>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-4">
                {C.founder.body.map((p, i) => (
                  <p key={i} className="text-sm sm:text-base leading-relaxed text-muted-foreground" data-testid={`text-founder-body-${i}`}>{p}</p>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 21 · FUTURE PLANS */}
      {C.futurePlans && (
        <Section id="section-future-plans" eyebrow="21 · The vision" headline={C.futurePlans.headline}>
          <div className="grid sm:grid-cols-2 gap-5">
            {C.futurePlans.items.map((it, i) => (
              <Reveal key={i} delay={(i % 2) * 80}>
                <div className="inv-card p-6 inv-card-hover h-full" data-testid={`card-future-${i}`}>
                  <h4 className="num-font text-sm uppercase tracking-[0.12em] mb-3" style={{ color: i % 2 === 0 ? NEON_GREEN : NEON_PURPLE }}>{it.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{it.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      {/* 11 · LEGAL / CORPORATE STACK */}
      <Section id="section-legal" eyebrow="22 · Legal / corporate stack" headline={C.legal.headline} sub={C.legal.sub}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {C.legal.items.map((it, i) => (
            <Reveal key={i} delay={(i % 4) * 70}>
              <div className="inv-card p-6 inv-card-hover h-full" data-testid={`card-legal-${i}`}>
                <div className="num-font text-[11px] uppercase tracking-[0.15em] mb-3" style={{ color: NEON_GREEN }} data-testid={`text-legal-label-${i}`}>{it.label}</div>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-legal-body-${i}`}>{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 12 · FUNDING ASK */}
      <Section id="section-funding-ask" eyebrow="23 · The ask" headline={C.fundingAsk.headline}>
        <div className="grid lg:grid-cols-2 gap-5">
          <Reveal>
            <div className="inv-card p-7 h-full" style={{ borderColor: `${NEON_GREEN}55`, boxShadow: `0 0 32px hsl(152 100% 44% / .08)` }}>
              <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Target raise</div>
              <div className="num-font font-extrabold text-5xl glow-text-green" style={{ color: NEON_GREEN }} data-testid="text-funding-raise">{C.fundingAsk.raise}</div>
              <div className="mt-6 num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Valuation</div>
              <div className="num-font font-bold text-2xl text-white" data-testid="text-funding-valuation">{C.fundingAsk.valuation}</div>
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed">{C.fundingAsk.structure}</p>
              <div className="mt-6 pt-5 border-t border-white/10">
                <div className="num-font text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: NEON_GREEN }}>GUBER speed</div>
                <p className="text-sm leading-relaxed" style={{ color: "#d8d8de" }} data-testid="text-funding-urgency">{C.fundingAsk.urgency}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="inv-card p-7 h-full">
              <div className="num-font text-xs uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }}>Use of capital</div>
              {C.fundingAsk.useHeadline && (
                <p className="text-sm leading-relaxed text-white mb-5" data-testid="text-use-headline">{C.fundingAsk.useHeadline}</p>
              )}
              <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-7 mb-2">
                <div className="relative flex-shrink-0 mx-auto md:mx-0" style={{ width: 180, height: 180 }}>
                  <svg viewBox="0 0 42 42" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }} data-testid="svg-funding-donut">
                    <circle cx="21" cy="21" r="15.915" fill="#000" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                    {(() => {
                      let acc = 0;
                      return C.fundingAsk.breakdown.map((seg, i) => {
                        const el = (
                          <circle
                            key={i}
                            cx="21"
                            cy="21"
                            r="15.915"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="6"
                            strokeDasharray={`${seg.pct} 100`}
                            strokeDashoffset={-acc}
                            pathLength="100"
                          />
                        );
                        acc += seg.pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <div className="num-font font-extrabold text-2xl text-white leading-none">$1M</div>
                    <div className="num-font text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1">18-month plan</div>
                  </div>
                </div>
                <ul className="flex-1 space-y-2 min-w-0">
                  {C.fundingAsk.breakdown.map((seg, i) => (
                    <li key={i} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 sm:gap-3 text-xs sm:text-sm" data-testid={`row-breakdown-${i}`}>
                      <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
                      <span className="text-white leading-tight truncate">{seg.label}</span>
                      <span className="num-font font-bold tabular-nums" style={{ color: seg.color }}>{seg.pct}%</span>
                      <span className="num-font text-muted-foreground tabular-nums">{seg.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 13 · INVESTOR CTA */}
      <Section id="section-investor-cta" eyebrow="24 · Less talk. Straight action." headline={C.cta.headline} sub={C.cta.sub}>
        <Reveal>
          <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_GREEN}55` }}>
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Founder</div>
                <div className="text-2xl sm:text-3xl font-bold text-white" data-testid="text-founder-name">{C.cta.founderName}</div>
                <div className="text-sm text-muted-foreground mt-1">{C.cta.founderTitle}</div>
                <div className="mt-6 flex flex-col gap-3">
                  <a href={`mailto:${C.meta.contactEmail}`} className="inline-flex items-center gap-3 group" data-testid="link-cta-email">
                    <span className="h-10 w-10 rounded-lg inline-flex items-center justify-center border border-white/15 bg-white/5 group-hover:bg-white/10 transition">
                      <Mail className="w-4 h-4" style={{ color: NEON_GREEN }} />
                    </span>
                    <span className="num-font text-sm tracking-wide group-hover:text-white transition">{C.meta.contactEmail}</span>
                  </a>
                  <a href={`tel:${C.meta.contactPhone}`} className="inline-flex items-center gap-3 group" data-testid="link-cta-phone">
                    <span className="h-10 w-10 rounded-lg inline-flex items-center justify-center border border-white/15 bg-white/5 group-hover:bg-white/10 transition">
                      <Phone className="w-4 h-4" style={{ color: NEON_GREEN }} />
                    </span>
                    <span className="num-font text-sm tracking-wide group-hover:text-white transition">{C.meta.contactPhoneDisplay}</span>
                  </a>
                  <a href={C.meta.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 group" data-testid="link-cta-public">
                    <span className="h-10 w-10 rounded-lg inline-flex items-center justify-center border border-white/15 bg-white/5 group-hover:bg-white/10 transition">
                      <Globe className="w-4 h-4" style={{ color: NEON_GREEN }} />
                    </span>
                    <span className="num-font text-sm tracking-wide group-hover:text-white transition">{C.meta.publicUrl.replace(/^https?:\/\//, "")}</span>
                  </a>
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <a
                  href={`mailto:${C.meta.contactEmail}?subject=GUBER%20Investor%20Inquiry`}
                  className="h-14 px-7 rounded-full num-font text-sm uppercase font-bold inline-flex items-center justify-center gap-2 inv-cta-primary"
                  data-testid="button-cta-email"
                >
                  <Mail className="w-4 h-4" /> Email the founder
                </a>
                <a
                  href={`tel:${C.meta.contactPhone}`}
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 transition"
                  data-testid="button-cta-call"
                >
                  <Phone className="w-4 h-4" /> Call / Text
                </a>
                <a
                  href={C.meta.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold inline-flex items-center justify-center gap-2 border transition"
                  style={{ borderColor: `${NEON_PURPLE}55`, color: NEON_PURPLE, background: "hsl(275 90% 65% / 0.06)" }}
                  data-testid="button-cta-visit"
                >
                  <Globe className="w-4 h-4" /> Visit {C.meta.publicUrl.replace(/^https?:\/\//, "")}
                </a>
                <div className="pt-2">
                  <div className="num-font text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Follow our public traction</div>
                  <SocialLinks size="md" testIdPrefix="link-cta-social" variant="tile" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ∞ · REALITY CHECK CLOSING */}
      <section className="relative px-5 inv-section text-center" id="section-reality-check">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="inv-eyebrow num-font mb-5" style={{ color: NEON_GREEN }} data-testid="text-reality-eyebrow">{C.realityCheck.eyebrow}</div>
            <h2
              className="text-white"
              style={{
                fontSize: "clamp(2.4rem, 7vw, 4.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.022em",
                lineHeight: 1.05,
              }}
              data-testid="text-reality-headline"
            >
              You just experienced <span className="glow-text-green" style={{ color: NEON_GREEN }}>GUBER.</span>
            </h2>
            <p className="mt-7 text-base sm:text-lg text-muted-foreground" data-testid="text-reality-familiar">{C.realityCheck.familiarLine}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-3 sm:gap-6">
              {C.realityCheck.familiarTags.map((t, i) => (
                <span key={i} className="text-lg sm:text-2xl font-bold text-muted-foreground/80" data-testid={`text-familiar-tag-${i}`}>{t}</span>
              ))}
            </div>
            <p className="mt-9 max-w-2xl mx-auto text-sm sm:text-base text-muted-foreground leading-relaxed" data-testid="text-reality-deeper">{C.realityCheck.deeperBody}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-8">
              {C.realityCheck.pillars.map((p, i) => (
                <span key={i} className="text-xl sm:text-3xl font-extrabold" style={{ color: NEON_PURPLE }} data-testid={`text-reality-pillar-${i}`}>{p}</span>
              ))}
            </div>
            <div className="mt-12 font-extrabold text-white" style={{ fontSize: "clamp(2.2rem, 5.5vw, 4rem)", lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              GUBER simply makes it <span style={{ color: NEON_GREEN }} className="glow-text-green">visible.</span>
            </div>
            <div className="mt-6 text-xs sm:text-sm uppercase tracking-[0.18em] num-font" style={{ color: NEON_CYAN }} data-testid="text-reality-deep">{C.realityCheck.deep}</div>
            <img src="/investor/guber-logo-full.png" alt="GUBER" className="mx-auto mt-12 h-auto max-w-[200px] sm:max-w-[240px]" style={{ filter: "drop-shadow(0 0 40px rgba(209,0,255,.5)) drop-shadow(0 0 80px rgba(168,85,247,.3))" }} data-testid="img-reality-logo" />
            <div className="mt-6 num-font text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{C.realityCheck.footer}</div>
            <div className="mt-8 flex flex-wrap justify-center gap-2 sm:gap-3">
              <a href={C.meta.publicUrl} target="_blank" rel="noopener noreferrer" className="pill pill-cyan num-font hover:bg-white/10 transition" data-testid="link-reality-public">guberapp.com</a>
              <a href={`mailto:${C.meta.contactEmail}`} className="pill pill-green num-font hover:bg-white/10 transition" data-testid="link-reality-email">{C.meta.contactEmail}</a>
              <a href={`tel:${C.meta.contactPhone}`} className="pill pill-purple num-font hover:bg-white/10 transition" data-testid="link-reality-phone">{C.meta.contactPhoneDisplay}</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 mt-10 py-10 px-5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="GUBER" className="h-7 object-contain" style={{ mixBlendMode: "screen" }} />
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground num-font">GUBER Global LLC · Greensboro, NC</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground num-font">{C.meta.confidentialNote}</div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  headline,
  sub,
  children,
}: {
  id: string;
  eyebrow: string;
  headline: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative px-5 inv-section">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inv-eyebrow num-font mb-4" data-testid={`text-eyebrow-${id}`}>{eyebrow}</div>
          <h2
            className="text-white mb-4"
            style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)", fontWeight: 700, letterSpacing: "-0.018em", lineHeight: 1.08 }}
            data-testid={`text-headline-${id}`}
          >
            {headline}
          </h2>
          {sub && <p className="text-base sm:text-lg max-w-3xl mb-10 leading-relaxed" style={{ color: "#a8a8b3" }} data-testid={`text-sub-${id}`}>{sub}</p>}
          {!sub && <div className="mb-10" />}
        </Reveal>
        {children}
      </div>
    </section>
  );
}
