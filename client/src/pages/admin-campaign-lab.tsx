import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { GuberLayout } from "@/components/guber-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users, DollarSign, Zap, AlertTriangle, BookOpen, Target,
  PlusCircle, Trash2, Edit3, CheckCircle, XCircle, ToggleLeft, ToggleRight, Settings,
  TrendingUp, BarChart3,
} from "lucide-react";

type Creator = {
  id: number; full_name: string; email: string; profile_photo: string | null;
  campaign_lab_role: string; campaigns_assigned: number;
  total_spent_cents: number; work_items_created: number; work_items_approved: number;
};
type BudgetData = {
  config: { monthly_budget_cents: number; monthly_spent_cents: number; ai_kill_switch: boolean; budget_month_year: string };
  creators: any[];
  campaigns: any[];
  toolStats: any[];
};
type BrandContext = { id: number; category: string; title: string; content: string; is_active: boolean; sort_order: number };
type Campaign = { id: number; title: string; status: string; budget_cents: number; spent_cents: number; creator_count: number; work_item_count: number; approved_count: number };

const ROLES = [
  { value:"creator", label:"Creator", desc:"Can create content on assigned campaigns" },
  { value:"reviewer", label:"Reviewer", desc:"Can approve and reject submitted work" },
  { value:"marketing_manager", label:"Marketing Manager", desc:"Full access, budget control, campaign management" },
];

const BRAND_CATEGORIES = ["identity","tone","features","strategy","mascots","hashtags","ctas","guidelines","colors","other"];

export default function AdminCampaignLab() {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");

  // ── Creators state ────────────────────────────────────────────────────────
  const [showAddCreator, setShowAddCreator] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newCreatorRole, setNewCreatorRole] = useState("creator");
  const [showAssign, setShowAssign] = useState<Creator | null>(null);
  const [assignCampaignId, setAssignCampaignId] = useState("");
  const [assignLimit, setAssignLimit] = useState("25");

  // ── Brand context state ───────────────────────────────────────────────────
  const [showAddContext, setShowAddContext] = useState(false);
  const [editContext, setEditContext] = useState<BrandContext | null>(null);
  const [contextForm, setContextForm] = useState({ category:"identity", title:"", content:"", sortOrder:0 });

  // ── Budget state ──────────────────────────────────────────────────────────
  const [editBudget, setEditBudget] = useState(false);
  const [newBudget, setNewBudget] = useState("500");

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: creators, isLoading: loadingCreators, refetch: refetchCreators } = useQuery<Creator[]>({
    queryKey: ["/api/campaign-lab/creators"],
    staleTime: 30_000,
  });
  const { data: budgetData, refetch: refetchBudget } = useQuery<BudgetData>({
    queryKey: ["/api/campaign-lab/budget"],
    staleTime: 30_000,
  });
  const { data: brandContext, refetch: refetchContext } = useQuery<BrandContext[]>({
    queryKey: ["/api/campaign-lab/brand-context"],
    staleTime: 30_000,
  });
  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaign-lab/campaigns"],
    staleTime: 30_000,
  });
  const { data: searchResults } = useQuery<any[]>({
    queryKey: ["/api/campaign-lab/users/search", searchQ],
    queryFn: () => searchQ.length >= 2
      ? fetch(`/api/campaign-lab/users/search?q=${encodeURIComponent(searchQ)}`, { credentials: "include" }).then(r => r.json())
      : Promise.resolve([]),
    enabled: searchQ.length >= 2,
    staleTime: 10_000,
  });
  const { data: toolCosts, refetch: refetchTools } = useQuery<any[]>({
    queryKey: ["/api/campaign-lab/tool-costs"],
    staleTime: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const grantCreatorMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaign-lab/creators", { userId: selectedUser.id, campaignLabRole: newCreatorRole }).then(r => r.json()),
    onSuccess: () => {
      refetchCreators();
      setShowAddCreator(false);
      setSelectedUser(null);
      setSearchQ("");
      toast({ title: `${selectedUser?.full_name} granted ${newCreatorRole} access` });
    },
    onError: () => toast({ title: "Failed to grant access", variant: "destructive" }),
  });

  const revokeCreatorMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/campaign-lab/creators/${userId}`),
    onSuccess: () => { refetchCreators(); toast({ title: "Access revoked" }); },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      apiRequest("PATCH", `/api/campaign-lab/creators/${userId}`, { campaignLabRole: role }),
    onSuccess: () => { refetchCreators(); toast({ title: "Role updated" }); },
  });

  const assignCampaignMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaign-lab/assignments", {
      userId: showAssign!.id,
      campaignId: parseInt(assignCampaignId),
      spendingLimitCents: Math.round(parseFloat(assignLimit) * 100),
    }).then(r => r.json()),
    onSuccess: () => {
      setShowAssign(null);
      toast({ title: `${showAssign?.full_name} assigned to campaign` });
    },
    onError: () => toast({ title: "Failed to assign campaign", variant: "destructive" }),
  });

  const killSwitchMutation = useMutation({
    mutationFn: (active: boolean) => apiRequest("POST", "/api/campaign-lab/budget/kill-switch", { active }).then(r => r.json()),
    onSuccess: (data) => {
      refetchBudget();
      toast({ title: data.aiKillSwitch ? "AI generation PAUSED" : "AI generation resumed" });
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/campaign-lab/budget", { monthlyBudgetCents: Math.round(parseFloat(newBudget) * 100) }),
    onSuccess: () => { refetchBudget(); setEditBudget(false); toast({ title: "Budget updated" }); },
  });

  const saveContextMutation = useMutation({
    mutationFn: () => editContext
      ? apiRequest("PATCH", `/api/campaign-lab/brand-context/${editContext.id}`, contextForm).then(r => r.json())
      : apiRequest("POST", "/api/campaign-lab/brand-context", contextForm).then(r => r.json()),
    onSuccess: () => {
      refetchContext();
      setShowAddContext(false);
      setEditContext(null);
      setContextForm({ category:"identity", title:"", content:"", sortOrder:0 });
      toast({ title: editContext ? "Brand context updated" : "Brand context added" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteContextMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/campaign-lab/brand-context/${id}`),
    onSuccess: () => { refetchContext(); toast({ title: "Entry removed" }); },
  });

  const updateToolCostMutation = useMutation({
    mutationFn: ({ id, costCents }: { id: number; costCents: number }) =>
      apiRequest("PATCH", `/api/campaign-lab/tool-costs/${id}`, { costCents }),
    onSuccess: () => { refetchTools(); toast({ title: "Cost updated" }); },
  });

  const cfg = budgetData?.config;
  const usedPct = cfg && cfg.monthly_budget_cents > 0
    ? Math.min(100, Math.round((cfg.monthly_spent_cents / cfg.monthly_budget_cents) * 100))
    : 0;

  return (
    <GuberLayout showBack backHref="/admin" title="Campaign Lab Admin">
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-display font-black">Campaign Lab</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Admin control center</p>
          </div>
          {cfg?.ai_kill_switch && (
            <Badge variant="destructive" className="text-[10px] font-display font-bold uppercase tracking-wider animate-pulse">
              AI Paused
            </Badge>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full mb-5 h-9">
            <TabsTrigger value="overview" className="flex-1 text-[11px]">Overview</TabsTrigger>
            <TabsTrigger value="creators" className="flex-1 text-[11px]">Creators</TabsTrigger>
            <TabsTrigger value="budget" className="flex-1 text-[11px]">Budget</TabsTrigger>
            <TabsTrigger value="brand" className="flex-1 text-[11px]">Brand AI</TabsTrigger>
            <TabsTrigger value="tools" className="flex-1 text-[11px]">Costs</TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────────────────────────── */}
          <TabsContent value="overview">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label:"Creators", value:(creators?.length || 0).toString(), icon:Users, color:"#818cf8" },
                { label:"Active Campaigns", value:(campaigns?.filter(c => c.status === "active").length || 0).toString(), icon:Target, color:"#22c55e" },
                { label:"Monthly Spend", value:`$${((cfg?.monthly_spent_cents || 0)/100).toFixed(2)}`, icon:DollarSign, color:"#f5a623" },
                { label:"Budget Remaining", value:`$${(((cfg?.monthly_budget_cents || 50000) - (cfg?.monthly_spent_cents || 0))/100).toFixed(2)}`, icon:TrendingUp, color:"#f43f5e" },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl border border-border/20 bg-card p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-display">{stat.label}</p>
                  </div>
                  <p className="text-xl font-display font-black">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Kill switch */}
            <div className="rounded-xl border border-border/20 bg-card p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-display font-bold">AI Generation</p>
                  <p className="text-[11px] text-muted-foreground">Pause all creators immediately</p>
                </div>
                <button
                  onClick={() => killSwitchMutation.mutate(!cfg?.ai_kill_switch)}
                  disabled={killSwitchMutation.isPending}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-display font-bold transition-colors ${cfg?.ai_kill_switch ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-green-500/20 text-green-400 border border-green-500/30"}`}
                  data-testid="button-kill-switch"
                >
                  {cfg?.ai_kill_switch ? <><XCircle className="w-3.5 h-3.5" />Paused</> : <><CheckCircle className="w-3.5 h-3.5" />Running</>}
                </button>
              </div>
            </div>

            {/* Budget gauge */}
            {cfg && (
              <div className="rounded-xl border border-border/20 bg-card p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-display font-bold">Monthly AI Budget</p>
                  <p className="text-xs font-mono text-muted-foreground">${(cfg.monthly_spent_cents/100).toFixed(2)} / ${(cfg.monthly_budget_cents/100).toFixed(0)}</p>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] mb-1">
                  <div className="h-full rounded-full transition-all" style={{ width: `${usedPct}%`, background: usedPct > 85 ? "#ef4444" : usedPct > 60 ? "#f5a623" : "#22c55e" }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{usedPct}% used · {cfg.budget_month_year}</p>
              </div>
            )}

            {/* Top campaigns */}
            {(budgetData?.campaigns || []).slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display font-bold truncate">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground">{c.creator_count} creators · {c.approved_count}/{c.work_item_count} approved</p>
                </div>
                {c.budget_cents > 0 && (
                  <p className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">${(c.spent_cents/100).toFixed(2)}</p>
                )}
              </div>
            ))}
          </TabsContent>

          {/* ── Creators ────────────────────────────────────────────────────── */}
          <TabsContent value="creators">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">{creators?.length || 0} creators</p>
              <Button size="sm" onClick={() => setShowAddCreator(true)} className="rounded-xl h-8 text-xs gap-1.5" data-testid="button-add-creator">
                <PlusCircle className="w-3.5 h-3.5" /> Grant Access
              </Button>
            </div>

            {loadingCreators ? (
              <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            ) : (creators || []).length === 0 ? (
              <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No creators yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Grant access to your first creator to get started.</p>
              </div>
            ) : (creators || []).map(creator => (
              <div key={creator.id} className="rounded-xl border border-border/15 bg-card p-3.5 mb-2" data-testid={`creator-${creator.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-bold">{creator.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{creator.email}</p>
                  </div>
                  <select
                    value={creator.campaign_lab_role}
                    onChange={e => updateRoleMutation.mutate({ userId: creator.id, role: e.target.value })}
                    className="text-[10px] rounded-lg border border-border/30 bg-background px-2 py-1 font-display font-bold"
                    data-testid={`role-select-${creator.id}`}
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[
                    { label:"Campaigns", value:creator.campaigns_assigned },
                    { label:"Items", value:creator.work_items_created },
                    { label:"Approved", value:creator.work_items_approved },
                    { label:"AI Cost", value:`$${(creator.total_spent_cents/100).toFixed(2)}` },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <p className="text-[10px] font-display font-bold">{stat.value}</p>
                      <p className="text-[9px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowAssign(creator); setAssignCampaignId(""); setAssignLimit("25"); }} className="flex-1 h-6 text-[10px] rounded-lg" data-testid={`btn-assign-${creator.id}`}>
                    + Assign Campaign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => revokeCreatorMutation.mutate(creator.id)} className="h-6 text-[10px] rounded-lg border-red-500/30 text-red-400 px-3" data-testid={`btn-revoke-${creator.id}`}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ── Budget ──────────────────────────────────────────────────────── */}
          <TabsContent value="budget">
            {/* Monthly budget */}
            <div className="rounded-xl border border-border/20 bg-card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-display font-bold">Monthly AI Budget</p>
                <button onClick={() => { setEditBudget(true); setNewBudget(((cfg?.monthly_budget_cents || 50000)/100).toFixed(0)); }} className="text-[11px] text-primary font-display font-semibold" data-testid="button-edit-budget">Edit</button>
              </div>
              {editBudget ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input value={newBudget} onChange={e => setNewBudget(e.target.value)} type="number" min="0" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm" data-testid="input-new-budget" />
                  </div>
                  <Button size="sm" onClick={() => updateBudgetMutation.mutate()} disabled={updateBudgetMutation.isPending} className="rounded-xl" data-testid="button-save-budget">Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditBudget(false)} className="rounded-xl">Cancel</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-2xl font-display font-black">${(cfg?.monthly_budget_cents || 50000) / 100}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                    <p className="text-sm text-muted-foreground">${((cfg?.monthly_spent_cents || 0)/100).toFixed(2)} used</p>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] mb-1">
                    <div className="h-full rounded-full transition-all" style={{ width:`${usedPct}%`, background: usedPct > 85 ? "#ef4444" : usedPct > 60 ? "#f5a623" : "#22c55e" }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{usedPct}% of monthly budget used</p>
                </>
              )}
            </div>

            {/* Kill switch */}
            <div className="rounded-xl border border-border/20 bg-card p-4 mb-4">
              <p className="text-sm font-display font-bold mb-1">Emergency Kill Switch</p>
              <p className="text-[11px] text-muted-foreground mb-3">Immediately pause all AI generation for every creator.</p>
              <button
                onClick={() => killSwitchMutation.mutate(!cfg?.ai_kill_switch)}
                disabled={killSwitchMutation.isPending}
                className={`w-full py-3 rounded-xl font-display font-bold text-sm transition-colors ${cfg?.ai_kill_switch ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
                data-testid="button-kill-switch-budget"
              >
                {cfg?.ai_kill_switch ? "Resume AI Generation" : "Pause All AI Generation"}
              </button>
            </div>

            {/* Per-creator breakdown */}
            <div>
              <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-3">Creator Spend Breakdown</p>
              {(budgetData?.creators || []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-bold truncate">{c.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.total_generations} generations · {c.campaigns_active} campaigns</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-mono font-bold">${(c.total_spent_cents/100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
              {!budgetData?.creators?.length && (
                <div className="rounded-xl border border-border/20 bg-card p-6 text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No spending data yet.</p>
                </div>
              )}
            </div>

            {/* Tool usage stats */}
            {(budgetData?.toolStats || []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-3">Tool Usage</p>
                {(budgetData?.toolStats || []).map((t: any) => (
                  <div key={t.tool_key} className="flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card mb-2">
                    <div>
                      <p className="text-sm font-display font-bold capitalize">{t.tool_key.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground">{t.uses} uses</p>
                    </div>
                    <p className="text-sm font-mono text-muted-foreground">${(t.total_cents/100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Brand AI Context ─────────────────────────────────────────────── */}
          <TabsContent value="brand">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-display font-bold">Brand AI Knowledge</p>
                <p className="text-[11px] text-muted-foreground">{brandContext?.filter(b => b.is_active).length || 0} active entries — injected into every generation</p>
              </div>
              <Button size="sm" onClick={() => { setShowAddContext(true); setEditContext(null); setContextForm({ category:"identity", title:"", content:"", sortOrder:0 }); }} className="rounded-xl h-8 text-xs gap-1.5" data-testid="button-add-context">
                <PlusCircle className="w-3.5 h-3.5" /> Add Entry
              </Button>
            </div>

            {BRAND_CATEGORIES.filter(cat => (brandContext || []).some(b => b.category === cat)).map(cat => (
              <div key={cat} className="mb-4">
                <p className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground mb-2 capitalize">{cat}</p>
                {(brandContext || []).filter(b => b.category === cat).map(entry => (
                  <div key={entry.id} className={`rounded-xl border p-3.5 mb-2 ${entry.is_active ? "border-border/20 bg-card" : "border-border/10 bg-card/50 opacity-50"}`} data-testid={`context-${entry.id}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-display font-bold">{entry.title}</p>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setEditContext(entry); setContextForm({ category:entry.category, title:entry.title, content:entry.content, sortOrder:entry.sort_order }); setShowAddContext(true); }} className="text-[10px] text-primary font-display" data-testid={`edit-context-${entry.id}`}>Edit</button>
                        <button onClick={() => deleteContextMutation.mutate(entry.id)} className="text-[10px] text-red-400 font-display" data-testid={`delete-context-${entry.id}`}>Delete</button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">{entry.content}</p>
                  </div>
                ))}
              </div>
            ))}
            {(!brandContext || brandContext.length === 0) && (
              <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No brand context entries yet.</p>
              </div>
            )}
          </TabsContent>

          {/* ── Tool Costs ────────────────────────────────────────────────────── */}
          <TabsContent value="tools">
            <p className="text-xs text-muted-foreground mb-4">These costs are tracked in the background. Creators never see them.</p>
            <div className="space-y-2">
              {(toolCosts || []).map(tool => (
                <div key={tool.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/15 bg-card" data-testid={`tool-${tool.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-bold">{tool.display_name}</p>
                    <p className="text-[10px] text-muted-foreground">{tool.description || tool.tool_key}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <CostEditor tool={tool} onSave={(cents) => updateToolCostMutation.mutate({ id: tool.id, costCents: cents })} />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Grant Creator Access dialog */}
      <Dialog open={showAddCreator} onOpenChange={setShowAddCreator}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grant Campaign Lab Access</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Search User</label>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                data-testid="input-search-user"
              />
              {searchResults && searchResults.length > 0 && !selectedUser && (
                <div className="mt-1 rounded-lg border border-border bg-card overflow-hidden">
                  {searchResults.map(u => (
                    <button key={u.id} onClick={() => { setSelectedUser(u); setSearchQ(u.full_name); }} className="w-full flex items-center gap-3 p-2.5 hover:bg-white/[0.03] text-left" data-testid={`user-result-${u.id}`}>
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {u.profile_photo ? <img src={u.profile_photo} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-[11px] font-bold">{u.full_name?.[0]}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                      {u.campaign_lab_role && <Badge variant="outline" className="shrink-0 text-[9px]">{u.campaign_lab_role}</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedUser && (
              <div className="p-2.5 rounded-lg bg-primary/[0.06] border border-primary/15">
                <p className="text-xs font-display font-bold text-primary">{selectedUser.full_name}</p>
                <p className="text-[10px] text-muted-foreground">{selectedUser.email}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Role</label>
              <div className="space-y-2">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => setNewCreatorRole(r.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${newCreatorRole === r.value ? "border-primary bg-primary/10" : "border-border/20 bg-card"}`}
                    data-testid={`role-option-${r.value}`}>
                    <p className="text-sm font-display font-bold">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddCreator(false); setSelectedUser(null); setSearchQ(""); }}>Cancel</Button>
            <Button onClick={() => grantCreatorMutation.mutate()} disabled={!selectedUser || grantCreatorMutation.isPending} data-testid="button-grant-access">
              {grantCreatorMutation.isPending ? "Granting…" : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Campaign dialog */}
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Campaign — {showAssign?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Campaign</label>
              <select value={assignCampaignId} onChange={e => setAssignCampaignId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-assign-campaign">
                <option value="">Select a campaign…</option>
                {(campaigns || []).filter(c => c.status === "active" || c.status === "draft").map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Spending Limit</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input value={assignLimit} onChange={e => setAssignLimit(e.target.value)} type="number" min="0" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm" data-testid="input-spending-limit" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">How much this creator can spend on AI for this campaign</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button onClick={() => assignCampaignMutation.mutate()} disabled={!assignCampaignId || assignCampaignMutation.isPending} data-testid="button-confirm-assign">
              {assignCampaignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brand context dialog */}
      <Dialog open={showAddContext} onOpenChange={() => { setShowAddContext(false); setEditContext(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editContext ? "Edit Brand Context" : "Add Brand Context"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Category</label>
              <select value={contextForm.category} onChange={e => setContextForm(p => ({...p, category: e.target.value}))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-context-category">
                {BRAND_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Title</label>
              <input value={contextForm.title} onChange={e => setContextForm(p => ({...p, title: e.target.value}))} placeholder="e.g. Brand Voice & Tone" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="input-context-title" />
            </div>
            <div>
              <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Content</label>
              <textarea value={contextForm.content} onChange={e => setContextForm(p => ({...p, content: e.target.value}))} placeholder="What should the AI know about this?" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" rows={5} data-testid="textarea-context-content" />
              <p className="text-[10px] text-muted-foreground mt-1">This will be included in every AI generation prompt automatically.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddContext(false); setEditContext(null); }}>Cancel</Button>
            <Button onClick={() => saveContextMutation.mutate()} disabled={!contextForm.title || !contextForm.content || saveContextMutation.isPending} data-testid="button-save-context">
              {saveContextMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GuberLayout>
  );
}

// Inline cost editor component
function CostEditor({ tool, onSave }: { tool: any; onSave: (cents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((tool.cost_cents / 100).toFixed(3));

  if (editing) return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">$</span>
      <input value={val} onChange={e => setVal(e.target.value)} type="number" min="0" step="0.001" className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs font-mono" data-testid={`cost-input-${tool.id}`} />
      <button onClick={() => { onSave(Math.round(parseFloat(val) * 100)); setEditing(false); }} className="text-[10px] text-primary font-display font-bold">Save</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground">Cancel</button>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-mono text-muted-foreground">${(tool.cost_cents / 100).toFixed(3)}</span>
      <button onClick={() => setEditing(true)} className="text-[10px] text-primary font-display font-semibold" data-testid={`edit-cost-${tool.id}`}>Edit</button>
    </div>
  );
}
