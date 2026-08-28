import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock3, MapPin, Search, ShieldCheck, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
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
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Official business</p>
                <h1 className="mt-2 text-3xl font-black">{detail.companyName}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{detail.industry || "Local business"} · {detail.isOpen === true ? "Open now" : detail.isOpen === false ? "Closed now" : "Check hours"}</p>
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