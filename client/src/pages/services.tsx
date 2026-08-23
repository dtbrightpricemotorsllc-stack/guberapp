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
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
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

type ServiceRequestForm = {
  scope: string;
  timing: string;
  budget: string;
  location: string;
  zip: string;
  estimatedMinutes: string;
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
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [requestForm, setRequestForm] = useState<ServiceRequestForm>({
    scope: "",
    timing: "As soon as possible",
    budget: "",
    location: "",
    zip: "",
    estimatedMinutes: "",
  });
  const { data: offers = [], isLoading } = useQuery<ServiceOffer[]>({ queryKey: ["/api/service-offers"] });

  const filtered = useMemo(() => offers.filter((offer) => {
    const haystack = `${offer.title} ${offer.description || ""} ${offer.serviceType || ""} ${offer.capabilities.join(" ")}`.toLowerCase();
    return (category === "All" || offer.category === category)
      && (!availableOnly || offer.availability === "available_now")
      && (!search || haystack.includes(search.toLowerCase()));
  }), [offers, category, availableOnly, search]);

  const requestMutation = useMutation({
    mutationFn: async ({ offer, form }: { offer: ServiceOffer; form: ServiceRequestForm }) =>
      (await apiRequest("POST", `/api/service-offers/${offer.id}/hire`, {
        scope: form.scope,
        timing: form.timing,
        budget: Number(form.budget),
        location: form.location,
        zip: form.zip,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
      })).json() as Promise<{ jobUrl: string }>,
    onSuccess: ({ jobUrl }) => navigate(jobUrl),
    onError: (error: Error) => toast({ title: "Couldn't send this request", description: error.message, variant: "destructive" }),
  });

  const beginRequest = (offer: ServiceOffer) => {
    if (!user) {
      navigate("/login?returnTo=%2Fservices");
      return;
    }
    setSelectedOffer(offer);
    setRequestForm({
      scope: "",
      timing: offer.availability === "available_now" ? "As soon as possible" : "By request",
      budget: String(offer.startingPrice ?? offer.hourlyRate ?? ""),
      location: "",
      zip: "",
      estimatedMinutes: "",
    });
  };

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

        {selectedOffer && (
          <Card className="mb-4 border-primary/35 bg-primary/[0.04] p-4" data-testid="form-service-request">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-display font-black tracking-[0.2em] text-primary">PROTECTED SERVICE REQUEST</p>
                <h2 className="font-display font-bold mt-1">Request {selectedOffer.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">This goes only to {selectedOffer.provider.name}. They can accept, decline, or counter before any payment is authorized.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOffer(null)} aria-label="Close service request form">Close</Button>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                What needs to be done?
                <Textarea value={requestForm.scope} onChange={(event) => setRequestForm((form) => ({ ...form, scope: event.target.value }))} placeholder="Describe the scope, materials, access notes, and desired outcome. Do not include contact details." className="min-h-24 bg-background" maxLength={1500} data-testid="textarea-service-request-scope" />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium">
                  Preferred timing
                  <Input value={requestForm.timing} onChange={(event) => setRequestForm((form) => ({ ...form, timing: event.target.value }))} placeholder="e.g. Tuesday afternoon" maxLength={160} data-testid="input-service-request-timing" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Your budget
                  <Input value={requestForm.budget} onChange={(event) => setRequestForm((form) => ({ ...form, budget: event.target.value }))} type="number" min="5" step="0.01" placeholder="Minimum $5" data-testid="input-service-request-budget" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Job location
                  <Input value={requestForm.location} onChange={(event) => setRequestForm((form) => ({ ...form, location: event.target.value }))} placeholder="Street address or meeting location" maxLength={300} data-testid="input-service-request-location" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  ZIP code
                  <Input value={requestForm.zip} onChange={(event) => setRequestForm((form) => ({ ...form, zip: event.target.value }))} placeholder="e.g. 10001" maxLength={16} data-testid="input-service-request-zip" />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Estimated time (optional, minutes)
                <Input value={requestForm.estimatedMinutes} onChange={(event) => setRequestForm((form) => ({ ...form, estimatedMinutes: event.target.value }))} type="number" min="15" max="10080" placeholder="e.g. 120" data-testid="input-service-request-duration" />
              </label>
              <p className="text-xs text-muted-foreground">Your exact address and direct contact stay hidden until the protected offer is funded.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedOffer(null)}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={() => requestMutation.mutate({ offer: selectedOffer, form: requestForm })} disabled={requestMutation.isPending || !requestForm.scope.trim() || !requestForm.timing.trim() || Number(requestForm.budget) < 5 || !requestForm.location.trim() || !requestForm.zip.trim()} data-testid="button-submit-service-request">
                  {requestMutation.isPending ? "Sending request…" : "Send protected request"}
                </Button>
              </div>
            </div>
          </Card>
        )}

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
                <Button className="rounded-xl text-xs font-display" onClick={() => beginRequest(offer)} disabled={requestMutation.isPending}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Request</Button>
              </div>
            </Card>
          ))}</div>
        )}
      </main>
    </GuberLayout>
  );
}