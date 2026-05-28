import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Zap } from "lucide-react";

const CYAN_ACTIVE = { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" };
const EDITABLE_STATUSES = ["posted", "offer_received"];

export default function LoadBoardEdit() {
  const [, params]   = useRoute("/load-board/:id/edit");
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const listingId    = params?.id ? parseInt(params.id) : 0;

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/load-board", listingId],
    enabled: !!listingId,
  });

  const [pricingMode, setPricingMode] = useState("fixed");
  const [postedPrice, setPostedPrice] = useState("");
  const [urgent,      setUrgent]      = useState(false);
  const [notes,       setNotes]       = useState("");

  const listing = data?.listing;

  useEffect(() => {
    if (!listing) return;
    setPricingMode(listing.pricingMode || "fixed");
    setPostedPrice(listing.postedPrice != null ? String(listing.postedPrice) : "");
    setUrgent(!!listing.urgent);
    setNotes(listing.notes || "");
  }, [listing]);

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/load-board/${listingId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board"] });
      toast({ title: "Listing updated" });
      navigate(`/load-board/${listingId}`);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });

  if (isLoading) return (
    <GuberLayout title="Edit Listing" showBack backHref={`/load-board/${listingId}`}>
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    </GuberLayout>
  );

  if (!listing || !EDITABLE_STATUSES.includes(listing.status)) return (
    <GuberLayout title="Edit Listing" showBack backHref={`/load-board/${listingId}`}>
      <div className="px-4 pt-12 text-center space-y-2">
        <p className="text-base font-display font-bold text-foreground">Editing Unavailable</p>
        <p className="text-xs text-muted-foreground/60">This listing cannot be edited in its current state.</p>
      </div>
    </GuberLayout>
  );

  if (!data?.isPoster) return (
    <GuberLayout title="Edit Listing" showBack backHref={`/load-board/${listingId}`}>
      <div className="px-4 pt-12 text-center">
        <p className="text-xs text-muted-foreground/60">You don't have permission to edit this listing.</p>
      </div>
    </GuberLayout>
  );

  return (
    <GuberLayout title="Edit Listing" showBack backHref={`/load-board/${listingId}`}>
      <div className="px-4 pt-4 pb-32 space-y-5">
        <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-widest">
          Update Pricing &amp; Details
        </p>

        {/* Pricing Mode */}
        <div>
          <Label className="text-[10px] text-muted-foreground/50 uppercase tracking-widest block mb-2">Pricing Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "fixed",          label: "Fixed Price",    sub: "You set the rate" },
              { value: "open_to_offers", label: "Open to Offers", sub: "Carriers bid" },
            ].map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPricingMode(p.value)}
                className="rounded-2xl p-3.5 text-left transition-all"
                style={pricingMode === p.value
                  ? CYAN_ACTIVE
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid={`select-edit-pricing-${p.value}`}
              >
                <p className="text-sm font-display font-bold">{p.label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{p.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Price input */}
        {pricingMode === "fixed" && (
          <div>
            <Label className="text-[10px] text-muted-foreground/50">Your Price ($)</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                value={postedPrice}
                onChange={e => setPostedPrice(e.target.value)}
                placeholder="0"
                type="number"
                className="rounded-xl h-12 bg-background/50 border-border/50 text-base pl-7"
                data-testid="input-edit-price"
              />
            </div>
          </div>
        )}

        {/* Urgent toggle */}
        <div
          className="flex items-center justify-between rounded-2xl p-3.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
        >
          <div>
            <p className="text-sm font-display font-bold text-foreground flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> Mark as Urgent
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Shown prominently for faster response</p>
          </div>
          <button
            type="button"
            onClick={() => setUrgent(!urgent)}
            className="w-10 h-6 rounded-full transition-all shrink-0"
            style={{ background: urgent ? "linear-gradient(135deg,#0891b2,#0e7490)" : "rgba(255,255,255,0.1)" }}
            data-testid="toggle-edit-urgent"
          >
            <div
              className="w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform"
              style={{ transform: urgent ? "translateX(16px)" : "translateX(0)" }}
            />
          </button>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-[10px] text-muted-foreground/50">Notes (optional)</Label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional details for carriers..."
            rows={3}
            className="mt-1 w-full rounded-xl bg-background/50 border border-border/50 text-sm p-3 text-foreground resize-none"
            data-testid="textarea-edit-notes"
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-safe-or-6 pt-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 70%, transparent 100%)" }}
      >
        <Button
          className="w-full max-w-lg mx-auto flex rounded-2xl h-12 font-display font-black text-sm"
          style={CYAN_ACTIVE}
          onClick={() => mutation.mutate({
            pricingMode,
            postedPrice: postedPrice ? parseFloat(postedPrice) : null,
            urgent,
            notes: notes || null,
          })}
          disabled={mutation.isPending}
          data-testid="button-save-edit"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
        </Button>
      </div>
    </GuberLayout>
  );
}
