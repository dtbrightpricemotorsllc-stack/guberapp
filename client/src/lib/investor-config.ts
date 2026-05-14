// GUBER Investor Pitch — single source of truth.
// Edit any value here and the /investors page updates. No other file needs changes.

export const INVESTOR_CONFIG = {
  meta: {
    title: "GUBER — Private Investor Brief",
    description:
      "Trust-enforced local visibility network. Verified identity, on-platform money, structured proof of work. Live on web and Google Play.",
    contactEmail: "Guberapp.global@gmail.com",
    contactPhone: "+13362579787",
    contactPhoneDisplay: "(336) 257-9787",
    contactMobileDisplay: "(251) 284-9412",
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
    headline: "Verify & Inspect — our wedge into a multi-billion-dollar market.",
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
      { title: "GUBER Studio (BETA)", body: "Built-in AI media engine — cinematic clips, viral reels, business commercials, brand music. Credit-pack + monthly-tier monetization, live today." },
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
      { stream: "GUBER Studio — credit packs", who: "End user / creator / business", price: "$5 / $20 / $50 one-time", status: "Live" },
      { stream: "GUBER Studio — Creator tier", who: "Creator", price: "$19 / mo", status: "Live" },
      { stream: "GUBER Studio — Business tier", who: "Business", price: "$99 / mo", status: "Live" },
      { stream: "Sponsored visibility / content licensing", who: "Brand sponsor", price: "Per-impression / pack", status: "Emerging" },
    ],
  },


  traction: {
    headline: "Where we are today.",
    note: "Live on Google Play since April 8, 2026. Apple App Store submission in progress. Organic, community-led marketing is already producing real cash-drop winners and double-digit reaction counts on every post — with zero paid acquisition spend to date.",
    googlePlayLaunchDate: "April 8, 2026",
    googlePlayLaunchPlaceholder: "April 8, 2026",
    stats: [
      { value: "310+", label: "Registered users", sub: "All non-sex-offender screened · 100% organic acquisition" },
      { value: "22", label: "ID-verified helpers", sub: "Government ID + selfie passed" },
      { value: "15", label: "Real jobs posted", sub: "Lifetime, excludes seed/demo data" },
      { value: "27", label: "Sponsored Cash Drops in market", sub: "Real winners, real cash, real photos on Facebook" },
    ],
    state: [
      "Web PWA is live at guberapp.com and serving real users today.",
      "Native Android live on Google Play since April 8, 2026; iOS submission to Apple App Store in progress.",
      "Brand-funded Cash Drops already paying out to real users (see the proof section below).",
      "Active social presence across LinkedIn, Facebook, TikTok, Instagram, and X — organic engagement of 60–80+ reactions per post with zero paid promotion.",
      "Active product development — shipping continuously, not in maintenance mode.",
      "Founder-built end-to-end (product, full-stack engineering, payments, native Android/iOS, admin tooling).",
      "Day-1 OG founding-supporter tier is live and generating one-time Stripe revenue today (24 paid charges to date).",
      "Stripe Connect, escrow, and the money ledger are wired end-to-end and tested.",
      "All revenue streams are either Live or flag-gated — none rely on future engineering.",
    ],
    infra: [
      "50+ live database tables — jobs, payments, money ledger, disputes, business accounts, sponsors, observations, credentials.",
      "50+ user-facing pages across web and native Android (Capacitor).",
      "Stripe Connect wired for split monetization (subscriptions, one-time purchases, and Connect payouts) with separate webhooks.",
      "Cloudinary + Cloudflare R2 already integrated for image / media storage at scale.",
      "Google Sign-in live; Sign in with Apple + Apple Pay in process for the next App Store build.",
      "Push notifications: VAPID web-push and APNs direct delivery for native builds.",
      "Admin panel with role-based access for users, jobs, catalog, disputes, and proof templates.",
    ],
  },




  proof: {
    headline: "Real users. Real cash. Real photos.",
    sub: "Every face below is a real GUBER user who found a sponsored Cash Drop in their city — photographed by them, posted by them, no actors, no staging. This is the kind of organic word-of-mouth paid ads cannot manufacture.",
    consentNote: "All photos are from public posts where users tagged GUBER themselves. First names + last initial used out of respect.",
    winners: [
      { name: "Jamie K.", quote: "Going straight to my church!", asset: "winner-jamie" },
      { name: "Kyle H.", quote: "Found it — took me about 30 minutes.", asset: "winner-kyle" },
      { name: "Klin B.", quote: "Found in the steering wheel.", asset: "winner-klin" },
      { name: "James E.", quote: "Cash Drop winner — early adopter.", asset: "winner-james" },
      { name: "Community", quote: "Real winner. Real cash. No fakes.", asset: "winner-extra" },
      { name: "Engagement", quote: "84 reactions · multiple shares — organic, no paid promo.", asset: "engagement" },
    ],
    creatives: {
      headline: "Marketing already in motion.",
      sub: "Founder-produced creatives running across Facebook, Instagram, TikTok, and X today. Verify & Inspect is the wedge story; the rest of the platform pulls behind it.",
      items: [
        { title: "Launch creative", caption: "\"The Movement Is Live\" — public launch announcement.", asset: "creative-launch" },
        { title: "Verify & Inspect — Wheels, Wings & More", caption: "Vehicle / property / marketplace verification — the B2B wedge.", asset: "creative-vi-wheels" },
        { title: "Verify & Inspect — Hands-Free", caption: "POV hands-free capture for inspections — purpose-built for insurers, dealers, lenders.", asset: "creative-vi-handsfree" },
      ],
    },
    inTheWild: {
      headline: "GUBER out in the wild.",
      sub: "Branded gear showing up at real-world events, in real users' hands. Grassroots brand presence the team is already producing today.",
      items: [
        { title: "GUBER glove at the track", caption: "Spotted at Gulfport Dragway — GUBER-branded gear out in front of a real, live audience.", asset: "wild-dragway" },
        { title: "Jacob McNeal — early supporter", caption: "Driver Jacob McNeal repping GUBER and putting the brand in front of his own following — organic, founder-driven word of mouth.", asset: "wild-driver" },
      ],
    },
    appShots: {
      headline: "The product, live in market.",
      sub: "Real screens from the production app — not mockups.",
      items: [
        { title: "Sponsored Cash Drop map", caption: "Live Cash Drops across the U.S. — drives real installs, real foot traffic, real winners.", asset: "app-map" },
        { title: "User dashboard", caption: "Verify & Inspect, Cash Drops, and Work Types in a single signed-in surface.", asset: "app-dashboard" },
        { title: "Verify & Inspect categories", caption: "Smart-form templates: vehicles, properties, marketplace listings, salvage.", asset: "app-vi" },
        { title: "Guided Job Builder", caption: "Dropdown-driven job posting — structured data, no free-form mistakes.", asset: "app-postjob" },
        { title: "GUBER Studio (BETA)", caption: "AI media engine — cinematic clips, viral reels, business commercials. Live, monetized, baked into every account.", asset: "app-studio" },
        { title: "AI Or Not — Trust Box", caption: "$4.99/mo subscription — AI-content detection plus unlimited text verification. Live, paying users today.", asset: "app-ainot" },
      ],
    },
  },

  studio: {
    eyebrow: "GUBER Studio · Live BETA · Second Revenue Rail",
    headline: "An AI media engine baked into every account.",
    sub: "Most marketplaces hand users to YouTube, Canva, or a freelancer to produce content. GUBER ships a full AI media studio inside the app — and monetizes it on day one.",
    bullets: [
      "Cinematic motion clips from a single reference photo, viral short-form motion videos, business commercials, and brand music — all generated in-app.",
      "Built for the exact users we already have: helpers needing a profile reel, hirers needing a job listing video, and small businesses needing a 5-second commercial they can run today.",
      "Six credit packs ($5 Spark → $200 Whale = 16,000 credits) for casual use, plus three recurring monthly tiers (Standard $10.99/mo, Business $37.99/mo, Enterprise $99/mo) for professional use — all wired through Stripe.",
      "Free 2-credit trial on every signup converts users into paid generations on the same session. Day-1 OG members get +20 credits/month forever.",
      "Sessions are temporary by design — generated assets purge automatically — which keeps storage cost flat as usage scales.",
      "For You feed (admin-curated reel of generations) doubles as an in-app discovery surface that pulls non-Studio users into trying the tool.",
    ],
    purpose: "Studio is the second money rail. The marketplace prints transaction revenue; Studio prints high-margin digital revenue from the same audience — zero extra acquisition cost. Software-margin economics layered on top of marketplace-volume economics.",
    screenshot: { title: "GUBER Studio — generation flow", caption: "Tool picker → reference upload → prompt → cost preview → in-app preview → download. Live in production today." },
  },

  cashDropMargin: {
    eyebrow: "Cash Drops · Sponsor-funded growth engine",
    headline: "Cash Drops pay GUBER ~60% gross margin on every sponsor dollar.",
    sub: "Brand sponsors fund geo-targeted treasure-hunt rewards. GUBER builds the drop, places it on the map, runs the gamification, and pays the winners. Roughly 40% goes to winner cash + costs; ~60% is platform margin.",
    bullets: [
      "Sponsor pays GUBER a single rate to launch a Cash Drop in their target city or zip.",
      "GUBER allocates ~40% to winner payouts, costs, and brand creative; the remaining ~60% is gross platform margin.",
      "Each drop is also a free user-acquisition event — every winner posts proof to social, and every player downloads the app to participate.",
      "27 sponsored Cash Drops have already gone live; multiple winners have publicly posted on Facebook (see proof section).",
    ],
    onPlatformPlan: "Today, sponsor billing is collected directly during the grassroots launch phase. Migrating all sponsor billing onto Stripe in the next release so every sponsor dollar flows through the same money ledger as the rest of the platform — clean invoicing, instant receipts, full audit trail.",
  },

  futurePlans: {
    eyebrow: "What's next",
    headline: "Capital unlocks the two biggest growth multipliers.",
    items: [
      { title: "Unlock the full Marketplace", body: "Expand beyond the launch verticals — bulk job posting, business onboarding, broader category coverage, and the public talent directory at scale." },
      { title: "Expand GUBER Content Studio", body: "Add tools, build out the For You feed, ship a creator program, and convert Studio into a stand-alone upsell for businesses outside the marketplace." },
      { title: "Bring Cash Drop sponsor billing onto Stripe", body: "Move sponsor payments on-platform for clean invoicing, automated receipts, and a single auditable money ledger across every revenue stream." },
      { title: "Apple App Store + Android production launch", body: "Sign in with Apple + Apple Pay shipping in the next iOS submission. Android hardening for full production-grade rollout." },
    ],
  },

  legal: {
    eyebrow: "Built right · Investor-ready",
    headline: "The corporate stack is already in place.",
    sub: "No co-founders to negotiate with. No prior raise to clean up. No cap-table baggage. The legal scaffolding is done so capital can move on day one.",
    items: [
      { label: "Delaware LLC", body: "GUBER Global LLC — Delaware-formed, the structure investors already know how to underwrite." },
      { label: "GUBER trademark", body: "U.S. trademark application filed — protecting the brand mark from day one." },
      { label: "DUNS number", body: "Issued — required for Apple Developer enrollment, Google Play business verification, and B2B procurement." },
      { label: "100% founder-owned", body: "No prior dilution. No SAFEs in the drawer. Whatever you write is the cap table." },
    ],
  },

  whyNow: {
    headline: "Why this round, why now.",
    sub: "The product risk is behind us. The capital risk is the only thing left.",
    cards: [
      { title: "Product is shipped", body: "50+ live surfaces on web and Google Play. Capital goes straight to growth, not engineering." },
      { title: "Lean infrastructure built to scale", body: "Lean infrastructure and multiple revenue streams create strong long-term scaling potential. Idle cost is near-zero, so every dollar raised buys growth, not survival." },
      { title: "Multiple revenue streams hedge risk", body: "Distinct streams across consumer, helper, and B2B. No single bet has to land." },
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
      "Right now I'm growing the platform conservatively and organically — only accepting the volume of jobs the current infrastructure and a one-person operation can fully deliver on. That discipline protects the brand, but it also caps how fast we move.",
      "I'm raising to remove that ceiling: real infrastructure, a real team, and the paid-acquisition and B2B sales motion that turn 294 organic signups into a self-sustaining local marketplace.",
      "Investors, advisors, operators — anyone who can move quickly and meaningfully — I want to hear from you. The app is live. The window is open. Once GUBER hits scale, this entry point won't exist again.",
    ],
  },

  fundingAsk: {
    headline: "The ask.",
    raise: "$150,000 – $300,000",
    valuation: "$1.3M pre-money",
    structure: "Equity or structured profit-share against platform-fee revenue — open to either. Speed of close is weighted heavily.",
    useHeadline: "Capital deploys to scale GUBER nationwide through user growth, business partnerships, platform expansion, and launch execution.",
    use: [
      "User acquisition in key launch cities.",
      "Business partnerships & sponsorship outreach.",
      "Apple App Store + Android production launch.",
      "Infrastructure, operations, and growth runway.",
    ],
    whyNow: [
      "Product is shipped — capital goes straight to growth, not engineering.",
      "Pre-money reflects 310 organic signups and zero paid acquisition; the first paid push moves the number materially.",
      "Multiple revenue streams hedge against any single one not landing.",
      "Live on Google Play; App Store imminent — first-mover trust signal in a still-informal market.",
      "Investors who close before the App Store launch and the first paid metro are getting in at the lowest price this company will ever have.",
    ],
    urgency: "GUBER is built around action over talk. The terms reward investors who move at GUBER speed — same week, not same quarter.",
  },

  cta: {
    headline: "Less talk. Straight action.",
    sub: "This brief is intentionally private. If you're reading it, the founder believes you can move quickly. Email, call, or text — same hour, same day. Investors, advisors, operators with relevant CVs — every serious inbound gets a serious reply.",
    founderName: "Dimetris Bowden",
    founderTitle: "Founder & CEO · 100% owner, GUBER Global LLC",
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
