import { useState } from "react";
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
import { AlertTriangle, CheckCircle, XCircle, Sparkles, Beaker, Flag, Bug, Users as UsersIcon, Eye, Search, Bell, Trash2, Activity } from "lucide-react";

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
type StudioUsageResponse = {
  generatedAt: string;
  totals24h: StudioUsageTotals;
  totals7d: StudioUsageTotals;
  perTool24h: StudioUsagePerTool[];
  perTool7d: StudioUsagePerTool[];
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

export default function AdminQa() {
  return (
    <div className="container mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6" /> QA Dashboard
        </h1>
        <Button asChild variant="outline"><Link href="/admin">← Back to admin</Link></Button>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList className="overflow-x-auto w-full flex-nowrap justify-start h-auto">
          <TabsTrigger value="checklist" data-testid="tab-checklist"><CheckCircle className="mr-1 h-3 w-3" />Checklist</TabsTrigger>
          <TabsTrigger value="sandbox" data-testid="tab-sandbox"><Beaker className="mr-1 h-3 w-3" />Sandbox</TabsTrigger>
          <TabsTrigger value="allowlist" data-testid="tab-allowlist"><AlertTriangle className="mr-1 h-3 w-3" />Live Allowlist</TabsTrigger>
          <TabsTrigger value="inspector" data-testid="tab-inspector"><Eye className="mr-1 h-3 w-3" />Inspector</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users"><UsersIcon className="mr-1 h-3 w-3" />Users</TabsTrigger>
          <TabsTrigger value="cashdrops" data-testid="tab-cashdrops"><Bug className="mr-1 h-3 w-3" />Cash Drop Debug</TabsTrigger>
          <TabsTrigger value="flags" data-testid="tab-flags"><Flag className="mr-1 h-3 w-3" />Feature Flags</TabsTrigger>
          <TabsTrigger value="push" data-testid="tab-push"><Bell className="mr-1 h-3 w-3" />Push Log</TabsTrigger>
          <TabsTrigger value="orphan-sweep" data-testid="tab-orphan-sweep"><Trash2 className="mr-1 h-3 w-3" />Orphan Sweep</TabsTrigger>
          <TabsTrigger value="studio-usage" data-testid="tab-studio-usage"><Activity className="mr-1 h-3 w-3" />Studio Usage</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
