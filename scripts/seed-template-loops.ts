/**
 * One-shot seed: generate a 5s cinematic loop per video template via Wan,
 * re-host on Cloudinary, print { slug → secure_url } JSON to stdout.
 *
 * Run: tsx scripts/seed-template-loops.ts
 *
 * Requires FAL_KEY + CLOUDINARY_* env vars. Audio + image templates are
 * skipped — only the 10 video templates get loops. Each clip costs ~$0.05
 * on fal.ai for a one-time seed (~$0.50 total), then served free from
 * Cloudinary forever. Re-running regenerates fresh clips and uploads new
 * publicIds; old assets are not cleaned up automatically.
 */
import { generateWanMotion } from "../server/fal.js";
import cloudinary from "../server/cloudinary.js";

type Seed = { slug: string; loopPrompt: string };

// Loop-optimized prompts — short, vivid, motion-forward. These differ from
// the user-facing template prompts in studio.tsx; the user prompts are
// starter prompts for THEIR generations, while these are tuned for a 5s
// looping background that reads at 160px wide on a card.
const SEEDS: Seed[] = [
  { slug: "build-commercial", loopPrompt: "A glowing product on a turntable rotating slowly under soft studio lights, deep black background, brand commercial aesthetic, premium gloss reflections." },
  { slug: "mirror-motion",    loopPrompt: "A dancer moves in slow-motion against a violet and fuchsia gradient backdrop, motion-blur trails, neon rim light, hypnotic loop." },
  { slug: "create-ad",        loopPrompt: "Vibrant product shot with energetic typography flashing in, slow zoom-in on a glossy can, pink and orange color grade, scroll-stopping ad cut." },
  { slug: "movie-trailer",    loopPrompt: "Cinematic dolly push-in down a dark corridor with anamorphic lens flares streaking through volumetric fog, high contrast, trailer-grade color." },
  { slug: "luxury-promo",     loopPrompt: "A gold pocket watch rotates on glossy black marble under a single warm rim light, ultra-luxury commercial, slow cinematic spin." },
  { slug: "anime-intro",      loopPrompt: "Anime-style cherry blossoms swirling past a stylized rooftop at sunset, vivid cel-shading, motion lines, J-pop energy." },
  { slug: "tiktok-reel",      loopPrompt: "Vertical handheld POV of a city street at night with neon signs whipping by, fast motion blur, vibrant cyan-to-magenta grade, viral reel energy." },
  { slug: "real-estate",      loopPrompt: "Smooth aerial drone push toward a modern luxury home at golden hour, warm interior lights glowing, cinematic real-estate reveal." },
  { slug: "neon-night",       loopPrompt: "Neon-soaked Tokyo alleyway at night with rain reflections on wet pavement, slow cinematic dolly forward, cyberpunk color grade, atmospheric haze." },
  { slug: "game-highlight",   loopPrompt: "Esports-style fast zoom into a stylized arena with glitchy speedlines and neon overlays, high-energy hype loop." },
];

const FOLDER = "guber-studio-templates";
const CONCURRENCY = 3; // be polite to fal queue

async function seedOne(s: Seed): Promise<{ slug: string; url: string | null; error?: string }> {
  const t0 = Date.now();
  try {
    console.error(`[seed] ${s.slug}: submitting Wan motion…`);
    const fal = await generateWanMotion({ prompt: s.loopPrompt, durationSeconds: 5 });
    console.error(`[seed] ${s.slug}: provider clip ready (${Math.round((Date.now() - t0) / 1000)}s) — uploading to Cloudinary…`);
    const up = await cloudinary.uploader.upload(fal.videoUrl, {
      resource_type: "video",
      folder: FOLDER,
      public_id: s.slug,
      overwrite: true,
    });
    // Use eco-quality 400px-wide derived URL for cards (matches cdn pattern in studio.tsx)
    const cdn = up.secure_url.replace("/video/upload/", "/video/upload/q_auto:eco,w_400/");
    console.error(`[seed] ${s.slug}: ✔ ${cdn}`);
    return { slug: s.slug, url: cdn };
  } catch (err: any) {
    console.error(`[seed] ${s.slug}: ✘ ${err.message}`);
    return { slug: s.slug, url: null, error: err.message };
  }
}

async function main() {
  if (!process.env.FAL_KEY) { console.error("FAL_KEY missing"); process.exit(1); }
  if (!process.env.CLOUDINARY_CLOUD_NAME) { console.error("CLOUDINARY_CLOUD_NAME missing"); process.exit(1); }

  const results: { slug: string; url: string | null; error?: string }[] = [];
  for (let i = 0; i < SEEDS.length; i += CONCURRENCY) {
    const batch = SEEDS.slice(i, i + CONCURRENCY);
    const r = await Promise.all(batch.map(seedOne));
    results.push(...r);
  }

  const map: Record<string, string> = {};
  for (const r of results) if (r.url) map[r.slug] = r.url;
  console.log(JSON.stringify(map, null, 2));
  const failed = results.filter((r) => !r.url);
  if (failed.length) {
    console.error(`\n[seed] ${failed.length}/${results.length} failed:`);
    for (const f of failed) console.error(`  - ${f.slug}: ${f.error}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
