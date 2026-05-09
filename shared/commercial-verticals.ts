// ─────────────────────────────────────────────────────────────────────────────
// Commercial Builder vertical catalog (task-521).
// 25 prebuilt verticals + a "Custom" pass-through for free-text. Each vertical
// supplies the motion / music / voiceover prompt fragments used by the
// /api/studio/generate/commercial composite pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export type CommercialVertical = {
  slug: string;
  label: string;
  emoji: string;
  motionPromptTemplate: string;
  musicPromptTemplate: string;
  voicePromptTemplate: string;
};

const T = (s: string, vars: Record<string, string>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return T(tpl, vars);
}

export const COMMERCIAL_VERTICALS: CommercialVertical[] = [
  {
    slug: "auto-repair",
    label: "Auto Repair",
    emoji: "🔧",
    motionPromptTemplate:
      "10-second commercial for {{businessName}}, an auto repair shop. {{businessDescription}}. Cinematic shot of the product / hero photo, mechanic energy, sparks of light, confident close-ups, end frame with strong CTA banner '{{ctaText}}'.",
    musicPromptTemplate: "Driving rock-tinged commercial bed, confident energy, 30 seconds, instrumental, broadcast quality.",
    voicePromptTemplate: "{{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "restaurant",
    label: "Restaurant",
    emoji: "🍽️",
    motionPromptTemplate:
      "10-second cinematic ad for {{businessName}}, a restaurant. {{businessDescription}}. Steam, glistening plates, warm lighting close-ups, family vibe, end frame with bold CTA '{{ctaText}}'.",
    musicPromptTemplate: "Warm acoustic guitar with light percussion, inviting, 30 seconds, instrumental.",
    voicePromptTemplate: "Welcome to {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "fitness",
    label: "Fitness / Gym",
    emoji: "💪",
    motionPromptTemplate:
      "10-second high-energy fitness ad for {{businessName}}. {{businessDescription}}. Athletic motion, hard-cut energy, sweat-and-grit aesthetic, vibrant gym lighting, CTA finish '{{ctaText}}'.",
    musicPromptTemplate: "Hard-hitting gym EDM with motivating drop, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}} — built for results. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "real-estate",
    label: "Real Estate",
    emoji: "🏡",
    motionPromptTemplate:
      "10-second cinematic real estate listing for {{businessName}}. {{businessDescription}}. Smooth dolly into the property, golden-hour light, lifestyle reveal, agent CTA card '{{ctaText}}'.",
    musicPromptTemplate: "Inspiring cinematic piano with subtle strings, hopeful, 30 seconds, instrumental.",
    voicePromptTemplate: "Discover your next home with {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "lawn-care",
    label: "Lawn & Landscaping",
    emoji: "🌿",
    motionPromptTemplate:
      "10-second ad for {{businessName}}, a lawn-care company. {{businessDescription}}. Crisp grass close-ups, before/after reveal energy, sunny suburban vibe, CTA banner '{{ctaText}}'.",
    musicPromptTemplate: "Sunny upbeat acoustic pop, friendly neighborhood feel, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}} — the lawn you'll love. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "dental",
    label: "Dental",
    emoji: "🦷",
    motionPromptTemplate:
      "10-second clean dental practice ad for {{businessName}}. {{businessDescription}}. Bright sterile lighting, friendly faces, smiling close-ups, soft cinematic motion, CTA finish '{{ctaText}}'.",
    musicPromptTemplate: "Calm friendly piano with gentle strings, professional, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "plumbing",
    label: "Plumbing",
    emoji: "🚰",
    motionPromptTemplate:
      "10-second plumbing services ad for {{businessName}}. {{businessDescription}}. Confident technician imagery, water shimmer, clean tools, problem-solved feel, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Steady commercial bed with light percussion, trustworthy, 30 seconds, instrumental.",
    voicePromptTemplate: "Got a leak? Call {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "salon",
    label: "Salon / Beauty",
    emoji: "💇",
    motionPromptTemplate:
      "10-second salon glamour ad for {{businessName}}. {{businessDescription}}. Soft beauty lighting, slow hair toss, mirror reveals, luxe color grading, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Lush dreamy synth-pop, fashion-runway feel, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "retail",
    label: "Retail / Boutique",
    emoji: "🛍️",
    motionPromptTemplate:
      "10-second retail storefront ad for {{businessName}}. {{businessDescription}}. Product close-ups, shopping bag flourish, vibrant colors, energetic CTA '{{ctaText}}'.",
    musicPromptTemplate: "Upbeat indie pop, shopping-day energy, 30 seconds, instrumental.",
    voicePromptTemplate: "Shop {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "photographer",
    label: "Photographer",
    emoji: "📸",
    motionPromptTemplate:
      "10-second photographer portfolio ad for {{businessName}}. {{businessDescription}}. Camera-shutter beats, image-fan reveal, golden-hour bokeh, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Inspirational cinematic pop, nostalgic, 30 seconds, instrumental.",
    voicePromptTemplate: "Capture the moment with {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "coffee-shop",
    label: "Coffee Shop",
    emoji: "☕",
    motionPromptTemplate:
      "10-second cozy coffee shop ad for {{businessName}}. {{businessDescription}}. Steam swirl on espresso, latte art pour, warm wood textures, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Mellow lo-fi coffee bar, relaxed, 30 seconds, instrumental.",
    voicePromptTemplate: "Wake up to {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "bar-nightlife",
    label: "Bar / Nightlife",
    emoji: "🍸",
    motionPromptTemplate:
      "10-second nightlife ad for {{businessName}}. {{businessDescription}}. Neon glow, slow-mo cocktail pour, crowd vibes, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Pulsing house club bed, late-night energy, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}} — where the night begins. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "law-firm",
    label: "Law Firm",
    emoji: "⚖️",
    motionPromptTemplate:
      "10-second professional law firm ad for {{businessName}}. {{businessDescription}}. Confident silhouettes, marble textures, justice symbolism, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Authoritative orchestral bed, dignified, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}} — fighting for you. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "medical-clinic",
    label: "Medical Clinic",
    emoji: "🏥",
    motionPromptTemplate:
      "10-second healthcare clinic ad for {{businessName}}. {{businessDescription}}. Caring staff, clean facilities, gentle motion, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Caring inspirational piano, hopeful, 30 seconds, instrumental.",
    voicePromptTemplate: "Caring care at {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "pet-grooming",
    label: "Pet / Grooming",
    emoji: "🐶",
    motionPromptTemplate:
      "10-second playful pet-care ad for {{businessName}}. {{businessDescription}}. Happy pets, soft bath suds, smiling owners, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Bouncy ukulele whistle, playful and warm, 30 seconds, instrumental.",
    voicePromptTemplate: "Treat your best friend at {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "construction",
    label: "Construction / Contractor",
    emoji: "🏗️",
    motionPromptTemplate:
      "10-second construction services ad for {{businessName}}. {{businessDescription}}. Hard-hat energy, blueprint-to-build reveal, machinery close-ups, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Heavy industrial drum bed, confident, 30 seconds, instrumental.",
    voicePromptTemplate: "Built right. Built by {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "auto-dealership",
    label: "Auto Dealership",
    emoji: "🚗",
    motionPromptTemplate:
      "10-second car dealership ad for {{businessName}}. {{businessDescription}}. Glossy car spin, showroom lighting, badge reveal, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Energetic rock-pop drive bed, premium, 30 seconds, instrumental.",
    voicePromptTemplate: "Drive home today with {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "moving-services",
    label: "Moving / Hauling",
    emoji: "🚚",
    motionPromptTemplate:
      "10-second moving company ad for {{businessName}}. {{businessDescription}}. Boxes loading montage, smiling crew, truck pull-away, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Upbeat brass-pop bed, friendly hustle, 30 seconds, instrumental.",
    voicePromptTemplate: "Move with confidence — choose {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "cleaning-service",
    label: "Cleaning Service",
    emoji: "🧼",
    motionPromptTemplate:
      "10-second cleaning service ad for {{businessName}}. {{businessDescription}}. Sparkle reveals, before/after sweep, friendly staff, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Bright bouncy whistle pop, fresh, 30 seconds, instrumental.",
    voicePromptTemplate: "Spotless, every time. {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "tutoring-education",
    label: "Tutoring / Education",
    emoji: "📚",
    motionPromptTemplate:
      "10-second education / tutoring ad for {{businessName}}. {{businessDescription}}. Whiteboard energy, smiling student wins, gentle motion, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Inspiring uplifting piano-pop, hopeful, 30 seconds, instrumental.",
    voicePromptTemplate: "Unlock potential at {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "real-estate-agent",
    label: "Real Estate Agent (Personal)",
    emoji: "🔑",
    motionPromptTemplate:
      "10-second personal-brand real estate agent ad for {{businessName}}. {{businessDescription}}. Confident agent intro, neighborhood B-roll, key handoff, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Confident inspirational pop, premium feel, 30 seconds, instrumental.",
    voicePromptTemplate: "I'm {{businessName}}, and I sell homes. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "event-venue",
    label: "Event Venue",
    emoji: "🎉",
    motionPromptTemplate:
      "10-second event venue ad for {{businessName}}. {{businessDescription}}. Stage lights swell, crowd silhouettes, confetti burst, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Festive uplifting orchestral pop, celebratory, 30 seconds, instrumental.",
    voicePromptTemplate: "Celebrate at {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "spa-wellness",
    label: "Spa / Wellness",
    emoji: "🧘",
    motionPromptTemplate:
      "10-second spa wellness ad for {{businessName}}. {{businessDescription}}. Candle flicker, calm hands, soft draped fabrics, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Calming ambient pad with soft chimes, serene, 30 seconds, instrumental.",
    voicePromptTemplate: "Reset and restore at {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "tech-saas",
    label: "Tech / SaaS",
    emoji: "💻",
    motionPromptTemplate:
      "10-second tech / SaaS product ad for {{businessName}}. {{businessDescription}}. Slick UI animation, glowing data viz, modern dark UI, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Modern futuristic synth bed, confident, 30 seconds, instrumental.",
    voicePromptTemplate: "{{businessName}} — built for what's next. {{businessDescription}} {{ctaText}}.",
  },
  {
    slug: "nonprofit",
    label: "Non-Profit / Cause",
    emoji: "🤝",
    motionPromptTemplate:
      "10-second non-profit awareness ad for {{businessName}}. {{businessDescription}}. Real human moments, hopeful close-ups, hands-together symbolism, CTA '{{ctaText}}'.",
    musicPromptTemplate: "Heartfelt cinematic piano with strings, hopeful, 30 seconds, instrumental.",
    voicePromptTemplate: "Together, we change lives. {{businessName}}. {{businessDescription}} {{ctaText}}.",
  },
];

export const CUSTOM_VERTICAL: CommercialVertical = {
  slug: "custom",
  label: "Custom",
  emoji: "✨",
  motionPromptTemplate:
    "10-second commercial for {{businessName}}, a {{customVertical}}. {{businessDescription}}. Cinematic motion driven by the supplied product photo, vibrant brand-feel color grade, end frame with bold CTA '{{ctaText}}'.",
  musicPromptTemplate: "Modern commercial bed, energetic and on-brand, 30 seconds, instrumental.",
  voicePromptTemplate: "{{businessName}}. {{businessDescription}} {{ctaText}}.",
};

export function getVertical(slug: string): CommercialVertical | null {
  if (slug === "custom") return CUSTOM_VERTICAL;
  return COMMERCIAL_VERTICALS.find((v) => v.slug === slug) ?? null;
}

export const OPENAI_TTS_VOICES = [
  { id: "alloy",   label: "Alloy · neutral, balanced" },
  { id: "echo",    label: "Echo · calm male" },
  { id: "fable",   label: "Fable · warm storyteller" },
  { id: "onyx",    label: "Onyx · deep authoritative" },
  { id: "nova",    label: "Nova · upbeat female" },
  { id: "shimmer", label: "Shimmer · bright friendly" },
] as const;
export type OpenAITtsVoiceId = typeof OPENAI_TTS_VOICES[number]["id"];
