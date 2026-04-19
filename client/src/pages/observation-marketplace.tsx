import { useState } from "react";
import { gpsGetCurrentPosition } from "@/lib/gps";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Lock, Eye, DollarSign, Briefcase, Calendar, Tag, Loader2, ShoppingBag, AlertCircle, Navigation } from "lucide-react";
import type { Observation } from "@shared/schema";

const OBSERVATION_TYPES = [
  "All Types",
  "Property Condition",
  "Vehicle Condition",
  "Business Activity",
  "Infrastructure Issue",
  "Environmental Hazard",
  "Code Violation",
  "Safety Concern",
  "Abandoned Property",
  "Signage / Branding",
  "General Observation",
];

type ObsWithMeta = Observation & { _purchased: boolean };

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    open: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    purchased: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    converted_to_job: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    expired: "bg-muted/20 text-muted-foreground border-border/20",
  };
  return map[status] || "bg-muted/20 text-muted-foreground border-border/20";
}

function ObservationCard({ obs, onView }: { obs: ObsWithMeta; onView: (o: ObsWithMeta) => void }) {
  const isPurchased = obs._purchased;
  const daysLeft = obs.expiresAt
    ? Math.max(0, Math.round((new Date(obs.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Card
      className="glass-card rounded-xl p-4 cursor-pointer hover:border-primary/20 transition-colors space-y-3"
      onClick={() => onView(obs)}
      data-testid={`card-observation-${obs.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border/20 bg-muted/20 flex items-center justify-center">
          {isPurchased && obs.photoURLs.length > 0 ? (
            <img src={obs.photoURLs[0]} alt="obs" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground">Locked</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Badge variant="outline" className="text-[9px] font-display capitalize" style={{ background: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
              {obs.observationType}
            </Badge>
            <Badge variant="outline" className={`text-[9px] capitalize ${statusBadgeClass(obs.status)}`}>
              {obs.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {obs.address}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {new Date(obs.createdAt!).toLocaleDateString()}
            {daysLeft !== null && (
              <span className={daysLeft <= 5 ? "text-amber-400" : ""}>
                · {daysLeft}d left
              </span>
            )}
          </div>
        </div>
      </div>

      {obs.tags && obs.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {obs.tags.map((t: string) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      {!isPurchased && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/10">
          <span className="text-[10px] text-muted-foreground">Purchase for:</span>
          {[5, 10, 20].map(price => (
            <span
              key={price}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/20 text-primary/70 cursor-pointer hover:bg-primary/10 transition-colors"
            >
              ${price}
            </span>
          ))}
        </div>
      )}
      {isPurchased && obs.status !== "converted_to_job" && (
        <div className="flex items-center gap-1 pt-1 border-t border-border/10">
          <Eye className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-emerald-400">Full details unlocked</span>
        </div>
      )}
    </Card>
  );
}

export default function ObservationMarketplace() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [typeFilter, setTypeFilter] = useState("All Types");
  const [cityFilter, setCityFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [radiusFilter, setRadiusFilter] = useState("any");
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [selectedObs, setSelectedObs] = useState<ObsWithMeta | null>(null);
  const [purchasePrice, setPurchasePrice] = useState<5 | 10 | 20>(10);

  function requestGps() {
    setGpsLoading(true);
    gpsGetCurrentPosition({ timeout: 10000 })
      .then((pos) => {
        setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      })
      .catch(() => setGpsLoading(false));
  }

  const params = new URLSearchParams();
  if (typeFilter && typeFilter !== "All Types") params.set("type", typeFilter);
  if (cityFilter) params.set("city", cityFilter);
  if (stateFilter) params.set("state", stateFilter);
  if (zipFilter) params.set("zip", zipFilter);
  if (radiusFilter !== "any" && gpsLocation) {
    params.set("lat", String(gpsLocation.lat));
    params.set("lng", String(gpsLocation.lng));
    params.set("radius", radiusFilter);
  }

  const { data: observations, isLoading } = useQuery<ObsWithMeta[]>({
    queryKey: ["/api/observations", typeFilter, cityFilter, stateFilter, zipFilter, radiusFilter, gpsLocation?.lat, gpsLocation?.lng],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/observations?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load observations");
      return res.json();
    },
    retry: false,
  });

  const purchaseMutation = useMutation({
    mutationFn: async ({ obsId, price }: { obsId: number; price: number }) => {
      const resp = await apiRequest("POST", `/api/observations/${obsId}/purchase`, { price });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Purchase failed");
      }
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedObs(data.observation ? { ...data.observation, _purchased: true } : null);
      toast({ title: "Purchase successful!", description: "Full observation details are now unlocked." });
    },
    onError: (err: any) => {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (obsId: number) => {
      const resp = await apiRequest("POST", `/api/observations/${obsId}/convert-to-job`, {});
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Convert failed");
      }
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedObs(null);
      toast({ title: "Job Created!", description: "Observation converted to a draft job." });
      navigate(`/jobs/${data.jobId}`);
    },
    onError: (err: any) => {
      toast({ title: "Convert failed", description: err.message, variant: "destructive" });
    },
  });

  const isBusinessUser = user?.accountType === "business";

  if (!isBusinessUser && !isLoading) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="font-display font-bold text-muted-foreground">Business account required</p>
          <p className="text-sm text-muted-foreground">The Observation Marketplace is only accessible to business accounts.</p>
          <Button onClick={() => navigate("/business-onboarding")} className="font-display" data-testid="button-setup-business-obs">
            Set Up Business Account
          </Button>
        </div>
      </GuberLayout>
    );
  }

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-observation-marketplace">
        <div className="mb-5">
          <h1 className="text-xl font-display font-bold tracking-tight">Observation Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Browse real-world observations from the field — purchase to unlock full details</p>
        </div>

        <div className="space-y-3 mb-5">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="premium-input rounded-md" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBSERVATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="City"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="premium-input rounded-md text-sm"
              data-testid="input-city-filter"
            />
            <Input
              placeholder="State"
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="premium-input rounded-md text-sm"
              data-testid="input-state-filter"
            />
            <Input
              placeholder="ZIP"
              value={zipFilter}
              onChange={e => setZipFilter(e.target.value)}
              className="premium-input rounded-md text-sm"
              data-testid="input-zip-filter"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={radiusFilter} onValueChange={(val) => {
              setRadiusFilter(val);
              if (val !== "any" && !gpsLocation) requestGps();
            }}>
              <SelectTrigger className="premium-input rounded-md flex-1" data-testid="select-radius-filter">
                <Navigation className="w-3 h-3 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Radius" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Distance</SelectItem>
                <SelectItem value="5">Within 5 miles</SelectItem>
                <SelectItem value="10">Within 10 miles</SelectItem>
                <SelectItem value="25">Within 25 miles</SelectItem>
                <SelectItem value="50">Within 50 miles</SelectItem>
                <SelectItem value="100">Within 100 miles</SelectItem>
              </SelectContent>
            </Select>
            {radiusFilter !== "any" && (
              <button
                onClick={requestGps}
                disabled={gpsLoading}
                className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors px-2 py-1.5 rounded border border-primary/20 hover:bg-primary/5"
                data-testid="button-use-my-location"
              >
                {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                {gpsLocation ? "Updated" : "Use my location"}
              </button>
            )}
          </div>
          {radiusFilter !== "any" && !gpsLocation && (
            <p className="text-[11px] text-amber-400/70">Allow location access to enable radius filtering</p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : !observations || observations.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
            <p className="font-display font-bold text-muted-foreground">No observations found</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {observations.map(obs => (
              <ObservationCard key={obs.id} obs={obs} onView={setSelectedObs} />
            ))}
          </div>
        )}

        <Dialog open={!!selectedObs} onOpenChange={() => setSelectedObs(null)}>
          <DialogContent className="max-w-sm rounded-2xl" data-testid="dialog-observation-detail">
            {selectedObs && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-base">{selectedObs.observationType}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {selectedObs._purchased && selectedObs.photoURLs.length > 0 && selectedObs.photoURLs[0] !== "blurred" ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedObs.photoURLs.map((url, idx) => (
                        <img key={idx} src={url} alt="photo" className="w-full h-24 object-cover rounded-lg border border-border/20" />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-32 rounded-lg border border-border/20 bg-muted/20 flex flex-col items-center justify-center gap-2">
                      <Lock className="w-6 h-6 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Photos locked — purchase to unlock</p>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{selectedObs.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{new Date(selectedObs.createdAt!).toLocaleDateString()}</span>
                    </div>
                    {selectedObs._purchased && selectedObs.notes && (
                      <p className="text-muted-foreground text-xs leading-relaxed border border-border/20 rounded-lg p-3 bg-muted/10">
                        {selectedObs.notes}
                      </p>
                    )}
                    {selectedObs.tags && selectedObs.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <Tag className="w-3 h-3 text-muted-foreground mt-0.5" />
                        {selectedObs.tags.map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {!selectedObs._purchased && (
                    <div className="space-y-3 pt-2 border-t border-border/10">
                      <p className="text-[11px] text-muted-foreground font-display uppercase tracking-wider">Select purchase tier</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([5, 10, 20] as const).map(price => (
                          <button
                            key={price}
                            onClick={() => setPurchasePrice(price)}
                            className="py-2.5 rounded-lg border text-sm font-display font-bold transition-colors"
                            style={{
                              borderColor: purchasePrice === price ? "hsl(152 70% 40%)" : "hsl(var(--border))",
                              background: purchasePrice === price ? "hsl(152 70% 40% / 0.1)" : "transparent",
                              color: purchasePrice === price ? "hsl(152 70% 60%)" : "hsl(var(--muted-foreground))",
                            }}
                            data-testid={`button-price-${price}`}
                          >
                            ${price}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Higher tiers get more detail and GPS coordinates
                      </p>
                      <Button
                        className="w-full premium-btn font-display tracking-wider"
                        disabled={purchaseMutation.isPending}
                        onClick={() => purchaseMutation.mutate({ obsId: selectedObs.id, price: purchasePrice })}
                        data-testid="button-purchase-observation"
                      >
                        {purchaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                        Purchase for ${purchasePrice}
                      </Button>
                    </div>
                  )}

                  {selectedObs._purchased && selectedObs.status !== "converted_to_job" && (
                    <Button
                      variant="outline"
                      className="w-full font-display border-border/30 gap-2"
                      disabled={convertMutation.isPending}
                      onClick={() => convertMutation.mutate(selectedObs.id)}
                      data-testid="button-convert-to-job"
                    >
                      {convertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                      Convert to Job
                    </Button>
                  )}
                  {selectedObs.status === "converted_to_job" && (
                    <div className="text-center py-2">
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                        Converted to Job #{selectedObs.convertedToJobId}
                      </Badge>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </GuberLayout>
  );
}
