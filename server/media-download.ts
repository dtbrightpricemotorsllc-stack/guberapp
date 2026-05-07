// Convert any Cloudinary URL into an attachment-download URL by injecting
// the `fl_attachment` flag. Works for image, video, and raw resource types.
//
// Examples:
//   https://res.cloudinary.com/x/image/upload/v123/foo.jpg
//   → https://res.cloudinary.com/x/image/upload/fl_attachment/v123/foo.jpg
//
//   https://res.cloudinary.com/x/video/upload/v123/foo.mp4
//   → https://res.cloudinary.com/x/video/upload/fl_attachment/v123/foo.mp4

export function toCloudinaryAttachmentUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("cloudinary.com")) return url;
    // Find the /upload/ segment and inject fl_attachment immediately after.
    const marker = "/upload/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return url;
    const before = u.pathname.slice(0, idx + marker.length);
    const after = u.pathname.slice(idx + marker.length);
    // Don't double-inject.
    if (after.startsWith("fl_attachment")) return url;
    u.pathname = `${before}fl_attachment/${after}`;
    return u.toString();
  } catch {
    return url;
  }
}

export function classifyMedia(url: string): "image" | "video" | "audio" | "pdf" | "doc" | "other" {
  if (!url) return "other";
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(png|jpe?g|gif|webp|heic|heif|avif|svg|bmp)$/.test(lower)) return "image";
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|ogg|aac)$/.test(lower)) return "audio";
  if (/\.pdf$/.test(lower)) return "pdf";
  if (/\.(docx?|xlsx?|pptx?|txt|rtf|odt)$/.test(lower)) return "doc";
  // Cloudinary URL hint: /image/, /video/, /raw/
  if (lower.includes("/video/upload/")) return "video";
  if (lower.includes("/image/upload/")) return "image";
  return "other";
}
