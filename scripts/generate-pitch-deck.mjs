#!/usr/bin/env node
/**
 * GUBER Pitch Deck Generator
 * Generates PPTX and PDF exports into /exports/
 * Run: node scripts/generate-pitch-deck.mjs
 */
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EXPORTS = resolve(ROOT, "exports");
if (!existsSync(EXPORTS)) mkdirSync(EXPORTS, { recursive: true });

const NG = "39FF14";   // neon green
const NP = "D100FF";   // neon purple
const NC = "00E5FF";   // neon cyan
const NA = "F59E0B";   // amber
const BG = "060608";   // background
const DARK = "0D0D12"; // slide bg

// ─── PPTX ─────────────────────────────────────────────────────────────────────

async function generatePptx() {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();

  prs.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

  const FONT = "Calibri";

  function slide(titleText, eyebrowText) {
    const s = prs.addSlide();
    s.background = { color: DARK };
    if (eyebrowText) {
      s.addText(eyebrowText.toUpperCase(), {
        x: 0.5, y: 0.22, w: 12, h: 0.2,
        fontSize: 8, color: "555570", fontFace: FONT, charSpacing: 3,
      });
    }
    if (titleText) {
      s.addText(titleText, {
        x: 0.5, y: 0.52, w: 12, h: 0.55,
        fontSize: 26, bold: true, color: "FFFFFF", fontFace: FONT,
      });
      s.addShape(prs.ShapeType.rect, { x: 0.5, y: 1.12, w: 1.2, h: 0.04, fill: { color: NG }, line: { color: NG } });
    }
    return s;
  }

  function bullet(s, text, x, y, w, color = "AAAAAA", size = 11) {
    s.addText(text, { x, y, w, h: 0.3, fontSize: size, color, fontFace: FONT, wrap: true });
  }

  function card(s, x, y, w, h, accentColor = NG) {
    s.addShape(prs.ShapeType.rect, { x, y, w, h, fill: { color: "0F0F16" }, line: { color: "1A1A28", pt: 1 } });
    s.addShape(prs.ShapeType.rect, { x, y, w: 0.04, h, fill: { color: accentColor }, line: { color: accentColor } });
  }

  // Slide 1 — Cover
  {
    const s = prs.addSlide();
    s.background = { color: BG };
    s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: BG }, line: { color: BG } });
    s.addText("PRIVATE INVESTOR BRIEF · 2026", { x: 1, y: 1.4, w: 11, h: 0.3, fontSize: 9, color: "444455", charSpacing: 4, align: "center", fontFace: FONT });
    s.addText("GUBER", { x: 1, y: 1.9, w: 11, h: 1.8, fontSize: 88, bold: true, color: "FFFFFF", align: "center", fontFace: FONT });
    s.addText('"You Name It. GUBER Gets It Done."', { x: 1, y: 3.7, w: 11, h: 0.5, fontSize: 18, color: NG, bold: true, align: "center", fontFace: FONT });
    s.addText("Action marketplace for real-world work, services, local tasks, inspections, transport, and opportunity.", { x: 2, y: 4.35, w: 9.33, h: 0.7, fontSize: 12, color: "888899", align: "center", fontFace: FONT });
    s.addShape(prs.ShapeType.rect, { x: 4.5, y: 5.3, w: 4.33, h: 0.04, fill: { color: "1A1A28" }, line: { color: "1A1A28" } });
    s.addText("Guber Global LLC · 100% Founder Owned · Live on Web + Google Play · Confidential", { x: 1, y: 5.5, w: 11, h: 0.3, fontSize: 8, color: "333344", align: "center", charSpacing: 2, fontFace: FONT });
  }

  // Slide 2 — Problem
  {
    const s = slide("The problem is everywhere.", "Slide 02 — Problem");
    s.addText("People need things done now, but the path from need to action is broken.", { x: 0.5, y: 1.35, w: 12, h: 0.3, fontSize: 12, color: "888899", fontFace: FONT });
    const pains = [
      { t: "Help is fragmented", b: "Job boards, classifieds, social media, random referrals — nothing connects need to action fast.", c: NP },
      { t: "Workers can't find fast income", b: "People with skills have no trusted centralized place to find real paid local work right now.", c: NP },
      { t: "No trusted middle ground", b: "Local cash transactions have zero verification, zero accountability, zero recourse.", c: NP },
    ];
    pains.forEach((p, i) => {
      const x = 0.5 + i * 4.3;
      card(s, x, 1.9, 4.1, 2.2, p.c);
      s.addText(p.t, { x: x + 0.2, y: 2.05, w: 3.7, h: 0.35, fontSize: 13, bold: true, color: "FFFFFF", fontFace: FONT });
      s.addText(p.b, { x: x + 0.2, y: 2.55, w: 3.7, h: 1.3, fontSize: 10, color: "888888", fontFace: FONT, wrap: true });
    });
    s.addText('"The need is everywhere. The visibility isn\'t."', { x: 1.5, y: 4.35, w: 10, h: 0.5, fontSize: 14, color: "CCCCCC", align: "center", italic: true, fontFace: FONT });
  }

  // Slide 3 — Solution
  {
    const s = slide("GUBER turns needs into action.", "Slide 03 — Solution");
    s.addText("One platform. Post a task, hire help, find work, request inspections, sell items, move vehicles, complete local missions.", { x: 0.5, y: 1.35, w: 9, h: 0.45, fontSize: 11, color: "888899", fontFace: FONT, wrap: true });
    card(s, 0.5, 2.0, 6.5, 1.6, NG);
    s.addText("JAC — Job Assistance Coordinator", { x: 0.7, y: 2.15, w: 6.1, h: 0.3, fontSize: 13, bold: true, color: NG, fontFace: FONT });
    s.addText("GUBER's AI assistant helps users instantly figure out what to post, where to go, and what action to take. Guided from first tap to first dollar.", { x: 0.7, y: 2.55, w: 6.1, h: 0.9, fontSize: 10, color: "AAAAAA", fontFace: FONT, wrap: true });
    const mods = ["Hire Help", "Find Work", "See For Me", "Marketplace", "Load Board", "Wanted Board", "Missions", "Local Discovery via JAC"];
    s.addText("Platform Modules", { x: 7.3, y: 1.9, w: 5.5, h: 0.25, fontSize: 9, color: "555570", charSpacing: 2, fontFace: FONT });
    mods.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      s.addText(`• ${m}`, { x: 7.3 + col * 2.7, y: 2.25 + row * 0.5, w: 2.5, h: 0.4, fontSize: 11, color: "DDDDDD", fontFace: FONT });
    });
  }

  // Slide 4 — Product
  {
    const s = slide("One platform. Many actions.", "Slide 04 — Product");
    const labels = ["Home Feed", "Opportunity Map", "See For Me / V&I", "Marketplace"];
    labels.forEach((l, i) => {
      const x = 0.5 + i * 3.2;
      s.addShape(prs.ShapeType.rect, { x, y: 1.5, w: 3.0, h: 4.2, fill: { color: "0A0A10" }, line: { color: "1A1A28", pt: 1 }, rounding: 0.1 });
      s.addText("[App Screen]", { x, y: 2.8, w: 3.0, h: 0.4, fontSize: 10, color: "333344", align: "center", fontFace: FONT });
      s.addText(l, { x, y: 5.8, w: 3.0, h: 0.3, fontSize: 9, color: "666677", align: "center", charSpacing: 1, fontFace: FONT });
    });
    const tags = ["Hire Help / Find Work", "Load Board Transport", "See For Me Inspections", "Marketplace + Studio"];
    const cols = [NG, NC, NP, NA];
    tags.forEach((t, i) => {
      s.addShape(prs.ShapeType.roundRect, { x: 0.5 + i * 3.2, y: 6.3, w: 2.9, h: 0.35, fill: { color: `${cols[i]}18` }, line: { color: `${cols[i]}44`, pt: 1 }, rounding: 0.1 });
      s.addText(t, { x: 0.5 + i * 3.2, y: 6.35, w: 2.9, h: 0.28, fontSize: 9, color: cols[i], align: "center", bold: true, fontFace: FONT });
    });
  }

  // Slide 5 — Why Now
  {
    const s = slide("The conditions are perfect.", "Slide 05 — Why Now");
    s.addText("GUBER combines work, services, marketplace, transport, inspections, and AI at the exact moment the market demands it.", { x: 0.5, y: 1.35, w: 12, h: 0.3, fontSize: 11, color: "888899", fontFace: FONT });
    const pts = [
      ["📱 Mobile-first everything", "People expect to transact entirely from their phone."],
      ["⚡ Flexible work is the default", "The workforce has permanently shifted to flexible, independent income."],
      ["🤖 AI-assisted search is expected", "Users expect instant, guided answers. JAC delivers from the first tap."],
      ["🔐 Trust is the missing layer", "Consumers demand verified identity before local transactions."],
      ["📍 Local commerce is exploding", "On-demand local services have grown exponentially since 2020."],
    ];
    pts.forEach(([t, b], i) => {
      const col = i % 2 === 0 ? 0 : 1;
      const row = Math.floor(i / 2);
      const x = col === 0 ? 0.5 : 7.0;
      const y = 1.85 + row * 1.55;
      if (i === 4) {
        card(s, 0.5, y, 12.3, 1.25, NC);
      } else {
        card(s, x, y, 6.2, 1.25, NC);
      }
      s.addText(t, { x: x + 0.2, y: y + 0.12, w: 5.8, h: 0.35, fontSize: 12, bold: true, color: "FFFFFF", fontFace: FONT });
      s.addText(b, { x: x + 0.2, y: y + 0.52, w: 5.8, h: 0.55, fontSize: 10, color: "888888", fontFace: FONT, wrap: true });
    });
  }

  // Slide 6 — Market
  {
    const s = slide("A trillion-dollar intersection.", "Slide 06 — Market Opportunity");
    s.addText("GUBER targets a combined trillion-dollar-plus opportunity across labor, services, commerce, and logistics.", { x: 0.5, y: 1.35, w: 12, h: 0.3, fontSize: 11, color: "888899", fontFace: FONT });
    const tiers = [
      { l: "TAM", sub: "Total Addressable Market", size: "$2T+", note: "Global: gig labor, logistics, marketplace, inspections", c: NG },
      { l: "SAM", sub: "Serviceable Available Market", size: "$250B+", note: "U.S.: local workers, transport, marketplace transactions", c: NP },
      { l: "SOM", sub: "Near-Term Opportunity", size: "$250M+", note: "0.1% market share — city-by-city activation", c: NC },
    ];
    tiers.forEach((t, i) => {
      const x = 0.5 + i * 4.3;
      s.addShape(prs.ShapeType.rect, { x, y: 1.85, w: 4.1, h: 3.5, fill: { color: "0F0F16" }, line: { color: `${t.c}44`, pt: 1 } });
      s.addShape(prs.ShapeType.roundRect, { x: x + 0.8, y: 2.0, w: 2.5, h: 0.35, fill: { color: `${t.c}18` }, line: { color: `${t.c}44`, pt: 1 }, rounding: 0.1 });
      s.addText(t.l, { x: x + 0.8, y: 2.04, w: 2.5, h: 0.28, fontSize: 10, bold: true, color: t.c, align: "center", fontFace: FONT });
      s.addText(t.sub, { x, y: 2.48, w: 4.1, h: 0.28, fontSize: 9, color: "555570", align: "center", charSpacing: 1, fontFace: FONT });
      s.addText(t.size, { x, y: 2.85, w: 4.1, h: 0.8, fontSize: 40, bold: true, color: t.c, align: "center", fontFace: FONT });
      s.addText(t.note, { x: x + 0.15, y: 3.8, w: 3.8, h: 1.2, fontSize: 10, color: "777788", align: "center", fontFace: FONT, wrap: true });
    });
    const subs = ["US Staffing ~$180B", "Global Logistics $11T+", "Gig Economy ~$450B", "Local Services $200B+"];
    subs.forEach((sub, i) => {
      s.addShape(prs.ShapeType.roundRect, { x: 0.5 + i * 3.2, y: 5.6, w: 3.0, h: 0.38, fill: { color: "0D0D16" }, line: { color: "1A1A28", pt: 1 }, rounding: 0.1 });
      s.addText(sub, { x: 0.5 + i * 3.2, y: 5.65, w: 3.0, h: 0.3, fontSize: 9, color: "777788", align: "center", fontFace: FONT });
    });
  }

  // Slide 7 — Business Model
  {
    const s = slide("Multiple live revenue streams.", "Slide 07 — Business Model");
    s.addText("Every vertical runs on the same trust rail. One platform. Compounding revenue.", { x: 0.5, y: 1.35, w: 12, h: 0.25, fontSize: 11, color: "888899", fontFace: FONT });
    const streams = [
      { l: "Platform Fees", c: NG, items: ["20% on every completed job", "18% for Day-1 OG members", "+3.2% payment processing"] },
      { l: "See For Me / V&I", c: NP, items: ["20% platform fee per inspection", "Inspector earns $40–$120+ per job", "Buyer Order documents"] },
      { l: "Load Board", c: NC, items: ["20% fee on completed loads", "Verified carrier network", "Escrow + proof of delivery"] },
      { l: "Business Tools", c: NA, items: ["$99/mo Scout Plan (20 unlocks)", "$49 one-time business verification", "Direct offer and barter rails"] },
      { l: "GUBER Studio", c: "F472B6", items: ["AI media credit packs $5–$200", "Tiers: $10.99 / $37.99 / $99/mo", "Text-to-video, motion, music"] },
      { l: "Premium + Drops", c: "A855F7", items: ["$4.99/mo Trust Box", "~60% margin on Cash Drop sponsorships", "Observation marketplace (20%)"] },
    ];
    streams.forEach((str, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.5 + col * 4.3;
      const y = 1.75 + row * 2.4;
      card(s, x, y, 4.1, 2.2, str.c);
      s.addShape(prs.ShapeType.roundRect, { x: x + 0.15, y: y + 0.12, w: 2.0, h: 0.3, fill: { color: "0F2E0A" }, line: { color: "123909", pt: 1 }, rounding: 0.1 });
      s.addText("LIVE", { x: x + 0.15, y: y + 0.14, w: 2.0, h: 0.25, fontSize: 8, bold: true, color: NG, align: "center", fontFace: FONT });
      s.addText(str.l, { x: x + 0.15, y: y + 0.52, w: 3.8, h: 0.3, fontSize: 12, bold: true, color: "FFFFFF", fontFace: FONT });
      str.items.forEach((item, j) => {
        s.addText(`• ${item}`, { x: x + 0.15, y: y + 0.9 + j * 0.38, w: 3.8, h: 0.35, fontSize: 10, color: "888888", fontFace: FONT });
      });
    });
  }

  // Slide 8 — Traction
  {
    const s = slide("Real platform. Real users. Right now.", "Slide 08 — Traction");
    const stats = [
      { v: "400+", l: "Total Users", c: NG },
      { v: "Live", l: "Web + Android", c: NP },
      { v: "Active", l: "Payments / Jobs", c: NC },
    ];
    stats.forEach((st, i) => {
      const x = 0.5 + i * 4.3;
      s.addShape(prs.ShapeType.rect, { x, y: 1.5, w: 4.1, h: 1.8, fill: { color: `${st.c}10` }, line: { color: `${st.c}33`, pt: 1 } });
      s.addText(st.v, { x, y: 1.7, w: 4.1, h: 1.0, fontSize: 48, bold: true, color: st.c, align: "center", fontFace: FONT });
      s.addText(st.l.toUpperCase(), { x, y: 2.8, w: 4.1, h: 0.3, fontSize: 9, color: "777788", align: "center", charSpacing: 2, fontFace: FONT });
    });
    const facts = [
      "Native Android live on Google Play since April 8, 2026 — zero paid acquisition",
      "Web app live and serving real users at guberapp.com",
      "iOS App Store review process underway",
      "Stripe Connect, escrow, and payouts wired end-to-end and tested",
      "Cash Drops already paying real winners — photographed and posted publicly",
      "Founder-built platform — every revenue stream is live or one flag away",
    ];
    facts.forEach((f, i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      s.addText(`• ${f}`, { x: 0.5 + col * 6.5, y: 3.55 + row * 0.55, w: 6.3, h: 0.45, fontSize: 10, color: "AAAAAA", fontFace: FONT, wrap: true });
    });
    s.addShape(prs.ShapeType.rect, { x: 0.5, y: 6.25, w: 12.3, h: 0.65, fill: { color: "080F06" }, line: { color: `${NG}22`, pt: 1 } });
    s.addText("Early Traction Note: User count is currently validating. All other metrics reflect live platform behavior — not projections.", { x: 0.7, y: 6.32, w: 11.9, h: 0.5, fontSize: 9, color: "888888", fontFace: FONT });
  }

  // Slide 9 — GTM
  {
    const s = slide("City-by-city. Supply before demand.", "Slide 09 — Go-To-Market");
    s.addText("Growth comes from community activation — not paid advertising. Start local. Prove repeatability. Expand.", { x: 0.5, y: 1.35, w: 12, h: 0.3, fontSize: 11, color: "888899", fontFace: FONT });
    const steps = [
      { icon: "🏙", l: "Activate city supply first", b: "Workers, transporters, inspectors, and service providers via missions and local jobs." },
      { icon: "🤖", l: "JAC-guided onboarding", b: "Every new user guided from signup to first action. No confusion, no learning curve." },
      { icon: "💰", l: "Cash Drops drive installs", b: "Geo-sponsored cash rewards create organic word-of-mouth and real installs." },
      { icon: "🏢", l: "Business partnerships", b: "Local businesses unlock talent and verification via Scout Plan and V&I." },
      { icon: "🔄", l: "Referral loops compound", b: "Every completed job is shareable proof of income. Workers recruit workers." },
      { icon: "📈", l: "City by city, then national", b: "Build density before breadth. Document what works. Roll the playbook forward." },
    ];
    steps.forEach((st, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.5 + col * 4.3;
      const y = 1.85 + row * 2.35;
      card(s, x, y, 4.1, 2.15, NA);
      s.addText(st.icon, { x: x + 0.2, y: y + 0.15, w: 0.6, h: 0.5, fontSize: 18, fontFace: FONT });
      s.addText(st.l, { x: x + 0.2, y: y + 0.6, w: 3.7, h: 0.35, fontSize: 12, bold: true, color: "FFFFFF", fontFace: FONT });
      s.addText(st.b, { x: x + 0.2, y: y + 1.02, w: 3.7, h: 0.85, fontSize: 10, color: "888888", fontFace: FONT, wrap: true });
    });
  }

  // Slide 10 — Ask
  {
    const s = slide("Seeking strategic funding and partnership.", "Slide 10 — The Ask");
    s.addShape(prs.ShapeType.rect, { x: 0.5, y: 1.5, w: 5.8, h: 2.0, fill: { color: "091508" }, line: { color: "123909", pt: 1 } });
    s.addText("$1,000,000", { x: 0.5, y: 1.65, w: 5.8, h: 1.0, fontSize: 44, bold: true, color: NG, align: "center", fontFace: FONT });
    s.addText("Raise target over 18 months", { x: 0.5, y: 2.7, w: 5.8, h: 0.3, fontSize: 11, color: "AAAAAA", align: "center", fontFace: FONT });
    s.addText("$15M early-stage valuation framework. Capital goes to growth — not engineering. The product is already built and live.", { x: 0.5, y: 3.65, w: 5.8, h: 0.8, fontSize: 10, color: "777788", fontFace: FONT, wrap: true });
    const alloc = [
      { l: "User Acquisition & Activation", p: 35, a: "$350K", c: NG },
      { l: "Product Development", p: 30, a: "$300K", c: NP },
      { l: "Trust, Safety & Compliance", p: 15, a: "$150K", c: NA },
      { l: "Partnerships & Biz Dev", p: 10, a: "$100K", c: NC },
      { l: "Infrastructure & Operations", p: 5, a: "$50K", c: "A855F7" },
      { l: "Reserve Capital", p: 5, a: "$50K", c: "666666" },
    ];
    s.addText("USE OF FUNDS", { x: 6.8, y: 1.5, w: 6.0, h: 0.25, fontSize: 9, color: "555570", charSpacing: 2, fontFace: FONT });
    alloc.forEach((a, i) => {
      const y = 1.85 + i * 0.6;
      s.addText(a.l, { x: 6.8, y, w: 4.2, h: 0.28, fontSize: 10, color: "CCCCCC", fontFace: FONT });
      s.addText(a.a, { x: 11.2, y, w: 1.6, h: 0.28, fontSize: 10, bold: true, color: a.c, align: "right", fontFace: FONT });
      s.addShape(prs.ShapeType.rect, { x: 6.8, y: y + 0.32, w: 6.0, h: 0.1, fill: { color: "111118" }, line: { color: "111118" } });
      s.addShape(prs.ShapeType.rect, { x: 6.8, y: y + 0.32, w: 6.0 * (a.p / 100), h: 0.1, fill: { color: a.c }, line: { color: a.c } });
    });
    s.addShape(prs.ShapeType.rect, { x: 6.8, y: 5.55, w: 6.0, h: 1.45, fill: { color: "1A001C" }, line: { color: "37003D", pt: 1 } });
    s.addText('"GUBER is not just another app. It is a real-world action engine."', { x: 6.9, y: 5.7, w: 5.8, h: 0.6, fontSize: 12, italic: true, color: "DDDDEE", align: "center", fontFace: FONT });
    s.addText("Dimetris Bowden · Founder & CEO · Guberapp.global@gmail.com · (251) 284-9412", { x: 6.9, y: 6.45, w: 5.8, h: 0.3, fontSize: 9, color: "666677", align: "center", fontFace: FONT });
  }

  const pptxPath = resolve(EXPORTS, "GUBER_Official_Pitch_Deck.pptx");
  await prs.writeFile({ fileName: pptxPath });
  console.log("✓ PPTX written:", pptxPath);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function generatePdf() {
  const PDFDocument = (await import("pdfkit")).default;
  const W = 1280, H = 720;

  function writePdf(outPath, pages) {
    return new Promise((res, rej) => {
      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false });
      const stream = createWriteStream(outPath);
      doc.pipe(stream);
      stream.on("finish", res);
      stream.on("error", rej);

      pages(doc, W, H);
      doc.end();
    });
  }

  function bg(doc, color = "#060608") {
    doc.addPage();
    doc.rect(0, 0, W, H).fill(color);
  }
  function eyebrow(doc, text, y = 36) {
    doc.font("Helvetica").fontSize(8).fillColor("#555570").text(text.toUpperCase(), 64, y, { characterSpacing: 2 });
  }
  function headline(doc, text, y = 68) {
    doc.font("Helvetica-Bold").fontSize(38).fillColor("#FFFFFF").text(text, 64, y, { width: W - 128 });
  }
  function rule(doc, y) {
    doc.rect(64, y, 80, 3).fill("#" + NG);
  }
  function body(doc, text, x, y, w, color = "#888899", size = 11) {
    doc.font("Helvetica").fontSize(size).fillColor(color).text(text, x, y, { width: w, lineGap: 3 });
  }
  function cardBg(doc, x, y, w, h, accent = "#" + NG) {
    doc.rect(x, y, w, h).fill("#0F0F16");
    doc.rect(x, y, 4, h).fill(accent);
  }

  const pdfPath = resolve(EXPORTS, "GUBER_Official_Pitch_Deck.pdf");
  await writePdf(pdfPath, (doc) => {
    // Slide 1 — Cover
    bg(doc, "#060608");
    doc.font("Helvetica").fontSize(9).fillColor("#444455").text("PRIVATE INVESTOR BRIEF · 2026", 0, 140, { align: "center", width: W, characterSpacing: 3 });
    doc.font("Helvetica-Bold").fontSize(110).fillColor("#FFFFFF").text("GUBER", 0, 185, { align: "center", width: W });
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#" + NG).text('"You Name It. GUBER Gets It Done."', 0, 350, { align: "center", width: W });
    doc.font("Helvetica").fontSize(14).fillColor("#888899").text("Action marketplace for real-world work, services, local tasks, inspections, transport, and opportunity.", 200, 400, { align: "center", width: W - 400, lineGap: 4 });
    doc.font("Helvetica").fontSize(9).fillColor("#333344").text("Guber Global LLC  ·  100% Founder Owned  ·  Live on Web + Google Play  ·  Confidential", 0, 620, { align: "center", width: W, characterSpacing: 1 });

    // Slide 2 — Problem
    bg(doc);
    eyebrow(doc, "Slide 02 — Problem");
    headline(doc, "The problem is everywhere.");
    rule(doc, 130);
    body(doc, "People need things done now, but the path from need to action is broken across every existing platform.", 64, 150, W - 128, "#888899");
    const pains = [
      { t: "Help is fragmented", b: "Job boards, classifieds, social — nothing connects need to action fast.", c: "#" + NP },
      { t: "Workers can't find fast income", b: "People with skills have no trusted centralized place for real local paid work.", c: "#" + NP },
      { t: "No trusted middle ground", b: "Local cash transactions have zero verification and zero recourse.", c: "#" + NP },
    ];
    pains.forEach((p, i) => {
      const x = 64 + i * 388;
      cardBg(doc, x, 210, 368, 340, p.c);
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF").text(p.t, x + 20, 240, { width: 330 });
      body(doc, p.b, x + 20, 285, 330, "#888888");
    });
    doc.font("Helvetica-Oblique").fontSize(15).fillColor("#CCCCCC").text('"The need is everywhere. The visibility isn\'t."', 0, 580, { align: "center", width: W });

    // Slide 3 — Solution
    bg(doc);
    eyebrow(doc, "Slide 03 — Solution");
    headline(doc, "GUBER turns needs into action.");
    rule(doc, 130);
    cardBg(doc, 64, 180, 560, 200, "#" + NG);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#" + NG).text("JAC — Job Assistance Coordinator", 88, 205, { width: 520 });
    body(doc, "GUBER's AI assistant helps users instantly figure out what to post, where to go, and what action to take. Guided from first tap to first dollar.", 88, 245, 520, "#AAAAAA");
    body(doc, "One platform. Post a task, hire help, find work, request inspections, sell items, move vehicles, complete local missions.", 64, 400, 560, "#888899");
    const mods = ["Hire Help", "Find Work", "See For Me", "Marketplace", "Load Board", "Wanted Board", "Missions", "Local Discovery via JAC"];
    doc.font("Helvetica").fontSize(9).fillColor("#555570").text("PLATFORM MODULES", 680, 180, { characterSpacing: 2 });
    mods.forEach((m, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      doc.rect(680 + col * 290, 210 + row * 55, 275, 44).fill("#0F0F16");
      doc.circle(696 + col * 290, 236 + row * 55, 3).fill("#" + NG);
      doc.font("Helvetica").fontSize(11).fillColor("#DDDDDD").text(m, 708 + col * 290, 229 + row * 55, { width: 240 });
    });

    // Slide 4 — Product
    bg(doc);
    eyebrow(doc, "Slide 04 — Product");
    headline(doc, "One platform. Many actions.");
    rule(doc, 130);
    ["Home Feed", "Opportunity Map", "See For Me / V&I", "Marketplace"].forEach((l, i) => {
      const x = 64 + i * 295;
      doc.rect(x, 160, 278, 470).fill("#0A0A10");
      doc.font("Helvetica").fontSize(9).fillColor("#666677").text(l, x, 645, { align: "center", width: 278, characterSpacing: 1 });
    });
    ["Hire Help / Find Work", "Load Board Transport", "See For Me Inspections", "Marketplace + Studio"].forEach((t, i) => {
      const c = ["#" + NG, "#" + NC, "#" + NP, "#" + NA][i];
      doc.roundedRect(64 + i * 295, 665, 278, 32, 8).fill(c + "18");
      doc.font("Helvetica-Bold").fontSize(9).fillColor(c).text(t, 64 + i * 295, 674, { align: "center", width: 278 });
    });

    // Slide 5 — Why Now
    bg(doc);
    eyebrow(doc, "Slide 05 — Why Now");
    headline(doc, "The conditions are perfect.");
    rule(doc, 130);
    [
      ["📱 Mobile-first everything", "People expect to transact entirely from their phone."],
      ["⚡ Flexible work is the default", "The workforce has permanently shifted to flexible income."],
      ["🤖 AI-assisted search is expected", "Users expect instant guided answers. JAC delivers from first tap."],
      ["🔐 Trust is the missing layer", "Consumers demand verified identity before local transactions."],
      ["📍 Local commerce is exploding", "On-demand local services have grown exponentially since 2020."],
    ].forEach(([t, b], i) => {
      const col = i < 3 ? 0 : 1;
      const row = i < 3 ? i : i - 3;
      const x = col === 0 ? 64 : 704;
      const y = 170 + row * 170;
      cardBg(doc, x, y, 576, 148, "#" + NC);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF").text(t, x + 18, y + 18, { width: 540 });
      body(doc, b, x + 18, y + 58, 540, "#888888");
    });

    // Slide 6 — Market
    bg(doc);
    eyebrow(doc, "Slide 06 — Market Opportunity");
    headline(doc, "A trillion-dollar intersection.");
    rule(doc, 130);
    body(doc, "GUBER targets a combined trillion-dollar-plus opportunity across labor, services, commerce, and logistics.", 64, 152, W - 128, "#888899");
    [
      { l: "TAM", sub: "Total Addressable Market", size: "$2T+", note: "Global opportunity", c: "#" + NG },
      { l: "SAM", sub: "Serviceable Available Market", size: "$250B+", note: "U.S. opportunity", c: "#" + NP },
      { l: "SOM", sub: "Near-Term Opportunity", size: "$250M+", note: "0.1% market share target", c: "#" + NC },
    ].forEach((t, i) => {
      const x = 64 + i * 392;
      doc.rect(x, 195, 372, 360).fill("#0F0F16");
      doc.roundedRect(x + 100, 218, 172, 28, 8).fill(t.c + "18");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(t.c).text(t.l, x + 100, 227, { align: "center", width: 172 });
      doc.font("Helvetica").fontSize(9).fillColor("#555570").text(t.sub, x, 258, { align: "center", width: 372, characterSpacing: 1 });
      doc.font("Helvetica-Bold").fontSize(52).fillColor(t.c).text(t.size, x, 290, { align: "center", width: 372 });
      body(doc, t.note, x + 20, 385, 332, "#777788", 11);
    });

    // Slide 7 — Business Model
    bg(doc);
    eyebrow(doc, "Slide 07 — Business Model");
    headline(doc, "Multiple live revenue streams.");
    rule(doc, 130);
    const streams7 = [
      { l: "Platform Fees", c: "#" + NG, items: ["20% on every completed job", "18% for Day-1 OG members", "+3.2% payment processing"] },
      { l: "See For Me / V&I", c: "#" + NP, items: ["20% platform fee per inspection", "Inspector earns $40-$120+ per job", "Buyer Order documents"] },
      { l: "Load Board", c: "#" + NC, items: ["20% fee on completed loads", "Verified carrier network", "Escrow + proof of delivery"] },
      { l: "Business Tools", c: "#" + NA, items: ["$99/mo Scout Plan (20 unlocks)", "$49 one-time verification", "Direct offer and barter rails"] },
      { l: "GUBER Studio", c: "#F472B6", items: ["AI media packs $5-$200", "Tiers: $10.99/$37.99/$99/mo", "Text-to-video, motion, music"] },
      { l: "Premium + Drops", c: "#A855F7", items: ["$4.99/mo Trust Box", "~60% margin on Cash Drops", "Observation marketplace 20%"] },
    ];
    streams7.forEach((str, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 64 + col * 392, y = 160 + row * 270;
      cardBg(doc, x, y, 372, 250, str.c);
      doc.roundedRect(x + 14, y + 12, 60, 20, 6).fill("#" + NG + "18");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#" + NG).text("LIVE", x + 14, y + 17, { align: "center", width: 60 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF").text(str.l, x + 14, y + 42, { width: 345 });
      str.items.forEach((item, j) => body(doc, `• ${item}`, x + 14, y + 80 + j * 46, 345, "#888888", 10));
    });

    // Slide 8 — Traction
    bg(doc);
    eyebrow(doc, "Slide 08 — Traction");
    headline(doc, "Real platform. Real users. Right now.");
    rule(doc, 130);
    [{ v: "400+", l: "Total Users", c: "#" + NG }, { v: "Live", l: "Web + Android", c: "#" + NP }, { v: "Active", l: "Payments / Jobs", c: "#" + NC }].forEach((st, i) => {
      const x = 64 + i * 392;
      doc.rect(x, 160, 372, 190).fill(st.c + "10");
      doc.font("Helvetica-Bold").fontSize(64).fillColor(st.c).text(st.v, x, 185, { align: "center", width: 372 });
      doc.font("Helvetica").fontSize(10).fillColor("#777788").text(st.l.toUpperCase(), x, 270, { align: "center", width: 372, characterSpacing: 2 });
    });
    [
      "Native Android live on Google Play since April 8, 2026 — zero paid acquisition",
      "Web app live and serving real users at guberapp.com",
      "iOS App Store review process underway",
      "Stripe Connect, escrow, and payouts wired end-to-end",
      "Cash Drops already paying real winners — posted publicly",
      "Founder-built — every revenue stream is live or one flag away",
    ].forEach((f, i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      body(doc, `• ${f}`, 64 + col * 600, 375 + row * 62, 560, "#AAAAAA", 10);
    });
    doc.rect(64, 575, W - 128, 70).fill("#" + NG + "0A");
    body(doc, "Early Traction Note: User count is currently validating. All other metrics reflect live platform behavior — not projections.", 84, 590, W - 168, "#888888", 9);

    // Slide 9 — GTM
    bg(doc);
    eyebrow(doc, "Slide 09 — Go-To-Market");
    headline(doc, "City-by-city. Supply before demand.");
    rule(doc, 130);
    body(doc, "Growth comes from community activation — not paid advertising. Start local. Prove repeatability. Expand.", 64, 152, W - 128, "#888899");
    [
      { icon: "🏙", l: "Activate city supply first", b: "Workers, transporters, inspectors, and service providers via missions and local jobs." },
      { icon: "🤖", l: "JAC-guided onboarding", b: "Every new user guided from signup to first action. No confusion, no learning curve." },
      { icon: "💰", l: "Cash Drops drive installs", b: "Geo-sponsored cash rewards create organic word-of-mouth and real installs." },
      { icon: "🏢", l: "Business partnerships", b: "Local businesses unlock talent and verification via Scout Plan and V&I." },
      { icon: "🔄", l: "Referral loops compound", b: "Every completed job is shareable proof of income. Workers recruit workers." },
      { icon: "📈", l: "City by city, then national", b: "Build density before breadth. Document what works. Roll the playbook forward." },
    ].forEach((st, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 64 + col * 392, y = 185 + row * 255;
      cardBg(doc, x, y, 372, 230, "#" + NA);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF").text(st.l, x + 18, y + 28, { width: 340 });
      body(doc, st.b, x + 18, y + 72, 340, "#888888", 10);
    });

    // Slide 10 — Ask
    bg(doc);
    eyebrow(doc, "Slide 10 — The Ask");
    headline(doc, "Seeking strategic funding and partnership.");
    rule(doc, 130);
    doc.rect(64, 165, 540, 200).fill("#" + NG + "0D");
    doc.font("Helvetica-Bold").fontSize(58).fillColor("#" + NG).text("$1,000,000", 64, 190, { align: "center", width: 540 });
    doc.font("Helvetica").fontSize(12).fillColor("#AAAAAA").text("Raise target over 18 months", 64, 265, { align: "center", width: 540 });
    body(doc, "$15M early-stage valuation framework. Capital goes to growth — not engineering.", 84, 296, 500, "#777788", 10);
    body(doc, "Dimetris Bowden — Founder & CEO\nGuberapp.global@gmail.com  ·  (251) 284-9412", 64, 395, 540, "#AAAAAA", 11);
    doc.font("Helvetica").fontSize(9).fillColor("#555570").text("USE OF FUNDS", 680, 165, { characterSpacing: 2 });
    [
      { l: "User Acquisition & Activation", p: 35, a: "$350K", c: "#" + NG },
      { l: "Product Development", p: 30, a: "$300K", c: "#" + NP },
      { l: "Trust, Safety & Compliance", p: 15, a: "$150K", c: "#" + NA },
      { l: "Partnerships & Biz Dev", p: 10, a: "$100K", c: "#" + NC },
      { l: "Infrastructure & Operations", p: 5, a: "$50K", c: "#A855F7" },
      { l: "Reserve Capital", p: 5, a: "$50K", c: "#666666" },
    ].forEach((a, i) => {
      const y = 195 + i * 64;
      doc.font("Helvetica").fontSize(10).fillColor("#CCCCCC").text(a.l, 680, y, { width: 400 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(a.c).text(a.a, 1050, y, { align: "right", width: 165 });
      doc.rect(680, y + 22, 535, 8).fill("#111118");
      doc.rect(680, y + 22, 535 * (a.p / 100), 8).fill(a.c);
    });
    doc.rect(680, 590, 535, 90).fill("#" + NP + "0D");
    doc.font("Helvetica-Oblique").fontSize(13).fillColor("#DDDDEE").text('"GUBER is not just another app. It is a real-world action engine."', 690, 610, { align: "center", width: 515 });
  });

  console.log("✓ PDF written:", pdfPath);
}

// ─── ONE-PAGER PDF ────────────────────────────────────────────────────────────

async function generateOnePager() {
  const PDFDocument = (await import("pdfkit")).default;
  const W = 816, H = 1056; // US Letter portrait

  const outPath = resolve(EXPORTS, "GUBER_Investor_One_Pager.pdf");
  await new Promise((res, rej) => {
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    stream.on("finish", res);
    stream.on("error", rej);

    // Background
    doc.rect(0, 0, W, H).fill("#060608");

    // Header bar
    doc.rect(0, 0, W, 90).fill("#0D0D16");
    doc.font("Helvetica-Bold").fontSize(42).fillColor("#FFFFFF").text("GUBER", 48, 20);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#" + NG).text('"You Name It. GUBER Gets It Done."', 48, 64);
    doc.rect(W - 220, 28, 1, 34).fill("#1A1A28");
    doc.font("Helvetica").fontSize(9).fillColor("#555570").text("PRIVATE INVESTOR BRIEF", W - 210, 38, { characterSpacing: 2 });
    doc.font("Helvetica").fontSize(8).fillColor("#333344").text("2026  ·  GUBER GLOBAL LLC", W - 210, 55);

    // Neon rule
    doc.rect(48, 100, 120, 3).fill("#" + NG);

    const col1 = 48, col2 = 432, cw = 350, row = [118, 228, 338, 448, 558, 668, 778];

    function section(label, x, y, w, color = "#" + NG) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(color).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 2 });
      doc.rect(x, y + 16, w, 1).fill(color + "33");
    }
    function bodyText(txt, x, y, w, size = 9.5) {
      doc.font("Helvetica").fontSize(size).fillColor("#AAAAAA").text(txt, x, y + 22, { width: w, lineGap: 2 });
    }

    section("Company", col1, row[0], cw);
    bodyText("Guber Global LLC — 100% founder-owned. Delaware LLC established. Trademark filed. DUNS issued. No prior raise. No co-founders.", col1, row[0], cw);

    section("Problem", col1, row[1], cw);
    bodyText("Help is fragmented across job boards, classifieds, and random referrals. Workers can't find fast paid opportunities. Local transactions have zero trust, verification, or accountability.", col1, row[1], cw);

    section("Solution", col1, row[2], cw);
    bodyText("GUBER is an action marketplace. Post tasks, hire help, find work, request See For Me inspections, sell items, move vehicles, complete missions. JAC — the Job Assistance Coordinator — guides every user from first tap to first dollar.", col1, row[2], cw);

    section("Market", col1, row[3], cw);
    bodyText("Trillion-dollar-plus combined opportunity across labor, services, commerce, and logistics. TAM $2T+ globally. SAM $250B+ in the U.S. SOM $250M+ at 0.1% market share.", col1, row[3], cw);

    section("Traction", col1, row[4], cw);
    bodyText("400+ users. Live on web and Google Play since April 8, 2026. iOS App Store review underway. Stripe Connect, escrow, and payouts live end-to-end. Cash Drops paying real winners. Founder-built.", col1, row[4], cw);

    section("Revenue Model", col2, row[0], cw, "#" + NP);
    bodyText("20% platform fee on jobs. 20% on V&I inspections ($40-$120+ per job). 20% on Load Board loads. $99/mo Business Scout. Studio credit packs $5-$200. $4.99/mo Trust Box. Cash Drop sponsorships (~60% margin).", col2, row[0], cw);

    section("Go-To-Market", col2, row[1], cw, "#" + NP);
    bodyText("City-by-city activation. Supply first — workers, transporters, inspectors. JAC guides instant onboarding. Cash Drops drive organic installs. Local business partnerships via Scout Plan and V&I. Referral loops compound.", col2, row[1], cw);

    section("The Ask", col2, row[2], cw, "#" + NP);
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#" + NG).text("$1,000,000", col2, row[2] + 24, { width: cw });
    bodyText("Over 18 months. $15M early-stage valuation framework. Capital to: user acquisition (35%), product (30%), trust & safety (15%), partnerships (10%), operations (10%).", col2, row[2] + 30, cw);

    section("Founder Note", col2, row[3] - 20, cw, "#" + NC);
    bodyText('"GUBER is not just another app. It is a real-world action engine. I built every line of it. Every revenue stream is live. I am looking for a partner who sees what I see — a platform that makes real-world action visible, trusted, and scalable." — Dimetris Bowden', col2, row[3] - 20, cw);

    // Footer
    doc.rect(0, H - 68, W, 68).fill("#0D0D16");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text("Dimetris Bowden — Founder & CEO", 48, H - 52);
    doc.font("Helvetica").fontSize(9).fillColor("#" + NG).text("Guberapp.global@gmail.com", 48, H - 36);
    doc.font("Helvetica").fontSize(9).fillColor("#777788").text("(251) 284-9412  ·  guberapp.com", 48, H - 22);
    doc.font("Helvetica").fontSize(7).fillColor("#333344").text("CONFIDENTIAL — For invited parties only. Do not redistribute. This is not an offer to sell securities.", W - 450, H - 22, { width: 410, align: "right" });

    doc.end();
  });

  console.log("✓ One-pager written:", outPath);
}

// ─── Run all ──────────────────────────────────────────────────────────────────

(async () => {
  console.log("Generating GUBER pitch deck exports...");
  await Promise.all([generatePptx(), generatePdf(), generateOnePager()]);
  console.log("\nAll exports complete. Files in /exports/");
})();
