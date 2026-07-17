/**
 * Regenerates all JAC static audio cache files at 128kbps quality.
 * Run once: node scripts/regen-jac-audio.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const VOICE_ID = process.env.JAC_ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9";
const MODEL_ID = process.env.JAC_ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const API_KEY  = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set");
  process.exit(1);
}

const VOICE_SETTINGS = {
  stability: 0.38,
  similarity_boost: 0.9,
  style: 0.55,
  use_speaker_boost: true,
};

const CLIPS = {
  "welcome":             "Hi! I'm Jack, your Goober Job Assisting Coordinator. I'm here to help you find work, hire help, or verify anything. What brings you in today?",
  "what-is-guber":       "Goober stands for Global Unlimited Business and Employment Resources. It's a US-based platform where you can post jobs, find local work, verify purchases, and more — all in one place.",
  "how-earn-money":      "To earn money on Goober, create an account, complete ID verification, then browse available jobs near you. Apply, get hired, complete the work, and get paid directly through the platform.",
  "how-post-job":        "Posting a job on Goober is completely free. Just sign up, go to Post a Job, fill in the details — what you need, your location, and your budget — and workers in your area will apply.",
  "what-is-verify":      "Verify and Inspect lets you hire someone to physically inspect a car, property, or item on your behalf. They go there, document everything on camera, and report back to you in real time.",
  "background-check":    "Goober requires ID verification for all users. This confirms real identity so you know exactly who you're dealing with. You can also view a worker's job history and reviews before hiring.",
  "how-get-paid":        "Workers get paid through the Goober wallet after a job is completed and confirmed. You can cash out to your bank. Day One Oh Gee members pay a lower 5 percent fee versus the standard 10 percent.",
  "what-is-og":          "Day One Oh Gee is Goober's founding membership. Oh Gee members pay only 5 percent in fees instead of 10, get priority Cash Drop notifications, an exclusive badge, and early access to new features.",
  "what-is-cashdrop":    "Cash Drops are bonus reward events that Goober releases to the community. They appear on the map — first person to tap and claim it wins real cash. Day One Oh Gee members get notified first.",
  "what-is-studio":      "Goober Studio is the AI content creation suite built into the platform. You can generate videos, music, and more using AI credits. New users get 2 free trial credits to start.",
  "what-is-marketplace": "The Goober Marketplace is where you can buy and sell cars and other items locally. All transactions are documented on-platform for safety and accountability.",
  "what-is-loadboard":   "The Load Board connects drivers and haulers with people who need things transported. If you have a truck or trailer, you can find hauling jobs near you.",
  "how-id-verify":       "To verify your identity, go to your profile and tap the ID Verification section. You'll upload a photo ID. Our system reviews it to confirm you're a real person — it's fast and secure.",
  "fees":                "Posting jobs is always free. Workers pay a 10 percent platform fee on earnings. Day One Oh Gee members pay only 5 percent — that's half the fee on every single payout.",
  "how-signup":          "Signing up is free and takes about 2 minutes. Just go to the sign up page, enter your name, email, and create a password. Then complete ID verification and you're ready to post or find work.",
  "safety":              "Safety is built into every step on Goober. Every user verifies their identity. All payments go through the platform — no cash handoffs. Every job is documented with proof of completion.",
  "what-is-barter":      "Barter on Goober lets you exchange services or items without cash. If you have a skill someone needs and they have something you want, you can trade directly — fully documented on the platform.",
  "contact-support":     "For help, you can chat with me any time — I'm Jack, your Job Assisting Coordinator. For account issues, visit the Help section in your profile or reach out through the Contact page.",
  "us-only":             "Goober is currently available in the United States only. We're focused on building the best possible local experience here before expanding internationally.",
  "what-is-trustbox":    "Trust Box is a subscription that gives you unlimited plays of the Aye Eye or Not game, plus other perks. It's one of the ways to get more out of your Goober membership.",
};

const DIR = join(process.cwd(), "public", "jac-audio");
mkdirSync(DIR, { recursive: true });

let ok = 0, fail = 0;

for (const [slug, text] of Object.entries(CLIPS)) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`  ✗ ${slug}: HTTP ${res.status} — ${body.slice(0, 120)}`);
      fail++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(DIR, `${slug}.mp3`), buf);
    console.log(`  ✓ ${slug} (${(buf.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${slug}: ${e.message}`);
    fail++;
  }
  // Slight pause to avoid burst rate limiting
  await new Promise(r => setTimeout(r, 300));
}

console.log(`\nDone: ${ok} generated, ${fail} failed.`);
