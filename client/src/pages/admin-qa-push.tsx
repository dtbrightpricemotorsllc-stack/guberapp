import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { UserLink } from "@/components/user-link";
import { ArrowLeft, CheckCircle2, XCircle, Bell } from "lucide-react";

type LogRow = {
  id: number;
  userId: number;
  channel: "apns" | "fcm" | "webpush";
  success: boolean;
  errorCode: string | null;
  title: string | null;
  tag: string | null;
  sentAt: string;
};

type Resp = {
  rows: LogRow[];
  summary: Record<string, { success: number; failed: number }>;
  tokens: Record<string, { n: number; u: number }>;
};

function ChannelBadge({ c }: { c: string }) {
  const color =
    c === "apns" ? "bg-slate-200 text-slate-800"
      : c === "fcm" ? "bg-emerald-100 text-emerald-800"
      : "bg-blue-100 text-blue-800";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>{c}</span>;
}

export default function AdminQaPush() {
  const [userId, setUserId] = useState("");
  const [channel, setChannel] = useState<string>("all");
  const [onlyFailed, setOnlyFailed] = useState(false);

  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (channel !== "all") params.set("channel", channel);
  if (onlyFailed) params.set("onlyFailed", "true");
  const qs = params.toString();
  const key = `/api/admin/qa/push-log${qs ? `?${qs}` : ""}`;

  const { data, isLoading, isError, error, refetch } = useQuery<Resp>({ queryKey: [key] });

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/qa"><Button size="sm" variant="ghost" data-testid="link-back-qa"><ArrowLeft className="mr-1 h-4 w-4" /> QA</Button></Link>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Bell className="h-5 w-5" /> Push Delivery Log</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(["apns", "fcm", "webpush"] as const).map((ch) => {
          const s = data?.summary?.[ch] || { success: 0, failed: 0 };
          const t = data?.tokens?.[ch] || { n: 0, u: 0 };
          return (
            <Card key={ch} data-testid={`card-channel-${ch}`}>
              <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm uppercase tracking-wide"><span>{ch}</span><ChannelBadge c={ch} /></CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="h-4 w-4" /> <span className="font-medium">{s.success}</span> sent (24h)</div>
                <div className="flex items-center gap-2 text-red-700"><XCircle className="h-4 w-4" /> <span className="font-medium">{s.failed}</span> failed (24h)</div>
                <div className="text-xs text-muted-foreground pt-1">{t.n} tokens · {t.u} users registered</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">User ID</label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 42" className="w-32" data-testid="input-user-id" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Channel</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-36" data-testid="select-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="apns">APNs (iOS)</SelectItem>
                <SelectItem value="fcm">FCM (Android)</SelectItem>
                <SelectItem value="webpush">Web Push</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} data-testid="checkbox-only-failed" />
            Only failed
          </label>
          <Button size="sm" onClick={() => refetch()} data-testid="button-refresh">Refresh</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent attempts {data?.rows ? `(${data.rows.length})` : ""}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm">Loading…</div>
          ) : isError ? (
            <div className="p-4 text-sm text-red-700" data-testid="text-error">
              Failed to load push log: {(error as Error)?.message || "unknown error"}
            </div>
          ) : !data?.rows.length ? (
            <div className="p-4 text-sm text-muted-foreground">No push attempts match these filters.</div>
          ) : (
            <ul className="divide-y">
              {data.rows.map((r) => (
                <li key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm" data-testid={`row-push-${r.id}`}>
                  <div className="col-span-2 text-xs text-muted-foreground">{new Date(r.sentAt).toLocaleString()}</div>
                  <div className="col-span-1"><ChannelBadge c={r.channel} /></div>
                  <div className="col-span-1">
                    {r.success
                      ? <Badge className="bg-green-100 text-green-800">ok</Badge>
                      : <Badge className="bg-red-100 text-red-800">fail</Badge>}
                  </div>
                  <div className="col-span-2"><UserLink userId={r.userId} label={`#${r.userId}`} /></div>
                  <div className="col-span-4 truncate" title={r.title || ""}>{r.title || <span className="text-muted-foreground">—</span>}</div>
                  <div className="col-span-2 truncate text-xs text-muted-foreground" title={(r.tag || "") + (r.errorCode ? ` · ${r.errorCode}` : "")}>
                    {r.tag && <span className="mr-1">{r.tag}</span>}
                    {r.errorCode && <span className="text-red-700">{r.errorCode}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
