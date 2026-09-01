/**
 * One-time generator for the cohesive GUBER door cinematic.
 *
 * The start and tail frames are generation references only. The web app serves
 * the rendered video and never composes these source plates at runtime.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __dirname = dirname(fileURLToPath(import.meta.url));
const falKey = process.env.FAL_KEY;

if (!falKey) {
  console.error("FAL_KEY is not configured");
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadReference(localPath: string, publicId: string) {
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    folder: "guber-video-gen",
    overwrite: true,
    resource_type: "image",
  });
  return result.secure_url;
}

async function submitAndWait(input: Record<string, unknown>) {
  const submitResponse = await fetch(
    "https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video",
    {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!submitResponse.ok) {
    throw new Error(`Video submission failed (${submitResponse.status}): ${await submitResponse.text()}`);
  }

  const submitted = await submitResponse.json() as {
    status_url: string;
    response_url: string;
  };
  const deadline = Date.now() + 12 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 8_000));
    const statusResponse = await fetch(submitted.status_url, {
      headers: { Authorization: `Key ${falKey}` },
    });
    const status = await statusResponse.json() as { status: string };
    console.log(`status=${status.status}`);
    if (status.status === "FAILED") throw new Error("Video generation failed");
    if (status.status === "COMPLETED") {
      const resultResponse = await fetch(submitted.response_url, {
        headers: { Authorization: `Key ${falKey}` },
      });
      return resultResponse.json() as Promise<{ video?: { url?: string }; url?: string }>;
    }
  }

  throw new Error("Video generation timed out");
}

const startPath = resolve(
  __dirname,
  "../attached_assets/generation_refs/guber-door-start-branded.png",
);
const tailPath = resolve(
  __dirname,
  "../attached_assets/generation_refs/guber-door-final-clean.png",
);

console.log("Uploading exact branded generation references");
const [startUrl, tailUrl] = await Promise.all([
  uploadReference(startPath, "guber-door-start-branded-exact"),
  uploadReference(tailPath, "guber-door-final-characters-clean"),
]);

console.log("Generating cohesive reference-conditioned cinematic");
const result = await submitAndWait({
  image_url: startUrl,
  tail_image_url: tailUrl,
    duration: "5",
  aspect_ratio: "9:16",
  prompt:
     "One continuous premium cinematic shot with no cuts or dissolves. Preserve the exact branded GUBER doors " +
     "and the exact three character identities from the supplied start and tail frames. Hold the doors fully " +
     "sealed only briefly, then complete the physical double-door opening and bright doorway flash by 3.5 seconds. " +
     "The panels slide completely out of frame as real solid doors; their printed logo and wordmark leave with " +
     "the doors. Reveal one clean, continuous GUBER headquarters environment behind them with no free-floating " +
     "branding or typography. The exact JAC, Gubee and D.D. walk visibly forward from real depth toward the camera " +
     "with stable faces, outfits, proportions, colors and natural floor reflections. Use the final second to settle " +
     "on JAC fully revealed and centered. This must look like one physical set of doors revealing the real room, " +
     "not one branded image dissolving into another.",
  negative_prompt:
     "ghosted branding, mirrored logo, duplicate logo, duplicate TEAM GUBER text, floating typography, " +
     "partially visible wordmark, transparent text, reflected text, text smear, dissolving image, crossfade, " +
     "double exposure, image overlay, flat collage, pasted cutout, static pop-in, jump cut, different characters, " +
     "redesigned mascot, generic badger, duplicate character, extra character, morphing, changed face, " +
     "changed outfit, changed colors, garbled text, cropped face, stretched face, missing limb, camera shake, watermark",
});

const videoUrl = result.video?.url ?? result.url;
if (!videoUrl) throw new Error("Generator returned no video URL");

const videoResponse = await fetch(videoUrl);
if (!videoResponse.ok) throw new Error(`Video download failed (${videoResponse.status})`);

const outputPath = resolve(
  __dirname,
  "../attached_assets/generated_videos/guber-door-cinematic-exact-master.mp4",
);
const buffer = Buffer.from(await videoResponse.arrayBuffer());
writeFileSync(outputPath, buffer);
console.log(`Saved ${Math.round(buffer.length / 1024)} KB to ${outputPath}`);