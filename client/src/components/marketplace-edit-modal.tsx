import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { MarketplaceItem } from "@shared/schema";

interface Props {
  item: MarketplaceItem;
  onClose: () => void;
}

export function MarketplaceEditModal({ item, onClose }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || "");
  const [price, setPrice] = useState(item.price ? String(item.price) : "");
  const [availability, setAvailability] = useState(item.sellerAvailability || "available_now");
  const [condition, setCondition] = useState(item.condition || "");

  const editMutation = useMutation({
    mutationFn: (patch: Record<string, any>) =>
      apiRequest("PATCH", `/api/marketplace/${item.id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/slug", item.publicSlug] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/my-listings"] });
      toast({ title: "Listing updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const patch: Record<string, any> = {
      title: title.trim(),
      description: description.trim() || null,
      sellerAvailability: availability,
    };
    if (price) patch.price = parseFloat(price);
    if (condition) patch.condition = condition;
    editMutation.mutate(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-base font-display font-bold">Edit Listing</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10" data-testid="button-close-edit-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground block mb-1.5">TITLE</label>
            <input
              data-testid="input-edit-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Price */}
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground block mb-1.5">PRICE ($)</label>
            <input
              data-testid="input-edit-price"
              type="number"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground block mb-1.5">CONDITION</label>
            <select
              data-testid="select-edit-condition"
              value={condition}
              onChange={e => setCondition(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Select —</option>
              {["New", "Like New", "Good", "Fair", "Poor"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Availability */}
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground block mb-1.5">AVAILABILITY</label>
            <select
              data-testid="select-edit-availability"
              value={availability}
              onChange={e => setAvailability(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="available_now">Available Now</option>
              <option value="today">Available Today</option>
              <option value="this_week">This Week</option>
              <option value="by_appointment">By Appointment</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-display font-bold text-muted-foreground block mb-1.5">DESCRIPTION</label>
            <textarea
              data-testid="input-edit-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/2000</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/8 flex gap-3">
          <Button variant="outline" className="flex-1 font-display" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="button-save-edit"
            className="flex-1 premium-btn font-display"
            onClick={handleSave}
            disabled={editMutation.isPending || !title.trim()}
          >
            {editMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
