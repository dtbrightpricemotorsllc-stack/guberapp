// GUBER Investor Pitch — single source of truth.
// Edit any value here and the /investors page updates. No other file needs changes.

export const INVESTOR_CONFIG = {
  meta: {
    title: "GUBER — Private Investor Brief",
    description:
      "Trust-enforced local visibility network. Verified identity, on-platform money, structured proof of work. Live on web and Google Play.",
    contactEmail: "guberapp.global@gmail.com",
    contactPhone: "+1-336-257-9787",
    contactPhoneDisplay: "(336) 257-9787",
    publicUrl: "https://guberapp.com",
    confidentialNote: "Confidential — for invited investors only. Do not redistribute.",
  },

  hero: {
    eyebrow: "PRIVATE INVESTOR BRIEF · 2026",
    headline: "GUBER",
    tagline: "Trust-enforced local visibility network.",
    sub: "The local services marketplace built around verified identity, on-platform money, and structured proof of work. Live on web and Google Play.",
    primaryCta: { label: "VIEW THE OPPORTUNITY", target: "section-funding-ask" },
    secondaryCta: { label: "CONTACT THE FOUNDER", target: "section-investor-cta" },
  },

  problem: {
    headline: "Local help is broken.",
    columns: [
      {
        title: "For the person who needs help",
        bullets: [
          "Craigslist & Facebook groups: anonymous strangers, no recourse, payment off-platform.",
          "TaskRabbit / Handy: rigid categories, opaque pricing, limited geography.",
          "Phone-a-friend: unreliable, awkward, no proof anything actually got done.",
        ],
      },
      {
        title: "For the person who wants to earn",
        bullets: [
          "Gig platforms take 25–40% and dictate the work.",
          "No way to prove a clean track record across platforms.",
          "Cash work has no receipts, no protection, no future.",
        ],
      },
    ],
    closer:
      "Trillions of dollars of micro-services move through informal channels every year with zero infrastructure for trust, payment, or proof.",
  },

  solution: {
    headline: "GUBER is the trust layer.",
    pillars: [
      {
        symbol: "ID",
        title: "Verified identity, both sides",
        body: "Mandatory ID + selfie verification for posters and helpers. No anonymous accounts.",
      },
      {
        symbol: "$",
        title: "Money on-platform",
        body: "Stripe Connect for every dollar. Escrow on lock-in, payout on confirmation. Fully traceable money ledger.",
      },
      {
        symbol: "✓",
        title: "Structured proof of work",
        body: "GPS-verified photos, video, and dynamic checklists. Every job ends with location-checked, timestamped evidence.",
      },
    ],
    closer:
      "A local marketplace where strangers can transact safely — because identity, money, and proof are all enforced by the platform, not the user.",
  },

  viHighlight: {
    headline: "Verify & Inspect — our wedge into a $billions market.",
    sub: "A purpose-built vertical inside the marketplace where verified helpers act as on-the-ground eyes for buyers, insurers, lenders, and online marketplaces.",
    bullets: [
      "Helpers don't certify, diagnose, or appraise — they take clear photos, short video, and submit GPS-verified, timestamped evidence on a structured checklist.",
      "Smart-form templates today cover vehicles, properties, marketplace listings, and salvage; new verticals plug in without code changes.",
      "Every job ends with a structured, location-checked, timestamped evidence bundle the buyer can download, share, and audit.",
      "Direct path to B2B revenue: insurance pre-binding photos, dealer condition reports, and lender collateral checks are all the same primitive.",
    ],
    pricing: "Helper payouts $40–$120+ per V&I job. Platform earns the standard 20% + 3.2% on every transaction, plus future per-API fees on aggregated B2B reports.",
  },

  product: {
    headline: "The core platform.",
    sub: "Not a deck. Not a prototype. 50+ live product surfaces on web and Google Play today.",
    cards: [
      { title: "Jobs Marketplace", body: "Guided builder, V&I smart forms, time-based pricing, barter, milestones, GPS-verified proof, auto-pay-increase." },
      { title: "Direct Offers", body: "Real-time worker→hirer offers via Stripe Connect with structured counters and 60-min expiry." },
      { title: "Cash Drops", body: "Geo-targeted gamified rewards. Brands sponsor. Users hunt. Platform takes share." },
      { title: "Trust Box (AI or Not)", body: "$4.99/mo AI-content detection plus unlimited text verification subscription." },
      { title: "Business Scout Plan", body: "$99/mo recurring B2B plan with 20 talent unlocks/mo and add-on packs." },
      { title: "Observation Marketplace", body: "Workers submit real-world observations with GPS and photo. Businesses buy. 20% platform cut." },
      { title: "V&I Verification", body: "Verify-and-Inspect jobs for vehicles, properties, marketplace listings, and salvage." },
      { title: "GUBER Resume", body: "Auto-tracked work record plus AI-extracted credential cards (CPR, food handler, trade licenses)." },
    ],
  },

  business: {
    headline: "How GUBER makes money.",
    sub: "Multiple distinct revenue streams. All wired to Stripe.",
    rows: [
      { stream: "Job platform fee", who: "Job poster (taken from helper share)", price: "20%", status: "Live" },
      { stream: "Job processing fee", who: "Job poster (added on top)", price: "3.2%", status: "Live" },
      { stream: "Worker cashout — early", who: "Helper", price: "2%", status: "Flag-gated" },
      { stream: "Worker cashout — instant", who: "Helper", price: "5%", status: "Flag-gated" },
      { stream: "Trust Box subscription", who: "End user", price: "$4.99 / mo", status: "Live" },
      { stream: "Day-1 OG tier", who: "Helper / supporter", price: "One-time", status: "Live" },
      { stream: "Business verification", who: "Business", price: "$49 one-time", status: "Live" },
      { stream: "Business Scout Plan", who: "Business", price: "$99 / mo", status: "Live" },
      { stream: "Marketplace boost (7-day featured)", who: "Seller", price: "Per-listing", status: "Live" },
      { stream: "Cash Drop sponsorships", who: "Brand sponsor", price: "Sponsor + platform share", status: "Live" },
      { stream: "Observation marketplace", who: "Business buyer (helper gets 80%)", price: "20% platform fee", status: "Live" },
      { stream: "Direct Offers (Stripe Connect)", who: "Hirer (gross-up math)", price: "Application fee", status: "Live" },
      { stream: "Sponsored visibility / content licensing", who: "Brand sponsor", price: "Per-impression / pack", status: "Emerging" },
    ],
  },

  marketplace: {
    headline: "Five sides. One platform.",
    sides: [
      { title: "Helpers", accent: "green", body: "Earn on local jobs, observations, Cash Drops, and Direct Offers. Build a portable, verified resume.", chips: ["Job earnings", "Observation income", "Trust Box"] },
      { title: "Posters", accent: "green", body: "Anyone needing local help. Pay only when a verified helper locks in. 3.2% processing.", chips: ["Pay-on-lockin", "Auto-pay increase"] },
      { title: "Businesses", accent: "green", body: "Scout verified talent, post bulk jobs, buy observations, sponsor Cash Drops. $99/mo recurring.", chips: ["Scout Plan", "Bulk post", "Talent unlocks"] },
      { title: "Brand Sponsors", accent: "purple", body: "Run gamified, geo-targeted Cash Drops. Reach local users where they already are.", chips: ["Cash Drop sponsor", "Featured boost"] },
      { title: "Data Buyers", accent: "purple", body: "License real-world observations submitted by verified helpers. Vehicle condition, property checks, marketplace authenticity.", chips: ["Observation API", "V&I reports"] },
      { title: "Network effect", accent: "cyan", body: "Every new verified helper makes the marketplace more useful for posters AND more attractive to businesses AND more valuable to data buyers.", chips: [] as string[] },
    ],
  },

  traction: {
    headline: "Where we are today — honestly.",
    note: "Pre-launch / pre-marketing. The platform is shipped and live; paid acquisition has not started yet.",
    googlePlayLaunchDate: "", // EDITABLE: founder fills exact public Google Play launch date here when ready.
    googlePlayLaunchPlaceholder: "Date TBA — founder to confirm",
    stats: [
      { value: "294", label: "Registered users", sub: "Pre-launch organic signups, no paid acquisition" },
      { value: "Live", label: "On Google Play", sub: "Native Android build available today" },
      { value: "~10", label: "Sponsored Cash Drops", sub: "Brand-funded acquisition events live" },
      { value: "0", label: "Paid jobs completed to date", sub: "Pre-launch — by design until the public push" },
    ],
    state: [
      "Web PWA is live and serving users at guberapp.com today.",
      "Domain GUBERAPP.COM is live, owned, and pointed at production.",
      "Active social presence across LinkedIn, Facebook, TikTok, Instagram, and X — links shown below.",
      "Active product development — shipping continuously, not in maintenance mode.",
      "Founder-built end-to-end (product, full-stack engineering, payments, native Android, admin tooling).",
      "Day-1 OG founding-supporter tier is live and generating one-time revenue.",
      "Stripe Connect, escrow, and the money ledger are wired end-to-end and tested.",
      "All 13 revenue streams are either Live or flag-gated — none rely on future engineering.",
      "Google Play public launch date: not yet announced — founder to confirm.",
    ],
    infra: [
      "50+ live database tables — jobs, payments, money ledger, disputes, business accounts, sponsors, observations, credentials.",
      "50+ user-facing pages across web and native Android (Capacitor).",
      "Two Stripe accounts wired for split monetization (subscriptions vs Connect payouts) with separate webhooks.",
      "Push notifications: VAPID web-push and APNs direct delivery for native builds.",
      "OAuth: Google web + native. Sign in with Apple + Apple Pay queued for the next App Store build.",
      "Admin panel with role-based access for users, jobs, catalog, disputes, and proof templates.",
    ],
  },

  cost: {
    headline: "Operating cost ≈ $0/day idle.",
    body: "In April 2026 we re-architected the production deployment from always-warm to true serverless autoscale.",
    bullets: [
      "Eliminated all in-process timers and background jobs.",
      "Moved every periodic sweep behind a single secured external cron endpoint.",
      "Replaced the always-warm pinger with a free 2-minute scheduled GET.",
    ],
    before: "~$50",
    after: "~$0",
    delta: "~99% reduction",
    takeaway:
      "Unit economics work from user #1. Infrastructure scales linearly with revenue, not with calendar time.",
  },

  market: {
    headline: "The market is enormous and informal.",
    cards: [
      { title: "U.S. local services", body: "Roughly $600B+/yr in home services, gig labor, and on-demand help. Most of it is still cash, Craigslist, or word-of-mouth." },
      { title: "Verified-data B2B", body: "Insurance, lending, marketplaces, and OEMs spend billions on third-party physical inspection — addressable with V&I and Observations." },
      { title: "Local advertising", body: "U.S. local digital ad spend exceeds $170B/yr. Cash Drops give brands a measurable, gamified, geo-targeted alternative to display ads." },
    ],
    closer:
      "GUBER doesn't need to win all of any of these markets to be a meaningful business — capturing a fraction of one returns the round.",
  },

  growth: {
    headline: "How we grow.",
    columns: [
      {
        title: "Demand-side levers",
        bullets: [
          "Cash Drops drive viral local downloads — every drop is a free acquisition event funded by the brand sponsor.",
          "Day-1 OG tier creates evangelists. Lower fees plus retention perks in exchange for early adoption.",
          "Performance Shares referral system: referrer earns a share of GUBER's platform fee on referred-user jobs for 30 days. Pure cash, no credits.",
          "SEO: structured job pages indexed by Google with clean URLs and a /jobs sitemap.",
        ],
      },
      {
        title: "Supply-side levers",
        bullets: [
          "Verified-helper directory grows with every job — credentials, ratings, and proof history compound.",
          "B2B Scout Plan drags businesses (and their bulk job volume) onto the platform. Recurring $99/mo.",
          "Observation Marketplace turns passive walking-around into income — a unique on-ramp competitors can't match.",
          "Native Android shipping today; Apple App Store + Sign in with Apple + Apple Pay queued for the next build.",
        ],
      },
    ],
  },

  whyNow: {
    headline: "Why this round, why now.",
    sub: "The product risk is behind us. The capital risk is the only thing left.",
    cards: [
      { title: "Product is shipped", body: "50+ live surfaces on web and Google Play. Capital goes straight to growth, not engineering." },
      { title: "Unit economics already work", body: "April 2026 re-architecture brought idle infrastructure cost from ~$50/day to ~$0/day. We can scale to 100,000 users without breaking the model." },
      { title: "Multiple revenue streams hedge risk", body: "13 distinct streams across consumer, helper, and B2B. No single bet has to land." },
      { title: "First-mover trust signal", body: "Live on Google Play; App Store imminent. Verified-identity local marketplaces are still rare — the window to anchor the category is open now." },
    ],
  },

  founder: {
    headline: "About the founder.",
    name: "Dimetris Bowden",
    role: "Founder & CEO, GUBER Global LLC",
    body: [
      "GUBER was built solo over ~18 months — product design, full-stack engineering, payments, native mobile, admin tooling, and brand.",
      "The platform you're seeing in this brief is the result of shipping continuously, not pitching. Every feature listed under the core platform is in production code today.",
      "I'm raising this round to do exactly one thing I can't do alone: turn 294 organic signups into a self-sustaining local marketplace through paid acquisition and B2B sales.",
    ],
  },

  fundingAsk: {
    headline: "The ask.",
    raise: "$150,000",
    valuation: "$1.3M pre-money",
    structure: "Equity or structured profit-share against platform-fee revenue — open to either.",
    use: [
      "Paid acquisition in 2–3 anchor metros.",
      "B2B sales motion for Scout Plan and Cash Drop sponsorships.",
      "Apple App Store launch polish (Sign in with Apple, Apple Pay).",
      "12 months of runway at sub-$5/day infrastructure cost.",
    ],
    whyNow: [
      "Product is shipped — capital goes straight to growth, not engineering.",
      "Unit economics already work at scale-to-zero infrastructure cost.",
      "Multiple revenue streams hedge against any single one not landing.",
      "Live on Google Play; App Store imminent — first-mover trust signal in a still-informal market.",
    ],
  },

  cta: {
    headline: "Let's talk.",
    sub: "This brief is intentionally private. If you're reading it, the founder wants to hear from you directly.",
    founderName: "Dimetris Bowden",
    founderTitle: "Founder & CEO, GUBER Global LLC",
  },

  socials: [
    { name: "LinkedIn", brand: "linkedin", url: "https://www.linkedin.com/in/dimetris-bowden-6618a0407" },
    { name: "Facebook", brand: "facebook", url: "https://www.facebook.com/share/1AGez7KRoS/" },
    { name: "TikTok", brand: "tiktok", url: "https://www.tiktok.com/@cash_flow_by_guber" },
    { name: "Instagram", brand: "instagram", url: "https://www.instagram.com/guber_global" },
    { name: "X", brand: "x", url: "https://x.com/GuberGlobal" },
  ] as const,
} as const;

export type InvestorSocial = (typeof INVESTOR_CONFIG.socials)[number];
