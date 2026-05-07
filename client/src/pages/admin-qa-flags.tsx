import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";

export default function AdminQaFlags() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ flags: any[] }>({ queryKey: ["/api/admin/qa/flags"] });
  const update = useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: any }) =>
      apiRequest("PATCH", `/api/admin/qa/flags/${key}`, patch).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Flag updated" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/qa/flags"] }); queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4">Loading…</div>;

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <Button asChild variant="ghost" size="sm" className="mb-2"><Link href="/admin/qa"><ChevronLeft className="h-4 w-4" />QA</Link></Button>
      <h1 className="mb-4 text-2xl font-bold">Feature Flag Console</h1>

      <div className="space-y-3">
        {data?.flags.map((def) => {
          const c = def.current || { enabled: def.defaultEnabled, rolloutScope: def.defaultScope, allowedRoles: [], allowedUserIds: [], note: "" };
          return (
            <Card key={def.key} data-testid={`card-flag-${def.key}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span><code>{def.key}</code> · {def.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.enabled ? "default" : "outline"}>{c.enabled ? "ON" : "OFF"}</Badge>
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => update.mutate({ key: def.key, patch: { enabled: v } })}
                      data-testid={`switch-flag-${def.key}`}
                    />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">{def.description}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs">Scope</label>
                  <Select value={c.rolloutScope} onValueChange={(v) => update.mutate({ key: def.key, patch: { rolloutScope: v } })}>
                    <SelectTrigger className="w-40" data-testid={`select-scope-${def.key}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["off", "global", "role", "allowlist"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {c.rolloutScope === "role" && (
                    <Input
                      placeholder="comma-separated roles"
                      defaultValue={(c.allowedRoles || []).join(",")}
                      onBlur={(e) => update.mutate({ key: def.key, patch: { allowedRoles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                      className="w-64"
                    />
                  )}
                  {c.rolloutScope === "allowlist" && (
                    <Input
                      placeholder="comma-separated user ids"
                      defaultValue={(c.allowedUserIds || []).join(",")}
                      onBlur={(e) => update.mutate({ key: def.key, patch: { allowedUserIds: e.target.value.split(",").map((s) => parseInt(s.trim())).filter(Number.isFinite) } })}
                      className="w-64"
                      data-testid={`input-allowlist-${def.key}`}
                    />
                  )}
                </div>
                {c.note && <div className="text-xs text-muted-foreground">note: {c.note}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
