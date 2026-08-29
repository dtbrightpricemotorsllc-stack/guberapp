import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Building2, CalendarClock, Clock3, MapPin, Search, ShieldCheck, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Business = {
  business_account_id: number;
  company_name: string;
  company_logo?: string | null;
  industry?: string | null;
  description?: string | null;
  address?: string | null;
  zip_code?: string | null;
  service_area?: string | null;
  website?: string | null;
  isOpen: boolean | null;
};

function BookingPanel({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const [serviceId, setServiceId] = useState("");
  const [requestedStartAt, setRequestedStartAt] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [customerLocation, setCustomerLocation] = useState("");
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/public/businesses/booking", businessId],
    queryFn: async () => {
      const response = await fetch(`/api/public/businesses/${businessId}/booking`);
      if (!response.ok) return null;
      return response.json();
    },
  });
  const selectedService = data?.services?.find((service: any) => String(service.id) === serviceId);
  const submit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/public/businesses/${businessId}/booking`, {
        serviceId: Number(serviceId),
        requestedStartAt: requestedStartAt || null,
        customerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        customerNote,
        customerLocation,
      });
      return response.json();
    },
    onSuccess: () => {
      setRequestedStartAt("");
      setCustomerNote("");
      setCustomerLocation("");
    },
  });

  if (isLoading || !data?.services?.length) return null;
  return (
    <section className="mt-8 rounded-3xl border bg-card p-6 md:p-8" data-testid="section-business-bookings">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Book this business</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a service. Each service has its own booking method.</p>
        </div>
      </div>
      {!user ? (
        <div className="mt-5 rounded-xl bg-muted p-4 text-sm">
          <p>Sign in with your Guber account to request or book a service.</p>
          <Link href="/login?returnTo=/businesses" className="mt-3 inline-block font-semibold text-primary">Sign in to continue →</Link>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {data.services.map((service: any) => (
              <button key={service.id} type="button" onClick={() => setServiceId(String(service.id))} className={`rounded-2xl border p-4 text-left transition-colors ${serviceId === String(service.id) ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{service.name}</span>
                  <span className="whitespace-nowrap text-xs font-bold text-primary">{service.pricing_mode === "fixed" ? `$${(service.price_cents / 100).toFixed(2)}` : service.pricing_mode === "starting_at" ? `From $${(service.price_cents / 100).toFixed(2)}` : "Quote"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{service.description || "Service details available after you submit."}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{service.confirmation_mode === "instant" ? "Instant booking" : service.confirmation_mode === "approval" ? "Business approval" : "Quote request"} · {service.fulfillment_mode.replace("_", " ")}</p>
              </button>
            ))}
          </div>
          {selectedService && (
            <div className="rounded-2xl border border-dashed p-4">
              <p className="text-sm font-semibold">{selectedService.confirmation_mode === "instant" ? "Choose a time" : selectedService.confirmation_mode === "approval" ? "Request a time" : "Tell the business what you need"}</p>
              {selectedService.confirmation_mode !== "quote" || selectedService.availability_mode === "appointment" ? <div className="mt-3"><label className="text-xs font-semibold text-muted-foreground">Requested date and time {selectedService.confirmation_mode === "quote" ? "(optional)" : "*"}</label><Input type="datetime-local" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="mt-1" /></div> : null}
              {(selectedService.fulfillment_mode === "mobile" || selectedService.fulfillment_mode === "event") && <div className="mt-3"><label className="text-xs font-semibold text-muted-foreground">Service location or event details</label><Input value={customerLocation} onChange={(e) => setCustomerLocation(e.target.value)} placeholder="City, address, venue, or service area" className="mt-1" /></div>}
              <div className="mt-3"><label className="text-xs font-semibold text-muted-foreground">Details for the business</label><Textarea value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder={selectedService.confirmation_mode === "quote" ? "Guest count, vehicle details, event date, scope, or anything else to quote…" : "Anything the business should know?"} className="mt-1" /></div>
              {submit.isError && <p className="mt-3 text-sm text-destructive">{(submit.error as Error).message}</p>}
              {submit.isSuccess && <p className="mt-3 text-sm font-semibold text-emerald-600">{selectedService.confirmation_mode === "instant" ? "Your booking is confirmed." : "Your request was sent to the business."}</p>}
              <Button className="mt-4" disabled={submit.isPending || !serviceId || (selectedService.confirmation_mode !== "quote" && !requestedStartAt)} onClick={() => submit.mutate()}>{submit.isPending ? "Sending…" : selectedService.confirmation_mode === "instant" ? "Confirm booking" : selectedService.confirmation_mode === "approval" ? "Request booking" : "Request a quote"}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function BusinessDiscovery() {
  const [, detailParams] = useRoute("/businesses/:id");
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data: businesses = [], isLoading } = useQuery<Business[]>({
    queryKey: ["/api/public/businesses", submitted],
    queryFn: async () => {
      const response = await fetch(`/api/public/businesses${submitted ? `?search=${encodeURIComponent(submitted)}` : ""}`);
      if (!response.ok) throw new Error("Unable to load businesses");
      return response.json();
    },
  });
  const { data: detail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/public/businesses/detail", detailParams?.id],
    enabled: Boolean(detailParams?.id),
    queryFn: async () => {
      const response = await fetch(`/api/public/businesses/${detailParams!.id}`);
      if (!response.ok) throw new Error("Business not found");
      return response.json();
    },
  });

  if (detailParams?.id) {
    if (detailLoading) return <main className="min-h-screen bg-background p-10 text-center text-sm text-muted-foreground">Loading business profile…</main>;
    if (!detail) return <main className="min-h-screen bg-background p-10 text-center">Business profile unavailable.</main>;
    return (
      <main className="min-h-screen bg-background px-5 py-10 md:px-10">
        <div className="mx-auto max-w-4xl">
          <Link href="/businesses" className="text-sm text-primary">← Back to local businesses</Link>
          <div className="mt-6 rounded-3xl border bg-card p-6 md:p-10">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
               <div className="flex items-start gap-4">
                 <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10">
                   {detail.companyLogo ? <img src={detail.companyLogo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-7 w-7 text-primary" aria-label="Business placeholder" />}
                 </div>
                 <div>
                   <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Official business</p>
                   <h1 className="mt-2 text-3xl font-black">{detail.companyName}</h1>
                   <p className="mt-2 text-sm text-muted-foreground">{detail.industry || "Local business"} · {detail.isOpen === true ? "Open now" : detail.isOpen === false ? "Closed now" : "Check hours"}</p>
                 </div>
              </div>
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{detail.description || "This business has completed GUBER's official business verification process."}</p>
            <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{detail.address || detail.serviceArea || detail.zipCode || "Local service area"}</p>
              <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" />Business hours shown in the profile</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/services"><Button>Request a service</Button></Link>
              {detail.website && <a href={detail.website} target="_blank" rel="noreferrer"><Button variant="outline">Visit official website</Button></a>}
            </div>
          </div>
          <BookingPanel businessId={String(detail.business_account_id)} />
          {detail.inventory?.length > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Business inventory</h2>
                <Link href={`/marketplace?business=${detail.business_account_id}`} className="text-sm text-primary">View in Marketplace →</Link>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {detail.inventory.map((item: any) => <Link key={item.id} href={`/marketplace/${item.id}`}><div className="rounded-2xl border bg-card p-4 hover:border-primary/60"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.price ? `$${item.price}` : "Request a quote"}</p></div></Link>)}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Local Business</p>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">Find an official GUBER business</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Browse verified businesses by service, city, or business type. Individual providers remain available through Services.
            </p>
          </div>
          <Link href="/services">
            <Button variant="outline" className="gap-2">Browse individual providers <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); setSubmitted(search.trim()); }} className="mb-8 flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by business, service, or city" className="pl-9" />
          </div>
          <Button type="submit">Search</Button>
        </form>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading official businesses…</p> : businesses.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">No verified businesses found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or browse individual providers through Services.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <Link key={business.business_account_id} href={`/businesses/${business.business_account_id}`}>
                <article className="group h-full rounded-2xl border bg-card p-5 transition-colors hover:border-primary/60" data-testid={`card-business-${business.business_account_id}`}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
                      {business.company_logo ? <img src={business.company_logo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-primary" />}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${business.isOpen === true ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {business.isOpen === true ? "Open now" : business.isOpen === false ? "Closed" : "Hours available"}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold group-hover:text-primary">{business.company_name}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">{business.industry || "Local business"}</p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{business.description || "Verified business profile on GUBER."}</p>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{business.address || business.service_area || business.zip_code || "Local service area"}</p>
                    <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Hours and service availability on profile</p>
                    <p className="flex items-center gap-2 text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />Official business</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}