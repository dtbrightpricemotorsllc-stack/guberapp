import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { GoogleMap, type JobPin } from "@/components/google-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BriefcaseBusiness, CheckCircle2, Clock3, List, Map, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";

type ServiceOffer = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  serviceType: string | null;
  serviceClass: "general" | "skilled_pro";
  capabilities: string[];
  equipment: string[];
  pricingType: "quote" | "starting_at" | "hourly";
  startingPrice: number | null;
  hourlyRate: number | null;
  availability: "available_now" | "by_request";
  area: string;
  mapLat: number | null;
  mapLng: number | null;
  provider: { name: string; rating: number; reviewCount: number; idVerified: boolean; credentialVerified: boolean };
};

const categories = ["All", "On-Demand Help", "General Labor", "Skilled Labor", "Verify & Inspect"];

function priceText(offer: ServiceOffer) {
  if (offer.pricingType === "hourly" && offer.hourlyRate != null) return `$${offer.hourlyRate}/hr`;
  if (offer.pricingType === "starting_at" && offer.startingPrice != null) return `From $${offer.startingPrice}`;
  return "Request a quote";
}

export default function BrowseServices() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const { data: offers = [], isLoading } = useQuery<ServiceOffer[]>({ queryKey: ["/api/service-offers"] });

  const filtered = useMemo(() => offers.filter((offer) => {
    const haystack = `${offer.title} ${offer.description || ""} ${offer.serviceType || ""} ${offer.capabilities.join(" ")}`.toLowerCase();
    return (category === "All" || offer.category === category)
      && (!availableOnly || offer.availability === "available_now")
      && (!search || haystack.includes(search.toLowerCase()));
  }), [offers, category, availableOnly, search]);

  const requestMutation = useMutation({
    mutationFn: async (offerId: number) => (await apiRequest("POST", `/api/service-offers/${offerId}/hire`)).json() as Promise<{ handoffUrl: string }>,
    onSuccess: ({ handoffUrl }) => navigate(handoffUrl),
    onError: (error: Error) => toast({ title: "Couldn't start this request", description: error.message, variant: "destructive" }),
  });

  const pins: JobPin[] = filtered
    .filter((offer) => offer.mapLat != null && offer.mapLng != null)
    .map((offer) => ({
      id: offer.id,
      title: offer.title,
      category: offer.category,
      serviceType: offer.serviceType,
      budget: offer.startingPrice,
      status: offer.availability,
      urgentSwitch: offer.availability === "available_now",
      lat: offer.mapLat!,
      lng: offer.mapLng!,
      locationApprox: offer.area,
      color: offer.serviceClass === "skilled_pro" ? "#DC2626" : "#16A34A",
      createdAt: null,
      zip: null,
    }));

  return (
    <GuberLayout showBack backHref="/dashboard">
      <main className="max-w-3xl mx-auto px-4 py-6 pb-28" data-testid="page-browse-services">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-display font-black tracking-[0.25em] text-primary uppercase">Hire local talent</p>
            <h1 className="text-2xl font-display font-black tracking-tight">Browse services</h1>
            <p className="text-sm text-muted-foreground mt-1">Find a provider, then use GUBER’s protected job flow to request the work.</p>
          </div>
          <Link href="/offer-service"><Button variant="outline" className="shrink-0 rounded-xl h-10 text-xs font-display"><BriefcaseBusiness className="w-4 h-4 mr-1.5" /> Offer</Button></Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] mb-3">
          <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input className="pl-9 rounded-xl" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="What do you need done?" /></div>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Button variant={availableOnly ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => setAvailableOnly(!availableOnly)}><Sparkles className="w-3.5 h-3.5 mr-1" /> Now</Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Button size="sm" variant={view === "list" ? "default" : "outline"} className="rounded-lg" onClick={() => setView("list")}><List className="w-3.5 h-3.5 mr-1" /> List</Button>
          <Button size="sm" variant={view === "map" ? "default" : "outline"} className="rounded-lg" onClick={() => setView("map")}><Map className="w-3.5 h-3.5 mr-1" /> Map</Button>
          <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} provider{filtered.length === 1 ? "" : "s"}</span>
        </div>

        {view === "map" && (
          <Card className="overflow-hidden border-border mb-4">
            {pins.length ? <GoogleMap pins={pins} className="h-[330px]" onPinClick={(pin) => document.getElementById(`service-${pin.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} /> : <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No providers with a service-area map pin match these filters.</div>}
            <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">Pins are approximate. Exact locations are only shared through the protected job flow.</p>
          </Card>
        )}

        {isLoading ? <p className="text-sm text-muted-foreground py-10 text-center">Loading local services…</p> : filtered.length === 0 ? (
          <Card className="p-8 text-center border-dashed"><MapPin className="w-6 h-6 mx-auto text-muted-foreground mb-2" /><h2 className="font-display font-bold">No matching providers yet</h2><p className="text-sm text-muted-foreground mt-1">Try a broader search, or post a job to invite local help.</p><Link href="/post-job"><Button className="mt-4 rounded-xl">Post a job</Button></Link></Card>
        ) : (
          <div className="grid gap-3">{filtered.map((offer) => (
            <Card key={offer.id} id={`service-${offer.id}`} className="p-4 border-border/70">
              <div className="flex gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5 items-center mb-1.5">
                    <Badge className={offer.serviceClass === "skilled_pro" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" : "bg-primary/12 text-primary border-primary/25"} variant="outline">{offer.serviceClass === "skilled_pro" ? "Skilled / Pro" : "General service"}</Badge>
                    {offer.availability === "available_now" ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline"><Clock3 className="w-3 h-3 mr-1" /> Available now</Badge> : null}
                  </div>
                  <h2 className="font-display font-bold text-lg leading-tight">{offer.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{offer.serviceType || offer.category} · {offer.area}</p>
                </div>
                <p className="font-display font-black text-sm whitespace-nowrap">{priceText(offer)}</p>
              </div>
              {offer.description && <p className="text-sm text-foreground/80 mt-3 line-clamp-3">{offer.description}</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">{offer.capabilities.slice(0, 4).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</div>
              <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t">
                <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{offer.provider.name}</span> · {offer.provider.rating?.toFixed?.(1) || "New"} ★ ({offer.provider.reviewCount || 0}) {offer.serviceClass === "skilled_pro" && offer.provider.credentialVerified ? <ShieldCheck className="inline w-3.5 h-3.5 text-emerald-500 ml-1" /> : null}</div>
                <Button className="rounded-xl text-xs font-display" onClick={() => requestMutation.mutate(offer.id)} disabled={requestMutation.isPending}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Request</Button>
              </div>
            </Card>
          ))}</div>
        )}
      </main>
    </GuberLayout>
  );
}