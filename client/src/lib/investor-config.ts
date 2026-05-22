// GUBER Investor Pitch — single source of truth.
// Edit any value here and the /investors page updates. No other file needs changes.

export interface InvestorSocial {
  brand: "linkedin" | "facebook" | "tiktok" | "instagram" | "x";
  name: string;
  url: string;
}

export const INVESTOR_CONFIG = {
  meta: {
    title: "GUBER — Private Investor Brief",
    description: "Find Work. Hire Help. Verify Things. Live on web and Google Play.",
    contactEmail: "Guberapp.global@gmail.com",
    contactPhone: "+12512849412",
    contactPhoneDisplay: "(251) 284-9412",
    contactMobileDisplay: "(251) 284-9412",
    publicUrl: "https://guberapp.com",
    confidentialNote: "Confidential — for invited investors only. Do not redistribute.",
  },

  socials: [
    { brand: "linkedin" as const, name: "LinkedIn", url: "https://www.linkedin.com/company/guber-global" },
    { brand: "facebook" as const, name: "Facebook", url: "https://www.facebook.com/guberapp" },
    { brand: "tiktok" as const, name: "TikTok", url: "https://www.tiktok.com/@guberapp" },
    { brand: "instagram" as const, name: "Instagram", url: "https://www.instagram.com/guberapp" },
    { brand: "x" as const, name: "X", url: "https://x.com/guberapp" },
  ] satisfies InvestorSocial[],

  // SLIDE 1
  hero: {
    eyebrow: "PRIVATE INVESTOR BRIEF · 2026",
    headline: "GUBER",
    subtitle: ["Find Work.", "Hire Help.", "Verify Things."],
    tagline: "Create Value In Yourself.",
    sub: "A trust-enforced local platform. Verified identity. On-platform payments. Structured proof of work. Live on web and Google Play today.",
    primaryCta: { label: "SEE THE OPPORTUNITY", target: "section-funding" },
    secondaryCta: { label: "CONTACT THE FOUNDER", target: "section-cta" },
  },

  // SLIDE 2
  problem: {
    headline: "The Problem",
    needs: ["Money", "Help", "Proof"],
    body: [
      "A person needing work struggles to find opportunity.",
      "A business needing help struggles to find reliable assistance.",
      "A buyer making a large purchase struggles to verify what they are buying.",
    ],
    closer: "The need exists.\n\nThe visibility does not.",
  },

  // SLIDE 3
  realProblems: {
    headline: "Real Problems. Real People.",
    cards: [
      {
        title: "Transmission Failed",
        body: "A transmission fails on Wednesday.\n\nPayday is Friday.\n\nThe person needs money today.",
      },
      {
        title: "GT500 Purchase",
        body: "A buyer is about to spend tens of thousands of dollars on a vehicle located hundreds of miles away.\n\nThey need proof before they buy.",
      },
      {
        title: "Airbnb Property",
        body: "A property owner lives in another state.\n\nThey need eyes on a property they cannot physically visit.",
      },
    ],
    closer: "Different situations. Same problem.\n\nPeople need opportunity, help, and verification.",
  },

  // SLIDE 4
  valueCore: {
    headline: "Create Value In Yourself",
    eyebrow: "THE EMOTIONAL CORE",
    body: [
      "GUBER gives people a chance.",
      "Not a guarantee.",
      "A chance.",
    ],
    steps: [
      "Complete jobs.",
      "Help others.",
      "Verify information.",
      "Build credibility.",
      "Earn trust.",
    ],
    profileLine: "Your profile becomes a reflection of your actions.",
    closer: "GUBER does not judge people by assumptions.\n\nGUBER documents what they do.",
  },

  // SLIDE 5
  howItWorks: {
    headline: "How GUBER Works",
    steps: [
      { num: "01", label: "Post a task" },
      { num: "02", label: "Accept a task" },
      { num: "03", label: "Complete the task" },
      { num: "04", label: "Submit proof" },
      { num: "05", label: "Build credibility" },
    ],
    closer: "Simple. Repeatable. Scalable.",
  },

  // SLIDE 6
  traction: {
    headline: "Traction",
    sub: "This is not a pitch for a future product. GUBER is live, deployed, and already serving real users.",
    googlePlayLaunchDate: "April 8, 2026",
    googlePlayLaunchPlaceholder: "April 8, 2026",
    stats: [
      { value: "100+", label: "Downloads on Google Play", sub: "Organic — zero paid acquisition" },
      { value: "Live", label: "Web app at guberapp.com", sub: "Serving real users today" },
      { value: "Active", label: "Real jobs through Stripe Connect", sub: "Escrow + payout live end-to-end" },
      { value: "Live", label: "Sponsored Cash Drops in market", sub: "Real winners. Real cash. Public proof." },
    ],
    facts: [
      "Native Android live on Google Play since April 8, 2026. iOS App Store submission in progress.",
      "Web PWA live at guberapp.com serving real users today.",
      "Brand-funded Cash Drops already paying out to real users — winners photographed and posted publicly on Facebook.",
      "Active social presence across LinkedIn, Facebook, TikTok, Instagram, and X — organic engagement with zero paid promotion.",
      "Founder-built end-to-end: product design, full-stack engineering, payments, native Android/iOS, admin tooling.",
      "Day-1 OG founding-supporter tier live and generating Stripe revenue today.",
      "Stripe Connect, escrow, and money ledger wired end-to-end and tested.",
      "All revenue streams are either Live or flag-gated — none require future engineering.",
    ],
    proofHeadline: "Real Users. Real Cash. No Staging.",
    proofSub: "Every face below is a real GUBER user who found a sponsored Cash Drop in their city — photographed by them, posted by them, no actors, no staging.",
    proofConsentNote: "All photos are from public posts where users tagged GUBER themselves. First names + last initial used out of respect.",
    winners: [
      { name: "Jamie K.", quote: "Going straight to my church!", asset: "winner-jamie" },
      { name: "Kyle H.", quote: "Found it — took me about 30 minutes.", asset: "winner-kyle" },
      { name: "Klin B.", quote: "Cash Drop claimed.", asset: "winner-klin" },
      { name: "James E.", quote: "Cash Drop winner — early adopter.", asset: "winner-james" },
      { name: "Community", quote: "Real winner. Real cash. No fakes.", asset: "winner-extra" },
      { name: "Engagement", quote: "84 reactions · multiple shares — organic, no paid promo.", asset: "engagement" },
    ],
  },

  // SLIDE 7
  trustEarned: {
    headline: "Trust Is Earned",
    question: "Does GUBER let anyone do anything?",
    answer: "No.",
    openLine: "Anyone can start.\n\nTrust is earned.",
    credibilityItems: [
      "Completed jobs",
      "Ratings from both sides",
      "GPS-verified proof submissions",
      "ID + selfie verification",
      "Consistency over time",
    ],
    closer: "GUBER documents trust.\n\nIt does not assume trust.",
  },

  // SLIDE 8
  revenue: {
    headline: "Revenue Model",
    groups: [
      {
        label: "Platform Fees",
        color: "#39FF14",
        items: ["20% job platform fee (from helper share)", "3.2% processing fee (added on top)"],
        status: "Live",
      },
      {
        label: "Verify & Inspect",
        color: "#D100FF",
        items: ["Helpers earn $40–$120+ per job", "Platform earns 20% on every V&I transaction"],
        status: "Live",
      },
      {
        label: "Business Features",
        color: "#00bfff",
        items: ["$99/mo Business Scout Plan (20 talent unlocks/mo)", "$49 one-time business verification"],
        status: "Live",
      },
      {
        label: "Premium Services",
        color: "#f59e0b",
        items: ["$4.99/mo Trust Box (AI content detection)", "Studio credit packs: $5 – $200", "Studio tiers: $10.99 / $37.99 / $99 per month"],
        status: "Live",
      },
      {
        label: "Sponsorships",
        color: "#22c55e",
        items: ["~60% gross margin on every Cash Drop sponsor dollar", "27 drops live in market"],
        status: "Live",
      },
      {
        label: "Future Expansion",
        color: "#a855f7",
        items: ["B2B API fees on aggregated verification reports", "Observation marketplace (20% platform cut)", "Instant cashout fees (2–5%)"],
        status: "Flag-gated",
      },
    ],
    closer: "Multiple revenue streams.\nOne ecosystem.",
  },

  // SLIDE 9
  distribution: {
    headline: "Distribution Strategy",
    sub: "Growth comes from community activation — not paid advertising.",
    items: [
      { label: "Local Launches", body: "City-by-city rollout builds density before expanding." },
      { label: "Cash Drops", body: "Sponsored geo-targeted rewards drive real-world installs and word-of-mouth." },
      { label: "Referral Loops", body: "Every completed job creates a story worth sharing." },
      { label: "Verify & Inspect Demand", body: "B2B pull from buyers, dealers, insurers, and lenders." },
      { label: "Business Partnerships", body: "Local businesses unlock worker access through Scout Plan." },
      { label: "Social Media", body: "Organic engagement across Facebook, TikTok, Instagram, LinkedIn, and X." },
    ],
    closer: "Growth is driven by visibility, participation, and community activation.",
  },

  // SLIDE 10
  expansion: {
    headline: "Expansion Playbook",
    steps: [
      { label: "Start local.", sub: "Launch in a single city. Build density." },
      { label: "Prove repeatability.", sub: "Document what works before scaling." },
      { label: "Expand city by city.", sub: "Roll the playbook into new markets." },
      { label: "Expand region by region.", sub: "Stack density across connected markets." },
      { label: "Expand nationally.", sub: "The infrastructure is already built for it." },
    ],
    closer: "A disciplined, asset-light expansion strategy.",
  },

  // SLIDE 11
  networkEffect: {
    headline: "The Network Effect",
    eyebrow: "WHY THIS SCALES",
    intro: "Every completed task creates:",
    items: ["Proof", "Reputation", "Credibility", "Accountability"],
    body: "The more activity that occurs, the more valuable the platform becomes.\n\nMore workers build credibility. More hirers trust the platform. More businesses buy verification. More sponsors fund Cash Drops. More data strengthens trust scores.",
    closer: "Trust is not purchased.\n\nIt is built through action.",
  },

  // SLIDE 12
  whyWin: {
    headline: "Why GUBER Can Win",
    points: [
      "Existing demand — people already need work, help, and proof",
      "Multiple revenue streams built and live today",
      "Asset-light software model — infrastructure cost near zero at idle",
      "Local-first expansion — density before breadth",
      "Marketplace + verification advantages compound with usage",
      "Trust grows automatically as the platform scales",
      "Does not require changing human behavior — people already transact locally",
    ],
    closer: "People already need work, help, and proof.\n\nGUBER simply makes it visible.",
  },

  // SLIDE 13
  vision: {
    headline: "Vision",
    body: "The long-term vision is simple.\n\nCreate a platform where opportunity, work, verification, and trust become visible in real time — in every community across the country.",
    closer: "Helping people create value in themselves.",
  },

  // SLIDE 14
  fundingAsk: {
    headline: "Investment Opportunity",
    raise: "$1,000,000 over 18 months",
    valuation: "$15M early-stage valuation framework",
    structure: "Early-stage round. Capital goes straight to growth — not engineering. The product is already built.",
    useHeadline: "Raising $1M over 18 months against a $15M early-stage valuation framework — based on live product, existing deployment, platform infrastructure, market opportunity, trust and verification positioning, and national expansion potential.",
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
    urgency: "The terms reward investors who move at GUBER speed — same week, not same quarter. This is an early-stage valuation framework, not a guaranteed company worth.",
  },

  legal: {
    eyebrow: "Built Right",
    headline: "The corporate stack is already in place.",
    sub: "No co-founders to negotiate with. No prior raise to clean up. No cap-table baggage. The legal scaffolding is done so capital can move on day one.",
    items: [
      { label: "Delaware LLC", body: "GUBER Global LLC — Delaware-formed, the structure investors already know how to underwrite." },
      { label: "GUBER Trademark", body: "U.S. trademark application filed — protecting the brand mark from day one." },
      { label: "DUNS Number", body: "Issued — required for Apple Developer enrollment, Google Play business verification, and B2B procurement." },
      { label: "100% Founder-Owned", body: "No prior dilution. No SAFEs in the drawer. Whatever you write is the cap table." },
    ],
  },

  cta: {
    headline: "Less talk. Straight action.",
    sub: "This brief is intentionally private. If you're reading it, the founder believes you can move quickly. Email, call, or text — same hour, same day. Every serious inbound gets a serious reply.",
    founderName: "Dimetris Bowden",
    founderTitle: "Founder & CEO · 100% owner, GUBER Global LLC",
  },
};
