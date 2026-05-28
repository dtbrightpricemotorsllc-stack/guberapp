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

const FIELD = "w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL = "text-xs font-display font-bold text-muted-foreground block mb-1.5";

export function MarketplaceEditModal({ item, onClose }: Props) {
  const { toast } = useToast();
  const isVehicle = ["vehicles", "boats & marine", "trailers"].includes((item.category || "").toLowerCase());

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || "");
  const [price, setPrice] = useState(item.price ? String(item.price) : "");
  const [availability, setAvailability] = useState(item.sellerAvailability || "available_now");
  const [condition, setCondition] = useState(item.condition || "");
  const [priceErr, setPriceErr] = useState("");
  const [mileageErr, setMileageErr] = useState("");

  // Vehicle-specific fields
  const [vin, setVin] = useState((item as any).vinNumber || "");
  const [mileage, setMileage] = useState((item as any).vehicleMileage != null ? String((item as any).vehicleMileage) : "");
  const [year, setYear] = useState((item as any).year || "");
  const [make, setMake] = useState((item as any).brand || "");
  const [model, setModel] = useState((item as any).model || "");
  const [titleStatus, setTitleStatus] = useState((item as any).titleStatus || "");

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
    let hasErr = false;
    setPriceErr("");
    setMileageErr("");

    const priceNum = price ? parseFloat(price) : null;
    if (isVehicle && priceNum !== null && priceNum > 0 && priceNum < 100) {
      setPriceErr("Price must be at least $100.");
      hasErr = true;
    }
    const mileageNum = mileage ? parseInt(mileage) : null;
    if (isVehicle && mileageNum !== null && mileageNum < 2) {
      setMileageErr("Mileage must be at least 2 miles.");
      hasErr = true;
    }
    if (hasErr) return;

    const patch: Record<string, any> = {
      title: title.trim(),
      description: description.trim() || null,
      sellerAvailability: availability,
    };
    if (price) patch.price = priceNum;
    if (condition) patch.condition = condition;
    if (isVehicle) {
      if (vin.trim()) patch.vinNumber = vin.trim();
      if (mileage) patch.vehicleMileage = mileageNum;
      if (year) patch.year = year.trim();
      if (make.trim()) patch.brand = make.trim();
      if (model.trim()) patch.model = model.trim();
      if (titleStatus) patch.titleStatus = titleStatus;
    }
    editMutation.mutate(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "#111113", border: "1px solid rgba(0,229,118,0.22)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-base font-display font-bold">Edit Listing</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10" data-testid="button-close-edit-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className={LABEL}>TITLE</label>
            <input data-testid="input-edit-title" value={title} onChange={e => setTitle(e.target.value)}
              maxLength={120} className={FIELD} />
          </div>

          {/* Price */}
          <div>
            <label className={LABEL}>PRICE ($)</label>
            <input data-testid="input-edit-price" type="number" min="0" value={price}
              onChange={e => { setPrice(e.target.value); setPriceErr(""); }}
              className={FIELD + (priceErr ? " border-red-500/60" : "")} />
            {priceErr && <p className="text-xs text-red-400 mt-1">{priceErr}</p>}
          </div>

          {/* Condition */}
          <div>
            <label className={LABEL}>CONDITION</label>
            <select data-testid="select-edit-condition" value={condition} onChange={e => setCondition(e.target.value)}
              className={FIELD}>
              <option value="">— Select —</option>
              {["New", "Like New", "Good", "Fair", "Poor"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Availability */}
          <div>
            <label className={LABEL}>AVAILABILITY</label>
            <select data-testid="select-edit-availability" value={availability} onChange={e => setAvailability(e.target.value)}
              className={FIELD}>
              <option value="available_now">Available Now</option>
              <option value="today">Available Today</option>
              <option value="this_week">This Week</option>
              <option value="by_appointment">By Appointment</option>
            </select>
          </div>

          {/* Vehicle-only fields */}
          {isVehicle && (
            <>
              <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-display font-bold text-primary/70 uppercase tracking-widest">Vehicle Details</p>
              </div>

              {/* Year / Make / Model row */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={LABEL}>YEAR</label>
                  <input data-testid="input-edit-year" value={year} onChange={e => setYear(e.target.value)}
                    placeholder="2019" maxLength={4} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>MAKE</label>
                  <input data-testid="input-edit-make" value={make} onChange={e => setMake(e.target.value)}
                    placeholder="Toyota" maxLength={50} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>MODEL</label>
                  <input data-testid="input-edit-model" value={model} onChange={e => setModel(e.target.value)}
                    placeholder="Camry" maxLength={80} className={FIELD} />
                </div>
              </div>

              {/* VIN */}
              <div>
                <label className={LABEL}>VIN</label>
                <input data-testid="input-edit-vin" value={vin} onChange={e => setVin(e.target.value.toUpperCase())}
                  placeholder="17-character VIN" maxLength={17}
                  className={FIELD + " font-mono tracking-widest"} />
                {vin && vin.length !== 17 && (
                  <p className="text-[10px] text-amber-400 mt-1">VINs are typically 17 characters ({vin.length}/17)</p>
                )}
              </div>

              {/* Mileage */}
              <div>
                <label className={LABEL}>MILEAGE</label>
                <input data-testid="input-edit-mileage" type="number" min="2" value={mileage}
                  onChange={e => { setMileage(e.target.value); setMileageErr(""); }}
                  placeholder="e.g. 45000"
                  className={FIELD + (mileageErr ? " border-red-500/60" : "")} />
                {mileageErr && <p className="text-xs text-red-400 mt-1">{mileageErr}</p>}
              </div>

              {/* Title status */}
              <div>
                <label className={LABEL}>TITLE STATUS</label>
                <select data-testid="select-edit-title-status" value={titleStatus} onChange={e => setTitleStatus(e.target.value)}
                  className={FIELD}>
                  <option value="">— Select —</option>
                  {["Clean", "Salvage", "Rebuilt", "Lemon", "Parts Only", "Bonded", "Certificate of Destruction"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Description */}
          <div>
            <label className={LABEL}>DESCRIPTION</label>
            <textarea data-testid="input-edit-description" value={description}
              onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/2000</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/8 flex gap-3">
          <Button variant="outline" className="flex-1 font-display" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-save-edit" className="flex-1 premium-btn font-display"
            onClick={handleSave} disabled={editMutation.isPending || !title.trim()}>
            {editMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
