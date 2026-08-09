/**
 * GUBER /discover/ SEO Content System
 * Pure server-rendered HTML pages for search engine indexing.
 * These routes are isolated under /discover/* and do NOT touch any existing
 * route, component, API, database schema, or application functionality.
 *
 * Mounted in server/index.ts alongside setupPublicSeoRoutes.
 */

import type { Express, Request, Response } from "express";

const BASE_URL = "https://guberapp.app";
const OG_IMAGE = `${BASE_URL}/icon-1024.png`;
const BRAND = "GUBER";
const BRAND_TAGLINE = "GUBER is an American super app connecting digital technology with real-world opportunity.";
const BRAND_MANTRA = "Work. Hire. Buy. Sell. Transport. Verify. Earn. Explore.";

// ─── Shared utilities ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface Breadcrumb { name: string; url: string; }

function breadcrumbSchema(crumbs: Breadcrumb[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": crumbs.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": c.name,
      "item": `${BASE_URL}${c.url}`,
    })),
  };
}

function orgSchema(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GUBER",
    "url": BASE_URL,
    "logo": OG_IMAGE,
    "description": BRAND_TAGLINE,
    "sameAs": [],
  };
}

function renderBreadcrumbs(crumbs: Breadcrumb[]): string {
  const items = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    return isLast
      ? `<span class="bc-current">${esc(c.name)}</span>`
      : `<a href="${esc(c.url)}" class="bc-link">${esc(c.name)}</a><span class="bc-sep">›</span>`;
  }).join("");
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items}</nav>`;
}

const SHARED_STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#08080f;--bg2:#0f0f1a;--bg3:#141426;
  --text:#ddddf0;--text2:#9999bb;
  --gold:#c9a84c;--purple:#7c3aed;--purple2:#a78bfa;
  --border:#1e1e38;
  --max:860px;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;line-height:1.65;min-height:100vh}
a{color:var(--purple2);text-decoration:none}
a:hover{text-decoration:underline;color:var(--gold)}
img{max-width:100%;display:block}

/* Nav */
.site-nav{background:var(--bg2);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;position:sticky;top:0;z-index:10}
.site-nav .brand{font-size:1.25rem;font-weight:800;letter-spacing:0.08em;color:var(--gold);text-decoration:none}
.site-nav .nav-links{display:flex;gap:20px;font-size:0.85rem}
.site-nav .nav-links a{color:var(--text2)}
.site-nav .nav-links a:hover{color:var(--gold)}
.site-nav .nav-cta{background:var(--purple);color:#fff;padding:7px 18px;border-radius:8px;font-size:0.85rem;font-weight:600;text-decoration:none;white-space:nowrap}
.site-nav .nav-cta:hover{background:var(--purple2);text-decoration:none;color:#fff}

/* Breadcrumbs */
.breadcrumbs{padding:12px 24px;font-size:0.8rem;color:var(--text2);max-width:var(--max);margin:0 auto;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.bc-link{color:var(--text2)}
.bc-link:hover{color:var(--gold)}
.bc-sep{color:var(--border);padding:0 2px}
.bc-current{color:var(--text)}

/* Page layout */
.page{max-width:var(--max);margin:0 auto;padding:40px 24px 80px}
.page-hero{margin-bottom:48px}
.page-hero h1{font-size:clamp(1.75rem,4vw,2.6rem);font-weight:800;line-height:1.15;margin-bottom:16px;letter-spacing:-0.02em}
.page-hero .lead{font-size:1.1rem;color:var(--text2);max-width:640px;line-height:1.7}
.page-hero .mantra{font-size:0.9rem;color:var(--gold);font-weight:600;letter-spacing:0.06em;margin-top:12px;text-transform:uppercase}

/* Sections */
.section{margin-bottom:48px}
.section h2{font-size:1.35rem;font-weight:700;margin-bottom:14px;color:var(--text);border-left:3px solid var(--gold);padding-left:12px}
.section h3{font-size:1.05rem;font-weight:600;margin:20px 0 8px;color:var(--purple2)}
.section p{color:var(--text2);margin-bottom:12px}
.section ul,.section ol{color:var(--text2);padding-left:22px;margin-bottom:12px}
.section li{margin-bottom:6px}

/* Grid cards */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:16px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px}
.card h3{font-size:0.95rem;font-weight:700;color:var(--gold);margin-bottom:6px}
.card p{font-size:0.85rem;color:var(--text2);margin:0}
.card a{display:block;margin-top:10px;font-size:0.82rem;color:var(--purple2)}

/* FAQ */
.faq-item{border-top:1px solid var(--border);padding:20px 0}
.faq-item:last-child{border-bottom:1px solid var(--border)}
.faq-q{font-weight:700;color:var(--text);margin-bottom:8px}
.faq-a{color:var(--text2);font-size:0.95rem}

/* CTA block */
.cta-block{background:linear-gradient(135deg,var(--bg3) 0%,#1a0f2e 100%);border:1px solid #2d1f5e;border-radius:16px;padding:36px 32px;text-align:center;margin-top:56px}
.cta-block h2{font-size:1.4rem;font-weight:800;color:var(--text);margin-bottom:10px}
.cta-block p{color:var(--text2);margin-bottom:24px;font-size:0.95rem}
.cta-btn{display:inline-block;background:var(--purple);color:#fff;padding:13px 32px;border-radius:10px;font-weight:700;font-size:1rem;text-decoration:none}
.cta-btn:hover{background:var(--purple2);color:#fff;text-decoration:none}
.cta-sub{margin-top:12px;font-size:0.82rem;color:var(--text2)}

/* Links section */
.related-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.related-links a{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-size:0.84rem;color:var(--purple2)}
.related-links a:hover{border-color:var(--purple);text-decoration:none;color:var(--gold)}

/* Tag pill */
.tag{display:inline-block;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 12px;font-size:0.78rem;color:var(--text2);margin:3px}

/* Footer */
.site-footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;color:var(--text2);font-size:0.82rem}
.site-footer a{color:var(--text2)}
.site-footer a:hover{color:var(--gold)}
.site-footer .footer-links{display:flex;justify-content:center;flex-wrap:wrap;gap:16px;margin-bottom:12px}

@media(max-width:640px){
  .page{padding:24px 16px 60px}
  .site-nav .nav-links{display:none}
  .card-grid{grid-template-columns:1fr}
  .cta-block{padding:24px 20px}
}
`;

const SITE_NAV = `
<header class="site-nav">
  <a href="${BASE_URL}" class="brand">GUBER</a>
  <nav class="nav-links">
    <a href="/discover/work/">Work</a>
    <a href="/discover/hire/">Hire</a>
    <a href="/discover/marketplace/">Marketplace</a>
    <a href="/discover/transport/">Transport</a>
    <a href="/discover/ai/">AI Assistant</a>
    <a href="/discover/">Explore All</a>
  </nav>
  <a href="/signup" class="nav-cta">Join Free</a>
</header>
`;

const SITE_FOOTER = `
<footer class="site-footer">
  <div class="footer-links">
    <a href="/discover/">Discover GUBER</a>
    <a href="/discover/what-is-guber/">What Is GUBER?</a>
    <a href="/discover/work/">Work</a>
    <a href="/discover/hire/">Hire</a>
    <a href="/discover/marketplace/">Marketplace</a>
    <a href="/discover/services/">Services</a>
    <a href="/discover/transport/">Transport</a>
    <a href="/discover/verification/">Verification</a>
    <a href="/discover/ai/">AI</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </div>
  <p>© ${new Date().getFullYear()} GUBER. An American super app. All rights reserved.</p>
</footer>
`;

function page(opts: {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  jsonLd: object | object[];
  breadcrumbs: Breadcrumb[];
  body: string;
}): string {
  const schemas = Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd];
  const ldBlocks = schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("\n  ");
  const ogTitle = esc(opts.ogTitle ?? opts.title);
  const ogDesc  = esc(opts.ogDescription ?? opts.description);
  const canonicalUrl = `${BASE_URL}${opts.canonical}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(opts.description)}">
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="GUBER">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:image" content="${esc(OG_IMAGE)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${esc(OG_IMAGE)}">
  ${ldBlocks}
  <style>${SHARED_STYLES}</style>
</head>
<body>
${SITE_NAV}
${renderBreadcrumbs(opts.breadcrumbs)}
<main class="page">
${opts.body}
</main>
${SITE_FOOTER}
</body>
</html>`;
}

// ─── Page definitions ────────────────────────────────────────────────────────

// 1. /discover/ — Main hub
function discoverIndex(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover GUBER", url: "/discover/" }];
  const body = `
<div class="page-hero">
  <h1>Discover GUBER — The American Super App</h1>
  <p class="lead">${BRAND_TAGLINE} One platform for work, hiring, buying, selling, transportation, verification, local services, and AI-powered assistance.</p>
  <p class="mantra">${BRAND_MANTRA}</p>
</div>

<div class="section">
  <h2>What Can You Do on GUBER?</h2>
  <p>GUBER brings together dozens of real-world activities that used to require separate apps, websites, and phone calls. From finding same-day work to hiring a local contractor, from shipping a vehicle to getting an item inspected remotely — GUBER is one platform for the full range of real-world economic activity.</p>
  <div class="card-grid">
    <div class="card"><h3>Work &amp; Earn</h3><p>Find local jobs, gig opportunities, and ways to put your skills, time, and assets to work.</p><a href="/discover/work/">Explore Work →</a></div>
    <div class="card"><h3>Hire</h3><p>Post a task, find qualified local workers, and get things done — fast and reliably.</p><a href="/discover/hire/">Explore Hire →</a></div>
    <div class="card"><h3>Buy &amp; Sell</h3><p>A local marketplace for items, equipment, vehicles, and more — with built-in verification options.</p><a href="/discover/marketplace/">Explore Marketplace →</a></div>
    <div class="card"><h3>Local Services</h3><p>Find help with moving, deliveries, yard work, errands, and other local tasks.</p><a href="/discover/services/">Explore Services →</a></div>
    <div class="card"><h3>Transportation</h3><p>Ship vehicles, equipment, freight, and more — or find loads to haul.</p><a href="/discover/transport/">Explore Transport →</a></div>
    <div class="card"><h3>Verification</h3><p>Get eyes on anything, anywhere — vehicles, properties, items — with GPS-backed proof.</p><a href="/discover/verification/">Explore Verification →</a></div>
    <div class="card"><h3>AI Assistant</h3><p>JAC AI, GUBER's AI assistant, helps you find opportunities, post work, and navigate the platform.</p><a href="/discover/ai/">Explore AI →</a></div>
    <div class="card"><h3>Local Discovery</h3><p>See what's happening near you — opportunities, cash drops, missions, and local activity.</p><a href="/discover/local/">Explore Local →</a></div>
  </div>
</div>

<div class="section">
  <h2>GUBER Platform Features</h2>
  <p>Behind each category, GUBER's technology handles trust, payments, verification, and communication — so every transaction is safer and every interaction is accountable.</p>
  <div class="related-links">
    <a href="/discover/features/jac/">JAC AI Opportunity Assistant</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
    <a href="/discover/features/see-for-me/">See For Me</a>
    <a href="/discover/features/load-board/">Load Board</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/cash-drops/">Cash Drops</a>
    <a href="/discover/features/barter/">Barter</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
  </div>
</div>

<div class="section">
  <h2>Built for Real Americans</h2>
  <p>GUBER is designed for the full spectrum of American economic life — workers, earners, hirers, buyers, sellers, transporters, and local businesses of every kind. Whether you're an individual looking to make extra income, a small business hiring local help, or a carrier looking for loads, GUBER has a place for you.</p>
</div>

<div class="cta-block">
  <h2>Ready to Explore GUBER?</h2>
  <p>Join free and connect with real-world opportunity in your area.</p>
  <a href="/signup" class="cta-btn">Get Started Free</a>
  <p class="cta-sub">Already a member? <a href="/login" style="color:var(--purple2)">Sign in</a></p>
</div>`;

  return page({
    title: "Discover GUBER — The American Super App | Work, Hire, Buy, Sell, Transport",
    description: "GUBER is an American super app connecting people to work, hiring, buying, selling, transportation, verification, local services, and AI assistance — all from one platform.",
    canonical: "/discover/",
    jsonLd: [
      orgSchema(),
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "GUBER",
        "url": BASE_URL,
        "description": BRAND_TAGLINE,
        "potentialAction": { "@type": "SearchAction", "target": { "@type": "EntryPoint", "urlTemplate": `${BASE_URL}/browse-jobs?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
      breadcrumbSchema(crumbs),
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 2. /discover/what-is-guber/
function whatIsGuber(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "What Is GUBER?", url: "/discover/what-is-guber/" }];
  const body = `
<div class="page-hero">
  <h1>What Is GUBER?</h1>
  <p class="lead">GUBER is an American super app connecting people to work, hiring, buying, selling, transportation, verification, local services, and real-world opportunities from one platform.</p>
</div>

<div class="section">
  <h2>A Platform Built Around Real-World Activity</h2>
  <p>GUBER is not a single-purpose app. It's an integrated platform for the full range of American economic activity — the kind that happens in communities, neighborhoods, driveways, warehouses, job sites, and main streets every day.</p>
  <p>Think of GUBER as a digital layer over the physical world. People use it to find work, hire workers, buy and sell items, ship vehicles and equipment, verify things they can't see in person, discover local opportunities, and get guidance from an AI assistant that knows the platform inside and out.</p>
</div>

<div class="section">
  <h2>The GUBER Ecosystem</h2>
  <h3>Work &amp; Earn</h3>
  <p>Workers and earners use GUBER to find local jobs, gig opportunities, short-term tasks, and ways to turn skills, time, vehicles, equipment, and property into income.</p>
  <h3>Hire</h3>
  <p>Anyone who needs something done — businesses, homeowners, individuals — can post on GUBER to find qualified local help. From a single task to recurring work.</p>
  <h3>Buy &amp; Sell</h3>
  <p>A local marketplace for almost anything — items, vehicles, equipment, services. With optional real-world verification built right in.</p>
  <h3>Transportation &amp; Logistics</h3>
  <p>GUBER's Load Board connects shippers needing vehicles, equipment, or freight moved with carriers who have the capacity to haul it.</p>
  <h3>Verification &amp; Trust</h3>
  <p>Through features like See For Me and Trust by Action, GUBER creates verifiable records of real-world conditions — useful for buyers, sellers, hirers, and workers alike.</p>
  <h3>AI Assistance</h3>
  <p>JAC AI, GUBER's AI assistant, helps users navigate the platform, find opportunities, post work, understand services, and make more informed decisions about real-world transactions.</p>
</div>

<div class="section">
  <h2>How GUBER Is Different</h2>
  <p>Most platforms solve one problem. A job board posts jobs. A classifieds site lists items. A trucking app moves freight. GUBER connects all of these into a single ecosystem where trust, payments, verification, and communication flow together.</p>
  <p>GUBER's identity verification, GPS-backed proof of presence, escrow payments, and AI-powered matching make every transaction more accountable — and every opportunity more accessible.</p>
</div>

<div class="section">
  <h2>Frequently Asked Questions</h2>
  <div class="faq-item"><p class="faq-q">Is GUBER only for gig workers?</p><p class="faq-a">No. Gig work is one part of GUBER. The platform also serves hirers, buyers, sellers, carriers, local businesses, and anyone looking to participate in their local economy.</p></div>
  <div class="faq-item"><p class="faq-q">What kinds of work can you find on GUBER?</p><p class="faq-a">Local tasks, moving help, delivery runs, vehicle inspections, transport jobs, lawn care, handyman work, tech help, errands, skilled trades, and more. GUBER's categories are broad by design.</p></div>
  <div class="faq-item"><p class="faq-q">Is GUBER available across the United States?</p><p class="faq-a">GUBER is built for American communities. Coverage grows as more users join in each area. The Live Opportunity Map shows what's active near any given location.</p></div>
  <div class="faq-item"><p class="faq-q">How does GUBER handle payments?</p><p class="faq-a">GUBER has built-in payment and escrow capability, so funds can be held securely and released when work is completed — protecting both hirers and workers.</p></div>
</div>

<div class="section">
  <h2>Explore GUBER by Category</h2>
  <div class="related-links">
    <a href="/discover/work/">Work &amp; Earn</a>
    <a href="/discover/hire/">Hire</a>
    <a href="/discover/marketplace/">Marketplace</a>
    <a href="/discover/services/">Local Services</a>
    <a href="/discover/transport/">Transport</a>
    <a href="/discover/verification/">Verification</a>
    <a href="/discover/ai/">AI Assistant</a>
    <a href="/discover/local/">Local Opportunities</a>
  </div>
</div>

<div class="cta-block">
  <h2>See GUBER For Yourself</h2>
  <p>Create a free account and explore what's available in your area.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "What Is GUBER? | The American Super App Explained",
    description: "GUBER is an American super app for work, hiring, buying, selling, transportation, verification, and local opportunity — all connected through one platform. Learn what makes GUBER different.",
    canonical: "/discover/what-is-guber/",
    jsonLd: [
      orgSchema(),
      breadcrumbSchema(crumbs),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "Is GUBER only for gig workers?", "acceptedAnswer": { "@type": "Answer", "text": "No. Gig work is one part of GUBER. The platform also serves hirers, buyers, sellers, carriers, local businesses, and anyone looking to participate in their local economy." } },
          { "@type": "Question", "name": "What kinds of work can you find on GUBER?", "acceptedAnswer": { "@type": "Answer", "text": "Local tasks, moving help, delivery runs, vehicle inspections, transport jobs, lawn care, handyman work, tech help, errands, skilled trades, and more." } },
          { "@type": "Question", "name": "How does GUBER handle payments?", "acceptedAnswer": { "@type": "Answer", "text": "GUBER has built-in payment and escrow capability, so funds can be held securely and released when work is completed — protecting both hirers and workers." } },
        ],
      },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 3. /discover/work/
function workHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Work & Earn", url: "/discover/work/" }];
  const body = `
<div class="page-hero">
  <h1>Find Work Near You with GUBER</h1>
  <p class="lead">GUBER connects workers and earners to local opportunities across dozens of categories — same-day work, recurring gigs, skilled tasks, and more. Put your time, skills, and assets to work.</p>
</div>

<div class="section">
  <h2>How Work Happens on GUBER</h2>
  <p>Hirers post jobs on GUBER describing what they need done, where, and what they're paying. Workers browse, apply, and get hired. Payments are handled through the platform, so you get paid securely when the job is done.</p>
  <p>GUBER is not limited to any single type of work. If you have time, skills, a vehicle, equipment, or property — there's likely a way to earn on GUBER.</p>
</div>

<div class="section">
  <h2>Types of Work Available on GUBER</h2>
  <h3>Local Tasks &amp; Errands</h3>
  <p>Moving help, deliveries, cleaning, lawn care, home repairs, assembly, and hundreds of other everyday tasks that hirers post daily.</p>
  <h3>Skilled Work</h3>
  <p>Handyman services, tech support, inspections, professional services, and trade work where your expertise earns a premium.</p>
  <h3>Vehicle &amp; Transport Work</h3>
  <p>Carriers earn by hauling vehicles, equipment, and freight through GUBER's Load Board. If you have a trailer, flatbed, or transport capacity, there are loads near you.</p>
  <h3>Verification &amp; Inspection</h3>
  <p>Earn by conducting remote inspections for buyers — checking vehicles, properties, and items on behalf of people who can't be there in person.</p>
  <h3>Gig &amp; Short-Term Work</h3>
  <p>Need to earn today? GUBER's same-day work category lets hirers post urgent jobs and workers pick them up fast.</p>
</div>

<div class="section">
  <h2>Search Intent Pages</h2>
  <div class="card-grid">
    <div class="card"><h3>Jobs Near Me</h3><p>Browse available work close to your location right now.</p><a href="/discover/work/jobs-near-me/">Find Jobs Near Me →</a></div>
    <div class="card"><h3>Gig Work</h3><p>Flexible short-term opportunities you can pick up on your schedule.</p><a href="/discover/work/gig-work/">Explore Gig Work →</a></div>
    <div class="card"><h3>Side Gigs</h3><p>Supplement your income with local earning opportunities.</p><a href="/discover/work/side-gigs/">Explore Side Gigs →</a></div>
  </div>
</div>

<div class="section">
  <h2>Related GUBER Features</h2>
  <div class="related-links">
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
    <a href="/discover/features/load-board/">Load Board</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
    <a href="/discover/features/jac/">JAC AI Opportunity Assistant</a>
  </div>
</div>

<div class="cta-block">
  <h2>Start Finding Work Today</h2>
  <p>Create your free GUBER account and see what's available near you.</p>
  <a href="/signup" class="cta-btn">Find Work on GUBER</a>
</div>`;

  return page({
    title: "Find Work Near You | GUBER Work & Earning Opportunities",
    description: "Find local jobs, gig work, side gigs, and earning opportunities near you on GUBER — the American super app for work, hiring, transport, and real-world opportunity.",
    canonical: "/discover/work/",
    jsonLd: [
      orgSchema(),
      breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Work & Earning", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Find local jobs, gig work, and earning opportunities across dozens of categories.", "areaServed": { "@type": "Country", "name": "United States" } },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 4. /discover/hire/
function hireHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Hire", url: "/discover/hire/" }];
  const body = `
<div class="page-hero">
  <h1>Hire Local Workers Near You with GUBER</h1>
  <p class="lead">Post a job on GUBER and connect with qualified local workers ready to help — same day or on your schedule. From a single task to ongoing work.</p>
</div>

<div class="section">
  <h2>How Hiring Works on GUBER</h2>
  <p>Posting a job on GUBER takes minutes. Describe what you need done, set your budget, and specify your location. GUBER surfaces your post to nearby qualified workers who can apply, and you select who you want to hire. Payments are handled securely through the platform.</p>
</div>

<div class="section">
  <h2>What You Can Hire For</h2>
  <h3>Home &amp; Property</h3>
  <p>Moving help, lawn care, cleaning, painting, repairs, assembly, and other property tasks. Get qualified local help without the overhead of a big-company booking.</p>
  <h3>Delivery &amp; Errands</h3>
  <p>Same-day delivery, pickup and drop-off, shopping runs, and other errands. GUBER workers are local, so turnaround is fast.</p>
  <h3>Skilled &amp; Trade Work</h3>
  <p>Tech help, skilled installations, inspections, or specialized tasks. Many GUBER workers bring certifications, experience, and verifiable track records.</p>
  <h3>Transportation &amp; Hauling</h3>
  <p>Need something moved — a vehicle, equipment, or freight? Post on GUBER's Load Board to reach carriers with the right equipment for your job.</p>
  <h3>Business Tasks</h3>
  <p>From one-off business tasks to recurring local support, GUBER lets businesses of every size find and hire local workers quickly.</p>
</div>

<div class="section">
  <h2>Trust &amp; Safety When You Hire</h2>
  <p>GUBER's Trust by Action system creates accountability on both sides. Workers build verifiable records of completed work. Hirers can request identity-verified workers. And GUBER's payment escrow means funds are only released when work is done.</p>
  <div class="related-links">
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
    <a href="/discover/verification/">Verification</a>
  </div>
</div>

<div class="section">
  <h2>Explore Hiring Categories</h2>
  <div class="related-links">
    <a href="/discover/hire/local-workers/">Hire Local Workers</a>
    <a href="/discover/services/">Local Services</a>
    <a href="/discover/transport/">Transportation &amp; Hauling</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire Feature</a>
  </div>
</div>

<div class="cta-block">
  <h2>Post a Job on GUBER</h2>
  <p>Describe what you need. Connect with local workers. Get it done.</p>
  <a href="/signup" class="cta-btn">Hire on GUBER</a>
</div>`;

  return page({
    title: "Hire Local Workers Near You | GUBER Hiring Platform",
    description: "Post a job on GUBER and hire local workers for tasks, services, moving, deliveries, repairs, and more. GUBER connects hirers with qualified local help — quickly and securely.",
    canonical: "/discover/hire/",
    jsonLd: [
      orgSchema(),
      breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Hiring", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Post jobs and hire local workers for tasks, services, and transport across the United States.", "areaServed": { "@type": "Country", "name": "United States" } },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 5. /discover/marketplace/
function marketplaceHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Marketplace", url: "/discover/marketplace/" }];
  const body = `
<div class="page-hero">
  <h1>GUBER Local Marketplace — Buy, Sell, and Trade Near You</h1>
  <p class="lead">A local marketplace for items, vehicles, equipment, and more — with optional real-world verification built in. Buy and sell with more confidence.</p>
</div>

<div class="section">
  <h2>A Marketplace Built Around Trust</h2>
  <p>GUBER's marketplace connects local buyers and sellers for a wide range of items. What makes GUBER's marketplace different is the optional verification layer: buyers can request a See For Me inspection from a GUBER worker who physically visits the item and sends back verified photos, video, and a GPS-confirmed report.</p>
</div>

<div class="section">
  <h2>What You Can Buy and Sell on GUBER</h2>
  <h3>Vehicles</h3>
  <p>Cars, trucks, motorcycles, ATVs, and other vehicles. Buyers can request a pre-purchase inspection through See For Me before committing to a purchase.</p>
  <h3>Equipment &amp; Tools</h3>
  <p>Heavy equipment, power tools, machinery, and trade gear. Verify condition before you buy.</p>
  <h3>Household Items</h3>
  <p>Furniture, appliances, electronics, and everyday items. Local pickup or delivery through GUBER workers.</p>
  <h3>Trade Services (Barter)</h3>
  <p>GUBER supports barter — trading skills, services, or items without cash. Arrange fair exchanges in your community.</p>
</div>

<div class="section">
  <h2>Safer Local Commerce</h2>
  <p>GUBER's marketplace isn't just a listing board. GUBER's payment tools, identity verification, and inspection services create a safer environment for local commerce than traditional classifieds.</p>
  <div class="related-links">
    <a href="/discover/features/see-for-me/">See For Me Inspection</a>
    <a href="/discover/features/barter/">Barter &amp; Trade</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
    <a href="/discover/verification/">Verification Services</a>
    <a href="/discover/transport/">Transport a Purchase</a>
  </div>
</div>

<div class="cta-block">
  <h2>Start Buying or Selling on GUBER</h2>
  <p>List an item, browse local listings, or request a real-world inspection before you commit.</p>
  <a href="/signup" class="cta-btn">Join GUBER Marketplace</a>
</div>`;

  return page({
    title: "Local Marketplace — Buy, Sell & Trade Near You | GUBER",
    description: "Buy and sell locally on GUBER's marketplace — vehicles, equipment, household items, and more. Optional real-world verification available through See For Me inspections.",
    canonical: "/discover/marketplace/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Marketplace", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "A local marketplace for buying, selling, and trading items with optional real-world verification.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 6. /discover/services/
function servicesHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Local Services", url: "/discover/services/" }];
  const body = `
<div class="page-hero">
  <h1>Local Services Near You — GUBER</h1>
  <p class="lead">Find local help for moving, delivery, lawn care, cleaning, handyman work, errands, and dozens of other real-world tasks — all through GUBER.</p>
</div>

<div class="section">
  <h2>Services Available on GUBER</h2>
  <div class="card-grid">
    <div class="card"><h3>Moving Help</h3><p>Local movers for residential and small business moves — by the hour or by the job.</p></div>
    <div class="card"><h3>Delivery</h3><p>Same-day local delivery for items, packages, and purchases within your area.</p></div>
    <div class="card"><h3>Lawn Care</h3><p>Mowing, trimming, landscaping, and yard cleanup from local service providers.</p></div>
    <div class="card"><h3>Cleaning</h3><p>Residential and light commercial cleaning services booked through GUBER.</p></div>
    <div class="card"><h3>Handyman</h3><p>Repairs, assembly, installations, and general home maintenance tasks.</p></div>
    <div class="card"><h3>Errands</h3><p>Pickup and drop-off, shopping runs, line waiting, and other time-saving errands.</p></div>
    <div class="card"><h3>Tech Help</h3><p>Device setup, troubleshooting, and local tech support from skilled workers.</p></div>
    <div class="card"><h3>Labor</h3><p>General labor, loading, unloading, site cleanup, and manual tasks.</p></div>
  </div>
</div>

<div class="section">
  <h2>For Both Sides of the Transaction</h2>
  <p>If you provide any of these services locally, GUBER is also a way to find clients and earn income. Post your availability, accept jobs that fit your schedule, and build a verifiable track record through GUBER's Trust by Action system.</p>
  <div class="related-links">
    <a href="/discover/work/">Find Work</a>
    <a href="/discover/hire/">Hire Someone</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
  </div>
</div>

<div class="cta-block">
  <h2>Find or Offer Local Services</h2>
  <p>GUBER connects people who need things done with people who can do them.</p>
  <a href="/signup" class="cta-btn">Get Started on GUBER</a>
</div>`;

  return page({
    title: "Local Services Near You | Moving, Delivery, Lawn Care & More | GUBER",
    description: "Find local services on GUBER — moving help, delivery, lawn care, cleaning, handyman work, errands, and more. Or earn income by offering services in your area.",
    canonical: "/discover/services/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Local Services", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Local services including moving, delivery, lawn care, cleaning, and handyman work.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 7. /discover/transport/
function transportHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Transportation & Logistics", url: "/discover/transport/" }];
  const body = `
<div class="page-hero">
  <h1>Vehicle &amp; Freight Transportation on GUBER</h1>
  <p class="lead">GUBER's Load Board connects people who need vehicles, equipment, boats, RVs, and freight moved with carriers who have the capacity to haul it.</p>
</div>

<div class="section">
  <h2>What Can Be Transported Through GUBER?</h2>
  <div class="card-grid">
    <div class="card"><h3>Cars &amp; Trucks</h3><p>Relocate a purchased vehicle, move a car across the country, or transport a fleet vehicle.</p><a href="/discover/transport/car-hauling/">Car Hauling →</a></div>
    <div class="card"><h3>Motorcycles &amp; ATVs</h3><p>Enclosed or open transport for motorcycles, ATVs, UTVs, and powersports equipment.</p></div>
    <div class="card"><h3>Boats</h3><p>Boat transport for sales, relocation, storage, and seasonal moves.</p></div>
    <div class="card"><h3>RVs &amp; Trailers</h3><p>RV relocation, travel trailer transport, and fifth-wheel moves.</p></div>
    <div class="card"><h3>Heavy Equipment</h3><p>Construction equipment, farm machinery, and industrial assets on flatbeds and lowboys.</p></div>
    <div class="card"><h3>Freight</h3><p>Palletized loads, partial loads, and full truckloads across local and regional routes.</p></div>
  </div>
</div>

<div class="section">
  <h2>The GUBER Load Board</h2>
  <p>GUBER's Load Board is where shippers post transport needs and carriers find loads to haul. Carriers can browse by route, load type, and rate. Shippers get competitive quotes from verified carriers with the right equipment.</p>
  <div class="related-links">
    <a href="/discover/features/load-board/">How the Load Board Works</a>
    <a href="/discover/transport/car-hauling/">Car Hauling Specifically</a>
    <a href="/discover/features/see-for-me/">Vehicle Inspection Before Transport</a>
    <a href="/discover/features/payments/">Transport Payment &amp; Escrow</a>
  </div>
</div>

<div class="section">
  <h2>For Carriers: Find Loads Near You</h2>
  <p>If you have a trailer, flatbed, tow dolly, or enclosed transporter, GUBER's Load Board surfaces available loads in your area and along your routes. Earn by filling your capacity on every run.</p>
</div>

<div class="cta-block">
  <h2>Ship Something or Find a Load</h2>
  <p>Post a transport need or browse available loads on GUBER's Load Board.</p>
  <a href="/signup" class="cta-btn">Access the Load Board</a>
</div>`;

  return page({
    title: "Vehicle & Freight Transportation | GUBER Load Board",
    description: "Ship vehicles, equipment, boats, RVs, and freight through GUBER's Load Board. Carriers find loads; shippers find vetted carriers with the right equipment.",
    canonical: "/discover/transport/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Transportation & Logistics", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Vehicle and freight transportation via the GUBER Load Board — connecting shippers with carriers across the United States.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 8. /discover/verification/
function verificationHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Verification", url: "/discover/verification/" }];
  const body = `
<div class="page-hero">
  <h1>Real-World Verification Services — GUBER</h1>
  <p class="lead">Get eyes on anything, anywhere. GUBER's verification services create GPS-confirmed, photo-and-video-backed reports on vehicles, properties, items, and conditions — delivered by verified local workers.</p>
</div>

<div class="section">
  <h2>Why Real-World Verification Matters</h2>
  <p>Buying a used car from across the state. Hiring a contractor you've never met. Purchasing equipment listed online. Real-world transactions carry real risk when you can't be physically present. GUBER's verification services close that gap.</p>
</div>

<div class="section">
  <h2>Types of Verification Available</h2>
  <h3>Vehicle Inspection (See For Me)</h3>
  <p>A GUBER worker visits the vehicle, documents its condition with photos and video, confirms the VIN, notes any visible issues, and delivers a verified report — all with GPS confirmation they were physically at the location.</p>
  <a href="/discover/features/see-for-me/" style="color:var(--purple2);font-size:0.9rem">→ Learn about See For Me</a>
  <a href="/discover/verification/inspect-a-car-remotely/" style="color:var(--purple2);font-size:0.9rem;display:block;margin-top:6px">→ Inspect a Car Remotely</a>

  <h3>Property Verification</h3>
  <p>Verify the condition of a rental property, storage unit, commercial space, or piece of land — before signing a lease or committing to a purchase.</p>

  <h3>Item Condition Verification</h3>
  <p>Confirm the condition of any listed item before buying — from heavy equipment to electronics to specialty goods.</p>

  <h3>GPS Proof of Presence</h3>
  <p>GUBER's platform records GPS coordinates at the time of verification, so you know the worker was physically at the reported location.</p>
</div>

<div class="section">
  <h2>Trust by Action — GUBER's Accountability System</h2>
  <p>Every verification completed through GUBER contributes to that worker's Trust by Action profile — a verifiable record of real-world activity, presence, and completion. This creates accountability in a way that star ratings alone cannot.</p>
  <div class="related-links">
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/see-for-me/">See For Me Feature</a>
    <a href="/discover/marketplace/">Marketplace with Verification</a>
    <a href="/discover/features/payments/">Escrow on Verified Transactions</a>
  </div>
</div>

<div class="section">
  <h2>FAQ: GUBER Verification</h2>
  <div class="faq-item"><p class="faq-q">How quickly can I get a verification report?</p><p class="faq-a">Speed depends on local worker availability near the item's location. For many metro and suburban areas, same-day and next-day verification is common.</p></div>
  <div class="faq-item"><p class="faq-q">What does a GUBER verification report include?</p><p class="faq-a">Typically: timestamped photos, video walkthrough, GPS confirmation of location, and worker notes on observed condition. The exact format depends on the verification type.</p></div>
  <div class="faq-item"><p class="faq-q">Can I use GUBER verification for a vehicle I'm buying privately?</p><p class="faq-a">Yes. Private vehicle sales are one of the most common use cases. A GUBER See For Me inspection gives remote buyers confidence before committing to a purchase.</p></div>
</div>

<div class="cta-block">
  <h2>Request a Real-World Verification</h2>
  <p>See it before you buy it — anywhere in the country.</p>
  <a href="/signup" class="cta-btn">Get Verified on GUBER</a>
</div>`;

  return page({
    title: "Real-World Verification Services | Vehicle & Property Inspection | GUBER",
    description: "Get GPS-confirmed, photo-and-video-backed verification of vehicles, properties, and items anywhere in the US — through GUBER's network of verified local workers.",
    canonical: "/discover/verification/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Can I use GUBER verification for a vehicle I'm buying privately?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Private vehicle sales are one of the most common use cases. A GUBER See For Me inspection gives remote buyers confidence before committing to a purchase." } }, { "@type": "Question", "name": "What does a GUBER verification report include?", "acceptedAnswer": { "@type": "Answer", "text": "Typically: timestamped photos, video walkthrough, GPS confirmation of location, and worker notes on observed condition." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 9. /discover/ai/
function aiHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "AI Assistant", url: "/discover/ai/" }];
  const body = `
<div class="page-hero">
  <h1>JAC AI — GUBER's AI Opportunity Assistant</h1>
  <p class="lead">JAC AI is GUBER's built-in AI assistant, designed to help you find work, hire workers, navigate the platform, understand your options, and make smarter real-world decisions.</p>
</div>

<div class="section">
  <h2>What JAC AI Can Help With</h2>
  <div class="card-grid">
    <div class="card"><h3>Finding Work</h3><p>Ask JAC AI what opportunities are available near you, which categories fit your skills, or how to apply for specific job types.</p></div>
    <div class="card"><h3>Hiring Help</h3><p>Describe what you need done and JAC AI will help you figure out the right category, budget, and posting strategy.</p></div>
    <div class="card"><h3>Platform Guidance</h3><p>JAC AI knows GUBER inside and out — features, fees, processes, verification, payments, and more.</p></div>
    <div class="card"><h3>Marketplace Questions</h3><p>Thinking about buying or selling? JAC AI can explain how verification works, what to expect, and how to protect yourself.</p></div>
    <div class="card"><h3>Transport Guidance</h3><p>Need to ship a vehicle or find a load? JAC AI can walk you through the Load Board and what to expect.</p></div>
    <div class="card"><h3>Real-World Knowledge</h3><p>JAC AI can provide context on vehicle specs, equipment pricing, market rates, and other real-world information relevant to GUBER transactions.</p></div>
  </div>
</div>

<div class="section">
  <h2>AI Built for Real-World Transactions</h2>
  <p>JAC AI isn't a generic chatbot. JAC AI is purpose-built for GUBER's ecosystem — its knowledge is grounded in the platform's features, policies, and use cases. When you ask JAC AI about how a GUBER verification works, or how to price a transport job, you get specific, accurate answers rather than generic AI responses.</p>
  <p>JAC AI also understands the human context of real-world economic decisions — the importance of getting paid fairly, the risk of buying something you can't inspect, the value of a verified worker record.</p>
</div>

<div class="section">
  <h2>Voice and Text</h2>
  <p>JAC AI is available in both text and voice modes on GUBER's platform. Whether you're typing from a desktop or using voice while on the go, JAC AI is accessible throughout the GUBER experience.</p>
  <div class="related-links">
    <a href="/discover/features/jac/">Full JAC AI Feature Page</a>
    <a href="/discover/work/">Find Work with JAC AI&#39;s Help</a>
    <a href="/discover/hire/">Hire with JAC AI&#39;s Help</a>
    <a href="/discover/verification/">Understanding Verification</a>
  </div>
</div>

<div class="cta-block">
  <h2>Talk to JAC AI on GUBER</h2>
  <p>JAC AI is available to all GUBER members — sign up free to access the AI assistant.</p>
  <a href="/signup" class="cta-btn">Join GUBER &amp; Meet JAC AI</a>
</div>`;

  return page({
    title: "JAC AI — GUBER's AI Assistant for Work, Hiring & Real-World Opportunities",
    description: "JAC AI is GUBER's AI assistant — helping users find work, hire locally, navigate the platform, understand verification, and make smarter real-world decisions.",
    canonical: "/discover/ai/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "JAC AI — GUBER AI Assistant", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "AI-powered assistant for finding work, hiring, marketplace guidance, and navigating GUBER's super app ecosystem." }],
    breadcrumbs: crumbs,
    body,
  });
}

// 10. /discover/local/
function localHub(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Local Opportunities", url: "/discover/local/" }];
  const body = `
<div class="page-hero">
  <h1>Local Opportunities Near You — GUBER</h1>
  <p class="lead">GUBER's Live Opportunity Map surfaces what's happening in your area right now — jobs, tasks, transport needs, marketplace listings, and local activity — all in real time.</p>
</div>

<div class="section">
  <h2>Everything Local on GUBER</h2>
  <p>GUBER is fundamentally a local platform. Every job, task, listing, and opportunity on GUBER is tied to a real location. The people on GUBER are your neighbors — working, hiring, buying, selling, and moving things in the same communities you live and work in.</p>
</div>

<div class="section">
  <h2>What You'll Find Near You</h2>
  <h3>Work Opportunities</h3>
  <p>Local jobs and tasks posted by hirers in your area — ready to be applied for right now. From same-day tasks to ongoing work.</p>
  <h3>Transport Loads</h3>
  <p>Vehicle and freight transport needs posted by shippers near your location — or along your regular routes.</p>
  <h3>Marketplace Listings</h3>
  <p>Items for sale from local sellers — vehicles, equipment, household goods, and more — within a radius you set.</p>
  <h3>Cash Drops &amp; Missions</h3>
  <p>GUBER periodically runs local Cash Drops and community missions — promotional events that reward real-world participation.</p>
  <a href="/discover/features/cash-drops/">Learn about Cash Drops →</a>
</div>

<div class="section">
  <h2>The Live Opportunity Map</h2>
  <p>GUBER's interactive map shows active opportunities around any location in real time. Workers use it to spot jobs near them. Hirers use it to see what's available. The map is one of GUBER's most powerful features for understanding local economic activity at a glance.</p>
  <div class="related-links">
    <a href="/discover/features/opportunity-map/">Live Opportunity Map Feature</a>
    <a href="/discover/work/jobs-near-me/">Jobs Near Me</a>
    <a href="/discover/features/cash-drops/">Cash Drops</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
  </div>
</div>

<div class="cta-block">
  <h2>See What's Near You on GUBER</h2>
  <p>Join free and explore the Live Opportunity Map in your area.</p>
  <a href="/signup" class="cta-btn">Explore Local Opportunities</a>
</div>`;

  return page({
    title: "Local Opportunities Near Me | Jobs, Tasks & More | GUBER",
    description: "GUBER's Live Opportunity Map shows local jobs, tasks, transport needs, and marketplace listings near you in real time. Discover what's happening in your community.",
    canonical: "/discover/local/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs)],
    breadcrumbs: crumbs,
    body,
  });
}

// 11. /discover/features/jac/
function featureJac(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Features", url: "/discover/" }, { name: "JAC AI Opportunity Assistant", url: "/discover/features/jac/" }];
  const body = `
<div class="page-hero">
  <h1>JAC AI — GUBER's AI Opportunity Assistant</h1>
  <p class="lead">JAC AI is the AI brain behind GUBER — a purpose-built assistant that helps workers find opportunities, helps hirers describe what they need, and guides every user through the GUBER ecosystem.</p>
</div>

<div class="section">
  <h2>What Is JAC AI?</h2>
  <p>JAC AI is GUBER's integrated AI assistant, available in both text and voice modes. Unlike a generic AI chatbot, JAC AI is purpose-built for GUBER's ecosystem — its responses are grounded in the platform's features, use cases, policies, and real-world context. JAC AI knows how GUBER works — and can help you work GUBER to your advantage.</p>
</div>

<div class="section">
  <h2>Who JAC AI Helps</h2>
  <h3>Workers &amp; Earners</h3>
  <p>JAC AI helps workers understand which GUBER categories fit their skills and time, how to present themselves on the platform, what to expect from different job types, and how to maximize their earnings.</p>
  <h3>Hirers &amp; Businesses</h3>
  <p>JAC AI helps hirers clarify what they need, choose the right job category, set competitive budgets, and understand how GUBER's hiring and payment systems work.</p>
  <h3>Buyers &amp; Sellers</h3>
  <p>JAC AI can explain how marketplace listings work, how to request a See For Me inspection, how barter works, and how to use GUBER's escrow for a safer transaction.</p>
  <h3>Carriers &amp; Shippers</h3>
  <p>JAC AI walks carriers and shippers through the Load Board — what information to provide, how pricing typically works, and what to expect from the transport process.</p>
</div>

<div class="section">
  <h2>JAC AI&#39;s Real-World Knowledge</h2>
  <p>JAC AI is designed to be a knowledgeable friend, not just a platform navigator. When you ask JAC AI about a vehicle you're considering, an equipment price you've seen, or a service rate in your area — JAC AI draws on real-world context to give you a useful answer, not just a platform redirect.</p>
  <p>JAC AI&#39;s goal is to help you make a better real-world decision — whether that means applying for the right job, hiring the right worker, or buying or selling something with more confidence.</p>
</div>

<div class="section">
  <h2>Text and Voice</h2>
  <p>JAC AI is available in text chat throughout the GUBER app and, for supported platforms, in a voice conversation mode where you can speak naturally and JAC AI responds in kind.</p>
</div>

<div class="section">
  <h2>Related Features &amp; Pages</h2>
  <div class="related-links">
    <a href="/discover/ai/">AI Hub</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
    <a href="/discover/features/see-for-me/">See For Me</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
    <a href="/discover/work/">Find Work</a>
    <a href="/discover/hire/">Hire</a>
  </div>
</div>

<div class="cta-block">
  <h2>Meet JAC AI on GUBER</h2>
  <p>JAC AI is available to all GUBER members. Sign up free to start a conversation.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "JAC AI — GUBER's AI Assistant | Text & Voice Opportunity Assistant",
    description: "JAC AI is GUBER's purpose-built AI assistant — helping users find work, hire locally, navigate the platform, and make better real-world decisions. Available in text and voice.",
    canonical: "/discover/features/jac/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "JAC AI — GUBER AI Assistant", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "AI-powered assistant integrated into the GUBER super app, available in text and voice modes." }],
    breadcrumbs: crumbs,
    body,
  });
}

// 12. /discover/features/earn-hire/
function featureEarnHire(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Earn & Hire", url: "/discover/features/earn-hire/" }];
  const body = `
<div class="page-hero">
  <h1>Earn &amp; Hire — The Two Sides of GUBER's Work Marketplace</h1>
  <p class="lead">GUBER connects the people who need things done with the people who can do them. Earn mode is for workers. Hire mode is for hirers. Both meet in the middle — through GUBER's marketplace of real-world opportunity.</p>
</div>

<div class="section">
  <h2>Earn: Put What You Have to Work</h2>
  <p>GUBER's Earn mode helps people turn time, skills, vehicles, equipment, and property into income. Instead of limiting opportunities to a single category (driving, delivery, tasks), GUBER asks: what do you have, and how can it earn?</p>
  <h3>What Workers Can Offer</h3>
  <ul>
    <li>Time and labor for local tasks</li>
    <li>Skills in trades, tech, cleaning, landscaping, and more</li>
    <li>Vehicles for transport, delivery, or hauling</li>
    <li>Equipment for jobs that require specialized tools</li>
    <li>Local presence for verification and inspection work</li>
  </ul>
</div>

<div class="section">
  <h2>Hire: Get Things Done Locally</h2>
  <p>GUBER's Hire mode is for anyone who needs work done. Post a job in minutes, set your budget, and connect with local workers who apply. GUBER's payment system ensures funds are held securely and released when work is completed.</p>
  <h3>What Hirers Can Post</h3>
  <ul>
    <li>Home and property tasks</li>
    <li>Deliveries and errands</li>
    <li>Skilled and trade work</li>
    <li>Transport and hauling jobs</li>
    <li>Inspection and verification requests</li>
    <li>Business tasks and ongoing work</li>
  </ul>
</div>

<div class="section">
  <h2>How They Connect</h2>
  <p>GUBER's job feed, Live Opportunity Map, and AI assistant JAC AI all work together to surface the right opportunities to the right people at the right time. Workers see jobs that match their skills and location. Hirers see qualified applicants.</p>
  <div class="related-links">
    <a href="/discover/work/">Work Hub</a>
    <a href="/discover/hire/">Hire Hub</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
  </div>
</div>

<div class="cta-block">
  <h2>Start Earning or Hiring on GUBER</h2>
  <p>Join free and access both sides of GUBER's work marketplace.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "Earn & Hire — GUBER's Local Work Marketplace | Find Work or Post a Job",
    description: "GUBER's Earn & Hire system connects workers with hirers for local tasks, services, transport, and more. Post a job or find work near you — with secure payments built in.",
    canonical: "/discover/features/earn-hire/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Earn & Hire", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "GUBER's two-sided work marketplace connecting local workers with hirers across dozens of categories.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 13. /discover/features/see-for-me/
function featureSeeForMe(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "See For Me", url: "/discover/features/see-for-me/" }];
  const body = `
<div class="page-hero">
  <h1>See For Me — Remote Real-World Inspection by GUBER</h1>
  <p class="lead">Can't be there in person? GUBER's See For Me service sends a verified local worker to inspect, photograph, and report on any vehicle, property, or item — anywhere in the US.</p>
</div>

<div class="section">
  <h2>The Problem See For Me Solves</h2>
  <p>Every year, buyers lose money on purchases they couldn't inspect in person. A car listed online looks perfect in photos — but has hidden damage, a salvage title, or a misrepresented odometer. A rental property looks fine in the listing — but has serious issues the photos don't show.</p>
  <p>See For Me exists to give buyers real eyes on the ground before they commit to any transaction that matters.</p>
</div>

<div class="section">
  <h2>How See For Me Works</h2>
  <h3>1. Post a See For Me Request</h3>
  <p>Describe what you need inspected and where it's located. Set your budget and timeframe.</p>
  <h3>2. A Local GUBER Worker Is Dispatched</h3>
  <p>A verified worker near the item's location accepts the job and travels to the location.</p>
  <h3>3. Documentation Is Collected</h3>
  <p>The worker photographs the item from every angle, records video of any concerns, confirms the VIN or address, and notes observable condition details.</p>
  <h3>4. GPS-Confirmed Report Is Delivered</h3>
  <p>You receive a timestamped report with photos, video, written notes, and GPS confirmation that the worker was physically at the location.</p>
</div>

<div class="section">
  <h2>Common Use Cases</h2>
  <ul>
    <li>Used vehicle inspection before a private purchase</li>
    <li>Rental property walkthrough before signing a lease</li>
    <li>Equipment condition check before buying</li>
    <li>Pre-transport vehicle condition documentation</li>
    <li>Confirming an item matches its listing before buying</li>
  </ul>
</div>

<div class="section">
  <h2>Related</h2>
  <div class="related-links">
    <a href="/discover/verification/">Verification Hub</a>
    <a href="/discover/verification/inspect-a-car-remotely/">Inspect a Car Remotely</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/marketplace/">GUBER Marketplace</a>
    <a href="/discover/transport/">Transport with Pre-Trip Inspection</a>
  </div>
</div>

<div class="section">
  <h2>FAQ: See For Me</h2>
  <div class="faq-item"><p class="faq-q">How far will a GUBER worker travel for a See For Me inspection?</p><p class="faq-a">Travel distance depends on the available workers in the area and the budget set for the job. Buyers typically see more options by offering a budget that accounts for the worker's travel time.</p></div>
  <div class="faq-item"><p class="faq-q">Is the See For Me report admissible as evidence?</p><p class="faq-a">GUBER's reports are GPS-confirmed and timestamped. Their use in any legal or dispute context depends on the specific situation and jurisdiction.</p></div>
  <div class="faq-item"><p class="faq-q">Can See For Me workers identify mechanical problems?</p><p class="faq-a">See For Me workers document what is visually observable — exterior and interior condition, warning lights, obvious damage, and VIN confirmation. They are not licensed mechanics. A See For Me report complements, but does not replace, a professional mechanical inspection.</p></div>
</div>

<div class="cta-block">
  <h2>Request a See For Me Inspection</h2>
  <p>Get real eyes on anything, anywhere — before you commit.</p>
  <a href="/signup" class="cta-btn">Request an Inspection</a>
</div>`;

  return page({
    title: "See For Me — Remote Vehicle & Property Inspection | GUBER",
    description: "GUBER's See For Me sends a verified local worker to inspect vehicles, properties, and items anywhere in the US — delivering GPS-confirmed photos, video, and a written report.",
    canonical: "/discover/features/see-for-me/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "See For Me — GUBER Remote Inspection", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Remote real-world inspection service — vehicles, properties, and items inspected and reported by verified local workers with GPS confirmation.", "areaServed": { "@type": "Country", "name": "United States" } },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Can See For Me workers identify mechanical problems?", "acceptedAnswer": { "@type": "Answer", "text": "See For Me workers document what is visually observable. They are not licensed mechanics. A See For Me report complements, but does not replace, a professional mechanical inspection." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 14. /discover/features/load-board/
function featureLoadBoard(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Load Board", url: "/discover/features/load-board/" }];
  const body = `
<div class="page-hero">
  <h1>GUBER Load Board — Vehicle &amp; Freight Transport</h1>
  <p class="lead">GUBER's Load Board connects shippers who need vehicles, equipment, boats, RVs, and freight moved with carriers who have the capacity and equipment to haul it.</p>
</div>

<div class="section">
  <h2>What Is the GUBER Load Board?</h2>
  <p>The Load Board is GUBER's logistics marketplace. Shippers post transport jobs — what needs to be moved, from where, to where, and by when. Carriers browse the board for loads that match their equipment, route, and capacity — and bid or accept based on the terms that work for them.</p>
</div>

<div class="section">
  <h2>For Shippers</h2>
  <p>Post your transport need in minutes. Include the load type, origin, destination, dimensions (if applicable), and your budget. GUBER's network of carriers will respond with availability and pricing. You choose the carrier that fits your timeline and budget.</p>
  <h3>What Can Be Listed</h3>
  <ul>
    <li>Cars, trucks, motorcycles, ATVs</li>
    <li>Boats and watercraft</li>
    <li>RVs and travel trailers</li>
    <li>Construction and farm equipment</li>
    <li>Palletized freight and partial loads</li>
    <li>Specialty and oversized loads</li>
  </ul>
</div>

<div class="section">
  <h2>For Carriers</h2>
  <p>If you have a trailer, flatbed, tow truck, enclosed transporter, or other hauling equipment, the GUBER Load Board is where you find loads that fill your capacity. Browse by origin, destination, load type, and rate. Build your carrier profile and track record on GUBER's platform.</p>
</div>

<div class="section">
  <h2>Trust, Payments, and Documentation</h2>
  <p>GUBER's escrow payment system holds shipper funds until delivery is confirmed. Pre-transport and post-transport condition documentation can be arranged through GUBER's See For Me service — creating a clear record of the item's condition at pickup and delivery.</p>
  <div class="related-links">
    <a href="/discover/transport/">Transport Hub</a>
    <a href="/discover/transport/car-hauling/">Car Hauling Specifically</a>
    <a href="/discover/features/see-for-me/">Pre-Transport Inspection</a>
    <a href="/discover/features/payments/">Escrow Payments</a>
    <a href="/discover/features/trust-by-action/">Carrier Trust Profiles</a>
  </div>
</div>

<div class="cta-block">
  <h2>Access the GUBER Load Board</h2>
  <p>Post a load or find something to haul — join GUBER free.</p>
  <a href="/signup" class="cta-btn">Join the Load Board</a>
</div>`;

  return page({
    title: "GUBER Load Board — Vehicle & Freight Transport Marketplace",
    description: "GUBER's Load Board connects shippers with carriers for vehicle, equipment, boat, RV, and freight transport across the US. Post a load or find loads to haul.",
    canonical: "/discover/features/load-board/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Load Board", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "A logistics marketplace connecting shippers and carriers for vehicle, equipment, and freight transport.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 15. /discover/features/trust-by-action/
function featureTrust(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Trust by Action", url: "/discover/features/trust-by-action/" }];
  const body = `
<div class="page-hero">
  <h1>Trust by Action — GUBER's Real-World Accountability System</h1>
  <p class="lead">GUBER builds trust through verified real-world activity — not just star ratings. Trust by Action creates a verifiable record of what users have actually done, completed, and been present for.</p>
</div>

<div class="section">
  <h2>Why Real-World Trust Is Different</h2>
  <p>Star ratings are easy to game. Anybody can have five stars. GUBER's Trust by Action system goes further: it creates a record of verified GPS presence, completed transactions, confirmed deliveries, and real-world activity that can't be faked with a review.</p>
</div>

<div class="section">
  <h2>What Contributes to a GUBER Trust Profile</h2>
  <h3>Identity Verification</h3>
  <p>Users who complete GUBER's identity verification have a confirmed real-world identity on file — adding a layer of accountability that anonymous profiles lack.</p>
  <h3>Completed Work</h3>
  <p>Every job completed through GUBER adds to a worker's track record. Hirers can see how many jobs a worker has completed, in what categories, and at what completion rate.</p>
  <h3>GPS-Confirmed Presence</h3>
  <p>For jobs where physical presence matters — inspections, deliveries, task completion — GUBER's platform can record GPS confirmation that the worker was actually at the required location.</p>
  <h3>Verified Transactions</h3>
  <p>Payments processed through GUBER's escrow system create a verified transaction history — demonstrating a pattern of reliable commercial activity.</p>
</div>

<div class="section">
  <h2>For Hirers: What to Look For</h2>
  <p>When hiring on GUBER, look for workers with verified identities, completed job histories, and GPS-confirmed presence records. These signals indicate a reliable, accountable worker — not just someone with a high rating.</p>
</div>

<div class="section">
  <h2>For Workers: Build Your Record</h2>
  <p>Every job you complete on GUBER builds your Trust by Action profile. Over time, this creates a portable record of real-world reliability that makes you more attractive to hirers across every category.</p>
  <div class="related-links">
    <a href="/discover/features/see-for-me/">See For Me</a>
    <a href="/discover/features/payments/">Payments &amp; Escrow</a>
    <a href="/discover/verification/">Verification Services</a>
    <a href="/discover/work/">Find Work</a>
    <a href="/discover/hire/">Hire Verified Workers</a>
  </div>
</div>

<div class="cta-block">
  <h2>Build Your GUBER Trust Profile</h2>
  <p>Start completing jobs and building a verifiable real-world reputation on GUBER.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "Trust by Action — GUBER's Real-World Accountability System",
    description: "GUBER's Trust by Action system builds trust through verified GPS presence, completed transactions, and identity verification — not just star ratings.",
    canonical: "/discover/features/trust-by-action/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "Trust by Action — GUBER", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Real-world accountability system that creates verifiable trust profiles through GPS presence, completed jobs, and identity verification." }],
    breadcrumbs: crumbs,
    body,
  });
}

// 16. /discover/features/cash-drops/
function featureCashDrops(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Cash Drops", url: "/discover/features/cash-drops/" }];
  const body = `
<div class="page-hero">
  <h1>Cash Drops — GUBER's Local Opportunity Events</h1>
  <p class="lead">GUBER Cash Drops are community events where credits, rewards, and opportunities are made available in specific local areas — encouraging real-world participation and local discovery.</p>
</div>

<div class="section">
  <h2>What Are Cash Drops?</h2>
  <p>A Cash Drop is a promotional event where GUBER makes credits or rewards available in a specific geographic area. Users who are physically present in that area during the event window can participate and claim rewards. Cash Drops are a way for GUBER to reward real-world participation and drive local engagement.</p>
  <p>Cash Drops are community engagement events — they are not regular jobs or guaranteed income. They're a way to discover GUBER and earn credits alongside the platform's core earning features.</p>
</div>

<div class="section">
  <h2>How to Participate</h2>
  <p>Cash Drops are announced through the GUBER app. The Live Opportunity Map shows active Cash Drop events in your area. Participation requires being physically present in the designated area during the event window.</p>
  <h3>Cash Drop Credits</h3>
  <p>Rewards from Cash Drops are issued as GUBER credits, which can be applied toward platform activity. Credit values and redemption terms are set per event.</p>
</div>

<div class="section">
  <h2>Community Missions</h2>
  <p>Alongside Cash Drops, GUBER also runs Community Missions — goal-based activities that reward users for completing specific real-world tasks or contributing to their local GUBER community.</p>
</div>

<div class="section">
  <h2>Related</h2>
  <div class="related-links">
    <a href="/discover/local/">Local Opportunities</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
    <a href="/discover/work/">Regular Work &amp; Earning</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
  </div>
</div>

<div class="cta-block">
  <h2>Find Cash Drops Near You</h2>
  <p>Join GUBER and watch the Live Opportunity Map for Cash Drop events in your area.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "Cash Drops — GUBER Local Opportunity Events & Community Rewards",
    description: "GUBER Cash Drops are location-based community events where credits and rewards are available to users who are physically present. Discover local GUBER activity near you.",
    canonical: "/discover/features/cash-drops/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs)],
    breadcrumbs: crumbs,
    body,
  });
}

// 17. /discover/features/barter/
function featureBarter(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Barter", url: "/discover/features/barter/" }];
  const body = `
<div class="page-hero">
  <h1>Barter on GUBER — Trade Skills, Services &amp; Items Locally</h1>
  <p class="lead">Not every transaction needs cash. GUBER supports barter-style work arrangements — when posting a job, users can specify a barter payment type, agreeing to exchange skills or services in place of cash payment.</p>
</div>

<div class="section">
  <h2>Why Barter?</h2>
  <p>Barter is one of the oldest forms of economic exchange. GUBER supports it natively — when posting a job, users can specify a barter arrangement rather than a cash payment, making it possible to exchange skills and services even when cash isn't the right fit.</p>
  <p>Common barter scenarios on GUBER include lawn care in exchange for tech help, skilled labor in exchange for use of equipment, or service trades between local individuals and businesses.</p>
</div>

<div class="section">
  <h2>How Barter Works on GUBER</h2>
  <h3>Post a Barter Job</h3>
  <p>When posting a job, GUBER lets you specify a barter arrangement — describing what you're offering in exchange and what you're looking to receive, so applicants know what type of payment to expect.</p>
  <h3>Agree on Terms</h3>
  <p>Work out the details of the barter arrangement directly with the other party. Both sides are clear on what's being exchanged before work begins.</p>
  <h3>Complete the Arrangement</h3>
  <p>Both parties confirm completion. The exchange is recorded in both users' GUBER histories, contributing to their activity records on the platform.</p>
</div>

<div class="section">
  <h2>Related</h2>
  <div class="related-links">
    <a href="/discover/marketplace/">GUBER Marketplace</a>
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/services/">Local Services</a>
    <a href="/discover/work/">Work &amp; Earn</a>
  </div>
</div>

<div class="cta-block">
  <h2>Start Bartering on GUBER</h2>
  <p>Trade what you have for what you need — locally and fairly.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "Barter on GUBER — Trade Skills & Services Locally",
    description: "GUBER supports barter-style work arrangements — post a job with a barter payment type and exchange skills or services with local users instead of cash.",
    canonical: "/discover/features/barter/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Barter", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "GUBER supports barter job arrangements — post or accept work where payment is agreed as a skill or service exchange rather than cash.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 18. /discover/features/payments/
function featurePayments(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Payments & Escrow", url: "/discover/features/payments/" }];
  const body = `
<div class="page-hero">
  <h1>Payments &amp; Escrow on GUBER</h1>
  <p class="lead">GUBER's built-in payment system protects both hirers and workers. Funds are held securely in escrow until work is completed — eliminating one of the biggest sources of conflict in real-world transactions.</p>
</div>

<div class="section">
  <h2>How GUBER Payments Work</h2>
  <h3>For Hirers</h3>
  <p>When you fund a job on GUBER, your payment is authorized and held. The funds are not captured until the job reaches completion — so you're not paying for work that hasn't been done. You confirm completion to release the payment to the worker.</p>
  <h3>For Workers</h3>
  <p>Once the hirer confirms a job is complete, GUBER processes the payment release to your account. You're not chasing invoices or waiting on manual transfers — the confirmation triggers the payment flow automatically.</p>
</div>

<div class="section">
  <h2>Why Escrow Matters in Local Commerce</h2>
  <p>Without escrow, local transactions rely on trust that hasn't been earned. Hirers worry about paying for work that doesn't happen. Workers worry about doing work they won't get paid for. GUBER's escrow system creates a fair middle ground: pay-on-completion, protected for everyone.</p>
</div>

<div class="section">
  <h2>Escrow Across GUBER's Categories</h2>
  <p>GUBER's payment protection applies across the platform — jobs, transport, marketplace, and services. Whenever a transaction flows through GUBER's payment system, the escrow model protects both parties.</p>
  <div class="related-links">
    <a href="/discover/features/trust-by-action/">Trust by Action</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
    <a href="/discover/features/load-board/">Load Board Payments</a>
    <a href="/discover/marketplace/">Marketplace Payments</a>
    <a href="/discover/features/see-for-me/">Verified Inspection + Escrow</a>
  </div>
</div>

<div class="cta-block">
  <h2>Transact Safely on GUBER</h2>
  <p>Every job on GUBER comes with built-in payment protection — join free.</p>
  <a href="/signup" class="cta-btn">Join GUBER Free</a>
</div>`;

  return page({
    title: "Payments & Escrow on GUBER | Secure Local Transactions",
    description: "GUBER's escrow payment system holds funds until work is confirmed complete — protecting both hirers and workers on every local transaction.",
    canonical: "/discover/features/payments/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Payments & Escrow", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Escrow-backed payment system for local jobs, services, transport, and marketplace transactions." }],
    breadcrumbs: crumbs,
    body,
  });
}

// 19. /discover/features/opportunity-map/
function featureMap(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Opportunity Map", url: "/discover/features/opportunity-map/" }];
  const body = `
<div class="page-hero">
  <h1>Live Opportunity Map — See What's Near You in Real Time</h1>
  <p class="lead">GUBER's Live Opportunity Map shows active jobs, tasks, transport needs, and local activity near any location — updated in real time so you always know what's available right now.</p>
</div>

<div class="section">
  <h2>What the Map Shows</h2>
  <p>The Live Opportunity Map is a real-time geographic view of GUBER activity. As jobs are posted and tasks go live, they appear on the map immediately. Workers can see exactly where opportunities are — not just a list, but a visual picture of what's close and what's accessible.</p>
  <h3>Jobs &amp; Tasks</h3>
  <p>Every active GUBER job posting appears on the map with its approximate location. Workers see a cluster of nearby opportunities and can quickly identify what fits their route and schedule.</p>
  <h3>Transport Loads</h3>
  <p>Load Board entries appear on the map at their pickup location, helping carriers spot available loads along their regular routes.</p>
  <h3>Cash Drops &amp; Events</h3>
  <p>Active Cash Drops and community missions appear on the map as timed local events — visible to users in the area during the active window.</p>
</div>

<div class="section">
  <h2>How Workers Use the Map</h2>
  <p>Open the map on your way to any location and scan for jobs nearby. Filter by category, pay range, or job type. Spot urgent jobs that need immediate attention. Build your day's work around what's geographically accessible.</p>
</div>

<div class="section">
  <h2>How Hirers Use the Map</h2>
  <p>Hirers can see the density of available workers in their area and gauge expected response times. The map also shows whether GUBER is active in their area before they post.</p>
  <div class="related-links">
    <a href="/discover/local/">Local Opportunities Hub</a>
    <a href="/discover/work/jobs-near-me/">Jobs Near Me</a>
    <a href="/discover/features/cash-drops/">Cash Drops on the Map</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire</a>
    <a href="/discover/features/load-board/">Load Board on the Map</a>
  </div>
</div>

<div class="cta-block">
  <h2>Explore the Live Opportunity Map</h2>
  <p>Join GUBER free and see what's active near you right now.</p>
  <a href="/signup" class="cta-btn">See What's Near Me</a>
</div>`;

  return page({
    title: "Live Opportunity Map — Real-Time Local Jobs & Tasks Near You | GUBER",
    description: "GUBER's Live Opportunity Map shows active jobs, tasks, transport loads, and local events near any location in real time — updated as opportunities are posted.",
    canonical: "/discover/features/opportunity-map/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs)],
    breadcrumbs: crumbs,
    body,
  });
}

// 20. /discover/work/jobs-near-me/
function jobsNearMe(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Work", url: "/discover/work/" }, { name: "Jobs Near Me", url: "/discover/work/jobs-near-me/" }];
  const body = `
<div class="page-hero">
  <h1>Jobs Near Me — Find Local Work on GUBER</h1>
  <p class="lead">Browse jobs posted in your area right now on GUBER's work marketplace. Tasks, services, hauling, inspections, and more — from hirers who need local help today.</p>
</div>

<div class="section">
  <h2>How to Find Jobs Near You on GUBER</h2>
  <p>GUBER's job feed and Live Opportunity Map both surface local work based on your location. Create a free account, enable location access, and GUBER immediately shows you active jobs within your range — sorted by proximity, pay, and urgency.</p>
</div>

<div class="section">
  <h2>Types of Jobs Near You on GUBER</h2>
  <div class="card-grid">
    <div class="card"><h3>Moving &amp; Labor</h3><p>Help homeowners, renters, and businesses move furniture, boxes, and equipment from A to B.</p></div>
    <div class="card"><h3>Delivery &amp; Courier</h3><p>Same-day local deliveries for items, packages, and purchases within your area.</p></div>
    <div class="card"><h3>Lawn &amp; Property</h3><p>Mowing, trimming, yard cleanup, pressure washing, and exterior property tasks.</p></div>
    <div class="card"><h3>Vehicle Inspection</h3><p>Visit vehicles and properties on behalf of remote buyers — document conditions with photos and GPS confirmation.</p></div>
    <div class="card"><h3>Hauling &amp; Transport</h3><p>If you have a trailer, find loads to haul on GUBER's Load Board along your local routes.</p></div>
    <div class="card"><h3>General Tasks</h3><p>Assembly, errands, event setup, cleanup, and dozens of other everyday tasks that hirers post constantly.</p></div>
  </div>
</div>

<div class="section">
  <h2>Same-Day Work Near You</h2>
  <p>Many GUBER jobs are posted for same-day or next-day completion. Hirers mark urgent jobs clearly — and GUBER's notification system alerts nearby workers immediately when an urgent job is posted in their area.</p>
</div>

<div class="section">
  <h2>Getting Paid for Local Work</h2>
  <p>All GUBER jobs are paid through the platform. When you complete a job and the hirer confirms, GUBER releases payment to your account. No chasing invoices, no payment uncertainty.</p>
  <div class="related-links">
    <a href="/discover/work/">Work Hub</a>
    <a href="/discover/work/gig-work/">Gig Work Options</a>
    <a href="/discover/work/side-gigs/">Side Gigs</a>
    <a href="/discover/features/opportunity-map/">Live Map of Jobs Near Me</a>
    <a href="/discover/features/payments/">How GUBER Pays</a>
  </div>
</div>

<div class="section">
  <h2>FAQ: Finding Jobs Near Me on GUBER</h2>
  <div class="faq-item"><p class="faq-q">Do I need experience to find jobs on GUBER?</p><p class="faq-a">Many GUBER jobs require no prior experience — moving help, general labor, errands, and basic tasks are open to most applicants. Other categories reward specific skills or equipment.</p></div>
  <div class="faq-item"><p class="faq-q">How quickly can I start working?</p><p class="faq-a">After creating an account and completing your profile, you can begin applying for jobs immediately. Some hirers review applications within minutes for urgent work.</p></div>
  <div class="faq-item"><p class="faq-q">How far should I be willing to travel for jobs?</p><p class="faq-a">That's your call. GUBER lets you filter jobs by distance. Many workers set a radius they're comfortable with and focus on high-value jobs within that range.</p></div>
</div>

<div class="cta-block">
  <h2>Find Jobs Near You on GUBER</h2>
  <p>Create a free account and see what's available in your area right now.</p>
  <a href="/signup" class="cta-btn">Find Local Work</a>
</div>`;

  return page({
    title: "Jobs Near Me | Find Local Work Today on GUBER",
    description: "Find jobs near you on GUBER — local tasks, moving help, delivery, inspections, lawn care, hauling, and more. Browse opportunities posted by hirers in your area today.",
    canonical: "/discover/work/jobs-near-me/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Local Jobs", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Find local jobs and tasks near you on GUBER's work marketplace.", "areaServed": { "@type": "Country", "name": "United States" } },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Do I need experience to find jobs on GUBER?", "acceptedAnswer": { "@type": "Answer", "text": "Many GUBER jobs require no prior experience — moving help, general labor, errands, and basic tasks are open to most applicants." } }, { "@type": "Question", "name": "How quickly can I start working?", "acceptedAnswer": { "@type": "Answer", "text": "After creating an account and completing your profile, you can begin applying for jobs immediately. Some hirers review applications within minutes for urgent work." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 21. /discover/work/gig-work/
function gigWork(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Work", url: "/discover/work/" }, { name: "Gig Work", url: "/discover/work/gig-work/" }];
  const body = `
<div class="page-hero">
  <h1>Gig Work Near You — Flexible Local Opportunities on GUBER</h1>
  <p class="lead">GUBER's work marketplace includes a wide range of flexible, short-term opportunities — the kind of gig work that lets you set your own schedule, pick your own jobs, and earn on your terms.</p>
</div>

<div class="section">
  <h2>What Makes GUBER's Gig Work Different</h2>
  <p>Many gig platforms lock you into one category — driving, delivering, tasking. GUBER is different: your skills, vehicle, equipment, and availability all contribute to which opportunities you can access. A GUBER worker might do a moving job in the morning, a vehicle inspection in the afternoon, and haul a load on the weekend — all through one platform.</p>
</div>

<div class="section">
  <h2>Types of Gig Work on GUBER</h2>
  <h3>Task-Based Gigs</h3>
  <p>Short, defined tasks with clear start and end points — moving, cleaning, yard work, assembly, errands. You know what you're getting into before you apply.</p>
  <h3>Inspection &amp; Verification Gigs</h3>
  <p>Visit a vehicle, property, or item, document its condition with your phone, and submit a report. Usually a few hours of work with a defined deliverable.</p>
  <h3>Transport &amp; Hauling Gigs</h3>
  <p>If you have a trailer, truck, or tow setup, transport gigs through GUBER's Load Board pay by the load — often significantly more than task work.</p>
  <h3>Delivery Gigs</h3>
  <p>Local pickup and delivery for items, purchases, and packages. Work when you want, as many runs as fits your day.</p>
</div>

<div class="section">
  <h2>Building Gig Income on GUBER</h2>
  <p>GUBER's gig workers who perform well and build their Trust by Action profiles over time tend to see more applications accepted and more opportunities opened to them. Reliability, completion rate, and GPS-confirmed presence all contribute to a stronger gig worker profile.</p>
  <div class="related-links">
    <a href="/discover/work/">Work Hub</a>
    <a href="/discover/work/jobs-near-me/">Jobs Near Me</a>
    <a href="/discover/work/side-gigs/">Side Gigs</a>
    <a href="/discover/features/trust-by-action/">Build Your Trust Profile</a>
    <a href="/discover/features/opportunity-map/">Live Opportunity Map</a>
  </div>
</div>

<div class="cta-block">
  <h2>Find Gig Work on GUBER</h2>
  <p>Set your own schedule. Choose your own jobs. Earn on your terms.</p>
  <a href="/signup" class="cta-btn">Start Gig Work on GUBER</a>
</div>`;

  return page({
    title: "Gig Work Near You — Flexible Local Earning Opportunities | GUBER",
    description: "Find gig work near you on GUBER — flexible local opportunities including tasks, inspections, delivery, hauling, and more. Work on your schedule, earn on your terms.",
    canonical: "/discover/work/gig-work/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Gig Work", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Flexible local gig work opportunities including tasks, inspections, delivery, and hauling.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 22. /discover/work/side-gigs/
function sideGigs(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Work", url: "/discover/work/" }, { name: "Side Gigs", url: "/discover/work/side-gigs/" }];
  const body = `
<div class="page-hero">
  <h1>Side Gigs — Earn Extra Income Locally with GUBER</h1>
  <p class="lead">GUBER is built for people with a full-time life who want to earn more. Side gigs on GUBER fit around your schedule — pick up work when you have time, and skip it when you don't.</p>
</div>

<div class="section">
  <h2>Why GUBER for Side Income</h2>
  <p>Unlike platforms that require you to be constantly available to earn, GUBER's job marketplace lets you apply when opportunities fit your schedule. You're not penalized for being selective. You're rewarded for being reliable when you do take a job.</p>
</div>

<div class="section">
  <h2>Side Gigs That Fit Around a Full-Time Schedule</h2>
  <h3>Weekend Work</h3>
  <p>Moving jobs, yard work, hauling, and one-time tasks are commonly posted for weekend availability. Weekend workers on GUBER are in consistent demand.</p>
  <h3>Evening Deliveries</h3>
  <p>Local delivery runs can often be completed in evenings — a few hours of income after your regular job.</p>
  <h3>Vehicle Inspections</h3>
  <p>Inspection requests can often be completed at your convenience — as long as the seller has the vehicle available. Schedule around your day.</p>
  <h3>Skills You Already Have</h3>
  <p>Tech support, small repairs, tutoring, consulting, photography — if your skills are in demand locally, GUBER is a channel to monetize them outside your regular job.</p>
</div>

<div class="section">
  <h2>Turning Assets Into Side Income</h2>
  <p>GUBER's platform isn't limited to your time. A truck with a hitch can earn on the Load Board. A trailer can turn weekend drives into paid hauls. An SUV or van can support local delivery runs. GUBER helps you see the earning potential in what you already own.</p>
  <div class="related-links">
    <a href="/discover/work/">Work Hub</a>
    <a href="/discover/work/jobs-near-me/">Jobs Near Me</a>
    <a href="/discover/work/gig-work/">Gig Work</a>
    <a href="/discover/features/earn-hire/">Earn &amp; Hire Feature</a>
    <a href="/discover/features/load-board/">Load Board for Extra Hauling Income</a>
  </div>
</div>

<div class="cta-block">
  <h2>Start Your GUBER Side Gig</h2>
  <p>Join free, set your availability, and pick up work when it fits.</p>
  <a href="/signup" class="cta-btn">Earn Extra on GUBER</a>
</div>`;

  return page({
    title: "Side Gigs Near You — Earn Extra Income Locally | GUBER",
    description: "Find side gigs on GUBER to earn extra income locally — weekend work, evening delivery, vehicle inspections, hauling, and skills-based work that fits around your schedule.",
    canonical: "/discover/work/side-gigs/",
    jsonLd: [orgSchema(), breadcrumbSchema(crumbs), { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Side Gigs", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Local side gig opportunities that fit around a full-time schedule — tasks, delivery, inspections, and skills-based work.", "areaServed": { "@type": "Country", "name": "United States" } }],
    breadcrumbs: crumbs,
    body,
  });
}

// 23. /discover/hire/local-workers/
function hireLocalWorkers(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Hire", url: "/discover/hire/" }, { name: "Hire Local Workers", url: "/discover/hire/local-workers/" }];
  const body = `
<div class="page-hero">
  <h1>Hire Local Workers Near Me — GUBER</h1>
  <p class="lead">Post a job on GUBER and connect with qualified local workers in your area — ready to help with tasks, services, hauling, inspections, and more.</p>
</div>

<div class="section">
  <h2>Finding Local Workers Has Never Been Simpler</h2>
  <p>GUBER's local worker network spans communities across the United States. When you post a job, your listing reaches workers who are actually nearby — not contractors who commute across the metro or freelancers who only work remotely.</p>
  <p>GUBER workers are local people: neighbors, community members, and skilled individuals who have chosen to work independently through GUBER's platform.</p>
</div>

<div class="section">
  <h2>Who Hires Local Workers on GUBER</h2>
  <h3>Homeowners</h3>
  <p>Moving, yard work, cleaning, repairs, and home maintenance — tasks that need local, in-person help from someone reliable.</p>
  <h3>Small Businesses</h3>
  <p>Loading and unloading, deliveries, event setup, cleaning crews, and trade work — local businesses use GUBER to staff short-term needs quickly without the overhead of a staffing agency.</p>
  <h3>Buyers and Sellers</h3>
  <p>Anyone making a major purchase can hire a local GUBER worker to inspect the item before buying — creating a layer of confidence in any transaction.</p>
  <h3>Property Managers</h3>
  <p>Condition reports, turnover cleaning, small repairs, and tenant-related tasks — GUBER provides a fast channel to local help when a property needs attention.</p>
</div>

<div class="section">
  <h2>Verified, Accountable Workers</h2>
  <p>GUBER's Trust by Action system means the local workers you hire have verifiable track records. Look for identity-verified workers, completed job histories, and GPS-confirmed presence records before selecting who to hire.</p>
  <div class="related-links">
    <a href="/discover/hire/">Hire Hub</a>
    <a href="/discover/features/trust-by-action/">Understanding Trust by Action</a>
    <a href="/discover/features/payments/">How Payments Work</a>
    <a href="/discover/services/">Local Services Available</a>
    <a href="/discover/verification/">Verification Services</a>
  </div>
</div>

<div class="section">
  <h2>FAQ: Hiring Local Workers on GUBER</h2>
  <div class="faq-item"><p class="faq-q">How quickly can I find a worker?</p><p class="faq-a">For many common task types in active areas, applications come in within hours. Urgent jobs marked as such on GUBER trigger immediate notifications to nearby workers.</p></div>
  <div class="faq-item"><p class="faq-q">How do I know a worker is trustworthy?</p><p class="faq-a">Look for identity-verified workers with completed job history on their profile. GUBER's Trust by Action profiles show real, verifiable track records — not just star ratings.</p></div>
  <div class="faq-item"><p class="faq-q">What if the work isn't done to my satisfaction?</p><p class="faq-a">GUBER's escrow payment system means funds aren't released until you confirm completion. If there's a dispute, GUBER's resolution process provides a structured path to resolution.</p></div>
</div>

<div class="cta-block">
  <h2>Hire Local Help Through GUBER</h2>
  <p>Post your job in minutes and connect with nearby workers today.</p>
  <a href="/signup" class="cta-btn">Post a Job on GUBER</a>
</div>`;

  return page({
    title: "Hire Local Workers Near Me | GUBER Local Hiring Platform",
    description: "Hire local workers near you on GUBER for tasks, services, moving, delivery, inspections, and more. Verified, accountable workers with real track records.",
    canonical: "/discover/hire/local-workers/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Local Worker Hiring", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Hire local workers for tasks, services, moving, delivery, inspections, and more.", "areaServed": { "@type": "Country", "name": "United States" } },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "How do I know a worker is trustworthy?", "acceptedAnswer": { "@type": "Answer", "text": "Look for identity-verified workers with completed job history on their profile. GUBER's Trust by Action profiles show real, verifiable track records." } }, { "@type": "Question", "name": "How quickly can I find a worker?", "acceptedAnswer": { "@type": "Answer", "text": "For many common task types in active areas, applications come in within hours. Urgent jobs trigger immediate notifications to nearby workers." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 24. /discover/transport/car-hauling/
function carHauling(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Transport", url: "/discover/transport/" }, { name: "Car Hauling", url: "/discover/transport/car-hauling/" }];
  const body = `
<div class="page-hero">
  <h1>Car Hauling &amp; Vehicle Transport — GUBER Load Board</h1>
  <p class="lead">Need a car, truck, or other vehicle transported? GUBER's Load Board connects vehicle shippers with carriers who have the right equipment and routes to move it.</p>
</div>

<div class="section">
  <h2>Shipping a Vehicle Through GUBER</h2>
  <p>Whether you've purchased a vehicle across the country, need to relocate a personal car, or want to move a fleet vehicle, GUBER's Load Board gives you access to a network of carriers ready to quote and haul.</p>
  <h3>Post Your Vehicle Shipping Need</h3>
  <p>Describe the vehicle, pickup and delivery locations, your preferred dates, and your budget. GUBER's carrier network browses available loads and responds with availability.</p>
  <h3>Select Your Carrier</h3>
  <p>Review carrier profiles, their equipment, track records, and pricing. Select the carrier that fits your timeline, budget, and requirements.</p>
  <h3>Pre-Transport Inspection (Optional)</h3>
  <p>Before your vehicle ships, you can request a GUBER See For Me inspection to document its current condition — creating a clear baseline if any transport damage needs to be addressed.</p>
  <h3>Secure Payment</h3>
  <p>GUBER's escrow system holds payment until delivery is confirmed — protecting both shipper and carrier.</p>
</div>

<div class="section">
  <h2>Vehicle Types Shipped Through GUBER</h2>
  <div class="card-grid">
    <div class="card"><h3>Cars &amp; Sedans</h3><p>Open or enclosed transport for personal vehicles, purchased cars, and fleet assets.</p></div>
    <div class="card"><h3>Trucks &amp; SUVs</h3><p>Full-size trucks and SUVs including lifted and modified vehicles that require specialized carriers.</p></div>
    <div class="card"><h3>Motorcycles</h3><p>Crated or soft-tied motorcycle transport for personal and dealer moves.</p></div>
    <div class="card"><h3>Classic &amp; Specialty</h3><p>Enclosed transport for classic cars, show vehicles, and high-value specialty vehicles.</p></div>
    <div class="card"><h3>Inoperable Vehicles</h3><p>Carriers equipped for non-running vehicles, salvage, and project cars.</p></div>
    <div class="card"><h3>Multiple Vehicles</h3><p>Multi-unit transport for dealers, auctions, and fleet moves.</p></div>
  </div>
</div>

<div class="section">
  <h2>For Carriers: Car Hauling Loads on GUBER</h2>
  <p>If you operate a car hauler, flatbed, tow dolly, or enclosed trailer, GUBER's Load Board is a channel for finding vehicles to haul in your area and along your regular routes. Build a carrier profile, browse available loads, and earn on runs that fit your schedule.</p>
</div>

<div class="section">
  <h2>FAQ: Vehicle Transport on GUBER</h2>
  <div class="faq-item"><p class="faq-q">How much does it cost to ship a car through GUBER?</p><p class="faq-a">Costs vary by distance, vehicle type, transport type (open vs. enclosed), and carrier availability in your area. GUBER's Load Board surfaces competitive quotes from carriers — actual pricing depends on your specific route and requirements.</p></div>
  <div class="faq-item"><p class="faq-q">How long does vehicle transport take?</p><p class="faq-a">Transit time depends on the distance and the carrier's route. Local and regional moves can often be completed in 1–3 days. Long-distance transport typically takes longer depending on the carrier's schedule.</p></div>
  <div class="faq-item"><p class="faq-q">Can I ship an inoperable vehicle through GUBER?</p><p class="faq-a">Yes — specify in your posting that the vehicle is non-running, and carriers with appropriate equipment (winch, flatbed, dolly) will be able to respond.</p></div>
</div>

<div class="section">
  <h2>Related</h2>
  <div class="related-links">
    <a href="/discover/transport/">Transport Hub</a>
    <a href="/discover/features/load-board/">Load Board Feature</a>
    <a href="/discover/features/see-for-me/">Pre-Transport Inspection</a>
    <a href="/discover/features/payments/">Transport Escrow</a>
    <a href="/discover/verification/inspect-a-car-remotely/">Inspect Before You Ship</a>
  </div>
</div>

<div class="cta-block">
  <h2>Ship Your Vehicle Through GUBER</h2>
  <p>Post your transport need or browse the Load Board — join free.</p>
  <a href="/signup" class="cta-btn">Access the Load Board</a>
</div>`;

  return page({
    title: "Car Hauling & Vehicle Transport | GUBER Load Board",
    description: "Ship a car, truck, motorcycle, or specialty vehicle through GUBER's Load Board — connecting vehicle shippers with verified carriers. Get a vehicle transported safely and securely.",
    canonical: "/discover/transport/car-hauling/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Car Hauling & Vehicle Transport", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Vehicle transport marketplace — ship cars, trucks, motorcycles, and specialty vehicles through GUBER's Load Board.", "areaServed": { "@type": "Country", "name": "United States" } },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "How much does it cost to ship a car through GUBER?", "acceptedAnswer": { "@type": "Answer", "text": "Costs vary by distance, vehicle type, transport type, and carrier availability. GUBER's Load Board surfaces competitive quotes from carriers based on your specific route and requirements." } }, { "@type": "Question", "name": "Can I ship an inoperable vehicle through GUBER?", "acceptedAnswer": { "@type": "Answer", "text": "Yes — specify in your posting that the vehicle is non-running, and carriers with appropriate equipment will be able to respond." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// 25. /discover/verification/inspect-a-car-remotely/
function inspectCarRemotely(): string {
  const crumbs: Breadcrumb[] = [{ name: "Home", url: "/" }, { name: "Discover", url: "/discover/" }, { name: "Verification", url: "/discover/verification/" }, { name: "Inspect a Car Remotely", url: "/discover/verification/inspect-a-car-remotely/" }];
  const body = `
<div class="page-hero">
  <h1>Inspect a Car Remotely Before You Buy</h1>
  <p class="lead">Buying a used car from someone you've never met? GUBER's remote inspection service sends a verified local worker to physically inspect the vehicle and deliver a GPS-confirmed photo and video report — before you send any money.</p>
</div>

<div class="section">
  <h2>Why a Remote Car Inspection Matters</h2>
  <p>Used car fraud is one of the most common forms of online consumer fraud in the United States. Sellers misrepresent mileage, hide damage, use misleading photos, and misrepresent vehicle history. Buyers who can't visit in person are especially vulnerable.</p>
  <p>A GUBER remote inspection puts real, verified eyes on the vehicle before you commit — at a fraction of what fraud can cost you.</p>
</div>

<div class="section">
  <h2>What a GUBER Remote Vehicle Inspection Covers</h2>
  <h3>Exterior Documentation</h3>
  <p>Every panel, bumper, wheel, and glass surface photographed and assessed for dents, scratches, rust, paint mismatch, accident repair indicators, and frame damage.</p>
  <h3>Interior Documentation</h3>
  <p>Seats, carpet, dashboard, headliner, door panels, and visible electronics — photographed and noted for condition.</p>
  <h3>VIN Confirmation</h3>
  <p>The worker photographs the dashboard VIN plate and door jamb sticker — confirming the vehicle identity matches the listing.</p>
  <h3>Under Hood (Visible Assessment)</h3>
  <p>Fluid levels, visible leaks, battery condition, and obvious mechanical concerns — documented photographically. Note: GUBER workers are not licensed mechanics. This is a visual assessment, not a full mechanical inspection.</p>
  <h3>Warning Lights</h3>
  <p>The worker photographs the instrument cluster with the ignition on to document any active warning or check engine lights.</p>
  <h3>GPS Confirmation</h3>
  <p>The inspection location is GPS-confirmed, so you know the worker was physically at the address where the vehicle is listed.</p>
</div>

<div class="section">
  <h2>How to Request a Remote Car Inspection</h2>
  <p>1. Post a See For Me request in the GUBER app. Include the vehicle's location, the seller's name, and any specific concerns you want documented.</p>
  <p>2. A verified GUBER worker near the vehicle's location accepts and travels to the address.</p>
  <p>3. The worker conducts the inspection and delivers a timestamped report with photos, video, and written notes.</p>
  <p>4. You receive the report and make an informed decision before committing to the purchase.</p>
</div>

<div class="section">
  <h2>What a GUBER Inspection Doesn't Replace</h2>
  <p>A GUBER remote inspection is a visual, photographic survey — not a professional mechanical inspection or a legal vehicle history report. For high-value purchases, consider combining a GUBER inspection with a licensed mechanic's evaluation and a VIN history report.</p>
</div>

<div class="section">
  <h2>FAQ: Remote Car Inspection</h2>
  <div class="faq-item"><p class="faq-q">How fast can I get a remote car inspection through GUBER?</p><p class="faq-a">Depends on worker availability near the vehicle's location. Many inspections are completed same-day or next-day in well-covered areas.</p></div>
  <div class="faq-item"><p class="faq-q">Does the seller need to be present?</p><p class="faq-a">Typically yes — the seller needs to provide access to the vehicle for the inspection. The buyer should coordinate with the seller before requesting the inspection.</p></div>
  <div class="faq-item"><p class="faq-q">Can a GUBER inspection catch hidden mechanical problems?</p><p class="faq-a">GUBER workers document what is visually observable. They can note obvious signs of concern — leaks, warning lights, visible damage — but cannot perform diagnostic tests or mechanical evaluations. Combine with a professional mechanic inspection for full confidence.</p></div>
  <div class="faq-item"><p class="faq-q">Is GUBER's inspection useful for cars sold at auction or from dealers?</p><p class="faq-a">Yes, particularly for out-of-state auction purchases or remote dealer sales where you cannot be physically present before buying.</p></div>
</div>

<div class="section">
  <h2>Related</h2>
  <div class="related-links">
    <a href="/discover/features/see-for-me/">See For Me Full Feature</a>
    <a href="/discover/verification/">Verification Hub</a>
    <a href="/discover/transport/car-hauling/">Ship the Car After You Buy It</a>
    <a href="/discover/marketplace/">GUBER Marketplace</a>
    <a href="/discover/features/trust-by-action/">Worker Trust &amp; Accountability</a>
  </div>
</div>

<div class="cta-block">
  <h2>Get a Remote Car Inspection</h2>
  <p>Don't buy blind. Get real eyes on any vehicle — anywhere in the US.</p>
  <a href="/signup" class="cta-btn">Request an Inspection Now</a>
</div>`;

  return page({
    title: "Inspect a Car Remotely Before You Buy | GUBER Remote Vehicle Inspection",
    description: "GUBER's remote car inspection service sends a verified local worker to photograph and report on any vehicle's condition — GPS-confirmed, before you commit to a purchase.",
    canonical: "/discover/verification/inspect-a-car-remotely/",
    jsonLd: [
      orgSchema(), breadcrumbSchema(crumbs),
      { "@context": "https://schema.org", "@type": "Service", "name": "GUBER Remote Vehicle Inspection", "provider": { "@type": "Organization", "name": "GUBER" }, "description": "Remote car inspection service — a verified local worker inspects any vehicle and delivers a GPS-confirmed photo and video report.", "areaServed": { "@type": "Country", "name": "United States" } },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "How fast can I get a remote car inspection through GUBER?", "acceptedAnswer": { "@type": "Answer", "text": "Many inspections are completed same-day or next-day in well-covered areas, depending on worker availability near the vehicle's location." } }, { "@type": "Question", "name": "Can a GUBER inspection catch hidden mechanical problems?", "acceptedAnswer": { "@type": "Answer", "text": "GUBER workers document what is visually observable — leaks, warning lights, visible damage — but cannot perform diagnostic tests. Combine with a professional mechanic inspection for full confidence." } }] },
    ],
    breadcrumbs: crumbs,
    body,
  });
}

// ─── Route registration ───────────────────────────────────────────────────────

export function setupDiscoverRoutes(app: Express): void {
  const send = (html: string) => (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  };

  // Pre-render all pages at startup (avoids re-rendering on every request)
  const pages: Record<string, string> = {
    "/discover/":                                        discoverIndex(),
    "/discover/what-is-guber/":                         whatIsGuber(),
    "/discover/work/":                                   workHub(),
    "/discover/hire/":                                   hireHub(),
    "/discover/marketplace/":                            marketplaceHub(),
    "/discover/services/":                               servicesHub(),
    "/discover/transport/":                              transportHub(),
    "/discover/verification/":                           verificationHub(),
    "/discover/ai/":                                     aiHub(),
    "/discover/local/":                                  localHub(),
    "/discover/features/jac/":                           featureJac(),
    "/discover/features/earn-hire/":                     featureEarnHire(),
    "/discover/features/see-for-me/":                    featureSeeForMe(),
    "/discover/features/load-board/":                    featureLoadBoard(),
    "/discover/features/trust-by-action/":               featureTrust(),
    "/discover/features/cash-drops/":                    featureCashDrops(),
    "/discover/features/barter/":                        featureBarter(),
    "/discover/features/payments/":                      featurePayments(),
    "/discover/features/opportunity-map/":               featureMap(),
    "/discover/work/jobs-near-me/":                      jobsNearMe(),
    "/discover/work/gig-work/":                          gigWork(),
    "/discover/work/side-gigs/":                         sideGigs(),
    "/discover/hire/local-workers/":                     hireLocalWorkers(),
    "/discover/transport/car-hauling/":                  carHauling(),
    "/discover/verification/inspect-a-car-remotely/":    inspectCarRemotely(),
  };

  // Register each route (with and without trailing slash for resilience)
  for (const [path, html] of Object.entries(pages)) {
    app.get(path, send(html));
    // Also handle without trailing slash (redirect to canonical with slash)
    const noSlash = path.endsWith("/") ? path.slice(0, -1) : null;
    if (noSlash) {
      app.get(noSlash, (_req, res) => res.redirect(301, path));
    }
  }

  // Fallback: anything under /discover/ that isn't matched redirects to hub
  app.get("/discover/*path", (_req: Request, res: Response) => {
    res.redirect(301, "/discover/");
  });

  console.log(`[discover] ${Object.keys(pages).length} SEO pages registered`);
}
