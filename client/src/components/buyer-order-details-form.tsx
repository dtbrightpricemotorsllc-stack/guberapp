import { Button } from "@/components/ui/button";

export const BO_FIELDS = [
  { key: "vin",           label: "VIN *",               placeholder: "e.g. 1HGCM82633A123456", required: true },
  { key: "trim",          label: "Trim / Series",        placeholder: "e.g. EX-L" },
  { key: "mileage",       label: "Mileage",              placeholder: "e.g. 45000", type: "number" },
  { key: "engine",        label: "Engine",               placeholder: "e.g. 2.5L 4-Cylinder" },
  { key: "fuelType",      label: "Fuel Type",            placeholder: "e.g. Gasoline" },
  { key: "driveType",     label: "Drive Type",           placeholder: "e.g. FWD" },
  { key: "exteriorColor", label: "Exterior Color",       placeholder: "e.g. Silver" },
  { key: "interiorColor", label: "Interior Color",       placeholder: "e.g. Black" },
  { key: "conditionNotes", label: "Condition Notes",     placeholder: "e.g. Needs transmission work", textarea: true },
] as const;

export const EMPTY_BO_DETAILS = {
  vin: "", trim: "", mileage: "", engine: "", fuelType: "",
  driveType: "", exteriorColor: "", interiorColor: "", conditionNotes: "", dealerFees: "",
};

export function BuyerOrderDetailsForm({ data, onChange, onSubmit, isPending, isDealer }: {
  data: Record<string, string>;
  onChange: (d: Record<string, string>) => void;
  onSubmit: () => void;
  isPending: boolean;
  isDealer: boolean;
}) {
  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";
  return (
    <div className="space-y-2 pt-1">
      {BO_FIELDS.map(f => (
        <div key={f.key}>
          <label className="text-[10px] text-muted-foreground block mb-0.5">{f.label}</label>
          {(f as any).textarea ? (
            <textarea rows={2} placeholder={f.placeholder} value={data[f.key] || ""}
              onChange={e => onChange({ ...data, [f.key]: e.target.value })}
              className={inputCls + " resize-none"} data-testid={`input-bo-${f.key}`} />
          ) : (
            <input type={(f as any).type || "text"} placeholder={f.placeholder} value={data[f.key] || ""}
              onChange={e => onChange({ ...data, [f.key]: e.target.value })}
              className={inputCls} data-testid={`input-bo-${f.key}`} />
          )}
        </div>
      ))}
      {isDealer && (
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Dealer Fees / Notes</label>
          <textarea rows={2} placeholder="e.g. $399 doc fee, dealer warranty available"
            value={data.dealerFees || ""}
            onChange={e => onChange({ ...data, dealerFees: e.target.value })}
            className={inputCls + " resize-none"} data-testid="input-bo-dealerFees" />
        </div>
      )}
      <Button className="w-full font-display text-sm mt-1"
        style={{ background: "rgba(0,180,80,0.2)", border: "1px solid rgba(0,180,80,0.4)", color: "#00e676" }}
        onClick={onSubmit} disabled={isPending || !(data.vin || "").trim()}
        data-testid="button-submit-bo-details">
        {isPending ? "Saving…" : "Save & Enable Downloads"}
      </Button>
    </div>
  );
}
