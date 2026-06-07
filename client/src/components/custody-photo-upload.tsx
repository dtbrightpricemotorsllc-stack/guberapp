import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImageToDataUrl } from "@/lib/image-compress";

interface CustodyPhotoUploadProps {
  photos: string[];
  onChange: (urls: string[]) => void;
  onToken?: (url: string, token: string) => void;
  max?: number;
  disabled?: boolean;
  label?: string;
  testid?: string;
}

async function uploadCustodyPhoto(file: File): Promise<{ url: string; token: string }> {
  const dataUrl = await compressImageToDataUrl(file);
  const res = await fetch("/api/assets/upload", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.message || "Upload failed");
  if (!d?.url) throw new Error("Upload returned no URL");
  return { url: d.url as string, token: (d.uploadToken as string) ?? "" };
}

export function CustodyPhotoUpload({
  photos,
  onChange,
  onToken,
  max = 5,
  disabled,
  label = "Photos (optional)",
  testid = "custody",
}: CustodyPhotoUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    if (photos.length + files.length > max) {
      toast({ title: `Max ${max} photos`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const items: Array<{ url: string; token: string }> = [];
      for (const f of files) {
        items.push(await uploadCustodyPhoto(f));
      }
      onChange([...photos, ...items.map((i) => i.url)]);
      if (onToken) items.forEach((i) => onToken(i.url, i.token));
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const remove = (idx: number) => onChange(photos.filter((_, i) => i !== idx));

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, idx) => (
          <div key={url + idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
            <img src={url} alt="attachment" className="w-full h-full object-cover" data-testid={`img-${testid}-photo-${idx}`} />
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
              data-testid={`button-${testid}-remove-photo-${idx}`}
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="w-16 h-16 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors disabled:opacity-50"
            data-testid={`button-${testid}-add-photo`}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Camera className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-[9px] text-muted-foreground">Add</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleSelect}
        data-testid={`input-${testid}-photos`}
      />
    </div>
  );
}
