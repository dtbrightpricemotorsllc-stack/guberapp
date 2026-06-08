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
    { brand: "linkedin" as const, name: "LinkedIn", url: "https://www.linkedin.com/in/dimetris-bowden-6618a0407" },
    { brand: "facebook" as const, name: "Facebook", url: "https://www.facebook.com/share/18rHLMqQxe/" },
    { brand: "tiktok" as const, name: "TikTok", url: "https://www.tiktok.com/@cash_flow_by_guber" },
    { brand: "instagram" as const, name: "Instagram", url: "https://www.instagram.com/guber_global" },
    { brand: "x" as const, name: "X", url: "https://x.com/GuberGlobal" },
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

  // SLIDE 6b — PLATFORM POSITION (liability / GUBER land)
  platformPosition: {
    headline: "GUBER Doesn't Inspect. GUBER Doesn't Hire.",
    eyebrow: "PLATFORM POSITION · NOT A LIABILITY",
    opening: "Let's be direct about what GUBER is — and what it isn't.",
    notList: [
      "GUBER is not an employer.",
      "GUBER does not conduct inspections.",
      "GUBER does not background-check on behalf of hirers.",
      "GUBER does not guarantee any outcome.",
    ],
    isHeadline: "What GUBER is:",
    isList: [
      "A visibility platform.",
      "A toolset that lets people verify themselves.",
      "An infrastructure layer — we build the road, we don't drive the cars.",
      "A record of what people actually do, not what they claim.",
    ],
    guberLand: {
      headline: "Welcome to GUBER Land.",
      body: "Everyone starts with a clean slate.\n\nNo judgment by assumption. No gatekeeping by background.\n\nYou show up. You work. Your record speaks for itself.\n\nFresh start. Your rules. But safely — because every action is documented, every identity is verified, and every payment is on-platform.",
    },
    assetProtection: {
      headline: "Asset Protection Is a Tool, Not a Liability.",
      body: "When a user requests a Verify & Inspect job — on a car, a property, a piece of equipment — GUBER facilitates the transaction. An independent worker accepts the job, completes it, and submits proof.\n\nGUBER never touches the asset. GUBER never makes the call. GUBER documents that a human did.",
      closer: "The user took action.\n\nGUBER made it visible.",
    },
    closer: "The platform doesn't create liability.\n\nIt creates accountability.",
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
        items: ["20% platform fee on every job (18% for Day-1 OG)", "+3.2% processing added on top", "Day-1 OG membership — $1.99/mo early adopter rate"],
        status: "Live",
      },
      {
        label: "Verify & Inspect",
        color: "#D100FF",
        items: ["Inspectors earn $40–$120+ per job", "Platform takes 20% on every V&I", "Buyer's Order — digital vehicle/asset transaction documents"],
        status: "Live",
      },
      {
        label: "GUBER Studio",
        color: "#f472b6",
        items: ["AI media generation — text-to-video, motion, music", "Credit packs $5–$200 (Spark → Whale)", "Tiers: Standard $10.99 / Business $37.99 / Enterprise $99/mo"],
        status: "Live",
      },
      {
        label: "Business Features",
        color: "#00bfff",
        items: ["$99/mo Business Scout (20 talent unlocks)", "$49 one-time business verification", "Barter & direct offer rails"],
        status: "Live",
      },
      {
        label: "Premium & Sponsorships",
        color: "#f59e0b",
        items: ["$4.99/mo Trust Box", "~60% margin on Cash Drop sponsor dollars", "27 Cash Drops live in market"],
        status: "Live",
      },
      {
        label: "Load Board & Transport",
        color: "#00e5ff",
        items: ["20% fee on every completed load transaction", "Verified carrier network — identity on file", "Proof of delivery + escrow on same trust rail"],
        status: "Live",
      },
      {
        label: "Marketplace & Expansion",
        color: "#a855f7",
        items: ["Vehicle & asset marketplace listings", "Observation marketplace (20% cut)", "B2B verification-report API", "Instant-cashout fees (2–5%)"],
        status: "Flag-gated",
      },
    ],
    closer: "Every vertical runs on the same trust rail.\nOne platform. Compounding revenue.",
  },

  // SLIDE 8b — LOAD BOARD (transport strategy)
  loadBoard: {
    headline: "The Load Board.",
    eyebrow: "TRANSPORT STRATEGY · $11T+ GLOBAL INDUSTRY",
    sub: "GUBER enters one of the largest industries in the world — and solves its oldest problem: trust.",
    markets: [
      { label: "U.S. Trucking & Freight", size: "$900B+", note: "Annual domestic freight revenue" },
      { label: "Global Logistics", size: "$11T+", note: "Worldwide supply chain & transport" },
      { label: "Last-Mile Delivery", size: "$200B+", note: "Fastest-growing transport segment" },
      { label: "Broker & Load Matching", size: "$80B+", note: "Digital freight brokerage market" },
    ],
    problem: "The problem in transport is the same problem GUBER was built to solve — visibility.\n\nLoads sit unmatched. Carriers sit idle. No one can verify who they're dealing with until money has already moved.",
    solution: [
      { label: "Verified Carriers", body: "Every carrier on the GUBER Load Board has a verified identity on file. No ghost accounts. No untracked drivers." },
      { label: "Matched Visibility", body: "Load posters publish what needs moving. Verified carriers bid and accept. The match happens on-platform." },
      { label: "Escrow & Payout", body: "Payment held in escrow until delivery is confirmed. Same rail that powers every GUBER job — already built." },
      { label: "Proof of Delivery", body: "GPS tracking + photo confirmation at pickup and drop. Disputes are documented, not guessed at." },
      { label: "Asset Protection Add-On", body: "For high-value loads, hirers can request a Verify & Inspect job at origin or destination — an extra layer of proof before money moves." },
    ],
    revenueNote: "Platform fee on every completed load. Same 20% model. Zero new infrastructure — the trust rail already exists.",
    closer: "The freight industry doesn't have a truck problem.\n\nIt has a trust problem.\n\nGUBER already solved that.",
  },

  // SLIDE 8c — MARKET OPPORTUNITY
  marketOpportunity: {
    headline: "Market Opportunity",
    eyebrow: "TAM · SAM · SOM",
    sub: "GUBER is positioned at the intersection of multiple massive industries rapidly moving toward digital, mobile-first, trust-based transactions.",
    tiers: [
      {
        label: "TAM",
        sublabel: "Total Addressable Market",
        size: "$2T+",
        note: "Global Opportunity",
        color: "#39FF14",
        sectors: ["Gig Economy", "General & Skilled Labor", "Transportation & Logistics", "Vehicle Marketplace", "Real Estate", "Property Inspections", "Business Services", "Local Commerce", "On-Demand Services"],
      },
      {
        label: "SAM",
        sublabel: "Serviceable Available Market",
        size: "$250B+",
        note: "U.S. Opportunity",
        color: "#D100FF",
        sectors: ["Local Workers", "Verified Service Providers", "Transportation Services", "Marketplace Transactions", "Property & Vehicle Inspections", "Temporary Labor", "Business Support Services"],
      },
      {
        label: "SOM",
        sublabel: "Serviceable Obtainable Market",
        size: "$250M+",
        note: "Near-Term Opportunity",
        color: "#00e5ff",
        sectors: ["0.1% market share = $250M+ opportunity", "City-by-city activation playbook", "Trust network compounds with every user"],
      },
    ],
    whyNow: [
      "The workforce is becoming more flexible.",
      "Consumers demand faster, on-demand service.",
      "Businesses need trusted local resources.",
      "Verification and trust are becoming critical in every online transaction.",
    ],
    fragmentation: "One platform for jobs. Another for transport. Another for marketplace. Another for inspections. Another for local services.\n\nGUBER brings all of these ecosystems together under one unified platform.",
    closer: "The objective is not to dominate every category immediately.\n\nIt is to establish a trusted network that expands market by market, city by city, and user by user.",
  },

  // SLIDE 8d — CATEGORY CREATION
  categoryCreation: {
    headline: "Category Creation.",
    eyebrow: "WHAT GUBER IS BUILDING",
    statement: "GUBER is not attempting to be another gig app.",
    category: "Trust Infrastructure\nfor Local Commerce.",
    pillars: ["Labor", "Marketplace Transactions", "Transportation", "Inspections", "Verification", "Reputation", "Payments", "Trust"],
    flywheel: [
      { step: "Users Join", icon: "👥" },
      { step: "Services Become Available", icon: "🛠" },
      { step: "Jobs & Transactions Increase", icon: "📈" },
      { step: "Reputation & Trust Grow", icon: "⭐" },
      { step: "Businesses Participate", icon: "🏢" },
      { step: "More Users Join", icon: "🔄" },
      { step: "Platform Value Increases", icon: "🚀" },
    ],
    vision: "To become the operating system for local commerce — allowing people and businesses to find work, hire help, verify assets, complete transactions, build reputation, and create economic opportunities through one trusted network.",
    tagline: "Where Real-World Labor Meets Digital Scale.\nVerified Work. Powered By People.",
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
    body: "The vision is simple.\n\nTo become the operating system for local commerce — allowing people and businesses to find work, hire help, verify assets, complete transactions, build reputation, and create economic opportunities through one trusted network.",
    closer: "Where Real-World Labor Meets Digital Scale.\nVerified Work. Powered By People.",
    milestones: [
      "Live Platform — web + Google Play",
      "Delaware LLC Established",
      "Trademark Protection Filed",
      "Stripe Integration — escrow + payouts live",
      "Multi-Market Platform Architecture",
      "Nationwide Expansion Strategy",
    ],
  },

  // SLIDE 14
  fundingAsk: {
    headline: "Investment Opportunity",
    raise: "$1,000,000 over 18 months",
    valuation: "$15M early-stage valuation framework",
    structure: "Capital goes straight to growth — not engineering. The product is already built and live.",
    useHeadline: "Raising $1M over 18 months to accelerate user acquisition, strengthen trust and safety, expand capabilities, and scale GUBER nationwide.",
    use: [
      "User Acquisition & Market Activation — 35% · $350K",
      "Product Development & Engineering — 30% · $300K",
      "Trust, Safety & Compliance — 15% · $150K",
      "Partnerships & Business Development — 10% · $100K",
      "Infrastructure & Platform Operations — 5% · $50K",
      "Reserve Capital & Contingency — 5% · $50K",
    ],
    breakdown: [
      { label: "User Acquisition & Market Activation", pct: 35, amount: "$350K", color: "#39ff14" },
      { label: "Product Development & Engineering", pct: 30, amount: "$300K", color: "#a855f7" },
      { label: "Trust, Safety & Compliance", pct: 15, amount: "$150K", color: "#f59e0b" },
      { label: "Partnerships & Business Development", pct: 10, amount: "$100K", color: "#22c55e" },
      { label: "Infrastructure & Platform Operations", pct: 5, amount: "$50K", color: "#00e5ff" },
      { label: "Reserve Capital & Contingency", pct: 5, amount: "$50K", color: "#9ca3af" },
    ],
    useDetail: [
      { label: "User Acquisition & Market Activation", amount: "$350K", items: ["City activation campaigns", "Referral & ambassador programs", "Cash Drop promotions", "Social media growth", "Community engagement"] },
      { label: "Product Development & Engineering", amount: "$300K", items: ["Native mobile enhancements", "Load board development", "Marketplace expansion", "AI moderation systems", "Platform feature expansion"] },
      { label: "Trust, Safety & Compliance", amount: "$150K", items: ["Identity verification systems", "Fraud prevention tools", "Escrow & payment security", "Compliance & legal frameworks"] },
      { label: "Partnerships & Business Development", amount: "$100K", items: ["Dealership networks", "Transport & logistics partners", "Enterprise relationships"] },
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
