import { useState, useMemo, useCallback } from "react";
import { X, MapPin, DollarSign, Lock, ShieldCheck, Zap } from "lucide-react";
import { GoogleMap, type JobPin, type CashDropPin, type WorkerPin } from "@/components/google-map";

interface DemoTask {
  id: number;
  title: string;
  category: string;
  payout: number;
  color: string;
  dLat: number;
  dLng: number;
  urgent?: boolean;
  proof?: boolean;
}

// Mock local opportunities scattered around the viewer's live position.
// Offsets are in degrees (~0.01deg ≈ 1.1km) so markers land in the user's city.
const DEMO_TASKS: DemoTask[] = [
  { id: 9001, title: "Vehicle Verification", category: "Verify & Inspect", payout: 35, color: "#8B5CF6", dLat: 0.012, dLng: 0.010, proof: true },
  { id: 9002, title: "Yard Cleanup — Leaf Blowing", category: "General Labor", payout: 55, color: "#15803D", dLat: -0.009, dLng: 0.014, urgent: true },
  { id: 9003, title: "Help Moving a Couch", category: "On-Demand Help", payout: 80, color: "#c2410c", dLat: 0.016, dLng: -0.008 },
  { id: 9004, title: "Grocery Run & Drop-off", category: "On-Demand Help", payout: 25, color: "#c2410c", dLat: -0.014, dLng: -0.012 },
  { id: 9005, title: "Pre-Purchase Photo Run", category: "Verify & Inspect", payout: 45, color: "#8B5CF6", dLat: 0.006, dLng: -0.017 },
  { id: 9006, title: "Furniture Assembly", category: "Skilled Labor", payout: 70, color: "#b91c1c", dLat: -0.005, dLng: 0.018, proof: true },
];

const DEMO_DROPS = [
  { id: 8001, title: "Cash Drop", reward: 50, dLat: 0.004, dLng: 0.005 },
  { id: 8002, title: "Cash Drop", reward: 25, dLat: -0.011, dLng: 0.002 },
];

const DEMO_WORKERS = [
  { dLat: 0.002, dLng: -0.006 },
  { dLat: -0.007, dLng: -0.003 },
  { dLat: 0.010, dLng: 0.003 },
  { dLat: -0.003, dLng: 0.011 },
];

export function GridDemo({ onClaim, onCollapse }: { onClaim: () => void; onCollapse?: () => void }) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<DemoTask | null>(null);

  const handleUserPos = useCallback((pos: { lat: number; lng: number }) => {
    setUserPos((prev) => prev ?? pos);
  }, []);

  const pins: JobPin[] = useMemo(() => {
    if (!userPos) return [];
    return DEMO_TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      serviceType: null,
      budget: t.payout,
      status: "open",
      urgentSwitch: !!t.urgent,
      lat: userPos.lat + t.dLat,
      lng: userPos.lng + t.dLng,
      locationApprox: "Near you",
      color: t.color,
      createdAt: new Date().toISOString(),
      zip: null,
    }));
  }, [userPos]);

  const cashDrops: CashDropPin[] = useMemo(() => {
    if (!userPos) return [];
    return DEMO_DROPS.map((d) => ({
      id: d.id,
      gpsLat: userPos.lat + d.dLat,
      gpsLng: userPos.lng + d.dLng,
      title: d.title,
      rewardPerWinner: d.reward,
      status: "open",
    }));
  }, [userPos]);

  const workerPins: WorkerPin[] = useMemo(() => {
    if (!userPos) return [];
    return DEMO_WORKERS.map((w, i) => ({
      id: 7000 + i,
      fullName: "Local Worker",
      username: "worker",
      tier: "standard",
      avatar: null,
      lat: userPos.lat + w.dLat,
      lng: userPos.lng + w.dLng,
      bio: "",
      skills: "",
      rating: 5,
      reviewCount: 0,
      color: "#EC4899",
    }));
  }, [userPos]);

  const handlePinClick = useCallback((pin: JobPin | null) => {
    if (!pin) { setSelected(null); return; }
    const t = DEMO_TASKS.find((x) => x.id === pin.id) || null;
    setSelected(t);
  }, []);

  const handleDropClick = useCallback((drop: CashDropPin) => {
    setSelected({
      id: drop.id,
      title: "Live Cash Drop",
      category: "Cash Drop",
      payout: drop.rewardPerWinner,
      color: "#22C55E",
      dLat: 0, dLng: 0,
    });
  }, []);

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{
        border: "1px solid rgba(0,229,118,0.28)",
        boxShadow: "0 0 50px rgba(0,229,118,0.08), 0 18px 50px rgba(0,0,0,0.5)",
      }}
      data-testid="section-grid-demo"
    >
      {/* Native-style dashboard frame */}
      <div className="relative h-[70vh] min-h-[440px] max-h-[680px] overflow-hidden">
        <div className="absolute inset-0">
          <GoogleMap
            pins={pins}
            cashDrops={cashDrops}
            workerPins={workerPins}
            onPinClick={handlePinClick}
            onCashDropClick={handleDropClick}
            onUserPos={handleUserPos}
            className="w-full h-full"
          />
        </div>

        {/* Header chip */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: "rgba(0,0,0,0.78)", border: "1px solid rgba(0,229,118,0.35)", backdropFilter: "blur(6px)" }}>
          <span className="online-dot" aria-hidden />
          <span className="text-[11px] font-display font-bold tracking-wide text-white">
            {pins.length} opportunities near you
          </span>
        </div>

        {/* Collapse button */}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="absolute top-3 right-3 z-10 p-2 rounded-full text-white/80 hover:text-white transition-colors"
            style={{ background: "rgba(0,0,0,0.78)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(6px)" }}
            data-testid="button-demo-collapse"
            aria-label="Hide map"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Selected marker popover (native template) */}
        {selected && (
          <div
            className="absolute bottom-4 left-3 right-3 z-30 rounded-2xl p-4 shadow-2xl animate-slide-up"
            style={{
              background: "linear-gradient(180deg, hsl(0 0% 9%), hsl(0 0% 5%))",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            }}
            data-testid="popover-demo-task"
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-popover-close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-display font-bold tracking-widest px-2 py-0.5 rounded-md"
                style={{ background: `${selected.color}22`, color: selected.color, border: `1px solid ${selected.color}55` }}
              >
                {selected.category === "Cash Drop" ? <Zap className="w-2.5 h-2.5" /> : <MapPin className="w-2.5 h-2.5" />}
                {selected.category.toUpperCase()}
              </span>
              {selected.urgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold tracking-widest px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  <Zap className="w-2.5 h-2.5" /> URGENT
                </span>
              )}
            </div>

            <h3 className="font-display font-black text-base text-white leading-snug pr-6" data-testid="text-popover-title">
              {selected.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 mb-3">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="w-3 h-3" /> Near you
              </span>
              {selected.proof && (
                <span className="flex items-center gap-1 text-[11px] text-amber-400">
                  <ShieldCheck className="w-3 h-3" /> Proof required
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-0.5">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span className="text-2xl font-display font-black text-emerald-400" data-testid="text-popover-payout">
                  {selected.payout.toFixed(2)}
                </span>
              </div>
              <button
                onClick={onClaim}
                className="flex items-center gap-1.5 h-11 px-5 rounded-xl text-[12px] font-display font-bold tracking-widest premium-btn"
                data-testid="button-claim-task"
              >
                <Lock className="w-3.5 h-3.5" />
                {selected.category === "Cash Drop" ? "ACCEPT & GET PAID" : "CLAIM TASK & GET PAID"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtle honesty footer */}
      <div
        className="px-3 py-2 text-center"
        style={{ background: "rgba(0,229,118,0.06)", borderTop: "1px solid rgba(0,229,118,0.18)" }}
        data-testid="banner-demo-disclaimer"
      >
        <p className="text-[10px] font-display tracking-wide text-emerald-300/80 leading-snug">
          ⚡ Sample activity near you — sign up to unlock the real live grid in your city.
        </p>
      </div>
    </div>
  );
}
