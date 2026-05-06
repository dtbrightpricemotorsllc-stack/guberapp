import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StudioVideo, StudioVibe } from "@shared/schema";
import { Sparkles, Image as ImageIcon, Coins, Lock, Zap, Loader2, Download, Wand2 } from "lucide-react";
import { Link } from "wouter";

type StudioMe = { credits: number; tier: string; day1OG: boolean; providerReady: boolean };
type Pack = { id: string; credits: number; priceCents: number; label: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

const TIER_LABEL: Record<string, string> = {
  standard: "STANDARD",
  creator: "CREATOR",
  business: "BUSINESS",
};

export default function StudioPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [vibeId, setVibeId] = useState<number | null>(null);
  const [sourceImage, setSourceImage] = useState<{ base64: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: me, isLoading: meLoading } = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const { data: vibes } = useQuery<StudioVibe[]>({ queryKey: ["/api/studio/vibes"] });
  const { data: history } = useQuery<StudioVideo[]>({ queryKey: ["/api/studio/videos"] });
  const { data: packs } = useQuery<Pack[]>({ queryKey: ["/api/studio/packs"] });

  const credits = me?.credits ?? 0;
  const tier = me?.tier ?? "standard";

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/generate", {
        prompt: prompt.trim(),
        vibeId: vibeId ?? undefined,
        sourceImageBase64: sourceImage?.base64,
      });
      return res.json();
    },
    onSuccess: () => {
      setPrompt("");
      setSourceImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/videos"] });
      toast({ title: "Clip ready!", description: "Your generation just landed below." });
    },
    onError: async (err: any) => {
      // apiRequest throws Error(`${status}: ${text}`) — extract message
      let message = err?.message || "Generation failed";
      const m = /^\d+:\s*(.+)$/.exec(message);
      if (m) {
        try { const parsed = JSON.parse(m[1]); if (parsed?.message) message = parsed.message; } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] });
      toast({ title: "Couldn't generate", description: message, variant: "destructive" });
    },
  });

  const buyPackMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", "/api/stripe/studio-credits-checkout", { packId });
      return res.json() as Promise<{ checkoutUrl?: string; message?: string }>;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else toast({ title: "Checkout failed", description: data.message || "Try again.", variant: "destructive" });
    },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Image only", description: "Pick a JPG/PNG/WebP.", variant: "destructive" }); return; }
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Too large", description: "Max 8MB.", variant: "destructive" }); return; }
    const base64 = await fileToBase64(file);
    setSourceImage({ base64, preview: URL.createObjectURL(file) });
  };

  // Surface Stripe success/cancel returns
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("credits") === "success") {
      toast({ title: "Payment received!", description: "Your credits will appear momentarily." });
      // Refresh balance after a small delay so the webhook lands
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/studio/me"] }), 2500);
      window.history.replaceState({}, "", "/studio");
    } else if (params.get("credits") === "cancel") {
      toast({ title: "Checkout canceled", description: "No charge was made." });
      window.history.replaceState({}, "", "/studio");
    }
  }, [toast]);

  const canGenerate = prompt.trim().length >= 4 && credits >= 1 && !generateMutation.isPending;

  const sortedHistory = useMemo(() => (history || []).filter((v) => v.status === "succeeded" || v.status === "pending"), [history]);

  return (
    <GuberLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6" data-testid="page-studio">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-primary" />
              <span>GUBER STUDIO</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">AI-generated short videos for your jobs, profile, and promos.</p>
          </div>
          <Badge variant="outline" className="font-display tracking-widest text-[10px]" data-testid="badge-studio-tier">
            {TIER_LABEL[tier] || tier.toUpperCase()}
          </Badge>
        </div>

        {/* Credit balance + Buy CTA */}
        <Card className="p-4 flex items-center justify-between gap-4 bg-primary/[0.04] border-primary/20">
          <div className="flex items-center gap-3">
            <Coins className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">Credits</p>
              <p className="text-2xl font-black font-display" data-testid="text-credits-balance">{meLoading ? "—" : credits}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" data-testid="link-buy-credits">
            <a href="#buy">Buy Credits</a>
          </Button>
        </Card>

        {/* Provider not configured banner */}
        {me && !me.providerReady && (
          <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-amber-100">
            <p className="text-sm font-semibold mb-1">Studio is launching soon</p>
            <p className="text-xs text-muted-foreground">
              Generation is paused while we finish the AI provider connection. Your credits are safe and will work the moment we go live.
            </p>
          </Card>
        )}

        {/* Vibe carousel */}
        <div>
          <p className="text-xs uppercase tracking-widest font-display text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Pick a vibe (optional)
          </p>
          {!vibes || vibes.length === 0 ? (
            <Card className="p-4 text-center text-xs text-muted-foreground" data-testid="text-vibes-empty">
              Vibe presets are coming soon. For now, just type a prompt below — your imagination is the limit.
            </Card>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
              <button
                onClick={() => setVibeId(null)}
                className={`shrink-0 w-28 h-36 rounded-xl border-2 snap-start flex flex-col items-center justify-center gap-1 ${vibeId === null ? "border-primary bg-primary/10" : "border-white/10 bg-card"}`}
                data-testid="button-vibe-none"
              >
                <Zap className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-widest font-display">No Vibe</span>
              </button>
              {vibes.map((v) => {
                const locked = v.tierRequired !== "standard" && tier === "standard";
                return (
                  <button
                    key={v.id}
                    disabled={locked}
                    onClick={() => setVibeId(v.id === vibeId ? null : v.id)}
                    className={`shrink-0 w-28 h-36 rounded-xl border-2 snap-start relative overflow-hidden text-left ${vibeId === v.id ? "border-primary" : "border-white/10"} ${locked ? "opacity-50" : ""}`}
                    data-testid={`button-vibe-${v.slug}`}
                  >
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt={v.name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-card" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <p className="text-[11px] font-bold leading-tight">{v.name}</p>
                      {locked && <span className="text-[9px] uppercase tracking-widest text-amber-300 flex items-center gap-1 mt-0.5"><Lock className="w-2.5 h-2.5" /> {v.tierRequired}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Prompt + reference image */}
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-widest font-display text-muted-foreground mb-2">Describe your clip</p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A neon-lit panda DJ in Tokyo, slow cinematic dolly-in, vaporwave colors…"
              maxLength={500}
              rows={4}
              data-testid="input-prompt"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{prompt.length}/500</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest font-display text-muted-foreground mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> Reference image (optional)
            </p>
            {sourceImage ? (
              <div className="relative inline-block">
                <img src={sourceImage.preview} alt="Source" className="rounded-lg max-h-40" />
                <Button size="sm" variant="destructive" className="absolute top-1 right-1 h-7 px-2 text-[10px]" onClick={() => setSourceImage(null)} data-testid="button-remove-source">
                  Remove
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  data-testid="input-source-image"
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-pick-source">
                  <ImageIcon className="w-4 h-4 mr-2" /> Pick an image
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Generate */}
        <Button
          className="w-full h-14 text-base font-display tracking-wider"
          disabled={!canGenerate}
          onClick={() => generateMutation.mutate()}
          data-testid="button-generate"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating… (30-90s)</>
          ) : (
            <><Wand2 className="w-5 h-5 mr-2" /> Generate · 1 credit</>
          )}
        </Button>
        {credits < 1 && (
          <p className="text-xs text-amber-300 text-center -mt-3">You're out of credits. Buy a pack below to keep generating.</p>
        )}

        {/* History */}
        <div>
          <p className="text-xs uppercase tracking-widest font-display text-muted-foreground mb-2">Your clips</p>
          {!history ? (
            <div className="grid grid-cols-2 gap-3"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div>
          ) : sortedHistory.length === 0 ? (
            <Card className="p-6 text-center text-xs text-muted-foreground" data-testid="text-history-empty">
              No clips yet. Hit Generate to create your first one.
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sortedHistory.map((v) => (
                <Card key={v.id} className="overflow-hidden" data-testid={`card-clip-${v.id}`}>
                  {v.videoUrl ? (
                    <video src={v.videoUrl} poster={v.thumbnailUrl ?? undefined} controls className="w-full aspect-square object-cover bg-black" />
                  ) : (
                    <div className="w-full aspect-square bg-black flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-[11px] line-clamp-2 leading-tight">{v.prompt}</p>
                    {v.videoUrl && (
                      <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[10px] mt-1">
                        <a href={v.videoUrl} download data-testid={`link-download-${v.id}`}><Download className="w-3 h-3 mr-1" /> Download</a>
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Buy credits */}
        <div id="buy">
          <p className="text-xs uppercase tracking-widest font-display text-muted-foreground mb-2 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" /> Credit packs
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(packs || []).map((p) => (
              <Card key={p.id} className="p-4 text-center hover-elevate" data-testid={`card-pack-${p.id}`}>
                <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">{p.label}</p>
                <p className="text-3xl font-black font-display mt-2">{p.credits}</p>
                <p className="text-xs text-muted-foreground">credits</p>
                <p className="text-lg font-bold mt-2">${(p.priceCents / 100).toFixed(0)}</p>
                <Button
                  className="w-full mt-3"
                  size="sm"
                  disabled={buyPackMutation.isPending}
                  onClick={() => buyPackMutation.mutate(p.id)}
                  data-testid={`button-buy-${p.id}`}
                >
                  {buyPackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buy"}
                </Button>
              </Card>
            ))}
          </div>
        </div>

        {/* Tier upsell teaser */}
        {tier === "standard" && (
          <Card className="p-4 border-primary/20 bg-primary/[0.03]">
            <p className="text-xs uppercase tracking-widest font-display text-primary">Coming soon</p>
            <p className="text-sm font-semibold mt-1">Creator & Business tiers</p>
            <p className="text-xs text-muted-foreground mt-1">
              Reference clips, motion AI, brand kits, ad templates, captions, music, and multi-platform export. Standard users get a clean upgrade path when ready.
            </p>
          </Card>
        )}

        <p className="text-[10px] text-muted-foreground text-center pt-4">
          By generating you agree to the GUBER <Link href="/acceptable-use" className="underline">Acceptable Use Policy</Link>.
        </p>
      </div>
    </GuberLayout>
  );
}
