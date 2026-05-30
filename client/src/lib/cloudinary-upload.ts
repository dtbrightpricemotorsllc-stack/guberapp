import {
  notifyUploadStart,
  notifyUploadProgress,
  notifyUploadDone,
  notifyUploadError,
} from "./upload-events";

const PER_ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 800;

export interface UploadOptions {
  fileName?: string;
  resourceType?: "image" | "video" | "auto";
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  url: string;
  publicId?: string;
  resourceType?: string;
}

interface SignResponse {
  signature: string;
  timestamp: number;
  cloud_name: string;
  api_key: string;
  folder: string;
  // Hardened sign endpoint returns the server-decided resource_type and a
  // max byte size for the kind being uploaded. Optional for backward-compat
  // with any cached older client bundles.
  resource_type?: "image" | "video";
  max_bytes?: number;
}

async function getSignature(kind: "image" | "video"): Promise<SignResponse> {
  const res = await fetch("/api/upload-photo/sign", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Could not get upload token" }));
    throw new Error(err.error || "Could not get upload token");
  }
  return res.json();
}

function uploadOnce(
  blob: Blob,
  sig: SignResponse,
  opts: UploadOptions,
  effectiveResourceType: "image" | "video" | "auto",
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${effectiveResourceType}/upload`;
    const fd = new FormData();
    fd.append("file", blob, opts.fileName || `upload-${Date.now()}`);
    fd.append("api_key", sig.api_key);
    fd.append("timestamp", String(sig.timestamp));
    fd.append("signature", sig.signature);
    fd.append("folder", sig.folder);

    let timer: number | null = window.setTimeout(() => {
      try { xhr.abort(); } catch {}
      reject(Object.assign(new Error("Upload timed out"), { retriable: true }));
    }, PER_ATTEMPT_TIMEOUT_MS);

    const clearTimer = () => { if (timer !== null) { window.clearTimeout(timer); timer = null; } };
    const onAbortExternal = () => { try { xhr.abort(); } catch {} };
    if (opts.signal) {
      if (opts.signal.aborted) { clearTimer(); reject(new Error("Upload cancelled")); return; }
      opts.signal.addEventListener("abort", onAbortExternal, { once: true });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      clearTimer();
      opts.signal?.removeEventListener("abort", onAbortExternal);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          opts.onProgress?.(100);
          resolve({ url: data.secure_url, publicId: data.public_id, resourceType: data.resource_type });
        } catch {
          reject(new Error("Upload returned invalid response"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error?.message) msg = data.error.message;
        } catch {}
        const retriable = xhr.status === 0 || xhr.status >= 500 || xhr.status === 408 || xhr.status === 429;
        reject(Object.assign(new Error(msg), { retriable, status: xhr.status }));
      }
    };
    xhr.onerror = () => {
      clearTimer();
      opts.signal?.removeEventListener("abort", onAbortExternal);
      reject(Object.assign(new Error("Network error during upload"), { retriable: true }));
    };
    xhr.onabort = () => {
      clearTimer();
      opts.signal?.removeEventListener("abort", onAbortExternal);
      reject(new Error("Upload cancelled"));
    };

    xhr.open("POST", url);
    xhr.send(fd);
  });
}

export async function uploadToCloudinarySigned(
  blob: Blob,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  // Map the caller's resourceType ("image"|"video"|"auto") to the kind the
  // sign endpoint understands. "auto" is treated as "image" for signing
  // (Cloudinary "auto" uploads aren't compatible with our hardened
  // resource-typed signing).
  const requestedType = opts.resourceType || "auto";
  const kind: "image" | "video" =
    requestedType === "video"
      ? "video"
      : requestedType === "image"
        ? "image"
        : (blob.type?.startsWith("video/") ? "video" : "image");

  notifyUploadStart();

  const wrappedOpts: UploadOptions = {
    ...opts,
    onProgress: (pct: number) => {
      notifyUploadProgress(pct);
      opts.onProgress?.(pct);
    },
  };

  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (wrappedOpts.signal?.aborted) { notifyUploadError("Upload cancelled"); throw new Error("Upload cancelled"); }
    try {
      const sig = await getSignature(kind);

      // Enforce server-supplied max byte size client-side so we never even
      // attempt a doomed upload. This is the practical complement to
      // Cloudinary upload presets (which would also enforce server-side).
      if (typeof sig.max_bytes === "number" && blob.size > sig.max_bytes) {
        const mb = (sig.max_bytes / (1024 * 1024)).toFixed(0);
        throw Object.assign(
          new Error(`File too large — max ${mb} MB for this kind of upload.`),
          { retriable: false },
        );
      }

      // Trust the server's resource_type if it returned one; otherwise fall
      // back to the caller's preference.
      const effectiveResourceType = sig.resource_type || (requestedType === "auto" ? kind : requestedType);

      wrappedOpts.onProgress?.(0);
      const result = await uploadOnce(blob, sig, wrappedOpts, effectiveResourceType);
      notifyUploadDone();
      return result;
    } catch (err: any) {
      lastErr = err;
      const retriable = err?.retriable === true;
      const cancelled = err?.message === "Upload cancelled";
      if (cancelled || !retriable || attempt === MAX_ATTEMPTS) break;
      const wait = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  notifyUploadError((lastErr as any)?.message);
  throw lastErr || new Error("Upload failed");
}

export function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
