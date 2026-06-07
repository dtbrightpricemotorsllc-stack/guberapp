import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Pencil, Trash2, Plus, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

interface Template {
  id: number;
  emoji: string;
  title: string;
  description: string | null;
  reward_credits: number;
  reward_score: number;
  og_bonus_pct: number;
  category: string;
  is_active: boolean;
  paused: boolean;
  sort_order: number;
}

interface ZipSetting {
  id: number;
  scope: string;
  scope_value: string;
  enabled: boolean;
  show_when_real_jobs_exist: boolean;
  max_tasks_shown: number;
}

interface RewardConfig {
  key: string;
  valueInt: number;
  label: string;
  description: string | null;
}

interface Completion {
  id: number;
  user_id: number;
  template_id: number;
  emoji: string;
  title: string;
  zip: string;
  credits_awarded: number;
  score_awarded: number;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  username: string;
  email: string;
}

function TemplatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingTpl, setEditingTpl] = useState<Partial<Template> | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/growth-engine/templates"],
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Template>) =>
      data.id
        ? apiRequest("PATCH", `/api/admin/growth-engine/templates/${data.id}`, data)
        : apiRequest("POST", "/api/admin/growth-engine/templates", data),
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/templates"] });
      setEditingTpl(null);
    },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/growth-engine/templates/${id}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/templates"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, field, val }: { id: number; field: string; val: boolean }) =>
      apiRequest("PATCH", `/api/admin/growth-engine/templates/${id}`, { [field]: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/templates"] }),
  });

  const emptyTpl: Partial<Template> = {
    emoji: "📢", title: "", description: "", reward_credits: 25, reward_score: 50,
    og_bonus_pct: 25, category: "community", sort_order: 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button data-testid="button-add-template" size="sm" onClick={() => setEditingTpl(emptyTpl)}>
          <Plus className="w-4 h-4 mr-1" /> Add Task
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>OG %</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Paused</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(t => (
              <TableRow key={t.id} data-testid={`row-template-${t.id}`}>
                <TableCell>
                  <span className="mr-1">{t.emoji}</span>
                  <span className="font-medium">{t.title}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{t.category}</Badge>
                </TableCell>
                <TableCell>{t.reward_credits}</TableCell>
                <TableCell>{t.reward_score}</TableCell>
                <TableCell>+{t.og_bonus_pct}%</TableCell>
                <TableCell>
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={v => toggleMutation.mutate({ id: t.id, field: "isActive", val: v })}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={t.paused}
                    onCheckedChange={v => toggleMutation.mutate({ id: t.id, field: "paused", val: v })}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditingTpl(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirm("Delete this task template?") && deleteMutation.mutate(t.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editingTpl} onOpenChange={open => !open && setEditingTpl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTpl?.id ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          {editingTpl && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-20">
                  <Label>Emoji</Label>
                  <Input value={editingTpl.emoji ?? ""} onChange={e => setEditingTpl(p => ({ ...p!, emoji: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <Label>Title</Label>
                  <Input value={editingTpl.title ?? ""} onChange={e => setEditingTpl(p => ({ ...p!, title: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editingTpl.description ?? ""}
                  onChange={e => setEditingTpl(p => ({ ...p!, description: e.target.value }))}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Credits</Label>
                  <Input type="number" value={editingTpl.reward_credits ?? 25}
                    onChange={e => setEditingTpl(p => ({ ...p!, reward_credits: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Score</Label>
                  <Input type="number" value={editingTpl.reward_score ?? 50}
                    onChange={e => setEditingTpl(p => ({ ...p!, reward_score: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>OG Bonus %</Label>
                  <Input type="number" value={editingTpl.og_bonus_pct ?? 25}
                    onChange={e => setEditingTpl(p => ({ ...p!, og_bonus_pct: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={editingTpl.category ?? "community"}
                    onValueChange={v => setEditingTpl(p => ({ ...p!, category: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="community">Community</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="verify">Verify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editingTpl.sort_order ?? 0}
                    onChange={e => setEditingTpl(p => ({ ...p!, sort_order: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTpl(null)}>Cancel</Button>
            <Button
              data-testid="button-save-template"
              onClick={() => editingTpl && saveMutation.mutate(editingTpl)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ZipSettingsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newScope, setNewScope] = useState("zip");
  const [newValue, setNewValue] = useState("");

  const { data: settings = [], isLoading } = useQuery<ZipSetting[]>({
    queryKey: ["/api/admin/growth-engine/zip-settings"],
  });

  const upsertMutation = useMutation({
    mutationFn: (data: { scope: string; scopeValue: string; enabled?: boolean; showWhenRealJobsExist?: boolean; maxTasksShown?: number }) =>
      apiRequest("POST", "/api/admin/growth-engine/zip-settings", data),
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/zip-settings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/growth-engine/zip-settings/${id}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/zip-settings"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Add Scope Override</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 items-end">
            <div>
              <Label>Scope</Label>
              <Select value={newScope} onValueChange={setNewScope}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Value ({newScope === "zip" ? "e.g. 90210" : newScope === "city" ? "e.g. Los Angeles" : "e.g. CA"})</Label>
              <Input value={newValue} onChange={e => setNewValue(e.target.value)} />
            </div>
            <Button
              onClick={() => {
                if (!newValue.trim()) return;
                upsertMutation.mutate({ scope: newScope, scopeValue: newValue.trim() });
                setNewValue("");
              }}
              disabled={upsertMutation.isPending}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Show w/ Real Jobs</TableHead>
              <TableHead>Max Tasks</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map(s => (
              <TableRow key={s.id} data-testid={`row-zip-setting-${s.id}`}>
                <TableCell><Badge variant="outline">{s.scope}</Badge></TableCell>
                <TableCell className="font-mono">{s.scope_value || "(global)"}</TableCell>
                <TableCell>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={v => upsertMutation.mutate({ scope: s.scope, scopeValue: s.scope_value, enabled: v, showWhenRealJobsExist: s.show_when_real_jobs_exist, maxTasksShown: s.max_tasks_shown })}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.show_when_real_jobs_exist}
                    onCheckedChange={v => upsertMutation.mutate({ scope: s.scope, scopeValue: s.scope_value, enabled: s.enabled, showWhenRealJobsExist: v, maxTasksShown: s.max_tasks_shown })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="w-16"
                    value={s.max_tasks_shown}
                    onChange={e => upsertMutation.mutate({ scope: s.scope, scopeValue: s.scope_value, enabled: s.enabled, showWhenRealJobsExist: s.show_when_real_jobs_exist, maxTasksShown: parseInt(e.target.value) || 6 })}
                    min={1}
                    max={20}
                  />
                </TableCell>
                <TableCell>
                  {s.scope !== "global" && (
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RewardConfigTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, number>>({});

  const { data: configs = [], isLoading } = useQuery<RewardConfig[]>({
    queryKey: ["/api/admin/growth-engine/reward-config"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, valueInt }: { key: string; valueInt: number }) =>
      apiRequest("PATCH", `/api/admin/growth-engine/reward-config/${key}`, { valueInt }),
    onSuccess: (_, { key }) => {
      toast({ title: `Updated ${key}` });
      qc.invalidateQueries({ queryKey: ["/api/admin/growth-engine/reward-config"] });
      setEditing(p => { const n = { ...p }; delete n[key]; return n; });
    },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-4">All credit/score values are admin-editable. Changes take effect immediately.</p>
      {configs.map(c => (
        <div key={c.key} className="flex items-center gap-3 p-3 rounded-lg border bg-white dark:bg-gray-900" data-testid={`row-config-${c.key}`}>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{c.label}</p>
            {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
            <p className="text-xs font-mono text-gray-400">{c.key}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24 text-right"
              value={editing[c.key] !== undefined ? editing[c.key] : c.valueInt}
              onChange={e => setEditing(p => ({ ...p, [c.key]: parseInt(e.target.value) || 0 }))}
              data-testid={`input-config-${c.key}`}
            />
            {editing[c.key] !== undefined && editing[c.key] !== c.valueInt && (
              <Button
                size="sm"
                onClick={() => updateMutation.mutate({ key: c.key, valueInt: editing[c.key] })}
                disabled={updateMutation.isPending}
              >
                Save
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompletionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<{ rows: Completion[]; total: number }>({
    queryKey: ["/api/admin/growth-engine/completions", page],
    queryFn: () => fetch(`/api/admin/growth-engine/completions?page=${page}`).then(r => r.json()),
  });

  const statusColor = (s: string) => {
    if (s === "approved") return "bg-green-100 text-green-700";
    if (s === "rejected") return "bg-red-100 text-red-700";
    if (s === "suspicious") return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{data?.total ?? 0} total completions</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>ZIP</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map(c => (
                <TableRow key={c.id} data-testid={`row-completion-${c.id}`}>
                  <TableCell className="text-xs">
                    <p className="font-medium">{c.username}</p>
                    <p className="text-gray-400">{c.email}</p>
                  </TableCell>
                  <TableCell className="text-sm">{c.emoji} {c.title}</TableCell>
                  <TableCell className="font-mono text-sm">{c.zip}</TableCell>
                  <TableCell className="font-semibold text-yellow-600">+{c.credits_awarded}</TableCell>
                  <TableCell className="font-semibold text-blue-600">+{c.score_awarded}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
                      {c.status}
                      {c.rejection_reason ? ` (${c.rejection_reason})` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(data?.total ?? 0) > 50 && (
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-sm text-gray-500 self-center">Page {page}</span>
              <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminGrowthEnginePage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="bg-black text-white px-4 pt-10 pb-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate("/admin/qa")}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Admin QA
          </button>
          <h1 className="text-xl font-bold">Growth Engine</h1>
          <p className="text-sm text-gray-400">Manage ZIP fallback tasks, rewards, and settings</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-6">
        <Tabs defaultValue="templates">
          <TabsList className="mb-6">
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="zip-settings">ZIP Settings</TabsTrigger>
            <TabsTrigger value="reward-config">Reward Config</TabsTrigger>
            <TabsTrigger value="completions">Completions</TabsTrigger>
          </TabsList>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="zip-settings"><ZipSettingsTab /></TabsContent>
          <TabsContent value="reward-config"><RewardConfigTab /></TabsContent>
          <TabsContent value="completions"><CompletionsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
