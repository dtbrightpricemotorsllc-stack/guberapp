import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import {
  Truck, MapPin, ChevronRight, Loader2, Calendar,
  Zap, CheckCircle2, Clock, AlertCircle, Package,
  ArrowRight, ClipboardList,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
function assetLabel(l: any): string {
  if (l.year && l.make) return `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim();
  if (l.assetDescription) return l.assetDescription;
  return l.transportType ?? "Load";
}

function flexLabel(f: string | null | undefined): string {
  if (!f) return "";
  return { asap: "ASAP", today: "Today", this_week: "This week", scheduled: "Scheduled" }[f] ?? f;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

type StatusGroup = "action" | "pending" | "active" | "history";

function groupOf(r: any): StatusGroup {
  const { listing, offer, isConnected } = r;
  if (listing.status === "offer_accepted" && !isConnected) return "action";
  if (isConnected && !listing.activationFeePaid) return "active";
  if (isConnected && listing.activationFeePaid) return "active";
  if (listing.status === "cancelled") return "history";
  if (offer?.status === "declined" || offer?.status === "withdrawn") return "history";
  return "pending";
}

const GROUP_META: Record<StatusGroup, { label: string; color: string; icon: any }> = {
  action:  { label: "Action Needed",  color: "#f59e0b", icon: AlertCircle },
  pending: { label: "Pending Offers", color: "#67e8f9", icon: Clock },
  active:  { label: "Active Loads",   color: "#00e576", icon: CheckCircle2 },
  history: { label: "History",        color: "#6b7280", icon: Package },
};

// ── Load card ─────────────────────────────────────────────────────────────────
function LoadCard({ r }: { r: any }) {
  const { listing, offer, isConnected } = r;
  const group = groupOf(r);
  const meta = GROUP_META[group];
  const days = daysUntil(listing.pickupDate);

  const offerDisplay = offer?.offerAmount
    ? `$${Number(offer.offerAmount).toLocaleString()}`
    : listing.postedPrice
    ? `$${Number(listing.postedPrice).toLocaleString()}`
    : "Open to offers";

  const statusLine = (() => {
    if (group === "action") return "Your offer accepted — pay connection fee to unlock contact info";
    if (isConnected && listing.activationFeePaid) return "Load confirmed — contact info unlocked";
    if (isConnected) return "Connected — awaiting shipper activation";
    if (offer?.status === "countered") return offer.lastMovedBy === "poster" ? "Shipper countered — your turn" : "You countered — awaiting shipper";
    if (offer?.status === "pending") return "Offer submitted — awaiting shipper response";
    if (offer?.status === "declined") return "Offer declined";
    if (offer?.status === "withdrawn") return "Offer withdrawn";
    return "";
  })();

  return (
    <Link href={`/load-board/${listing.id}`}>
      <div
        className="rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${meta.color}55` }}
        data-testid={`card-carrier-load-${listing.id}`}
      >
        {/* Top row: asset + offer */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-black text-foreground leading-tight truncate">
              {assetLabel(listing)}
            </p>
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/50">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="font-display font-bold truncate">
                {listing.pickupCity}, {listing.pickupState}
              </span>
              <ArrowRight className="w-2.5 h-2.5 shrink-0" />
              <span className="font-display font-bold truncate">
                {listing.deliveryCity}, {listing.deliveryState}
              </span>
              {listing.estimatedMiles && (
                <span className="text-muted-foreground/30 ml-0.5">
                  · {Number(listing.estimatedMiles).toLocaleString()} mi
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-display font-black" style={{ color: meta.color }}>
              {offerDisplay}
            </p>
            {listing.pricingMode === "open_to_offers" && offer?.offerAmount && (
              <p className="text-[9px] text-muted-foreground/40">your offer</p>
            )}
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-1.5 mb-2">
          <meta.icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
          <p className="text-[10px] font-display font-bold leading-tight" style={{ color: meta.color }}>
            {statusLine}
          </p>
        </div>

        {/* Schedule row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
          {listing.pickupDate ? (
            <span className="flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              <span>Pickup {new Date(listing.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              {days !== null && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full font-black"
                  style={{
                    background: days <= 2 ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)",
                    color: days <= 2 ? "#f59e0b" : undefined,
                  }}
                >
                  {days === 0 ? "Today" : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
                </span>
              )}
            </span>
          ) : listing.pickupFlexibility ? (
            <span className="flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              <span>{flexLabel(listing.pickupFlexibility)}</span>
            </span>
          ) : null}
          {listing.urgent && (
            <span className="flex items-center gap-0.5 text-amber-400 font-black">
              <Zap className="w-2.5 h-2.5" /> URGENT
            </span>
          )}
          {listing.estimatedMiles && !listing.pickupDate && !listing.pickupFlexibility && (
            <span>{Number(listing.estimatedMiles).toLocaleString()} mi</span>
          )}
        </div>

        {/* Counter offer highlight */}
        {offer?.status === "countered" && offer?.counterAmount && (
          <div
            className="mt-2 rounded-xl px-3 py-1.5 text-[10px] font-display font-bold"
            style={{ background: "rgba(245,158,11,0.10)", color: "#f59e0b" }}
          >
            Counter: ${Number(offer.counterAmount).toLocaleString()}
            {offer.lastMovedBy === "poster" ? " — shipper's counter, respond on load page" : " — your counter, awaiting response"}
          </div>
        )}

        <div className="flex justify-end mt-2">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25" />
        </div>
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LoadBoardCarrierHub() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/load-board/carrier/my-loads"],
    queryFn: () => fetch("/api/load-board/carrier/my-loads", { credentials: "include" }).then(r => r.json()),
    staleTime: 15_000,
  });

  const records = data?.records ?? [];

  const groups: StatusGroup[] = ["action", "pending", "active", "history"];
  const grouped: Record<StatusGroup, any[]> = { action: [], pending: [], active: [], history: [] };
  for (const r of records) grouped[groupOf(r)].push(r);

  const hasAny = records.length > 0;

  return (
    <GuberLayout title="Carrier Hub" showBack backHref="/load-board">
      <div className="px-4 pt-2" style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom,0px) + 16px)" }}>

        {/* Header */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: "linear-gradient(135deg,rgba(0,229,118,0.10),rgba(0,229,118,0.04))",
            border: "1px solid rgba(0,229,118,0.25)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-display font-black text-green-400/60 uppercase tracking-widest mb-0.5">
                Load Organizer
              </p>
              <h2 className="text-xl font-display font-black text-foreground leading-none">
                Carrier Hub
              </h2>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                {isLoading ? "…" : `${records.length} load${records.length !== 1 ? "s" : ""} tracked`}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(0,229,118,0.12)", border: "1px solid rgba(0,229,118,0.25)" }}
            >
              <ClipboardList className="w-5 h-5" style={{ color: "#00e576" }} />
            </div>
          </div>

          {/* Summary pills */}
          {!isLoading && hasAny && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {groups.map(g => {
                const count = grouped[g].length;
                if (!count) return null;
                const meta = GROUP_META[g];
                return (
                  <span
                    key={g}
                    className="text-[10px] font-display font-black px-2.5 py-1 rounded-full"
                    style={{ background: `${meta.color}18`, color: meta.color }}
                  >
                    {count} {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground/40">Loading your loads…</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !hasAny && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(0,229,118,0.08)", border: "1px solid rgba(0,229,118,0.20)" }}
            >
              <Truck className="w-7 h-7" style={{ color: "#00e576" }} />
            </div>
            <div>
              <p className="text-base font-display font-black text-foreground">No loads yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1 max-w-xs">
                Browse the Load Board and submit offers — all your loads will be organized here.
              </p>
            </div>
            <button
              onClick={() => navigate("/load-board")}
              className="text-sm font-display font-black px-5 py-2.5 rounded-xl"
              style={{ background: "linear-gradient(135deg,rgba(0,229,118,0.15),rgba(0,229,118,0.08))", border: "1px solid rgba(0,229,118,0.35)", color: "#00e576" }}
              data-testid="button-browse-loads"
            >
              Browse Loads →
            </button>
          </div>
        )}

        {/* Groups */}
        {!isLoading && hasAny && (
          <div className="space-y-6">
            {groups.map(g => {
              const items = grouped[g];
              if (!items.length) return null;
              const meta = GROUP_META[g];
              return (
                <div key={g}>
                  <div className="flex items-center gap-2 mb-3">
                    <meta.icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                    <p className="text-[10px] font-display font-black uppercase tracking-widest" style={{ color: meta.color }}>
                      {meta.label}
                    </p>
                    <span
                      className="text-[10px] font-display font-black px-1.5 py-0.5 rounded-full ml-1"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {items.map((r: any) => <LoadCard key={r.listing.id} r={r} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
