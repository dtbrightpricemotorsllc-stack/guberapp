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
import { CustodyPhotoUpload } from "@/components/custody-photo-upload";
import {
  ShieldCheck, Loader2, AlertTriangle, Snowflake, FileText, MapPin, Clock,
  Truck, PackageCheck, Flame, Eye, ChevronLeft, Key, CheckCircle2, XCircle, Copy, Lock, Navigation,
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

async function getPosWithMeta(): Promise<{ lat?: number; lng?: number; accuracy?: number; gpsTimestamp?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        gpsTimestamp: p.timestamp,
      }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 12000 },
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

          {a.geofenceLat != null && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-geofence-set">
              <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              Pickup geofence: {a.geofenceLat.toFixed(4)}, {a.geofenceLng.toFixed(4)} · {a.geofenceRadiusMeters ?? 250}m radius
            </div>
          )}

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
            <LifecycleDialog assetId={id} onDone={refresh} disabled={frozen} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <IncidentDialog assetId={id} onDone={refresh} disabled={frozen} />
              <StorageDialog assetId={id} onDone={refresh} disabled={frozen} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ChangeDialog assetId={id} kind="tow-vehicle" label="Change tow vehicle" onDone={refresh} disabled={frozen} />
              <ChangeDialog assetId={id} kind="trailer" label="Change trailer" onDone={refresh} disabled={frozen} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <SimpleNumberDialog assetId={id} field="newDriverId" url={`/api/assets/${id}/driver-change`} label="Change driver" onDone={refresh} disabled={frozen} testid="driver-change" />
              <SimpleNumberDialog assetId={id} field="toCarrierId" url={`/api/assets/${id}/custody-transfer`} label="Transfer custody" onDone={refresh} disabled={frozen} testid="custody-transfer" withReason />
            </div>
            <DeliveryDialog assetId={id} onDone={refresh} disabled={frozen} />
            <div className="border-t border-border/50 mt-3 pt-3 space-y-2">
              <ReleaseRequestDialog assetId={id} onDone={refresh} disabled={frozen} />
              <RedeemCodeDialog assetId={id} onDone={refresh} disabled={frozen} />
            </div>
          </Panel>
        )}

        {/* Owner / sender actions */}
        {isOwnerSide && (
          <Panel title="Owner / Sender — Controls" icon={<ShieldCheck className="w-4 h-4" />}>
            <GeofenceDialog assetId={id} onDone={refresh} currentLat={a.geofenceLat} currentLng={a.geofenceLng} currentRadius={a.geofenceRadiusMeters} />
            <div className="grid grid-cols-2 gap-2 mt-2">
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

        {/* Release authorization requests — shown to owner/sender when pending */}
        {isOwnerSide && data.releaseAuthorizations.some((a) => a.status === "pending") && (
          <Panel title="Release Authorization Requests" icon={<Key className="w-4 h-4 text-amber-500" />}>
            <p className="text-xs text-muted-foreground mb-3">Review and approve each carrier release request. The one-time code is shown exactly once after you approve — copy it immediately.</p>
            <div className="space-y-3">
              {data.releaseAuthorizations.filter((a) => a.status === "pending").map((auth) => (
                <AuthorizationRow key={auth.id} assetId={id} auth={auth} onDone={refresh} />
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
                  {Array.isArray(e.photoUrls) && e.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid={`event-photos-${e.id}`}>
                      {e.photoUrls.map((url: string, i: number) => (
                        <a key={url + i} href={url} target="_blank" rel="noreferrer" className="block w-14 h-14 rounded-md overflow-hidden border border-border" data-testid={`link-event-photo-${e.id}-${i}`}>
                          <img src={url} alt="evidence" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
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
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const reset = () => { setDesc(""); setPhotoUrls([]); };
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/assets/${assetId}/incidents`, { incidentType: type, severity, description: desc, photoUrls, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Incident logged" });
      setOpen(false); reset(); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
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
        <CustodyPhotoUpload photos={photoUrls} onChange={setPhotoUrls} disabled={busy} label="Evidence photos (optional)" testid="incident" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-incident">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("running_normally");
  const [desc, setDesc] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const reset = () => { setDesc(""); setPhotoUrls([]); setStatus("running_normally"); };
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/assets/${assetId}/lifecycle`, { status, description: desc, photoUrls, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Update posted" });
      setOpen(false); reset(); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mt-2" disabled={disabled} data-testid="button-carrier-lifecycle-photos">
          <Truck className="w-4 h-4 mr-1" /> Status update with photos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Transport status update</DialogTitle></DialogHeader>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="select-lifecycle-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[
              ["running_normally", "Running normally"],
              ["delayed", "Delayed"],
              ["weather_delay", "Weather delay"],
              ["dot_inspection", "DOT inspection"],
              ["hos_delay", "HOS delay"],
              ["mechanical_breakdown", "Breakdown"],
              ["arrived", "Arrived"],
            ].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea placeholder="Add a note (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="input-lifecycle-desc" />
        <CustodyPhotoUpload photos={photoUrls} onChange={setPhotoUrls} disabled={busy} testid="lifecycle" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-lifecycle">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post update"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StorageDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState("stored");
  const [locationName, setLocationName] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const reset = () => { setLocationName(""); setPhotoUrls([]); setEventType("stored"); };
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/assets/${assetId}/storage`, { eventType, locationName, photoUrls, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Storage event logged" });
      setOpen(false); reset(); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} data-testid="button-carrier-store"><PackageCheck className="w-4 h-4 mr-1" /> Log storage</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log storage event</DialogTitle></DialogHeader>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger data-testid="select-storage-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stored">Stored</SelectItem>
            <SelectItem value="retrieved">Retrieved</SelectItem>
            <SelectItem value="transferred">Transferred</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Location name (optional)" value={locationName} onChange={(e) => setLocationName(e.target.value)} data-testid="input-storage-location" />
        <CustodyPhotoUpload photos={photoUrls} onChange={setPhotoUrls} disabled={busy} testid="storage" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-storage">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [odometer, setOdometer] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const reset = () => { setReceiverName(""); setOdometer(""); setPhotoUrls([]); };
  const submit = async () => {
    setBusy(true);
    try {
      const pos = await getPos();
      const res = await apiRequest("POST", `/api/assets/${assetId}/delivery`, { receiverName, odometer, photoUrls, ...pos });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Delivery confirmed" });
      setOpen(false); reset(); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="w-full mt-2" disabled={disabled} data-testid="button-carrier-delivery"><PackageCheck className="w-4 h-4 mr-1" /> Confirm delivery</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirm delivery</DialogTitle></DialogHeader>
        <Input placeholder="Received by (optional)" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} data-testid="input-delivery-receiver" />
        <Input placeholder="Odometer (optional)" value={odometer} onChange={(e) => setOdometer(e.target.value)} data-testid="input-delivery-odometer" />
        <CustodyPhotoUpload photos={photoUrls} onChange={setPhotoUrls} disabled={busy} label="Delivery photos (optional)" testid="delivery" />
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-delivery">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm delivery"}</Button>
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

function GeofenceDialog({ assetId, onDone, currentLat, currentLng, currentRadius }: {
  assetId: number; onDone: () => void;
  currentLat?: number | null; currentLng?: number | null; currentRadius?: number | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("250");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const captureGps = async () => {
    setGpsLoading(true);
    const pos = await getPosWithMeta();
    if (pos.lat != null) { setLat(String(pos.lat.toFixed(6))); setLng(String(pos.lng!.toFixed(6))); }
    else toast({ title: "Could not get GPS", variant: "destructive" });
    setGpsLoading(false);
  };

  const submit = async () => {
    const latN = parseFloat(lat); const lngN = parseFloat(lng); const radN = parseInt(radius);
    if (!isFinite(latN) || !isFinite(lngN)) { toast({ title: "Enter or capture a valid location", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/assets/${assetId}/geofence`, { lat: latN, lng: lngN, radiusMeters: radN });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Geofence set", description: `Pickup zone locked to ${radN}m radius.` });
      setOpen(false); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full" data-testid="button-set-geofence">
          <Navigation className="w-4 h-4 mr-1" />
          {currentLat != null ? "Update pickup geofence" : "Set pickup geofence"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Pickup Geofence</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Lock the physical pickup zone for this asset. Carriers must be within this radius to submit a release request. Use your current GPS or enter coordinates manually.
        </p>
        {currentLat != null && (
          <div className="rounded-lg bg-muted/30 border border-border p-2 text-xs text-muted-foreground" data-testid="text-current-geofence">
            Current: {currentLat?.toFixed(4)}, {currentLng?.toFixed(4)} · {currentRadius ?? 250}m
          </div>
        )}
        <Button variant="outline" size="sm" onClick={captureGps} disabled={gpsLoading} data-testid="button-capture-geofence-gps">
          {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MapPin className="w-4 h-4 mr-1" />}
          Use my current location
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} data-testid="input-geofence-lat" />
          <Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} data-testid="input-geofence-lng" />
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Radius (metres)"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            type="number"
            min={50}
            max={2000}
            data-testid="input-geofence-radius"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">metres (50–2000)</span>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !lat || !lng} data-testid="button-submit-geofence">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save geofence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseRequestDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selfieUrls, setSelfieUrls] = useState<string[]>([]);
  const [gps, setGps] = useState<{ lat?: number; lng?: number; accuracy?: number; gpsTimestamp?: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [towType, setTowType] = useState("");
  const [towPlate, setTowPlate] = useState("");
  const [towState, setTowState] = useState("");
  const [towPhotos, setTowPhotos] = useState<string[]>([]);
  const [trailerType, setTrailerType] = useState("");
  const [trailerNum, setTrailerNum] = useState("");
  const [trailerPlate, setTrailerPlate] = useState("");
  const [trailerPhotos, setTrailerPhotos] = useState<string[]>([]);
  const [vin, setVin] = useState("");
  const [vinPhoto, setVinPhoto] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep(0); setSelfieUrls([]); setGps(null); setGpsLoading(false);
    setTowType(""); setTowPlate(""); setTowState(""); setTowPhotos([]);
    setTrailerType(""); setTrailerNum(""); setTrailerPlate(""); setTrailerPhotos([]);
    setVin(""); setVinPhoto([]);
  };

  const captureGps = async () => {
    setGpsLoading(true);
    const pos = await getPosWithMeta();
    setGps(pos);
    setGpsLoading(false);
  };

  const submit = async () => {
    if (!selfieUrls[0]) { toast({ title: "Selfie required", variant: "destructive" }); return; }
    if (!gps?.lat || !gps?.lng) { toast({ title: "GPS required — tap Capture GPS first", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const body: Record<string, any> = {
        selfieUrl: selfieUrls[0],
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        gpsTimestamp: gps.gpsTimestamp,
      };
      if (towType || towPlate) body.tow = { vehicleType: towType || null, plateNumber: towPlate || null, plateState: towState || null, photoUrls: towPhotos.length ? towPhotos : null };
      if (trailerType || trailerNum) body.trailer = { trailerType: trailerType || null, trailerNumber: trailerNum || null, plateNumber: trailerPlate || null, photoUrls: trailerPhotos.length ? trailerPhotos : null };
      if (vin) { body.scannedVin = vin; body.vinPhotoUrl = vinPhoto[0] || null; }
      const res = await apiRequest("POST", `/api/assets/${assetId}/release/request`, body);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      const vinWarn = d.vin?.status === "mismatch" ? " ⚠️ VIN mismatch flagged — owner will review." : "";
      const geoMsg = d.geofence?.withinFence === false ? ` GPS is ${Math.round(d.geofence.distanceMeters)}m from geofence.` : "";
      toast({ title: "Release request sent", description: `Owner will review and send you a pickup code.${vinWarn}${geoMsg}` });
      setOpen(false); reset(); onDone();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const steps = ["Selfie", "GPS", "Tow vehicle", "Trailer", "VIN", "Review"];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full" disabled={disabled} data-testid="button-request-release">
          <Key className="w-4 h-4 mr-1" /> Request Release Authorization
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Release Authorization</DialogTitle>
          <div className="flex gap-1 mt-2">
            {steps.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-emerald-500" : "bg-muted"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{steps[step]}</p>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Upload a live selfie — this is your identity confirmation and is required for every release.</p>
            <CustodyPhotoUpload photos={selfieUrls} onChange={setSelfieUrls} max={1} disabled={busy} label="Selfie (required)" testid="release-selfie" />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Your live GPS is required to prove you are at the asset location. Accuracy must be ≤150m.</p>
            <Button variant="outline" size="sm" className="w-full" onClick={captureGps} disabled={gpsLoading} data-testid="button-capture-gps">
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MapPin className="w-4 h-4 mr-1" />}
              {gps?.lat ? "Re-capture GPS" : "Capture GPS"}
            </Button>
            {gps?.lat && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-0.5" data-testid="gps-result">
                <div className="text-xs text-foreground font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> GPS captured
                </div>
                <div className="text-xs text-muted-foreground">{gps.lat?.toFixed(5)}, {gps.lng?.toFixed(5)}</div>
                <div className="text-xs text-muted-foreground">Accuracy: {gps.accuracy != null ? `${Math.round(gps.accuracy)}m` : "unknown"}</div>
                {gps.accuracy != null && gps.accuracy > 150 && (
                  <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Accuracy {Math.round(gps.accuracy)}m exceeds 150m limit — move outdoors and re-capture.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Enter your tow vehicle details (optional but recommended for high-value assets).</p>
            <Select value={towType} onValueChange={setTowType}>
              <SelectTrigger data-testid="select-tow-type"><SelectValue placeholder="Tow vehicle type (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flatbed">Flatbed</SelectItem>
                <SelectItem value="wheel_lift">Wheel lift</SelectItem>
                <SelectItem value="hook_chain">Hook & chain</SelectItem>
                <SelectItem value="enclosed_trailer">Enclosed trailer truck</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Plate number (optional)" value={towPlate} onChange={(e) => setTowPlate(e.target.value)} data-testid="input-tow-plate" />
            <Input placeholder="Plate state (e.g. TX, optional)" value={towState} onChange={(e) => setTowState(e.target.value)} data-testid="input-tow-state" />
            <CustodyPhotoUpload photos={towPhotos} onChange={setTowPhotos} disabled={busy} label="Tow vehicle photos (optional)" testid="tow" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Enter trailer details if applicable (optional).</p>
            <Select value={trailerType} onValueChange={setTrailerType}>
              <SelectTrigger data-testid="select-trailer-type"><SelectValue placeholder="Trailer type (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enclosed">Enclosed</SelectItem>
                <SelectItem value="open">Open / flatbed</SelectItem>
                <SelectItem value="lowboy">Lowboy</SelectItem>
                <SelectItem value="car_hauler">Car hauler</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Trailer number (optional)" value={trailerNum} onChange={(e) => setTrailerNum(e.target.value)} data-testid="input-trailer-num" />
            <Input placeholder="Trailer plate (optional)" value={trailerPlate} onChange={(e) => setTrailerPlate(e.target.value)} data-testid="input-trailer-plate" />
            <CustodyPhotoUpload photos={trailerPhotos} onChange={setTrailerPhotos} disabled={busy} label="Trailer photos (optional)" testid="trailer" />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Scan or type the VIN from the vehicle. A mismatch will flag the request for owner review.</p>
            <Input placeholder="VIN (optional)" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} data-testid="input-vin" />
            <CustodyPhotoUpload photos={vinPhoto} onChange={setVinPhoto} max={1} disabled={busy} label="VIN plate photo (optional)" testid="vin" />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">Review before submitting:</p>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
              <div><span className="text-muted-foreground">Selfie:</span> {selfieUrls[0] ? <span className="text-emerald-600">✓ uploaded</span> : <span className="text-red-500">missing</span>}</div>
              <div><span className="text-muted-foreground">GPS:</span> {gps?.lat ? `${gps.lat?.toFixed(4)}, ${gps.lng?.toFixed(4)} (±${gps.accuracy != null ? Math.round(gps.accuracy) : "?"}m)` : <span className="text-red-500">not captured</span>}</div>
              <div><span className="text-muted-foreground">Tow vehicle:</span> {towType ? `${title(towType)}${towPlate ? ` · ${towPlate}` : ""}` : "not provided"}</div>
              <div><span className="text-muted-foreground">Trailer:</span> {trailerType ? `${title(trailerType)}${trailerNum ? ` · ${trailerNum}` : ""}` : "not provided"}</div>
              <div><span className="text-muted-foreground">VIN:</span> {vin || "not provided"}</div>
            </div>
            {(!selfieUrls[0] || !gps?.lat) && (
              <div className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Selfie and GPS are required.</div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} disabled={busy} data-testid="button-release-back">Back</Button>
          )}
          {step < steps.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={step === 0 && !selfieUrls[0]} data-testid="button-release-next">Next</Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={busy || !selfieUrls[0] || !gps?.lat} data-testid="button-release-submit">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RedeemCodeDialog({ assetId, onDone, disabled }: { assetId: number; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) { toast({ title: "Enter the release code", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const gps = await getPosWithMeta();
      const res = await apiRequest("POST", `/api/assets/${assetId}/release/redeem`, {
        code: code.trim().toUpperCase(),
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        gpsTimestamp: gps.gpsTimestamp,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Code accepted — asset released", description: "Custody event logged. You may proceed with loading." });
      setOpen(false); setCode(""); onDone();
    } catch (e: any) {
      toast({ title: "Code rejected", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCode(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full" disabled={disabled} data-testid="button-redeem-code">
          <Lock className="w-4 h-4 mr-1" /> Redeem Release Code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redeem Release Code</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Enter the one-time code provided by the asset owner at hand-off. Your live GPS will be captured automatically.</p>
        <Input
          placeholder="Release code (e.g. XXXXXX-XXXXXX)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="font-mono tracking-widest text-center"
          data-testid="input-release-code"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !code.trim()} data-testid="button-submit-redeem">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem & unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthorizationRow({ assetId, auth, onDone }: { assetId: number; auth: any; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [plainCode, setPlainCode] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const approve = async () => {
    setBusy("approve");
    try {
      const res = await apiRequest("POST", `/api/assets/${assetId}/release/authorizations/${auth.id}/approve`, {});
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      setPlainCode(d.plainCode || null);
      setCodeOpen(true);
      onDone();
    } catch (e: any) {
      toast({ title: "Approval failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const deny = async () => {
    setBusy("deny");
    try {
      const res = await apiRequest("POST", `/api/assets/${assetId}/release/authorizations/${auth.id}/deny`, { reason: denyReason });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message);
      toast({ title: "Request denied" });
      setDenyOpen(false); setDenyReason(""); onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const copyCode = () => {
    if (plainCode) { navigator.clipboard.writeText(plainCode).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };


  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2" data-testid={`auth-row-${auth.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-amber-500" /> Release request #{auth.id}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-medium">Pending</span>
      </div>

      {auth.selfieUrl && (
        <a href={auth.selfieUrl} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-border" data-testid={`auth-selfie-${auth.id}`}>
          <img src={auth.selfieUrl} alt="Carrier selfie" className="w-full h-full object-cover" />
        </a>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div className="text-muted-foreground">GPS</div>
        <div className={auth.geofenceVerified === false && auth.geofenceMeters != null ? "text-amber-600" : "text-foreground"}>
          {auth.geofenceVerified
            ? <span className="text-emerald-600">Within geofence</span>
            : auth.geofenceMeters != null
              ? `${auth.geofenceMeters}m outside`
              : "No geofence set"}
        </div>
        <div className="text-muted-foreground">VIN</div>
        <div className={auth.vinStatus === "mismatch" ? "text-red-600 font-semibold" : "text-foreground"}>
          {auth.vinStatus === "matched" && <span className="text-emerald-600">✓ Matched</span>}
          {auth.vinStatus === "mismatch" && "⚠️ MISMATCH"}
          {auth.vinStatus === "no_vin_on_file" && "No VIN on file"}
          {auth.vinStatus === "not_provided" && "Not provided"}
          {!auth.vinStatus && "—"}
        </div>
        {auth.towDetails?.plateNumber && (
          <>
            <div className="text-muted-foreground">Tow</div>
            <div className="text-foreground">{title(auth.towDetails.vehicleType || "")} {auth.towDetails.plateNumber}</div>
          </>
        )}
        {auth.trailerDetails?.trailerNumber && (
          <>
            <div className="text-muted-foreground">Trailer</div>
            <div className="text-foreground">{title(auth.trailerDetails.trailerType || "")} {auth.trailerDetails.trailerNumber}</div>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={approve} disabled={!!busy} data-testid={`button-approve-auth-${auth.id}`}>
          {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve</>}
        </Button>
        <Dialog open={denyOpen} onOpenChange={(o) => { setDenyOpen(o); if (!o) setDenyReason(""); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={!!busy} data-testid={`button-deny-auth-${auth.id}`}>
              <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Deny release request</DialogTitle></DialogHeader>
            <Textarea placeholder="Reason for denial (optional)" value={denyReason} onChange={(e) => setDenyReason(e.target.value)} data-testid={`input-deny-reason-${auth.id}`} />
            <DialogFooter>
              <Button variant="destructive" onClick={deny} disabled={busy === "deny"} data-testid={`button-confirm-deny-${auth.id}`}>
                {busy === "deny" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deny request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* One-time code modal — shown immediately after approval */}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-emerald-600" /> Release code — copy now</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">This code is shown exactly once and cannot be retrieved again. Share it verbally with the carrier at hand-off only.</p>
          <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center" data-testid="plaincode-display">
            <div className="font-mono text-2xl font-bold tracking-widest text-emerald-700 dark:text-emerald-300 select-all" data-testid="text-plain-code">
              {plainCode || "—"}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyCode} data-testid="button-copy-code">
              {copied ? <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-500" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copied!" : "Copy code"}
            </Button>
            <Button onClick={() => setCodeOpen(false)} data-testid="button-close-code">Done — I've shared it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
