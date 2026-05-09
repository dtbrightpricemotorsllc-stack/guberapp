// Mirror Motion wizard (task-521).
// Photo + reference clip URL → motion-cloned video (Kling motion-control).
// Server prices at 16 credits × seconds. v1 only accepts direct .mp4/.mov URLs.
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Image as ImageIcon, Wand2, Info } from "lucide-react";

type StudioFile = { id: number; providerUrl: string; fileType: string };

export function MirrorMotionDialog({
  open,
  onOpenChange,
  uploadedImages,
  onUpload,
  uploadPending,
  credits,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  uploadedImages: StudioFile[];
  onUpload: (file: File) => void;
  uploadPending: boolean;
  credits: number;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceFileId, setSourceFileId] = useState<number | null>(null);
  const [motionVideoUrl, setMotionVideoUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<5 | 10>(5);
  const [prompt, setPrompt] = useState("");
  const [rights, setRights] = useState(false);

  const cost = 16 * durationSeconds;
  const insufficient = credits < cost;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/mirror-motion", {
        sourceFileId,
        motionVideoUrl: motionVideoUrl.trim(),
        durationSeconds,
        prompt: prompt.trim() || undefined,
        audioRightsConfirmed: rights,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Mirror Motion ready", description: "Your cloned-motion clip is in your library." });
      onOpenChange(false);
    },
    onError: async (err: any) => {
      let msg = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(msg);
      if (m) { try { const p = JSON.parse(m[1]); if (p?.message) msg = p.message; } catch {} }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Mirror Motion failed", description: msg, variant: "destructive" });
    },
  });

  const canSubmit =
    !!sourceFileId &&
    motionVideoUrl.trim().length > 5 &&
    rights &&
    !insufficient &&
    !generate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-mirror-motion">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-emerald-400" /> Mirror Motion</DialogTitle>
          <DialogDescription className="text-white/70">
            Clone the motion of any direct video URL onto your photo. 16 credits per second.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo picker */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-white/60">Source photo</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
              data-testid="input-mirror-photo"
            />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uploadedImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSourceFileId(img.id)}
                  className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${sourceFileId === img.id ? "border-emerald-400" : "border-white/15"}`}
                  data-testid={`button-mirror-photo-${img.id}`}
                >
                  <img src={img.providerUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadPending}
                className="shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center hover:border-white/40 disabled:opacity-50"
                data-testid="button-mirror-upload-photo"
              >
                {uploadPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-5 h-5 text-white/60" />}
              </button>
            </div>
          </div>

          {/* Reference URL */}
          <div className="space-y-2">
            <Label htmlFor="mirror-url" className="text-xs uppercase tracking-widest text-white/60">Reference clip URL</Label>
            <Input
              id="mirror-url"
              value={motionVideoUrl}
              onChange={(e) => setMotionVideoUrl(e.target.value)}
              placeholder="https://example.com/clip.mp4"
              className="bg-white/5 border-white/15 text-white"
              data-testid="input-mirror-url"
            />
            <p className="text-[11px] text-white/50 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Direct .mp4 / .mov / .webm URL only. YouTube / TikTok links aren't supported yet.
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-white/60">Duration</Label>
            <div className="flex gap-2">
              {[5, 10].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationSeconds(d as 5 | 10)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    durationSeconds === d
                      ? "bg-emerald-400 text-black border-emerald-400"
                      : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"
                  }`}
                  data-testid={`button-mirror-dur-${d}`}
                >
                  {d}s · {16 * d} cr
                </button>
              ))}
            </div>
          </div>

          {/* Optional prompt */}
          <div className="space-y-2">
            <Label htmlFor="mirror-prompt" className="text-xs uppercase tracking-widest text-white/60">Optional refinement</Label>
            <Textarea
              id="mirror-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="(Optional) e.g. cinematic color grade, slow shutter blur."
              className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
              data-testid="textarea-mirror-prompt"
            />
          </div>

          {/* Rights checkbox */}
          <label className="flex items-start gap-2 text-xs text-white/80 cursor-pointer">
            <Checkbox
              checked={rights}
              onCheckedChange={(v) => setRights(v === true)}
              className="mt-0.5 border-white/30"
              data-testid="checkbox-mirror-rights"
            />
            <span>
              I confirm I have the rights to clone the reference clip's motion and audio. (We log this confirmation.)
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-mirror-cancel">Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => generate.mutate()}
            className="bg-emerald-400 text-black hover:bg-emerald-300"
            data-testid="button-mirror-generate"
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            {insufficient ? `Need ${cost} cr` : `Generate · ${cost} cr`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
