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
import { AlertTriangle, CheckCircle, XCircle, Sparkles, Beaker, Flag, Bug, Users as UsersIcon, Eye, Search } from "lucide-react";

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
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="checklist" data-testid="tab-checklist"><CheckCircle className="mr-1 h-3 w-3" />Checklist</TabsTrigger>
          <TabsTrigger value="sandbox" data-testid="tab-sandbox"><Beaker className="mr-1 h-3 w-3" />Sandbox</TabsTrigger>
          <TabsTrigger value="allowlist" data-testid="tab-allowlist"><AlertTriangle className="mr-1 h-3 w-3" />Live Allowlist</TabsTrigger>
          <TabsTrigger value="inspector" data-testid="tab-inspector"><Eye className="mr-1 h-3 w-3" />Inspector</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users"><UsersIcon className="mr-1 h-3 w-3" />Users</TabsTrigger>
          <TabsTrigger value="cashdrops" data-testid="tab-cashdrops"><Bug className="mr-1 h-3 w-3" />Cash Drop Debug</TabsTrigger>
          <TabsTrigger value="flags" data-testid="tab-flags"><Flag className="mr-1 h-3 w-3" />Feature Flags</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
