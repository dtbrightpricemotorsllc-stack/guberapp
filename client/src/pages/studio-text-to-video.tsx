// /studio/text-to-video — task-549.
// Dedicated text→video page (Wan motion 5s / 10s). Pure prompt + duration toggle.
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Wand2, Film } from "lucide-react";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";

type StudioMe = { credits: number; providerReady: boolean };
type StudioTool = { key: string; creditsCost: number; durationSeconds: number | null };

export default function StudioTextToVideoPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<5 | 10>(5);
  const searchString = useSearch();
  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    if (prefillConsumedRef.current || !searchString) return;
    const p = new URLSearchParams(searchString).get("prompt");
    if (!p) return;
    prefillConsumedRef.current = true;
    setPrompt(p);
    window.history.replaceState({}, "", "/studio/text-to-video");
  }, [searchString]);

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const credits = meQuery.data?.credits ?? 0;
  const tools = toolsQuery.data ?? [];
  const cost5  = tools.find((t) => t.key === "wan_motion_5s")?.creditsCost ?? 0;
  const cost10 = tools.find((t) => t.key === "wan_motion_10s")?.creditsCost ?? 0;
  const cost = duration === 5 ? cost5 : cost10;
  const insufficient = cost > 0 && credits < cost;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/wan-motion", {
        prompt: prompt.trim(),
        durationSeconds: duration,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Your clip is ready", description: "Find it in your library on the Studio home." });
      setPrompt("");
    },
    onError: async (err: any) => {
      let msg = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(msg);
      if (m) { try { const p = JSON.parse(m[1]); if (p?.message) msg = p.message; } catch {} }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Couldn't generate", description: msg, variant: "destructive" });
    },
  });

  const canSubmit = prompt.trim().length > 0 && !insufficient && !generate.isPending && cost > 0;

  return (
    <StudioToolPageShell
      title="Text → Video"
      subtitle="Describe a moment in plain language. We render it as a cinematic AI clip in seconds. Cost scales with length."
      iconAccent="from-violet-500 to-fuchsia-500"
    >
      <div className="space-y-5" data-testid="form-text-to-video">
        <div className="rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-md p-1 shadow-[0_0_60px_-15px_rgba(168,85,247,0.45)]">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A neon-lit panda DJ in Tokyo at midnight, slow cinematic dolly-in, vaporwave colors, anamorphic lens flares."
            maxLength={500}
            rows={5}
            className="bg-transparent border-0 text-base placeholder:text-white/40 focus-visible:ring-0 resize-none rounded-3xl px-5 py-4"
            data-testid="textarea-t2v-prompt"
          />
          <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[10px] text-white/40 tabular-nums">
            <span className="flex items-center gap-1.5 text-[11px] text-white/60">
              <Film className="w-3 h-3" /> Wan motion model
            </span>
            <span>{prompt.length}/500</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-white/60">Duration</p>
          <div className="grid grid-cols-2 gap-2">
            {([5, 10] as const).map((d) => {
              const c = d === 5 ? cost5 : cost10;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`py-3 rounded-xl text-sm font-bold border transition ${
                    duration === d
                      ? "bg-violet-500 text-white border-violet-400 shadow-[0_0_24px_rgba(168,85,247,0.5)]"
                      : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"
                  }`}
                  data-testid={`button-t2v-dur-${d}`}
                >
                  {d}s {c > 0 && <span className="opacity-80 font-normal">· {c} cr</span>}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          disabled={!canSubmit}
          onClick={() => generate.mutate()}
          className="w-full h-14 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-rose-400 text-black font-black tracking-wider hover:opacity-90 rounded-2xl text-base disabled:opacity-50"
          data-testid="button-t2v-generate"
        >
          {generate.isPending
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Rendering…</>
            : <><Wand2 className="w-5 h-5 mr-2" /> {insufficient ? `Need ${cost} cr` : `Generate · ${cost > 0 ? `${cost} cr` : "—"}`}</>}
        </Button>

        <p className="text-center text-[12px] text-white/60">
          Prefer to drop a reference photo? Try <a className="text-emerald-300 underline-offset-2 hover:underline" href="/studio/mirror-motion">Mirror Motion</a> instead.
        </p>
      </div>
    </StudioToolPageShell>
  );
}
