import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MediaLightbox } from "@/components/media-lightbox";
import { ChevronLeft } from "lucide-react";

export default function AdminUserProfile() {
  const { id } = useParams<{ id: string }>();
  const userId = parseInt(id || "0");
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/users", userId, "profile"], queryFn: async () => (await fetch(`/api/admin/users/${userId}/profile`)).json() });

  const action = useMutation({
    mutationFn: ({ act, body }: { act: string; body?: any }) =>
      apiRequest("POST", `/api/admin/users/${userId}/actions/${act}`, body || {}).then((r) => r.json()),
    onSuccess: (_d, vars) => { toast({ title: `Action ${vars.act} ok` }); queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "profile"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4">Loading…</div>;
  if (!data?.user) return <div className="p-4">User not found.</div>;
  const u = data.user;

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm"><Link href="/admin/qa"><ChevronLeft className="h-4 w-4" />QA</Link></Button>
          <h1 className="text-2xl font-bold">{u.fullName} <span className="text-sm text-muted-foreground">#{u.id}</span></h1>
          <div className="text-sm text-muted-foreground">{u.email} · {u.role} · {u.tier}{u.day1OG && " · OG"}{u.isTestUser && " · TEST"}</div>
          {(u.handsfreeBlockedAttempts ?? 0) > 0 && (
            <div className="mt-1">
              <Badge
                variant="outline"
                className="bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                data-testid="badge-handsfree-blocked-attempts"
              >
                {u.handsfreeBlockedAttempts} blocked hands-free upload{u.handsfreeBlockedAttempts === 1 ? "" : "s"}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {u.suspended ? (
            <Button size="sm" variant="outline" onClick={() => action.mutate({ act: "unsuspend" })}>Unsuspend</Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => { if (confirm("Suspend this user?")) action.mutate({ act: "suspend" }); }}>Suspend</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { if (confirm("Force log this user out?")) action.mutate({ act: "force-logout" }); }}>Force logout</Button>
          <Button size="sm" variant="outline" onClick={() => action.mutate({ act: u.isTestUser ? "unmark-test-user" : "mark-test-user" })}>{u.isTestUser ? "Unmark" : "Mark"} test</Button>
          <Button size="sm" variant="outline" onClick={() => { const c = prompt("Set studio credits to:", String(u.studioCredits ?? 0)); if (c != null) action.mutate({ act: "reset-studio-credits", body: { credits: parseInt(c) || 0 } }); }}>Studio credits</Button>
        </div>
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({(data.postedJobs?.length || 0) + (data.acceptedJobs?.length || 0)})</TabsTrigger>
          <TabsTrigger value="proofs">Proofs ({data.proofs?.length || 0})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({data.wallet?.length || 0})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({data.audits?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
          <Card><CardContent className="p-3"><pre className="overflow-auto text-xs">{JSON.stringify({
            id: u.id, email: u.email, phone: u.phone, role: u.role, tier: u.tier, day1OG: u.day1OG,
            createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
            stripeCustomerId: u.stripeCustomerId, stripeAccountId: u.stripeAccountId,
            studioCredits: u.studioCredits, studioTier: u.studioTier, suspended: u.suspended, banned: u.banned,
          }, null, 2)}</pre></CardContent></Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardHeader><CardTitle>ID & Selfie</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <div>idVerified: <Badge>{String(u.idVerified)}</Badge></div>
              <div>selfieVerified: <Badge>{String(u.selfieVerified)}</Badge></div>
              {u.idFrontUrl && <MediaLightbox url={u.idFrontUrl} label="ID front" />}
              {u.idBackUrl && <MediaLightbox url={u.idBackUrl} label="ID back" />}
              {u.selfieUrl && <MediaLightbox url={u.selfieUrl} label="Selfie" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader><CardTitle>Posted ({data.postedJobs?.length || 0})</CardTitle></CardHeader>
            <CardContent><ul className="divide-y text-sm">{data.postedJobs?.map((j: any) => (
              <li key={j.id} className="py-2"><Link href={`/admin/qa/inspect/job/${j.id}`} className="underline">#{j.id} · {j.title}</Link> — <span className="text-xs">{j.status}</span></li>
            ))}</ul></CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader><CardTitle>Accepted ({data.acceptedJobs?.length || 0})</CardTitle></CardHeader>
            <CardContent><ul className="divide-y text-sm">{data.acceptedJobs?.map((j: any) => (
              <li key={j.id} className="py-2"><Link href={`/admin/qa/inspect/job/${j.id}`} className="underline">#{j.id} · {j.title}</Link> — <span className="text-xs">{j.status}</span></li>
            ))}</ul></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proofs">
          <Card><CardContent className="p-3"><ul className="divide-y text-sm">{data.proofs?.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <Link href={`/admin/qa/inspect/proof/${p.id}`} className="underline">proof #{p.id}</Link>
                <span className="ml-2 text-xs">job #{p.jobId}</span>
                {p.captureMeta?.deviceKind && <Badge variant="outline" className="ml-2">{p.captureMeta.deviceKind}</Badge>}
              </div>
              <div className="flex gap-2">
                {p.videoUrl && <MediaLightbox url={p.videoUrl} label="video" />}
                {(() => { try { const arr = JSON.parse(p.imageUrls || "[]"); return arr.slice(0, 3).map((u: string, i: number) => <MediaLightbox key={i} url={u} label={`img ${i + 1}`} />); } catch { return null; } })()}
              </div>
            </li>
          ))}</ul></CardContent></Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card><CardContent className="p-3"><pre className="max-h-[60vh] overflow-auto text-xs">{JSON.stringify(data.wallet, null, 2)}</pre></CardContent></Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="p-3"><ul className="divide-y text-sm">{data.audits?.map((a: any) => (
            <li key={a.id} className="py-1"><span className="font-mono text-xs">{a.createdAt?.slice(0, 19).replace("T", " ")}</span> · <strong>{a.action}</strong> {a.details && <span className="text-xs text-muted-foreground"> {a.details.slice(0, 200)}</span>}</li>
          ))}</ul></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
