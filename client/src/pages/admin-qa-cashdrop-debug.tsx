import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, AlertTriangle } from "lucide-react";

export default function AdminQaCashdropDebug() {
  const { id } = useParams<{ id: string }>();
  const idN = parseInt(id || "0");
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: [`/api/admin/qa/cashdrops/${idN}/debug`], refetchInterval: 5_000 });

  const replay = useMutation({
    mutationFn: ({ tool, body }: { tool: string; body?: any }) =>
      apiRequest("POST", `/api/admin/qa/cashdrops/${idN}/replay/${tool}`, body || {}).then((r) => r.json()),
    onSuccess: (_d, vars) => { toast({ title: `Replay ${vars.tool} ok` }); queryClient.invalidateQueries({ queryKey: [`/api/admin/qa/cashdrops/${idN}/debug`] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4">Loading…</div>;
  if (!data?.drop) return <div className="p-4">Cash drop not found.</div>;

  const expiringSoon = data.timing.msUntilExpiry !== null && data.timing.msUntilExpiry < 5 * 60_000;

  return (
    <div className="container mx-auto max-w-5xl p-4">
      <Button asChild variant="ghost" size="sm" className="mb-2"><Link href="/admin/qa"><ChevronLeft className="h-4 w-4" />QA</Link></Button>
      <h1 className="mb-3 text-2xl font-bold">Cash Drop #{data.drop.id} · debug</h1>

      <Card className="mb-3">
        <CardHeader><CardTitle>Expiration math</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Status: <Badge>{data.drop.status}</Badge></div>
          <div>Now: <code>{data.timing.now}</code></div>
          <div>Created: <code>{data.timing.createdAt}</code></div>
          <div>End time: <code>{data.timing.endTime || "—"}</code></div>
          <div>Closed at: <code>{data.timing.closedAt || "—"}</code></div>
          <div>ms until expiry: <code>{data.timing.msUntilExpiry ?? "—"}</code></div>
          {data.timing.cronWouldExpire && (
            <div className="rounded bg-yellow-100 p-2 text-yellow-900"><AlertTriangle className="inline h-3 w-3" /> Cron would expire this drop on next tick.</div>
          )}
          {expiringSoon && data.drop.status === "active" && (
            <div className="rounded bg-orange-100 p-2 text-orange-900">Expiring in &lt; 5 min.</div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader><CardTitle>Replay tools (audited)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { const m = prompt("Extend by minutes:", "60"); if (m) replay.mutate({ tool: "extend-expiry", body: { minutes: parseInt(m) } }); }} data-testid="button-extend-expiry">Extend expiry</Button>
          <Button size="sm" variant="outline" onClick={() => replay.mutate({ tool: "unexpire" })} data-testid="button-unexpire">Un-expire</Button>
          <Button size="sm" variant="outline" onClick={() => { if (confirm("Force expire now?")) replay.mutate({ tool: "force-expire" }); }} data-testid="button-force-expire">Force expire</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm("Cancel this drop?")) replay.mutate({ tool: "cancel" }); }} data-testid="button-cancel-drop">Cancel</Button>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader><CardTitle>Event timeline ({data.events?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {data.events?.map((e: any) => (
              <li key={e.id} className="py-2" data-testid={`event-${e.id}`}>
                <div className="flex justify-between">
                  <strong>{e.eventType}</strong>
                  <span className="text-xs text-muted-foreground">{e.createdAt?.slice(0, 19).replace("T", " ")}</span>
                </div>
                {e.reasonCode && <div className="text-xs">reason: <code>{e.reasonCode}</code> · source: {e.source || "—"}</div>}
                {e.payload && <pre className="mt-1 overflow-auto rounded bg-muted p-1 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>}
              </li>
            ))}
            {!data.events?.length && <li className="py-2 text-muted-foreground">No events yet — events accumulate as this drop transitions.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attempts ({data.attempts?.length || 0})</CardTitle></CardHeader>
        <CardContent><pre className="max-h-[30vh] overflow-auto text-xs">{JSON.stringify(data.attempts, null, 2)}</pre></CardContent>
      </Card>
    </div>
  );
}
