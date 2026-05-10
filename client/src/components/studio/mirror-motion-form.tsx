// Mirror Motion form (task-549).
// Photo + reference clip URL → motion-cloned video (Kling motion-control).
// Server prices at 16 credits × seconds. v1 only accepts direct .mp4/.mov URLs.
//
// task-549: lifted out of the legacy Dialog wrapper. Now rendered as a full
// page at /studio/mirror-motion. The inline form is reusable; legacy callers
// wrap it themselves if they want a dialog.
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { isStoreBuild } from "@/lib/platform";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Image as ImageIcon, Wand2, Info } from "lucide-react";
import { useLocation } from "wouter";

type StudioFile = { id: number; providerUrl: string; fileType: string };
type StudioTool = { key: string; creditsCost: number; durationSeconds: number | null };

export function MirrorMotionForm({
  uploadedImages,
  onUpload,
  initialPrompt,
  uploadPending,
  credits,
}: {
  uploadedImages: StudioFile[];
  onUpload: (file: File) => void;
  initialPrompt?: string;
  uploadPending: boolean;
  credits: number;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceFileId, setSourceFileId] = useState<number | null>(null);
  const [motionVideoUrl, setMotionVideoUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<5 | 10>(5);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [rights, setRights] = useState(false);

  // Pull live per-second pricing from /api/studio/tools so we don't drift
  // from the server. The mirror_motion entry stores per-call pricing for a
  // 1-second baseline; we multiply by the chosen duration. If the tool
  // entry isn't there yet we fall back to 16 cr/s (current configured rate).
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const perSecond = toolsQuery.data?.find((t) => t.key === "mirror_motion")?.creditsCost ?? 16;
  const cost = perSecond * durationSeconds;
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
      navigate("/studio");
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
    <div className="space-y-5" data-testid="form-mirror-motion">
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
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${
                durationSeconds === d
                  ? "bg-emerald-400 text-black border-emerald-400"
                  : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"
              }`}
              data-testid={`button-mirror-dur-${d}`}
            >
              {d}s{!isStoreBuild && ` · ${perSecond * d} cr`}
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

      <Button
        disabled={!canSubmit}
        onClick={() => generate.mutate()}
        className="w-full h-14 bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 text-black font-black tracking-wider hover:opacity-90 rounded-2xl text-base disabled:opacity-50"
        data-testid="button-mirror-generate"
      >
        {generate.isPending
          ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Rendering…</>
          : <><Wand2 className="w-5 h-5 mr-2" /> {isStoreBuild ? "Generate" : (insufficient ? `Need ${cost} cr` : `Generate · ${cost} cr`)}</>}
      </Button>
    </div>
  );
}
