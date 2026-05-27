import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import {
  Truck, ChevronRight, Plus, MapPin, Zap, Loader2,
  ShieldCheck, Package, Anchor, Caravan, Container, Bolt,
  Map as MapIcon, List, User2,
} from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const TRANSPORT_TYPES = [
  { value: "all",       label: "All" },
  { value: "vehicle",   label: "Vehicle" },
  { value: "equipment", label: "Equipment" },
  { value: "boat",      label: "Boat" },
  { value: "rv",        label: "RV" },
  { value: "trailer",   label: "Trailer" },
  { value: "hotshot",   label: "Hotshot" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  posted:         { label: "Open",           color: "text-cyan-400",   dot: "bg-cyan-400" },
  offer_received: { label: "Offer In",       color: "text-amber-400",  dot: "bg-amber-400" },
  offer_accepted: { label: "Offer Accepted", color: "text-sky-400",    dot: "bg-sky-400" },
  connected:      { label: "Connected",      color: "text-violet-400", dot: "bg-violet-400" },
  cancelled:      { label: "Cancelled",      color: "text-gray-500",   dot: "bg-gray-500" },
};

const PROOF_LABEL: Record<string, string> = {
  title_in_hand:   "Title In Hand",
  bill_of_sale:    "Bill of Sale",
  auction_invoice: "Auction Invoice",
  dealer_owned:    "Dealer",
  lienholder:      "Lienholder",
  not_ready:       "Proof Pending",
};

function transportEmoji(type: string) {
  const m: Record<string, string> = {
    vehicle:"🚗", equipment:"🏗️", boat:"⛵", rv:"🚐", trailer:"🔧", hotshot:"⚡",
  };
  return m[type] || "📦";
}

// ── US state approximate centers for map (no geocoding API calls needed) ──────
const STATE_CENTERS: Record<string, { lat: number; lng: number }> = {
  AL:{lat:32.3,lng:-86.9},AK:{lat:64.2,lng:-153.4},AZ:{lat:34.0,lng:-111.1},
  AR:{lat:34.8,lng:-92.2},CA:{lat:36.8,lng:-119.4},CO:{lat:39.1,lng:-105.4},
  CT:{lat:41.6,lng:-72.7},DE:{lat:39.3,lng:-75.5},FL:{lat:27.8,lng:-81.7},
  GA:{lat:32.2,lng:-82.9},HI:{lat:20.3,lng:-156.4},ID:{lat:44.2,lng:-114.5},
  IL:{lat:40.3,lng:-89.0},IN:{lat:39.9,lng:-86.3},IA:{lat:42.0,lng:-93.5},
  KS:{lat:38.5,lng:-98.4},KY:{lat:37.7,lng:-85.0},LA:{lat:31.1,lng:-91.8},
  ME:{lat:45.4,lng:-69.0},MD:{lat:39.0,lng:-76.8},MA:{lat:42.3,lng:-71.8},
  MI:{lat:44.7,lng:-85.4},MN:{lat:46.4,lng:-93.1},MS:{lat:32.7,lng:-89.7},
  MO:{lat:38.5,lng:-92.5},MT:{lat:47.0,lng:-110.5},NE:{lat:41.5,lng:-99.9},
  NV:{lat:39.3,lng:-116.6},NH:{lat:44.0,lng:-71.6},NJ:{lat:40.1,lng:-74.5},
  NM:{lat:34.4,lng:-106.1},NY:{lat:42.2,lng:-74.9},NC:{lat:35.6,lng:-79.4},
  ND:{lat:47.5,lng:-100.5},OH:{lat:40.4,lng:-82.8},OK:{lat:35.6,lng:-97.5},
  OR:{lat:44.1,lng:-120.5},PA:{lat:40.6,lng:-77.2},RI:{lat:41.7,lng:-71.5},
  SC:{lat:33.9,lng:-80.9},SD:{lat:44.4,lng:-100.2},TN:{lat:35.9,lng:-86.7},
  TX:{lat:31.1,lng:-97.6},UT:{lat:39.4,lng:-111.1},VT:{lat:44.1,lng:-72.7},
  VA:{lat:37.8,lng:-78.2},WA:{lat:47.4,lng:-120.6},WV:{lat:38.9,lng:-80.5},
  WI:{lat:44.3,lng:-89.6},WY:{lat:42.9,lng:-107.6},DC:{lat:38.9,lng:-77.0},
};

// ── Dedicated Load Board Map ───────────────────────────────────────────────────
function LoadBoardMap({ listings, apiKey }: { listings: any[]; apiKey: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let cancelled = false;

    setOptions({ key: apiKey, version: "weekly" } as any);

    (async () => {
      try {
        const g = await importLibrary("maps") as any;
        if (cancelled || !mapRef.current) return;

        const map = new g.Map(mapRef.current, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: [
            { elementType: "geometry",             stylers: [{ color: "#111827" }] },
            { elementType: "labels.text.fill",     stylers: [{ color: "#6b7280" }] },
            { elementType: "labels.text.stroke",   stylers: [{ color: "#111827" }] },
            { featureType: "road", elementType: "geometry",         stylers: [{ color: "#1f2937" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#374151" }] },
            { featureType: "water", elementType: "geometry",        stylers: [{ color: "#0f172a" }] },
            { featureType: "landscape", elementType: "geometry",    stylers: [{ color: "#111827" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });

        setMapReady(true);
        const infoWindow = new g.InfoWindow();

        for (const l of listings) {
          if (cancelled) return;
          const pickup = STATE_CENTERS[l.pickupState];
          const delivery = STATE_CENTERS[l.deliveryState];
          if (!pickup) continue;

          // Draw route lane between pickup and delivery states
          if (delivery && l.pickupState !== l.deliveryState) {
            new g.Polyline({
              path: [pickup, delivery],
              geodesic: true,
              strokeColor: l.urgent ? "#f59e0b" : "#0891b2",
              strokeOpacity: 0.3,
              strokeWeight: 2,
              map,
            });
          }

          // Pickup marker using classic Marker API (no mapId required)
          const priceStr = l.pricingMode === "fixed" && l.postedPrice
            ? `$${Number(l.postedPrice).toLocaleString()}`
            : "Open to offers";
          const asset = l.year && l.make
            ? `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim()
            : l.assetDescription || l.transportType;

          const marker = new g.Marker({
            map,
            position: pickup,
            title: `${l.pickupCity} → ${l.deliveryCity}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: l.urgent ? "#f59e0b" : "#0891b2",
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });

          marker.addListener("click", () => {
            infoWindow.setContent(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;min-width:200px">
                <div style="font-size:13px;font-weight:800;color:#111;line-height:1.3">
                  ${transportEmoji(l.transportType)} ${l.pickupCity}, ${l.pickupState} → ${l.deliveryCity}, ${l.deliveryState}
                </div>
                <div style="font-size:11px;color:#555;margin-top:3px">${asset}${l.estimatedMiles ? ` · ${Number(l.estimatedMiles).toLocaleString()} mi` : ""}</div>
                <div style="font-size:14px;font-weight:800;color:#0891b2;margin-top:5px">${priceStr}</div>
                <a href="/load-board/${l.id}" style="display:inline-block;margin-top:8px;padding:5px 12px;background:#0891b2;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">View Details →</a>
              </div>
            `);
            infoWindow.open(map, marker);
          });
        }
      } catch {
        // Map load failure — list view still works fine
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, listings]);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: "calc(100dvh - 260px)", minHeight: 320 }}>
      <div ref={mapRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: "rgba(17,24,39,0.9)" }}>
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <p className="text-xs text-muted-foreground/50 font-display font-bold">Loading load board map…</p>
        </div>
      )}
      {/* Legend */}
      {mapReady && (
        <div className="absolute bottom-3 left-3 rounded-xl px-3 py-2 flex items-center gap-3"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
          <span className="text-[10px] font-display font-bold text-cyan-400/70">📍 Pickup location · Line = route lane</span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LoadBoard() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState<"list" | "map">("list");

  const { data: configData } = useQuery<{ googleMapsApiKey: string }>({ queryKey: ["/api/config"] });
  const apiKey = configData?.googleMapsApiKey ?? "";

  const { data: browseData, isLoading: browseLoading } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/load-board", typeFilter],
    queryFn: async () => {
      const url = typeFilter !== "all"
        ? `/api/load-board?transportType=${typeFilter}`
        : `/api/load-board`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    enabled: tab === "browse",
    staleTime: 30_000,
  });

  const { data: myData, isLoading: myLoading } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/load-board/my"],
    queryFn: () => fetch("/api/load-board/my", { credentials: "include" }).then(r => r.json()),
    enabled: tab === "mine",
    staleTime: 30_000,
  });

  const listings: any[] = tab === "browse"
    ? (browseData?.listings ?? [])
    : (myData?.listings ?? []);
  const isLoading = tab === "browse" ? browseLoading : myLoading;

  return (
    <GuberLayout title="Load Board" showBack backHref="/dashboard">
      <div className="px-4 pt-2" style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom,0px) + 16px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-display font-black text-foreground tracking-tight leading-none flex items-center gap-2">
              <Truck className="w-6 h-6 text-cyan-400" strokeWidth={1.8} />
              Load Board
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5">Vehicle &amp; freight transport marketplace</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(v => v === "list" ? "map" : "list")}
              className="p-2 rounded-xl transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              data-testid="button-toggle-view"
              title={view === "list" ? "Switch to map" : "Switch to list"}
            >
              {view === "list"
                ? <MapIcon className="w-4 h-4 text-cyan-400" />
                : <List className="w-4 h-4 text-cyan-400" />
              }
            </button>
            <Link href="/load-board/post">
              <Button
                size="sm"
                className="rounded-xl font-display font-black text-xs tracking-wide h-9 px-4 gap-1.5"
                style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}
                data-testid="button-post-load"
              >
                <Plus className="w-3.5 h-3.5" /> Post Load
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs: Browse / My Postings */}
        <div className="flex gap-1 mb-4 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["browse", "mine"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 rounded-lg py-2 text-xs font-display font-bold transition-all flex items-center justify-center gap-1.5"
              style={tab === t
                ? { background: "rgba(8,145,178,0.2)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.3)" }
                : { color: "rgba(255,255,255,0.35)" }
              }
              data-testid={`tab-${t}`}
            >
              {t === "browse" ? <><Truck className="w-3 h-3" /> Browse Loads</> : <><User2 className="w-3 h-3" /> My Postings</>}
            </button>
          ))}
        </div>

        {/* Transport type filter pills (browse only) */}
        {tab === "browse" && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4" data-testid="filter-transport-type">
            {TRANSPORT_TYPES.map(t => {
              const sel = typeFilter === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-display font-bold transition-all"
                  style={sel
                    ? { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }
                  }
                  data-testid={`filter-type-${t.value}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Carrier CTA (browse tab only) */}
        {tab === "browse" && (
          <div
            className="rounded-2xl p-3.5 mb-5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
            style={{
              background: "linear-gradient(135deg,rgba(8,145,178,0.12),rgba(14,116,144,0.06))",
              border: "1px solid rgba(6,182,212,0.2)",
            }}
            onClick={() => navigate("/carrier-profile")}
            data-testid="banner-carrier-signup"
          >
            <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(6,182,212,0.12)" }}>
              <Truck className="w-4 h-4 text-cyan-400" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-bold text-cyan-300 leading-tight">Are you a carrier?</p>
              <p className="text-[10px] text-cyan-400/50 mt-0.5">Set up your profile · submit offers · get paid</p>
            </div>
            <ChevronRight className="w-4 h-4 text-cyan-400/40 shrink-0" />
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-sm font-display font-bold text-muted-foreground">
              {tab === "mine" ? "No loads posted yet" : "No open loads right now"}
            </p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              {tab === "mine" ? "Post your first load to get carrier offers" : "Be the first — post a load above"}
            </p>
            <Link href="/load-board/post">
              <Button className="mt-5 rounded-xl font-display font-black text-sm gap-2"
                style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}>
                <Plus className="w-4 h-4" /> Post a Load
              </Button>
            </Link>
          </div>
        ) : view === "map" ? (
          <LoadBoardMap listings={listings} apiKey={apiKey} />
        ) : (
          <div className="space-y-3" data-testid="list-load-board">
            {listings.map((l) => {
              const sc = STATUS_CONFIG[l.status] || STATUS_CONFIG.posted;
              const title = l.year && l.make
                ? `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim()
                : l.assetDescription || "Transport Load";
              return (
                <Link key={l.id} href={`/load-board/${l.id}`}>
                  <div
                    className="rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all relative overflow-hidden"
                    style={{
                      background: l.addonFlags?.includes("premium_carrier_only")
                        ? "rgba(139,92,246,0.06)"
                        : "rgba(255,255,255,0.04)",
                      border: l.addonFlags?.includes("premium_carrier_only")
                        ? "1px solid rgba(139,92,246,0.2)"
                        : "1px solid rgba(6,182,212,0.12)",
                    }}
                    data-testid={`card-load-${l.id}`}
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-base">{transportEmoji(l.transportType)}</span>
                          <span
                            className="text-[10px] font-display font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}
                          >
                            {l.transportType}
                          </span>
                          {l.urgent && (
                            <span className="text-[10px] font-display font-black text-amber-400 flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5" /> URGENT
                            </span>
                          )}
                          {l.addonFlags?.includes("premium_carrier_only") && (
                            <span className="text-[10px] font-display font-black text-violet-400 flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED ONLY
                            </span>
                          )}
                          {sc && (
                            <span className={`text-[10px] font-display font-bold ${sc.color} flex items-center gap-1`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} inline-block`} />
                              {sc.label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-display font-bold text-foreground leading-tight">{title}</p>
                        {l.ownershipProofStatus && (
                          <span
                            className="inline-block text-[9px] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-1"
                            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                          >
                            {PROOF_LABEL[l.ownershipProofStatus] || l.ownershipProofStatus}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {l.postedPrice ? (
                          <p className="text-base font-display font-black text-cyan-300">
                            ${Number(l.postedPrice).toLocaleString()}
                          </p>
                        ) : l.pricingMode === "open_to_offers" ? (
                          <p className="text-xs font-display font-bold text-amber-400/80">Open to offers</p>
                        ) : null}
                        {l.suggestedLow && l.suggestedHigh && (
                          <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                            Est. ${l.suggestedLow}–${l.suggestedHigh}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route row */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mb-2">
                      <MapPin className="w-3 h-3 shrink-0 text-cyan-500/60" />
                      <span className="font-display font-bold">{l.pickupCity}, {l.pickupState}</span>
                      <span className="text-cyan-400/40 mx-0.5">→</span>
                      <span className="font-display font-bold">{l.deliveryCity}, {l.deliveryState}</span>
                      {l.estimatedMiles && (
                        <span className="ml-1 text-muted-foreground/30">· {Number(l.estimatedMiles).toLocaleString()} mi</span>
                      )}
                    </div>

                    {/* Add-on chips */}
                    {l.addonFlags && l.addonFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {l.addonFlags.slice(0, 4).map((f: string) => (
                          <span
                            key={f}
                            className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(6,182,212,0.08)", color: "rgba(6,182,212,0.7)" }}
                          >
                            {f.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground/30">
                        {l.poster?.guberId && (
                          <span className="font-display font-bold tracking-wide">{l.poster.guberId}</span>
                        )}
                        {l.poster?.rating > 0 && (
                          <span>⭐ {Number(l.poster.rating).toFixed(1)}</span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground/30">
                        {new Date(l.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
