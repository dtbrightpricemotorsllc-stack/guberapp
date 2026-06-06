import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Loader2, Truck, ShieldCheck, Snowflake, ChevronRight } from "lucide-react";

const title = (s: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function CustodyCarrier() {
  const { data: assets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/assets/mine", { role: "carrier" }],
  });

  return (
    <GuberLayout>
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-display font-black text-foreground" data-testid="text-carrier-title">Carrier — Active Custody</h1>
        </div>
        <p className="text-xs text-muted-foreground">Assets currently in your custody. Tap one to post transport updates, log incidents, change equipment, or confirm delivery.</p>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

        {!isLoading && (!assets || assets.length === 0) && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="text-carrier-empty">
            No assets in your custody yet. Connect on a load and complete pickup to see it here.
          </div>
        )}

        <div className="space-y-2">
          {assets?.map((a) => {
            const name = [a.year, a.make, a.model].filter(Boolean).join(" ") || a.description || title(a.assetType || "Asset");
            return (
              <Link key={a.id} href={`/custody/asset/${a.id}`}>
                <a className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover-elevate" data-testid={`card-asset-${a.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-foreground truncate" data-testid={`text-asset-name-${a.id}`}>{name}</span>
                      {a.frozenAt && <Snowflake className="w-4 h-4 text-sky-500 shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{title(a.assetType || "asset")} · {title(a.status || "pending")}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </a>
              </Link>
            );
          })}
        </div>
      </div>
    </GuberLayout>
  );
}
