import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserLink } from "@/components/user-link";
import { AlertTriangle, CheckCircle, XCircle, Sparkles, Beaker, Flag, Bug, Users as UsersIcon, Eye, Search, Bell, Trash2, Activity, ImageOff, Image as ImageIcon, Film, Plus, Pencil, X as XIcon, ChevronUp, ChevronDown, ShieldCheck, Volume2, FileText, Crown, RefreshCw, Mail, Star, Siren } from "lucide-react";
import {
  TTS_PROVIDER, JAC_TARGET_VOICE,
  loadJacVoice, getVoiceDebugInfo, resetJacVoiceCache,
  type VoiceDebugInfo,
} from "@/lib/jac-voice";

type Check = { key: string; label: string; status: "pass" | "fail" | "skip"; detail?: string };

function StatusBadge({ status }: { status: Check["status"] }) {
  const map = {
    pass: { c: "bg-green-100 text-green-800", I: CheckCircle },
    fail: { c: "bg-red-100 text-red-800", I: XCircle },
    skip: { c: "bg-yellow-100 text-yellow-800", I: AlertTriangle },
  } as const;
  const { c, I } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${c}`}>
      <I className="h-3 w-3" /> {status.toUpperCase()}
    </span>
  );
}

function ChecklistTab() {
  const { data, isLoading } = useQuery<{ checks: Check[] }>({ queryKey: ["/api/admin/qa/system-checklist"] });
  if (isLoading) return <div className="p-4 text-sm">Loading…</div>;
  const stripeMode = data?.checks.find((c) => c.key === "stripe_mode");
  const isLive = stripeMode?.detail?.includes("LIVE");
  return (
    <div className="space-y-4">
      {isLive && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/30">
          <CardContent className="p-3 text-sm font-bold text-red-700 dark:text-red-300">
            ⚠ LIVE Stripe key loaded — sandbox endpoints will refuse to run.
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>System Checklist</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data?.checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between py-2 text-sm" data-testid={`row-check-${c.key}`}>
                <div>
                  <div className="font-medium">{c.label}</div>
                  {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketplaceSeedCard() {
  const { toast } = useToast();
  const seed = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/marketplace/seed-samples").then((r: any) => r.json ? r.json() : r),
    onSuccess: (d: any) => toast({ title: d.message || "Done", description: d.created ? `${d.created} listings created` : undefined }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Marketplace sample listings</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground">Seeds 3 representative listings (Vehicle, Property, Tools) tagged SAMPLE / DELETE ME. Idempotent — skips if already seeded.</div>
        <Button onClick={() => seed.mutate()} disabled={seed.isPending} data-testid="button-seed-samples">
          {seed.isPending ? "Seeding…" : "Seed Sample Listings"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SandboxTab() {
  const { toast } = useToast();
  const personas = useQuery<any[]>({ queryKey: ["/api/admin/qa/sandbox/personas"] });
  const testJobs = useQuery<any[]>({ queryKey: ["/api/admin/qa/sandbox/test-jobs"] });
  const [persona, setPersona] = useState("poster");
  const [posterId, setPosterId] = useState("");
  const [category, setCategory] = useState("General Labor");
  const [resetPreview, setResetPreview] = useState<any>(null);

  const create = useMutation({
    mutationFn: (p: string) => apiRequest("POST", "/api/admin/qa/sandbox/personas", { persona: p }).then((r) => r.json()),
    onSuccess: (d) => {
      toast({ title: "Persona created", description: `${d.email} (pw: ${d.password})` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/sandbox/personas"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const loginAs = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/qa/sandbox/login-as/${id}`).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Logged in as test user — refresh the app" }); window.location.href = "/dashboard"; },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const createJob = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/qa/sandbox/test-jobs", { category, posterId: parseInt(posterId) }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Test job created" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/sandbox/test-jobs"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const resetSandbox = useMutation({
    mutationFn: (dryRun: boolean) => apiRequest("POST", "/api/admin/qa/sandbox/reset", { dryRun }).then((r) => r.json()),
    onSuccess: (d, vars) => {
      if (vars) { setResetPreview(d); }
      else {
        toast({ title: "Sandbox reset", description: `Deleted ${d.counts.testUsers} users, ${d.counts.testJobs} jobs.` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/sandbox/personas"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/sandbox/test-jobs"] });
        setResetPreview(null);
      }
    },
  });

  return (
    <div className="space-y-4">
      <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
        <CardContent className="p-3 text-sm font-bold text-blue-700 dark:text-blue-300">
          SANDBOX — refuses to run if Stripe is in live mode. Test users carry <code>is_test_user=true</code> and never see real money.
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create test persona</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs">Persona</label>
            <Select value={persona} onValueChange={setPersona}>
              <SelectTrigger className="w-44" data-testid="select-persona"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["poster", "helper", "business", "admin", "day1og", "nonog"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate(persona)} disabled={create.isPending} data-testid="button-create-persona">Create</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Test personas ({personas.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {personas.data?.map((u: any) => (
              <li key={u.id} className="flex items-center justify-between py-2" data-testid={`row-persona-${u.id}`}>
                <div>
                  <UserLink userId={u.id} label={u.fullName} /> — <span className="text-xs text-muted-foreground">{u.email}</span>
                  <div className="text-xs">{u.role} · {u.tier}{u.day1OG && " · OG"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => loginAs.mutate(u.id)} data-testid={`button-loginas-${u.id}`}>Login as</Button>
              </li>
            ))}
            {!personas.data?.length && <li className="py-3 text-muted-foreground">No test personas yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create test job</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Input placeholder="Poster (test user) ID" value={posterId} onChange={(e) => setPosterId(e.target.value)} className="w-48" data-testid="input-poster-id" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-56" data-testid="select-job-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["On-Demand Help", "General Labor", "Skilled Labor", "Verify & Inspect"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => createJob.mutate()} disabled={!posterId || createJob.isPending} data-testid="button-create-test-job">Create</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Test jobs ({testJobs.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {testJobs.data?.map((j: any) => (
              <li key={j.id} className="flex items-center justify-between py-2">
                <div>
                  <Link href={`/admin/qa/inspect/job/${j.id}`} className="font-medium underline" data-testid={`link-inspect-job-${j.id}`}>
                    #{j.id} · {j.title}
                  </Link>
                  <div className="text-xs">{j.category} · status: {j.status} · poster: <UserLink userId={j.postedById} /></div>
                </div>
                <Badge variant="outline">test</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <MarketplaceSeedCard />

      <Card className="border-red-300">
        <CardHeader><CardTitle className="text-red-700">Reset sandbox data</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">Deletes only rows tagged <code>is_test_user=true</code> / <code>is_test_job=true</code> and their dependents. Real data is never touched.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => resetSandbox.mutate(true)} data-testid="button-reset-dryrun">Dry-run</Button>
            <Button variant="destructive" onClick={() => { if (confirm("Permanently delete all sandbox test data?")) resetSandbox.mutate(false); }} data-testid="button-reset-confirm">Delete now</Button>
          </div>
          {resetPreview && (
            <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(resetPreview, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AllowlistTab() {
  const { toast } = useToast();
  const [itemType, setItemType] = useState<"job" | "cash_drop">("job");
  const [itemId, setItemId] = useState("");
  const [userKey, setUserKey] = useState("");
  const list = useQuery<any[]>({
    queryKey: ["/api/admin/qa/allowlist", itemType, itemId],
    enabled: !!itemId,
    queryFn: async () => (await fetch(`/api/admin/qa/allowlist/${itemType}/${itemId}`)).json(),
  });
  const invite = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/qa/allowlist/${itemType}/${itemId}`, { userKey }, { "x-live-confirm": "LIVE" }).then((r) => r.json()),
    onSuccess: () => { setUserKey(""); list.refetch(); toast({ title: "Tester invited" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/qa/allowlist/${id}`, undefined, { "x-live-confirm": "LIVE" }).then((r) => r.json()),
    onSuccess: () => list.refetch(),
  });
  const endTest = useMutation({
    mutationFn: async (acknowledgeRefundFailure: boolean) => {
      const res = await fetch(`/api/admin/qa/allowlist/${itemType}/${itemId}/end-test`, {
        method: "POST",
        headers: { "x-live-confirm": "LIVE", "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgeRefundFailure }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.message || `End-test failed (${res.status})`);
        (err as Error & { refunds?: unknown; status?: number }).refunds = body.refunds;
        (err as Error & { refunds?: unknown; status?: number }).status = res.status;
        throw err;
      }
      return body;
    },
    onSuccess: () => { toast({ title: "Live test ended" }); list.refetch(); },
    onError: (e: Error & { refunds?: { ok: boolean; error?: string; id?: string }[]; status?: number }) => {
      // 502 = refund failed; show the failure detail and let admin force-cancel.
      if (e.status === 502 && e.refunds?.length) {
        const failed = e.refunds.filter((r) => !r.ok).map((r) => `${r.id}: ${r.error}`).join("\n");
        if (confirm(`Refund FAILED — money may still be held in Stripe:\n\n${failed}\n\nForce cancellation anyway? (real money may remain held)`)) {
          endTest.mutate(true);
          return;
        }
      }
      toast({ title: "End-test failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="border-red-500 bg-red-50 dark:bg-red-950/30">
        <CardContent className="p-3 text-sm font-bold text-red-700 dark:text-red-300">
          LIVE ALLOWLIST — real Stripe charges and payouts. Items flagged <code>visibility=allowlist</code> are hidden from every map / feed / search for users not on the list.
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Manage allowlist</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Select value={itemType} onValueChange={(v) => setItemType(v === "cash_drop" ? "cash_drop" : "job")}>
              <SelectTrigger className="w-40" data-testid="select-item-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="job">job</SelectItem>
                <SelectItem value="cash_drop">cash_drop</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="item id" value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-32" data-testid="input-item-id" />
            <Input placeholder="tester email or user id" value={userKey} onChange={(e) => setUserKey(e.target.value)} className="w-72" data-testid="input-tester-key" />
            <Button onClick={() => invite.mutate()} disabled={!itemId || !userKey} data-testid="button-invite-tester">Invite tester</Button>
            <Button variant="destructive" onClick={() => { if (confirm("End the live test? Removes allowlist + cancels item.")) endTest.mutate(false); }} disabled={!itemId} data-testid="button-end-test">End test</Button>
          </div>

          <ul className="divide-y text-sm">
            {list.data?.map((row: any) => (
              <li key={row.id} className="flex items-center justify-between py-2">
                <div>
                  <UserLink userId={row.userId} label={row.user?.fullName || row.user?.email} /> — <span className="text-xs text-muted-foreground">{row.user?.email}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => remove.mutate(row.id)} data-testid={`button-remove-tester-${row.id}`}>Remove</Button>
              </li>
            ))}
            {itemId && !list.data?.length && <li className="py-2 text-muted-foreground">No testers invited yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function InspectorTab() {
  const [type, setType] = useState<"job" | "proof" | "cashdrop" | "user" | "verification">("job");
  const [id, setId] = useState("");
  const dest = id ? `/admin/qa/inspect/${type}/${id}` : null;
  return (
    <Card>
      <CardHeader><CardTitle>Inspector</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <Select value={type} onValueChange={(v) => {
          if (v === "job" || v === "proof" || v === "cashdrop" || v === "user" || v === "verification") setType(v);
        }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["job", "proof", "cashdrop", "user", "verification"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="ID" value={id} onChange={(e) => setId(e.target.value)} className="w-32" data-testid="input-inspect-id" />
        {dest ? (
          <Button asChild data-testid="button-open-inspector"><Link href={dest}><Search className="mr-1 h-3 w-3" />Open</Link></Button>
        ) : <Button disabled>Open</Button>}
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const [id, setId] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Admin user profile</CardTitle></CardHeader>
      <CardContent className="flex items-end gap-2">
        <Input placeholder="user id" value={id} onChange={(e) => setId(e.target.value)} className="w-40" data-testid="input-user-id" />
        <Button asChild disabled={!id}><Link href={`/admin/users/${id}`}>Open profile</Link></Button>
        <p className="text-xs text-muted-foreground">Or click any user name anywhere in the admin surface.</p>
      </CardContent>
    </Card>
  );
}

type SweepFolder = {
  folder: string;
  resourceType: string;
  listed: number;
  orphans: number;
  orphanBytes: number;
  destroyed: number;
  destroyFailed: number;
  skippedTooNew: number;
  error?: string;
};
type SweepResult = {
  mode: "dry-run" | "delete";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalListed: number;
  totalOrphans: number;
  totalOrphanBytes: number;
  totalDestroyed: number;
  totalDestroyFailed: number;
  totalSkippedTooNew: number;
  capped: boolean;
  perFolder: SweepFolder[];
  trigger?: string;
};
type SweepHistoryEntry = {
  id: number;
  createdAt: string | null;
  mode: "dry-run" | "delete" | null;
  trigger: string | null;
  totalListed: number;
  totalOrphans: number;
  totalOrphanBytes: number;
  totalDestroyed: number;
  totalDestroyFailed: number;
  durationMs: number;
};
type OrphanSweepStatus = {
  destroyEnabled: boolean;
  lastRunAt: string | null;
  lastResult: SweepResult | null;
  lastAuditAt: string | null;
  history: SweepHistoryEntry[];
};

function Sparkline({ values, width = 240, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  return (
    <svg width={width} height={height} className="overflow-visible" data-testid="svg-sparkline-orphan-bytes">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      {values.map((v, i) => {
        const [x, y] = points[i].split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r={2} className="fill-primary" />;
      })}
    </svg>
  );
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function OrphanSweepTab() {
  const { toast } = useToast();
  const status = useQuery<OrphanSweepStatus>({ queryKey: ["/api/admin/qa/studio/orphan-sweep"] });

  const toggleDestroy = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/admin/qa/studio/orphan-sweep/destroy", { enabled }).then((r) => r.json()),
    onSuccess: (d) => {
      toast({ title: d.enabled ? "Destroy ENABLED" : "Destroy disabled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/studio/orphan-sweep"] });
    },
    onError: (e: any) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const runSweep = useMutation({
    mutationFn: (mode: "dry-run" | "delete") => {
      const qs = mode === "delete" ? "?delete=1&force=1" : "";
      return apiRequest("POST", `/api/admin/qa/studio/orphan-sweep${qs}`).then((r) => r.json());
    },
    onSuccess: (d: SweepResult) => {
      toast({
        title: `Sweep complete (${d.mode})`,
        description: `${d.totalOrphans} orphans · ${fmtBytes(d.totalOrphanBytes)} · destroyed ${d.totalDestroyed}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/studio/orphan-sweep"] });
    },
    onError: (e: any) => toast({ title: "Sweep failed", description: e.message, variant: "destructive" }),
  });

  const s = status.data;
  const last = s?.lastResult;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Studio orphan-asset sweep</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Weekly Cloudinary janitor for Studio folders. Anything not referenced by <code>studio_session_files</code> or <code>studio_featured_clips</code> is an orphan. Default mode is dry-run; flip the destroy toggle below to actually delete.
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded border p-3">
            <div className="text-sm">
              <div>Destroy mode: <Badge variant={s?.destroyEnabled ? "destructive" : "outline"} data-testid="badge-destroy-mode">{status.isLoading ? "loading…" : s?.destroyEnabled ? "ON (will delete)" : "OFF (dry-run)"}</Badge></div>
              <div className="mt-1 text-xs text-muted-foreground">Toggles <code>platform_settings.studio_orphan_sweep_destroy</code>. Cron sweeps obey this flag.</div>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant={s?.destroyEnabled ? "outline" : "default"}
                onClick={() => {
                  if (!s) return;
                  if (!s.destroyEnabled && !confirm("Enable destruction? Cron sweeps will permanently delete orphan Cloudinary assets.")) return;
                  toggleDestroy.mutate(!s.destroyEnabled);
                }}
                disabled={!s || toggleDestroy.isPending}
                data-testid="button-toggle-destroy"
              >
                {s?.destroyEnabled ? "Switch to dry-run" : "Enable destroy"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSweep.mutate("dry-run")} disabled={runSweep.isPending} data-testid="button-run-sweep-dryrun">
              <Search className="mr-1 h-3 w-3" /> Run sweep now (dry-run)
            </Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirm("Run sweep AND destroy orphans now? This permanently deletes Cloudinary assets.")) runSweep.mutate("delete"); }}
              disabled={runSweep.isPending}
              data-testid="button-run-sweep-destroy"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Run + destroy now
            </Button>
            {runSweep.isPending && <span className="self-center text-xs text-muted-foreground">Sweeping… can take a minute.</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Last sweep result</CardTitle></CardHeader>
        <CardContent>
          {status.isLoading && <div className="text-sm">Loading…</div>}
          {status.isError && <div className="text-sm text-red-600">Failed to load sweep status.</div>}
          {!status.isLoading && !status.isError && (
            <div className="mb-3 text-sm">
              <span className="text-xs text-muted-foreground">Last run: </span>
              <span data-testid="text-last-run-at">{s?.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "never"}</span>
            </div>
          )}
          {!status.isLoading && !last && <div className="text-sm text-muted-foreground">No sweep summary on file yet.</div>}
          {last && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Started</div>
                  <div>{last.startedAt ? new Date(last.startedAt).toLocaleString() : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Mode</div>
                  <div><Badge variant={last.mode === "delete" ? "destructive" : "outline"}>{last.mode}</Badge></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Trigger</div>
                  <div>{last.trigger || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                  <div>{(last.durationMs / 1000).toFixed(1)}s</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Listed</div>
                  <div>{last.totalListed}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Orphans</div>
                  <div data-testid="text-total-orphans">{last.totalOrphans} ({fmtBytes(last.totalOrphanBytes)})</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Destroyed</div>
                  <div data-testid="text-total-destroyed">{last.totalDestroyed}{last.totalDestroyFailed ? ` (${last.totalDestroyFailed} failed)` : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Skipped (too new)</div>
                  <div>{last.totalSkippedTooNew}{last.capped ? " · capped" : ""}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Folder</th>
                      <th className="py-1 pr-2">Type</th>
                      <th className="py-1 pr-2 text-right">Listed</th>
                      <th className="py-1 pr-2 text-right">Orphans</th>
                      <th className="py-1 pr-2 text-right">Bytes</th>
                      <th className="py-1 pr-2 text-right">Destroyed</th>
                      <th className="py-1 pr-2 text-right">Failed</th>
                      <th className="py-1 pr-2 text-right">Too new</th>
                      <th className="py-1 pr-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {last.perFolder.map((f, i) => (
                      <tr key={`${f.folder}-${f.resourceType}-${i}`} data-testid={`row-folder-${f.folder}-${f.resourceType}`}>
                        <td className="py-1 pr-2 font-mono">{f.folder}</td>
                        <td className="py-1 pr-2">{f.resourceType}</td>
                        <td className="py-1 pr-2 text-right">{f.listed}</td>
                        <td className="py-1 pr-2 text-right">{f.orphans}</td>
                        <td className="py-1 pr-2 text-right">{fmtBytes(f.orphanBytes)}</td>
                        <td className="py-1 pr-2 text-right">{f.destroyed}</td>
                        <td className="py-1 pr-2 text-right">{f.destroyFailed}</td>
                        <td className="py-1 pr-2 text-right">{f.skippedTooNew}</td>
                        <td className="py-1 pr-2 text-red-600">{f.error || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sweep history (last {s?.history?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {status.isLoading && <div className="text-sm">Loading…</div>}
          {status.isError && <div className="text-sm text-red-600">Failed to load sweep history.</div>}
          {!status.isLoading && !status.isError && !s?.history?.length && (
            <div className="text-sm text-muted-foreground">No prior sweeps logged.</div>
          )}
          {!status.isError && s?.history && s.history.length > 0 && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Orphan bytes over time (oldest → newest)</div>
                <Sparkline values={[...s.history].reverse().map((h) => h.totalOrphanBytes)} />
              </div>
              <div className="text-xs text-muted-foreground">Table is sorted newest first.</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">When</th>
                      <th className="py-1 pr-2">Mode</th>
                      <th className="py-1 pr-2">Trigger</th>
                      <th className="py-1 pr-2 text-right">Orphans</th>
                      <th className="py-1 pr-2 text-right">Bytes</th>
                      <th className="py-1 pr-2 text-right">Destroyed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {s.history.map((h) => (
                      <tr key={h.id} data-testid={`row-sweep-history-${h.id}`}>
                        <td className="py-1 pr-2">{h.createdAt ? new Date(h.createdAt).toLocaleString() : "—"}</td>
                        <td className="py-1 pr-2">
                          <Badge variant={h.mode === "delete" ? "destructive" : "outline"}>{h.mode || "—"}</Badge>
                        </td>
                        <td className="py-1 pr-2">{h.trigger || "—"}</td>
                        <td className="py-1 pr-2 text-right">{h.totalOrphans}</td>
                        <td className="py-1 pr-2 text-right">{fmtBytes(h.totalOrphanBytes)}</td>
                        <td className="py-1 pr-2 text-right">{h.totalDestroyed}{h.totalDestroyFailed ? ` (${h.totalDestroyFailed} failed)` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type StudioUsageTotals = { succeeded: { n: number; credits: number }; refunded: { n: number; credits: number }; failed: { n: number; credits: number } };
type StudioUsagePerTool = { tool: string; succeeded: number; refunded: number; failed: number; credits: number };
type StudioUsageHourly = { bucket: string; toolKey: string; status: string; n: number; credits: number };
type StudioUsageDaily = { bucket: string; status: string; n: number; credits: number };
type StudioUsageFailure = { id: number; userId: number; toolKey: string; status: string; errorReason: string | null; creditsCost: number; createdAt: string };
type StudioUsageTopUser = { userId: number; total: number; succeeded: number; refunded: number; failed: number; creditsSpent: number; creditsRefunded: number };
type StudioUsageResponse = {
  generatedAt: string;
  totals24h: StudioUsageTotals;
  totals7d: StudioUsageTotals;
  perTool24h: StudioUsagePerTool[];
  perTool7d: StudioUsagePerTool[];
  topSpenders24h: StudioUsageTopUser[];
  topSpenders7d: StudioUsageTopUser[];
  topRefunders24h: StudioUsageTopUser[];
  topRefunders7d: StudioUsageTopUser[];
  hourly24: StudioUsageHourly[];
  daily7: StudioUsageDaily[];
  recentFailures: StudioUsageFailure[];
};

function pct(num: number, denom: number): string {
  if (!denom) return "0.0%";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function StudioUsageTotalsCard({ title, totals }: { title: string; totals: StudioUsageTotals }) {
  // Status semantics in studio_generation_log (set by runStudioGeneration):
  //   succeeded — provider returned, credits stay deducted.
  //   refunded  — provider failed, credits already refunded back to user.
  //   failed    — bookkeeping fallback (rare); treated as a non-success.
  // Provider error rate counts both refunded + failed since both indicate
  // the user did NOT get the output they paid for. Refund rate is the
  // narrower "we already returned credits" subset.
  const total = totals.succeeded.n + totals.refunded.n + totals.failed.n;
  const creditsCharged = totals.succeeded.credits + totals.refunded.credits + totals.failed.credits;
  const creditsRefunded = totals.refunded.credits + totals.failed.credits;
  const creditsNet = creditsCharged - creditsRefunded;
  const providerErrorRate = pct(totals.refunded.n + totals.failed.n, total);
  const refundRate = pct(totals.refunded.n, total);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Generations</div>
            <div className="text-lg font-semibold" data-testid={`text-usage-total-${title}`}>{total}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Succeeded</div>
            <div className="text-lg font-semibold text-green-600">{totals.succeeded.n}</div>
          </div>
          <div title="Provider failed AFTER charge — credits already refunded back to user.">
            <div className="text-xs text-muted-foreground">Refunded</div>
            <div className="text-lg font-semibold text-yellow-600" data-testid={`text-usage-refunded-${title}`}>{totals.refunded.n} <span className="text-xs font-normal text-muted-foreground">({refundRate})</span></div>
          </div>
          <div title="Bookkeeping failure — counted as a non-success.">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className="text-lg font-semibold text-red-600">{totals.failed.n}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Credits charged (gross)</div>
            <div className="text-lg font-semibold">{creditsCharged}</div>
          </div>
          <div title="Refunded + failed credits returned to users.">
            <div className="text-xs text-muted-foreground">Credits refunded</div>
            <div className="text-lg font-semibold text-yellow-600">{creditsRefunded}</div>
          </div>
          <div title="Gross charged minus credits refunded — what users actually spent.">
            <div className="text-xs text-muted-foreground">Net credits spent</div>
            <div className="text-lg font-semibold" data-testid={`text-usage-net-${title}`}>{creditsNet}</div>
          </div>
          <div title="Refunded + failed as a share of all generations.">
            <div className="text-xs text-muted-foreground">Provider error rate</div>
            <div className={`text-lg font-semibold ${(totals.refunded.n + totals.failed.n) / Math.max(total, 1) > 0.1 ? "text-red-600" : ""}`}>{providerErrorRate}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type StudioTool = {
  key: string;
  label: string;
  description: string | null;
  creditsCost: number;
  durationSeconds: number | null;
  tileImageUrl: string | null;
};

function StudioTilesTab() {
  const { toast } = useToast();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});

  const { data: tools, isLoading, isError, refetch } = useQuery<StudioTool[]>({
    queryKey: ["/api/studio/tools"],
  });

  const clearMutation = useMutation({
    mutationFn: (toolKey: string) =>
      apiRequest("PATCH", `/api/admin/studio/tools/${toolKey}/tile-image`, { imageUrl: null }),
    onSuccess: (_data, toolKey) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/tools"] });
      toast({ title: "Tile image cleared", description: `Background removed for "${toolKey}".` });
    },
    onError: (_err, toolKey) => {
      toast({ title: "Failed to clear", description: `Could not clear tile image for "${toolKey}".`, variant: "destructive" });
    },
  });

  const setMutation = useMutation({
    mutationFn: ({ toolKey, imageUrl }: { toolKey: string; imageUrl: string }) =>
      apiRequest("PATCH", `/api/admin/studio/tools/${toolKey}/tile-image`, { imageUrl }),
    onSuccess: (_data, { toolKey }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/tools"] });
      setExpandedKey(null);
      setUrlInputs((prev) => ({ ...prev, [toolKey]: "" }));
      toast({ title: "Tile image set", description: `Background updated for "${toolKey}".` });
    },
    onError: (_err, { toolKey }) => {
      toast({ title: "Failed to set image", description: `Could not set tile image for "${toolKey}". Check that the URL is valid.`, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="p-4 text-sm">Loading…</div>;
  if (isError || !tools) {
    return (
      <Card><CardContent className="p-4 text-sm text-red-600">Failed to load Studio tools.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Paste a Cloudinary or CDN image URL to set a tile background directly, or clear an existing one.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-tiles-refresh">Refresh</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const isExpanded = expandedKey === tool.key;
          const urlValue = urlInputs[tool.key] ?? "";
          const isSaving = setMutation.isPending && setMutation.variables?.toolKey === tool.key;
          const isClearing = clearMutation.isPending && clearMutation.variables === tool.key;

          return (
            <Card key={tool.key} data-testid={`card-tile-${tool.key}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{tool.label}</CardTitle>
                <p className="text-xs text-muted-foreground font-mono">{tool.key}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative h-36 w-full overflow-hidden rounded-md border bg-muted">
                  {tool.tileImageUrl ? (
                    <img
                      src={tool.tileImageUrl}
                      alt={`${tool.label} tile background`}
                      className="h-full w-full object-cover"
                      data-testid={`img-tile-${tool.key}`}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground" data-testid={`placeholder-tile-${tool.key}`}>
                      <ImageOff className="h-8 w-8 opacity-40" />
                      <span className="text-xs">No background</span>
                    </div>
                  )}
                </div>

                {isExpanded ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="https://res.cloudinary.com/…"
                      value={urlValue}
                      onChange={(e) => setUrlInputs((prev) => ({ ...prev, [tool.key]: e.target.value }))}
                      disabled={isSaving}
                      data-testid={`input-tile-url-${tool.key}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!urlValue.trim() || isSaving}
                        onClick={() => setMutation.mutate({ toolKey: tool.key, imageUrl: urlValue.trim() })}
                        data-testid={`button-save-tile-${tool.key}`}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => { setExpandedKey(null); setUrlInputs((prev) => ({ ...prev, [tool.key]: "" })); }}
                        data-testid={`button-cancel-tile-${tool.key}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={isSaving || isClearing}
                      onClick={() => setExpandedKey(tool.key)}
                      data-testid={`button-set-url-tile-${tool.key}`}
                    >
                      <ImageIcon className="mr-1 h-3 w-3" /> Set URL
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={!tool.tileImageUrl || isClearing || isSaving}
                      onClick={() => clearMutation.mutate(tool.key)}
                      data-testid={`button-clear-tile-${tool.key}`}
                    >
                      {isClearing ? "Clearing…" : "Clear"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StudioUsageTab() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<StudioUsageResponse>({
    queryKey: ["/api/admin/qa/studio/usage"],
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-4 text-sm">Loading…</div>;
  if (isError || !data) {
    return (
      <Card><CardContent className="p-4 text-sm text-red-600">Failed to load Studio usage.</CardContent></Card>
    );
  }

  // Roll the hourly rows up into one bucket-per-hour series for the sparkline.
  const hourlyMap = new Map<string, { total: number; refunded: number; failed: number }>();
  for (const row of data.hourly24) {
    const key = String(row.bucket);
    const cur = hourlyMap.get(key) || { total: 0, refunded: 0, failed: 0 };
    cur.total += row.n;
    if (row.status === "refunded") cur.refunded += row.n;
    if (row.status === "failed") cur.failed += row.n;
    hourlyMap.set(key, cur);
  }
  const hourlyKeys = Array.from(hourlyMap.keys()).sort();
  const hourlyTotals = hourlyKeys.map((k) => hourlyMap.get(k)!.total);
  const hourlyErrors = hourlyKeys.map((k) => (hourlyMap.get(k)!.refunded + hourlyMap.get(k)!.failed));

  const dailyMap = new Map<string, { total: number; refunded: number; failed: number; credits: number }>();
  for (const row of data.daily7) {
    const key = String(row.bucket);
    const cur = dailyMap.get(key) || { total: 0, refunded: 0, failed: 0, credits: 0 };
    cur.total += row.n;
    cur.credits += row.credits;
    if (row.status === "refunded") cur.refunded += row.n;
    if (row.status === "failed") cur.failed += row.n;
    dailyMap.set(key, cur);
  }
  const dailyRows = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground" data-testid="text-usage-generated-at">
          Generated {new Date(data.generatedAt).toLocaleTimeString()} · auto-refreshes every minute
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-usage-refresh">
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <StudioUsageTotalsCard title="Last 24h" totals={data.totals24h} />
        <StudioUsageTotalsCard title="Last 7d" totals={data.totals7d} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Hourly volume — last 24h</CardTitle></CardHeader>
        <CardContent>
          {hourlyKeys.length === 0 ? (
            <div className="text-sm text-muted-foreground">No generations in the last 24h.</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Total generations per hour (all tools)</div>
                <Sparkline values={hourlyTotals} />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Refunded + failed per hour (all tools)</div>
                <Sparkline values={hourlyErrors} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        // Per-tool hourly series — keep tool dimension so admins can pinpoint
        // which provider/tool drove a spike or outage in the last 24h.
        const toolHourly = new Map<string, Map<string, { total: number; errors: number }>>();
        const allBuckets = new Set<string>();
        for (const row of data.hourly24) {
          const bucketKey = String(row.bucket);
          allBuckets.add(bucketKey);
          let toolMap = toolHourly.get(row.toolKey);
          if (!toolMap) { toolMap = new Map(); toolHourly.set(row.toolKey, toolMap); }
          const cur = toolMap.get(bucketKey) || { total: 0, errors: 0 };
          cur.total += row.n;
          if (row.status === "refunded" || row.status === "failed") cur.errors += row.n;
          toolMap.set(bucketKey, cur);
        }
        const buckets = Array.from(allBuckets).sort();
        const tools = Array.from(toolHourly.keys()).sort();
        return (
          <Card>
            <CardHeader><CardTitle className="text-base">Per-tool hourly — last 24h</CardTitle></CardHeader>
            <CardContent>
              {tools.length === 0 ? (
                <div className="text-sm text-muted-foreground">No generations in the last 24h.</div>
              ) : (
                <div className="space-y-4">
                  {tools.map((tool) => {
                    const toolMap = toolHourly.get(tool)!;
                    const totals = buckets.map((b) => toolMap.get(b)?.total ?? 0);
                    const errors = buckets.map((b) => toolMap.get(b)?.errors ?? 0);
                    const sumTotal = totals.reduce((a, b) => a + b, 0);
                    const sumErrors = errors.reduce((a, b) => a + b, 0);
                    const peakHour = buckets[totals.indexOf(Math.max(...totals))];
                    return (
                      <div key={tool} className="rounded border p-3" data-testid={`row-usage-tool-hourly-${tool}`}>
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <div className="font-mono">{tool}</div>
                          <div className="text-xs text-muted-foreground">
                            {sumTotal} runs · {sumErrors} refunded/failed ({pct(sumErrors, sumTotal)}) · peak hour {peakHour ? new Date(peakHour).toLocaleTimeString([], { hour: "numeric" }) : "—"}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Generations / hour</div>
                            <Sparkline values={totals} />
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">Refunded + failed / hour</div>
                            <Sparkline values={errors} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader><CardTitle className="text-base">Per-tool — last 24h</CardTitle></CardHeader>
        <CardContent>
          {data.perTool24h.length === 0 ? (
            <div className="text-sm text-muted-foreground">No generations in the last 24h.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Tool</th>
                    <th className="py-1 pr-2 text-right">Succeeded</th>
                    <th className="py-1 pr-2 text-right">Refunded</th>
                    <th className="py-1 pr-2 text-right">Failed</th>
                    <th className="py-1 pr-2 text-right">Refund rate</th>
                    <th className="py-1 pr-2 text-right">Credits charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.perTool24h.map((t) => {
                    const total = t.succeeded + t.refunded + t.failed;
                    const refundRate = pct(t.refunded + t.failed, total);
                    const hot = (t.refunded + t.failed) / Math.max(total, 1) > 0.15 && total >= 5;
                    return (
                      <tr key={t.tool} data-testid={`row-usage-tool-${t.tool}`}>
                        <td className="py-1 pr-2 font-mono">{t.tool}</td>
                        <td className="py-1 pr-2 text-right text-green-600">{t.succeeded}</td>
                        <td className="py-1 pr-2 text-right text-yellow-600">{t.refunded}</td>
                        <td className="py-1 pr-2 text-right text-red-600">{t.failed}</td>
                        <td className={`py-1 pr-2 text-right ${hot ? "font-bold text-red-600" : ""}`}>{refundRate}</td>
                        <td className="py-1 pr-2 text-right">{t.credits}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-tool — last 7d</CardTitle></CardHeader>
        <CardContent>
          {data.perTool7d.length === 0 ? (
            <div className="text-sm text-muted-foreground">No generations in the last 7d.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Tool</th>
                    <th className="py-1 pr-2 text-right">Succeeded</th>
                    <th className="py-1 pr-2 text-right">Refunded</th>
                    <th className="py-1 pr-2 text-right">Failed</th>
                    <th className="py-1 pr-2 text-right">Refund rate</th>
                    <th className="py-1 pr-2 text-right">Credits charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.perTool7d.map((t) => {
                    const total = t.succeeded + t.refunded + t.failed;
                    return (
                      <tr key={t.tool}>
                        <td className="py-1 pr-2 font-mono">{t.tool}</td>
                        <td className="py-1 pr-2 text-right text-green-600">{t.succeeded}</td>
                        <td className="py-1 pr-2 text-right text-yellow-600">{t.refunded}</td>
                        <td className="py-1 pr-2 text-right text-red-600">{t.failed}</td>
                        <td className="py-1 pr-2 text-right">{pct(t.refunded + t.failed, total)}</td>
                        <td className="py-1 pr-2 text-right">{t.credits}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily — last 7d</CardTitle></CardHeader>
        <CardContent>
          {dailyRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No generations in the last 7d.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Day</th>
                    <th className="py-1 pr-2 text-right">Total</th>
                    <th className="py-1 pr-2 text-right">Refunded</th>
                    <th className="py-1 pr-2 text-right">Failed</th>
                    <th className="py-1 pr-2 text-right">Credits charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dailyRows.map(([day, v]) => (
                    <tr key={day}>
                      <td className="py-1 pr-2">{new Date(day).toLocaleDateString()}</td>
                      <td className="py-1 pr-2 text-right">{v.total}</td>
                      <td className="py-1 pr-2 text-right text-yellow-600">{v.refunded}</td>
                      <td className="py-1 pr-2 text-right text-red-600">{v.failed}</td>
                      <td className="py-1 pr-2 text-right">{v.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Top users (task-557) ─────────────────────────────────────────── */}
      {(() => {
        // Both lists come pre-ranked from independent server-side queries so
        // a high-refund / low-spend user is never missing from topRefunders.
        const topSpenders24h = data.topSpenders24h;
        const topRefunders24h = data.topRefunders24h;
        const topSpenders7d = data.topSpenders7d;
        const topRefunders7d = data.topRefunders7d;

        const UserTable = ({ rows, sortedBy }: { rows: StudioUsageTopUser[]; sortedBy: "spent" | "refunded" }) => (
          rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity in this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3">User</th>
                    <th className="py-1 pr-3 text-right">Runs</th>
                    <th className="py-1 pr-3 text-right">OK</th>
                    <th className="py-1 pr-3 text-right">Refunded</th>
                    <th className="py-1 pr-3 text-right">Failed</th>
                    <th className={`py-1 pr-3 text-right ${sortedBy === "spent" ? "font-semibold text-foreground" : ""}`}>Cr spent</th>
                    <th className={`py-1 pr-3 text-right ${sortedBy === "refunded" ? "font-semibold text-foreground" : ""}`}>Cr refunded</th>
                    <th className="py-1 text-right">Refund rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((u) => {
                    const refundRate = pct(u.refunded + u.failed, u.total);
                    const hotRefunder = (u.refunded + u.failed) / Math.max(u.total, 1) > 0.3 && u.total >= 3;
                    return (
                      <tr key={u.userId} data-testid={`row-top-user-${u.userId}`}>
                        <td className="py-1 pr-3"><UserLink userId={u.userId} label={`#${u.userId}`} /></td>
                        <td className="py-1 pr-3 text-right">{u.total}</td>
                        <td className="py-1 pr-3 text-right text-green-600">{u.succeeded}</td>
                        <td className="py-1 pr-3 text-right text-yellow-600">{u.refunded}</td>
                        <td className="py-1 pr-3 text-right text-red-600">{u.failed}</td>
                        <td className="py-1 pr-3 text-right font-medium">{u.creditsSpent}</td>
                        <td className="py-1 pr-3 text-right text-yellow-600">{u.creditsRefunded}</td>
                        <td className={`py-1 text-right ${hotRefunder ? "font-bold text-red-600" : ""}`}>{refundRate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        );

        return (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Top users — last 24h</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Top spenders (by credits spent)</div>
                  <UserTable rows={topSpenders24h} sortedBy="spent" />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Top refund recipients (by refunded + failed count)</div>
                  <UserTable rows={topRefunders24h} sortedBy="refunded" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top users — last 7d</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Top spenders (by credits spent)</div>
                  <UserTable rows={topSpenders7d} sortedBy="spent" />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Top refund recipients (by refunded + failed count)</div>
                  <UserTable rows={topRefunders7d} sortedBy="refunded" />
                </div>
              </CardContent>
            </Card>
          </>
        );
      })()}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent failures &amp; refunds</CardTitle></CardHeader>
        <CardContent>
          {data.recentFailures.length === 0 ? (
            <div className="text-sm text-muted-foreground">No failures or refunds on file.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">When</th>
                    <th className="py-1 pr-2">User</th>
                    <th className="py-1 pr-2">Tool</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2 text-right">Credits</th>
                    <th className="py-1 pr-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.recentFailures.map((f) => (
                    <tr key={f.id} data-testid={`row-usage-failure-${f.id}`}>
                      <td className="py-1 pr-2 whitespace-nowrap">{f.createdAt ? new Date(f.createdAt).toLocaleString() : "—"}</td>
                      <td className="py-1 pr-2"><UserLink userId={f.userId} label={`#${f.userId}`} /></td>
                      <td className="py-1 pr-2 font-mono">{f.toolKey}</td>
                      <td className="py-1 pr-2">
                        <Badge variant={f.status === "refunded" ? "outline" : "destructive"}>{f.status}</Badge>
                      </td>
                      <td className="py-1 pr-2 text-right">{f.creditsCost}</td>
                      <td className="py-1 pr-2 text-red-600">{f.errorReason || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type FeaturedClip = {
  id: number;
  slug: string;
  label: string;
  caption: string;
  videoUrl: string;
  posterUrl: string | null;
  position: number;
  active: boolean;
  createdAt: string;
};

type ClipFormState = {
  slug: string;
  label: string;
  caption: string;
  videoUrl: string;
  posterUrl: string;
  position: string;
  active: boolean;
};

const EMPTY_FORM: ClipFormState = { slug: "", label: "", caption: "", videoUrl: "", posterUrl: "", position: "100", active: true };

function clipFormErrors(f: ClipFormState) {
  const errs: Record<string, string> = {};
  if (!f.slug.trim()) errs.slug = "Required";
  else if (!/^[a-z0-9-]+$/.test(f.slug.trim())) errs.slug = "Lowercase letters, numbers, hyphens only";
  if (!f.label.trim()) errs.label = "Required";
  if (!f.caption.trim()) errs.caption = "Required";
  if (!f.videoUrl.trim()) errs.videoUrl = "Required";
  const pos = Number(f.position);
  if (f.position.trim() === "" || !Number.isFinite(pos) || pos < 0) errs.position = "Must be a non-negative number";
  return errs;
}

interface AdminFoundersStatus {
  totalClaimed: number;
  capLimit: number;
  spotsRemaining: number;
  soldOut: boolean;
  currentPriceCents: number;
  founderPriceCents: number;
  standardPriceCents: number;
}

function FoundersTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AdminFoundersStatus>({ queryKey: ["/api/admin/founders"] });
  const [cap, setCap] = useState("");
  const [founderPrice, setFounderPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");

  useEffect(() => {
    if (data) {
      setCap(String(data.capLimit));
      setFounderPrice((data.founderPriceCents / 100).toString());
      setStandardPrice((data.standardPriceCents / 100).toString());
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Record<string, number>) =>
      apiRequest("PATCH", "/api/admin/founders", patch).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Founders Club updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/founders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-protection/founders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-protection/pricing"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const onSave = () => {
    const patch: Record<string, number> = {};
    const capNum = parseInt(cap, 10);
    const fp = Math.round(parseFloat(founderPrice) * 100);
    const sp = Math.round(parseFloat(standardPrice) * 100);
    if (Number.isFinite(capNum) && capNum > 0) patch.capLimit = capNum;
    if (Number.isFinite(fp) && fp >= 0) patch.founderPriceCents = fp;
    if (Number.isFinite(sp) && sp >= 0) patch.standardPriceCents = sp;
    if (Object.keys(patch).length === 0) {
      toast({ title: "Nothing to update", variant: "destructive" });
      return;
    }
    save.mutate(patch);
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Founders Club Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Adjust the cap and pricing for the Asset Protection Founders Club. Enrollment is also gated by the{" "}
          <code>asset_protection_founders_club</code> feature flag. The cap cannot be set below the number of spots already claimed.
        </p>

        {data && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3" data-testid="stat-claimed">
              <div className="text-xs text-muted-foreground">Claimed</div>
              <div className="text-xl font-bold">{data.totalClaimed.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3" data-testid="stat-remaining">
              <div className="text-xs text-muted-foreground">Remaining</div>
              <div className="text-xl font-bold">{data.spotsRemaining.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3" data-testid="stat-status">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-xl font-bold">{data.soldOut ? "Sold out" : "Open"}</div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Cap (total spots)</label>
            <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} data-testid="input-founders-cap" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Founder price ($)</label>
            <Input type="number" step="0.01" value={founderPrice} onChange={(e) => setFounderPrice(e.target.value)} data-testid="input-founders-price" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Standard price ($)</label>
            <Input type="number" step="0.01" value={standardPrice} onChange={(e) => setStandardPrice(e.target.value)} data-testid="input-standard-price" />
          </div>
        </div>

        <Button onClick={onSave} disabled={save.isPending} data-testid="button-save-founders">
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FeaturedClipsTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ClipFormState>(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ClipFormState>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const { data: clips, isLoading, isError, refetch } = useQuery<FeaturedClip[]>({
    queryKey: ["/api/admin/studio/featured"],
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/studio/featured", body).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      setCreateErrors({});
      toast({ title: "Clip created" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiRequest("PATCH", `/api/admin/studio/featured/${id}`, body).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] });
      setEditingId(null);
      toast({ title: "Clip updated" });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] });
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/studio/featured/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] });
      toast({ title: "Clip deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = (clip: FeaturedClip) => {
    updateMutation.mutate({ id: clip.id, body: { active: !clip.active } });
  };

  function startEdit(clip: FeaturedClip) {
    setEditingId(clip.id);
    setEditErrors({});
    setEditForm({
      slug: clip.slug,
      label: clip.label,
      caption: clip.caption,
      videoUrl: clip.videoUrl,
      posterUrl: clip.posterUrl ?? "",
      position: String(clip.position),
      active: clip.active,
    });
  }

  function submitCreate() {
    const errs = clipFormErrors(createForm);
    if (Object.keys(errs).length > 0) { setCreateErrors(errs); return; }
    createMutation.mutate({
      slug: createForm.slug.trim(),
      label: createForm.label.trim(),
      caption: createForm.caption.trim(),
      videoUrl: createForm.videoUrl.trim(),
      posterUrl: createForm.posterUrl.trim() || null,
      position: Number(createForm.position),
      active: createForm.active,
    });
  }

  function submitEdit() {
    if (editingId === null) return;
    const errs = clipFormErrors(editForm);
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return; }
    updateMutation.mutate({
      id: editingId,
      body: {
        slug: editForm.slug.trim(),
        label: editForm.label.trim(),
        caption: editForm.caption.trim(),
        videoUrl: editForm.videoUrl.trim(),
        posterUrl: editForm.posterUrl.trim() || null,
        position: Number(editForm.position),
        active: editForm.active,
      },
    });
  }

  function shiftPosition(clip: FeaturedClip, direction: "up" | "down", sorted: FeaturedClip[]) {
    const idx = sorted.findIndex((c) => c.id === clip.id);
    const neighbor = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!neighbor) return;
    updateMutation.mutate({ id: clip.id, body: { position: neighbor.position } });
    updateMutation.mutate({ id: neighbor.id, body: { position: clip.position } });
  }

  const ClipField = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600" data-testid={`error-${label.toLowerCase()}`}>{error}</p>}
    </div>
  );

  const FormFields = ({
    form, setForm, errors,
  }: { form: ClipFormState; setForm: (f: ClipFormState) => void; errors: Record<string, string> }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClipField label="Slug" error={errors.slug}>
        <Input
          value={form.slug}
          placeholder="my-clip-slug"
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          data-testid="input-clip-slug"
        />
      </ClipField>
      <ClipField label="Label" error={errors.label}>
        <Input
          value={form.label}
          placeholder="Trending label"
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          data-testid="input-clip-label"
        />
      </ClipField>
      <ClipField label="Position" error={errors.position}>
        <Input
          type="number"
          min={0}
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
          data-testid="input-clip-position"
        />
      </ClipField>
      <ClipField label="Active">
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="clip-active"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="h-4 w-4 cursor-pointer"
            data-testid="checkbox-clip-active"
          />
          <label htmlFor="clip-active" className="text-sm cursor-pointer">Show on Trends rail</label>
        </div>
      </ClipField>
      <ClipField label="Video URL" error={errors.videoUrl}>
        <Input
          value={form.videoUrl}
          placeholder="https://res.cloudinary.com/…/video.mp4"
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
          data-testid="input-clip-video-url"
        />
      </ClipField>
      <ClipField label="Poster URL (optional)">
        <Input
          value={form.posterUrl}
          placeholder="https://… (thumbnail image)"
          onChange={(e) => setForm({ ...form, posterUrl: e.target.value })}
          data-testid="input-clip-poster-url"
        />
      </ClipField>
      <ClipField label="Caption (prompt text)" error={errors.caption}>
        <Input
          value={form.caption}
          placeholder="Cinematic aerial shot of …"
          onChange={(e) => setForm({ ...form, caption: e.target.value })}
          className="sm:col-span-2"
          data-testid="input-clip-caption"
        />
      </ClipField>
    </div>
  );

  if (isLoading) return <div className="p-4 text-sm">Loading…</div>;
  if (isError) return <Card><CardContent className="p-4 text-sm text-red-600">Failed to load featured clips.</CardContent></Card>;

  const sorted = [...(clips ?? [])].sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage the "Trending Now" rail on <code className="text-xs">/studio</code>. Clips are shown ordered by position (lower = first).
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-featured-refresh">Refresh</Button>
          <Button
            size="sm"
            onClick={() => { setShowCreate((v) => !v); setCreateErrors({}); setCreateForm(EMPTY_FORM); }}
            data-testid="button-featured-new"
          >
            <Plus className="mr-1 h-3 w-3" /> New Clip
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="border-primary/40" data-testid="card-create-clip">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Featured Clip
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormFields form={createForm} setForm={setCreateForm} errors={createErrors} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={submitCreate}
                disabled={createMutation.isPending}
                data-testid="button-create-clip-submit"
              >
                {createMutation.isPending ? "Saving…" : "Create Clip"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowCreate(false); setCreateErrors({}); }}
                data-testid="button-create-clip-cancel"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sorted.length === 0 && !showCreate && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No featured clips yet. Click "New Clip" to add the first one.
          </CardContent>
        </Card>
      )}

      {sorted.map((clip, idx) => {
        const isEditing = editingId === clip.id;
        const isDeleting = deleteMutation.isPending && deleteMutation.variables === clip.id;
        const isUpdating = updateMutation.isPending && updateMutation.variables?.id === clip.id;

        return (
          <Card key={clip.id} data-testid={`card-clip-${clip.id}`} className={clip.active ? "" : "opacity-60"}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-semibold text-sm truncate" data-testid={`text-clip-label-${clip.id}`}>{clip.label}</span>
                    <code className="text-xs text-muted-foreground font-mono" data-testid={`text-clip-slug-${clip.id}`}>{clip.slug}</code>
                    <Badge variant={clip.active ? "default" : "outline"} data-testid={`badge-clip-active-${clip.id}`}>
                      {clip.active ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">pos: {clip.position}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate" data-testid={`text-clip-caption-${clip.id}`}>{clip.caption}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    disabled={idx === 0 || isUpdating}
                    onClick={() => shiftPosition(clip, "up", sorted)}
                    data-testid={`button-clip-up-${clip.id}`}
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    disabled={idx === sorted.length - 1 || isUpdating}
                    onClick={() => shiftPosition(clip, "down", sorted)}
                    data-testid={`button-clip-down-${clip.id}`}
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleActive(clip)}
                    disabled={isUpdating}
                    data-testid={`button-clip-toggle-${clip.id}`}
                  >
                    {clip.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => isEditing ? setEditingId(null) : startEdit(clip)}
                    data-testid={`button-clip-edit-${clip.id}`}
                    title={isEditing ? "Cancel edit" : "Edit"}
                  >
                    {isEditing ? <XIcon className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => { if (confirm(`Delete clip "${clip.label}"?`)) deleteMutation.mutate(clip.id); }}
                    disabled={isDeleting}
                    data-testid={`button-clip-delete-${clip.id}`}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isEditing && (
              <CardContent className="space-y-4 border-t pt-4">
                <FormFields form={editForm} setForm={setEditForm} errors={editErrors} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={submitEdit}
                    disabled={updateMutation.isPending}
                    data-testid={`button-clip-save-${clip.id}`}
                  >
                    {updateMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingId(null); setEditErrors({}); }}
                    data-testid={`button-clip-cancel-${clip.id}`}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Day-1 OG Stripe Audit Tab ─────────────────────────────────────────────────
type OGAuditRow = {
  email: string;
  paidAt: string;
  sessionId: string;
  amountCents: number;
  hasAccount: boolean;
  userId: number | null;
  username: string | null;
  day1OgActive: boolean;
  inPreapproved: boolean;
};
type OGAuditData = { rows: OGAuditRow[]; scannedAt: string };

function OGAuditTab() {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isFetching } = useQuery<OGAuditData>({
    queryKey: ["/api/admin/og-stripe-audit"],
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const totalPaid = rows.length;
  const activeCount = rows.filter((r) => r.day1OgActive).length;
  const noAccountCount = rows.filter((r) => !r.hasAccount).length;
  const needsGrantCount = rows.filter((r) => r.hasAccount && !r.day1OgActive).length;
  const notPreapprovedCount = rows.filter((r) => !r.inPreapproved).length;

  const doGrant = async (email: string) => {
    setActionLoading((p) => ({ ...p, [email + "_grant"]: "loading" }));
    try {
      await apiRequest("POST", "/api/admin/og-grant", { email });
      toast({ title: "OG granted", description: email });
      refetch();
    } catch (e: any) {
      toast({ title: "Grant failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[email + "_grant"]; return n; });
    }
  };

  const doEmail = async (email: string, hasAccount: boolean) => {
    setActionLoading((p) => ({ ...p, [email + "_email"]: "loading" }));
    try {
      await apiRequest("POST", "/api/admin/og-notify-email", { email, hasAccount });
      toast({ title: "Email sent", description: email });
    } catch (e: any) {
      toast({ title: "Email failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[email + "_email"]; return n; });
    }
  };

  const doEmailAll = async () => {
    const targets = rows.filter((r) => !r.day1OgActive || !r.hasAccount);
    for (const r of targets) {
      await doEmail(r.email, r.hasAccount);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    toast({ title: "All notifications sent", description: `${targets.length} emails queued` });
  };

  const rowStatus = (r: OGAuditRow) => {
    if (r.day1OgActive) return "ok";
    if (!r.hasAccount) return "pending";
    return "action";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-amber-500" /> Day-1 OG Stripe Audit
            </CardTitle>
            <div className="flex items-center gap-2">
              {data?.scannedAt && (
                <span className="text-[10px] text-muted-foreground">
                  Last scan: {new Date(data.scannedAt).toLocaleTimeString()}
                </span>
              )}
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-og-refresh">
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "Scanning…" : "Scan Stripe"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Scanning Stripe…</p>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Paid OG Buyers", value: totalPaid, color: "text-foreground" },
                  { label: "Badge Active", value: activeCount, color: "text-green-500" },
                  { label: "No Account Yet", value: noAccountCount, color: "text-yellow-500" },
                  { label: "Needs Grant", value: needsGrantCount, color: "text-orange-500" },
                  { label: "Not Preapproved", value: notPreapprovedCount, color: "text-red-500" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border p-3 text-center" data-testid={`stat-og-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Bulk actions */}
              {(needsGrantCount > 0 || noAccountCount > 0) && (
                <div className="flex gap-2 mb-4">
                  {needsGrantCount > 0 && (
                    <Button size="sm" variant="outline" className="text-orange-500 border-orange-500/30"
                      onClick={() => rows.filter((r) => r.hasAccount && !r.day1OgActive).forEach((r) => doGrant(r.email))}
                      data-testid="button-og-grant-all">
                      <Star className="h-3 w-3 mr-1" /> Grant All Missing ({needsGrantCount})
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-blue-500 border-blue-500/30"
                    onClick={doEmailAll} data-testid="button-og-email-all">
                    <Mail className="h-3 w-3 mr-1" /> Email All Unactivated
                  </Button>
                </div>
              )}

              {/* Table */}
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Paid</th>
                      <th className="text-left px-3 py-2 font-medium">Account</th>
                      <th className="text-left px-3 py-2 font-medium">OG Active</th>
                      <th className="text-left px-3 py-2 font-medium">Preapproved</th>
                      <th className="text-right px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const status = rowStatus(r);
                      return (
                        <tr key={r.email}
                          className={`border-b last:border-0 ${status === "ok" ? "bg-green-500/5" : status === "action" ? "bg-orange-500/5" : "bg-yellow-500/5"}`}
                          data-testid={`row-og-${r.email}`}>
                          <td className="px-3 py-2 font-mono">{r.email}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(r.paidAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            {r.hasAccount ? (
                              <a href={`/admin/user/${r.userId}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2">
                                @{r.username}
                              </a>
                            ) : (
                              <span className="text-yellow-500">No account</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.day1OgActive
                              ? <span className="text-green-500 font-semibold">✓ Active</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {r.inPreapproved
                              ? <span className="text-green-500">✓</span>
                              : <span className="text-red-500">✗ Missing</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              {!r.inPreapproved && (
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-500 border-red-500/30"
                                  onClick={() => doGrant(r.email)}
                                  disabled={!!actionLoading[r.email + "_grant"]}
                                  data-testid={`button-og-grant-${r.email}`}>
                                  {actionLoading[r.email + "_grant"] ? "…" : "Add Preapproved"}
                                </Button>
                              )}
                              {r.hasAccount && !r.day1OgActive && (
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-orange-500 border-orange-500/30"
                                  onClick={() => doGrant(r.email)}
                                  disabled={!!actionLoading[r.email + "_grant"]}
                                  data-testid={`button-og-activate-${r.email}`}>
                                  {actionLoading[r.email + "_grant"] ? "…" : "Grant OG"}
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                                onClick={() => doEmail(r.email, r.hasAccount)}
                                disabled={!!actionLoading[r.email + "_email"]}
                                data-testid={`button-og-email-${r.email}`}>
                                {actionLoading[r.email + "_email"] ? "…" : <Mail className="h-3 w-3" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No paid OG sessions found in Stripe.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── JAC Voice Debug Tab ───────────────────────────────────────────────────────
function JacVoiceDebugTab() {
  const [info, setInfo] = useState<VoiceDebugInfo | null>(null);
  const [override, setOverride] = useState(() => {
    try { return localStorage.getItem("jac_voice_override") ?? ""; } catch { return ""; }
  });
  const [testText, setTestText] = useState("Hi — I'm Jack, your Goober Job Assisting Coordinator! Day One Oh Gee members get priority access.");
  const [pregenStatus, setPregenStatus] = useState<Record<string, string> | null>(null);
  const [pregenLoading, setPregenLoading] = useState(false);
  const { toast } = useToast();

  function refresh() {
    loadJacVoice().then(() => setInfo(getVoiceDebugInfo()));
  }

  useEffect(() => { refresh(); }, []);

  async function runPregen() {
    setPregenLoading(true);
    setPregenStatus(null);
    try {
      const res = await fetch("/api/jac/tts/pregen", { method: "POST" });
      const data = await res.json();
      if (data.results) {
        setPregenStatus(data.results);
        toast({ title: "Pre-generation complete" });
      } else {
        toast({ title: "Error", description: data.message || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPregenLoading(false);
    }
  }

  function applyOverride() {
    try {
      if (override.trim()) localStorage.setItem("jac_voice_override", override.trim());
      else localStorage.removeItem("jac_voice_override");
    } catch {}
    resetJacVoiceCache();
    loadJacVoice().then(() => {
      const d = getVoiceDebugInfo();
      setInfo(d);
      toast({ title: `JAC voice updated: "${d.activeVoiceName}"` });
    });
  }

  function testSpeak() {
    if (!("speechSynthesis" in window) || !info) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(testText);
    const v = window.speechSynthesis.getVoices().find(
      (x) => x.voiceURI === info.activeVoiceId || x.name === info.activeVoiceName
    );
    if (v) utt.voice = v;
    utt.lang = "en-US";
    utt.rate = 1.05;
    utt.pitch = 1.1;
    window.speechSynthesis.speak(utt);
  }

  const Row = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex gap-2 items-start text-xs">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className={mono ? "font-mono font-semibold break-all" : "font-semibold"}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Status card ── */}
      {info ? (
        <Card className={
          info.targetFound
            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
            : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              {info.targetFound ? "✓ Target voice active" : "⚠ Target voice NOT available — fallback in use"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Row label="TTS Provider"      value={info.provider} />
            <Row label="Requested voice"   value={info.requestedVoice} />
            <Row label="Target found"      value={info.targetFound ? "YES" : "NO — not in browser voice list"} />
            <Row label="Active voice name" value={info.activeVoiceName} />
            <Row label="Active voice ID"   value={info.activeVoiceId} />
            <Row label="Active lang"       value={info.activeLang} />
            <Row label="Fallback used"     value={info.fallbackUsed ? "YES" : "NO"} />
            <Row label="Voices available"  value={String(info.allVoices.length)} mono={false} />
            {!info.targetFound && (
              <p className="text-[11px] text-yellow-700 dark:text-yellow-400 pt-1">
                "{JAC_TARGET_VOICE}" was not found. Check the voice list below — click "use" on any row to set an override, or see DevTools console for the full dump.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-4 text-xs text-muted-foreground">Loading voice info…</CardContent></Card>
      )}

      {/* ── ElevenLabs pre-cache ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ElevenLabs Cache — Pre-generate Top 20 Clips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Generates static MP3s in <code className="font-mono">/jac-audio/</code> for the 20 most common JAC responses.
            These play instantly with zero API cost. Already-generated clips are skipped.
          </p>
          <Button size="sm" onClick={runPregen} disabled={pregenLoading} data-testid="button-jac-pregen">
            {pregenLoading ? "Generating…" : "Generate Cache Now"}
          </Button>
          {pregenStatus && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 text-[11px] font-mono mt-2">
              {Object.entries(pregenStatus).map(([key, status]) => (
                <div key={key} className="flex gap-2">
                  <span className={`w-28 shrink-0 ${status === "generated" ? "text-green-600" : status.startsWith("error") ? "text-red-500" : "text-muted-foreground"}`}>{status}</span>
                  <span>{key}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pronunciation overrides reference ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Active Pronunciation Overrides</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
            {[
              ["5-digit zip (e.g. 27405)", "2 7 4 0 5"],
              ["Day-1 OG", "Day One Oh Gee"],
              ["OG", "Oh Gee"],
              ["JAC", "Jack"],
              ["GUBER", "Goober"],
            ].map(([from, to]) => (
              <div key={from} className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">{from}</span>
                <span>→ {to}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Test TTS ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Test JAC Voice (with pronunciation overrides)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="text-sm"
            data-testid="input-jac-voice-test"
          />
          <Button size="sm" onClick={testSpeak} data-testid="button-jac-voice-play">
            <Volume2 className="w-3 h-3 mr-1" /> Play
          </Button>
        </CardContent>
      </Card>

      {/* ── Override ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Voice Override (Admin)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste an exact voice name or voice ID from the list below. Leave blank to use auto-selection. Saved to localStorage.
          </p>
          <div className="flex gap-2">
            <Input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="e.g. Google UK English Female"
              className="text-xs font-mono"
              data-testid="input-jac-voice-override"
            />
            <Button size="sm" onClick={applyOverride} data-testid="button-jac-voice-override-apply">Apply</Button>
            <Button size="sm" variant="ghost" onClick={() => { setOverride(""); }} data-testid="button-jac-voice-clear">Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── All voices ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>All Available Voices ({info?.allVoices.length ?? "…"})</span>
            <button className="text-[10px] underline text-primary" onClick={refresh}>Refresh</button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!info || info.allVoices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No voices loaded yet — click Refresh or Play to trigger loading.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-0.5 text-[11px] font-mono">
              {/* Header */}
              <div className="grid grid-cols-[60px_1fr_minmax(0,1.5fr)_40px] gap-1 px-1.5 py-1 text-[9px] text-muted-foreground uppercase tracking-wide border-b">
                <span>Lang</span><span>Name</span><span>Voice ID (voiceURI)</span><span></span>
              </div>
              {info.allVoices.map((v) => {
                const isActive = v.voiceId === info.activeVoiceId;
                const isTarget = v.name === JAC_TARGET_VOICE;
                return (
                  <div
                    key={v.voiceId}
                    className={`grid grid-cols-[60px_1fr_minmax(0,1.5fr)_40px] gap-1 items-center px-1.5 py-1 rounded ${isActive ? "bg-primary/10 font-bold" : "hover:bg-muted/40"}`}
                    data-testid={`voice-row-${v.name.replace(/\s+/g, "-")}`}
                  >
                    <span className="text-muted-foreground truncate">{v.lang}</span>
                    <span className="truncate">{v.name}</span>
                    <span className="truncate text-muted-foreground">{v.voiceId}</span>
                    <div className="flex gap-1 items-center justify-end shrink-0">
                      {isActive && <Badge variant="outline" className="text-[8px] px-1 py-0">ACTIVE</Badge>}
                      {isTarget && <Badge className="text-[8px] px-1 py-0 bg-green-500">TARGET</Badge>}
                      <button
                        className="text-[9px] underline text-primary"
                        onClick={() => setOverride(v.name)}
                      >use</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <JacVoiceUsageTab />
    </div>
  );
}

type JacVoiceUsageRow = {
  id: number; date: string; userId: number | null; userEmail: string; feature: string; type: string;
  provider: string; voiceId: string | null; units: number; estimatedCostUsd: number; success: boolean; errorMessage: string | null;
};
type JacVoiceUsageSummaryRow = { type: string; success: boolean; count: number; total_units: string | number };

function JacVoiceUsageTab() {
  const { data, isLoading, refetch, isFetching } = useQuery<{ usage: JacVoiceUsageRow[]; summary: JacVoiceUsageSummaryRow[] }>({
    queryKey: ["/api/admin/jac-voice-usage"],
  });

  const totalCost = (data?.usage ?? []).reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
  const totalCalls = data?.usage.length ?? 0;
  const failedCalls = (data?.usage ?? []).filter((r) => !r.success).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>ElevenLabs / JAC Voice Usage — Cost & Reliability Tracking</span>
          <button
            className="text-[10px] underline text-primary disabled:opacity-40"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-jac-usage-refresh"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading usage log…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Calls (last {totalCalls})</div>
                <div className="text-lg font-bold" data-testid="text-jac-usage-total-calls">{totalCalls}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Failures</div>
                <div className={`text-lg font-bold ${failedCalls > 0 ? "text-red-500" : ""}`} data-testid="text-jac-usage-failed-calls">{failedCalls}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Est. cost (shown page)</div>
                <div className="text-lg font-bold" data-testid="text-jac-usage-total-cost">${totalCost.toFixed(4)}</div>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto text-[11px] font-mono">
              <div className="grid grid-cols-[110px_1fr_90px_70px_60px_70px_1fr] gap-1 px-1.5 py-1 text-[9px] text-muted-foreground uppercase tracking-wide border-b sticky top-0 bg-background">
                <span>Date</span><span>User</span><span>Feature</span><span>Units</span><span>Cost</span><span>Status</span><span>Error</span>
              </div>
              {(data?.usage ?? []).map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[110px_1fr_90px_70px_60px_70px_1fr] gap-1 items-center px-1.5 py-1 rounded hover:bg-muted/40"
                  data-testid={`row-jac-usage-${r.id}`}
                >
                  <span className="text-muted-foreground truncate">{new Date(r.date).toLocaleString()}</span>
                  <span className="truncate">{r.userEmail}</span>
                  <span className="truncate">{r.feature}</span>
                  <span>{r.units}</span>
                  <span>${r.estimatedCostUsd.toFixed(4)}</span>
                  <span>
                    {r.success ? (
                      <Badge className="text-[8px] px-1 py-0 bg-green-500">OK</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[8px] px-1 py-0">FAIL</Badge>
                    )}
                  </span>
                  <span className="truncate text-red-500">{r.errorMessage ?? ""}</span>
                </div>
              ))}
              {(data?.usage ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No voice usage recorded yet.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CashDropDebuggerTab() {
  const [id, setId] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Cash Drop Debugger</CardTitle></CardHeader>
      <CardContent className="flex items-end gap-2">
        <Input placeholder="cash drop id" value={id} onChange={(e) => setId(e.target.value)} className="w-40" data-testid="input-debug-drop-id" />
        <Button asChild disabled={!id}><Link href={`/admin/qa/cashdrops/${id}/debug`}>Debug</Link></Button>
      </CardContent>
    </Card>
  );
}

type FeedbackReport = {
  id: number; user_id: number | null; user_email: string | null; username: string | null; full_name: string | null;
  platform: string | null; device_info: string | null; current_route: string | null;
  issue_category: string | null; user_description: string | null; jac_messages: Array<{role:string;content:string}>;
  status: string; admin_notes: string | null; created_at: string;
};

type SystemIssue = {
  id: number;
  fingerprint: string;
  user_id: number | null;
  platform: string;
  device: string | null;
  app_version: string | null;
  route: string | null;
  module: string;
  attempted_action: string | null;
  error_message: string | null;
  related_ids: Record<string, any> | null;
  severity: "low" | "medium" | "high" | "critical";
  blocked: boolean;
  steps: string[] | null;
  screenshot_url: string | null;
  gps_permission: string | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  status: "open" | "ack" | "resolved";
};

type IssuesSummary = {
  open: number; critical: number; high: number; blockedUsers: number;
  bySeverity: Record<string, number>;
  byPlatform: Record<string, number>;
  byModule: Array<{ module: string; count: number; occurrences: number }>;
  last24h: number;
};

function SystemIssuesTab() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { toast } = useToast();

  const summaryQ = useQuery<IssuesSummary>({
    queryKey: ["/api/admin/qa/issues/summary"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/qa/issues/summary")).json(),
  });

  const listQ = useQuery<{ issues: SystemIssue[] }>({
    queryKey: ["/api/admin/qa/issues", statusFilter, severityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const qs = params.toString();
      return (await apiRequest("GET", `/api/admin/qa/issues${qs ? `?${qs}` : ""}`)).json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await apiRequest("PATCH", `/api/admin/qa/issues/${id}/status`, { status })).json(),
    onSuccess: () => {
      listQ.refetch(); summaryQ.refetch();
      toast({ title: "Issue updated" });
    },
    onError: () => toast({ title: "Error", description: "Could not update issue", variant: "destructive" }),
  });

  const SEV_COLORS: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-gray-100 text-gray-600 border-gray-300",
  };
  const STATUS_COLORS: Record<string, string> = {
    open: "bg-blue-100 text-blue-800",
    ack: "bg-purple-100 text-purple-800",
    resolved: "bg-green-100 text-green-800",
  };

  const summary = summaryQ.data;
  const issues = listQ.data?.issues ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card><CardContent className="p-3"><div className="text-2xl font-bold" data-testid="stat-issues-open">{summary?.open ?? "—"}</div><div className="text-xs text-muted-foreground">Open</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-red-600" data-testid="stat-issues-critical">{summary?.critical ?? "—"}</div><div className="text-xs text-muted-foreground">Critical</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-orange-600" data-testid="stat-issues-high">{summary?.high ?? "—"}</div><div className="text-xs text-muted-foreground">High</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold" data-testid="stat-issues-blocked">{summary?.blockedUsers ?? "—"}</div><div className="text-xs text-muted-foreground">Blocking users</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold" data-testid="stat-issues-24h">{summary?.last24h ?? "—"}</div><div className="text-xs text-muted-foreground">Last 24h</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Siren className="h-4 w-4" /> System Issues — JAC Guardian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-issue-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="ack">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36" data-testid="select-issue-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { listQ.refetch(); summaryQ.refetch(); }} data-testid="button-refresh-issues">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <span className="text-sm text-muted-foreground">{issues.length} issue(s)</span>
          </div>

          {listQ.isLoading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
          {!listQ.isLoading && issues.length === 0 && <div className="text-sm text-muted-foreground py-4">No issues 🎉</div>}

          <div className="space-y-2">
            {issues.map((it) => (
              <Card key={it.id} className={`border ${it.severity === "critical" ? "border-red-300" : ""}`} data-testid={`card-issue-${it.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge className={SEV_COLORS[it.severity] || ""} data-testid={`badge-issue-severity-${it.id}`}>{it.severity}</Badge>
                      <Badge variant="outline">{it.module}</Badge>
                      <Badge variant="outline">{it.platform}</Badge>
                      {it.blocked && <Badge className="bg-red-100 text-red-800">blocked</Badge>}
                      <Badge className={STATUS_COLORS[it.status] || ""}>{it.status}</Badge>
                      {it.occurrence_count > 1 && <span className="text-xs text-muted-foreground">×{it.occurrence_count}</span>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)} data-testid={`button-expand-issue-${it.id}`}>
                      {expandedId === it.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="text-sm font-medium" data-testid={`text-issue-message-${it.id}`}>{it.error_message || it.attempted_action || "(no message)"}</div>
                  <div className="text-xs text-muted-foreground">last seen {new Date(it.last_seen).toLocaleString()}</div>

                  {expandedId === it.id && (
                    <div className="mt-2 space-y-2 border-t pt-2 text-xs">
                      {it.attempted_action && <div><span className="font-semibold">Action:</span> {it.attempted_action}</div>}
                      {it.route && <div><span className="font-semibold">Route:</span> {it.route}</div>}
                      {it.device && <div><span className="font-semibold">Device:</span> {it.device}</div>}
                      {it.app_version && <div><span className="font-semibold">App version:</span> {it.app_version}</div>}
                      {it.gps_permission && <div><span className="font-semibold">GPS permission:</span> {it.gps_permission}</div>}
                      {it.user_id != null && <div><span className="font-semibold">User:</span> #{it.user_id}</div>}
                      {it.related_ids && Object.keys(it.related_ids).length > 0 && (
                        <div><span className="font-semibold">Related:</span> {Object.entries(it.related_ids).map(([k, v]) => `${k}=${v}`).join(", ")}</div>
                      )}
                      {Array.isArray(it.steps) && it.steps.length > 0 && (
                        <div><span className="font-semibold">Steps:</span>
                          <ol className="list-decimal ml-5">{it.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                        </div>
                      )}
                      <div><span className="font-semibold">Fingerprint:</span> {it.fingerprint.slice(0, 12)}</div>
                      <div><span className="font-semibold">First seen:</span> {new Date(it.first_seen).toLocaleString()}</div>
                      {it.screenshot_url && <div><a className="text-blue-600 underline" href={it.screenshot_url} target="_blank" rel="noreferrer">screenshot</a></div>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {it.status !== "ack" && <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: it.id, status: "ack" })} disabled={statusMutation.isPending} data-testid={`button-ack-issue-${it.id}`}>Acknowledge</Button>}
                    {it.status !== "resolved" && <Button size="sm" onClick={() => statusMutation.mutate({ id: it.id, status: "resolved" })} disabled={statusMutation.isPending} data-testid={`button-resolve-issue-${it.id}`}>Resolve</Button>}
                    {it.status === "resolved" && <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: it.id, status: "open" })} disabled={statusMutation.isPending} data-testid={`button-reopen-issue-${it.id}`}>Reopen</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JacReportsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<number,string>>({});
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ reports: FeedbackReport[] }>({
    queryKey: ["/api/admin/jac/reports", statusFilter],
    queryFn: async () => {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const r = await apiRequest("GET", `/api/admin/jac/reports${qs}`);
      return r.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status?: string; adminNotes?: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/jac/reports/${id}`, { status, adminNotes });
      return r.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Updated" }); },
    onError: () => toast({ title: "Error", description: "Could not update report", variant: "destructive" }),
  });

  const STATUS_COLORS: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    reviewed: "bg-yellow-100 text-yellow-800",
    fixed: "bg-green-100 text-green-800",
    dismissed: "bg-gray-100 text-gray-600",
  };
  const CATEGORY_LABELS: Record<string, string> = {
    mic_failure: "🎤 Mic Failure", voice_failure: "🔊 Voice Failure",
    listing_interruption: "📋 Listing", payment_issue: "💳 Payment",
    gps_issue: "📍 GPS", form_problem: "📝 Form", app_bug: "🐛 Bug", general: "💬 General",
  };

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> JAC Feedback Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-report-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
            <span className="text-sm text-muted-foreground">{reports.length} report(s)</span>
          </div>

          {isLoading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
          {!isLoading && reports.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No reports found.</div>
          )}

          <div className="space-y-2">
            {reports.map((r) => (
              <Card key={r.id} className="border" data-testid={`card-report-${r.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100"}`}>
                        {r.status}
                      </span>
                      <span className="font-medium">{CATEGORY_LABELS[r.issue_category ?? "general"] ?? r.issue_category}</span>
                      <span className="text-muted-foreground">{r.platform ?? "unknown platform"}</span>
                      {r.full_name && <span className="text-muted-foreground">· {r.full_name}</span>}
                      {r.user_email && <span className="text-muted-foreground text-xs">{r.user_email}</span>}
                      <span className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                      {expandedId === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {r.user_description && (
                    <p className="text-sm italic text-muted-foreground">"{r.user_description}"</p>
                  )}

                  {expandedId === r.id && (
                    <div className="space-y-3 border-t pt-2 mt-2">
                      {r.current_route && (
                        <p className="text-xs text-muted-foreground">Route: <code>{r.current_route}</code></p>
                      )}
                      {(r.jac_messages ?? []).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Conversation:</p>
                          <div className="max-h-48 overflow-y-auto space-y-1 rounded border p-2 bg-muted/30">
                            {(r.jac_messages ?? []).map((m, i) => (
                              <div key={i} className={`text-xs p-1 rounded ${m.role === "user" ? "bg-blue-50 dark:bg-blue-900/30" : "bg-gray-50 dark:bg-gray-800/30"}`}>
                                <span className="font-semibold">{m.role === "user" ? "User" : "JAC"}:</span> {m.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-48">
                          <Input
                            placeholder="Admin notes…"
                            value={noteInputs[r.id] ?? r.admin_notes ?? ""}
                            onChange={(e) => setNoteInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                            data-testid={`input-notes-${r.id}`}
                          />
                        </div>
                        <Select
                          value={r.status}
                          onValueChange={(v) => patchMutation.mutate({ id: r.id, status: v, adminNotes: noteInputs[r.id] })}
                        >
                          <SelectTrigger className="w-36" data-testid={`select-status-${r.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="reviewed">Reviewed</SelectItem>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="dismissed">Dismissed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => patchMutation.mutate({ id: r.id, adminNotes: noteInputs[r.id] })}>
                          Save Note
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CommerceModeTab() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<{ mode: string }>({
    queryKey: ["/api/commerce-mode"],
    staleTime: 10_000,
  });
  const { data: log } = useQuery<{ id: number; previous_mode: string; new_mode: string; changed_at: string; admin_email: string }[]>({
    queryKey: ["/api/admin/commerce-mode/log"],
  });

  const setMode = useMutation({
    mutationFn: (mode: string) => apiRequest("PUT", "/api/admin/commerce-mode", { mode }).then((r) => r.json()),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/commerce-mode"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commerce-mode/log"] });
      toast({ title: "Commerce Mode Updated", description: `Now: ${d.mode}` });
    },
    onError: () => toast({ title: "Error", description: "Could not update mode", variant: "destructive" }),
  });

  const MODES = [
    { value: "HIDDEN", label: "HIDDEN", desc: "All commerce UI concealed. No prices, no buttons.", color: "bg-red-100 text-red-800" },
    { value: "EARNED_CREDITS_ONLY", label: "EARNED CREDITS ONLY", desc: "iOS production mode. Credits earned through work only — no purchases.", color: "bg-amber-100 text-amber-800" },
    { value: "FULL_COMMERCE", label: "FULL COMMERCE", desc: "Complete purchase/subscription experience enabled.", color: "bg-green-100 text-green-800" },
  ];

  const current = data?.mode ?? "EARNED_CREDITS_ONLY";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Commerce Mode Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg p-3 bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <strong>⚠ iOS Production Default:</strong> EARNED_CREDITS_ONLY. Never set FULL_COMMERCE on the iOS store build — it would violate App Store guideline 3.1.1. FULL_COMMERCE is for web-only or Android deployments.
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-2">
              {MODES.map((m) => (
                <div
                  key={m.value}
                  className={`rounded-lg border p-3 flex items-center justify-between gap-3 transition-all ${current === m.value ? "border-primary/50 bg-primary/5" : "border-border"}`}
                  data-testid={`card-commerce-mode-${m.value.toLowerCase()}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${m.color}`}>{m.label}</span>
                      {current === m.value && <Badge variant="outline" className="text-xs">ACTIVE</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={current === m.value ? "default" : "outline"}
                    disabled={current === m.value || setMode.isPending}
                    onClick={() => setMode.mutate(m.value)}
                    data-testid={`button-set-commerce-mode-${m.value.toLowerCase()}`}
                  >
                    {current === m.value ? "Active" : "Set"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={() => refetch()}>Refresh</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Change Log</CardTitle></CardHeader>
        <CardContent>
          {!log || log.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {log.map((entry) => (
                <div key={entry.id} className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-mono">{new Date(entry.changed_at).toLocaleString()}</span>
                  <span>{entry.previous_mode} → <strong>{entry.new_mode}</strong></span>
                  <span className="text-foreground/50">by {entry.admin_email ?? `admin #${entry.id}`}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminQa() {
  return (
    <div className="container mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6" /> QA Dashboard
        </h1>
        <Button asChild variant="outline"><Link href="/admin">← Back to admin</Link></Button>
      </div>

      <Tabs defaultValue={(() => { try { return new URLSearchParams(window.location.search).get("tab") || "checklist"; } catch { return "checklist"; } })()}>
        <TabsList className="overflow-x-auto w-full flex-nowrap justify-start h-auto">
          <TabsTrigger value="checklist" data-testid="tab-checklist"><CheckCircle className="mr-1 h-3 w-3" />Checklist</TabsTrigger>
          <TabsTrigger value="sandbox" data-testid="tab-sandbox"><Beaker className="mr-1 h-3 w-3" />Sandbox</TabsTrigger>
          <TabsTrigger value="allowlist" data-testid="tab-allowlist"><AlertTriangle className="mr-1 h-3 w-3" />Live Allowlist</TabsTrigger>
          <TabsTrigger value="inspector" data-testid="tab-inspector"><Eye className="mr-1 h-3 w-3" />Inspector</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users"><UsersIcon className="mr-1 h-3 w-3" />Users</TabsTrigger>
          <TabsTrigger value="cashdrops" data-testid="tab-cashdrops"><Bug className="mr-1 h-3 w-3" />Cash Drop Debug</TabsTrigger>
          <TabsTrigger value="flags" data-testid="tab-flags"><Flag className="mr-1 h-3 w-3" />Feature Flags</TabsTrigger>
          <TabsTrigger value="founders" data-testid="tab-founders"><ShieldCheck className="mr-1 h-3 w-3" />Founders Club</TabsTrigger>
          <TabsTrigger value="push" data-testid="tab-push"><Bell className="mr-1 h-3 w-3" />Push Log</TabsTrigger>
          <TabsTrigger value="orphan-sweep" data-testid="tab-orphan-sweep"><Trash2 className="mr-1 h-3 w-3" />Orphan Sweep</TabsTrigger>
          <TabsTrigger value="studio-usage" data-testid="tab-studio-usage"><Activity className="mr-1 h-3 w-3" />Studio Usage</TabsTrigger>
          <TabsTrigger value="studio-tiles" data-testid="tab-studio-tiles"><ImageIcon className="mr-1 h-3 w-3" />Studio Tiles</TabsTrigger>
          <TabsTrigger value="featured-clips" data-testid="tab-featured-clips"><Film className="mr-1 h-3 w-3" />Trends Rail</TabsTrigger>
          <TabsTrigger value="growth-engine" data-testid="tab-growth-engine">🌱 Growth Engine</TabsTrigger>
          <TabsTrigger value="jac-voice" data-testid="tab-jac-voice"><Volume2 className="mr-1 h-3 w-3" />JAC Voice</TabsTrigger>
          <TabsTrigger value="jac-reports" data-testid="tab-jac-reports"><FileText className="mr-1 h-3 w-3" />JAC Reports</TabsTrigger>
          <TabsTrigger value="og-audit" data-testid="tab-og-audit"><Crown className="mr-1 h-3 w-3 text-amber-500" />OG Audit</TabsTrigger>
          <TabsTrigger value="system-issues" data-testid="tab-system-issues"><Siren className="mr-1 h-3 w-3 text-red-500" />System Issues</TabsTrigger>
          <TabsTrigger value="commerce-mode" data-testid="tab-commerce-mode">🛒 Commerce Mode</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist"><ChecklistTab /></TabsContent>
        <TabsContent value="sandbox"><SandboxTab /></TabsContent>
        <TabsContent value="allowlist"><AllowlistTab /></TabsContent>
        <TabsContent value="inspector"><InspectorTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="cashdrops"><CashDropDebuggerTab /></TabsContent>
        <TabsContent value="flags">
          <Card>
            <CardHeader><CardTitle>Feature Flags</CardTitle></CardHeader>
            <CardContent>
              <Button asChild><Link href="/admin/qa/flags">Open Feature Flag Console</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="founders"><FoundersTab /></TabsContent>
        <TabsContent value="push">
          <Card>
            <CardHeader><CardTitle>Push Delivery Log</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">Per-attempt log of every server-initiated push (APNs / FCM / Web Push) with success/error codes. Use to verify "did this user actually get notified?" when something looks wrong.</p>
              <Button asChild><Link href="/admin/qa/push">Open Push Log</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orphan-sweep"><OrphanSweepTab /></TabsContent>
        <TabsContent value="studio-usage"><StudioUsageTab /></TabsContent>
        <TabsContent value="studio-tiles"><StudioTilesTab /></TabsContent>
        <TabsContent value="featured-clips"><FeaturedClipsTab /></TabsContent>
        <TabsContent value="growth-engine">
          <Card>
            <CardHeader><CardTitle>Growth Engine</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">Manage ZIP-based fallback community tasks, reward configs, and completion logs. Enable via the <strong>zip_fallback_growth_tasks</strong> feature flag.</p>
              <Button asChild><Link href="/admin/growth-engine">Open Growth Engine</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="jac-voice"><JacVoiceDebugTab /></TabsContent>
        <TabsContent value="jac-reports"><JacReportsTab /></TabsContent>
        <TabsContent value="og-audit"><OGAuditTab /></TabsContent>
        <TabsContent value="system-issues"><SystemIssuesTab /></TabsContent>
        <TabsContent value="commerce-mode"><CommerceModeTab /></TabsContent>
      </Tabs>
    </div>
  );
}
