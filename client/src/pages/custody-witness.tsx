import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Eye, ShieldCheck, DollarSign, CheckCircle2 } from "lucide-react";

const title = (s: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function getPos(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export default function CustodyWitness() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const { data: assignments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/witness/assignments"],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/witness/assignments"] });

  const accept = async (id: number) => {
    setBusy(id);
    try {
      const res = await apiRequest("POST", `/api/witness/assignments/${id}/accept`, {});
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Assignment accepted", description: "Head to the site and file your report when done." });
      refresh();
    } catch (e: any) {
      toast({ title: "Could not accept", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const open = assignments?.filter((a) => a.status === "open") || [];
  const mine = assignments?.filter((a) => a.status !== "open") || [];

  return (
    <GuberLayout>
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-display font-black text-foreground" data-testid="text-witness-title">Witness Verification Jobs</h1>
        </div>
        <p className="text-xs text-muted-foreground">Accept a verification job, attend the loading/release/delivery, then file a report. You keep 80% of the witness fee, paid instantly to your connected account.</p>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">Available</h2>
          {open.length === 0 && <p className="text-xs text-muted-foreground" data-testid="text-witness-open-empty">No open witness jobs right now.</p>}
          <div className="space-y-2">
            {open.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3" data-testid={`card-assignment-${a.id}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">{a.asset ? ([a.asset.year, a.asset.make, a.asset.model].filter(Boolean).join(" ") || a.asset.description || title(a.asset.assetType)) : `Asset #${a.assetId}`}</span>
                  </div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> You earn ${Number(a.payoutAmount || 0).toFixed(2)}
                  </div>
                </div>
                <Button size="sm" onClick={() => accept(a.id)} disabled={busy === a.id} data-testid={`button-accept-${a.id}`}>
                  {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept"}
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">My jobs</h2>
          {mine.length === 0 && <p className="text-xs text-muted-foreground" data-testid="text-witness-mine-empty">No accepted jobs yet.</p>}
          <div className="space-y-2">
            {mine.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3" data-testid={`card-myjob-${a.id}`}>
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {a.asset ? ([a.asset.year, a.asset.make, a.asset.model].filter(Boolean).join(" ") || a.asset.description || title(a.asset.assetType)) : `Asset #${a.assetId}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {title(a.status)}{a.payoutStatus ? ` · payout ${title(a.payoutStatus)}` : ""} · ${Number(a.payoutAmount || 0).toFixed(2)}
                  </div>
                </div>
                {a.status === "completed" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600" data-testid={`status-completed-${a.id}`}><CheckCircle2 className="w-4 h-4" /> Filed</span>
                ) : (
                  <FileReportDialog assignmentId={a.id} onDone={refresh} />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </GuberLayout>
  );
}

function FileReportDialog({ assignmentId, onDone }: { assignmentId: number; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState("loading");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/witness/assignments/${assignmentId}/report`, { reportType, notes, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      const payout = d?.payout?.status === "sent" ? "Payout sent to your account." : "Payout is available for collection.";
      toast({ title: "Report filed", description: payout });
      setOpen(false); setNotes(""); onDone();
    } catch (e: any) {
      toast({ title: "Could not file report", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid={`button-file-report-${assignmentId}`}>File report</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Witness verification report</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          {["loading", "release", "delivery"].map((t) => (
            <Button key={t} variant={reportType === t ? "default" : "outline"} size="sm" onClick={() => setReportType(t)} data-testid={`button-reporttype-${t}`}>{title(t)}</Button>
          ))}
        </div>
        <Textarea placeholder="What did you observe and verify?" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-report-notes" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-report">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "File & get paid"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
