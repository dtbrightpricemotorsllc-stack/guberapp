import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Mail, Phone, Globe, ChevronRight, Check, ArrowDown, Printer } from "lucide-react";
import { INVESTOR_CONFIG as C } from "@/lib/investor-config";
import { SocialLinks } from "@/components/social-links";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";

// Existing proof/winner photos
import winnerJamie from "@assets/Screenshot_20260426_204611_Facebook_1778199034008.jpg";
import winnerKyle from "@assets/Screenshot_20260426_064824_Facebook_1778199034038.jpg";
import winnerKlin from "@assets/Screenshot_20260420_042305_Facebook_1778199034079.jpg";
import winnerJames from "@assets/Screenshot_20260331_102503_Facebook_1778199034115.jpg";
import winnerExtra from "@assets/Screenshot_20260414_205025_Facebook_1778199034088.jpg";
import engagementShot from "@assets/Screenshot_20260427_203110_Business_Suite_1778199033998.jpg";

// New screenshots
import screenPlayStore from "@assets/Screenshot_20260521_093739_Google_Play_Store_1779437212969.jpg";
import screenCashDrop from "@assets/Screenshot_20260521_093814_Google_Play_Store_1779437212988.jpg";
import screenAiOrNot from "@assets/Screenshot_20260521_093834_Google_Play_Store_1779437212998.jpg";
import screenMap from "@assets/Screenshot_20260521_093844_Google_Play_Store_1779437213007.jpg";
import screenHome from "@assets/Screenshot_20260521_093856_Google_Play_Store_1779437213018.jpg";
import screenVI from "@assets/Screenshot_20260521_093921_Google_Play_Store_1779437213038.jpg";
import screenMarketplace from "@assets/Screenshot_20260522_030755_Samsung_Browser_1779437304033.jpg";

const WINNER_ASSETS: Record<string, string> = {
  "winner-jamie": winnerJamie,
  "winner-kyle": winnerKyle,
  "winner-klin": winnerKlin,
  "winner-james": winnerJames,
  "winner-extra": winnerExtra,
  "engagement": engagementShot,
};

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) { setShown(true); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) { if (e.isIntersecting) { setShown(true); io.disconnect(); break; } } },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`inv-reveal-node transition-all duration-700 ease-out will-change-[opacity,transform] ${className}`}
      style={{ opacity: shown ? 1 : 0, transform: shown ? "translateY(0)" : "translateY(20px)", transitionDelay: `${delay}ms` }}>
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
const NEON_CYAN = "#00e5ff";

function Section({ id, eyebrow, headline, sub, children }: { id: string; eyebrow: string; headline: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="relative px-5 inv-section">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inv-eyebrow num-font mb-4" data-testid={`text-eyebrow-${id}`}>{eyebrow}</div>
          <h2 className="text-white mb-4" style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)", fontWeight: 700, letterSpacing: "-0.018em", lineHeight: 1.08 }}
            data-testid={`text-headline-${id}`}>{headline}</h2>
          {sub && <p className="text-base sm:text-lg max-w-3xl mb-10 leading-relaxed" style={{ color: "#a8a8b3" }} data-testid={`text-sub-${id}`}>{sub}</p>}
          {!sub && <div className="mb-10" />}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function PhoneFrame({ src, alt, label, testId }: { src: string; alt: string; label?: string; testId?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="inv-card overflow-hidden w-full" style={{ borderColor: `${NEON_GREEN}33`, background: "#000" }}>
        <img src={src} alt={alt} loading="lazy" className="w-full h-auto block object-contain" data-testid={testId} />
      </div>
      {label && <p className="text-[11px] text-muted-foreground mt-2 text-center num-font uppercase tracking-[0.12em]">{label}</p>}
    </div>
  );
}

export default function InvestorsPage() {
  const handlePrint = useCallback(() => {
    // Force all Reveal elements visible before printing
    const nodes = document.querySelectorAll<HTMLElement>(".inv-reveal-node");
    nodes.forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    setTimeout(() => window.print(), 80);
  }, []);

  return (
    <div className="inv-root" style={{ background: "#09090f", color: "#e8e8f0", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .inv-root { font-family: 'Inter', system-ui, sans-serif; }
        .num-font { font-family: 'DM Mono', 'Courier New', monospace; }
        .inv-section { padding-top: clamp(60px, 8vw, 100px); padding-bottom: clamp(60px, 8vw, 100px); }
        .inv-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 16px;
        }
        .inv-card-hover { transition: border-color 0.2s, box-shadow 0.2s; }
        .inv-card-hover:hover { border-color: rgba(57,255,20,0.25); box-shadow: 0 0 24px rgba(57,255,20,0.06); }
        .inv-eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #555570; }
        .glow-text-green { text-shadow: 0 0 24px rgba(57,255,20,0.5); }
        .pill { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; }
        .pill-green { background: rgba(57,255,20,0.1); border: 1px solid rgba(57,255,20,0.3); color: #39FF14; }
        .pill-purple { background: rgba(209,0,255,0.1); border: 1px solid rgba(209,0,255,0.3); color: #D100FF; }
        .pill-cyan { background: rgba(0,229,255,0.1); border: 1px solid rgba(0,229,255,0.3); color: #00e5ff; }
        .pill-amber { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #f59e0b; }
        .inv-cta-primary { background: ${NEON_GREEN}; color: #000; font-weight: 800; transition: filter 0.15s; }
        .inv-cta-primary:hover { filter: brightness(1.08); }
        .step-line { width: 1px; height: 32px; background: rgba(255,255,255,0.1); margin: 0 auto; }

        @media print {
          @page { size: A4 landscape; margin: 12mm 14mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: #09090f !important; color: #e8e8f0 !important; }
          .inv-root { background: #09090f !important; }

          /* Hide interactive nav & no-print elements */
          header, .inv-no-print { display: none !important; }

          /* Show all reveal nodes regardless of scroll position */
          .inv-reveal-node { opacity: 1 !important; transform: none !important; transition: none !important; }

          /* Section spacing for print */
          .inv-section { padding-top: 24px !important; padding-bottom: 24px !important; page-break-inside: avoid; }
          section { page-break-before: auto; break-before: auto; }

          /* Cards keep borders */
          .inv-card { border: 1px solid rgba(255,255,255,0.15) !important; background: rgba(255,255,255,0.04) !important; }

          /* Ensure neon text colours survive */
          .glow-text-green { color: #39FF14 !important; text-shadow: none !important; }
          .inv-eyebrow { color: #39FF14 !important; }
          .inv-cta-primary { background: #39FF14 !important; color: #000 !important; }

          /* Fit images */
          img { max-width: 100% !important; height: auto !important; page-break-inside: avoid; }

          /* Remove sticky/fixed positioning */
          .sticky, [style*="position: sticky"], [style*="position:sticky"] { position: relative !important; }

          /* Avoid breaking key content */
          h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
          ul, ol { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* NAV */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3" style={{ background: "rgba(9,9,15,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <img src={logoImg} alt="GUBER" className="h-7 object-contain" style={{ mixBlendMode: "screen" }} data-testid="img-nav-logo" />
        <div className="flex items-center gap-3">
          <span className="pill pill-green num-font" data-testid="text-nav-confidential">Confidential</span>
          <a
            href="/investor/deck.pdf"
            download="GUBER-Investor-Deck.pdf"
            className="h-9 px-4 rounded-full text-xs uppercase tracking-[0.18em] num-font font-bold inline-flex items-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 transition text-white"
            data-testid="button-nav-pdf">
            <Printer className="w-3.5 h-3.5" /> Download PDF
          </a>
          <button
            onClick={() => scrollToId("section-cta")}
            className="h-9 px-4 rounded-full text-xs uppercase tracking-[0.18em] num-font font-bold inv-cta-primary hidden sm:inline-flex items-center gap-2"
            data-testid="button-nav-contact">
            Contact <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* SLIDE 1 — HERO */}
      <section className="relative overflow-hidden px-5" id="section-hero"
        style={{ paddingTop: "clamp(80px, 12vw, 140px)", paddingBottom: "clamp(80px, 12vw, 140px)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 20% 50%, rgba(57,255,20,0.06), transparent 60%), radial-gradient(ellipse 60% 60% at 80% 50%, rgba(209,0,255,0.06), transparent 60%)" }} />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Reveal>
              <span className="pill pill-green num-font mb-6 inline-flex" data-testid="text-hero-eyebrow">{C.hero.eyebrow}</span>
              <h1 className="text-white mb-4 glow-text-green" style={{ fontSize: "clamp(4rem, 10vw, 8rem)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9, color: NEON_GREEN }}
                data-testid="text-hero-headline">{C.hero.headline}</h1>
              <div className="mt-6 space-y-1" data-testid="text-hero-subtitle">
                {C.hero.subtitle.map((line, i) => (
                  <div key={i} className="text-white font-bold" style={{ fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)", lineHeight: 1.15 }}>{line}</div>
                ))}
              </div>
              <div className="mt-5 text-base sm:text-lg font-semibold" style={{ color: NEON_PURPLE }} data-testid="text-hero-tagline">
                {C.hero.tagline}
              </div>
              <p className="mt-4 text-sm sm:text-base max-w-xl leading-relaxed" style={{ color: "#a8a8b3" }} data-testid="text-hero-sub">{C.hero.sub}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => scrollToId(C.hero.primaryCta.target)}
                  className="h-12 px-8 rounded-full num-font text-sm uppercase font-bold inline-flex items-center justify-center gap-2 inv-cta-primary"
                  data-testid="button-hero-primary">
                  {C.hero.primaryCta.label} <ArrowDown className="w-4 h-4" />
                </button>
                <button onClick={() => scrollToId(C.hero.secondaryCta.target)}
                  className="h-12 px-6 rounded-full num-font text-sm uppercase font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 transition text-white"
                  data-testid="button-hero-secondary">
                  {C.hero.secondaryCta.label} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </Reveal>
          </div>
          <Reveal delay={120} className="grid grid-cols-2 gap-3">
            <PhoneFrame src={screenHome} alt="GUBER home screen" label="Find help near you" testId="img-hero-home" />
            <PhoneFrame src={screenMap} alt="GUBER job map" label="8 jobs nearby" testId="img-hero-map" />
          </Reveal>
        </div>
      </section>

      {/* SLIDE 2 — THE PROBLEM */}
      <Section id="section-problem" eyebrow="01 · The Problem" headline={C.problem.headline}>
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <Reveal>
            <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_GREEN}22` }}>
              <p className="text-lg sm:text-xl font-semibold text-white mb-6">Every day people need:</p>
              <div className="flex gap-6 mb-8">
                {C.problem.needs.map((n, i) => (
                  <div key={i} className="text-center">
                    <div className="num-font font-extrabold" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", color: NEON_GREEN, lineHeight: 1 }}>{n}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-4 border-t border-white/10 pt-6">
                {C.problem.body.map((line, i) => (
                  <p key={i} className="text-sm sm:text-base leading-relaxed" style={{ color: "#c8c8d8" }} data-testid={`text-problem-${i}`}>{line}</p>
                ))}
              </div>
              <div className="mt-8 border-t border-white/10 pt-6">
                {C.problem.closer.split("\n\n").map((line, i) => (
                  <p key={i} className={`font-bold text-white text-base sm:text-lg ${i > 0 ? "mt-2" : ""}`}>{line}</p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="space-y-3">
              {[
                { icon: "💼", label: "TaskRabbit", sub: "Rigid categories. Limited geography. No real trust." },
                { icon: "📋", label: "Craigslist", sub: "Anonymous strangers. No accountability. Payment off-platform." },
                { icon: "📱", label: "Phone a friend", sub: "Unreliable. Awkward. No proof anything happened." },
              ].map((app, i) => (
                <div key={i} className="inv-card p-4 flex items-center gap-4">
                  <span className="text-2xl">{app.icon}</span>
                  <div>
                    <div className="text-sm font-bold text-white line-through opacity-50">{app.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{app.sub}</div>
                  </div>
                </div>
              ))}
              <div className="inv-card p-5 mt-4" style={{ borderColor: `${NEON_GREEN}44`, background: "rgba(57,255,20,0.04)" }}>
                <div className="text-sm font-bold" style={{ color: NEON_GREEN }}>The gap these platforms leave:</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Hundreds of billions of dollars in micro-services flow through informal channels every year — with zero infrastructure for trust, payment, or proof.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 3 — REAL PROBLEMS. REAL PEOPLE. */}
      <Section id="section-real-problems" eyebrow="02 · Real Problems. Real People." headline={C.realProblems.headline}>
        <div className="grid sm:grid-cols-3 gap-5 mb-8">
          {C.realProblems.cards.map((card, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="inv-card p-6 inv-card-hover h-full" data-testid={`card-scenario-${i}`}
                style={{ borderColor: i === 0 ? `${NEON_GREEN}33` : i === 1 ? `${NEON_PURPLE}33` : `${NEON_CYAN}33` }}>
                <div className="num-font text-[11px] uppercase tracking-[0.18em] mb-4"
                  style={{ color: i === 0 ? NEON_GREEN : i === 1 ? NEON_PURPLE : NEON_CYAN }}>
                  Scenario {String(i + 1).padStart(2, "0")}
                </div>
                <h4 className="text-base font-bold text-white mb-4">{card.title}</h4>
                <div className="space-y-2">
                  {card.body.split("\n\n").map((line, j) => (
                    <p key={j} className="text-sm leading-relaxed" style={{ color: "#b8b8c8" }}>{line}</p>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <div className="inv-card p-6 text-center" style={{ borderColor: `${NEON_GREEN}22`, background: "rgba(57,255,20,0.03)" }}>
            {C.realProblems.closer.split("\n\n").map((line, i) => (
              <p key={i} className={`font-bold text-white text-base sm:text-lg ${i > 0 ? "mt-2" : ""}`}>{line}</p>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 4 — CREATE VALUE IN YOURSELF */}
      <Section id="section-value-core" eyebrow={`03 · ${C.valueCore.eyebrow}`} headline={C.valueCore.headline}>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_PURPLE}33`, background: "radial-gradient(ellipse at top left, rgba(209,0,255,0.06), transparent 60%)" }}>
              <div className="space-y-3 mb-8">
                {C.valueCore.body.map((line, i) => (
                  <p key={i} className={`font-bold text-white leading-tight ${i === 0 ? "text-2xl sm:text-3xl" : i === 1 ? "text-xl sm:text-2xl opacity-60" : "text-2xl sm:text-3xl"}`}>{line}</p>
                ))}
              </div>
              <div className="space-y-3 mb-8 border-t border-white/10 pt-6">
                {C.valueCore.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`text-value-step-${i}`}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(209,0,255,0.12)", border: "1px solid rgba(209,0,255,0.3)" }}>
                      <Check className="w-3 h-3" style={{ color: NEON_PURPLE }} />
                    </div>
                    <span className="text-sm sm:text-base text-white font-medium">{step}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground italic">{C.valueCore.profileLine}</p>
              <div className="mt-6 border-t border-white/10 pt-6 space-y-2">
                {C.valueCore.closer.split("\n\n").map((line, i) => (
                  <p key={i} className="font-bold text-white text-base">{line}</p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex justify-center">
              <img src="/investor/mascot.png" alt="GUBER — Create Value In Yourself"
                className="w-full max-w-[320px] h-auto"
                style={{ filter: `drop-shadow(0 0 60px rgba(209,0,255,0.35)) drop-shadow(0 0 20px rgba(57,255,20,0.2))` }}
                data-testid="img-value-mascot" />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 5 — HOW GUBER WORKS */}
      <Section id="section-how-it-works" eyebrow="04 · How It Works" headline={C.howItWorks.headline}>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div className="space-y-0">
              {C.howItWorks.steps.map((step, i) => (
                <div key={i} data-testid={`row-step-${i}`}>
                  <div className="flex items-center gap-5 py-5" style={{ borderBottom: i < C.howItWorks.steps.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                    <div className="num-font font-extrabold text-5xl sm:text-6xl flex-shrink-0 tabular-nums" style={{ color: NEON_GREEN, opacity: 0.25 }}>{step.num}</div>
                    <div className="text-xl sm:text-2xl font-bold text-white">{step.label}</div>
                  </div>
                </div>
              ))}
              <div className="mt-8 inv-card p-5" style={{ borderColor: `${NEON_GREEN}44`, background: "rgba(57,255,20,0.04)" }}>
                {C.howItWorks.closer.split(". ").map((part, i) => (
                  <span key={i} className="num-font font-bold text-lg sm:text-xl" style={{ color: NEON_GREEN }}>
                    {part}{i < 2 ? <span className="text-white/30 mx-1">·</span> : ""}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120} className="grid grid-cols-2 gap-3">
            <PhoneFrame src={screenHome} alt="Post a job" label="Post & accept" testId="img-how-home" />
            <PhoneFrame src={screenVI} alt="Verify & Inspect" label="Submit proof" testId="img-how-vi" />
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 6 — TRACTION */}
      <Section id="section-traction" eyebrow="05 · Traction" headline={C.traction.headline} sub={C.traction.sub}>
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {C.traction.stats.map((s, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="inv-card p-5 inv-card-hover h-full" data-testid={`stat-${i}`}>
                <div className="num-font font-extrabold text-3xl sm:text-4xl glow-text-green" style={{ color: NEON_GREEN }}>{s.value}</div>
                <div className="num-font text-[11px] uppercase tracking-[0.12em] mt-2 text-white">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Google Play launch bar */}
        <Reveal>
          <div className="inv-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6" data-testid="row-googleplay-launch">
            <div>
              <div className="num-font text-[11px] uppercase tracking-[0.15em]" style={{ color: NEON_GREEN }}>Public launch — Google Play</div>
              <div className="text-xs text-muted-foreground mt-1">Native Android live in market. Apple App Store submission in progress.</div>
            </div>
            <div className="num-font text-sm font-semibold text-white">{C.traction.googlePlayLaunchDate}</div>
          </div>
        </Reveal>

        {/* Large screenshots */}
        <Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <PhoneFrame src={screenPlayStore} alt="Google Play Store — 100+ downloads" label="Google Play · 100+ downloads" testId="img-traction-playstore" />
            <PhoneFrame src={screenHome} alt="GUBER home screen" label="Home screen" testId="img-traction-home" />
            <PhoneFrame src={screenMarketplace} alt="GUBER Marketplace" label="Marketplace · live" testId="img-traction-marketplace" />
            <PhoneFrame src={screenCashDrop} alt="Cash Drop — $158 active" label="Cash Drop · $158 active" testId="img-traction-cashdrop" />
          </div>
        </Reveal>

        {/* Platform facts */}
        <Reveal>
          <div className="inv-card p-6 sm:p-8 mb-6" style={{ borderColor: `${NEON_GREEN}44` }}>
            <h3 className="num-font text-sm uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }}>Platform state today</h3>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {C.traction.facts.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground" data-testid={`text-fact-${i}`}>
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* Real user proof */}
        <Reveal>
          <h3 className="num-font text-xl sm:text-2xl font-bold text-white mb-2" data-testid="text-proof-headline">{C.traction.proofHeadline}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{C.traction.proofSub}</p>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
          {C.traction.winners.map((w, i) => (
            <Reveal key={w.asset} delay={(i % 3) * 60}>
              <div className="inv-card overflow-hidden inv-card-hover h-full flex flex-col" data-testid={`card-winner-${i}`}>
                <div className="relative aspect-[3/4] bg-black/40 overflow-hidden">
                  <img src={WINNER_ASSETS[w.asset]} alt={`${w.name} — ${w.quote}`} loading="lazy"
                    className="w-full h-full object-contain" data-testid={`img-winner-${i}`} />
                  <div className="absolute top-2 left-2"><span className="pill pill-green num-font">Real user</span></div>
                </div>
                <div className="p-4">
                  <div className="text-sm text-white font-semibold leading-snug">"{w.quote}"</div>
                  <div className="num-font text-[11px] uppercase tracking-[0.12em] mt-2" style={{ color: NEON_GREEN }}>{w.name}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="text-[11px] text-muted-foreground italic mb-6">{C.traction.proofConsentNote}</p>
        </Reveal>
        <Reveal>
          <div className="inv-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="num-font text-sm uppercase tracking-[0.15em]" style={{ color: NEON_GREEN }}>Active across our channels</div>
              <div className="text-xs text-muted-foreground mt-1">Pre-launch traction visible on social — feel free to look around.</div>
            </div>
            <SocialLinks size="md" testIdPrefix="link-investor-social" variant="tile" />
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 7 — TRUST IS EARNED */}
      <Section id="section-trust" eyebrow="06 · Trust Is Earned" headline={C.trustEarned.headline}>
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <Reveal>
            <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_CYAN}33`, background: "rgba(0,229,255,0.02)" }}>
              <p className="text-lg sm:text-xl font-bold text-white mb-2" data-testid="text-trust-question">{C.trustEarned.question}</p>
              <p className="num-font font-extrabold mb-6" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: NEON_CYAN, lineHeight: 1 }}>{C.trustEarned.answer}</p>
              <div className="space-y-2 mb-8">
                {C.trustEarned.openLine.split("\n\n").map((line, i) => (
                  <p key={i} className="text-base sm:text-lg font-semibold text-white">{line}</p>
                ))}
              </div>
              <div className="border-t border-white/10 pt-6">
                <p className="num-font text-[11px] uppercase tracking-[0.18em] mb-4" style={{ color: NEON_CYAN }}>Users build credibility through</p>
                <ul className="space-y-3">
                  {C.trustEarned.credibilityItems.map((item, i) => (
                    <li key={i} className="flex gap-3 text-sm sm:text-base font-medium text-white" data-testid={`text-trust-item-${i}`}>
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: NEON_CYAN }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-8 border-t border-white/10 pt-6 space-y-2">
                {C.trustEarned.closer.split("\n\n").map((line, i) => (
                  <p key={i} className="font-bold text-white text-base sm:text-lg">{line}</p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120} className="grid grid-cols-2 gap-3">
            <PhoneFrame src={screenVI} alt="Verify & Inspect" label="Verified proof" testId="img-trust-vi" />
            <PhoneFrame src={screenAiOrNot} alt="AI or Not" label="Trust Box" testId="img-trust-ainot" />
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 8 — REVENUE MODEL */}
      <Section id="section-revenue" eyebrow="07 · Revenue Model" headline={C.revenue.headline}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {C.revenue.groups.map((g, i) => (
            <Reveal key={i} delay={(i % 3) * 60}>
              <div className="inv-card p-5 inv-card-hover h-full" style={{ borderColor: `${g.color}22` }} data-testid={`card-revenue-${i}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="num-font text-[11px] uppercase tracking-[0.15em] font-bold" style={{ color: g.color }}>{g.label}</div>
                  <span className={`pill ${g.status === "Live" ? "pill-green" : "pill-amber"} num-font`}>{g.status}</span>
                </div>
                <ul className="space-y-2">
                  {g.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                      <span style={{ color: g.color }} className="flex-shrink-0 mt-0.5">›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="inv-card p-6 text-center" style={{ borderColor: `${NEON_GREEN}33`, background: "rgba(57,255,20,0.03)" }}>
            {C.revenue.closer.split("\n").map((line, i) => (
              <p key={i} className={`font-bold text-white ${i === 0 ? "text-xl sm:text-2xl" : "text-base text-muted-foreground mt-1"}`}>{line}</p>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 9 — DISTRIBUTION STRATEGY */}
      <Section id="section-distribution" eyebrow="08 · Distribution Strategy" headline={C.distribution.headline} sub={C.distribution.sub}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {C.distribution.items.map((item, i) => (
            <Reveal key={i} delay={(i % 3) * 60}>
              <div className="inv-card p-5 inv-card-hover h-full" data-testid={`card-distribution-${i}`}>
                <div className="num-font text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: i % 2 === 0 ? NEON_GREEN : NEON_PURPLE }}>{item.label}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="inv-card p-5 text-center" style={{ borderColor: `${NEON_GREEN}22`, background: "rgba(57,255,20,0.03)" }}>
            <p className="font-bold text-white text-base sm:text-lg">{C.distribution.closer}</p>
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 10 — EXPANSION PLAYBOOK */}
      <Section id="section-expansion" eyebrow="09 · Expansion Playbook" headline={C.expansion.headline}>
        <div className="max-w-2xl mx-auto mb-8">
          {C.expansion.steps.map((step, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="flex gap-5 items-start py-5" style={{ borderBottom: i < C.expansion.steps.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}
                data-testid={`row-expansion-${i}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.3)" }}>
                  <span className="num-font text-[11px] font-bold" style={{ color: NEON_GREEN }}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-white">{step.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.sub}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="inv-card p-5 text-center" style={{ borderColor: `${NEON_GREEN}22`, background: "rgba(57,255,20,0.03)" }}>
            <p className="font-bold text-white text-base sm:text-lg">{C.expansion.closer}</p>
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 11 — THE NETWORK EFFECT */}
      <Section id="section-network-effect" eyebrow={`10 · ${C.networkEffect.eyebrow}`} headline={C.networkEffect.headline}>
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <Reveal>
            <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_PURPLE}33`, background: "rgba(209,0,255,0.02)" }}>
              <p className="text-base sm:text-lg font-semibold text-white mb-5">{C.networkEffect.intro}</p>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {C.networkEffect.items.map((item, i) => (
                  <div key={i} className="inv-card p-4 text-center" style={{ borderColor: `${NEON_PURPLE}22` }} data-testid={`card-network-${i}`}>
                    <div className="num-font font-bold text-base sm:text-lg" style={{ color: NEON_PURPLE }}>{item}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 border-t border-white/10 pt-6">
                {C.networkEffect.body.split("\n\n").map((para, i) => (
                  <p key={i} className="text-sm sm:text-base leading-relaxed text-muted-foreground">{para}</p>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-6 space-y-2">
                {C.networkEffect.closer.split("\n\n").map((line, i) => (
                  <p key={i} className="font-bold text-white text-base sm:text-lg">{line}</p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="inv-card p-7 sm:p-9 text-center" style={{ borderColor: `${NEON_PURPLE}44`, boxShadow: `0 0 48px rgba(209,0,255,0.08)` }}>
              <div className="num-font font-extrabold glow-text-green mb-2" style={{ fontSize: "clamp(3rem, 7vw, 5rem)", color: NEON_PURPLE, lineHeight: 1 }}>↑</div>
              <p className="text-base sm:text-lg font-bold text-white mb-2">More users</p>
              <p className="text-xs text-muted-foreground mb-6">More jobs → more credibility → more trust → more users</p>
              <div className="space-y-3">
                {["Workers build verified track records", "Hirers find trustworthy help", "Businesses buy verified proof", "Platform data gets stronger"].map((line, i) => (
                  <div key={i} className="flex items-center gap-3 text-left">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: NEON_PURPLE }} />
                    <span className="text-sm text-muted-foreground">{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 12 — WHY GUBER CAN WIN */}
      <Section id="section-why-win" eyebrow="11 · Why GUBER Can Win" headline={C.whyWin.headline}>
        <Reveal>
          <div className="inv-card p-7 sm:p-9 mb-6" style={{ borderColor: `${NEON_GREEN}33`, boxShadow: `0 0 32px rgba(57,255,20,0.06)` }}>
            <ul className="space-y-4">
              {C.whyWin.points.map((point, i) => (
                <li key={i} className="flex gap-4 items-start" data-testid={`text-why-win-${i}`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(57,255,20,0.12)", border: "1px solid rgba(57,255,20,0.35)" }}>
                    <Check className="w-3.5 h-3.5" style={{ color: NEON_GREEN }} />
                  </div>
                  <span className="text-sm sm:text-base leading-relaxed text-white">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="inv-card p-6 text-center" style={{ borderColor: `${NEON_GREEN}22`, background: "rgba(57,255,20,0.03)" }}>
            {C.whyWin.closer.split("\n\n").map((line, i) => (
              <p key={i} className={`font-bold text-white ${i === 0 ? "text-base sm:text-lg" : "text-xl sm:text-2xl mt-2"} ${i === 1 ? "glow-text-green" : ""}`}
                style={i === 1 ? { color: NEON_GREEN } : {}}>{line}</p>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* SLIDE 13 — VISION */}
      <Section id="section-vision" eyebrow="12 · Vision" headline={C.vision.headline}>
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <div className="inv-card p-10 sm:p-14" style={{ borderColor: `${NEON_PURPLE}33`, background: "radial-gradient(ellipse at center, rgba(209,0,255,0.06), transparent 70%)" }}>
              {C.vision.body.split("\n\n").map((para, i) => (
                <p key={i} className={`leading-relaxed ${i === 0 ? "text-sm text-muted-foreground mb-4" : "text-lg sm:text-xl font-semibold text-white"}`}>{para}</p>
              ))}
              <div className="mt-10 border-t border-white/10 pt-8">
                <p className="text-xl sm:text-2xl font-extrabold" style={{ color: NEON_PURPLE }}>{C.vision.closer}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* SLIDE 14 — INVESTMENT OPPORTUNITY */}
      <Section id="section-funding" eyebrow="13 · Investment Opportunity" headline={C.fundingAsk.headline}>
        <div className="grid lg:grid-cols-2 gap-5 mb-6">
          <Reveal>
            <div className="inv-card p-7 h-full" style={{ borderColor: `${NEON_GREEN}55`, boxShadow: `0 0 32px rgba(57,255,20,0.08)` }}>
              <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Target raise</div>
              <div className="num-font font-extrabold text-4xl sm:text-5xl glow-text-green" style={{ color: NEON_GREEN }} data-testid="text-funding-raise">{C.fundingAsk.raise}</div>
              <div className="mt-6 num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Valuation</div>
              <div className="num-font font-bold text-xl sm:text-2xl text-white" data-testid="text-funding-valuation">{C.fundingAsk.valuation}</div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{C.fundingAsk.structure}</p>
              <div className="mt-6 pt-5 border-t border-white/10">
                <p className="text-sm leading-relaxed" style={{ color: "#d8d8de" }} data-testid="text-funding-urgency">{C.fundingAsk.urgency}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="inv-card p-7 h-full">
              <div className="num-font text-xs uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }}>Use of capital</div>
              <p className="text-sm leading-relaxed text-white mb-5">{C.fundingAsk.useHeadline}</p>
              <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-7">
                <div className="relative flex-shrink-0 mx-auto md:mx-0" style={{ width: 160, height: 160 }}>
                  <svg viewBox="0 0 42 42" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="21" cy="21" r="15.915" fill="#000" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                    {(() => {
                      let acc = 0;
                      return C.fundingAsk.breakdown.map((seg, i) => {
                        const el = <circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={seg.color} strokeWidth="6" strokeDasharray={`${seg.pct} 100`} strokeDashoffset={-acc} pathLength="100" />;
                        acc += seg.pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <div className="num-font font-extrabold text-xl text-white leading-none">$1M</div>
                    <div className="num-font text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1">18 mo</div>
                  </div>
                </div>
                <ul className="flex-1 space-y-2 min-w-0">
                  {C.fundingAsk.breakdown.map((seg, i) => (
                    <li key={i} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-xs" data-testid={`row-breakdown-${i}`}>
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
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

        {/* Legal stack */}
        <Reveal>
          <div className="num-font text-[11px] uppercase tracking-[0.18em] mb-4 mt-8" style={{ color: NEON_GREEN }}>{C.legal.eyebrow} · Corporate Stack</div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {C.legal.items.map((it, i) => (
            <Reveal key={i} delay={(i % 4) * 70}>
              <div className="inv-card p-5 inv-card-hover h-full" data-testid={`card-legal-${i}`}>
                <div className="num-font text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: NEON_GREEN }}>{it.label}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section id="section-cta" eyebrow="14 · Contact" headline={C.cta.headline} sub={C.cta.sub}>
        <Reveal>
          <div className="inv-card p-8 sm:p-10" style={{ borderColor: `${NEON_GREEN}55` }}>
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Founder</div>
                <div className="text-2xl sm:text-3xl font-bold text-white" data-testid="text-founder-name">{C.cta.founderName}</div>
                <div className="text-sm text-muted-foreground mt-1">{C.cta.founderTitle}</div>
                <div className="mt-2"><span className="pill pill-green num-font">Solo-built · ~18 months</span></div>
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
              <div className="flex flex-col gap-4">
                <a href={`mailto:${C.meta.contactEmail}?subject=GUBER%20Investor%20Inquiry`}
                  className="h-14 px-7 rounded-full num-font text-sm uppercase font-bold inline-flex items-center justify-center gap-2 inv-cta-primary"
                  data-testid="button-cta-email">
                  <Mail className="w-4 h-4" /> Email the founder
                </a>
                <a href={`tel:${C.meta.contactPhone}`}
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 transition"
                  data-testid="button-cta-call">
                  <Phone className="w-4 h-4" /> Call / Text
                </a>
                <a href={C.meta.publicUrl} target="_blank" rel="noopener noreferrer"
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold inline-flex items-center justify-center gap-2 border transition"
                  style={{ borderColor: `${NEON_PURPLE}55`, color: NEON_PURPLE, background: "rgba(209,0,255,0.06)" }}
                  data-testid="button-cta-visit">
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

      {/* CLOSING */}
      <section className="relative px-5 inv-section text-center" id="section-closing">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <img src="/investor/guber-logo-full.png" alt="GUBER" className="mx-auto mb-10 h-auto max-w-[180px] sm:max-w-[220px]"
              style={{ filter: "drop-shadow(0 0 40px rgba(209,0,255,.5)) drop-shadow(0 0 80px rgba(168,85,247,.3))" }}
              data-testid="img-closing-logo" />
            <h2 className="text-white font-extrabold" style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", lineHeight: 1.05, letterSpacing: "-0.025em" }}>
              People need work,<br />help, and proof.<br />
              <span className="glow-text-green" style={{ color: NEON_GREEN }}>GUBER makes it visible.</span>
            </h2>
            <p className="mt-6 text-base sm:text-lg font-semibold" style={{ color: NEON_PURPLE }}>Create Value In Yourself.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-2 sm:gap-3">
              <a href={C.meta.publicUrl} target="_blank" rel="noopener noreferrer" className="pill pill-cyan num-font hover:bg-white/10 transition">{C.meta.publicUrl.replace(/^https?:\/\//, "")}</a>
              <a href={`mailto:${C.meta.contactEmail}`} className="pill pill-green num-font hover:bg-white/10 transition">{C.meta.contactEmail}</a>
              <a href={`tel:${C.meta.contactPhone}`} className="pill pill-purple num-font hover:bg-white/10 transition">{C.meta.contactPhoneDisplay}</a>
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
