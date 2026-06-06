import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, ShieldCheck, Snowflake, AlertTriangle, FileText, ChevronDown, ChevronUp, DollarSign,
} from "lucide-react";

const title = (s: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (d: any) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

const FILTERS = [
  { key: "all", label: "All" },
  { key: "frozen", label: "Frozen" },
  { key: "incidents", label: "Incidents" },
  { key: "high_value", label: "High value" },
];

export default function AdminAssetProtection() {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: assets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/assets", { filter }],
  });

  return (
    <GuberLayout>
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-display font-black text-foreground" data-testid="text-admin-title">Asset Protection — Oversight</h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Button key={f.key} variant={filter === f.key ? "default" : "outline"} size="sm" onClick={() => setFilter(f.key)} data-testid={`button-filter-${f.key}`}>
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        {!isLoading && (!assets || assets.length === 0) && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="text-admin-empty">No assets match this filter.</div>
        )}

        <div className="space-y-2">
          {assets?.map((a) => {
            const name = [a.year, a.make, a.model].filter(Boolean).join(" ") || a.description || title(a.assetType || "Asset");
            const isOpen = openId === a.id;
            return (
              <div key={a.id} className="rounded-xl border border-border bg-card" data-testid={`card-admin-asset-${a.id}`}>
                <button className="w-full flex items-center justify-between gap-3 p-4 text-left" onClick={() => setOpenId(isOpen ? null : a.id)} data-testid={`button-expand-${a.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span className="truncate">#{a.id} {name}</span>
                      {a.frozenAt && <Snowflake className="w-4 h-4 text-sky-500 shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {title(a.assetType || "asset")} · {title(a.status || "pending")}{a.estimatedValue != null ? ` · $${Number(a.estimatedValue).toLocaleString()}` : ""}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {isOpen && <AdminDetail assetId={a.id} frozen={!!a.frozenAt} />}
              </div>
            );
          })}
        </div>
      </div>
    </GuberLayout>
  );
}

function AdminDetail({ assetId, frozen }: { assetId: number; frozen: boolean }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/assets", assetId] });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/assets", assetId] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/assets"] });
  };

  const act = async (key: string, url: string, body: Record<string, any>) => {
    setBusy(key);
    try {
      const res = await apiRequest("POST", url, body);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Updated" });
      refresh();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (isLoading) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  return (
    <div className="border-t border-border p-4 space-y-4">
      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => window.open(`/api/assets/${assetId}/passport.pdf`, "_blank")} data-testid={`button-admin-passport-${assetId}`}>
          <FileText className="w-4 h-4 mr-1" /> Passport PDF
        </Button>
        <Link href={`/custody/asset/${assetId}`}><a><Button variant="outline" size="sm" data-testid={`button-admin-open-${assetId}`}>Open detail</Button></a></Link>
        {frozen ? (
          <Button variant="outline" size="sm" disabled={busy === "freeze"} onClick={() => act("freeze", `/api/admin/assets/${assetId}/freeze`, { freeze: false })} data-testid={`button-admin-unfreeze-${assetId}`}>Unfreeze</Button>
        ) : (
          <Button variant="destructive" size="sm" disabled={busy === "freeze"} onClick={() => act("freeze", `/api/admin/assets/${assetId}/freeze`, { freeze: true, reason: "Admin freeze" })} data-testid={`button-admin-freeze-${assetId}`}>Freeze</Button>
        )}
      </div>

      {/* Fraud flags */}
      {data.fraudFlags?.length > 0 && (
        <div className="space-y-1">
          {data.fraudFlags.map((f: any) => (
            <div key={f.code} className={`flex items-center gap-2 text-xs ${f.severity === "critical" ? "text-red-600" : "text-amber-600"}`} data-testid={`admin-flag-${f.code}`}>
              <AlertTriangle className="w-3.5 h-3.5" /> {f.label}
            </div>
          ))}
        </div>
      )}

      {/* Incidents */}
      {data.incidents?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Incidents</div>
          {data.incidents.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between gap-2 py-1 text-xs" data-testid={`admin-incident-${i.id}`}>
              <span>{title(i.incidentType)} · {i.severity} · {title(i.status)} / claim {title(i.protectionClaimStatus)}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={busy === `inc-${i.id}`} onClick={() => act(`inc-${i.id}`, `/api/admin/incidents/${i.id}/status`, { status: "resolved", protectionClaimStatus: "approved" })} data-testid={`button-resolve-incident-${i.id}`}>Resolve</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {data.issues?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Issues</div>
          {data.issues.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between gap-2 py-1 text-xs" data-testid={`admin-issue-${i.id}`}>
              <span>{title(i.issueType)} · {title(i.status)}</span>
              {i.status !== "resolved" && (
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={busy === `iss-${i.id}`} onClick={() => act(`iss-${i.id}`, `/api/admin/issues/${i.id}/resolve`, {})} data-testid={`button-resolve-issue-${i.id}`}>Resolve</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Witness reports / payouts */}
      {data.witnessReports?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Witness reports</div>
          {data.witnessReports.map((w: any) => (
            <div key={w.id} className="text-xs text-foreground py-0.5 flex items-center gap-1" data-testid={`admin-witness-${w.id}`}>
              <DollarSign className="w-3 h-3 text-emerald-600" /> {title(w.reportType)} — witness #{w.witnessUserId} · {fmt(w.createdAt)}
            </div>
          ))}
        </div>
      )}

      {/* Append-only admin note */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Append note (immutable)</div>
        <Textarea placeholder="Add an audit note to the custody trail…" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`input-admin-note-${assetId}`} />
        <Button size="sm" className="mt-2" disabled={busy === "note" || !note.trim()} onClick={async () => { await act("note", `/api/admin/assets/${assetId}/note`, { note }); setNote(""); }} data-testid={`button-admin-note-${assetId}`}>
          {busy === "note" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Append note"}
        </Button>
      </div>

      {/* Timeline preview */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Recent custody events</div>
        <div className="space-y-1">
          {(data.timeline || []).slice(0, 8).map((e: any) => (
            <div key={e.id} className="text-xs text-foreground" data-testid={`admin-event-${e.id}`}>
              <span className="text-muted-foreground">{fmt(e.createdAt)}</span> · {title(e.eventType)}{e.description ? ` — ${e.description}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
