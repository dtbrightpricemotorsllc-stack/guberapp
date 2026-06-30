import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Brain, Zap, BookOpen, ListOrdered, Archive, Lightbulb, Trash2, CheckCircle, XCircle, Plus, TrendingUp, RefreshCw, Target } from "lucide-react";

const CATEGORIES = ["general", "jobs", "payments", "marketplace", "vi", "load_board", "credits", "safety", "gps", "studio"];

// ── Stats Tab ─────────────────────────────────────────────────────────────────
function StatsTab() {
  const { data: stats, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/admin/jac/brain/stats"] });

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading stats…</div>;

  const ic = stats?.interactions ?? {};
  const costPerCall = 0.002;
  const saved = ((stats?.totalLocalHits ?? 0) * costPerCall).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">JAC Brain Overview</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-stats">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "KB Entries", value: stats?.kbEntries ?? 0, icon: BookOpen, color: "text-blue-600" },
          { label: "Intent Entries", value: stats?.intentEntries ?? 0, icon: ListOrdered, color: "text-purple-600" },
          { label: "Cache Entries", value: stats?.cacheEntries ?? 0, icon: Archive, color: "text-amber-600" },
          { label: "Total Local Hits", value: stats?.totalLocalHits ?? 0, icon: Zap, color: "text-green-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} data-testid={`stat-card-${label.toLowerCase().replace(/ /g, '-')}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-8 w-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Est. AI Calls Saved</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats?.estimatedSavedCalls ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">≈ ${saved} saved @ $0.002/call</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">30-Day Interactions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(ic.total ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Total JAC conversations</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Local Hit Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm"><span>KB hits</span><span className="font-medium">{stats?.kbHits ?? 0}</span></div>
            <div className="flex justify-between text-sm"><span>Intent hits</span><span className="font-medium">{stats?.intentHits ?? 0}</span></div>
            <div className="flex justify-between text-sm"><span>Cache hits</span><span className="font-medium">{stats?.cacheHits ?? 0}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Knowledge Base Tab ────────────────────────────────────────────────────────
function KnowledgeTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ category: "general", title: "", questionPatterns: "", keywords: "", answer: "" });

  const { data: entries = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/jac/brain/knowledge"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/jac/brain/knowledge", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/knowledge"] }); setShowAdd(false); setForm({ category: "general", title: "", questionPatterns: "", keywords: "", answer: "" }); toast({ title: "Entry added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/jac/brain/knowledge/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/knowledge"] }); setEditId(null); toast({ title: "Updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/jac/brain/knowledge/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/knowledge"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const parseList = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);

  const handleSubmit = () => {
    addMutation.mutate({
      category: form.category,
      title: form.title,
      questionPatterns: parseList(form.questionPatterns),
      keywords: parseList(form.keywords),
      answer: form.answer,
    });
  };

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading knowledge base…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{entries.length} entries total</div>
        <Button size="sm" onClick={() => setShowAdd(v => !v)} data-testid="btn-add-kb">
          <Plus className="h-4 w-4 mr-1" /> Add Entry
        </Button>
      </div>

      {showAdd && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Category</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-kb-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Title</label>
                <Input placeholder="e.g. How to post a job" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-kb-title" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Question Patterns (one per line)</label>
              <Textarea rows={3} placeholder={"how do i post a job\nhire someone\ncreate a listing"} value={form.questionPatterns} onChange={e => setForm(f => ({ ...f, questionPatterns: e.target.value }))} data-testid="input-kb-patterns" />
            </div>
            <div>
              <label className="text-xs font-medium">Keywords (one per line)</label>
              <Textarea rows={2} placeholder={"post job\nhire\njob listing"} value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} data-testid="input-kb-keywords" />
            </div>
            <div>
              <label className="text-xs font-medium">Answer</label>
              <Textarea rows={4} placeholder="The answer JAC will give…" value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} data-testid="input-kb-answer" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={addMutation.isPending || !form.title || !form.answer} data-testid="btn-kb-save">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {entries.map((entry: any) => (
          <Card key={entry.id} data-testid={`kb-entry-${entry.id}`}>
            <CardContent className="p-4">
              {editId === entry.id ? (
                <KBEditForm entry={entry} onSave={(data) => patchMutation.mutate({ id: entry.id, ...data })} onCancel={() => setEditId(null)} isPending={patchMutation.isPending} />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{entry.category}</Badge>
                      {!entry.admin_approved && <Badge variant="destructive" className="text-xs">Unapproved</Badge>}
                      {!entry.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      <span className="font-medium text-sm">{entry.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{entry.hit_count} hits</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{entry.answer}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(entry.keywords ?? []).slice(0, 5).map((k: string) => (
                        <span key={k} className="text-xs bg-muted px-1.5 py-0.5 rounded">{k}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditId(entry.id)} data-testid={`btn-edit-kb-${entry.id}`}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Delete this entry?")) deleteMutation.mutate(entry.id); }} data-testid={`btn-delete-kb-${entry.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!entries.length && <div className="text-center py-8 text-muted-foreground">No knowledge base entries yet.</div>}
      </div>
    </div>
  );
}

function KBEditForm({ entry, onSave, onCancel, isPending }: { entry: any; onSave: (d: any) => void; onCancel: () => void; isPending: boolean }) {
  const [form, setForm] = useState({
    category: entry.category,
    title: entry.title,
    questionPatterns: (entry.question_patterns ?? []).join("\n"),
    keywords: (entry.keywords ?? []).join("\n"),
    answer: entry.answer,
    active: entry.active,
    adminApproved: entry.admin_approved,
  });
  const parseList = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Category</label>
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Title</label>
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium">Question Patterns (one per line)</label>
        <Textarea rows={3} value={form.questionPatterns} onChange={e => setForm(f => ({ ...f, questionPatterns: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs font-medium">Keywords (one per line)</label>
        <Textarea rows={2} value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs font-medium">Answer</label>
        <Textarea rows={4} value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.adminApproved} onChange={e => setForm(f => ({ ...f, adminApproved: e.target.checked }))} />
          Approved
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => onSave({ ...form, questionPatterns: parseList(form.questionPatterns), keywords: parseList(form.keywords) })}>Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Intents Tab ───────────────────────────────────────────────────────────────
function IntentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ intentName: "", displayName: "", samplePhrases: "", targetFlow: "", targetRoute: "", fallbackResponse: "" });

  const { data: intents = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/jac/brain/intents"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/jac/brain/intents", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/intents"] }); setShowAdd(false); toast({ title: "Intent added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/jac/brain/intents/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/intents"] }); toast({ title: "Updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/jac/brain/intents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/intents"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const parseList = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading intents…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{intents.length} intents configured</div>
        <Button size="sm" onClick={() => setShowAdd(v => !v)} data-testid="btn-add-intent">
          <Plus className="h-4 w-4 mr-1" /> Add Intent
        </Button>
      </div>

      {showAdd && (
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Intent Name (slug)</label>
                <Input placeholder="e.g. post_job" value={form.intentName} onChange={e => setForm(f => ({ ...f, intentName: e.target.value.toLowerCase().replace(/\s/g, "_") }))} data-testid="input-intent-name" />
              </div>
              <div>
                <label className="text-xs font-medium">Display Name</label>
                <Input placeholder="e.g. Post a Job" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} data-testid="input-intent-display" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Sample Phrases (one per line)</label>
              <Textarea rows={3} placeholder={"post a job\nhire someone\nI need help"} value={form.samplePhrases} onChange={e => setForm(f => ({ ...f, samplePhrases: e.target.value }))} data-testid="input-intent-phrases" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Target Flow</label>
                <Input placeholder="e.g. post_job" value={form.targetFlow} onChange={e => setForm(f => ({ ...f, targetFlow: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium">Target Route</label>
                <Input placeholder="e.g. /post-job" value={form.targetRoute} onChange={e => setForm(f => ({ ...f, targetRoute: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Fallback Response</label>
              <Textarea rows={2} placeholder="What JAC says if intent matches but no route…" value={form.fallbackResponse} onChange={e => setForm(f => ({ ...f, fallbackResponse: e.target.value }))} data-testid="input-intent-fallback" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMutation.mutate({ ...form, samplePhrases: parseList(form.samplePhrases) })} disabled={addMutation.isPending || !form.intentName || !form.displayName} data-testid="btn-intent-save">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {intents.map((intent: any) => (
          <Card key={intent.id} data-testid={`intent-entry-${intent.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="font-mono text-xs">{intent.intent_name}</Badge>
                    {!intent.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    <span className="font-medium text-sm">{intent.display_name}</span>
                    <span className="text-xs text-muted-foreground">{intent.hit_count} hits</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(intent.sample_phrases ?? []).slice(0, 4).map((p: string) => (
                      <span key={p} className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">"{p}"</span>
                    ))}
                  </div>
                  {intent.fallback_response && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">↳ {intent.fallback_response}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => patchMutation.mutate({ id: intent.id, active: !intent.active })} data-testid={`btn-toggle-intent-${intent.id}`}>
                    {intent.active ? <XCircle className="h-4 w-4 text-muted-foreground" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Delete intent?")) deleteMutation.mutate(intent.id); }} data-testid={`btn-delete-intent-${intent.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!intents.length && <div className="text-center py-8 text-muted-foreground">No intents configured yet.</div>}
      </div>
    </div>
  );
}

// ── Cache Tab ─────────────────────────────────────────────────────────────────
function CacheTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [promoteQ, setPromoteQ] = useState("");
  const [promoteA, setPromoteA] = useState("");

  const { data: cache = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/jac/brain/cache"] });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/jac/brain/cache/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/cache"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/jac/brain/cache/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/cache"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const promoteMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/jac/brain/cache/promote", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/cache"] }); setPromoteQ(""); setPromoteA(""); toast({ title: "Added to cache" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading cache…</div>;

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Manually Promote Q&A to Cache</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="User question…" value={promoteQ} onChange={e => setPromoteQ(e.target.value)} data-testid="input-cache-question" />
          <Textarea rows={2} placeholder="JAC answer to cache…" value={promoteA} onChange={e => setPromoteA(e.target.value)} data-testid="input-cache-answer" />
          <Button size="sm" disabled={!promoteQ || !promoteA || promoteMutation.isPending} onClick={() => promoteMutation.mutate({ questionText: promoteQ, answerText: promoteA })} data-testid="btn-cache-promote">
            Promote to Cache
          </Button>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">{cache.length} cached responses — green = admin-approved (served without AI)</div>

      <div className="space-y-2">
        {cache.map((entry: any) => (
          <Card key={entry.id} className={entry.admin_approved ? "border-green-200" : ""} data-testid={`cache-entry-${entry.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {entry.admin_approved ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium truncate">{entry.question_text}</span>
                    <Badge variant="outline" className="text-xs ml-auto shrink-0">{entry.hit_count} hits</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{entry.answer_text}</p>
                  <div className="text-xs text-muted-foreground mt-1">Source: {entry.source}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => approveMutation.mutate(entry.id)} data-testid={`btn-approve-cache-${entry.id}`}>
                    {entry.admin_approved ? "Revoke" : "Approve"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Delete cache entry?")) deleteMutation.mutate(entry.id); }} data-testid={`btn-delete-cache-${entry.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!cache.length && <div className="text-center py-8 text-muted-foreground">No cached responses yet. Promote good AI answers above to build the cache.</div>}
      </div>
    </div>
  );
}

// ── Suggestions Tab ───────────────────────────────────────────────────────────
function SuggestionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const { data: suggestions = [], isLoading, refetch } = useQuery<any[]>({ queryKey: ["/api/admin/jac/brain/suggestions"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/jac/brain/knowledge", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/suggestions"] });
      toast({ title: "Added to Knowledge Base" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const promoteToCacheMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/jac/brain/cache/promote", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/brain/cache"] }); toast({ title: "Promoted to cache" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Analyzing interactions…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Top repeated questions in the last 30 days with no matching KB entry. Write an answer and add them to the Knowledge Base.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-suggestions">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {!suggestions.length && (
        <div className="text-center py-12">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <div className="text-muted-foreground">No repeated unanswered questions yet.</div>
          <div className="text-xs text-muted-foreground mt-1">As users chat with JAC, patterns will appear here.</div>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((s: any) => (
          <Card key={s.question} data-testid={`suggestion-${s.question.slice(0,20).replace(/\s/g,'-')}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-sm">"{s.question}"</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Asked {s.freq}× in last 30 days</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setExpandedQ(expandedQ === s.question ? null : s.question)} data-testid={`btn-expand-suggestion`}>
                  {expandedQ === s.question ? "Collapse" : "Write Answer"}
                </Button>
              </div>

              {expandedQ === s.question && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <Textarea
                    rows={3}
                    placeholder="Write JAC's answer to this question…"
                    value={answerDrafts[s.question] ?? ""}
                    onChange={e => setAnswerDrafts(d => ({ ...d, [s.question]: e.target.value }))}
                    data-testid="input-suggestion-answer"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!answerDrafts[s.question] || addMutation.isPending}
                      onClick={() => addMutation.mutate({
                        category: "general",
                        title: s.question.slice(0, 60),
                        questionPatterns: [s.question],
                        keywords: s.question.split(" ").filter((w: string) => w.length > 4),
                        answer: answerDrafts[s.question],
                      })} data-testid="btn-suggestion-add-kb">
                      Add to KB
                    </Button>
                    <Button size="sm" variant="outline" disabled={!answerDrafts[s.question] || promoteToCacheMutation.isPending}
                      onClick={() => promoteToCacheMutation.mutate({ questionText: s.question, answerText: answerDrafts[s.question] })}
                      data-testid="btn-suggestion-cache">
                      Add to Cache
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────
function GoalsTab() {
  const { data: stats, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/admin/jac/dd/stats"] });

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading D.D. goal stats…</div>;

  const s = stats ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">D.D. Goal Stats</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-dd-stats">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Goals", value: s.totalGoals ?? 0, color: "text-blue-600" },
          { label: "Active Goals", value: s.activeGoals ?? 0, color: "text-purple-600" },
          { label: "Completed", value: s.completedGoals ?? 0, color: "text-green-600" },
          { label: "Unique Users", value: s.uniqueUsers ?? 0, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} data-testid={`dd-stat-${label.toLowerCase().replace(/ /g,'-')}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <Target className={`h-8 w-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Goal Amount</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">${(s.avgGoalAmount ?? 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">Per D.D. session</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completion Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{(s.completionRate ?? 0).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Goals reached target</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Gap (Completed)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">${(s.avgGapCompleted ?? 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">Goal minus earned at close</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Goal Amounts</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(s.topGoalAmounts ?? []).map((row: any) => (
              <div key={row.goal_amount} className="flex justify-between text-sm">
                <span>${row.goal_amount}</span>
                <span className="font-medium">{row.cnt}×</span>
              </div>
            ))}
            {!(s.topGoalAmounts?.length) && <div className="text-xs text-muted-foreground">No data yet</div>}
          </CardContent>
        </Card>
      </div>

      {(s.topIncomePaths ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Recommended Income Paths</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(s.topIncomePaths ?? []).map((row: any) => (
                <Badge key={row.income_type} variant="secondary" className="text-xs" data-testid={`income-path-${row.income_type}`}>
                  {row.income_type?.replace(/_/g, " ")} <span className="ml-1 font-bold">{row.cnt}×</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-semibold text-sm mb-3">Recent Goals</h3>
        <div className="space-y-2">
          {(s.recentGoals ?? []).map((g: any) => {
            const pct = Math.min(100, Math.round((parseFloat(g.earned_so_far) / parseFloat(g.goal_amount)) * 100));
            return (
              <Card key={g.id} data-testid={`dd-goal-row-${g.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={g.status === "active" ? "default" : g.status === "completed" ? "secondary" : "outline"} className="text-xs">
                          {g.status}
                        </Badge>
                        <span className="font-medium text-sm">${parseFloat(g.goal_amount).toFixed(2)}{g.deadline ? ` by ${g.deadline}` : ""}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{g.full_name ?? `User #${g.user_id}`}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                        <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>${parseFloat(g.earned_so_far).toFixed(2)} earned</span>
                        <span>{pct}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!(s.recentGoals?.length) && <div className="text-center py-8 text-muted-foreground">No D.D. goals yet.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminJacBrain() {
  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl p-2.5">
          <Brain className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">JAC Brain</h1>
          <p className="text-sm text-muted-foreground">Local knowledge base & intent matching — answers before AI</p>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="stats" data-testid="tab-stats"><Zap className="h-4 w-4 mr-1" />Stats</TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge"><BookOpen className="h-4 w-4 mr-1" />Knowledge</TabsTrigger>
          <TabsTrigger value="intents" data-testid="tab-intents"><ListOrdered className="h-4 w-4 mr-1" />Intents</TabsTrigger>
          <TabsTrigger value="cache" data-testid="tab-cache"><Archive className="h-4 w-4 mr-1" />Cache</TabsTrigger>
          <TabsTrigger value="suggestions" data-testid="tab-suggestions"><Lightbulb className="h-4 w-4 mr-1" />Suggest</TabsTrigger>
          <TabsTrigger value="goals" data-testid="tab-goals"><Target className="h-4 w-4 mr-1" />Goals</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-6"><StatsTab /></TabsContent>
        <TabsContent value="knowledge" className="mt-6"><KnowledgeTab /></TabsContent>
        <TabsContent value="intents" className="mt-6"><IntentsTab /></TabsContent>
        <TabsContent value="cache" className="mt-6"><CacheTab /></TabsContent>
        <TabsContent value="suggestions" className="mt-6"><SuggestionsTab /></TabsContent>
        <TabsContent value="goals" className="mt-6"><GoalsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
