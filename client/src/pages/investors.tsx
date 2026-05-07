import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail, Phone, Globe, ChevronRight, Check, Printer, ArrowDown } from "lucide-react";
import { INVESTOR_CONFIG as C } from "@/lib/investor-config";
import { SocialLinks } from "@/components/social-links";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";

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

const NEON_GREEN = "hsl(152 100% 44%)";
const NEON_PURPLE = "hsl(275 90% 65%)";
const NEON_CYAN = "hsl(190 95% 55%)";

export default function Investors() {
  // SEO: set title + noindex + OG tags. Restore on unmount.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = C.meta.title;
    const tags: HTMLElement[] = [];
    const upsert = (attr: "name" | "property", key: string, value: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      let created = false;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created = true;
      }
      el.setAttribute("content", value);
      if (created) tags.push(el);
    };
    upsert("name", "robots", "noindex,nofollow,noarchive");
    upsert("name", "description", C.meta.description);
    upsert("property", "og:title", C.meta.title);
    upsert("property", "og:description", C.meta.description);
    upsert("property", "og:type", "website");
    return () => {
      document.title = prevTitle;
      tags.forEach((t) => t.remove());
    };
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground font-sans investor-root">
      <style>{`
        .investor-root { background:
          radial-gradient(1200px 600px at 15% -10%, hsl(275 90% 25% / 0.35), transparent 60%),
          radial-gradient(1000px 500px at 95% 10%, hsl(152 100% 30% / 0.18), transparent 60%),
          radial-gradient(900px 500px at 50% 110%, hsl(190 95% 30% / 0.18), transparent 60%),
          hsl(225 25% 3%);
        }
        .ink-grid {
          background-image:
            linear-gradient(hsl(220 15% 20% / 0.18) 1px, transparent 1px),
            linear-gradient(90deg, hsl(220 15% 20% / 0.18) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at center, black 35%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 35%, transparent 75%);
        }
        .neon-rule { height: 1px; background: linear-gradient(90deg, transparent, ${NEON_GREEN} 30%, ${NEON_PURPLE} 70%, transparent); opacity:.55; }
        .num-font { font-family: 'Oxanium', monospace; letter-spacing:.04em; }
        .pill { display:inline-flex; align-items:center; gap:.4em; padding:.3em .8em; border-radius:999px; font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
        .pill-green { background: hsl(152 100% 44% / .12); color: ${NEON_GREEN}; border:1px solid hsl(152 100% 44% / .3); }
        .pill-purple { background: hsl(275 90% 65% / .12); color: ${NEON_PURPLE}; border:1px solid hsl(275 90% 65% / .3); }
        .pill-cyan { background: hsl(190 95% 55% / .12); color: ${NEON_CYAN}; border:1px solid hsl(190 95% 55% / .3); }
        .pill-amber { background: hsl(45 100% 55% / .12); color: hsl(45 100% 60%); border:1px solid hsl(45 100% 55% / .3); }
        .inv-card { background: hsl(225 25% 6% / .8); backdrop-filter: blur(14px); border:1px solid hsl(220 15% 22% / .6); border-radius: 16px; }
        .inv-card-hover { transition: transform .3s ease, border-color .3s ease, box-shadow .3s ease; }
        .inv-card-hover:hover { transform: translateY(-2px); border-color: hsl(152 100% 44% / .35); box-shadow: 0 8px 32px rgba(0,0,0,.4), 0 0 24px hsl(152 100% 44% / .08); }
        .glow-text-green { text-shadow: 0 0 18px hsl(152 100% 44% / .35); }
        .glow-text-purple { text-shadow: 0 0 18px hsl(275 90% 65% / .35); }

        @media print {
          @page { size: letter; margin: 0.4in; }
          .no-print { display: none !important; }
          .investor-root { background: white !important; color: black !important; }
          .investor-root, .investor-root * { color: black !important; text-shadow: none !important; }
          .inv-card { background: white !important; border: 1px solid #ccc !important; box-shadow: none !important; backdrop-filter: none !important; }
          .pill, .pill-green, .pill-purple, .pill-cyan, .pill-amber { background: #f3f3f3 !important; color: black !important; border-color: #ccc !important; }
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
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-xs uppercase tracking-[0.15em] num-font font-bold text-black"
              style={{ background: `linear-gradient(135deg, ${NEON_GREEN}, hsl(152 80% 36%))`, boxShadow: "0 4px 16px hsl(152 100% 44% / .3)" }}
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
        <div className="relative max-w-7xl mx-auto px-5 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <Reveal>
            <span className="pill pill-green num-font" data-testid="text-hero-eyebrow">{C.hero.eyebrow}</span>
          </Reveal>
          <Reveal delay={80}>
            <h1
              className="mt-6 num-font font-extrabold leading-[0.95] tracking-tight glow-text-green"
              style={{ fontSize: "clamp(3.5rem, 12vw, 9rem)", color: "white" }}
              data-testid="text-hero-headline"
            >
              {C.hero.headline}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-4 text-2xl sm:text-3xl font-semibold max-w-3xl" style={{ color: NEON_GREEN }} data-testid="text-hero-tagline">
              {C.hero.tagline}
            </p>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed" data-testid="text-hero-sub">
              {C.hero.sub}
            </p>
          </Reveal>
          <Reveal delay={280}>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => scrollToId(C.hero.primaryCta.target)}
                className="h-12 px-7 rounded-xl num-font text-sm uppercase tracking-[0.18em] font-bold text-black inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${NEON_GREEN}, hsl(152 80% 36%))`, boxShadow: "0 8px 32px hsl(152 100% 44% / .35)" }}
                data-testid="button-hero-primary"
              >
                {C.hero.primaryCta.label} <ArrowDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToId(C.hero.secondaryCta.target)}
                className="h-12 px-7 rounded-xl num-font text-sm uppercase tracking-[0.18em] font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 transition"
                data-testid="button-hero-secondary"
              >
                {C.hero.secondaryCta.label} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <p className="mt-10 text-[10px] uppercase tracking-[0.2em] text-muted-foreground num-font">{C.meta.confidentialNote}</p>
          </Reveal>
        </div>
      </section>

      {/* PROBLEM */}
      <Section id="section-problem" eyebrow="01 · The problem" headline={C.problem.headline}>
        <div className="grid sm:grid-cols-2 gap-6">
          {C.problem.columns.map((col, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="inv-card p-6 sm:p-7 inv-card-hover h-full">
                <h3 className="num-font text-sm uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }} data-testid={`text-problem-col-${i}`}>{col.title}</h3>
                <ul className="space-y-3">
                  {col.bullets.map((b, j) => (
                    <li key={j} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: NEON_GREEN }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-8 text-base sm:text-lg max-w-3xl text-muted-foreground" data-testid="text-problem-closer">
            {C.problem.closer}
          </p>
        </Reveal>
      </Section>

      {/* SOLUTION */}
      <Section id="section-solution" eyebrow="02 · The solution" headline={C.solution.headline}>
        <div className="grid md:grid-cols-3 gap-5">
          {C.solution.pillars.map((p, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="inv-card p-7 inv-card-hover h-full" data-testid={`card-pillar-${i}`}>
                <div
                  className="num-font font-extrabold mb-4 inline-flex items-center justify-center rounded-xl"
                  style={{
                    fontSize: "2.4rem",
                    width: 64, height: 64,
                    color: NEON_GREEN,
                    background: "hsl(152 100% 44% / .08)",
                    border: "1px solid hsl(152 100% 44% / .25)",
                  }}
                >
                  {p.symbol}
                </div>
                <h4 className="text-lg font-bold mb-2 text-white">{p.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={300}>
          <p className="mt-8 text-base sm:text-lg max-w-3xl text-muted-foreground">
            <span style={{ color: NEON_GREEN }}>The result:</span> {C.solution.closer}
          </p>
        </Reveal>
      </Section>

      {/* PRODUCT */}
      <Section id="section-product" eyebrow="03 · Product" headline={C.product.headline} sub={C.product.sub}>
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

      {/* BUSINESS MODEL */}
      <Section id="section-business" eyebrow="04 · Business model" headline={C.business.headline} sub={C.business.sub}>
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

      {/* MARKETPLACE */}
      <Section id="section-marketplace" eyebrow="05 · Marketplace" headline={C.marketplace.headline}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {C.marketplace.sides.map((s, i) => {
            const accent = s.accent === "purple" ? NEON_PURPLE : s.accent === "cyan" ? NEON_CYAN : NEON_GREEN;
            return (
              <Reveal key={i} delay={(i % 3) * 80}>
                <div className="inv-card p-6 inv-card-hover h-full" style={{ borderColor: i === C.marketplace.sides.length - 1 ? `${accent}55` : undefined }} data-testid={`card-side-${i}`}>
                  <h4 className="num-font text-base font-bold mb-2" style={{ color: accent }}>{s.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                  {s.chips && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {s.chips.map((c, j) => (
                        <span key={j} className="text-[11px] px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-muted-foreground">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* TRACTION */}
      <Section id="section-traction" eyebrow="06 · Traction" headline={C.traction.headline} sub={C.traction.note}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
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

      {/* COST */}
      <Section id="section-cost" eyebrow="07 · Unit economics" headline={C.cost.headline}>
        <div className="grid lg:grid-cols-2 gap-6 items-center">
          <Reveal>
            <div>
              <p className="text-base sm:text-lg leading-relaxed mb-5">{C.cost.body}</p>
              <ul className="space-y-3">
                {C.cost.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: NEON_GREEN }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
                <span style={{ color: NEON_GREEN }}>Investor takeaway:</span> {C.cost.takeaway}
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="inv-card p-8 flex flex-col items-center text-center gap-4">
              <div>
                <div className="num-font font-extrabold text-5xl sm:text-6xl text-white/40">{C.cost.before}</div>
                <div className="num-font text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">Per day · before</div>
              </div>
              <ArrowDown className="w-8 h-8" style={{ color: NEON_GREEN }} />
              <div>
                <div className="num-font font-extrabold text-6xl sm:text-7xl glow-text-green" style={{ color: NEON_GREEN }}>{C.cost.after}</div>
                <div className="num-font text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: NEON_GREEN }}>Per day · idle now</div>
              </div>
              <span className="pill pill-green num-font mt-2">{C.cost.delta}</span>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* MARKET */}
      <Section id="section-market" eyebrow="08 · Market" headline={C.market.headline}>
        <div className="grid md:grid-cols-3 gap-5">
          {C.market.cards.map((c, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="inv-card p-6 inv-card-hover h-full">
                <h4 className="num-font text-sm uppercase tracking-[0.12em] mb-3" style={{ color: NEON_GREEN }}>{c.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={300}>
          <p className="mt-8 text-base sm:text-lg max-w-3xl">
            <span style={{ color: NEON_GREEN }}>Bottom line:</span> <span className="text-muted-foreground">{C.market.closer}</span>
          </p>
        </Reveal>
      </Section>

      {/* GROWTH */}
      <Section id="section-growth" eyebrow="09 · Growth" headline={C.growth.headline}>
        <div className="grid md:grid-cols-2 gap-6">
          {C.growth.columns.map((col, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="inv-card p-6 sm:p-7 h-full">
                <h3 className="num-font text-sm uppercase tracking-[0.15em] mb-4" style={{ color: i === 0 ? NEON_GREEN : NEON_PURPLE }}>{col.title}</h3>
                <ul className="space-y-3">
                  {col.bullets.map((b, j) => (
                    <li key={j} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: i === 0 ? NEON_GREEN : NEON_PURPLE }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* FUNDING ASK */}
      <Section id="section-funding-ask" eyebrow="10 · The ask" headline={C.fundingAsk.headline}>
        <div className="grid lg:grid-cols-3 gap-5">
          <Reveal>
            <div className="inv-card p-7 h-full" style={{ borderColor: `${NEON_GREEN}55`, boxShadow: `0 0 32px hsl(152 100% 44% / .08)` }}>
              <div className="num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Raise</div>
              <div className="num-font font-extrabold text-5xl glow-text-green" style={{ color: NEON_GREEN }} data-testid="text-funding-raise">{C.fundingAsk.raise}</div>
              <div className="mt-6 num-font text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">At</div>
              <div className="num-font font-bold text-2xl text-white" data-testid="text-funding-valuation">{C.fundingAsk.valuation}</div>
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed">{C.fundingAsk.structure}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="inv-card p-7 h-full">
              <div className="num-font text-xs uppercase tracking-[0.15em] mb-4" style={{ color: NEON_GREEN }}>Use of capital</div>
              <ul className="space-y-3">
                {C.fundingAsk.use.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground" data-testid={`text-use-${i}`}>
                    <span className="num-font font-bold flex-shrink-0" style={{ color: NEON_GREEN }}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="inv-card p-7 h-full">
              <div className="num-font text-xs uppercase tracking-[0.15em] mb-4" style={{ color: NEON_PURPLE }}>Why now</div>
              <ul className="space-y-3">
                {C.fundingAsk.whyNow.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground" data-testid={`text-whynow-${i}`}>
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: NEON_PURPLE }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* INVESTOR CTA */}
      <Section id="section-investor-cta" eyebrow="11 · Let's talk" headline={C.cta.headline} sub={C.cta.sub}>
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
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold text-black inline-flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${NEON_GREEN}, hsl(152 80% 36%))`, boxShadow: "0 8px 32px hsl(152 100% 44% / .35)" }}
                  data-testid="button-cta-email"
                >
                  <Mail className="w-4 h-4" /> Email the founder
                </a>
                <a
                  href={`tel:${C.meta.contactPhone}`}
                  className="h-14 px-7 rounded-xl num-font text-sm uppercase tracking-[0.2em] font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 transition"
                  data-testid="button-cta-call"
                >
                  <Phone className="w-4 h-4" /> Call directly
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
    <section id={id} className="relative px-5 py-16 sm:py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="num-font text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-3" data-testid={`text-eyebrow-${id}`}>{eyebrow}</div>
          <h2 className="num-font font-extrabold text-3xl sm:text-5xl tracking-tight text-white mb-3" data-testid={`text-headline-${id}`}>{headline}</h2>
          {sub && <p className="text-base sm:text-lg text-muted-foreground max-w-3xl mb-8" data-testid={`text-sub-${id}`}>{sub}</p>}
          {!sub && <div className="mb-8" />}
        </Reveal>
        {children}
      </div>
    </section>
  );
}
