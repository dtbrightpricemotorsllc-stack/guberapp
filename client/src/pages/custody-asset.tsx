import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ShieldCheck, Loader2, AlertTriangle, Snowflake, FileText, MapPin, Clock,
  Truck, PackageCheck, Flame, Eye, ChevronLeft,
} from "lucide-react";

interface AssetDetail {
  asset: any;
  roles: any[];
  master?: any;
  timeline: any[];
  vinVerifications: any[];
  towVerifications: any[];
  trailerVerifications: any[];
  releaseAuthorizations: any[];
  issues: any[];
  incidents: any[];
  storageEvents: any[];
  witnessReports: any[];
  fraudFlags: { code: string; label: string; severity: "warning" | "critical" }[];
  myRoles: string[];
  isAdmin: boolean;
}

const fmt = (d: any) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
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

export default function CustodyAsset({ id: propId }: { id?: number } = {}) {
  const [, params] = useRoute("/custody/asset/:id");
  const id = propId ?? (params?.id ? parseInt(params.id) : NaN);
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AssetDetail>({
    queryKey: ["/api/assets", id],
    enabled: Number.isInteger(id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/assets", id] });

  const run = async (key: string, method: "POST", url: string, body: Record<string, any> = {}, withGps = false) => {
    setBusy(key);
    try {
      const extra = withGps ? await getPos() : {};
      const res = await apiRequest(method, url, { ...body, ...extra });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || "Action failed");
      toast({ title: "Done", description: "Custody trail updated." });
      refresh();
      return d;
    } catch (e: any) {
      toast({ title: "Could not complete", description: e?.message || "Try again.", variant: "destructive" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <GuberLayout>
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </GuberLayout>
    );
  }
  if (!data?.asset) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-10 text-center text-sm text-muted-foreground" data-testid="text-asset-missing">
          Asset not found or you don't have a role on it.
        </div>
      </GuberLayout>
    );
  }

  const a = data.asset;
  const name = [a.year, a.make, a.model].filter(Boolean).join(" ") || a.description || title(a.assetType || "Asset");
  const isCarrier = data.myRoles.some((r) => ["carrier", "driver"].includes(r));
  const isOwnerSide = data.myRoles.some((r) => ["owner", "sender", "authorized_contact"].includes(r));
  const frozen = !!a.frozenAt;

  return (
    <GuberLayout>
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <Link href={isCarrier ? "/custody/carrier" : "/load-board"}>
          <a className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="link-back"><ChevronLeft className="w-4 h-4" /> Back</a>
        </Link>

        {/* Header */}
        <div className="rounded-2xl p-5 border border-border bg-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h1 className="text-lg font-display font-black text-foreground" data-testid="text-asset-name">{name}</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-asset-meta">
                {title(a.assetType || "asset")} · Status {title(a.status || "pending")}
                {a.estimatedValue != null ? ` · $${Number(a.estimatedValue).toLocaleString()}` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/assets/${id}/passport.pdf`, "_blank")} data-testid="button-download-passport">
              <FileText className="w-4 h-4 mr-1" /> Passport
            </Button>
          </div>

          {frozen && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 p-3" data-testid="banner-frozen">
              <Snowflake className="w-4 h-4 text-sky-600 mt-0.5" />
              <div className="text-xs text-sky-800 dark:text-sky-200">
                <strong>Frozen.</strong> {a.frozenReason || "Owner-initiated freeze."} Delivery and transfers are blocked.
              </div>
            </div>
          )}

          {data.fraudFlags.length > 0 && (
            <div className="mt-3 space-y-1" data-testid="list-fraud-flags">
              {data.fraudFlags.map((f) => (
                <div key={f.code} className={`flex items-center gap-2 text-xs ${f.severity === "critical" ? "text-red-600" : "text-amber-600"}`} data-testid={`flag-${f.code}`}>
                  <AlertTriangle className="w-3.5 h-3.5" /> {f.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carrier actions */}
        {isCarrier && (
          <Panel title="Carrier — Transport Updates" icon={<Truck className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["running_normally", "Running normally"],
                ["delayed", "Delayed"],
                ["weather_delay", "Weather delay"],
                ["dot_inspection", "DOT inspection"],
                ["hos_delay", "HOS delay"],
                ["mechanical_breakdown", "Breakdown"],
                ["arrived", "Arrived"],
              ].map(([status, label]) => (
                <Button key={status} variant="outline" size="sm" disabled={frozen || !!busy}
                  onClick={() => run(`lc-${status}`, "POST", `/api/assets/${id}/lifecycle`, { status }, true)}
                  data-testid={`button-carrier-${status}`}>
                  {busy === `lc-${status}` ? <Loader2 className="w-4 h-4 animate-spin" /> : label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <IncidentDialog assetId={id} onDone={refresh} disabled={frozen} />
              <Button variant="outline" size="sm" disabled={frozen || !!busy}
                onClick={() => run("storage", "POST", `/api/assets/${id}/storage`, { eventType: "stored" }, true)}
                data-testid="button-carrier-store">
                <PackageCheck className="w-4 h-4 mr-1" /> Log storage
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ChangeDialog assetId={id} kind="tow-vehicle" label="Change tow vehicle" onDone={refresh} disabled={frozen} />
              <ChangeDialog assetId={id} kind="trailer" label="Change trailer" onDone={refresh} disabled={frozen} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <SimpleNumberDialog assetId={id} field="newDriverId" url={`/api/assets/${id}/driver-change`} label="Change driver" onDone={refresh} disabled={frozen} testid="driver-change" />
              <SimpleNumberDialog assetId={id} field="toCarrierId" url={`/api/assets/${id}/custody-transfer`} label="Transfer custody" onDone={refresh} disabled={frozen} testid="custody-transfer" withReason />
            </div>
            <Button className="w-full mt-2" disabled={frozen || !!busy}
              onClick={() => run("delivery", "POST", `/api/assets/${id}/delivery`, {}, true)}
              data-testid="button-carrier-delivery">
              {busy === "delivery" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PackageCheck className="w-4 h-4 mr-1" /> Confirm delivery</>}
            </Button>
          </Panel>
        )}

        {/* Owner / sender actions */}
        {isOwnerSide && (
          <Panel title="Owner / Sender — Controls" icon={<ShieldCheck className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              {!frozen ? (
                <ReasonDialog label="Freeze asset" url={`/api/assets/${id}/freeze`} field="reason" onDone={refresh} testid="freeze" danger />
              ) : (
                <Button variant="outline" size="sm" disabled={!!busy}
                  onClick={() => run("unfreeze", "POST", `/api/assets/${id}/unfreeze`, {})} data-testid="button-unfreeze">
                  Unfreeze
                </Button>
              )}
              <ReasonDialog label="Report fraud" url={`/api/assets/${id}/report-fraud`} field="concern" onDone={refresh} testid="report-fraud" danger />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {["loading", "release", "delivery"].map((rt) => (
                <Button key={rt} variant="outline" size="sm" disabled={!!busy}
                  onClick={() => run(`witness-${rt}`, "POST", `/api/assets/${id}/request-witness`, { reportType: rt })}
                  data-testid={`button-request-witness-${rt}`}>
                  <Eye className="w-3.5 h-3.5 mr-1" /> {title(rt)}
                </Button>
              ))}
            </div>
          </Panel>
        )}

        {/* Verifications */}
        <Panel title="Verifications" icon={<ShieldCheck className="w-4 h-4" />}>
          <Mini label="VIN" rows={data.vinVerifications.map((v) => `${title(v.status || "pending")} — ${v.scannedVin || v.expectedVin || "—"}`)} />
          <Mini label="Tow vehicle" rows={data.towVerifications.map((t) => `${title(t.vehicleType || "tow")} ${t.plateNumber || ""} ${t.verified ? "✓" : ""}`)} />
          <Mini label="Trailer" rows={data.trailerVerifications.map((t) => `${title(t.trailerType || "trailer")} ${t.trailerNumber || ""} ${t.verified ? "✓" : ""}`)} />
          <Mini label="Witness reports" rows={data.witnessReports.map((w) => `${title(w.reportType)} — witness #${w.witnessUserId}`)} />
        </Panel>

        {/* Issues & incidents */}
        {(data.issues.length > 0 || data.incidents.length > 0) && (
          <Panel title="Issues & Incidents" icon={<Flame className="w-4 h-4" />}>
            {data.incidents.map((i) => (
              <div key={`inc-${i.id}`} className="text-xs text-foreground py-1 border-b border-border/50" data-testid={`incident-${i.id}`}>
                <span className="font-medium">{title(i.incidentType)}</span> · {i.severity} · {title(i.status)} <span className="text-muted-foreground">{fmt(i.createdAt)}</span>
              </div>
            ))}
            {data.issues.map((i) => (
              <div key={`iss-${i.id}`} className="text-xs text-foreground py-1 border-b border-border/50" data-testid={`issue-${i.id}`}>
                <span className="font-medium">{title(i.issueType)}</span> · {title(i.status)} <span className="text-muted-foreground">{fmt(i.createdAt)}</span>
              </div>
            ))}
          </Panel>
        )}

        {/* Timeline */}
        <Panel title="Chain of Custody" icon={<Clock className="w-4 h-4" />}>
          <div className="space-y-2" data-testid="list-timeline">
            {data.timeline.length === 0 && <p className="text-xs text-muted-foreground">No events yet.</p>}
            {data.timeline.map((e) => (
              <div key={e.id} className="flex gap-2 text-xs" data-testid={`event-${e.id}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-foreground font-medium">{title(e.eventType)}</div>
                  {e.description && <div className="text-muted-foreground">{e.description}</div>}
                  <div className="text-muted-foreground/70 flex items-center gap-2">
                    {fmt(e.createdAt)}
                    {e.lat != null && e.lng != null && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{e.lat.toFixed(3)},{e.lng.toFixed(3)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </GuberLayout>
  );
}

function Panel({ title: t, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 border border-border bg-card">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">{icon} {t}</div>
      {children}
    </div>
  );
}

function Mini({ label, rows }: { label: string; rows: string[] }) {
  if (!rows.length) return null;
  return (
    <div className="mb-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {rows.map((r, i) => <div key={i} className="text-xs text-foreground">{r}</div>)}
    </div>
  );
}

function IncidentDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("accident");
  const [severity, setSeverity] = useState("high");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/assets/${assetId}/incidents`, { incidentType: type, severity, description: desc, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Incident logged" });
      setOpen(false); setDesc(""); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} data-testid="button-carrier-incident"><Flame className="w-4 h-4 mr-1" /> Incident</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report incident</DialogTitle></DialogHeader>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger data-testid="select-incident-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="accident">Accident</SelectItem>
            <SelectItem value="fire">Fire</SelectItem>
            <SelectItem value="theft">Theft</SelectItem>
            <SelectItem value="damage">Damage</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger data-testid="select-incident-severity"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Textarea placeholder="What happened?" value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="input-incident-desc" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-incident">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeDialog({ assetId, kind, label, onDone, disabled }: { assetId: number; kind: "tow-vehicle" | "trailer"; label: string; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/assets/${assetId}/${kind}`, { plateNumber: plate, emergency });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Updated & re-verified" });
      setOpen(false); setPlate(""); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} data-testid={`button-change-${kind}`}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <Input placeholder="Plate / unit number" value={plate} onChange={(e) => setPlate(e.target.value)} data-testid={`input-${kind}-plate`} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} data-testid={`checkbox-${kind}-emergency`} />
          Emergency (bypass high-value sender approval)
        </label>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid={`button-submit-${kind}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimpleNumberDialog({ assetId, field, url, label, onDone, disabled, testid, withReason }: { assetId: number; field: string; url: string; label: string; onDone: () => void; disabled?: boolean; testid: string; withReason?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = parseInt(val);
    if (!Number.isInteger(n)) { toast({ title: "Enter a valid user ID", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", url, { [field]: n, reason, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Done" });
      setOpen(false); setVal(""); setReason(""); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} data-testid={`button-${testid}`}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <Input placeholder="User ID" value={val} onChange={(e) => setVal(e.target.value)} data-testid={`input-${testid}-id`} />
        {withReason && <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`input-${testid}-reason`} />}
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid={`button-submit-${testid}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ label, url, field, onDone, testid, danger }: { label: string; url: string; field: string; onDone: () => void; testid: string; danger?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) { toast({ title: "A reason is required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const res = await apiRequest("POST", url, { [field]: reason });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Done" });
      setOpen(false); setReason(""); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={danger ? "destructive" : "outline"} size="sm" data-testid={`button-${testid}`}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <Textarea placeholder="Reason…" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`input-${testid}-reason`} />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} variant={danger ? "destructive" : "default"} data-testid={`button-submit-${testid}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
