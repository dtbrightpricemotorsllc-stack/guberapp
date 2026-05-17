// GUBER Investor Pitch — single source of truth.
// Edit any value here and the /investors page updates. No other file needs changes.

export const INVESTOR_CONFIG = {
  meta: {
    title: "GUBER — Private Investor Brief",
    description:
      "Trust-enforced local visibility network. Verified identity, on-platform money, structured proof of work. Live on web and Google Play.",
    contactEmail: "Guberapp.global@gmail.com",
    contactPhone: "+12512849412",
    contactPhoneDisplay: "(251) 284-9412",
    contactMobileDisplay: "(251) 284-9412",
    publicUrl: "https://guberapp.com",
    confidentialNote: "Confidential — for invited investors only. Do not redistribute.",
  },

  hero: {
    eyebrow: "PRIVATE INVESTOR BRIEF · 2026",
    headline: "GUBER",
    tagline: "Built by People. Powered by Trust.",
    sub: "The Economic Super App powered by a Human API for Truth. Building America's nationwide layer for work, opportunity, verification, and real-world trust infrastructure. Live on web and Google Play; iOS App Store launch in progress.",
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
      "Hundreds of billions of dollars of micro-services move through informal channels every year with zero infrastructure for trust, payment, or proof.",
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
      "100% opt-in, 100% user-requested. No passive surveillance, no background tracking, no data scraping — a verified human chooses to accept a specific request, captures live visual proof on-site, and the job ends.",
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
      { value: "Live", label: "Product in production", sub: "Web + Google Play · iOS App Store launch in progress" },
      { value: "ID+✓", label: "Verified-helper network growing", sub: "Government ID + selfie required to onboard" },
      { value: "Active", label: "Real jobs flowing through Stripe Connect", sub: "Pay-on-lock-in model · escrow + payout live" },
      { value: "Live", label: "Sponsored Cash Drops in market", sub: "Real winners with public proof on Facebook" },
    ],
    state: [
      "Web PWA is live at guberapp.com and serving real users today.",
      "Native Android live on Google Play since April 8, 2026; iOS submission to Apple App Store in progress.",
      "Brand-funded Cash Drops already paying out to real users (see the proof section below).",
      "Active social presence across LinkedIn, Facebook, TikTok, Instagram, and X — organic engagement of 60–80+ reactions per post with zero paid promotion.",
      "Active product development — shipping continuously, not in maintenance mode.",
      "Founder-built end-to-end (product, full-stack engineering, payments, native Android/iOS, admin tooling).",
      "Day-1 OG founding-supporter tier is live and generating one-time Stripe revenue today.",
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
      { name: "Klin B.", quote: "Cash Drop claimed.", asset: "winner-klin" },
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
      "Sponsored Cash Drops are live in market; multiple winners have publicly posted on Facebook (see proof section).",
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
    sub: "The product is built and the rails are live. Capital is what turns a disciplined solo operation into a scaled, backed one.",
    cards: [
      { title: "Product is shipped", body: "50+ live surfaces on web and Google Play. Capital goes straight to growth, not engineering." },
      { title: "Lean infrastructure built to scale", body: "Idle cost is near-zero. Every dollar raised buys growth, not survival — and the rails are already wired for it." },
      { title: "Optionality across multiple rails", body: "Consumer, helper, and B2B rails are all built and capable today. Volume is being held back by choice while solo — capital removes that ceiling and lets the rails open up on a deliberate timeline." },
      { title: "First-mover trust signal", body: "Live on Google Play; App Store imminent. Verified-identity local marketplaces are still rare — the window to anchor the category is open now." },
    ],
  },

  founder: {
    headline: "About the founder.",
    name: "Dimetris Bowden",
    role: "Founder & CEO, GUBER Global LLC",
    photo: "/founder.jpg",
    body: [
      "The full origin story — 17 years of loss, the realization that opportunity, help, and movement feel invisible when you're struggling, and how that became the foundation for GUBER — lives in Section 06 above (The Other Side of Why).",
      "GUBER was then built solo over ~18 months — product design, full-stack engineering, payments, native mobile, admin tooling, and brand. The platform you're seeing in this brief is the result of shipping continuously, not pitching. Every feature listed is in production code today.",
      "Right now I'm deliberately holding volume back — only accepting the load that one operator can deliver on without compromising the brand. That's a choice, not a gap: until there's a financial cushion for the things one person can't absorb (legal, support load, scaling incidents, the unknowns), opening the rails wider would be reckless rather than ambitious.",
      "I'm raising to buy that cushion and the team behind it: real infrastructure, real coverage on the unknowns, and the paid-acquisition and B2B sales motion that turn a disciplined, verified user base into a self-sustaining nationwide trust network. The rails are built and capable across multiple monetization paths today — capital is what lets us turn them on at scale, backed.",
      "Investors, advisors, operators — anyone who can move quickly and meaningfully — I want to hear from you. The app is live. The window is open. Once GUBER hits scale, this entry point won't exist again.",
    ],
  },

  fundingAsk: {
    headline: "The ask.",
    raise: "$1,000,000 over 18 months",
    valuation: "$15M early-stage valuation framework",
    structure: "Early-stage round. Speed of close is weighted heavily.",
    useHeadline: "Raising $1M over 18 months against a $15M early-stage valuation framework — based on live product, existing deployment, platform infrastructure, market opportunity, trust & verification positioning, and future national expansion potential. Capital deployed across product, growth, operations, business development, support, infrastructure, and working capital.",
    use: [
      "Product Development & Engineering — 30% · $300K",
      "Marketing, Growth & Community Activation — 25% · $250K",
      "Operations, Compliance & Trust / Safety — 15% · $150K",
      "Business Development & Partnerships — 10% · $100K",
      "Customer Support, Moderation & Quality Control — 10% · $100K",
      "Infrastructure, Cloud & Platform Scaling — 5% · $50K",
      "Working Capital & Contingency — 5% · $50K",
    ],
    breakdown: [
      { label: "Product Development & Engineering", pct: 30, amount: "$300K", color: "#39ff14" },
      { label: "Marketing, Growth & Community Activation", pct: 25, amount: "$250K", color: "#a855f7" },
      { label: "Operations, Compliance & Trust / Safety", pct: 15, amount: "$150K", color: "#f59e0b" },
      { label: "Business Development & Partnerships", pct: 10, amount: "$100K", color: "#22c55e" },
      { label: "Customer Support, Moderation & QC", pct: 10, amount: "$100K", color: "#c084fc" },
      { label: "Infrastructure, Cloud & Platform Scaling", pct: 5, amount: "$50K", color: "#fbbf24" },
      { label: "Working Capital & Contingency", pct: 5, amount: "$50K", color: "#9ca3af" },
    ],
    whyNow: [
      "Product is shipped — capital goes straight to growth, not engineering.",
      "GUBER sits at the intersection of digital trust, fraud prevention, identity verification, and the gig economy — large, named, growing markets.",
      "Multiple revenue rails are built and ready — optionality across consumer, helper, and B2B, opened on a deliberate timeline once the operation is backed.",
      "Live on Google Play; App Store imminent — first-mover trust signal in a still-informal market.",
      "The trust & verification category does not have a category leader yet — the window to anchor it is open now.",
    ],
    urgency: "GUBER is built around action over talk. The terms reward investors who move at GUBER speed — same week, not same quarter. This is an early-stage valuation framework, not a guaranteed company worth.",
  },

  cta: {
    headline: "Less talk. Straight action.",
    sub: "This brief is intentionally private. If you're reading it, the founder believes you can move quickly. Email, call, or text — same hour, same day. Investors, advisors, operators with relevant CVs — every serious inbound gets a serious reply.",
    founderName: "Dimetris Bowden",
    founderTitle: "Founder & CEO · 100% owner, GUBER Global LLC",
  },

  cracks: {
    eyebrow: "WHAT'S ACTUALLY WRONG",
    headline: "Four cracks in the real-world economy.",
    items: [
      { num: "01", text: "People with real skills", accent: "can't find work." },
      { num: "02", text: "Buyers make expensive decisions on", accent: "incomplete information." },
      { num: "03", text: "Hiring strangers locally is", accent: "unaccountable." },
      { num: "04", text: "Communities have movement, money, and urgency — but no", accent: "live coordination layer." },
    ],
  },

  whatIsGuber: {
    eyebrow: "WHAT GUBER IS",
    headline: "A trust-enforced visibility network.",
    sub: "Not a job board. Not a marketplace clone. A local visibility layer where verified identity, on-platform money, and structured proof of work are all enforced by the platform — not the user.",
    pillars: [
      { title: "Visibility", body: "Opportunity, people, movement, and money — made instantly visible inside your community." },
      { title: "Verification", body: "Mandatory ID + selfie on both sides. No anonymous accounts, no fake profiles." },
      { title: "Accountability", body: "Every job ends with GPS-verified, timestamped, structured proof — auditable by anyone." },
    ],
  },

  workerSide: {
    eyebrow: "BUILT FOR THE WORKER",
    headline: "Skills become visible. Money becomes real.",
    sub: "If you can do the work — show up, do it well, leave proof — GUBER makes you findable, hire-able, and payable in your own community.",
    bullets: [
      "A verified identity that travels with you — not locked to one platform.",
      "Real local jobs you can actually drive to, with pay confirmed before you start.",
      "Structured proof builds a permanent track record — a portable resume of completed work.",
      "Stripe Connect payouts the moment the job is confirmed — no chasing cash, no off-platform risk.",
    ],
    closer: "GUBER turns invisible labor into visible income.",
  },

  hirerSide: {
    eyebrow: "BUILT FOR THE HIRER",
    headline: "Strangers become trusted help.",
    sub: "Post a need, see verified humans nearby, lock-in a price, and walk away with location-checked, timestamped proof the job actually happened.",
    bullets: [
      "Every helper is ID + selfie verified before they can accept a job.",
      "Money sits in platform-managed escrow until you confirm the work.",
      "Structured smart-forms guide the job — no guesswork, no scope creep.",
      "Disputes are resolved against the evidence, not he-said / she-said.",
    ],
    closer: "GUBER gives you the tools — verified identity, escrowed payment, structured evidence — so you can decide who to trust, with eyes open.",
  },

  viOrigin: {
    eyebrow: "WHY V&I EXISTS",
    headline: "It started with a GT500 — 12 hours away.",
    paragraphs: [
      "A buyer 12 hours away from a dealership wanted to verify a Shelby GT500 before flying out. The dealer's photos were polished. The Carfax was clean. Everything looked perfect on paper.",
      "But the buyer had no way to put a real human, on the ground, in front of that car — to confirm what the listing wasn't showing. No tire wear. No undercarriage. No quick walkaround in good light. Just paperwork and hope.",
      "That's the gap: people make expensive decisions every day using incomplete information. Not because they're careless — because they lack access.",
      "Verify & Inspect was built to close that gap. A verified human on-site, structured checklist, live visual proof — for any decision that's too expensive to make blind.",
    ],
    pullQuote: "People make expensive decisions every day using incomplete information. Not because they're careless. Because they lack access.",
  },

  otherSideOfWhy: {
    eyebrow: "THE OTHER SIDE OF WHY",
    headline: "17 years. Gone. And the realization that built GUBER.",
    paragraphs: [
      "For 17 years, I built my life around someone I loved. I sacrificed opportunities, stability, money, time, and pieces of myself trying to build a future I believed we both wanted.",
      "Then one day, it was just… gone. No real closure. No clear explanation that could justify losing nearly two decades of your life. Just silence, distance, and the realization that the person you built your entire world around no longer saw you as part of theirs.",
      "What made it harder wasn't losing the relationship — it was realizing how quickly a person can become emotionally, financially, and socially disconnected when the foundation they depended on disappears. Trying to survive emotionally while rebuilding financially, mentally, and physically at the same time.",
    ],
    realizationLine: "People are surrounded by opportunity, help, skills, resources, and movement every single day — but when you're struggling, most of it feels invisible.",
    visibilityPillars: ["Opportunity", "Trusted People", "Work", "Movement", "Support", "Real-time Help", "Proof", "Local Activity"],
    closingHeadline: "GUBER isn't just about jobs.",
    closingAccent: "It's about visibility — clarity and accountability.",
    closingFooter: "Proof that even after losing almost everything, something meaningful could still be built from the experience.",
  },

  fictionToReality: {
    eyebrow: "FROM FICTION TO REALITY",
    headline: "The visibility layer cinema imagined. Built by real people.",
    rows: [
      { title: "The Dark Knight", system: "Sonar Surveillance System", sub: "citywide instant awareness." },
      { title: "Furious 7", system: "God's Eye", sub: "find anyone, anywhere, in real time." },
      { title: "Eagle Eye", system: "ARIIA", sub: "every camera, every signal, one feed." },
      { title: "Watch Dogs", system: "ctOS", sub: "central operating system for an entire city." },
      { title: "Person of Interest", system: "The Machine", sub: "real-world events, observed and acted on." },
    ],
    notHeadline: ["Not surveillance.", "Not spying."],
    butLine: "GUBER grounds the same core idea — through permission-based participation.",
    optInBlock: {
      title: "100% Opt-in. 100% User-Requested.",
      sub: "No passive surveillance. No background tracking. No data scraping.",
      body: "A verified human chooses to accept a specific request, captures live visual proof on-site, and the job ends. Cameras are off until a real person opts in for a specific task.",
    },
    consequence: "The result: access to any participating camera phone in the world — but only with explicit consent, only for a specific verified request, only for the duration of that task.",
  },

  trustAsService: {
    eyebrow: "TRUST AS A SERVICE",
    headline: "Software can guess.",
    accent: "A verified human knows.",
    sub: "Every claim on GUBER is backed by a real person at a real location, leaving real proof — not scraped data, not AI guesses. This is the Human API for Truth.",
    primitives: [
      { title: "Verified Identity", body: "Government ID + selfie required to onboard. No anonymous accounts." },
      { title: "On-Platform Money", body: "Stripe Connect escrow + payout. Every dollar is traceable." },
      { title: "Structured Proof", body: "GPS-checked, timestamped, dynamic-checklist evidence on every job." },
      { title: "Permission-Based", body: "Cameras are off until a verified human opts in for a specific request." },
    ],
  },

  liveMap: {
    eyebrow: "THE LIVE MAP",
    headline: "Opportunity made visible — block by block, city by city.",
    sub: "Real Cash Drops, real jobs, real movement, rendered live on the map for every user.",
  },

  badger: {
    eyebrow: "MEET THE BADGER",
    headline: "Trust has a face.",
    sub: "The GUBER badger isn't a mascot — it's the brand promise. Verified. Local. Accountable. The badger shows up wherever a real GUBER user is doing real work in the real world.",
    bullets: [
      "Brand identity that lives on hats, gloves, signage, and across every Cash Drop creative.",
      "Instantly recognizable in social proof — every winner photo, every brand-funded drop.",
      "Built to scale into a cultural mark, not just an app icon.",
    ],
  },

  aiOrNot: {
    eyebrow: "AI OR NOT · TRUST BOX",
    headline: "The fastest way to ask 'is this real?'",
    sub: "$4.99/mo subscription — AI-content detection plus unlimited text verification. Live, paying users today. The consumer-facing edge of GUBER's trust infrastructure.",
    bullets: [
      "Detect AI-generated images and text in seconds.",
      "Unlimited verification queries — no per-check fees.",
      "Built into the same identity + verification rails the rest of the platform runs on.",
    ],
  },

  realityCheck: {
    eyebrow: "REALITY CHECK",
    familiarLine: "At first, GUBER looked familiar —",
    familiarTags: ["Jobs.", "Side money.", "Local help.", "Verification."],
    deeperBody: "But the deeper you went, the more visible the larger system became. Opportunity already exists. Movement already exists. People already exist. Trust already exists.",
    pillars: ["Opportunity", "Movement", "People", "Trust"],
    closer: "GUBER simply makes it visible.",
    deep: "The marketplace is only the entry point. The deeper layer is visibility itself.",
    footer: "Built by people. Powered by trust.",
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
