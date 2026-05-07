import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;

// ── Asset destruction (Task #494 — 30-day media retention) ─────────────────
// Parses a Cloudinary delivery URL and best-effort deletes the underlying
// asset. Returns { ok, publicId, resourceType } so callers can record what
// happened in audit logs. Never throws — failures are logged and returned.
//
// Supported URL shapes (all under res.cloudinary.com/<cloud>/):
//   .../image/upload/[fl_attachment/]v123/guber-proof/abc.jpg
//   .../video/upload/v123/guber-proof/abc.mp4
//   .../raw/upload/v123/guber-proof/abc.bin
export type DestroyResult = {
  ok: boolean;
  publicId: string | null;
  resourceType: "image" | "video" | "raw" | null;
  reason?: string;
};

export function parseCloudinaryAsset(url: string): { publicId: string; resourceType: "image" | "video" | "raw" } | null {
  if (!url || typeof url !== "string") return null;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;
  const prefix = `https://res.cloudinary.com/${cloudName}/`;
  if (!url.startsWith(prefix)) return null;
  const tail = url.slice(prefix.length);
  // Match <resource_type>/upload/[transformations/]vNNN/<public_id>.<ext>
  const m = tail.match(/^(image|video|raw)\/upload\/(?:[^/]+\/)*v\d+\/(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (!m) return null;
  return { resourceType: m[1] as "image" | "video" | "raw", publicId: m[2] };
}

export async function destroyAsset(url: string): Promise<DestroyResult> {
  const parsed = parseCloudinaryAsset(url);
  if (!parsed) return { ok: false, publicId: null, resourceType: null, reason: "unparseable_url" };
  try {
    const res: any = await cloudinary.uploader.destroy(parsed.publicId, {
      resource_type: parsed.resourceType,
      invalidate: true,
    });
    const ok = res?.result === "ok" || res?.result === "not found";
    return { ok, publicId: parsed.publicId, resourceType: parsed.resourceType, reason: res?.result };
  } catch (err: any) {
    return {
      ok: false,
      publicId: parsed.publicId,
      resourceType: parsed.resourceType,
      reason: err?.message || "destroy_failed",
    };
  }
}
