// Downscale + re-encode an image File to a data URL before upload.
//
// Studio uploads POST a base64 data URL to /api/studio/upload. Large originals
// (the UI allows up to 25 MB) inflate ~33% as base64 and blow past the server's
// JSON body limit (express.json `10mb`) and the deployment edge, which reject the
// request with an HTML 403/413 instead of JSON. We downscale + re-encode to JPEG,
// stepping down quality/dimensions until the data URL fits under MAX_DATAURL_CHARS.
//
// A base64 data URL's character length is ~equal to the request body bytes it
// produces, so we keep it comfortably under the 10 MB server limit.
const MAX_DATAURL_CHARS = 7_500_000;

// (maxEdge, quality) attempts from highest fidelity to smallest.
const ATTEMPTS: Array<[number, number]> = [
  [1600, 0.85],
  [1600, 0.7],
  [1280, 0.7],
  [1024, 0.65],
  [800, 0.6],
  [640, 0.55],
];

class ImageTooLargeError extends Error {
  constructor() {
    super("This photo is too large even after compression. Try a smaller image.");
    this.name = "ImageTooLargeError";
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("decode failed"));
    i.src = dataUrl;
  });
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readAsDataUrl(file);

  let img: HTMLImageElement;
  try {
    img = await decode(rawDataUrl);
  } catch {
    // Couldn't decode — if the original is already small enough, send as-is,
    // otherwise we have no safe way to shrink it.
    if (rawDataUrl.length <= MAX_DATAURL_CHARS) return rawDataUrl;
    throw new ImageTooLargeError();
  }

  let smallest = rawDataUrl;
  for (const [maxEdge, quality] of ATTEMPTS) {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    // JPEG has no alpha — paint white first so transparency doesn't render black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", quality);
    if (out && out.length < smallest.length) smallest = out;
    if (out && out.length <= MAX_DATAURL_CHARS) return out;
  }

  if (smallest.length <= MAX_DATAURL_CHARS) return smallest;
  throw new ImageTooLargeError();
}
