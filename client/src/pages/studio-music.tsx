// /studio/music — task-549.
// Dedicated music-generation page (MiniMax). Indigo/violet palette so it
// reads as audio at a glance — distinct from the green/violet video tools.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Music, AudioLines } from "lucide-react";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";

type StudioMe = { credits: number };
type StudioTool = { key: string; creditsCost: number };

const MOOD_CHIPS = [
  { label: "Cinematic strings", prompt: "Uplifting cinematic strings with hopeful melody, slow build, instrumental, 30 seconds, broadcast quality." },
  { label: "Lofi chill",        prompt: "Lofi hip-hop instrumental, mellow piano chords, soft vinyl crackle, head-nod tempo, 30 seconds." },
  { label: "Hype trailer",      prompt: "Epic trailer hit, deep brass swells, pulsing percussion, dramatic build with a final boom, 30 seconds." },
  { label: "Sunset house",      prompt: "Smooth sunset house track, warm analog synths, four-on-the-floor groove, deep filtered bassline, 30 seconds." },
  { label: "Acoustic warm",     prompt: "Warm acoustic guitar with soft tambourine, intimate folk feel, gentle build, instrumental, 30 seconds." },
];

export default function StudioMusicPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const credits = meQuery.data?.credits ?? 0;
  const cost = (toolsQuery.data ?? []).find((t) => t.key === "minimax_music")?.creditsCost ?? 0;
  const insufficient = cost > 0 && credits < cost;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/music", { prompt: prompt.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Track ready", description: "Find it in your library on the Studio home." });
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
      title="Music"
      subtitle="Type the mood and we score it. 30-second cinematic instrumentals built by MiniMax."
      iconAccent="from-indigo-500 to-purple-600"
    >
      {/* Music-mode visual signature: animated indigo/violet waveform + label. */}
      <div className="relative rounded-3xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-purple-500/10 p-4 overflow-hidden" data-testid="music-mode-banner">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_70%)]" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.5)]">
            <AudioLines className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-indigo-200/80">Music mode</p>
            <p className="text-sm font-bold text-white truncate">Output is audio · MP3 · ~30s</p>
          </div>
          {/* Tiny animated bars for visual signature */}
          <div className="flex items-end gap-0.5 h-7">
            {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5].map((h, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-indigo-400 to-violet-300"
                style={{ height: `${h * 100}%`, animation: `barPulse${i} 1.2s ease-in-out ${i * 0.08}s infinite alternate` }}
              />
            ))}
            <style>{`
              @keyframes barPulse0 { from { height: 30% } to { height: 80% } }
              @keyframes barPulse1 { from { height: 60% } to { height: 30% } }
              @keyframes barPulse2 { from { height: 40% } to { height: 90% } }
              @keyframes barPulse3 { from { height: 80% } to { height: 40% } }
              @keyframes barPulse4 { from { height: 50% } to { height: 70% } }
              @keyframes barPulse5 { from { height: 70% } to { height: 50% } }
              @keyframes barPulse6 { from { height: 35% } to { height: 75% } }
            `}</style>
          </div>
        </div>
      </div>

      <div className="space-y-3 mt-1">
        <p className="text-xs uppercase tracking-widest text-white/60">Mood starters</p>
        <div className="flex flex-wrap gap-2">
          {MOOD_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setPrompt(chip.prompt)}
              className="text-[11px] px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-100 hover:bg-indigo-500/25 transition"
              data-testid={`chip-mood-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-400/20 backdrop-blur-md p-1 shadow-[0_0_60px_-15px_rgba(139,92,246,0.5)]">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a track… uplifting cinematic strings, slow build, hopeful instrumental, 30 seconds."
          maxLength={500}
          rows={5}
          className="bg-transparent border-0 text-base placeholder:text-white/40 focus-visible:ring-0 resize-none rounded-3xl px-5 py-4"
          data-testid="textarea-music-prompt"
        />
        <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[10px] text-white/40 tabular-nums">
          <span className="flex items-center gap-1.5 text-[11px] text-white/60">
            <Music className="w-3 h-3" /> MiniMax · 30s
          </span>
          <span>{prompt.length}/500</span>
        </div>
      </div>

      <Button
        disabled={!canSubmit}
        onClick={() => generate.mutate()}
        className="w-full h-14 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-white font-black tracking-wider hover:opacity-90 rounded-2xl text-base disabled:opacity-50"
        data-testid="button-music-generate"
      >
        {generate.isPending
          ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Composing…</>
          : <><AudioLines className="w-5 h-5 mr-2" /> {insufficient ? `Need ${cost} cr` : `Generate music · ${cost > 0 ? `${cost} cr` : "—"}`}</>}
      </Button>
    </StudioToolPageShell>
  );
}
