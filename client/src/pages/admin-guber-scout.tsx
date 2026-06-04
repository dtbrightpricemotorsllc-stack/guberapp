import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Radar, MapPin, Phone, Link2, Copy, ExternalLink, Trash2, Loader2, Sparkles, ChevronLeft } from "lucide-react";
import type { PresetListing } from "@shared/schema";

function buildOutreachTarget(listing: PresetListing): string | null {
  if (listing.socialMediaUrl) return listing.socialMediaUrl;
  if (listing.phoneNumber) {
    const digits = listing.phoneNumber.replace(/[^\d]/g, "");
    if (digits) return `sms:${digits}`;
  }
  return null;
}

function ListingCard({
  listing,
  onDelete,
}: {
  listing: PresetListing;
  onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState(listing.draftedMessage ?? "");

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      /* clipboard may be unavailable; still open the link */
    }
    const target = buildOutreachTarget(listing);
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
      toast({ title: "Message copied", description: "Outreach link opened in a new tab. Paste & send manually." });
    } else {
      toast({ title: "Message copied", description: "No social/phone link on file — paste it wherever you reach out." });
    }
  };

  return (
    <Card
      className="border-white/10 bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-white/20"
      data-testid={`card-listing-${listing.id}`}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display truncate text-lg font-semibold text-white" data-testid={`text-business-${listing.id}`}>
              {listing.businessName}
            </h3>
            <p className="truncate text-xs text-white/40">guber.com/p/{listing.profileSlug}</p>
          </div>
          <Badge className="shrink-0 gap-1 border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <MapPin className="h-3 w-3" /> Staging Pin Active
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
          {listing.phoneNumber && (
            <span className="inline-flex items-center gap-1" data-testid={`text-phone-${listing.id}`}>
              <Phone className="h-3 w-3" /> {listing.phoneNumber}
            </span>
          )}
          {listing.socialMediaUrl && (
            <a
              href={listing.socialMediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sky-300 hover:underline"
              data-testid={`link-social-${listing.id}`}
            >
              <Link2 className="h-3 w-3" /> Social
            </a>
          )}
        </div>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="resize-y border-white/10 bg-black/40 text-sm text-white/90"
          data-testid={`textarea-message-${listing.id}`}
        />

        <div className="flex items-center gap-2">
          <Button
            onClick={copyAndOpen}
            className="flex-1 gap-2 bg-white text-black hover:bg-white/90"
            data-testid={`button-copy-open-${listing.id}`}
          >
            <Copy className="h-4 w-4" />
            <ExternalLink className="h-4 w-4" />
            Copy &amp; Open Link
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(listing.id)}
            className="text-white/40 hover:text-red-400"
            data-testid={`button-delete-${listing.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminGuberScout() {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [zipCode, setZipCode] = useState("");

  const { data: catData } = useQuery<{ categories: string[] }>({
    queryKey: ["/api/admin/guber-scout/categories"],
  });
  const categories = catData?.categories ?? [];

  const { data, isLoading } = useQuery<{ listings: PresetListing[] }>({
    queryKey: ["/api/admin/guber-scout/listings"],
  });
  const listings = data?.listings ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, PresetListing[]>();
    for (const l of listings) {
      const arr = map.get(l.zipCode) ?? [];
      arr.push(l);
      map.set(l.zipCode, arr);
    }
    return Array.from(map.entries());
  }, [listings]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/guber-scout/run", { category, zipCode });
      return res.json();
    },
    onSuccess: (resp: { listings: PresetListing[]; usedAI: boolean; source?: "google_places" | "sample" }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guber-scout/listings"] });
      const n = resp.listings?.length ?? 0;
      const ai = resp.usedAI ? "AI drafted each outreach message." : "Used template copy (AI unavailable).";
      if (resp.source === "sample") {
        toast({
          title: `Staged ${n} sample leads`,
          description: `No live Google Places results — enable the Places API for real businesses. ${ai}`,
        });
      } else {
        toast({
          title: `Pulled ${n} real businesses`,
          description: `Live from Google Places (name, phone, coordinates). ${ai}`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Scout run failed", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/guber-scout/listings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guber-scout/listings"] });
    },
  });

  const canRun = category.length > 0 && /^\d{5}$/.test(zipCode) && !runMutation.isPending;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Link href="/admin/qa">
            <span className="inline-flex cursor-pointer items-center gap-1 text-xs text-white/40 hover:text-white/70">
              <ChevronLeft className="h-3 w-3" /> Admin
            </span>
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Radar className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">GUBER Scout</h1>
              <p className="text-sm text-white/50">Lead-gen &amp; semi-automated local outreach — internal only.</p>
            </div>
          </div>
        </div>

        {/* Control panel */}
        <Card className="mb-8 border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/40">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="border-white/10 bg-black/40 text-white" data-testid="select-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-40">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/40">ZIP Code</label>
                <Input
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  placeholder="e.g. 30301"
                  inputMode="numeric"
                  className="border-white/10 bg-black/40 text-white"
                  data-testid="input-zip"
                />
              </div>
              <Button
                onClick={() => runMutation.mutate()}
                disabled={!canRun}
                className="gap-2 bg-emerald-400 font-semibold text-black hover:bg-emerald-300 disabled:opacity-40"
                data-testid="button-run-scout"
              >
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Scouting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> RUN GUBER SCOUT
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-white/30">
              Pulls real local businesses from Google Maps near the ZIP (name, phone, coordinates) plus a social link from each site, with an AI-drafted outreach message each. Sending stays manual.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading staged leads…
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-white/40" data-testid="text-empty">
            No staged leads yet. Pick a category + ZIP and run the scout.
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([zip, items]) => (
              <div key={zip} data-testid={`group-zip-${zip}`}>
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-300" />
                  <h2 className="font-display text-lg font-semibold">ZIP {zip}</h2>
                  <span className="text-xs text-white/40">
                    {items.length} {items.length === 1 ? "lead" : "leads"}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((l) => (
                    <ListingCard key={l.id} listing={l} onDelete={(id) => deleteMutation.mutate(id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
