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
  "../attached_assets/generation_refs/guber-door-final-exact.png",
);

console.log("Uploading exact branded generation references");
const [startUrl, tailUrl] = await Promise.all([
  uploadReference(startPath, "guber-door-start-branded-exact"),
  uploadReference(tailPath, "guber-door-final-characters-exact"),
]);

console.log("Generating cohesive reference-conditioned cinematic");
const result = await submitAndWait({
  image_url: startUrl,
  tail_image_url: tailUrl,
  duration: "10",
  aspect_ratio: "9:16",
  prompt:
    "One continuous premium cinematic shot. Preserve the exact branded GUBER doors, logos, typography, " +
    "and the exact three character identities from the supplied start and tail frames. Begin with the doors " +
    "fully sealed. Ignite a narrow cyan center beam, intensify volumetric cyan, violet and emerald light, " +
    "then create a bright doorway flash as the physical double doors slide completely clear. Reveal the same " +
    "continuous GUBER headquarters environment shown in the tail frame. The exact JAC, Gubee and D.D. from the " +
    "tail frame walk visibly forward from real depth toward the camera with stable faces, outfits, proportions, " +
    "logos and colors. Smooth camera push, natural footsteps and floor reflections. Settle precisely into the " +
    "tail-frame composition. No cuts, no pasted layers, no substitutions, no duplicate characters.",
  negative_prompt:
    "different characters, redesigned mascot, generic badger, duplicate character, extra character, morphing, " +
    "changed face, changed outfit, changed logo, garbled text, cropped face, stretched face, missing limb, " +
    "flat collage, pasted cutout, static pop-in, jump cut, camera shake, watermark",
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