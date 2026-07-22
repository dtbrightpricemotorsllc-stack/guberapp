import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Lock } from "lucide-react";
import logoImg from "@assets/Picsart_25-10-05_02-32-00-877_1772543526293.png";
import screenHome from "@assets/Screenshot_20260521_093856_Google_Play_Store_1779437213018.jpg";
import screenMap from "@assets/Screenshot_20260521_093844_Google_Play_Store_1779437213007.jpg";
import screenVI from "@assets/Screenshot_20260521_093921_Google_Play_Store_1779437213038.jpg";
import screenMarketplace from "@assets/Screenshot_20260522_030755_Samsung_Browser_1779437304033.jpg";

const NG = "#39FF14";
const NP = "#D100FF";
const NC = "#00e5ff";
const NA = "#f59e0b";
const BG = "#060608";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";

const SLIDES = [
  { id: "cover",    num: "01 / 10", label: "Cover" },
  { id: "problem",  num: "02 / 10", label: "Problem" },
  { id: "solution", num: "03 / 10", label: "Solution" },
  { id: "product",  num: "04 / 10", label: "Product" },
  { id: "whynow",   num: "05 / 10", label: "Why Now" },
  { id: "market",   num: "06 / 10", label: "Market" },
  { id: "model",    num: "07 / 10", label: "Business Model" },
  { id: "traction", num: "08 / 10", label: "Traction" },
  { id: "gtm",      num: "09 / 10", label: "Go-To-Market" },
  { id: "ask",      num: "10 / 10", label: "The Ask" },
];

function Eyebrow({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "#555570", marginBottom: 14, fontFamily: "DM Mono, monospace" }}>
      {children}
    </div>
  );
}

function Headline({ children, size = "3.2rem" }: { children: React.ReactNode; size?: string }) {
  return (
    <h2 style={{ fontSize: `clamp(1.8rem, 4vw, ${size})`, fontWeight: 800, color: "#fff", lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
      {children}
    </h2>
  );
}

function Tag({ children, color = NG }: { children: string; color?: string }) {
  return (
    <span style={{ background: `${color}18`, border: `1px solid ${color}44`, color, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 10px", display: "inline-block" }}>
      {children}
    </span>
  );
}

function Card({ children, accent = NG, style = {} }: { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${accent}`, borderRadius: 14, padding: "20px 24px", ...style }}>
      {children}
    </div>
  );
}

function Stat({ value, label, color = NG }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900, color, textShadow: `0 0 32px ${color}88`, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function SlideWrapper({ idx, active, children }: { idx: number; active: number; children: React.ReactNode }) {
  const visible = idx === active;
  return (
    <div
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        padding: "clamp(32px,5vw,72px) clamp(20px,6vw,80px)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : idx < active ? "translateY(-24px)" : "translateY(24px)",
        transition: "opacity 0.45s cubic-bezier(.4,0,.2,1), transform 0.45s cubic-bezier(.4,0,.2,1)",
        pointerEvents: visible ? "auto" : "none",
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 940, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Slide01Cover() {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <Tag>Private Investor Brief · 2026</Tag>
      <img src={logoImg} alt="GUBER" style={{ height: 64, objectFit: "contain", filter: "drop-shadow(0 0 20px rgba(57,255,20,0.4))", mixBlendMode: "screen" }} />
      <div>
        <div style={{ fontSize: "clamp(2.5rem,8vw,5.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.03em", textShadow: `0 0 60px ${NG}55` }}>TEAM GUBER</div>
        <div style={{ fontSize: "clamp(0.9rem,2vw,1.3rem)", color: NG, fontWeight: 700, marginTop: 10, letterSpacing: "0.06em" }}>
          More hands. More reach. More opportunities.
        </div>
      </div>
      <p style={{ fontSize: "clamp(0.85rem,1.5vw,1.1rem)", color: "#aaa", maxWidth: 560, lineHeight: 1.65 }}>
        The real-world platform that turns one person into a team. Connect with people, skills, tools, transportation, services, buyers, sellers, and local opportunities — all on one trusted network.
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        {["Guber Global LLC", "100% Founder Owned", "Live on Web + Google Play", "iOS Review Underway"].map(t => (
          <div key={t} style={{ fontSize: 11, color: "#666", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t}</div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: "10px 22px", borderRadius: 999, border: `1px solid ${NG}33`, fontSize: 11, color: "#555" }}>
        Confidential — for invited parties only
      </div>
    </div>
  );
}

function Slide02Problem() {
  const pains = [
    { icon: "⏱", title: "Limited by time, location, and reach", body: "People are limited by their own time, location, skills, transportation, money, reach, and physical availability. One person can only do so much." },
    { icon: "👻", title: "Useful resources stay invisible", body: "People with skills, vehicles, tools, time, and local knowledge have no trusted place to make themselves visible and available to those who need them." },
    { icon: "🤝", title: "No connected system", body: "Jobs, transport, inspections, marketplace, and services live on separate platforms with no shared trust layer. The right people can't find each other." },
  ];
  return (
    <div>
      <Eyebrow>Slide 02 — Problem</Eyebrow>
      <Headline>People can only do so much alone.</Headline>
      <p style={{ color: "#999", marginBottom: 32, fontSize: "clamp(0.85rem,1.4vw,1.05rem)", lineHeight: 1.65 }}>
        The need is everywhere. Useful people, skills, and resources exist nearby. The visibility and connection don't.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {pains.map(p => (
          <Card key={p.title} accent={NP}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{p.icon}</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.05rem", marginBottom: 8 }}>{p.title}</div>
            <div style={{ color: "#888", fontSize: "0.85rem", lineHeight: 1.65 }}>{p.body}</div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 28, textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "14px 28px", background: `${NP}12`, border: `1px solid ${NP}33`, borderRadius: 12, color: "#ccc", fontSize: "clamp(0.9rem,1.4vw,1.1rem)", fontStyle: "italic", lineHeight: 1.6 }}>
          "The need is everywhere. The visibility isn't."
        </div>
      </div>
    </div>
  );
}

function Slide03Solution() {
  const modules = ["Hire Help", "Find Work", "See For Me", "Marketplace", "Load Board", "Wanted Board", "Missions", "Local Discovery via JAC"];
  return (
    <div>
      <Eyebrow>Slide 03 — Solution</Eyebrow>
      <Headline>Team GUBER connects overlooked needs with overlooked value.</Headline>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div>
          <p style={{ color: "#aaa", fontSize: "clamp(0.85rem,1.3vw,1rem)", lineHeight: 1.7, marginBottom: 20 }}>
            One platform. Post a task, hire help, find work, request inspections, sell items, move vehicles, complete local missions. You don't have to do everything alone.
          </p>
          <Card accent={NG} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ fontSize: 22 }}>🤖</div>
              <div>
                <div style={{ color: NG, fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>JAC — Team GUBER Coordinator</div>
                <div style={{ color: "#888", fontSize: "0.82rem", lineHeight: 1.65 }}>
                  GUBER's AI coordinator helps users instantly figure out what they need, what they can offer, and what action to take. Guided from first tap to first dollar.
                </div>
              </div>
            </div>
          </Card>
          <div style={{ color: "#555", fontSize: "0.8rem", lineHeight: 1.6 }}>
            Built on verified identity, on-platform payments, and GPS-confirmed proof of work. Every transaction is documented. Every user builds a record.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#555", marginBottom: 12 }}>Platform Modules</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {modules.map(m => (
              <div key={m} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "#ddd" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: NG, flexShrink: 0 }} />
                {m}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide04Product() {
  const screenshots = [
    { src: screenHome, label: "Home Feed" },
    { src: screenMap, label: "Opportunity Map" },
    { src: screenVI, label: "See For Me / V&I" },
    { src: screenMarketplace, label: "Marketplace" },
  ];
  return (
    <div>
      <Eyebrow>Slide 04 — Product</Eyebrow>
      <Headline>One platform. Many actions.</Headline>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {screenshots.map(s => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#000", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", aspectRatio: "9/16" }}>
              <img src={s.src} alt={s.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ fontSize: 10, color: "#666", textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 20 }}>
        {["Hire Help / Find Work", "Load Board Transport", "See For Me Inspections", "Marketplace + Studio"].map((m, i) => (
          <Tag key={m} color={[NG, NC, NP, NA][i]}>{m}</Tag>
        ))}
      </div>
    </div>
  );
}

function Slide05WhyNow() {
  const points = [
    { icon: "📱", title: "Mobile-first everything", body: "People expect to find work, hire help, and transact entirely from their phone. That infrastructure now exists at scale." },
    { icon: "⚡", title: "Flexible work is the default", body: "The workforce has permanently shifted toward flexible, independent, project-based income. GUBER meets that demand with local real-world jobs." },
    { icon: "🤖", title: "AI-assisted search is expected", body: "Users now expect instant, guided answers. JAC delivers this from the first tap — no learning curve, no search bar confusion." },
    { icon: "🔐", title: "Trust is the missing layer", body: "Consumers and businesses demand verified identity before transacting locally. The tools to build this are now affordable and deployable." },
    { icon: "📍", title: "Local commerce is exploding", body: "On-demand local services, gig platforms, and marketplace transactions have grown by orders of magnitude since 2020. The segment is still fragmented." },
  ];
  return (
    <div>
      <Eyebrow>Slide 05 — Why Now</Eyebrow>
      <Headline>The conditions are perfect.</Headline>
      <p style={{ color: "#999", marginBottom: 28, fontSize: "clamp(0.85rem,1.4vw,1rem)", lineHeight: 1.65 }}>
        GUBER combines work, services, marketplace, transport, inspections, and AI assistance in one action platform — at the exact moment the market demands it.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {points.map(p => (
          <Card key={p.title} accent={NC} style={{ display: "flex", gap: 14 }}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{p.icon}</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>{p.title}</div>
              <div style={{ color: "#777", fontSize: "0.8rem", lineHeight: 1.6 }}>{p.body}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Slide06Market() {
  const tiers = [
    { label: "TAM", sub: "Total Addressable Market", size: "$2T+", note: "Global opportunity across labor, services, commerce, logistics, inspections", color: NG },
    { label: "SAM", sub: "Serviceable Available Market", size: "$250B+", note: "U.S. markets in gig labor, local services, transport, marketplace, inspections", color: NP },
    { label: "SOM", sub: "Near-Term Opportunity", size: "$250M+", note: "0.1% market share — city-by-city activation across multiple verticals", color: NC },
  ];
  return (
    <div>
      <Eyebrow>Slide 06 — Market Opportunity</Eyebrow>
      <Headline>A trillion-dollar intersection.</Headline>
      <p style={{ color: "#999", marginBottom: 28, fontSize: "clamp(0.85rem,1.4vw,1rem)", lineHeight: 1.65, maxWidth: 680 }}>
        GUBER targets a combined trillion-dollar-plus opportunity across labor, services, commerce, and logistics. These markets are large, proven, and underserved by trust infrastructure.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {tiers.map(t => (
          <div key={t.label} style={{ background: CARD, border: `1px solid ${t.color}33`, borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
            <Tag color={t.color}>{t.label}</Tag>
            <div style={{ fontSize: 11, color: "#555", marginTop: 8, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.sub}</div>
            <div style={{ fontSize: "clamp(2rem,4vw,3rem)", fontWeight: 900, color: t.color, textShadow: `0 0 24px ${t.color}66`, marginBottom: 10 }}>{t.size}</div>
            <div style={{ fontSize: "0.78rem", color: "#777", lineHeight: 1.6 }}>{t.note}</div>
          </div>
        ))}
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {["US Staffing ~$180B", "Global Logistics $11T+", "Gig Economy ~$450B", "Local Services $200B+", "Used Vehicle Market $800B+"].map(s => (
          <span key={s} style={{ fontSize: 11, color: "#777", padding: "4px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 999, border: `1px solid ${BORDER}` }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function Slide07Model() {
  const streams = [
    { label: "Platform Fees", color: NG, items: ["20% on every completed job", "18% for Day-1 OG members", "+3.2% payment processing"], status: "Live" },
    { label: "See For Me / V&I", color: NP, items: ["20% platform fee per inspection", "Inspector earns $40–$120+ per job", "Buyer Order documents"], status: "Live" },
    { label: "Load Board", color: NC, items: ["20% fee on completed loads", "Verified carrier network", "Escrow + proof of delivery"], status: "Live" },
    { label: "Business Tools", color: NA, items: ["$99/mo Scout Plan (20 unlocks)", "$49 one-time business verification", "Direct offer and barter rails"], status: "Live" },
    { label: "GUBER Studio", color: "#f472b6", items: ["AI media credit packs $5–$200", "Tiers: $10.99 / $37.99 / $99/mo", "Text-to-video, motion, music"], status: "Live" },
    { label: "Premium + Drops", color: "#a855f7", items: ["$4.99/mo Trust Box", "~60% margin on Cash Drop sponsorships", "Observation marketplace (20%)"], status: "Live" },
  ];
  return (
    <div>
      <Eyebrow>Slide 07 — Business Model</Eyebrow>
      <Headline>Multiple live revenue streams.</Headline>
      <p style={{ color: "#999", marginBottom: 20, fontSize: "clamp(0.8rem,1.3vw,0.95rem)", lineHeight: 1.6 }}>
        Every vertical runs on the same trust rail. One platform. Compounding revenue.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {streams.map(s => (
          <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{s.label}</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: NG, background: `${NG}15`, border: `1px solid ${NG}33`, borderRadius: 999, padding: "2px 8px", letterSpacing: "0.1em" }}>{s.status}</span>
            </div>
            {s.items.map(item => (
              <div key={item} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ fontSize: "0.75rem", color: "#888", lineHeight: 1.5 }}>{item}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide08Traction() {
  const facts = [
    "Native Android live on Google Play since April 8, 2026 — zero paid acquisition",
    "Web app live and serving real users at guberapp.com",
    "iOS App Store review process underway",
    "Stripe Connect, escrow, and payouts wired end-to-end and tested",
    "Cash Drops already paying real winners — photographed and publicly posted",
    "Founder-built platform — every revenue stream is live or one flag away",
    "National use-case potential validated beyond single-city launch",
  ];
  return (
    <div>
      <Eyebrow>Slide 08 — Traction</Eyebrow>
      <Headline>Real platform. Real users. Right now.</Headline>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 28 }}>
        <Stat value="400+" label="Total Users" color={NG} />
        <Stat value="Live" label="Web + Android" color={NP} />
        <Stat value="Active" label="Payments / Jobs" color={NC} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {facts.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: NG, marginTop: 5, flexShrink: 0 }} />
            <div style={{ fontSize: "0.82rem", color: "#aaa", lineHeight: 1.6 }}>{f}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: "14px 20px", background: `${NG}0a`, border: `1px solid ${NG}22`, borderRadius: 12 }}>
        <div style={{ color: NG, fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>Early Traction Note</div>
        <div style={{ color: "#888", fontSize: "0.8rem" }}>
          User count is currently validating. All other metrics reflect live platform behavior — not projections, not staging environments.
        </div>
      </div>
    </div>
  );
}

function Slide09GTM() {
  const steps = [
    { icon: "🏙", label: "Activate city supply first", body: "Workers, transporters, inspectors, and service providers via missions, inspection jobs, and general labor postings." },
    { icon: "🤖", label: "JAC-guided onboarding", body: "Every new user is guided instantly from signup to first action. No confusion, no search bars, no learning curve." },
    { icon: "💰", label: "Cash Drops drive installs", body: "Geo-sponsored cash rewards create organic word-of-mouth and installs. Real winners photographed and posted publicly." },
    { icon: "🏢", label: "Business partnerships", body: "Local businesses, dealerships, and property owners unlock talent and verification services via Scout Plan and V&I." },
    { icon: "🔄", label: "Referral loops compound", body: "Every completed job is a shareable proof of income. Workers recruit workers. Hirers share results." },
    { icon: "📈", label: "City by city, then national", body: "Build density before breadth. Document what works. Roll the playbook forward market by market." },
  ];
  return (
    <div>
      <Eyebrow>Slide 09 — Go-To-Market</Eyebrow>
      <Headline>City-by-city. Supply before demand.</Headline>
      <p style={{ color: "#999", marginBottom: 24, fontSize: "clamp(0.8rem,1.3vw,0.95rem)", lineHeight: 1.6 }}>
        Growth comes from community activation — not paid advertising. Start local. Prove repeatability. Expand.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {steps.map(s => (
          <Card key={s.label} accent={NA} style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem", marginBottom: 6 }}>{s.label}</div>
            <div style={{ color: "#777", fontSize: "0.78rem", lineHeight: 1.6 }}>{s.body}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Slide10Ask() {
  const allocation = [
    { label: "User Acquisition & Market Activation", pct: 35, amount: "$350K", color: NG },
    { label: "Product Development & Engineering", pct: 30, amount: "$300K", color: NP },
    { label: "Trust, Safety & Compliance", pct: 15, amount: "$150K", color: NA },
    { label: "Partnerships & Business Development", pct: 10, amount: "$100K", color: NC },
    { label: "Infrastructure & Operations", pct: 5, amount: "$50K", color: "#a855f7" },
    { label: "Reserve Capital", pct: 5, amount: "$50K", color: "#666" },
  ];
  return (
    <div>
      <Eyebrow>Slide 10 — The Ask</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
        <div>
          <Headline size="2.8rem">Seeking strategic funding and partnership.</Headline>
          <div style={{ background: `${NG}0d`, border: `1px solid ${NG}33`, borderRadius: 14, padding: "20px 22px", marginBottom: 18 }}>
            <div style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontWeight: 900, color: NG, textShadow: `0 0 24px ${NG}66` }}>$1,000,000</div>
            <div style={{ color: "#aaa", fontSize: "0.85rem", marginTop: 4 }}>Raise target over 18 months</div>
            <div style={{ color: "#666", fontSize: "0.78rem", marginTop: 8 }}>$15M early-stage valuation framework. Capital goes to growth — not engineering. The product is already built and live.</div>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#777", lineHeight: 1.7, marginBottom: 18 }}>
            Help finish iOS launch and polish, activate users into paid transactions, hire technical support, fund marketing and city launches, build business partnerships, and scale GUBER from early platform into national action marketplace.
          </div>
          <div style={{ padding: "16px 20px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>Dimetris Bowden</div>
            <div style={{ color: "#666", fontSize: "0.78rem" }}>Founder and CEO · 100% owner, Guber Global LLC</div>
            <div style={{ color: NG, fontSize: "0.8rem", marginTop: 8 }}>Guberapp.global@gmail.com</div>
            <div style={{ color: "#888", fontSize: "0.78rem" }}>(251) 284-9412</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14 }}>Use of Funds</div>
          {allocation.map(a => (
            <div key={a.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: "0.78rem", color: "#ccc" }}>{a.label}</div>
                <div style={{ fontSize: "0.78rem", color: a.color, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 8 }}>{a.amount}</div>
              </div>
              <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${a.pct}%`, background: a.color, borderRadius: 999, boxShadow: `0 0 8px ${a.color}88` }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 20, padding: "14px 16px", background: `${NP}0d`, border: `1px solid ${NP}33`, borderRadius: 10, textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>
              "GUBER is not just another app."
            </div>
            <div style={{ color: "#888", fontSize: "0.8rem" }}>It is a real-world action engine.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SLIDE_COMPONENTS = [
  Slide01Cover, Slide02Problem, Slide03Solution, Slide04Product,
  Slide05WhyNow, Slide06Market, Slide07Model, Slide08Traction,
  Slide09GTM, Slide10Ask,
];

function LockScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function attempt(code: string) {
    setChecking(true);
    setError(false);
    try {
      const r = await fetch(`/api/pitch-deck/verify?token=${encodeURIComponent(code)}`);
      if (r.ok) {
        sessionStorage.setItem("deck_token", code);
        window.location.replace(`/pitch-deck?token=${encodeURIComponent(code)}`);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 24 }}>
      <img src={logoImg} alt="GUBER" style={{ height: 52, objectFit: "contain", filter: "drop-shadow(0 0 16px rgba(57,255,20,0.35))", mixBlendMode: "screen", marginBottom: 32 }} />
      <div style={{ width: "100%", maxWidth: 380, background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 18, padding: "36px 32px", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `rgba(57,255,20,0.08)`, border: `1px solid rgba(57,255,20,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Lock size={20} color={NG} />
        </div>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", marginBottom: 6 }}>Private Investor Brief</div>
        <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: 28, lineHeight: 1.6 }}>Enter your access code to view the GUBER pitch deck.</div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Access code"
          onKeyDown={e => e.key === "Enter" && attempt(inputRef.current?.value.trim() || "")}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${error ? "#ff4444" : "rgba(255,255,255,0.1)"}`, background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 15, outline: "none", marginBottom: 12, textAlign: "center", letterSpacing: "0.08em" }}
          autoFocus
        />
        {error && <div style={{ color: "#ff6666", fontSize: "0.8rem", marginBottom: 12 }}>Invalid access code. Try again.</div>}
        <button
          onClick={() => attempt(inputRef.current?.value.trim() || "")}
          disabled={checking}
          style={{ width: "100%", padding: "12px", borderRadius: 10, background: NG, color: "#000", fontWeight: 800, fontSize: 14, border: "none", cursor: checking ? "wait" : "pointer", opacity: checking ? 0.7 : 1 }}
        >
          {checking ? "Checking…" : "View Deck"}
        </button>
      </div>
      <div style={{ marginTop: 24, fontSize: 11, color: "#333" }}>Confidential — for invited parties only</div>
    </div>
  );
}

export default function PitchDeck() {
  const [active, setActive] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const total = SLIDES.length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token") || sessionStorage.getItem("deck_token") || "";
    if (!urlToken) { setAuthChecked(true); return; }
    fetch(`/api/pitch-deck/verify?token=${encodeURIComponent(urlToken)}`)
      .then(r => {
        if (r.ok) { sessionStorage.setItem("deck_token", urlToken); setToken(urlToken); }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const prev = useCallback(() => setActive(a => Math.max(0, a - 1)), []);
  const next = useCallback(() => setActive(a => Math.min(total - 1, a + 1)), [total]);

  useEffect(() => {
    if (!token) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, token]);

  if (!authChecked) return <div style={{ background: BG, minHeight: "100vh" }} />;
  if (!token) return <LockScreen />;

  const dlUrl = (path: string) => `/api/pitch-deck/${path}?token=${encodeURIComponent(token)}`;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: "#e8e8f0", fontFamily: "Inter, system-ui, sans-serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        @media print {
          @page { size: 16in 9in landscape; margin: 0; }
          .pitch-no-print { display: none !important; }
          .pitch-slide-wrapper { break-after: page; height: 9in; overflow: hidden; }
        }
      `}</style>

      {/* Top bar */}
      <div className="pitch-no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", background: "rgba(6,6,8,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoImg} alt="GUBER" style={{ height: 28, objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(57,255,20,0.3))", mixBlendMode: "screen" }} />
          <span style={{ fontSize: 11, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Investor Brief · 2026</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href={dlUrl("pdf")} target="_blank" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.04)", color: "#ccc", fontSize: 12, textDecoration: "none", cursor: "pointer" }}>
            <Download size={13} /> PDF
          </a>
          <a href={dlUrl("pptx")} target="_blank" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1px solid ${NG}44`, background: `${NG}10`, color: NG, fontSize: 12, textDecoration: "none", cursor: "pointer", fontWeight: 700 }}>
            <Download size={13} /> PPTX
          </a>
          <a href={dlUrl("one-pager")} target="_blank" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1px solid ${NP}44`, background: `${NP}10`, color: NP, fontSize: 12, textDecoration: "none", cursor: "pointer" }}>
            <ExternalLink size={13} /> One-Pager
          </a>
        </div>
      </div>

      {/* Slide viewport */}
      <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
        {SLIDE_COMPONENTS.map((SlideComp, i) => (
          <SlideWrapper key={i} idx={i} active={active}>
            <div style={{ paddingTop: "clamp(60px, 8vh, 72px)" }}>
              <SlideComp />
            </div>
          </SlideWrapper>
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="pitch-no-print" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "rgba(6,6,8,0.92)", backdropFilter: "blur(12px)", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={prev} disabled={active === 0} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: active === 0 ? "#333" : "#ccc", cursor: active === 0 ? "not-allowed" : "pointer", fontSize: 13 }}>
          <ChevronLeft size={15} /> Prev
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {SLIDES.map((s, i) => (
            <button key={i} onClick={() => setActive(i)} title={s.label}
              style={{ width: i === active ? 28 : 8, height: 8, borderRadius: 999, background: i === active ? NG : "#333", border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0 }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#444", fontFamily: "DM Mono, monospace", letterSpacing: "0.1em" }}>
            {SLIDES[active].num} — {SLIDES[active].label}
          </span>
          <button onClick={next} disabled={active === total - 1} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${active === total - 1 ? BORDER : NG + "55"}`, background: active === total - 1 ? "transparent" : `${NG}15`, color: active === total - 1 ? "#333" : NG, cursor: active === total - 1 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
