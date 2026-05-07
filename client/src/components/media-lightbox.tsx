import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, X } from "lucide-react";

function classify(url: string): "image" | "video" | "audio" | "pdf" | "other" {
  const lower = (url || "").toLowerCase().split("?")[0];
  if (/\.(png|jpe?g|gif|webp|heic|heif|avif|svg|bmp)$/.test(lower)) return "image";
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|ogg|aac)$/.test(lower)) return "audio";
  if (/\.pdf$/.test(lower)) return "pdf";
  if (lower.includes("/video/upload/")) return "video";
  if (lower.includes("/image/upload/")) return "image";
  return "other";
}

function toAttachment(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("cloudinary.com")) return url;
    const marker = "/upload/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return url;
    const after = u.pathname.slice(idx + marker.length);
    if (after.startsWith("fl_attachment")) return url;
    u.pathname = u.pathname.slice(0, idx + marker.length) + "fl_attachment/" + after;
    return u.toString();
  } catch {
    return url;
  }
}

interface Props {
  url: string | null | undefined;
  label?: string;
  triggerClassName?: string;
}

/** Click-to-open full-screen viewer with download + open-original buttons.
 *  Handles image, video, audio, PDF — and shows a download fallback for everything else. */
export function MediaLightbox({ url, label, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  const kind = classify(url);
  const dl = toAttachment(url);

  return (
    <>
      <button
        type="button"
        className={triggerClassName || "inline-flex items-center gap-1 text-xs underline"}
        onClick={() => setOpen(true)}
        data-testid={`button-open-media-${kind}`}
      >
        {kind === "image" ? (
          <img src={url} alt={label || ""} className="h-12 w-12 rounded object-cover" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
            <FileText className="h-3 w-3" /> {label || kind}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <div className="flex items-center justify-between gap-2 pb-2">
            <div className="text-sm font-medium truncate">{label || kind}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild data-testid="button-open-original">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" /> Open
                </a>
              </Button>
              <Button variant="default" size="sm" asChild data-testid="button-download-original">
                <a href={dl} download>
                  <Download className="mr-1 h-3 w-3" /> Download
                </a>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[75vh] overflow-auto">
            {kind === "image" && <img src={url} alt={label || ""} className="mx-auto max-h-[70vh] object-contain" />}
            {kind === "video" && <video src={url} controls className="mx-auto max-h-[70vh] w-full" />}
            {kind === "audio" && <audio src={url} controls className="w-full" />}
            {kind === "pdf" && (
              <iframe src={url} className="h-[70vh] w-full" title={label || "PDF"} />
            )}
            {kind === "other" && (
              <div className="rounded border p-6 text-center text-sm">
                Preview not available for this file type. Use <strong>Download</strong> above to fetch the original.
                <div className="mt-2 break-all text-xs text-muted-foreground">{url}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
