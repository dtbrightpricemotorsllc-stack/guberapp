import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Megaphone, Image, Video, Music, FileText, CheckCircle, Clock, XCircle,
  RefreshCcw, Zap, ChevronRight, Layers, Palette, BookOpen, Upload,
  PlusCircle, Send, RotateCcw, Play, AlertTriangle, Star, Target,
  Users, Hash, ArrowLeft, Mic, AlignLeft, Layout,
} from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────────
type LabAccess = { hasAccess: boolean; role: string; canReview: boolean; canAdmin: boolean; isAdmin: boolean };
type Campaign = { id: number; title: string; description: string; goal: string; audience: string; approved_messaging: string; required_cta: string; hashtags: string[]; budget_cents: number; spent_cents: number; status: string; due_date: string | null; cover_image_url: string | null };
type Asset = { id: number; category: string; name: string; description: string; url: string; file_type: string; tags: string[] };
type WorkItem = { id: number; campaign_id: number; title: string; type: string; status: string; content: string | null; asset_url: string | null; reviewer_feedback: string | null; creator_name: string; created_at: string };
type BrandContextEntry = { id: number; category: string; title: string; content: string; is_active: boolean };

// ── constants ──────────────────────────────────────────────────────────────────
const ASSET_CATEGORIES = ["logo","mascot","screenshot","color_palette","font","template","icon","background","animation","video","image","music","voice","document","other"];
const ASSET_CATEGORY_LABELS: Record<string,string> = {
  logo:"Logos", mascot:"Mascot", screenshot:"Screenshots", color_palette:"Color Palette",
  font:"Fonts", template:"Templates", icon:"Icons", background:"Backgrounds",
  animation:"Animations", video:"Videos", image:"Images", music:"Music",
  voice:"Voice Library", document:"Documents", other:"Other",
};
const WORK_ITEM_TYPES = [
  { key:"script", label:"Script", icon:AlignLeft, costKey:"ai_script", heavy:false },
  { key:"caption", label:"Caption", icon:FileText, costKey:"ai_caption", heavy:false },
  { key:"hashtags", label:"Hashtags", icon:Hash, costKey:"ai_hashtags", heavy:false },
  { key:"headline", label:"Headline", icon:Megaphone, costKey:"ai_headline", heavy:false },
  { key:"hook", label:"Hook", icon:Zap, costKey:"ai_hook", heavy:false },
  { key:"storyboard", label:"Storyboard", icon:Layout, costKey:"ai_storyboard", heavy:false },
  { key:"image", label:"Image", icon:Image, costKey:"image_generation", heavy:true },
  { key:"voiceover", label:"Voiceover", icon:Mic, costKey:"voiceover", heavy:true },
  { key:"video", label:"Short Video", icon:Video, costKey:"short_video", heavy:true },
];
const STATUS_BADGE: Record<string,{label:string; variant:"default"|"secondary"|"destructive"|"outline"; color:string}> = {
  draft:         { label:"Draft",          variant:"outline",    color:"text-muted-foreground" },
  submitted:     { label:"Submitted",      variant:"secondary",  color:"text-yellow-400" },
  approved:      { label:"Approved",       variant:"default",    color:"text-green-400" },
  rejected:      { label:"Rejected",       variant:"destructive",color:"text-red-400" },
  needs_revision:{ label:"Needs Revision", variant:"outline",    color:"text-orange-400" },
};

// ── shared layout ─────────────────────────────────────────────────────────────
function LabLayout({ children, title, back }: { children: React.ReactNode; title?: string; back?: string }) {
  const [, nav] = useLocation();
  return (
    <GuberLayout showBack={!!back} onBack={back ? () => nav(back) : undefined} title={title || "Campaign Lab"}>
      {children}
    </GuberLayout>
  );
}

function AccessGate({ children }: { children: React.ReactNode }) {
  const { data: access, isLoading } = useQuery<LabAccess>({ queryKey: ["/api/campaign-lab/access"], staleTime: 60_000 });
  if (isLoading) return <LabLayout><div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div></LabLayout>;
  if (!access?.hasAccess) return (
    <LabLayout>
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-display font-bold mb-2">Campaign Lab</h2>
        <p className="text-sm text-muted-foreground">Access to Campaign Lab is by invitation only. Contact your GUBER admin to get access.</p>
      </div>
    </LabLayout>
  );
  return <>{children}</>;
}

// ── Hub / Dashboard ───────────────────────────────────────────────────────────
export default function CampaignLabHub() {
  const [, nav] = useLocation();
  const { data: access } = useQuery<LabAccess>({ queryKey: ["/api/campaign-lab/access"], staleTime: 60_000 });
  const { data: campaigns, isLoading: loadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaign-lab/campaigns"],
    enabled: !!access?.hasAccess,
    staleTime: 30_000,
  });
  const { data: workItems } = useQuery<WorkItem[]>({
    queryKey: ["/api/campaign-lab/work-items"],
    enabled: !!access?.hasAccess,
    staleTime: 30_000,
  });

  if (!access?.hasAccess) return <AccessGate><></></AccessGate>;

  const pendingReview = workItems?.filter(w => w.status === "submitted") || [];
  const myRecent = workItems?.slice(0, 5) || [];
  const activeCampaigns = campaigns?.filter(c => c.status === "active") || [];

  return (
    <AccessGate>
      <LabLayout>
        <div className="max-w-2xl mx-auto px-4 py-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-display font-black tracking-tight">Campaign Lab</h1>
              <p className="text-xs text-muted-foreground mt-0.5">GUBER's marketing headquarters</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-display font-bold uppercase tracking-wider border-primary/30 text-primary">
              {access?.role === "admin" ? "Admin" : access?.role?.replace("_", " ")}
            </Badge>
          </div>

          {/* Nav cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label:"Brand Center", desc:"Assets, colors, guidelines", icon:Palette, href:"/campaign-lab/brand", color:"#f5a623" },
              { label:"Campaigns", desc:`${activeCampaigns.length} active`, icon:Target, href:"/campaign-lab/campaigns", color:"#22c55e" },
              { label:"My Work", desc:`${myRecent.length} items`, icon:Layers, href:"/campaign-lab/work", color:"#818cf8" },
              { label:"Brand Guide", desc:"GUBER voice & tone", icon:BookOpen, href:"/campaign-lab/brand?tab=context", color:"#f43f5e" },
            ].map(card => (
              <button key={card.href} onClick={() => nav(card.href)} className="flex flex-col p-4 rounded-2xl border border-border/20 bg-card text-left active:opacity-80 transition-opacity" data-testid={`nav-${card.label.toLowerCase().replace(/\s+/g,"-")}`}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${card.color}20` }}>
                  <card.icon className="w-4 h-4" style={{ color: card.color }} />
                </div>
                <p className="text-sm font-display font-bold">{card.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{card.desc}</p>
              </button>
            ))}
          </div>

          {/* Pending review banner (reviewers only) */}
          {access?.canReview && pendingReview.length > 0 && (
            <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-display font-semibold text-yellow-300">{pendingReview.length} item{pendingReview.length !== 1 ? "s" : ""} pending review</p>
              </div>
              <button onClick={() => nav("/campaign-lab/review")} className="text-[11px] text-yellow-400 font-display font-bold">Review →</button>
            </div>
          )}

          {/* Active campaigns */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">Active Campaigns</p>
              <button onClick={() => nav("/campaign-lab/campaigns")} className="text-[11px] text-primary font-display font-semibold">See all →</button>
            </div>
            {loadingCampaigns ? (
              <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : activeCampaigns.length === 0 ? (
              <div className="rounded-xl border border-border/20 bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">No campaigns assigned yet.</p>
              </div>
            ) : activeCampaigns.slice(0, 5).map(c => (
              <button key={c.id} onClick={() => nav(`/campaign-lab/campaigns/${c.id}`)} className="w-full flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card mb-2 text-left active:opacity-80 transition-opacity" data-testid={`campaign-row-${c.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display font-bold truncate">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{c.goal || c.description || "—"}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
              </button>
            ))}
          </div>

          {/* Recent work */}
          {myRecent.length > 0 && (
            <div>
              <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-3">Recent Work</p>
              <div className="space-y-2">
                {myRecent.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{w.title}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{w.type}</p>
                    </div>
                    <span className={`text-[10px] font-display font-bold uppercase ${STATUS_BADGE[w.status]?.color || "text-muted-foreground"}`}>
                      {STATUS_BADGE[w.status]?.label || w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </LabLayout>
    </AccessGate>
  );
}

// ── Brand Center ──────────────────────────────────────────────────────────────
export function CampaignLabBrandCenter() {
  const [activeTab, setActiveTab] = useState("assets");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ category:"logo", name:"", description:"", url:"", fileType:"image" });
  const { toast } = useToast();
  const { data: access } = useQuery<LabAccess>({ queryKey: ["/api/campaign-lab/access"], staleTime: 60_000 });
  const { data: assets, isLoading: loadingAssets } = useQuery<Asset[]>({
    queryKey: ["/api/campaign-lab/assets"],
    enabled: !!access?.hasAccess,
    staleTime: 30_000,
  });
  const { data: brandContext } = useQuery<BrandContextEntry[]>({
    queryKey: ["/api/campaign-lab/brand-context"],
    enabled: !!access?.hasAccess,
    staleTime: 60_000,
  });

  const uploadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaign-lab/assets", uploadForm).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-lab/assets"] });
      setShowUpload(false);
      setUploadForm({ category:"logo", name:"", description:"", url:"", fileType:"image" });
      toast({ title: "Asset added to Brand Center" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/campaign-lab/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/campaign-lab/assets"] }); toast({ title: "Asset removed" }); },
  });

  const filtered = activeCategory === "all" ? (assets || []) : (assets || []).filter(a => a.category === activeCategory);
  const categories = ["all", ...Array.from(new Set((assets || []).map(a => a.category)))];

  const brandCategories = Array.from(new Set((brandContext || []).map(b => b.category)));

  return (
    <AccessGate>
      <LabLayout title="Brand Center" back="/campaign-lab">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-display font-black">Brand Center</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Everything GUBER in one place</p>
            </div>
            {access?.canAdmin && (
              <Button size="sm" onClick={() => setShowUpload(true)} className="rounded-xl h-8 text-xs gap-1.5" data-testid="button-add-asset">
                <PlusCircle className="w-3.5 h-3.5" /> Add Asset
              </Button>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full mb-4 h-9">
              <TabsTrigger value="assets" className="flex-1 text-xs">Asset Library</TabsTrigger>
              <TabsTrigger value="context" className="flex-1 text-xs">Brand Guide</TabsTrigger>
              <TabsTrigger value="palette" className="flex-1 text-xs">Colors & Fonts</TabsTrigger>
            </TabsList>

            <TabsContent value="assets">
              {/* Category filter */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-display font-bold whitespace-nowrap transition-colors ${activeCategory === cat ? "bg-primary text-black" : "bg-card border border-border/20 text-muted-foreground"}`}
                    data-testid={`filter-${cat}`}>
                    {cat === "all" ? "All" : (ASSET_CATEGORY_LABELS[cat] || cat)}
                  </button>
                ))}
              </div>

              {loadingAssets ? (
                <div className="grid grid-cols-2 gap-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {access?.canAdmin ? "No assets yet. Add the first one." : "No assets available in this category."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map(asset => (
                    <div key={asset.id} className="rounded-xl border border-border/20 bg-card overflow-hidden group" data-testid={`asset-${asset.id}`}>
                      {asset.file_type === "image" && (
                        <div className="w-full h-28 bg-muted overflow-hidden">
                          <img src={asset.url} alt={asset.name} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      {asset.file_type === "audio" && (
                        <div className="w-full h-16 bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
                          <Music className="w-6 h-6 text-purple-400" />
                        </div>
                      )}
                      {asset.file_type === "video" && (
                        <div className="w-full h-16 bg-gradient-to-br from-green-500/10 to-teal-500/10 flex items-center justify-center">
                          <Play className="w-6 h-6 text-green-400" />
                        </div>
                      )}
                      {asset.file_type === "document" && (
                        <div className="w-full h-16 bg-gradient-to-br from-orange-500/10 to-yellow-500/10 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-orange-400" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="text-xs font-display font-bold truncate">{asset.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{ASSET_CATEGORY_LABELS[asset.category] || asset.category}</p>
                        <div className="flex items-center justify-between mt-2">
                          <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary font-display font-semibold">Open ↗</a>
                          {access?.canAdmin && (
                            <button onClick={() => deleteMutation.mutate(asset.id)} className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="context">
              <div className="space-y-3">
                {brandCategories.map(cat => (
                  <div key={cat}>
                    <p className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
                    {(brandContext || []).filter(b => b.category === cat && b.is_active).map(entry => (
                      <div key={entry.id} className="rounded-xl border border-border/20 bg-card p-3.5 mb-2">
                        <p className="text-xs font-display font-bold mb-1">{entry.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
                {brandCategories.length === 0 && (
                  <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
                    <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Brand guide not yet populated.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="palette">
              <div className="space-y-4">
                <div className="rounded-xl border border-border/20 bg-card p-4">
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-3">GUBER Brand Colors</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name:"Primary Green", hex:"#22C55E", usage:"CTAs, accents, success" },
                      { name:"Background Dark", hex:"#0A0A0A", usage:"App background" },
                      { name:"White", hex:"#FFFFFF", usage:"Text on dark" },
                      { name:"Accent Gold", hex:"#F5A623", usage:"OG, premium features" },
                      { name:"Warning Yellow", hex:"#EAB308", usage:"Pending states" },
                      { name:"Destructive Red", hex:"#EF4444", usage:"Errors, disputes" },
                    ].map(c => (
                      <div key={c.hex} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg shrink-0 border border-white/10" style={{ background: c.hex }} />
                        <div>
                          <p className="text-[11px] font-display font-bold">{c.name}</p>
                          <p className="text-[9px] text-muted-foreground font-mono">{c.hex}</p>
                          <p className="text-[9px] text-muted-foreground">{c.usage}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/20 bg-card p-4">
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-3">GUBER Brand Fonts</p>
                  {[
                    { name:"Oxanium", role:"Display / Headings / Badges", sample:"Create Value In Yourself" },
                    { name:"Inter", role:"Body text / UI labels", sample:"Find work near you today." },
                  ].map(f => (
                    <div key={f.name} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-display font-bold">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground">{f.role}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{f.sample}</p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Upload dialog */}
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Brand Asset</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Category</label>
                <select value={uploadForm.category} onChange={e => setUploadForm(p => ({...p, category: e.target.value}))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-asset-category">
                  {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c] || c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Asset Name</label>
                <input value={uploadForm.name} onChange={e => setUploadForm(p => ({...p, name: e.target.value}))} placeholder="e.g. GUBER Logo Dark" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="input-asset-name" />
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">URL</label>
                <input value={uploadForm.url} onChange={e => setUploadForm(p => ({...p, url: e.target.value}))} placeholder="https://..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs" data-testid="input-asset-url" />
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">File Type</label>
                <select value={uploadForm.fileType} onChange={e => setUploadForm(p => ({...p, fileType: e.target.value}))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-file-type">
                  {["image","video","audio","document"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Description (optional)</label>
                <input value={uploadForm.description} onChange={e => setUploadForm(p => ({...p, description: e.target.value}))} placeholder="When and how to use this asset" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="input-asset-description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpload(false)} data-testid="button-cancel-upload">Cancel</Button>
              <Button onClick={() => uploadMutation.mutate()} disabled={!uploadForm.name || !uploadForm.url || uploadMutation.isPending} data-testid="button-save-asset">
                {uploadMutation.isPending ? "Saving…" : "Add Asset"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </LabLayout>
    </AccessGate>
  );
}

// ── Campaign List ─────────────────────────────────────────────────────────────
export function CampaignLabCampaignsList() {
  const [, nav] = useLocation();
  const { data: access } = useQuery<LabAccess>({ queryKey: ["/api/campaign-lab/access"], staleTime: 60_000 });
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaign-lab/campaigns"],
    enabled: !!access?.hasAccess,
    staleTime: 30_000,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title:"", description:"", goal:"", audience:"", approvedMessaging:"", requiredCta:"", status:"draft" });
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaign-lab/campaigns", form).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-lab/campaigns"] });
      setShowCreate(false);
      nav(`/campaign-lab/campaigns/${data.id}`);
    },
    onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  const STATUS_COLOR: Record<string,string> = { active:"text-green-400", draft:"text-muted-foreground", paused:"text-yellow-400", completed:"text-blue-400" };

  return (
    <AccessGate>
      <LabLayout title="Campaigns" back="/campaign-lab">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-display font-black">Campaigns</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{campaigns?.length || 0} total</p>
            </div>
            {access?.canAdmin && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-xl h-8 text-xs gap-1.5" data-testid="button-create-campaign">
                <PlusCircle className="w-3.5 h-3.5" /> New
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (campaigns || []).length === 0 ? (
            <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
              <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(campaigns || []).map(c => (
                <button key={c.id} onClick={() => nav(`/campaign-lab/campaigns/${c.id}`)} className="w-full text-left p-4 rounded-xl border border-border/15 bg-card active:opacity-80 transition-opacity" data-testid={`campaign-${c.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-display font-bold text-sm">{c.title}</p>
                    <span className={`text-[10px] font-display font-bold uppercase shrink-0 ${STATUS_COLOR[c.status] || "text-muted-foreground"}`}>{c.status}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{c.goal || c.description || "—"}</p>
                  {c.budget_cents > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, Math.round((c.spent_cents / c.budget_cents) * 100))}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">${(c.spent_cents / 100).toFixed(2)} / ${(c.budget_cents / 100).toFixed(0)}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {[
                { label:"Campaign Title *", key:"title", placeholder:"e.g. Day-1 OG Summer Push" },
                { label:"Goal", key:"goal", placeholder:"What should this campaign achieve?" },
                { label:"Target Audience", key:"audience", placeholder:"Who are we reaching?" },
                { label:"Approved Messaging", key:"approvedMessaging", placeholder:"The approved message for this campaign" },
                { label:"Required CTA", key:"requiredCta", placeholder:"e.g. Become a Day-1 OG" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))} placeholder={f.placeholder} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid={`input-${f.key}`} />
                </div>
              ))}
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-status">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.title || createMutation.isPending} data-testid="button-save-campaign">
                {createMutation.isPending ? "Creating…" : "Create Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </LabLayout>
    </AccessGate>
  );
}

// ── Campaign Detail ───────────────────────────────────────────────────────────
export function CampaignLabCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("work");
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItem, setNewItem] = useState({ title:"", type:"script", notes:"" });
  const [showGenerate, setShowGenerate] = useState<WorkItem | null>(null);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [reviewTarget, setReviewTarget] = useState<WorkItem | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");

  const { data: access } = useQuery<LabAccess>({ queryKey: ["/api/campaign-lab/access"], staleTime: 60_000 });
  const { data, isLoading, refetch } = useQuery<{ campaign: Campaign; assignments: any[]; workItems: WorkItem[] }>({
    queryKey: ["/api/campaign-lab/campaigns", id],
    queryFn: () => fetch(`/api/campaign-lab/campaigns/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
    staleTime: 15_000,
  });
  const { data: toolCosts } = useQuery<any[]>({ queryKey: ["/api/campaign-lab/tool-costs"], staleTime: 60_000 });

  const createItemMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaign-lab/work-items", { ...newItem, campaignId: parseInt(id!) }).then(r => r.json()),
    onSuccess: () => {
      refetch();
      setShowNewItem(false);
      setNewItem({ title:"", type:"script", notes:"" });
      toast({ title: "Work item created" });
    },
    onError: (e: any) => toast({ title: e.message || "Failed to create item", variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest("POST", `/api/campaign-lab/work-items/${itemId}/submit`, {}),
    onSuccess: () => { refetch(); toast({ title: "Submitted for review" }); },
  });

  const approveMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest("POST", `/api/campaign-lab/work-items/${itemId}/approve`, {}),
    onSuccess: () => { refetch(); setReviewTarget(null); toast({ title: "Approved ✓" }); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ itemId, feedback }: { itemId: number; feedback: string }) =>
      apiRequest("POST", `/api/campaign-lab/work-items/${itemId}/reject`, { feedback, needsRevision: true }),
    onSuccess: () => { refetch(); setReviewTarget(null); setReviewFeedback(""); toast({ title: "Sent back for revision" }); },
  });

  const generateMutation = useMutation({
    mutationFn: ({ toolKey, prompt }: { toolKey: string; prompt: string }) =>
      apiRequest("POST", "/api/campaign-lab/generate", {
        toolKey, prompt, campaignId: parseInt(id!), workItemId: showGenerate?.id,
      }).then(r => r.json()),
    onSuccess: async (data) => {
      if (showGenerate && data.content) {
        await apiRequest("PATCH", `/api/campaign-lab/work-items/${showGenerate.id}`, {
          content: data.content, aiPromptUsed: generatePrompt,
        });
      }
      refetch();
      setShowGenerate(null);
      setGeneratePrompt("");
      toast({ title: `Generated! ${data.costCents > 0 ? `Cost: $${(data.costCents/100).toFixed(3)}` : "Free"}` });
    },
    onError: (e: any) => toast({ title: e.message || "Generation failed", variant: "destructive" }),
  });

  if (isLoading) return <LabLayout><div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div></LabLayout>;
  if (!data?.campaign) return <LabLayout><div className="px-4 py-16 text-center"><p className="text-muted-foreground">Campaign not found.</p></div></LabLayout>;

  const { campaign, workItems, assignments } = data;
  const items = workItems || [];
  const WTYPE = Object.fromEntries(WORK_ITEM_TYPES.map(t => [t.key, t]));

  const getToolCost = (costKey: string) => {
    const tc = toolCosts?.find(t => t.tool_key === costKey);
    return tc ? tc.cost_cents : 0;
  };

  return (
    <AccessGate>
      <LabLayout title={campaign.title} back="/campaign-lab/campaigns">
        <div className="max-w-2xl mx-auto px-4 py-5">
          {/* Campaign header */}
          <div className="mb-5">
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-xl font-display font-black leading-tight">{campaign.title}</h1>
              <span className={`text-[10px] font-display font-bold uppercase shrink-0 ml-2 ${campaign.status === "active" ? "text-green-400" : "text-muted-foreground"}`}>{campaign.status}</span>
            </div>
            {campaign.goal && <p className="text-sm text-muted-foreground mb-2">{campaign.goal}</p>}
            {campaign.budget_cents > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${Math.min(100, Math.round((campaign.spent_cents / campaign.budget_cents) * 100))}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">${(campaign.spent_cents/100).toFixed(2)} / ${(campaign.budget_cents/100).toFixed(2)}</span>
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full mb-4 h-9">
              <TabsTrigger value="work" className="flex-1 text-xs">Work Items</TabsTrigger>
              <TabsTrigger value="brief" className="flex-1 text-xs">Brief</TabsTrigger>
              {access?.canAdmin && <TabsTrigger value="team" className="flex-1 text-xs">Team</TabsTrigger>}
            </TabsList>

            <TabsContent value="work">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
                <Button size="sm" onClick={() => setShowNewItem(true)} className="rounded-xl h-7 text-xs gap-1" data-testid="button-new-work-item">
                  <PlusCircle className="w-3 h-3" /> New Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="rounded-xl border border-border/20 bg-card p-8 text-center">
                  <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No work items yet.</p>
                  <Button size="sm" onClick={() => setShowNewItem(true)} className="rounded-xl text-xs" data-testid="button-first-work-item">Start creating</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map(item => {
                    const wt = WTYPE[item.type];
                    const WIcon = wt?.icon || FileText;
                    const sb = STATUS_BADGE[item.status];
                    return (
                      <div key={item.id} className="rounded-xl border border-border/15 bg-card p-3.5" data-testid={`work-item-${item.id}`}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <WIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <p className="text-sm font-display font-bold truncate">{item.title}</p>
                          </div>
                          <span className={`text-[10px] font-display font-bold uppercase shrink-0 ${sb?.color || "text-muted-foreground"}`}>{sb?.label || item.status}</span>
                        </div>

                        {item.content && (
                          <p className="text-[11px] text-muted-foreground line-clamp-3 mb-2 pl-5">{item.content}</p>
                        )}
                        {item.asset_url && (
                          <div className="mb-2 pl-5">
                            {item.type === "video" || item.asset_url.includes(".mp4") ? (
                              <video src={item.asset_url} controls className="w-full rounded-lg max-h-48" />
                            ) : item.type === "voiceover" || item.asset_url.startsWith("data:audio") ? (
                              <audio src={item.asset_url} controls className="w-full rounded-lg" />
                            ) : (
                              <img src={item.asset_url} alt={item.title} className="w-full rounded-lg max-h-48 object-contain" />
                            )}
                          </div>
                        )}
                        {item.reviewer_feedback && item.status === "needs_revision" && (
                          <div className="mb-2 pl-5 p-2 rounded-lg bg-orange-500/[0.07] border border-orange-500/20">
                            <p className="text-[10px] font-display font-bold text-orange-400 mb-0.5">Feedback</p>
                            <p className="text-[11px] text-muted-foreground">{item.reviewer_feedback}</p>
                          </div>
                        )}
                        {item.creator_name && access?.canReview && (
                          <p className="text-[10px] text-muted-foreground pl-5 mb-2">by {item.creator_name}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pl-5 flex-wrap">
                          {item.status === "draft" && !wt?.heavy && (
                            <Button size="sm" variant="outline" onClick={() => { setShowGenerate(item); setGeneratePrompt(""); }} className="h-6 text-[10px] rounded-lg gap-1" data-testid={`btn-generate-${item.id}`}>
                              <Zap className="w-2.5 h-2.5" /> Generate AI
                            </Button>
                          )}
                          {item.status === "draft" && wt?.heavy && (
                            <Button size="sm" variant="outline" onClick={() => { setShowGenerate(item); setGeneratePrompt(""); }} className="h-6 text-[10px] rounded-lg gap-1 border-yellow-500/30 text-yellow-400" data-testid={`btn-generate-media-${item.id}`}>
                              <Zap className="w-2.5 h-2.5" /> Generate (${(getToolCost(wt.costKey)/100).toFixed(2)})
                            </Button>
                          )}
                          {["draft", "needs_revision"].includes(item.status) && (
                            <Button size="sm" onClick={() => submitMutation.mutate(item.id)} disabled={submitMutation.isPending} className="h-6 text-[10px] rounded-lg gap-1" data-testid={`btn-submit-${item.id}`}>
                              <Send className="w-2.5 h-2.5" /> Submit
                            </Button>
                          )}
                          {item.status === "submitted" && access?.canReview && (
                            <>
                              <Button size="sm" onClick={() => approveMutation.mutate(item.id)} disabled={approveMutation.isPending} className="h-6 text-[10px] rounded-lg gap-1 bg-green-600 hover:bg-green-700" data-testid={`btn-approve-${item.id}`}>
                                <CheckCircle className="w-2.5 h-2.5" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setReviewTarget(item); setReviewFeedback(""); }} className="h-6 text-[10px] rounded-lg gap-1 border-red-500/30 text-red-400" data-testid={`btn-reject-${item.id}`}>
                                <RotateCcw className="w-2.5 h-2.5" /> Revise
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="brief">
              <div className="space-y-3">
                {[
                  { label:"Goal", value:campaign.goal },
                  { label:"Audience", value:campaign.audience },
                  { label:"Approved Messaging", value:campaign.approved_messaging },
                  { label:"Required CTA", value:campaign.required_cta },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="rounded-xl border border-border/20 bg-card p-3.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{f.label}</p>
                    <p className="text-sm leading-relaxed">{f.value}</p>
                  </div>
                ))}
                {Array.isArray(campaign.hashtags) && campaign.hashtags.length > 0 && (
                  <div className="rounded-xl border border-border/20 bg-card p-3.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground mb-2">Hashtags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {campaign.hashtags.map((tag: string) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {access?.canAdmin && (
              <TabsContent value="team">
                <div className="space-y-2">
                  {assignments.length === 0 ? (
                    <div className="rounded-xl border border-border/20 bg-card p-6 text-center">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No creators assigned to this campaign.</p>
                      <p className="text-xs text-muted-foreground mt-1">Assign creators from the admin panel.</p>
                    </div>
                  ) : assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-border/15 bg-card">
                      <div>
                        <p className="text-sm font-display font-bold">{a.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-muted-foreground">${(a.spent_cents/100).toFixed(2)} / ${(a.spending_limit_cents/100).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground">{a.active ? "Active" : "Inactive"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* New work item dialog */}
        <Dialog open={showNewItem} onOpenChange={setShowNewItem}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Work Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Title</label>
                <input value={newItem.title} onChange={e => setNewItem(p => ({...p, title: e.target.value}))} placeholder="e.g. Day-1 OG TikTok Script" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="input-item-title" />
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {WORK_ITEM_TYPES.map(t => (
                    <button key={t.key} onClick={() => setNewItem(p => ({...p, type: t.key}))}
                      className={`flex flex-col items-center p-2.5 rounded-xl border text-center transition-colors ${newItem.type === t.key ? "border-primary bg-primary/10 text-primary" : "border-border/20 bg-card text-muted-foreground"}`}
                      data-testid={`type-${t.key}`}>
                      <t.icon className="w-4 h-4 mb-1" />
                      <span className="text-[10px] font-display font-bold">{t.label}</span>
                      {t.heavy && <span className="text-[8px] text-yellow-400 mt-0.5">$cost</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Notes (optional)</label>
                <textarea value={newItem.notes} onChange={e => setNewItem(p => ({...p, notes: e.target.value}))} placeholder="Any specific instructions for this item..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" rows={2} data-testid="textarea-item-notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewItem(false)}>Cancel</Button>
              <Button onClick={() => createItemMutation.mutate()} disabled={!newItem.title || createItemMutation.isPending} data-testid="button-save-work-item">
                {createItemMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generate AI dialog */}
        <Dialog open={!!showGenerate} onOpenChange={() => { setShowGenerate(null); setGeneratePrompt(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate with AI — {showGenerate?.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-primary/[0.06] border border-primary/15 p-3">
                <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider mb-1">Brand AI Active</p>
                <p className="text-[11px] text-muted-foreground">GUBER's brand context is automatically included. You don't need to explain what GUBER is.</p>
              </div>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Your prompt</label>
                <textarea
                  value={generatePrompt}
                  onChange={e => setGeneratePrompt(e.target.value)}
                  placeholder={showGenerate?.type === "script" ? "Write a 30-second TikTok script promoting Day-1 OG. Use the hook: 'You still have time.'" : "Describe what you want to create..."}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                  rows={4}
                  data-testid="textarea-generate-prompt"
                />
              </div>
              {showGenerate && WTYPE[showGenerate.type]?.heavy && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-yellow-500/[0.07] border border-yellow-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <p className="text-[11px] text-yellow-300">
                    This will cost <strong>${(getToolCost(WTYPE[showGenerate.type].costKey)/100).toFixed(3)}</strong> from your campaign budget.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerate(null)}>Cancel</Button>
              <Button
                onClick={() => showGenerate && generateMutation.mutate({ toolKey: WTYPE[showGenerate.type]?.costKey || "ai_script", prompt: generatePrompt })}
                disabled={!generatePrompt.trim() || generateMutation.isPending}
                data-testid="button-run-generate"
              >
                {generateMutation.isPending ? "Generating…" : <><Zap className="w-3.5 h-3.5 mr-1.5" />Generate</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review / feedback dialog */}
        <Dialog open={!!reviewTarget} onOpenChange={() => { setReviewTarget(null); setReviewFeedback(""); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Back for Revision</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{reviewTarget?.title}</p>
              <div>
                <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Feedback for creator</label>
                <textarea value={reviewFeedback} onChange={e => setReviewFeedback(e.target.value)} placeholder="What needs to change? Be specific." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" rows={3} data-testid="textarea-review-feedback" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button onClick={() => reviewTarget && rejectMutation.mutate({ itemId: reviewTarget.id, feedback: reviewFeedback })} disabled={rejectMutation.isPending} variant="destructive" data-testid="button-send-revision">
                {rejectMutation.isPending ? "Sending…" : "Send for Revision"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </LabLayout>
    </AccessGate>
  );
}
