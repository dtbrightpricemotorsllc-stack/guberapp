import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Archive, CirclePause, CirclePlay, ClipboardList, ShieldAlert, ShieldCheck } from "lucide-react";

type ManagedOffer = { id: number; title: string; category: string; serviceType: string | null; status: string; moderationStatus: string; serviceClass: string; availability: string; updatedAt: string };

export default function OfferService() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General Labor");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [equipment, setEquipment] = useState("");
  const [pricingType, setPricingType] = useState("quote");
  const [price, setPrice] = useState("");
  const [availableNow, setAvailableNow] = useState(false);
  const { data: offers = [], isLoading } = useQuery<ManagedOffer[]>({ queryKey: ["/api/service-offers/mine"] });
  const credentialRequired = category === "Skilled Labor";
  const canPublish = !!(user as any)?.idVerified && (!credentialRequired || !!(user as any)?.credentialVerified);

  const createMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/service-offers", {
      title, category, serviceType, description,
      capabilities: capabilities.split(",").map((value) => value.trim()).filter(Boolean),
      equipment: equipment.split(",").map((value) => value.trim()).filter(Boolean),
      pricingType,
      startingPrice: pricingType === "starting_at" ? price : null,
      hourlyRate: pricingType === "hourly" ? price : null,
      availableNow,
    })).json() as Promise<ManagedOffer>,
    onSuccess: (offer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-offers/mine"] });
      toast({ title: "Draft saved", description: "Review it below, then publish when you’re ready." });
      setTitle(""); setServiceType(""); setDescription(""); setCapabilities(""); setEquipment(""); setPrice("");
      void offer;
    },
    onError: (error: Error) => toast({ title: "Couldn't save draft", description: error.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "publish" | "paused" | "archived" }) => {
      const endpoint = action === "publish" ? `/api/service-offers/${id}/publish` : `/api/service-offers/${id}/status`;
      return (await apiRequest("POST", endpoint, action === "publish" ? undefined : { status: action })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-offers/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-offers"] });
      toast({ title: "Service updated" });
    },
    onError: (error: Error) => toast({ title: "Couldn't update service", description: error.message, variant: "destructive" }),
  });

  const priceLabel = useMemo(() => pricingType === "hourly" ? "Hourly rate" : "Starting price", [pricingType]);

  return (
    <GuberLayout showBack backHref="/dashboard">
      <main className="max-w-2xl mx-auto px-4 py-6 pb-28" data-testid="page-offer-service">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div><p className="text-[10px] font-display font-black tracking-[0.25em] text-primary uppercase">Work side</p><h1 className="text-2xl font-display font-black tracking-tight">Offer a service</h1><p className="text-sm text-muted-foreground mt-1">Create a reusable service profile. Jobs, payment, messages, and proof stay in the existing protected GUBER flow.</p></div>
          <Link href="/services"><Button variant="outline" className="rounded-xl text-xs">Browse services</Button></Link>
        </div>

        {credentialRequired && <Card className="mb-4 p-3 border-amber-500/30 bg-amber-500/5 flex gap-2"><ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /><p className="text-xs text-foreground/80">Skilled / Pro offers need a verified credential before they can be published. You can still save a draft.</p></Card>}
        {!user?.idVerified && <Card className="mb-4 p-3 border-destructive/30 bg-destructive/5 flex gap-2"><ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><p className="text-xs text-foreground/80">Verify your identity to publish a service. Drafts remain private until you do.</p></Card>}

        <Card className="p-4 border-border">
          <h2 className="font-display font-bold mb-4">New service draft</h2>
          <div className="grid gap-4">
            <div><Label htmlFor="service-title">Service title</Label><Input id="service-title" className="mt-1.5 rounded-xl" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Same-day furniture assembly" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="General Labor">General Labor</SelectItem><SelectItem value="On-Demand Help">On-Demand Help</SelectItem><SelectItem value="Skilled Labor">Skilled Labor</SelectItem><SelectItem value="Verify & Inspect">Verify & Inspect</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="service-type">Service type</Label><Input id="service-type" className="mt-1.5 rounded-xl" value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="Assembly, moving, repair…" /></div>
            </div>
            <div><Label htmlFor="service-description">What customers should know</Label><Textarea id="service-description" className="mt-1.5 rounded-xl min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the scope, experience, and what is included. Keep contact and payment details on GUBER." /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label htmlFor="capabilities">Capabilities</Label><Input id="capabilities" className="mt-1.5 rounded-xl" value={capabilities} onChange={(event) => setCapabilities(event.target.value)} placeholder="Comma-separated" /></div>
              <div><Label htmlFor="equipment">Tools / equipment</Label><Input id="equipment" className="mt-1.5 rounded-xl" value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Comma-separated" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Pricing</Label><Select value={pricingType} onValueChange={setPricingType}><SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quote">Request a quote</SelectItem><SelectItem value="starting_at">Starting at</SelectItem><SelectItem value="hourly">Hourly rate</SelectItem></SelectContent></Select></div>
              {pricingType !== "quote" && <div><Label htmlFor="service-price">{priceLabel}</Label><Input id="service-price" className="mt-1.5 rounded-xl" type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></div>}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5"><div><p className="text-sm font-medium">Available now</p><p className="text-[11px] text-muted-foreground">Shown only when your existing Work clock is on.</p></div><Switch checked={availableNow} onCheckedChange={setAvailableNow} /></div>
            <Button className="rounded-xl font-display" disabled={!title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}><ClipboardList className="w-4 h-4 mr-1.5" /> Save private draft</Button>
          </div>
        </Card>

        <section className="mt-6">
          <div className="flex justify-between items-center mb-3"><h2 className="font-display font-bold">Manage my services</h2><span className="text-xs text-muted-foreground">{offers.length} total</span></div>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading your services…</p> : offers.length === 0 ? <Card className="p-5 text-sm text-muted-foreground border-dashed">Your saved drafts and published services will appear here.</Card> : <div className="grid gap-3">{offers.map((offer) => (
            <Card key={offer.id} className="p-4 border-border">
              <div className="flex justify-between gap-3"><div><div className="flex gap-1.5 mb-1"><Badge variant="outline">{offer.status}</Badge>{offer.serviceClass === "skilled_pro" && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Skilled / Pro</Badge>}</div><h3 className="font-display font-bold">{offer.title}</h3><p className="text-xs text-muted-foreground">{offer.serviceType || offer.category}</p></div></div>
              <div className="flex flex-wrap gap-2 mt-4">
                {(offer.status === "draft" || offer.status === "paused") && <Button size="sm" className="rounded-lg text-xs" disabled={!canPublish || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: offer.id, action: "publish" })}><CirclePlay className="w-3.5 h-3.5 mr-1" /> Publish</Button>}
                {offer.status === "published" && <Button size="sm" variant="outline" className="rounded-lg text-xs" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: offer.id, action: "paused" })}><CirclePause className="w-3.5 h-3.5 mr-1" /> Pause</Button>}
                {offer.status !== "archived" && <Button size="sm" variant="ghost" className="rounded-lg text-xs text-muted-foreground" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: offer.id, action: "archived" })}><Archive className="w-3.5 h-3.5 mr-1" /> Archive</Button>}
                {offer.status === "draft" && canPublish && <span className="text-[11px] text-emerald-600 self-center"><ShieldCheck className="inline w-3.5 h-3.5 mr-1" />Ready to publish</span>}
              </div>
            </Card>
          ))}</div>}
        </section>
      </main>
    </GuberLayout>
  );
}