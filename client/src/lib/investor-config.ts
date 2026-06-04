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
    sub: "One trust rail for local work — verified identity, on-platform payments, and proof of every job. Live on web and Google Play today.",
    primaryCta: { label: "SEE THE OPPORTUNITY", target: "section-funding" },
    secondaryCta: { label: "CONTACT THE FOUNDER", target: "section-cta" },
  },

  // SLIDE 2
  problem: {
    headline: "The Problem",
    needs: ["Money", "Help", "Proof"],
    body: [
      "A person needs work but can't find the opportunity.",
      "A business needs help but can't find anyone reliable.",
      "A buyer needs to verify a big purchase but can't be there.",
    ],
    closer: "The need is everywhere.\n\nThe visibility isn't.",
  },

  // SLIDE 3
  realProblems: {
    headline: "Real Problems. Real People.",
    cards: [
      {
        title: "Transmission Failed",
        body: "A transmission fails Wednesday.\n\nPayday is Friday.\n\nThey need money today.",
      },
      {
        title: "GT500 Purchase",
        body: "A buyer is about to spend tens of thousands on a car hundreds of miles away.\n\nThey need proof before they pay.",
      },
      {
        title: "Airbnb Property",
        body: "An owner lives out of state.\n\nThey need eyes on a property they can't visit.",
      },
    ],
    closer: "Different situations.\n\nSame problem.",
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
      "Your work becomes your record.",
      "Your record becomes your reputation.",
      "Your reputation opens the next door.",
    ],
    profileLine: "Your profile reflects what you actually do.",
    closer: "GUBER doesn't judge by assumptions.\n\nIt documents action.",
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
    sub: "Not a someday pitch. GUBER is live, deployed, and serving real users today.",
    googlePlayLaunchDate: "April 8, 2026",
    googlePlayLaunchPlaceholder: "April 8, 2026",
    stats: [
      { value: "100+", label: "Downloads on Google Play", sub: "Organic — zero paid acquisition" },
      { value: "Live", label: "Web app at guberapp.com", sub: "Serving real users today" },
      { value: "Active", label: "Real jobs through Stripe Connect", sub: "Escrow + payout live end-to-end" },
      { value: "Live", label: "Sponsored Cash Drops in market", sub: "Real winners. Real cash. Public proof." },
    ],
    facts: [
      "Native Android live on Google Play since April 8, 2026 — iOS App Store submission in progress.",
      "Web app live at guberapp.com, serving real users today.",
      "Brand-funded Cash Drops already paying real users — winners photographed and posted publicly.",
      "Stripe Connect, escrow, and payouts wired end-to-end and tested.",
      "Founder-built end-to-end — every revenue stream is live or one flag away.",
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
      "Two-sided ratings",
      "GPS-verified proof",
      "ID + selfie verification",
      "Consistency over time",
    ],
    closer: "GUBER documents trust.\n\nIt doesn't assume it.",
  },

  // SLIDE 8
  revenue: {
    headline: "Revenue Model",
    groups: [
      {
        label: "Platform Fees",
        color: "#39FF14",
        items: ["20% platform fee on every job (18% for Day-1 OG)", "+3.2% processing, added on top"],
        status: "Live",
      },
      {
        label: "Verify & Inspect",
        color: "#D100FF",
        items: ["Inspectors earn $40–$120+ per job", "Platform takes 20% on every V&I"],
        status: "Live",
      },
      {
        label: "Business Features",
        color: "#00bfff",
        items: ["$99/mo Business Scout (20 talent unlocks)", "$49 one-time business verification"],
        status: "Live",
      },
      {
        label: "Premium Services",
        color: "#f59e0b",
        items: ["$4.99/mo Trust Box", "Studio credit packs $5–$200", "Studio tiers $10.99 / $37.99 / $99 mo"],
        status: "Live",
      },
      {
        label: "Sponsorships",
        color: "#22c55e",
        items: ["~60% margin on Cash Drop sponsor dollars", "27 drops live in market"],
        status: "Live",
      },
      {
        label: "Future Expansion",
        color: "#a855f7",
        items: ["B2B verification-report API", "Observation marketplace (20% cut)", "Instant-cashout fees (2–5%)"],
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
      { label: "Local Launches", body: "City-by-city — build density before breadth." },
      { label: "Cash Drops", body: "Sponsored geo-rewards drive installs and word-of-mouth." },
      { label: "Referral Loops", body: "Every completed job is a story worth sharing." },
      { label: "Verify & Inspect Demand", body: "B2B pull from buyers, dealers, insurers, lenders." },
      { label: "Business Partnerships", body: "Local businesses unlock talent via Scout Plan." },
      { label: "Social Media", body: "Organic reach across our channels — zero paid spend." },
    ],
    closer: "Growth driven by visibility and participation.",
  },

  // SLIDE 10
  expansion: {
    headline: "Expansion Playbook",
    steps: [
      { label: "Start local.", sub: "Launch one city. Build density." },
      { label: "Prove repeatability.", sub: "Document what works." },
      { label: "Expand city by city.", sub: "Roll the playbook forward." },
      { label: "Expand region by region.", sub: "Stack connected markets." },
      { label: "Expand nationally.", sub: "The infrastructure is already built." },
    ],
    closer: "A disciplined, asset-light expansion strategy.",
  },

  // SLIDE 11
  networkEffect: {
    headline: "The Network Effect",
    eyebrow: "WHY THIS SCALES",
    intro: "Every completed task creates:",
    items: ["Proof", "Reputation", "Credibility", "Accountability"],
    body: "The more activity that happens, the more valuable the platform becomes — more workers build credibility, more hirers trust it, more businesses buy verification, and the data behind every trust score gets stronger.",
    closer: "Trust isn't purchased.\n\nIt's built through action.",
  },

  // SLIDE 12
  whyWin: {
    headline: "Why GUBER Can Win",
    points: [
      "Demand already exists — people need work, help, and proof today.",
      "Multiple revenue streams, all live now.",
      "Asset-light and founder-built — capital goes to growth, not catch-up.",
      "One trust rail powers every service, so advantages compound with usage.",
      "No behavior change required — people already transact locally.",
    ],
    closer: "People already need work, help, and proof.\n\nGUBER simply makes it visible.",
  },

  // SLIDE 13
  vision: {
    headline: "Vision",
    body: "The vision is simple.\n\nMake opportunity, work, and trust visible in real time — in every community across the country.",
    closer: "Helping people create value in themselves.",
  },

  // SLIDE 14
  fundingAsk: {
    headline: "Investment Opportunity",
    raise: "$1,000,000 over 18 months",
    valuation: "$15M early-stage valuation framework",
    structure: "Early-stage round. Capital goes straight to growth — not engineering. The product is already built.",
    useHeadline: "Raising $1M over 18 months at a $15M early-stage framework — against a live product, real deployment, and national expansion potential.",
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
    urgency: "Terms reward investors who move fast — same week, not same quarter. This is an early-stage framework, not a guaranteed company worth.",
  },

  legal: {
    eyebrow: "Built Right",
    headline: "The corporate stack is already in place.",
    sub: "No co-founders to negotiate with. No prior raise to clean up. The legal scaffolding is done so capital can move on day one.",
    items: [
      { label: "Delaware LLC", body: "GUBER Global LLC — the structure investors know how to underwrite." },
      { label: "GUBER Trademark", body: "U.S. trademark application filed — protecting the brand from day one." },
      { label: "DUNS Number", body: "Issued — required for Apple, Google Play, and B2B procurement." },
      { label: "100% Founder-Owned", body: "No prior dilution. No SAFEs. Whatever you write is the cap table." },
    ],
  },

  cta: {
    headline: "Less talk. Straight action.",
    sub: "This brief is private. Email, call, or text — every serious inbound gets a serious reply, same day.",
    founderName: "Dimetris Bowden",
    founderTitle: "Founder & CEO · 100% owner, GUBER Global LLC",
  },
};
