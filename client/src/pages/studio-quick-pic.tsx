import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, ImageIcon, RefreshCw } from "lucide-react";

type FreeQuota = { enabled: boolean; dailyLimit: number; used: number; remaining: number };
type StudioFile = { id: number; providerUrl: string };
type GenerateResult = { file: StudioFile; remaining: number };

export default function StudioQuickPicPage() {
  const { toast } = useToast();
  const searchString = useSearch();
  const initialPrompt = new URLSearchParams(searchString).get("prompt") ?? "";
  const [prompt, setPrompt] = useState(initialPrompt);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(searchString).get("prompt");
    if (p) setPrompt(p);
  }, [searchString]);

  const quotaQuery = useQuery<FreeQuota>({ queryKey: ["/api/studio/free-quota"] });
  const quota = quotaQuery.data;
  const remaining = quota?.remaining ?? quota?.dailyLimit ?? 3;
  const outOfQuota = remaining <= 0;

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate/quick-pic", { prompt });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Generation failed");
      }
      return res.json() as Promise<GenerateResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/free-quota"] });
      setResult(data);
    },
    onError: (e: Error) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const canGenerate = prompt.trim().length > 3 && !outOfQuota && !generate.isPending;

  return (
    <StudioToolPageShell
      title="Quick Pic"
      subtitle="Free AI image generator — 3 per day, no credits needed."
      iconAccent="from-emerald-400 to-cyan-500"
    >
      <div className="space-y-5 max-w-lg mx-auto">
        {/* Quota badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
            FREE
          </span>
          <span className="text-xs text-white/40">
            {quotaQuery.isLoading
              ? "Loading quota…"
              : outOfQuota
              ? "Daily limit reached — resets at midnight UTC"
              : `${remaining} of ${quota?.dailyLimit ?? 3} free images left today`}
          </span>
        </div>

        {/* Prompt */}
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Describe your image</p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={500}
            rows={4}
            disabled={generate.isPending}
            placeholder="A cinematic portrait of a golden retriever wearing aviator sunglasses, dramatic studio lighting, hyper-detailed."
            className="rounded-xl bg-background/50 border-border/50 text-sm resize-none"
            data-testid="textarea-prompt"
          />
          <p className="text-right text-xs text-white/25 mt-1">{prompt.length}/500</p>
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <img
              src={result.file.providerUrl}
              alt="Generated image"
              className="w-full rounded-2xl border border-white/10 object-cover"
              data-testid="img-result"
            />
            <div className="flex gap-2">
              <a
                href={result.file.providerUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex-1"
                data-testid="link-download"
              >
                <Button className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold">
                  <Download className="w-4 h-4 mr-1.5" /> Download
                </Button>
              </a>
              <Button
                variant="outline"
                onClick={() => setResult(null)}
                className="border-white/20"
                data-testid="btn-try-again"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {!result && (
          <Button
            onClick={() => generate.mutate()}
            disabled={!canGenerate}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-12 text-base"
            data-testid="btn-generate"
          >
            {generate.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating (~10s)…
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4 mr-2" /> Generate Image (Free)
              </>
            )}
          </Button>
        )}

        {outOfQuota && (
          <p className="text-center text-xs text-white/40">
            You've used all 3 free images for today. Come back tomorrow — or{" "}
            <a href="/studio/credits" className="text-emerald-400 underline">
              get credits
            </a>{" "}
            for unlimited access.
          </p>
        )}
      </div>
    </StudioToolPageShell>
  );
}
