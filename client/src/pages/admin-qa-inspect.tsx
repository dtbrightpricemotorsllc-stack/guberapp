import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaLightbox } from "@/components/media-lightbox";
import { UserLink } from "@/components/user-link";
import { ChevronLeft } from "lucide-react";

export default function AdminQaInspect() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const idN = parseInt(id || "0");
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/admin/qa/inspect/${type}/${idN}`],
  });

  const [persona, setPersona] = useState("admin");
  if (isLoading) return <div className="p-4">Loading…</div>;
  if (error || !data) return <div className="p-4">Not found.</div>;

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <Button asChild variant="ghost" size="sm" className="mb-2"><Link href="/admin/qa"><ChevronLeft className="h-4 w-4" />QA</Link></Button>
      <h1 className="mb-4 text-2xl font-bold">Inspector · {type} #{idN}</h1>

      {type === "job" && (
        <>
          <Card className="mb-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Job · {data.job.title}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs">View as:</span>
                <Select value={persona} onValueChange={setPersona}>
                  <SelectTrigger className="w-48" data-testid="select-view-as"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["loggedOut", "stranger", "helperUnassigned", "helperAssigned", "hirer", "admin"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">
                Status: <Badge>{data.job.status}</Badge> · Visibility: <Badge variant="outline">{data.job.visibility}</Badge>
                {data.job.isTestJob && <Badge className="ml-2">TEST</Badge>}
                · Posted by <UserLink userId={data.job.postedById} />
                {data.job.assignedHelperId && <> · Helper <UserLink userId={data.job.assignedHelperId} /></>}
              </div>
              <pre className="max-h-[40vh] overflow-auto rounded bg-muted p-2 text-xs" data-testid="text-rendered-payload">
                {JSON.stringify(data.renders[persona], null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card className="mb-3">
            <CardHeader><CardTitle>Proofs ({data.proofs?.length || 0})</CardTitle></CardHeader>
            <CardContent><ul className="divide-y text-sm">
              {data.proofs?.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/admin/qa/inspect/proof/${p.id}`} className="underline">proof #{p.id}</Link>
                    {p.captureMeta?.deviceKind && <Badge variant="outline" className="ml-2">{p.captureMeta.deviceKind}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {p.videoUrl && <MediaLightbox url={p.videoUrl} label="video" />}
                    {(() => { try { const arr = JSON.parse(p.imageUrls || "[]"); return arr.map((u: string, i: number) => <MediaLightbox key={i} url={u} label={`img ${i + 1}`} />); } catch { return null; } })()}
                  </div>
                </li>
              ))}
            </ul></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Status log</CardTitle></CardHeader>
            <CardContent><pre className="max-h-[40vh] overflow-auto text-xs">{JSON.stringify(data.statusLog, null, 2)}</pre></CardContent>
          </Card>
        </>
      )}

      {type === "proof" && (
        <Card>
          <CardHeader><CardTitle>Proof #{data.proof.id} · job #{data.proof.jobId}</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              {data.proof.videoUrl && <MediaLightbox url={data.proof.videoUrl} label="video" />}
              {(() => { try { const arr = JSON.parse(data.proof.imageUrls || "[]"); return arr.map((u: string, i: number) => <MediaLightbox key={i} url={u} label={`img ${i + 1}`} />); } catch { return null; } })()}
            </div>
            <pre className="overflow-auto text-xs">{JSON.stringify(data.proof, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {type === "cashdrop" && (
        <>
          <Card className="mb-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cash Drop #{data.drop.id} · {data.drop.title}</CardTitle>
              <Button asChild variant="outline" size="sm"><Link href={`/admin/qa/cashdrops/${data.drop.id}/debug`}>Open debugger →</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="text-xs">Status: <Badge>{data.drop.status}</Badge> · Visibility: <Badge variant="outline">{data.drop.visibility}</Badge>
                {data.drop.isTestDrop && <Badge className="ml-2">TEST</Badge>}
              </div>
              <pre className="mt-2 max-h-[40vh] overflow-auto text-xs">{JSON.stringify(data.drop, null, 2)}</pre>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Attempts ({data.attempts?.length || 0})</CardTitle></CardHeader>
            <CardContent><pre className="max-h-[30vh] overflow-auto text-xs">{JSON.stringify(data.attempts, null, 2)}</pre></CardContent>
          </Card>
        </>
      )}

      {type === "user" && (
        <Card>
          <CardHeader><CardTitle><UserLink userId={data.user.id} label={data.user.fullName} /></CardTitle></CardHeader>
          <CardContent>
            <Button asChild className="mb-2"><Link href={`/admin/users/${data.user.id}`}>Open full profile →</Link></Button>
            <pre className="overflow-auto text-xs">{JSON.stringify(data.user, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
