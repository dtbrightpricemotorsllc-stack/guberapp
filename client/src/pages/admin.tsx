import { useState, useEffect } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
Shield, Users, Briefcase, AlertTriangle, Gavel, Ban, ChevronRight, FolderTree, Plus,
CheckCircle, Lock, Camera, Video, MapPin, Image, Edit, Save, X, ScrollText,
FileText, Clock, Eye, ShieldCheck, UserCheck, RefreshCw, Mail, Loader2, Trash2, Navigation,
DollarSign, Zap, MessageSquare, Bell, Brain, CalendarDays, BadgeCheck, AlertCircle, Info,
ExternalLink, ThumbsUp, ThumbsDown, Flame, Building2, XCircle, Search
} from "lucide-react";
import type { User, Job, VICategory, UseCase, CatalogServiceType, DetailOptionSet, ProofTemplate, ProofChecklistItem, AuditLog, ProofSubmission, WalletTransaction } from "@shared/schema";
import { Day1OGLogo } from "@/components/trust-badge";

const RESTRICTION_CATEGORIES = [
"Skilled Labor", "On-Demand Help", "General Labor", "Barter Labor", "Marketplace", "Verify & Inspect"
];

function JobChecklistEditor() {
const { toast } = useToast();
const [editingId, setEditingId] = useState<number | null>(null);
const [editForm, setEditForm] = useState<Partial<DetailOptionSet>>({});
const [showCreate, setShowCreate] = useState(false);
const [selectedCategory, setSelectedCategory] = useState<string>("Skilled Labor");
const [selectedServiceType, setSelectedServiceType] = useState<string>("all");

const [newChecklist, setNewChecklist] = useState({
name: "",
label: "",
fieldType: "single_select",
options: [] as string[],
required: true,
sortOrder: 0,
optionsText: "",
});

const { data: catalog, isLoading: isCatalogLoading } = useQuery<{
viCategories: VICategory[];
useCases: UseCase[];
serviceTypes: CatalogServiceType[];
detailOptionSets: DetailOptionSet[];
proofTemplates: ProofTemplate[];
}>({ queryKey: ["/api/catalog/all"], staleTime: 300_000 });

const { data: checklists, isLoading: isChecklistsLoading } = useQuery<DetailOptionSet[]>({
queryKey: ["/api/checklist-options", { category: selectedCategory, serviceTypeName: selectedServiceType === "all" ? undefined : selectedServiceType }],
queryFn: async ({ queryKey }) => {
const [_path, params] = queryKey as [string, any];
const searchParams = new URLSearchParams();
if (params.category) searchParams.append("category", params.category);
if (params.serviceTypeName) searchParams.append("serviceTypeName", params.serviceTypeName);
const res = await fetch(`${_path}?${searchParams.toString()}`);
if (!res.ok) throw new Error("Failed to fetch checklists");
return res.json();
}
});

const createMutation = useMutation({
mutationFn: (data: any) => apiRequest("POST", "/api/admin/job-checklists", data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/checklist-options"] });
toast({ title: "Checklist created" });
setShowCreate(false);
setNewChecklist({ name: "", label: "", fieldType: "single_select", options: [], required: true, sortOrder: 0, optionsText: "" });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const updateMutation = useMutation({
mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/job-checklists/${id}`, data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/checklist-options"] });
toast({ title: "Checklist updated" });
setEditingId(null);
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const deleteMutation = useMutation({
mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/job-checklists/${id}`),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/checklist-options"] });
toast({ title: "Checklist deleted" });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

if (isCatalogLoading) return <Skeleton className="h-20 w-full" />;

const categories = ["Skilled Labor", "On-Demand Help", "General Labor", "Barter Labor", "Marketplace"];
const serviceTypesForCategory = (catalog?.serviceTypes || [])
.filter(st => {
// This logic might need adjustment based on how serviceTypes are linked to RESTRICTION_CATEGORIES
// But for now we just show all if they match or use cases
return true;
})
.map(st => st.name);

// Hardcoded mapping for now if catalog is not filtered correctly
const categoryToServiceTypes: Record<string, string[]> = {
"Skilled Labor": ["Electrical", "Plumbing", "HVAC", "Carpentry", "Painting", "Flooring", "Roofing"],
"On-Demand Help": ["Pet Care", "Errand Running", "Delivery", "Moving", "Event Help", "Tech Support"],
"General Labor": ["Lawn Care", "Cleaning", "Moving", "Pressure Washing", "Hauling/Junk", "Assembly"],
"Barter Labor": ["Trade Services", "Skill Exchange", "Item Exchange"],
"Marketplace": ["Buy/Sell", "Rent", "Free Items"]
};

const availableServiceTypes = categoryToServiceTypes[selectedCategory] || [];

return (
<div className="space-y-4" data-testid="admin-job-checklists">
<div className="flex flex-col gap-4">
<div className="flex items-center gap-2">
<FolderTree className="w-4 h-4 guber-text-green" />
<h3 className="font-display font-semibold text-sm">Job Checklists Management</h3>
</div>

<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
<Select value={selectedCategory} onValueChange={setSelectedCategory}>
<SelectTrigger className="bg-background border-border/20 text-xs" data-testid="select-checklist-category">
<SelectValue />
</SelectTrigger>
<SelectContent>
{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
</SelectContent>
</Select>
</div>
<div>
<label className="text-[10px] text-muted-foreground mb-1 block">Service Type</label>
<Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
<SelectTrigger className="bg-background border-border/20 text-xs" data-testid="select-checklist-servicetype">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="all">All types</SelectItem>
{availableServiceTypes.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
</SelectContent>
</Select>
</div>
</div>

<Button size="sm" onClick={() => setShowCreate(!showCreate)} data-testid="button-new-checklist">
<Plus className="w-3 h-3 mr-1" /> New Option Set
</Button>
</div>

{showCreate && (
<div className="bg-card rounded-xl border border-border/20 p-4 space-y-3" data-testid="form-new-checklist">
<h4 className="text-xs font-display font-semibold text-muted-foreground">Create New Option Set</h4>
<div className="grid grid-cols-2 gap-3">
<Input value={newChecklist.name} onChange={e => setNewChecklist({ ...newChecklist, name: e.target.value })}
placeholder="Internal name (e.g. lawn_mowing_freq)" className="bg-background border-border/20 text-xs" data-testid="input-checklist-name" />
<Input value={newChecklist.label} onChange={e => setNewChecklist({ ...newChecklist, label: e.target.value })}
placeholder="Display label (e.g. How often?)" className="bg-background border-border/20 text-xs" data-testid="input-checklist-label" />
</div>
<div className="grid grid-cols-2 gap-3">
<Select value={newChecklist.fieldType} onValueChange={v => setNewChecklist({ ...newChecklist, fieldType: v })}>
<SelectTrigger className="bg-background border-border/20 text-xs" data-testid="select-checklist-type">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="single_select">Single Select</SelectItem>
<SelectItem value="multi_select">Multi Select</SelectItem>
<SelectItem value="yes_no">Yes/No</SelectItem>
<SelectItem value="number_input">Number Input</SelectItem>
</SelectContent>
</Select>
<Input type="number" value={newChecklist.sortOrder} onChange={e => setNewChecklist({ ...newChecklist, sortOrder: parseInt(e.target.value) || 0 })}
placeholder="Sort order" className="bg-background border-border/20 text-xs" data-testid="input-checklist-sort" />
</div>

{(newChecklist.fieldType === "single_select" || newChecklist.fieldType === "multi_select") && (
<div className="space-y-1">
<label className="text-[10px] text-muted-foreground">Options (comma separated)</label>
<Input value={newChecklist.optionsText} onChange={e => setNewChecklist({ ...newChecklist, optionsText: e.target.value })}
placeholder="Option 1, Option 2, Option 3" className="bg-background border-border/20 text-xs" data-testid="input-checklist-options" />
</div>
)}

<div className="flex items-center gap-2">
<Checkbox id="new-req" checked={newChecklist.required} onCheckedChange={v => setNewChecklist({ ...newChecklist, required: !!v })} />
<label htmlFor="new-req" className="text-xs">Required field</label>
</div>

<div className="flex gap-2 pt-1">
<Button size="sm" disabled={!newChecklist.name || !newChecklist.label || createMutation.isPending}
onClick={() => {
const options = newChecklist.optionsText ? newChecklist.optionsText.split(",").map(o => o.trim()).filter(Boolean) : [];
createMutation.mutate({
...newChecklist,
category: selectedCategory,
serviceTypeName: selectedServiceType === "all" ? null : selectedServiceType,
options
});
}} data-testid="button-submit-checklist">
<Save className="w-3 h-3 mr-1" /> Create
</Button>
<Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
</div>
</div>
)}

<div className="space-y-2">
{isChecklistsLoading ? (
Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
) : (checklists || []).length === 0 ? (
<p className="text-center py-8 text-muted-foreground text-xs bg-muted/5 rounded-xl border border-dashed border-border/20">
No checklists found for this selection
</p>
) : (
checklists?.map(item => {
const isEditing = editingId === item.id;
return (
<div key={item.id} className="bg-card rounded-xl border border-border/20 p-3 space-y-3" data-testid={`checklist-item-${item.id}`}>
{isEditing ? (
<div className="space-y-3">
<div className="grid grid-cols-2 gap-3">
<Input value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
className="bg-background border-border/20 text-xs" />
<Input value={editForm.label || ""} onChange={e => setEditForm({ ...editForm, label: e.target.value })}
className="bg-background border-border/20 text-xs" />
</div>
{(item.fieldType === "single_select" || item.fieldType === "multi_select") && (
<Input value={(editForm as any).optionsText || ""} 
onChange={e => setEditForm({ ...editForm, [ "optionsText" as any]: e.target.value })}
placeholder="Options (comma separated)" className="bg-background border-border/20 text-xs" />
)}
<div className="flex justify-between items-center">
<div className="flex items-center gap-4">
<div className="flex items-center gap-2">
<Checkbox id={`edit-req-${item.id}`} checked={editForm.required ?? false} onCheckedChange={v => setEditForm({ ...editForm, required: !!v })} />
<label htmlFor={`edit-req-${item.id}`} className="text-xs">Required</label>
</div>
<Input type="number" value={editForm.sortOrder || 0} onChange={e => setEditForm({ ...editForm, sortOrder: parseInt(e.target.value) || 0 })}
className="w-16 h-8 bg-background border-border/20 text-xs" />
</div>
<div className="flex gap-2">
<Button size="sm" onClick={() => {
const options = (editForm as any).optionsText ? (editForm as any).optionsText.split(",").map((o: string) => o.trim()).filter(Boolean) : item.options;
updateMutation.mutate({ id: item.id, data: { ...editForm, options } });
}} data-testid={`button-save-checklist-${item.id}`}>Save</Button>
<Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
</div>
</div>
</div>
) : (
<div className="flex items-center justify-between gap-3">
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2 mb-0.5">
<span className="text-sm font-semibold truncate">{item.label}</span>
<Badge variant="outline" className="text-[8px] uppercase">{item.fieldType.replace("_", " ")}</Badge>
{item.required && <Badge className="text-[8px] bg-red-500/10 text-red-500 border-red-500/20">Required</Badge>}
</div>
<p className="text-[10px] text-muted-foreground truncate">
ID: {item.name} • Sort: {item.sortOrder}
{item.options && item.options.length > 0 && ` • Options: ${item.options.join(", ")}`}
</p>
</div>
<div className="flex items-center gap-1">
<Button size="icon" variant="ghost" onClick={() => {
setEditingId(item.id);
setEditForm({ ...item, ["optionsText" as any]: item.options?.join(", ") || "" });
}} data-testid={`button-edit-checklist-${item.id}`}>
<Edit className="w-3 h-3" />
</Button>
<Button size="icon" variant="ghost" onClick={() => {
if (confirm("Delete this checklist item?")) deleteMutation.mutate(item.id);
}} data-testid={`button-delete-checklist-${item.id}`}>
<X className="w-3 h-3 text-destructive" />
</Button>
</div>
</div>
)}
</div>
);
})
)}
</div>
</div>
);
}

function ProofTemplateEditor() {
const { toast } = useToast();
const [editingId, setEditingId] = useState<number | null>(null);
const [editForm, setEditForm] = useState<Record<string, any>>({});
const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
const [showCreate, setShowCreate] = useState(false);
const [newTemplate, setNewTemplate] = useState({
name: "", requiredPhotoCount: 1, requiredVideo: false, videoDuration: "",
geoRequired: false, allowGalleryUpload: false,
});
const [newChecklist, setNewChecklist] = useState({
label: "", instruction: "", mediaType: "photo", quantityRequired: 1, geoRequired: false,
});

const { data: catalog, isLoading } = useQuery<{
viCategories: VICategory[]; useCases: UseCase[]; serviceTypes: CatalogServiceType[];
detailOptionSets: DetailOptionSet[]; proofTemplates: ProofTemplate[];
}>({ queryKey: ["/api/catalog/all"], staleTime: 300_000 });

const { data: templateDetails } = useQuery<ProofTemplate & { checklistItems: ProofChecklistItem[] }>({
queryKey: ["/api/catalog/proof-template", expandedTemplate],
enabled: !!expandedTemplate,
});

const editMutation = useMutation({
mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/proof-template/${id}`, data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/catalog/all"] });
queryClient.invalidateQueries({ queryKey: ["/api/catalog/proof-template", editingId] });
toast({ title: "Template updated" });
setEditingId(null);
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const createMutation = useMutation({
mutationFn: (data: any) => apiRequest("POST", "/api/admin/catalog/proof-template", data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/catalog/all"] });
toast({ title: "Template created" });
setShowCreate(false);
setNewTemplate({ name: "", requiredPhotoCount: 1, requiredVideo: false, videoDuration: "", geoRequired: false, allowGalleryUpload: false });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const addChecklistMutation = useMutation({
mutationFn: (data: any) => apiRequest("POST", "/api/admin/catalog/proof-checklist-item", data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/catalog/proof-template", expandedTemplate] });
toast({ title: "Checklist item added" });
setNewChecklist({ label: "", instruction: "", mediaType: "photo", quantityRequired: 1, geoRequired: false });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

const pts = catalog?.proofTemplates || [];

return (
<div className="space-y-3" data-testid="admin-proof-editor">
<div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
<div className="flex items-center gap-2">
<Camera className="w-4 h-4 guber-text-green" />
<h3 className="font-display font-semibold text-sm">Proof Template Editor</h3>
</div>
<Button size="sm" onClick={() => setShowCreate(!showCreate)} data-testid="button-new-template">
<Plus className="w-3 h-3 mr-1" /> New Template
</Button>
</div>

{showCreate && (
<div className="bg-card rounded-xl border border-border/20 p-4 space-y-3" data-testid="form-new-template">
<h4 className="text-xs font-display font-semibold text-muted-foreground">Create New Template</h4>
<Input value={newTemplate.name} onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
placeholder="Template name..." className="bg-background border-border/20" data-testid="input-template-name" />
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-[10px] text-muted-foreground">Required Photos</label>
<Input type="number" min={0} value={newTemplate.requiredPhotoCount}
onChange={e => setNewTemplate({ ...newTemplate, requiredPhotoCount: parseInt(e.target.value) || 0 })}
className="bg-background border-border/20" data-testid="input-template-photos" />
</div>
<div>
<label className="text-[10px] text-muted-foreground">Video Duration</label>
<Input value={newTemplate.videoDuration} onChange={e => setNewTemplate({ ...newTemplate, videoDuration: e.target.value })}
placeholder="e.g. 30s" className="bg-background border-border/20" data-testid="input-template-duration" />
</div>
</div>
<div className="flex flex-wrap gap-4">
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={newTemplate.requiredVideo} onCheckedChange={v => setNewTemplate({ ...newTemplate, requiredVideo: !!v })} data-testid="check-template-video" />
Video Required
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={newTemplate.geoRequired} onCheckedChange={v => setNewTemplate({ ...newTemplate, geoRequired: !!v })} data-testid="check-template-geo" />
GPS Required
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={newTemplate.allowGalleryUpload} onCheckedChange={v => setNewTemplate({ ...newTemplate, allowGalleryUpload: !!v })} data-testid="check-template-gallery" />
Allow Gallery
</label>
</div>
<div className="flex gap-2">
<Button size="sm" disabled={!newTemplate.name || createMutation.isPending}
onClick={() => createMutation.mutate(newTemplate)} data-testid="button-create-template">
<Save className="w-3 h-3 mr-1" /> Create
</Button>
<Button size="sm" variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-template">
<X className="w-3 h-3 mr-1" /> Cancel
</Button>
</div>
</div>
)}

<div className="space-y-2">
{pts.map(pt => {
const isEditing = editingId === pt.id;
const isExpanded = expandedTemplate === pt.id;

return (
<div key={pt.id} className="bg-card rounded-xl border border-border/20 overflow-hidden" data-testid={`proof-template-${pt.id}`}>
<div className="flex items-center justify-between p-3 gap-2">
<button className="flex items-center gap-2 min-w-0 flex-1 text-left"
onClick={() => setExpandedTemplate(isExpanded ? null : pt.id)}
data-testid={`toggle-template-${pt.id}`}>
<ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
<span className="text-sm font-semibold truncate">{pt.name}</span>
</button>
<div className="flex items-center gap-1 shrink-0 flex-wrap">
<Badge variant="outline" className="text-[8px]"><Camera className="w-2.5 h-2.5 mr-0.5" />{pt.requiredPhotoCount}</Badge>
{pt.requiredVideo && <Badge variant="outline" className="text-[8px]"><Video className="w-2.5 h-2.5 mr-0.5" />{pt.videoDuration || "Yes"}</Badge>}
{pt.geoRequired && <Badge variant="outline" className="text-[8px]"><MapPin className="w-2.5 h-2.5 mr-0.5" />GPS</Badge>}
{pt.allowGalleryUpload && <Badge variant="outline" className="text-[8px]"><Image className="w-2.5 h-2.5 mr-0.5" />Gallery</Badge>}
<Button size="icon" variant="ghost" onClick={() => {
if (isEditing) { setEditingId(null); } else {
setEditingId(pt.id);
setEditForm({ requiredPhotoCount: pt.requiredPhotoCount, requiredVideo: pt.requiredVideo, geoRequired: pt.geoRequired, allowGalleryUpload: pt.allowGalleryUpload, videoDuration: pt.videoDuration || "" });
}
}} data-testid={`button-edit-template-${pt.id}`}>
<Edit className="w-3 h-3" />
</Button>
</div>
</div>

{isEditing && (
<div className="border-t border-border/10 px-3 pb-3 pt-2 space-y-2" data-testid={`edit-form-template-${pt.id}`}>
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-[10px] text-muted-foreground">Photos Required</label>
<Input type="number" min={0} value={editForm.requiredPhotoCount}
onChange={e => setEditForm({ ...editForm, requiredPhotoCount: parseInt(e.target.value) || 0 })}
className="bg-background border-border/20" data-testid={`input-edit-photos-${pt.id}`} />
</div>
<div>
<label className="text-[10px] text-muted-foreground">Video Duration</label>
<Input value={editForm.videoDuration} onChange={e => setEditForm({ ...editForm, videoDuration: e.target.value })}
className="bg-background border-border/20" data-testid={`input-edit-duration-${pt.id}`} />
</div>
</div>
<div className="flex flex-wrap gap-4">
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={editForm.requiredVideo} onCheckedChange={v => setEditForm({ ...editForm, requiredVideo: !!v })} data-testid={`check-edit-video-${pt.id}`} />
Video Required
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={editForm.geoRequired} onCheckedChange={v => setEditForm({ ...editForm, geoRequired: !!v })} data-testid={`check-edit-geo-${pt.id}`} />
GPS Required
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox checked={editForm.allowGalleryUpload} onCheckedChange={v => setEditForm({ ...editForm, allowGalleryUpload: !!v })} data-testid={`check-edit-gallery-${pt.id}`} />
Allow Gallery
</label>
</div>
<div className="flex gap-2">
<Button size="sm" disabled={editMutation.isPending}
onClick={() => editMutation.mutate({ id: pt.id, data: editForm })} data-testid={`button-save-template-${pt.id}`}>
<Save className="w-3 h-3 mr-1" /> Save
</Button>
<Button size="sm" variant="outline" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-${pt.id}`}>
Cancel
</Button>
</div>
</div>
)}

{isExpanded && (
<div className="border-t border-border/10 px-3 pb-3 pt-2 space-y-2">
<p className="text-[10px] text-muted-foreground font-semibold">Checklist Items</p>
{templateDetails?.checklistItems && templateDetails.checklistItems.length > 0 ? (
<div className="space-y-1">
{templateDetails.checklistItems.map(item => (
<div key={item.id} className="flex items-center justify-between py-1.5 px-2 bg-muted/10 rounded text-[11px]" data-testid={`checklist-item-${item.id}`}>
<div className="flex items-center gap-1.5 min-w-0">
<CheckCircle className="w-3 h-3 text-primary shrink-0" />
<span className="truncate font-medium">{item.label}</span>
{item.instruction && <span className="text-muted-foreground truncate">- {item.instruction}</span>}
</div>
<div className="flex gap-1 shrink-0">
<Badge variant="outline" className="text-[8px]">{item.mediaType}</Badge>
<Badge variant="outline" className="text-[8px]">x{item.quantityRequired}</Badge>
{item.geoRequired && <Badge variant="outline" className="text-[8px]">GPS</Badge>}
</div>
</div>
))}
</div>
) : (
<p className="text-[10px] text-muted-foreground">No checklist items yet</p>
)}

<div className="pt-2 border-t border-border/10 space-y-2">
<p className="text-[10px] text-muted-foreground font-semibold">Add Checklist Item</p>
<div className="grid grid-cols-2 gap-2">
<Input value={newChecklist.label} onChange={e => setNewChecklist({ ...newChecklist, label: e.target.value })}
placeholder="Label..." className="bg-background border-border/20 text-xs" data-testid="input-checklist-label" />
<Input value={newChecklist.instruction} onChange={e => setNewChecklist({ ...newChecklist, instruction: e.target.value })}
placeholder="Instruction..." className="bg-background border-border/20 text-xs" data-testid="input-checklist-instruction" />
</div>
<div className="flex gap-2 items-end flex-wrap">
<div>
<label className="text-[10px] text-muted-foreground">Media Type</label>
<Select value={newChecklist.mediaType} onValueChange={v => setNewChecklist({ ...newChecklist, mediaType: v })}>
<SelectTrigger className="w-24 text-xs bg-background border-border/20" data-testid="select-checklist-media">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="photo">Photo</SelectItem>
<SelectItem value="video">Video</SelectItem>
<SelectItem value="document">Document</SelectItem>
</SelectContent>
</Select>
</div>
<div>
<label className="text-[10px] text-muted-foreground">Qty</label>
<Input type="number" min={1} value={newChecklist.quantityRequired}
onChange={e => setNewChecklist({ ...newChecklist, quantityRequired: parseInt(e.target.value) || 1 })}
className="w-16 bg-background border-border/20 text-xs" data-testid="input-checklist-qty" />
</div>
<label className="flex items-center gap-1 text-xs pb-1">
<Checkbox checked={newChecklist.geoRequired} onCheckedChange={v => setNewChecklist({ ...newChecklist, geoRequired: !!v })} data-testid="check-checklist-geo" />
GPS
</label>
<Button size="sm" disabled={!newChecklist.label || addChecklistMutation.isPending}
onClick={() => addChecklistMutation.mutate({ templateId: pt.id, ...newChecklist })}
data-testid="button-add-checklist-item">
<Plus className="w-3 h-3 mr-1" /> Add
</Button>
</div>
</div>
</div>
)}
</div>
);
})}
</div>
</div>
);
}

function AuditLogTab() {
const [actionFilter, setActionFilter] = useState<string>("all");

const { data: logs, isLoading } = useQuery<AuditLog[]>({
queryKey: ["/api/admin/audit-logs"],
staleTime: 30_000,
});

if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>;

const allActions = Array.from(new Set((logs || []).map(l => l.action)));
const filtered = actionFilter === "all" ? (logs || []) : (logs || []).filter(l => l.action === actionFilter);

function getActionColor(action: string) {
if (action === "contact_info_blocked") return "bg-destructive/10 text-destructive border-destructive/30";
if (action.startsWith("admin_")) return "bg-blue-500/10 text-blue-400 border-blue-500/30";
if (action.startsWith("dispute_")) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
return "bg-muted/30 text-muted-foreground border-border/30";
}

return (
<div className="space-y-3" data-testid="admin-audit-logs">
<div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
<div className="flex items-center gap-2">
<ScrollText className="w-4 h-4 guber-text-green" />
<h3 className="font-display font-semibold text-sm">Audit Log</h3>
<span className="text-[10px] text-muted-foreground">({filtered.length} entries)</span>
</div>
<Select value={actionFilter} onValueChange={setActionFilter}>
<SelectTrigger className="w-48 bg-background border-border/20 text-xs" data-testid="select-audit-filter">
<SelectValue placeholder="Filter by action" />
</SelectTrigger>
<SelectContent>
<SelectItem value="all">All Actions</SelectItem>
{allActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
</SelectContent>
</Select>
</div>

<div className="bg-card rounded-xl border border-border/20 overflow-hidden">
<div className="overflow-x-auto scrollbar-none">
<div className="min-w-[500px]">
<div className="grid grid-cols-[110px_110px_140px_1fr] gap-2 p-2 border-b border-border/10 text-[10px] text-muted-foreground font-semibold">
<span>Timestamp</span>
<span>User</span>
<span>Action</span>
<span>Details</span>
</div>
<div className="max-h-[500px] overflow-y-auto">
{filtered.length === 0 ? (
<p className="text-center py-6 text-muted-foreground text-xs">No audit logs found</p>
) : (
filtered.map(log => (
<div key={log.id} className="grid grid-cols-[110px_110px_140px_1fr] gap-2 p-2 border-b border-border/5 text-[11px] items-center" data-testid={`audit-log-${log.id}`}>
<span className="text-muted-foreground truncate">
{log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
</span>
<span className="text-muted-foreground truncate" data-testid={`audit-user-${log.id}`}>
{(log as any).username || log.userId || "-"}
{log.userId && <span className="text-[9px] text-muted-foreground ml-0.5">#{log.userId}</span>}
</span>
<Badge variant="outline" className={`text-[8px] ${getActionColor(log.action)}`} data-testid={`audit-action-${log.id}`}>
{log.action}
</Badge>
<span className="text-muted-foreground truncate" data-testid={`audit-details-${log.id}`}>{log.details || "-"}</span>
</div>
))
)}
</div>
</div>
</div>
</div>
</div>
);
}

function DisputeProofInline({ jobId }: { jobId: number }) {
const { data: proofs, isLoading } = useQuery<ProofSubmission[]>({
queryKey: ["/api/admin/jobs", jobId, "proof"],
});

if (isLoading) return <Skeleton className="h-8 rounded" />;
if (!proofs || proofs.length === 0) return <p className="text-[10px] text-muted-foreground">No proof submissions</p>;

return (
<div className="space-y-2 mt-2">
<p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
<Eye className="w-3 h-3" /> Proof Submissions ({proofs.length})
</p>
{proofs.map(p => {
let images: string[] = [];
try { if (p.imageUrls) images = JSON.parse(p.imageUrls); } catch { if (p.imageUrls) images = [p.imageUrls]; }
return (
<div key={p.id} className="bg-muted/10 rounded p-2 text-[10px] space-y-2" data-testid={`proof-submission-${p.id}`}>
<div className="flex items-center gap-2 flex-wrap">
{images.length > 0 && <Badge variant="outline" className="text-[8px]"><Camera className="w-2.5 h-2.5 mr-0.5" />{images.length} photo{images.length !== 1 ? "s" : ""}</Badge>}
{p.videoUrl && <Badge variant="outline" className="text-[8px]"><Video className="w-2.5 h-2.5 mr-0.5" />Video</Badge>}
{p.gpsLat && p.gpsLng && <Badge variant="outline" className="text-[8px]"><MapPin className="w-2.5 h-2.5 mr-0.5" />{p.gpsLat.toFixed(4)}, {p.gpsLng.toFixed(4)}</Badge>}
{p.verified && <Badge variant="outline" className="text-[8px] bg-primary/10 text-primary border-primary/30">Verified</Badge>}
{p.notEncountered && <Badge variant="outline" className="text-[8px] bg-destructive/10 text-destructive border-destructive/30">Not Encountered</Badge>}
</div>
{images.length > 0 && (
<div className="flex gap-1.5 flex-wrap">
{images.map((img, i) => (
<a key={i} href={img} target="_blank" rel="noopener noreferrer" data-testid={`admin-proof-img-${p.id}-${i}`}>
<img src={img} alt={`Proof ${i + 1}`} className="w-16 h-16 rounded object-cover border border-border/20 hover:opacity-80 transition-opacity" />
</a>
))}
</div>
)}
{p.notes && <p className="text-muted-foreground">{p.notes}</p>}
{p.notEncounteredReason && <p className="text-muted-foreground">Reason: {p.notEncounteredReason}</p>}
</div>
);
})}
</div>
);
}

function ProofModal({ jobId, jobTitle, onClose }: { jobId: number; jobTitle: string; onClose: () => void }) {
const { data: proofs, isLoading } = useQuery<ProofSubmission[]>({
queryKey: ["/api/admin/jobs", jobId, "proof"],
});

return (
<div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
<div
className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
style={{ border: "1px solid rgba(255,255,255,0.08)" }}
onClick={e => e.stopPropagation()}
data-testid="modal-proof-viewer"
>
<div className="flex items-center justify-between mb-4">
<div>
<h2 className="text-base font-display font-bold">Proof Photos</h2>
<p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[250px]">{jobTitle}</p>
</div>
<button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10" data-testid="button-close-proof-modal">
<X className="w-5 h-5 text-muted-foreground" />
</button>
</div>

{isLoading && <div className="space-y-2"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>}

{!isLoading && (!proofs || proofs.length === 0) && (
<div className="text-center py-10">
<Image className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
<p className="text-sm text-muted-foreground font-display">No proof submissions yet</p>
</div>
)}

{proofs && proofs.length > 0 && (
<div className="space-y-4">
{proofs.map((p, idx) => {
let images: string[] = [];
try { if (p.imageUrls) images = JSON.parse(p.imageUrls); } catch { if (p.imageUrls) images = [p.imageUrls]; }
return (
<div key={p.id} className="bg-muted/10 rounded-xl p-3 space-y-2" data-testid={`modal-proof-${p.id}`}>
<div className="flex items-center gap-2 flex-wrap">
<span className="text-[10px] font-display text-muted-foreground font-semibold">Submission #{idx + 1}</span>
{p.notEncountered && (
<Badge variant="outline" className="text-[9px] bg-yellow-500/10 text-yellow-400 border-yellow-500/30">Cannot Complete</Badge>
)}
{p.gpsLat && p.gpsLng && (
<Badge variant="outline" className="text-[9px]">
<MapPin className="w-2.5 h-2.5 mr-0.5" />{p.gpsLat.toFixed(4)}, {p.gpsLng.toFixed(4)}
</Badge>
)}
</div>
{images.length > 0 ? (
<div className="grid grid-cols-3 gap-1.5">
{images.map((img, i) => (
<a key={i} href={img} target="_blank" rel="noopener noreferrer" data-testid={`modal-proof-img-${p.id}-${i}`}>
<img src={img} alt={`Photo ${i + 1}`} className="w-full aspect-square rounded-lg object-cover border border-border/20 hover:opacity-80 transition-opacity" />
</a>
))}
</div>
) : (
<p className="text-[10px] text-muted-foreground">No photos attached</p>
)}
{p.notes && <p className="text-[11px] text-muted-foreground bg-muted/10 rounded p-2">{p.notes}</p>}
{p.notEncounteredReason && (
<p className="text-[11px] text-yellow-400/80">Reason: {p.notEncounteredReason}</p>
)}
</div>
);
})}
</div>
)}
</div>
</div>
);
}

function CatalogTab() {
  const { toast } = useToast();
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [expandedUC, setExpandedUC] = useState<number | null>(null);
  const [newUCName, setNewUCName] = useState("");
  const [newUCTier, setNewUCTier] = useState("community");
  const [newSTName, setNewSTName] = useState("");

  const { data: catalog, isLoading } = useQuery<{
    viCategories: VICategory[];
    useCases: UseCase[];
    serviceTypes: CatalogServiceType[];
    detailOptionSets: DetailOptionSet[];
    proofTemplates: ProofTemplate[];
  }>({ queryKey: ["/api/catalog/all"], staleTime: 300_000 });

  const addUCMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/catalog/use-case", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/all"] });
      toast({ title: "Use case added" });
      setNewUCName("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addSTMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/catalog/service-type", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/all" ] });
      toast({ title: "Service type added" });
      setNewSTName("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  const cats = catalog?.viCategories || [];
  const ucs = catalog?.useCases || [];
  const sts = catalog?.serviceTypes || [];
  const dos = catalog?.detailOptionSets || [];
  const pts = catalog?.proofTemplates || [];

  return (
    <div className="space-y-6" data-testid="admin-catalog">
      <div className="glass-card rounded-2xl overflow-hidden border border-border/10">
        <div className="bg-muted/5 p-4 border-b border-border/5">
          <h2 className="text-sm font-display font-bold text-foreground/80 flex items-center gap-2 uppercase tracking-widest">
            <FolderTree className="w-4 h-4 text-primary" />
            Job Checklists
          </h2>
        </div>
        <div className="p-4">
          <JobChecklistEditor />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-border/10">
        <div className="bg-muted/5 p-4 border-b border-border/5">
          <h2 className="text-sm font-display font-bold text-foreground/80 flex items-center gap-2 uppercase tracking-widest">
            <FolderTree className="w-4 h-4 text-primary" />
            V&I Dropdown Tree Catalog
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="pt-4 border-t border-border/10">
            {cats.map(cat => {
              const catUCs = ucs.filter(uc => uc.viCategoryId === cat.id);
              const catDetails = dos.filter(d => d.viCategoryId === cat.id);
              const isExpanded = expandedCat === cat.id;

              return (
                <div key={cat.id} className="bg-card rounded-xl border border-border/20 overflow-hidden mb-2 last:mb-0" data-testid={`catalog-cat-${cat.id}`}>
                  <button
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                    data-testid={`toggle-cat-${cat.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{cat.icon}</Badge>
                      <span className="text-sm font-semibold">{cat.name}</span>
                      <span className="text-[10px] text-muted-foreground">({catUCs.length} use cases)</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/10 px-3 pb-3">
                      {catDetails.length > 0 && (
                        <div className="mt-2 mb-3 p-2 bg-muted/20 rounded-lg">
                          <p className="text-[10px] text-muted-foreground font-semibold mb-1">Detail Options (Layer 4)</p>
                          <div className="flex flex-wrap gap-1">
                            {catDetails.map(d => (
                              <Badge key={d.id} variant="outline" className="text-[9px]">
                                {d.label}: {(d.options as string[])?.length || 0} options
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {catUCs.map(uc => {
                          const ucSTs = sts.filter(st => st.useCaseId === uc.id);
                          const ucExpanded = expandedUC === uc.id;

                          return (
                            <div key={uc.id} className="bg-background rounded-lg border border-border/10" data-testid={`catalog-uc-${uc.id}`}>
                              <button
                                className="w-full flex items-center justify-between p-2.5 hover:bg-muted/20 transition-colors"
                                onClick={() => setExpandedUC(ucExpanded ? null : uc.id)}
                                data-testid={`toggle-uc-${uc.id}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${ucExpanded ? "rotate-90" : ""}`} />
                                  <span className="text-[12px] font-medium truncate">{uc.name}</span>
                                  {uc.minTier !== "community" && (
                                    <Badge variant="outline" className="text-[8px] shrink-0">
                                      <Lock className="w-2.5 h-2.5 mr-0.5" />{uc.minTier}
                                    </Badge>
                                  )}
                                  <span className="text-[9px] text-muted-foreground shrink-0">({ucSTs.length} types)</span>
                                </div>
                              </button>

                              {ucExpanded && (
                                <div className="border-t border-border/5 px-3 pb-2 space-y-1">
                                  {ucSTs.map(st => {
                                    const pt = pts.find(p => p.id === st.proofTemplateId);
                                    return (
                                      <div key={st.id} className="flex items-center justify-between py-1.5 px-2 bg-muted/10 rounded text-[11px]" data-testid={`catalog-st-${st.id}`}>
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <CheckCircle className="w-3 h-3 text-primary shrink-0" />
                                          <span className="truncate">{st.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {st.credentialRequired && <Badge variant="outline" className="text-[8px]">Cred</Badge>}
                                          {st.minTier !== "community" && <Badge variant="outline" className="text-[8px]">{st.minTier}</Badge>}
                                          {pt && <Badge variant="outline" className="text-[8px] bg-secondary/10 text-secondary border-secondary/30"><Camera className="w-2 h-2 mr-0.5" />{pt.requiredPhotoCount}{pt.requiredVideo ? <><Video className="w-2 h-2 mx-0.5" /></> : ""}</Badge>}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <div className="flex gap-1.5 mt-2">
                                    <Input
                                      value={newSTName}
                                      onChange={e => setNewSTName(e.target.value)}
                                      placeholder="New service type name..."
                                      className="h-7 text-[11px] bg-background border-border/20"
                                      data-testid="input-new-service-type"
                                    />
                                    <Button
                                      size="sm"
                                      className="h-7 text-[10px] font-display px-2"
                                      disabled={!newSTName || addSTMutation.isPending}
                                      onClick={() => addSTMutation.mutate({
                                        useCaseId: uc.id,
                                        name: newSTName,
                                        minTier: uc.minTier,
                                        titleTemplate: `${uc.name} - ${newSTName}`,
                                        descriptionTemplate: `${newSTName} for ${uc.name}`,
                                      })}
                                      data-testid="button-add-service-type"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border/10">
                          <Input
                            value={newUCName}
                            onChange={e => setNewUCName(e.target.value)}
                            placeholder="New use case name..."
                            className="h-7 text-[11px] bg-background border-border/20"
                            data-testid="input-new-use-case"
                          />
                          <Select value={newUCTier} onValueChange={setNewUCTier}>
                            <SelectTrigger className="w-24 h-7 text-[10px] bg-background border-border/20" data-testid="select-new-uc-tier">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="community">Community</SelectItem>
                              <SelectItem value="verified">Verified</SelectItem>
                              <SelectItem value="credentialed">Credentialed</SelectItem>
                              <SelectItem value="elite">Elite</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-7 text-[10px] font-display px-2"
                            disabled={!newUCName || addUCMutation.isPending}
                            onClick={() => addUCMutation.mutate({
                              viCategoryId: cat.id,
                              name: newUCName,
                              minTier: newUCTier,
                            })}
                            data-testid="button-add-use-case"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function OGTab({ allUsers, usersLoading, refetchUsers }: { allUsers: User[] | undefined; usersLoading: boolean; refetchUsers: () => void }) {
  const { toast } = useToast();
  const [grantEmail, setGrantEmail] = useState("");
  const [syncResult, setSyncResult] = useState<{ activated: string[]; alreadyActive: string[]; preapproved: string[]; emailMismatch: string[]; totalScanned: number; totalOgInStripe: number } | null>(null);
  const [tbSyncResult, setTbSyncResult] = useState<{ activated: string[]; alreadyActive: string[]; preapproved: string[]; totalScanned: number } | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/reset-user-password", { email: resetEmail.trim(), newPassword: resetPassword }),
    onSuccess: () => { toast({ title: "Password reset", description: `Password updated for ${resetEmail}` }); setResetEmail(""); setResetPassword(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

const syncMutation = useMutation({
mutationFn: async () => { const r = await apiRequest("POST", "/api/admin/sync-stripe-og"); return r.json(); },
onSuccess: (data: any) => {
setSyncResult(data);
refetchUsers();
const newCount = data.activated?.length ?? 0;
const preCount = data.preapproved?.length ?? 0;
toast({
title: newCount > 0 ? `Activated ${newCount} OG member${newCount !== 1 ? "s" : ""}` : "OG sync complete",
description: preCount > 0 ? `${preCount} email${preCount !== 1 ? "s" : ""} locked in for future signup` : `Scanned ${data.totalScanned} accounts`,
});
},
onError: (err: any) => {
const msg = err.message || "";
const isKeyError = msg.toLowerCase().includes("invalid api key") || msg.toLowerCase().includes("api key");
toast({
title: isKeyError ? "Stripe key needs updating" : "Sync failed",
description: isKeyError ? "Your Stripe secret key is invalid or expired. Update it in Secrets, then retry. Use Manual Grant below in the meantime." : msg,
variant: "destructive",
});
},
});

const tbSyncMutation = useMutation({
mutationFn: async () => { const r = await apiRequest("POST", "/api/admin/sync-stripe-trustbox"); return r.json(); },
onSuccess: (data: any) => {
setTbSyncResult(data);
refetchUsers();
const newCount = data.activated?.length ?? 0;
const preCount = data.preapproved?.length ?? 0;
toast({
title: newCount > 0 ? `Activated ${newCount} Trust Box subscriber${newCount !== 1 ? "s" : ""}` : "Trust Box sync complete",
description: preCount > 0 ? `${preCount} email${preCount !== 1 ? "s" : ""} locked in for future signup` : `Scanned ${data.totalScanned} accounts`,
});
},
onError: (err: any) => {
toast({ title: "Trust Box sync failed", description: err.message, variant: "destructive" });
},
});

const grantMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/grant-og", { email: grantEmail.trim() }),
onSuccess: (data: any) => {
refetchUsers();
setGrantEmail("");
toast({ title: data.message === "Already OG" ? "Already OG" : "OG granted!", description: data.user?.email });
},
onError: (err: any) => toast({ title: "Grant failed", description: err.message, variant: "destructive" }),
});

return (
<div className="space-y-3" data-testid="section-og-members">
<div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
<div className="flex items-center gap-2 mb-1">
<Day1OGLogo size="sm" />
<span className="text-sm font-display font-bold text-amber-400">Day-1 OG Members</span>
</div>
<p className="text-[11px] text-muted-foreground leading-relaxed">
These users paid $1.99 via Stripe and were automatically granted Day-1 OG status. OG status is permanent, tied to their registered email.
</p>
</div>

<div className="glass-card rounded-xl p-4 space-y-3">
<p className="text-xs font-display font-bold text-foreground/80">Sync from Stripe</p>
<p className="text-[11px] text-muted-foreground leading-relaxed">
Scan all Stripe checkout sessions and activate OG for any user who paid but wasn't yet activated (e.g. webhook missed). Requires a valid Stripe secret key in Secrets — if this fails, use Manual Grant below.
</p>
<Button
onClick={() => syncMutation.mutate()}
disabled={syncMutation.isPending || tbSyncMutation.isPending}
className="w-full h-10 rounded-xl font-display text-xs tracking-[0.1em] font-bold"
style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 90% 45%))" }}
data-testid="button-sync-stripe-og"
>
{syncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
SYNC STRIPE OG PAYMENTS
</Button>
<Button
onClick={() => tbSyncMutation.mutate()}
disabled={syncMutation.isPending || tbSyncMutation.isPending}
className="w-full h-10 rounded-xl font-display text-xs tracking-[0.1em] font-bold"
style={{ background: "linear-gradient(135deg, hsl(220 90% 55%), hsl(260 80% 50%))" }}
data-testid="button-sync-stripe-trustbox"
>
{tbSyncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
SYNC STRIPE TRUST BOX
</Button>
{syncResult && (
<div className="rounded-xl p-3 space-y-1 text-[11px]" style={{ background: "hsl(var(--muted))" }}>
<p className="font-display font-bold text-foreground/80">OG sync complete — {syncResult.totalOgInStripe ?? "?"} paid OGs found in Stripe ({syncResult.totalScanned} sessions scanned)</p>
{syncResult.activated.length > 0 && <p className="text-green-400">Newly activated ({syncResult.activated.length}): {syncResult.activated.join(", ")}</p>}
{syncResult.preapproved.length > 0 && <p className="text-amber-400">No GUBER account yet — locked in ({syncResult.preapproved.length}): {syncResult.preapproved.join(", ")}</p>}
{(syncResult.emailMismatch?.length ?? 0) > 0 && <p className="text-orange-400">Email mismatch — paid w/ different email ({syncResult.emailMismatch.length}): {syncResult.emailMismatch.join(", ")}</p>}
{syncResult.alreadyActive.length > 0 && <p className="text-muted-foreground">Already active: {syncResult.alreadyActive.length}</p>}
{syncResult.activated.length === 0 && syncResult.preapproved.length === 0 && <p className="text-muted-foreground">All OG payments are already activated.</p>}
</div>
)}
{tbSyncResult && (
<div className="rounded-xl p-3 space-y-1 text-[11px]" style={{ background: "hsl(var(--muted))" }}>
<p className="font-display font-bold text-foreground/80">Trust Box sync complete — {tbSyncResult.totalScanned} accounts checked</p>
{tbSyncResult.activated.length > 0 && <p className="text-green-400">Newly activated: {tbSyncResult.activated.join(", ")}</p>}
{tbSyncResult.preapproved.length > 0 && <p className="text-amber-400">Locked in (no account yet): {tbSyncResult.preapproved.join(", ")}</p>}
{tbSyncResult.alreadyActive.length > 0 && <p className="text-muted-foreground">Already active: {tbSyncResult.alreadyActive.length}</p>}
{tbSyncResult.activated.length === 0 && tbSyncResult.preapproved.length === 0 && <p className="text-muted-foreground">All Trust Box subscriptions are already activated.</p>}
</div>
)}
</div>

<div className="glass-card rounded-xl p-4 space-y-3">
<p className="text-xs font-display font-bold text-foreground/80">Manual Grant by Email</p>
<p className="text-[11px] text-muted-foreground">For users who paid but their email doesn't match any Stripe session metadata.</p>
<div className="flex gap-2">
<Input
placeholder="user@email.com"
value={grantEmail}
onChange={e => setGrantEmail(e.target.value)}
className="h-9 text-xs rounded-xl flex-1"
data-testid="input-grant-og-email"
onKeyDown={e => e.key === "Enter" && grantEmail.trim() && grantMutation.mutate()}
/>
<Button
onClick={() => grantMutation.mutate()}
disabled={grantMutation.isPending || !grantEmail.trim()}
className="h-9 px-4 rounded-xl font-display text-xs font-bold shrink-0"
style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 90% 45%))" }}
data-testid="button-manual-grant-og"
>
{grantMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
GRANT
</Button>
</div>
</div>

<div className="glass-card rounded-xl p-4 space-y-3">
<p className="text-xs font-display font-bold text-foreground/80">Reset User Password</p>
<p className="text-[11px] text-muted-foreground">Set a new password for any user by email. Use this when a user is locked out and forgot-password email isn't available.</p>
<Input placeholder="user@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} className="h-9 text-xs rounded-xl w-full" data-testid="input-reset-email" />
<div className="flex gap-2">
<Input placeholder="New password (min 8 chars)" value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="h-9 text-xs rounded-xl flex-1 min-w-0" type="password" data-testid="input-reset-password" />
<Button
onClick={() => resetPasswordMutation.mutate()}
disabled={resetPasswordMutation.isPending || !resetEmail.trim() || resetPassword.length < 8}
className="h-9 px-4 rounded-xl font-display text-xs font-bold shrink-0 bg-destructive hover:bg-destructive/90 text-white"
data-testid="button-reset-password"
>
{resetPasswordMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "RESET"}
</Button>
</div>
</div>

{usersLoading ? (
<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
) : (
<>
<div className="flex items-center justify-between px-1">
<span className="text-[11px] text-muted-foreground font-display">
{allUsers?.filter(u => u.day1OG).length ?? 0} total OG members
</span>
</div>
{allUsers?.filter(u => u.day1OG).length === 0 && (
<div className="glass-card rounded-xl p-6 text-center" data-testid="text-no-og-members">
<p className="text-sm text-muted-foreground font-display">No Day-1 OG members yet.</p>
</div>
)}
{allUsers?.filter(u => u.day1OG).map(u => (
<div key={u.id} className="glass-card rounded-xl p-4 border border-amber-500/20" data-testid={`og-member-${u.id}`}>
<div className="flex items-center gap-3">
<div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(251,191,36,0.15))", border: "1.5px solid rgba(245,158,11,0.35)" }}>
<span className="text-xs font-display font-bold text-amber-400">
{u.fullName?.split(" ").map((n: string) => n[0]).join("") || "?"}
</span>
</div>
<div className="flex-1 min-w-0">
<div className="flex items-center gap-2 flex-wrap">
<p className="text-sm font-display font-semibold text-foreground" data-testid={`og-member-name-${u.id}`}>{u.fullName}</p>
<Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">Day-1 OG</Badge>
<Badge variant="outline" className="text-[8px]">{u.tier}</Badge>
</div>
<p className="text-[11px] text-muted-foreground truncate mt-0.5" data-testid={`og-member-email-${u.id}`}>{u.email}</p>
</div>
<div className="flex flex-col items-end gap-1 shrink-0">
<span className="text-[10px] text-muted-foreground font-display">#{u.id}</span>
<span className="text-[10px] text-amber-500/70 font-display font-bold">ACTIVE</span>
</div>
</div>
</div>
))}
</>
)}
</div>
);
}

function TrustBoxTab({ allUsers, usersLoading }: { allUsers: User[] | undefined; usersLoading: boolean }) {
const { toast } = useToast();
const [grantEmail, setGrantEmail] = useState("");
const [revokeEmail, setRevokeEmail] = useState("");

const { data: preapproved, refetch: refetchPreapproved } = useQuery<{ email: string; created_at: string }[]>({
queryKey: ["/api/admin/trust-box-preapproved"],
staleTime: 30_000,
});

const grantMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/grant-trust-box", { email: grantEmail.trim() }),
onSuccess: (data: any) => {
refetchPreapproved();
queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
setGrantEmail("");
toast({ title: data.message?.includes("pre-approval") ? "Added to pre-approval list" : "Trust Box granted!", description: data.message });
},
onError: (err: any) => toast({ title: "Grant failed", description: err.message, variant: "destructive" }),
});

const revokeMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/revoke-trust-box", { email: revokeEmail.trim() }),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
setRevokeEmail("");
toast({ title: "Trust Box revoked" });
},
onError: (err: any) => toast({ title: "Revoke failed", description: err.message, variant: "destructive" }),
});

const removePreapprovedMutation = useMutation({
mutationFn: (email: string) => apiRequest("DELETE", `/api/admin/trust-box-preapproved/${encodeURIComponent(email)}`),
onSuccess: () => { refetchPreapproved(); toast({ title: "Removed from pre-approval list" }); },
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const tbUsers = allUsers?.filter(u => u.trustBoxPurchased) ?? [];

return (
<div className="space-y-3" data-testid="section-trust-box-members">
<div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4">
<div className="flex items-center gap-2 mb-1">
<span className="text-sm font-display font-bold text-blue-400">Trust Box — AI or Not Premium ($4.99/mo)</span>
</div>
<p className="text-[11px] text-muted-foreground leading-relaxed">
Active subscribers with AI or Not premium access. Grant manually for pre-Stripe subscribers, or add to pre-approval list for auto-activation on signup.
</p>
</div>

<div className="glass-card rounded-xl p-4 space-y-3">
<p className="text-xs font-display font-bold text-foreground/80">Grant Trust Box by Email</p>
<p className="text-[11px] text-muted-foreground">If the user already has an account, activates immediately. If not found, adds to the pre-approval list — they'll get Trust Box automatically on signup.</p>
<div className="flex gap-2">
<Input
placeholder="user@email.com"
value={grantEmail}
onChange={e => setGrantEmail(e.target.value)}
className="h-9 text-xs rounded-xl flex-1"
data-testid="input-grant-trust-box-email"
onKeyDown={e => e.key === "Enter" && grantEmail.trim() && grantMutation.mutate()}
/>
<Button
onClick={() => grantMutation.mutate()}
disabled={grantMutation.isPending || !grantEmail.trim()}
className="h-9 px-4 rounded-xl font-display text-xs font-bold shrink-0 bg-blue-600 hover:bg-blue-700"
data-testid="button-grant-trust-box"
>
{grantMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
GRANT
</Button>
</div>
</div>

<div className="glass-card rounded-xl p-4 space-y-3">
<p className="text-xs font-display font-bold text-foreground/80">Revoke Trust Box</p>
<div className="flex gap-2">
<Input
placeholder="user@email.com"
value={revokeEmail}
onChange={e => setRevokeEmail(e.target.value)}
className="h-9 text-xs rounded-xl flex-1"
data-testid="input-revoke-trust-box-email"
onKeyDown={e => e.key === "Enter" && revokeEmail.trim() && revokeMutation.mutate()}
/>
<Button
onClick={() => revokeMutation.mutate()}
disabled={revokeMutation.isPending || !revokeEmail.trim()}
variant="destructive"
className="h-9 px-4 rounded-xl font-display text-xs font-bold shrink-0"
data-testid="button-revoke-trust-box"
>
{revokeMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "REVOKE"}
</Button>
</div>
</div>

{(preapproved?.length ?? 0) > 0 && (
<div className="glass-card rounded-xl p-4 space-y-2">
<p className="text-xs font-display font-bold text-foreground/80">Pre-Approval List ({preapproved!.length} emails)</p>
<p className="text-[11px] text-muted-foreground">These emails auto-get Trust Box on signup.</p>
{preapproved!.map(row => (
<div key={row.email} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
<span className="text-[11px] font-mono text-muted-foreground">{row.email}</span>
<Button
size="sm"
variant="ghost"
className="h-6 text-[10px] text-red-400 hover:text-red-300 px-2"
onClick={() => removePreapprovedMutation.mutate(row.email)}
data-testid={`button-remove-tb-preapproved-${row.email}`}
>Remove</Button>
</div>
))}
</div>
)}

<div className="flex items-center justify-between px-1">
<span className="text-[11px] text-muted-foreground font-display">
{tbUsers.length} active Trust Box subscriber{tbUsers.length !== 1 ? "s" : ""}
</span>
</div>

{usersLoading ? (
<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
) : tbUsers.length === 0 ? (
<div className="glass-card rounded-xl p-6 text-center">
<p className="text-sm text-muted-foreground font-display">No active Trust Box subscribers yet.</p>
</div>
) : (
tbUsers.map(u => (
<div key={u.id} className="glass-card rounded-xl p-4 border border-blue-500/20" data-testid={`tb-member-${u.id}`}>
<div className="flex items-center gap-3">
<div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(99,179,237,0.15))", border: "1.5px solid rgba(59,130,246,0.35)" }}>
<span className="text-xs font-display font-bold text-blue-400">
{u.fullName?.split(" ").map((n: string) => n[0]).join("") || "?"}
</span>
</div>
<div className="flex-1 min-w-0">
<div className="flex items-center gap-2 flex-wrap">
<p className="text-sm font-display font-semibold text-foreground">{u.fullName}</p>
<Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">Trust Box</Badge>
{u.day1OG && <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">OG</Badge>}
</div>
<p className="text-[11px] text-muted-foreground truncate mt-0.5">{u.email}</p>
</div>
<div className="flex flex-col items-end gap-1 shrink-0">
<span className="text-[10px] text-muted-foreground font-display">#{u.id}</span>
<span className="text-[10px] text-blue-500/70 font-display font-bold">ACTIVE</span>
</div>
</div>
</div>
))
)}
</div>
);
}

function VerificationCard({ v, onApprove, onReject, isApproving, isRejecting, showActions = true, onDelete, isDeleting }: {
v: any;
onApprove: () => void;
onReject: (reason: string) => void;
isApproving: boolean;
isRejecting: boolean;
showActions?: boolean;
onDelete?: () => void;
isDeleting?: boolean;
}) {
const { toast } = useToast();
const [aiResult, setAiResult] = useState<any>(null);
const [aiLoading, setAiLoading] = useState(false);
const [rejectOpen, setRejectOpen] = useState(false);
const [rejectReason, setRejectReason] = useState("");

const docType = v.action === "id_upload" || v.action === "verification_submitted_id"
? "ID Document" : v.action === "verification_submitted_selfie"
? "Selfie / Liveness" : "Credential";

const trustScore = v.trustScore ?? 50;
const trustLevel = trustScore >= 80 ? "Trusted" : trustScore >= 60 ? "Verified" : "New";
const trustColor = trustScore >= 80 ? "text-green-400 border-green-500/30 bg-green-500/10"
: trustScore >= 60 ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
: "text-amber-400 border-amber-500/30 bg-amber-500/10";

const joinedDaysAgo = v.userCreatedAt
? Math.floor((Date.now() - new Date(v.userCreatedAt).getTime()) / 86400000)
: null;

const docImageSrc = v.parsedDetails?.imageBase64 || v.parsedDetails?.base64 || null;
const isImageDoc = docImageSrc?.startsWith("data:image/") || v.parsedDetails?.mimeType?.startsWith("image/");

const runAiCheck = async () => {
setAiLoading(true);
try {
const result = await apiRequest("POST", `/api/admin/verifications/${v.id}/ai-check`, {});
setAiResult(result);
} catch (e: any) {
toast({ title: "AI check failed", description: e.message, variant: "destructive" });
} finally {
setAiLoading(false);
}
};

const riskColor = aiResult
? aiResult.riskScore <= 20 ? "text-green-400" : aiResult.riskScore <= 50 ? "text-amber-400" : "text-red-400"
: "";

const recColor = aiResult?.recommendation === "approve" ? "bg-green-500/10 border-green-500/30 text-green-400"
: aiResult?.recommendation === "review" ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
: "bg-red-500/10 border-red-500/30 text-red-400";

return (
<div className="glass-card rounded-xl border border-border/10 overflow-hidden" data-testid={`verification-item-${v.id}`}>
{/* Header bar */}
<div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/10">
<div className="flex items-center gap-2">
<Badge variant="outline" className="text-[9px] bg-blue-500/5 text-blue-400 border-blue-500/20 font-semibold uppercase tracking-wider">
{docType}
</Badge>
{v.parsedDetails?.documentType && (
<Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-500 border-amber-500/20 uppercase tracking-wider">
{v.parsedDetails.documentType}
</Badge>
)}
{v.day1OG && (
<Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">OG</Badge>
)}
</div>
<p className="text-[10px] text-muted-foreground">
{v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}
</p>
</div>

<div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/10">
{/* LEFT: User profile info */}
<div className="p-4 space-y-3">
<p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Registered Profile</p>
<div className="flex items-center gap-3">
<Avatar className="w-12 h-12 border-2 border-border/20">
{v.profilePhoto && <AvatarImage src={v.profilePhoto} />}
<AvatarFallback className="bg-muted text-primary text-sm font-display font-bold">
{v.fullName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "?"}
</AvatarFallback>
</Avatar>
<div>
<p className="text-base font-display font-black text-foreground leading-tight">{v.fullName || <span className="text-muted-foreground italic">No full name</span>}</p>
<p className="text-[11px] text-muted-foreground">@{v.username}</p>
</div>
</div>

<div className="space-y-1.5 text-[11px]">
<div className="flex items-center gap-1.5 text-muted-foreground">
<Mail className="w-3 h-3 shrink-0" />
<span className="truncate">{v.email}</span>
</div>
{v.zipcode && (
<div className="flex items-center gap-1.5 text-muted-foreground">
<MapPin className="w-3 h-3 shrink-0" />
<span>{v.zipcode}</span>
</div>
)}
{joinedDaysAgo !== null && (
<div className="flex items-center gap-1.5 text-muted-foreground">
<CalendarDays className="w-3 h-3 shrink-0" />
<span>Joined {joinedDaysAgo === 0 ? "today" : joinedDaysAgo === 1 ? "yesterday" : `${joinedDaysAgo} days ago`}</span>
</div>
)}
{(v.totalSubmissions ?? 1) > 1 && (
<div className="flex items-center gap-1.5 text-amber-400">
<AlertCircle className="w-3 h-3 shrink-0" />
<span>{v.totalSubmissions} total submissions (resubmission)</span>
</div>
)}
</div>

<div className="flex flex-wrap gap-1.5">
<Badge variant="outline" className={`text-[9px] ${trustColor} capitalize`}>
{trustLevel} · {trustScore}pts
</Badge>
<Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20 capitalize">{v.tier}</Badge>
{v.idVerified && <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/30">ID ✓</Badge>}
{v.selfieVerified && <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/30">Selfie ✓</Badge>}
{v.credentialVerified && <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/30">Cred ✓</Badge>}
</div>

{v.userBio && (
<p className="text-[11px] text-muted-foreground italic line-clamp-2 border-l-2 border-border/20 pl-2">"{v.userBio}"</p>
)}

{/* Name to match callout */}
<div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
<p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 font-semibold">Name to match on document</p>
<p className="text-sm font-display font-black text-primary tracking-wide">{v.fullName || "— not set —"}</p>
</div>
</div>

{/* RIGHT: Document */}
<div className="p-4 space-y-3">
<p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Submitted Document</p>

{docImageSrc && isImageDoc ? (
<div className="rounded-lg overflow-hidden border border-border/20 bg-black/20">
<a href={docImageSrc} target="_blank" rel="noopener noreferrer" className="block">
<img
src={docImageSrc}
alt="Verification document"
className="w-full h-auto max-h-72 object-contain hover:opacity-90 transition-opacity cursor-zoom-in"
data-testid={`img-verif-doc-${v.id}`}
/>
</a>
<p className="text-[9px] text-muted-foreground/40 text-center py-1">Tap to open full size</p>
</div>
) : docImageSrc ? (
<div className="rounded-lg border border-border/20 bg-black/10 p-4 flex flex-col items-center gap-2 min-h-[120px] justify-center">
<FileText className="w-10 h-10 text-muted-foreground/30" />
<p className="text-xs text-muted-foreground">{v.parsedDetails?.fileName || "Document file"}</p>
<Button variant="ghost" size="sm" className="text-primary text-[11px]" onClick={() => {
const win = window.open();
win?.document.write(`<iframe src="${docImageSrc}" frameborder="0" style="border:0;width:100%;height:100%;" allowfullscreen></iframe>`);
}}>
<ExternalLink className="w-3 h-3 mr-1" /> View Document
</Button>
</div>
) : (
<div className="rounded-lg border border-border/10 bg-muted/10 p-6 flex flex-col items-center gap-2 min-h-[120px] justify-center">
<FileText className="w-8 h-8 text-muted-foreground/20" />
<p className="text-xs text-muted-foreground">No document image</p>
</div>
)}

{/* AI Pre-Check */}
{!aiResult ? (
<Button
variant="outline"
size="sm"
className="w-full font-display text-xs h-8 border-primary/20 text-primary hover:bg-primary/5"
onClick={runAiCheck}
disabled={aiLoading}
data-testid={`button-ai-check-${v.id}`}
>
{aiLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Brain className="w-3 h-3 mr-1.5" />}
{aiLoading ? "Running AI Pre-Check…" : "Run AI Pre-Check"}
</Button>
) : (
<div className={`rounded-lg border px-3 py-2.5 space-y-2 ${recColor}`} data-testid={`ai-result-${v.id}`}>
<div className="flex items-center justify-between">
<div className="flex items-center gap-1.5">
<Brain className="w-3.5 h-3.5" />
<span className="text-[11px] font-display font-bold uppercase tracking-wide">AI Pre-Check</span>
</div>
<div className="flex items-center gap-1.5">
<span className={`text-[11px] font-black ${riskColor}`}>Risk: {aiResult.riskScore}/100</span>
<Badge variant="outline" className={`text-[9px] capitalize ${recColor}`}>{aiResult.recommendation}</Badge>
</div>
</div>
<p className="text-[10px] opacity-80">Account: {aiResult.accountAgeDays}d old · {aiResult.totalSubmissions} submissions</p>
{aiResult.flags?.length > 0 && (
<ul className="space-y-0.5">
{aiResult.flags.map((f: string, i: number) => (
<li key={i} className="text-[10px] flex items-start gap-1 opacity-80">
<AlertCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" />{f}
</li>
))}
</ul>
)}
<button className="text-[9px] opacity-50 underline" onClick={() => setAiResult(null)}>Re-run</button>
</div>
)}
</div>
</div>

{/* Actions */}
<div className="flex gap-2 px-4 pb-4 pt-2 border-t border-border/10">
{v.reviewStatus && v.reviewStatus !== "pending" && (
<div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-display font-semibold ${v.reviewStatus === "approved" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
{v.reviewStatus === "approved" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
{v.reviewStatus === "approved" ? "Approved" : "Rejected"}
{v.reviewedAt && <span className="text-[9px] opacity-60 ml-1">{new Date(v.reviewedAt).toLocaleDateString()}</span>}
</div>
)}
{showActions && (!v.reviewStatus || v.reviewStatus === "pending") && (
<>
<Button
size="sm"
className="font-display text-xs h-8 flex-1"
onClick={onApprove}
disabled={isApproving || isRejecting}
data-testid={`button-approve-verif-${v.id}`}
>
{isApproving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ThumbsUp className="w-3 h-3 mr-1" />}
Approve
</Button>
<Button
size="sm"
variant="outline"
className="font-display text-xs h-8 flex-1 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40"
onClick={() => setRejectOpen(true)}
disabled={isApproving || isRejecting}
data-testid={`button-reject-verif-${v.id}`}
>
<ThumbsDown className="w-3 h-3 mr-1" />
Reject
</Button>
</>
)}
{onDelete && (
<Button
size="sm"
variant="ghost"
className="font-display text-xs h-8 text-muted-foreground hover:text-destructive"
onClick={onDelete}
disabled={isDeleting}
data-testid={`button-delete-verif-${v.id}`}
>
{isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
</Button>
)}
</div>

{/* Reject dialog */}
<Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
<DialogContent className="max-w-sm">
<DialogHeader>
<DialogTitle className="font-display text-sm">Reject Verification</DialogTitle>
</DialogHeader>
<div className="space-y-3 py-2">
<p className="text-xs text-muted-foreground">Provide a reason so the user knows what to fix and resubmit.</p>
<div className="space-y-1.5">
<Label className="text-xs font-display">Reason for rejection</Label>
<Textarea
value={rejectReason}
onChange={e => setRejectReason(e.target.value)}
placeholder="e.g. Document is blurry, name doesn't match, ID expired…"
className="text-sm resize-none h-24"
data-testid={`textarea-reject-reason-${v.id}`}
/>
</div>
<div className="flex flex-wrap gap-1.5">
{["Document is blurry or unreadable","Name doesn't match profile","ID appears expired","Wrong document type","Unable to verify authenticity"].map(preset => (
<button
key={preset}
className="text-[10px] bg-muted/50 hover:bg-muted border border-border/20 rounded-md px-2 py-1 text-muted-foreground transition-colors"
onClick={() => setRejectReason(preset)}
>{preset}</button>
))}
</div>
</div>
<DialogFooter>
<Button variant="outline" size="sm" className="text-xs" onClick={() => setRejectOpen(false)}>Cancel</Button>
<Button
size="sm"
variant="destructive"
className="text-xs"
disabled={isRejecting}
onClick={() => {
onReject(rejectReason || "Verification could not be approved.");
setRejectOpen(false);
setRejectReason("");
}}
data-testid={`button-confirm-reject-${v.id}`}
>
{isRejecting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
Confirm Rejection
</Button>
</DialogFooter>
</DialogContent>
</Dialog>
</div>
);
}

function UserDocHistory({ userId }: { userId: number }) {
const { toast } = useToast();
const [showDocs, setShowDocs] = useState(false);
const { data: docs, isLoading } = useQuery<any[]>({
queryKey: ["/api/admin/user-verifications", String(userId)],
enabled: showDocs,
});

const deleteMutation = useMutation({
mutationFn: (logId: number) => apiRequest("DELETE", `/api/admin/verifications/${logId}`),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/user-verifications", String(userId)] });
queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
toast({ title: "Deleted", description: "Verification entry removed." });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

return (
<div className="border-t border-border/10 pt-2 mt-2">
<button
onClick={() => setShowDocs(!showDocs)}
className="text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
data-testid={`toggle-doc-history-${userId}`}
>
<FileText className="w-3 h-3" />
Document History
<ChevronRight className={`w-3 h-3 transition-transform ${showDocs ? "rotate-90" : ""}`} />
</button>
{showDocs && (
<div className="mt-2 space-y-2">
{isLoading ? (
<Skeleton className="h-12 rounded-lg" />
) : docs?.length === 0 ? (
<p className="text-[10px] text-muted-foreground">No verification documents submitted.</p>
) : (
docs?.map(doc => {
const docType = doc.action === "id_upload" || doc.action === "verification_submitted_id"
? "ID" : doc.action === "verification_submitted_selfie"
? "Selfie" : "Credential";
const statusColor = doc.reviewStatus === "approved" ? "text-green-400 bg-green-500/10 border-green-500/20"
: doc.reviewStatus === "rejected" ? "text-red-400 bg-red-500/10 border-red-500/20"
: "text-amber-400 bg-amber-500/10 border-amber-500/20";
const statusLabel = doc.reviewStatus === "approved" ? "Approved" : doc.reviewStatus === "rejected" ? "Rejected" : "Pending";

return (
<div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/10" data-testid={`doc-history-${doc.id}`}>
<div className="flex items-center gap-2">
<Badge variant="outline" className="text-[9px]">{docType}</Badge>
<span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${statusColor}`}>{statusLabel}</span>
<span className="text-[9px] text-muted-foreground">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""}</span>
</div>
<div className="flex items-center gap-1">
{(doc.parsedDetails?.imageBase64 || doc.parsedDetails?.base64) && (
<a href={doc.parsedDetails?.imageBase64 || doc.parsedDetails?.base64} target="_blank" rel="noopener noreferrer">
<Button size="icon" variant="ghost" className="h-6 w-6" data-testid={`view-doc-${doc.id}`}>
<Eye className="w-3 h-3 text-muted-foreground" />
</Button>
</a>
)}
<Button
size="icon"
variant="ghost"
className="h-6 w-6 text-muted-foreground hover:text-destructive"
onClick={() => deleteMutation.mutate(doc.id)}
disabled={deleteMutation.isPending}
data-testid={`delete-doc-${doc.id}`}
>
{deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
</Button>
</div>
</div>
);
})
)}
</div>
)}
</div>
);
}

function VerificationsTab() {
const { toast } = useToast();
const [statusFilter, setStatusFilter] = useState<string>("pending");
const { data: verifications, isLoading } = useQuery<any[]>({
queryKey: ["/api/admin/verifications", statusFilter],
queryFn: async () => {
const res = await fetch(`/api/admin/verifications?status=${statusFilter}`, { credentials: "include" });
if (!res.ok) throw new Error(await res.text());
return res.json();
},
staleTime: 30_000,
});

const [approvingId, setApprovingId] = useState<number | null>(null);
const [rejectingId, setRejectingId] = useState<number | null>(null);

const approveMutation = useMutation({
mutationFn: (logId: number) => apiRequest("POST", `/api/admin/verifications/${logId}/approve`, {}),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
toast({ title: "Approved", description: "User has been verified." });
setApprovingId(null);
},
onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); setApprovingId(null); },
});

const rejectMutation = useMutation({
mutationFn: ({ logId, reason }: { logId: number; reason: string }) =>
apiRequest("POST", `/api/admin/verifications/${logId}/reject`, { reason }),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
toast({ title: "Rejected", description: "Verification request rejected." });
setRejectingId(null);
},
onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); setRejectingId(null); },
});

const deleteMutation = useMutation({
mutationFn: (logId: number) => apiRequest("DELETE", `/api/admin/verifications/${logId}`),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
toast({ title: "Deleted", description: "Verification entry removed." });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;

const filterTabs = [
{ value: "pending", label: "Pending" },
{ value: "approved", label: "Approved" },
{ value: "rejected", label: "Rejected" },
{ value: "all", label: "All" },
];

return (
<div className="space-y-4" data-testid="admin-verifications">
<div className="flex items-center justify-between mb-2">
<div className="flex items-center gap-2">
<ShieldCheck className="w-4 h-4 guber-text-green" />
<h3 className="font-display font-semibold text-sm">Verifications</h3>
{verifications && verifications.length > 0 && (
<Badge className="text-[9px] h-4 px-1.5 bg-primary text-primary-foreground">{verifications.length}</Badge>
)}
</div>
<Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] })}>
<RefreshCw className="w-3 h-3 mr-1" /> Refresh
</Button>
</div>

<div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/10" data-testid="verification-filter-tabs">
{filterTabs.map(tab => (
<button
key={tab.value}
onClick={() => setStatusFilter(tab.value)}
className={`flex-1 text-[11px] font-display font-semibold py-1.5 px-3 rounded-md transition-all ${statusFilter === tab.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
data-testid={`filter-tab-${tab.value}`}
>
{tab.label}
</button>
))}
</div>

{verifications?.length === 0 ? (
<div className="glass-card rounded-xl p-10 text-center">
<BadgeCheck className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
<p className="text-sm text-muted-foreground font-display">
{statusFilter === "pending" ? "All clear — no pending verifications." : `No ${statusFilter} verifications found.`}
</p>
</div>
) : (
<div className="space-y-4">
{verifications?.map((v) => (
<VerificationCard
key={v.id}
v={v}
onApprove={() => { setApprovingId(v.id); approveMutation.mutate(v.id); }}
onReject={(reason) => { setRejectingId(v.id); rejectMutation.mutate({ logId: v.id, reason }); }}
isApproving={approvingId === v.id && approveMutation.isPending}
isRejecting={rejectingId === v.id && rejectMutation.isPending}
showActions={statusFilter === "pending" || statusFilter === "all"}
onDelete={() => deleteMutation.mutate(v.id)}
isDeleting={deleteMutation.isPending}
/>
))}
</div>
)}
</div>
);
}

function BroadcastTab() {
const { toast } = useToast();
const [subject, setSubject] = useState("");
const [htmlBody, setHtmlBody] = useState("");
const [audience, setAudience] = useState("all");
const [pushTitle, setPushTitle] = useState("");
const [pushBody, setPushBody] = useState("");
const [pushUrl, setPushUrl] = useState("/");
const [pushAudience, setPushAudience] = useState("all");

const broadcastMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/broadcast-email", { subject, htmlBody, audience }),
onSuccess: async (res) => {
const data = await res.json();
toast({ title: "Email broadcast sent", description: `Sent: ${data.sent} | Failed: ${data.failed} | Total: ${data.total}` });
setSubject("");
setHtmlBody("");
},
onError: async (err: any) => {
toast({ title: "Failed to send", description: err.message, variant: "destructive" });
},
});

const pushBroadcastMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/broadcast-push", { title: pushTitle, body: pushBody, url: pushUrl, audience: pushAudience }),
onSuccess: async (res) => {
const data = await res.json();
toast({ title: "Push notification sent!", description: `Delivered: ${data.sent} | Stale/removed: ${data.failed} | Total subscribers: ${data.total}` });
setPushTitle("");
setPushBody("");
setPushUrl("/");
},
onError: async (err: any) => {
toast({ title: "Push failed", description: err.message, variant: "destructive" });
},
});

return (
<div className="space-y-4">

<div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4">
<h3 className="font-display font-semibold text-sm flex items-center gap-2">
<Bell className="w-4 h-4 text-primary" /> Push Notification Broadcast
</h3>
<p className="text-xs text-muted-foreground">
Sends a push notification to all users who have enabled notifications. Reaches Android users in the browser or app; iOS users need the app installed on their home screen.
</p>

<div className="space-y-3">
<div>
<label className="text-xs text-muted-foreground mb-1 block">Audience</label>
<Select value={pushAudience} onValueChange={setPushAudience}>
<SelectTrigger className="bg-background border-border/30" data-testid="select-push-audience">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="all">All subscribers</SelectItem>
<SelectItem value="og">Day-1 OG only</SelectItem>
<SelectItem value="trustbox">Trust Box subscribers only</SelectItem>
</SelectContent>
</Select>
</div>

<div>
<label className="text-xs text-muted-foreground mb-1 block">Title</label>
<Input
value={pushTitle}
onChange={(e) => setPushTitle(e.target.value)}
placeholder="e.g. GUBER just got better 🚀"
className="bg-background border-border/30"
data-testid="input-push-title"
/>
</div>

<div>
<label className="text-xs text-muted-foreground mb-1 block">Message</label>
<Textarea
value={pushBody}
onChange={(e) => setPushBody(e.target.value)}
placeholder="e.g. We fixed Cash Drops, improved notifications, and more. Tap to see what's new."
className="bg-background border-border/30 min-h-[100px] text-sm"
data-testid="input-push-body"
/>
</div>

<div>
<label className="text-xs text-muted-foreground mb-1 block">Tap destination (URL path)</label>
<Input
value={pushUrl}
onChange={(e) => setPushUrl(e.target.value)}
placeholder="/dashboard"
className="bg-background border-border/30"
data-testid="input-push-url"
/>
</div>

<Button
onClick={() => pushBroadcastMutation.mutate()}
disabled={pushBroadcastMutation.isPending || !pushTitle.trim() || !pushBody.trim()}
className="bg-primary text-primary-foreground font-display w-full"
data-testid="button-send-push-broadcast"
>
{pushBroadcastMutation.isPending ? (
<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
) : (
<Bell className="w-4 h-4 mr-2" />
)}
{pushBroadcastMutation.isPending ? "Sending..." : "Send Push Notification"}
</Button>
</div>
</div>

<div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4">
<h3 className="font-display font-semibold text-sm flex items-center gap-2">
<Mail className="w-4 h-4" /> Broadcast Email
</h3>
<p className="text-xs text-muted-foreground">
Sends from <span className="font-mono">noreply@guberapp.app</span> — no-reply, no inbox thread.
</p>

<div className="space-y-3">
<div>
<label className="text-xs text-muted-foreground mb-1 block">Audience</label>
<Select value={audience} onValueChange={setAudience}>
<SelectTrigger className="bg-background border-border/30" data-testid="select-broadcast-audience">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="all">All users</SelectItem>
<SelectItem value="og">Day-1 OG only</SelectItem>
<SelectItem value="trustbox">Trust Box subscribers only</SelectItem>
</SelectContent>
</Select>
</div>

<div>
<label className="text-xs text-muted-foreground mb-1 block">Subject</label>
<Input
value={subject}
onChange={(e) => setSubject(e.target.value)}
placeholder="e.g. Important update from GUBER"
className="bg-background border-border/30"
data-testid="input-broadcast-subject"
/>
</div>

<div>
<label className="text-xs text-muted-foreground mb-1 block">Body (HTML supported)</label>
<Textarea
value={htmlBody}
onChange={(e) => setHtmlBody(e.target.value)}
placeholder="<p>Hello GUBER community,</p><p>...</p>"
className="bg-background border-border/30 min-h-[180px] font-mono text-xs"
data-testid="input-broadcast-body"
/>
</div>

<Button
onClick={() => broadcastMutation.mutate()}
disabled={broadcastMutation.isPending || !subject.trim() || !htmlBody.trim()}
className="bg-primary text-primary-foreground font-display w-full"
data-testid="button-send-broadcast"
>
{broadcastMutation.isPending ? (
<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
) : (
<Mail className="w-4 h-4 mr-2" />
)}
{broadcastMutation.isPending ? "Sending..." : "Send Email Broadcast"}
</Button>
</div>
</div>
</div>
);
}

function QualificationReviewTab() {
const { toast } = useToast();
const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

const { data: pendingQuals, isLoading } = useQuery<any[]>({
  queryKey: ["/api/resume/qualifications/pending"],
  queryFn: async () => {
    const res = await fetch("/api/resume/qualifications/pending", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  },
});

const reviewMutation = useMutation({
  mutationFn: async ({ id, verificationStatus, adminNotes }: { id: number; verificationStatus: string; adminNotes?: string }) => {
    const res = await apiRequest("PATCH", `/api/resume/qualifications/${id}/review`, { verificationStatus, adminNotes });
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/resume/qualifications/pending"] });
    toast({ title: "Qualification reviewed" });
  },
  onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

const items = pendingQuals || [];

return (
<div className="space-y-3" data-testid="admin-qualification-review">
  <div className="flex items-center gap-2 mb-2">
    <Shield className="w-4 h-4 guber-text-green" />
    <h3 className="font-display font-semibold text-sm">Qualification Review</h3>
    <Badge variant="outline" className="text-[10px]">{items.length} pending</Badge>
  </div>

  {items.length === 0 ? (
    <div className="text-center py-8 text-muted-foreground text-xs bg-muted/5 rounded-xl border border-dashed border-border/20">
      No pending qualifications to review
    </div>
  ) : (
    items.map((q: any) => (
      <div key={q.id} className="bg-card rounded-xl border border-border/20 p-4 space-y-3" data-testid={`qual-review-${q.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{q.qualificationName}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Submitted by <span className="font-medium text-foreground">{q.workerName}</span>
              {q.workerGuberId && <span className="ml-1 font-mono text-primary/70">({q.workerGuberId})</span>}
            </p>
            {q.documentUrl && (
              <a href={q.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                <FileText className="w-3 h-3" /> View Document
              </a>
            )}
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            <Clock className="w-3 h-3 mr-1" />Pending
          </Badge>
        </div>
        <div>
          <Textarea
            placeholder="Admin notes (optional)..."
            value={reviewNotes[q.id] || ""}
            onChange={(e) => setReviewNotes(prev => ({ ...prev, [q.id]: e.target.value }))}
            rows={2}
            className="text-xs bg-background border-border/20"
            data-testid={`input-qual-notes-${q.id}`}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: q.id, verificationStatus: "verified", adminNotes: reviewNotes[q.id] })}
            data-testid={`button-approve-qual-${q.id}`}
          >
            <CheckCircle className="w-3 h-3 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: q.id, verificationStatus: "rejected", adminNotes: reviewNotes[q.id] })}
            data-testid={`button-reject-qual-${q.id}`}
          >
            <X className="w-3 h-3 mr-1" /> Reject
          </Button>
        </div>
      </div>
    ))
  )}
</div>
);
}

function WalletTab({ allUsers }: { allUsers: User[] | undefined }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editStatusId, setEditStatusId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ type: "adjustment", amount: "", description: "", status: "available", jobId: "" });

  const filteredUsers = (allUsers || []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      (u as any).guberId?.toLowerCase().includes(q)
    );
  });

  const { data: transactions, isLoading: txnsLoading, refetch } = useQuery<WalletTransaction[]>({
    queryKey: ["/api/admin/wallet-transactions", selectedUser?.id],
    enabled: !!selectedUser,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/wallet-transactions/${id}`),
    onSuccess: () => {
      toast({ title: "Transaction deleted" });
      setDeleteConfirmId(null);
      refetch();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const editStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/wallet-transactions/${id}`, { status }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      setEditStatusId(null);
      refetch();
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const addTxnMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/wallet-transactions/manual", data),
    onSuccess: () => {
      toast({ title: "Transaction created" });
      setShowAddForm(false);
      setAddForm({ type: "adjustment", amount: "", description: "", status: "available", jobId: "" });
      refetch();
    },
    onError: (e: any) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
  });

  const getDuplicateKeys = (txns: WalletTransaction[]) => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    for (const t of txns) {
      if (!t.jobId) continue;
      const key = `${t.userId}-${t.jobId}-${t.type}`;
      if (seen.has(key)) {
        dupes.add(t.id);
        dupes.add(seen.get(key)!);
      } else {
        seen.set(key, t.id);
      }
    }
    return dupes;
  };

  const duplicates = transactions ? getDuplicateKeys(transactions) : new Set<number>();

  const typeColor: Record<string, string> = {
    earning: "text-green-400",
    payment: "text-red-400",
    withdrawal: "text-amber-400",
    refund: "text-blue-400",
    cashout: "text-purple-400",
    cash_drop: "text-yellow-400",
    adjustment: "text-muted-foreground",
  };

  const statusColor: Record<string, string> = {
    pending: "text-amber-400",
    processing: "text-blue-400",
    available: "text-green-400",
    completed: "text-green-400",
    failed: "text-red-400",
  };

  const totalAvailable = (transactions || []).filter((t) => t.status === "available" || t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Search a user to view and manage their wallet transactions. Duplicate entries (same job + type) are highlighted in amber.</p>
        <Input
          data-testid="wallet-user-search"
          placeholder="Search by name, email, or GUBER ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        {search && (
          <div className="bg-card border border-border/20 rounded-xl overflow-hidden mb-4 max-h-48 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No users found</p>
            ) : (
              filteredUsers.slice(0, 15).map((u) => (
                <button
                  key={u.id}
                  data-testid={`wallet-select-user-${u.id}`}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 text-left border-b border-border/10 last:border-0"
                  onClick={() => { setSelectedUser(u); setSearch(""); }}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-display text-muted-foreground">{u.fullName?.split(" ").map((n) => n[0]).join("") || "?"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.fullName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedUser && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs font-display text-muted-foreground">{selectedUser.fullName?.split(" ").map((n) => n[0]).join("") || "?"}</span>
              </div>
              <div>
                <p className="text-sm font-semibold">{selectedUser.fullName}</p>
                <p className="text-[10px] text-muted-foreground">{selectedUser.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 border-emerald-500/30 text-emerald-400" onClick={() => setShowAddForm((v) => !v)} data-testid="wallet-add-txn-toggle">
                <Plus className="w-3 h-3 mr-1" /> Add Transaction
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(null); setShowAddForm(false); }} data-testid="wallet-clear-user">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {transactions && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <span className="text-[10px] text-muted-foreground">Balance (available/completed):</span>
              <span className={`text-sm font-bold ${totalAvailable >= 0 ? "text-green-400" : "text-red-400"}`}>${totalAvailable.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {showAddForm && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-4 space-y-3" data-testid="wallet-add-form">
              <p className="text-xs font-semibold text-emerald-400">Add Manual Transaction for {selectedUser.fullName}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Type</Label>
                  <Select value={addForm.type} onValueChange={(v) => setAddForm((f) => ({ ...f, type: v }))}>
                    <SelectTrigger className="h-8 text-xs" data-testid="wallet-add-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                      <SelectItem value="earning">Earning</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                      <SelectItem value="withdrawal">Withdrawal</SelectItem>
                      <SelectItem value="cash_drop">Cash Drop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Status</Label>
                  <Select value={addForm.status} onValueChange={(v) => setAddForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8 text-xs" data-testid="wallet-add-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Amount (use − for debit)</Label>
                  <Input value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 25.00 or -10.00" className="h-8 text-xs" data-testid="wallet-add-amount" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Job ID (optional)</Label>
                  <Input value={addForm.jobId} onChange={(e) => setAddForm((f) => ({ ...f, jobId: e.target.value }))} placeholder="e.g. 42" className="h-8 text-xs" data-testid="wallet-add-jobid" />
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Description</Label>
                <Input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="Reason for this transaction" className="h-8 text-xs" data-testid="wallet-add-description" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                  disabled={addTxnMutation.isPending || !addForm.amount}
                  onClick={() => addTxnMutation.mutate({ userId: selectedUser.id, ...addForm, amount: parseFloat(addForm.amount), jobId: addForm.jobId ? parseInt(addForm.jobId) : undefined })}
                  data-testid="wallet-add-submit"
                >
                  {addTxnMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create Transaction"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {txnsLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !transactions || transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No wallet transactions found.</p>
          ) : (
            <div className="space-y-2">
              {duplicates.size > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400">{duplicates.size} duplicate transaction{duplicates.size > 1 ? "s" : ""} detected — highlighted below</p>
                </div>
              )}
              {transactions.map((t) => {
                const isDupe = duplicates.has(t.id);
                const isConfirming = deleteConfirmId === t.id;
                const isEditingStatus = editStatusId === t.id;
                return (
                  <div
                    key={t.id}
                    data-testid={`wallet-txn-${t.id}`}
                    className={`rounded-xl border p-3 ${isDupe ? "border-amber-500/40 bg-amber-500/5" : "border-border/20 bg-card"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {isDupe && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                          <span className={`text-xs font-semibold capitalize ${typeColor[t.type] || "text-foreground"}`}>{t.type}</span>
                          <span className={`text-[10px] capitalize ${statusColor[t.status] || "text-muted-foreground"}`}>• {t.status}</span>
                          {(t as any).stripeTransferId && <span className="text-[10px] text-blue-400">• transferred</span>}
                        </div>
                        <p className="text-sm font-medium truncate">{t.description || "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</span>
                          {t.jobId && <span className="text-[10px] text-muted-foreground">Job #{t.jobId}</span>}
                          <span className="text-[10px] text-muted-foreground">ID #{t.id}</span>
                          {(t as any).stripeTransferId && <span className="text-[10px] text-muted-foreground/40 truncate max-w-[120px]">{(t as any).stripeTransferId}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-bold ${Number(t.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {Number(t.amount) >= 0 ? "+" : ""}${Math.abs(Number(t.amount)).toFixed(2)}
                        </span>
                        {!isConfirming && !isEditingStatus && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400"
                              onClick={() => setEditStatusId(t.id)}
                              data-testid={`wallet-edit-status-${t.id}`}
                              title="Change status"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteConfirmId(t.id)}
                              data-testid={`wallet-delete-${t.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        {isEditingStatus && (
                          <div className="flex gap-1 items-center">
                            <Select defaultValue={t.status} onValueChange={(v) => editStatusMutation.mutate({ id: t.id, status: v })}>
                              <SelectTrigger className="h-7 text-[11px] w-28" data-testid={`wallet-status-select-${t.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="available">available</SelectItem>
                                <SelectItem value="pending">pending</SelectItem>
                                <SelectItem value="completed">completed</SelectItem>
                                <SelectItem value="processing">processing</SelectItem>
                                <SelectItem value="failed">failed</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditStatusId(null)} data-testid={`wallet-cancel-edit-${t.id}`}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        {isConfirming && (
                          <div className="flex gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              onClick={() => deleteMutation.mutate(t.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`wallet-confirm-delete-${t.id}`}
                            >
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              onClick={() => setDeleteConfirmId(null)}
                              data-testid={`wallet-cancel-delete-${t.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PayoutsTab() {
  const { toast } = useToast();
  const [missedJobs, setMissedJobs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sweepResult, setSweepResult] = useState<any | null>(null);
  const [forcingJobId, setForcingJobId] = useState<number | null>(null);

  const loadMissed = async () => {
    setLoading(true);
    setSweepResult(null);
    try {
      const data = await apiRequest("GET", "/api/admin/payout/missed");
      setMissedJobs(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load missed payouts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const forceTransfer = async (jobId: number) => {
    setForcingJobId(jobId);
    try {
      const result = await apiRequest("POST", `/api/admin/payout/force-transfer/${jobId}`, {});
      toast({ title: "Transfer sent", description: `Transfer ID: ${result.transferId} — $${result.amount}` });
      setMissedJobs((prev) => prev ? prev.filter((j) => j.id !== jobId) : prev);
    } catch (e: any) {
      const msg = e?.message || "Transfer failed";
      toast({ title: "Transfer failed", description: msg, variant: "destructive" });
    } finally {
      setForcingJobId(null);
    }
  };

  const sweepAll = async () => {
    if (!confirm("Sweep ALL missed payouts? This will fire Stripe transfers for every affected job where the worker has an active Connect account. Proceed?")) return;
    setLoading(true);
    setSweepResult(null);
    try {
      const result = await apiRequest("POST", "/api/admin/payout/sweep", {});
      setSweepResult(result);
      setMissedJobs((prev) => prev ? prev.filter((j) => !result.results.find((r: any) => r.jobId === j.id && r.status === "success")) : prev);
      toast({ title: `Sweep complete`, description: `${result.succeeded} succeeded, ${result.failed} failed` });
    } catch {
      toast({ title: "Sweep failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Find all jobs where Stripe capture succeeded but the worker transfer was never sent. These are jobs confirmed before the payout fix was deployed.</p>
        <p className="text-[10px] text-amber-400/80 mb-3">Jobs without an active Stripe Connect account appear in the list but cannot be auto-swept — use Force Transfer to handle those individually once they set up their account.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadMissed} disabled={loading} data-testid="button-load-missed-payouts">
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            {missedJobs === null ? "Load Missed Payouts" : "Refresh"}
          </Button>
          {missedJobs && missedJobs.length > 0 && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={sweepAll} disabled={loading} data-testid="button-sweep-all-payouts">
              <DollarSign className="w-3 h-3 mr-1" /> Sweep All ({missedJobs.filter((j) => j.stripe_account_status === "active").length} eligible)
            </Button>
          )}
        </div>
      </div>

      {sweepResult && (
        <div className="rounded-xl border border-border/20 bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">Sweep Results</p>
          <div className="flex gap-4 text-xs">
            <span className="text-green-400">{sweepResult.succeeded} succeeded</span>
            <span className="text-red-400">{sweepResult.failed} failed</span>
            <span className="text-muted-foreground">{sweepResult.total} total processed</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sweepResult.results.map((r: any) => (
              <div key={r.jobId} className={`text-[10px] flex items-center gap-2 ${r.status === "success" ? "text-green-400" : r.status === "failed" ? "text-red-400" : "text-muted-foreground"}`}>
                <span className="font-mono w-4">{r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "—"}</span>
                <span>Job #{r.jobId} — {r.title} — ${r.amount.toFixed(2)}</span>
                {r.transferId && <span className="text-muted-foreground font-mono">{r.transferId}</span>}
                {r.error && <span className="text-red-400/70">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {missedJobs !== null && (
        missedJobs.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
            <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-emerald-400">All clear</p>
            <p className="text-xs text-muted-foreground mt-1">No missed payouts found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">{missedJobs.length} missed payout{missedJobs.length !== 1 ? "s" : ""}</p>
            {missedJobs.map((j) => {
              const amount = parseFloat(j.worker_gross_share || j.helper_payout || 0);
              const hasAccount = j.stripe_account_status === "active";
              const isForcing = forcingJobId === j.id;
              return (
                <div key={j.id} className="rounded-xl border border-border/20 bg-card p-3 space-y-2" data-testid={`missed-payout-job-${j.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{j.title}</p>
                      <p className="text-[10px] text-muted-foreground">{j.worker_name} • {j.worker_email}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Job #{j.id}</span>
                        {j.confirmed_at && <span className="text-[10px] text-muted-foreground">Confirmed {new Date(j.confirmed_at).toLocaleDateString()}</span>}
                        {hasAccount ? (
                          <span className="text-[10px] text-green-400">Connect active</span>
                        ) : (
                          <span className="text-[10px] text-amber-400">No Connect account</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-green-400">${amount.toFixed(2)}</span>
                      <Button
                        size="sm"
                        className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={isForcing || !hasAccount}
                        onClick={() => forceTransfer(j.id)}
                        data-testid={`button-force-transfer-${j.id}`}
                        title={!hasAccount ? "Worker has no active Connect account" : ""}
                      >
                        {isForcing ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3 mr-1" />}
                        {hasAccount ? "Force Transfer" : "No Account"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function PlatformSettingsTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<{ key: string; value: string; category: string; description: string }[]>({
    queryKey: ["/api/admin/settings"],
    staleTime: 300_000,
  });

  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await apiRequest("PUT", `/api/admin/settings/${key}`, { value });
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setEditValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
      toast({ title: "Setting updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const categoryLabels: Record<string, string> = { marketplace: "Payments & Platform Fees", trust: "Trust System", cash_drop: "Cash Drops" };
  const categoryDescriptions: Record<string, string> = {
    marketplace: "Fee rates, cashout modes, review timer, and auto-confirm behavior",
    trust: "Trust score thresholds and badge unlock rules",
    cash_drop: "Cash Drop prize distribution and payout settings",
  };

  const categories = Array.from(new Set((settings || []).map((s) => s.category)));

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;

  return (
    <div className="space-y-6" data-testid="panel-platform-settings">
      {categories.map((cat) => {
        const catSettings = (settings || []).filter((s) => s.category === cat);
        if (catSettings.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <div className="mb-1">
              <h3 className="text-sm font-display font-bold text-muted-foreground uppercase tracking-wider">{categoryLabels[cat] || cat}</h3>
              {categoryDescriptions[cat] && (
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{categoryDescriptions[cat]}</p>
              )}
            </div>
            {catSettings.map((s) => {
              const currentVal = editValues[s.key] ?? s.value;
              const isEdited = editValues[s.key] !== undefined && editValues[s.key] !== s.value;
              const isBool = s.value === "true" || s.value === "false";
              return (
                <div key={s.key} className="bg-card rounded-xl border border-border/20 p-3 flex items-center justify-between gap-3" data-testid={`setting-${s.key}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-semibold">{s.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isBool ? (
                      <button
                        onClick={() => {
                          const newVal = currentVal === "true" ? "false" : "true";
                          updateMutation.mutate({ key: s.key, value: newVal });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors relative ${currentVal === "true" ? "bg-primary" : "bg-muted"}`}
                        data-testid={`toggle-${s.key}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${currentVal === "true" ? "left-5" : "left-0.5"}`} />
                      </button>
                    ) : (
                      <>
                        <input
                          value={currentVal}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                          className="w-24 text-right text-xs bg-transparent border border-border/30 rounded px-2 py-1 font-mono"
                          data-testid={`input-${s.key}`}
                        />
                        {isEdited && (
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => updateMutation.mutate({ key: s.key, value: currentVal })}
                            disabled={updateMutation.isPending}
                            data-testid={`save-${s.key}`}
                          >
                            Save
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CashDropTab({ sponsorPrefill, onSponsorPrefillUsed }: { sponsorPrefill?: any; onSponsorPrefillUsed?: () => void }) {
const { toast } = useToast();
const [showForm, setShowForm] = useState(false);
const { data: approvedSponsors = [] } = useQuery<any[]>({
  queryKey: ["/api/admin/drop-sponsors", "approved"],
  queryFn: async () => {
    const r = await fetch("/api/admin/drop-sponsors?status=approved", { credentials: "include" });
    return r.ok ? r.json() : [];
  },
});
const BLANK_FORM = {
  title: "", description: "", sponsorName: "", sponsorId: "", isSponsored: false, brandingEnabled: false,
  rewardPerWinner: 25, winnerLimit: 1, cashWinnerCount: 1, rewardWinnerCount: 0,
  finalLocationMode: "name_only",
  rewardType: "cash", rewardDescription: "", rewardQuantity: 0, rewardRedemptionType: "",
  redemptionType: "", redemptionInstructions: "", noPurchaseRequiredText: "", disclaimerText: "",
  gpsLat: "", gpsLng: "", gpsRadius: 200, clueText: "", clueRevealOnArrival: false,
  requireInAppCamera: false, proofItems: [] as { label: string; type: string }[],
  startTime: "", endTime: "",
};
const [form, setForm] = useState({ ...BLANK_FORM });
const [reviewDrop, setReviewDrop] = useState<number | null>(null);
const [editingDrop, setEditingDrop] = useState<any | null>(null);
const [addressInput, setAddressInput] = useState("");
const [geocoding, setGeocoding] = useState(false);
const [zipInput, setZipInput] = useState("");
const [zipGeocoding, setZipGeocoding] = useState(false);
const [useLocating, setUseLocating] = useState(false);

// Auto-open form and prefill from sponsor when directed from Sponsors tab
useEffect(() => {
  if (sponsorPrefill) {
    setForm({
      ...BLANK_FORM,
      title: `${sponsorPrefill.companyName} Cash Drop`,
      description: sponsorPrefill.sponsorMessage || "",
      sponsorName: sponsorPrefill.companyName || "",
      sponsorId: sponsorPrefill.id ? String(sponsorPrefill.id) : "",
      isSponsored: true,
      brandingEnabled: false,
      cashWinnerCount: 1,
      rewardWinnerCount: sponsorPrefill.rewardQuantity || 0,
      rewardType: sponsorPrefill.rewardType || "cash",
      rewardDescription: sponsorPrefill.rewardDescription || "",
      rewardQuantity: sponsorPrefill.rewardQuantity || 0,
      redemptionType: sponsorPrefill.redemptionType || "",
      redemptionInstructions: sponsorPrefill.redemptionInstructions || "",
      noPurchaseRequiredText: sponsorPrefill.noPurchaseRequiredText || "",
      disclaimerText: sponsorPrefill.disclaimerText || "",
    });
    setEditingDrop(null);
    setShowForm(true);
    if (onSponsorPrefillUsed) onSponsorPrefillUsed();
  }
}, [sponsorPrefill]);

const openEdit = (drop: any) => {
setEditingDrop(drop);
setForm({
title: drop.title || "",
description: drop.description || "",
sponsorName: drop.sponsorName || drop.sponsor_name || "",
sponsorId: drop.sponsorId ? String(drop.sponsorId) : "",
isSponsored: drop.isSponsored ?? drop.is_sponsored ?? false,
brandingEnabled: drop.brandingEnabled ?? drop.branding_enabled ?? false,
rewardPerWinner: drop.rewardPerWinner ?? drop.reward_per_winner ?? 25,
winnerLimit: drop.winnerLimit ?? drop.winner_limit ?? 1,
cashWinnerCount: drop.cashWinnerCount ?? drop.cash_winner_count ?? 1,
rewardWinnerCount: drop.rewardWinnerCount ?? drop.reward_winner_count ?? 0,
finalLocationMode: drop.finalLocationMode || drop.final_location_mode || "name_only",
rewardType: drop.rewardType || drop.reward_type || "cash",
rewardDescription: drop.rewardDescription || drop.reward_description || "",
rewardQuantity: drop.rewardQuantity ?? drop.reward_quantity ?? 0,
rewardRedemptionType: drop.rewardRedemptionType || drop.reward_redemption_type || "",
redemptionType: drop.redemptionType || drop.redemption_type || "",
redemptionInstructions: drop.redemptionInstructions || drop.redemption_instructions || "",
noPurchaseRequiredText: drop.noPurchaseRequiredText || drop.no_purchase_required_text || "",
disclaimerText: drop.disclaimerText || drop.disclaimer_text || "",
gpsLat: String(drop.gpsLat ?? drop.gps_lat ?? ""),
gpsLng: String(drop.gpsLng ?? drop.gps_lng ?? ""),
gpsRadius: drop.gpsRadius ?? drop.gps_radius ?? 200,
clueText: drop.clueText || drop.clue_text || "",
clueRevealOnArrival: drop.clueRevealOnArrival ?? drop.clue_reveal_on_arrival ?? false,
requireInAppCamera: drop.requireInAppCamera ?? drop.require_in_app_camera ?? false,
proofItems: drop.proofItems || drop.proof_items || [],
startTime: drop.startTime ? drop.startTime.slice(0, 16) : "",
endTime: drop.endTime ? drop.endTime.slice(0, 16) : "",
});
setAddressInput("");
setZipInput("");
setShowForm(true);
};

const closeForm = () => {
setShowForm(false);
setEditingDrop(null);
setForm(BLANK_FORM);
setAddressInput("");
setZipInput("");
};

const geocodeAddress = async () => {
if (!addressInput.trim()) return;
setGeocoding(true);
try {
const res = await fetch(`/api/geocode?address=${encodeURIComponent(addressInput)}`);
const data = await res.json();
if (data.lat && data.lng) {
setForm(f => ({ ...f, gpsLat: String(data.lat), gpsLng: String(data.lng) }));
toast({ title: "Location found!", description: `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` });
} else {
toast({ title: "Address not found", variant: "destructive" });
}
} catch {
toast({ title: "Geocode failed", variant: "destructive" });
} finally {
setGeocoding(false);
}
};

const handleZipLookup = async () => {
const zip = zipInput.trim();
if (!/^\d{5}$/.test(zip)) { toast({ title: "Enter a valid 5-digit zip", variant: "destructive" }); return; }
setZipGeocoding(true);
try {
const addressQuery = addressInput.trim() ? `${addressInput.trim()}, ${zip}` : zip;
const res = await fetch(`/api/geocode?address=${encodeURIComponent(addressQuery)}`);
const data = await res.json();
if (data.lat && data.lng) {
setForm(f => ({ ...f, gpsLat: String(data.lat.toFixed(6)), gpsLng: String(data.lng.toFixed(6)) }));
toast({ title: "Location pinpointed", description: `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` });
} else { throw new Error(); }
} catch { toast({ title: "Could not locate address", variant: "destructive" }); }
finally { setZipGeocoding(false); }
};

const handleUseLocation = () => {
if (!navigator.geolocation) { toast({ title: "Geolocation not supported", variant: "destructive" }); return; }
setUseLocating(true);
navigator.geolocation.getCurrentPosition(
(pos) => {
const lat = pos.coords.latitude.toFixed(6);
const lng = pos.coords.longitude.toFixed(6);
setForm(f => ({ ...f, gpsLat: lat, gpsLng: lng }));
toast({ title: "Location captured", description: `${lat}, ${lng}` });
setUseLocating(false);
},
() => { toast({ title: "Could not get location", variant: "destructive" }); setUseLocating(false); },
{ enableHighAccuracy: true, timeout: 10000 }
);
};

const { data: drops, isLoading } = useQuery<any[]>({
queryKey: ["/api/admin/cash-drops"],
});

const { data: attempts } = useQuery<any[]>({
queryKey: ["/api/admin/cash-drops", reviewDrop, "attempts"],
queryFn: async () => {
if (!reviewDrop) return [];
const res = await fetch(`/api/admin/cash-drops/${reviewDrop}/attempts`, { credentials: "include" });
return res.json();
},
enabled: !!reviewDrop,
});

const createMutation = useMutation({
mutationFn: (statusOverride?: string) => {
const payload = { ...form, ...(statusOverride ? { status: statusOverride } : {}) };
return editingDrop
? apiRequest("PATCH", `/api/admin/cash-drops/${editingDrop.id}`, payload)
: apiRequest("POST", "/api/admin/cash-drops", payload);
},
onSuccess: (_: any, statusOverride?: string) => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops"] });
queryClient.invalidateQueries({ queryKey: ["/api/cash-drops/active"] });
closeForm();
const msg = editingDrop ? "Drop updated!" : statusOverride === "active" ? "Cash Drop posted & activated!" : "Cash Drop saved as draft";
toast({ title: msg });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const patchMutation = useMutation({
mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/cash-drops/${id}`, data),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops"] });
toast({ title: "Updated" });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const deleteMutation = useMutation({
mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/cash-drops/${id}`),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops"] });
toast({ title: "Deleted" });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const confirmMutation = useMutation({
mutationFn: async ({ dropId, attemptId }: { dropId: number; attemptId: number }) => {
const resp = await apiRequest("POST", `/api/admin/cash-drops/${dropId}/confirm-winner/${attemptId}`);
return resp.json();
},
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops"] });
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops", reviewDrop, "attempts"] });
toast({ title: "Winner confirmed", description: "Winner will choose their payout method." });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const rejectMutation = useMutation({
mutationFn: ({ dropId, attemptId, reason }: { dropId: number; attemptId: number; reason: string }) =>
apiRequest("POST", `/api/admin/cash-drops/${dropId}/reject-attempt/${attemptId}`, { reason }),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops", reviewDrop, "attempts"] });
toast({ title: "Attempt rejected" });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const markPaidMutation = useMutation({
mutationFn: async (attemptId: number) => {
const ref = prompt("Enter payout reference (e.g. Cash App transaction ID):");
if (ref === null) throw new Error("Cancelled");
await apiRequest("POST", `/api/admin/cash-drops/mark-paid/${attemptId}`, {
payoutReference: ref,
fundedFromSource: "guber_cash_app",
});
},
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops"] });
queryClient.invalidateQueries({ queryKey: ["/api/admin/cash-drops", reviewDrop, "attempts"] });
toast({ title: "Marked as paid" });
},
onError: (err: any) => {
if (err.message !== "Cancelled") toast({ title: "Error", description: err.message, variant: "destructive" });
},
});

const statusColor: Record<string, string> = {
draft: "bg-muted/20 text-muted-foreground border-border/20",
active: "bg-amber-500/20 text-amber-400 border-amber-500/30",
closed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
expired: "bg-muted/20 text-muted-foreground border-border/20",
};

return (
<div className="space-y-4">
<div className="flex items-center justify-between">
<p className="text-sm font-display font-semibold">Cash Drop Management</p>
<Button size="sm" onClick={() => setShowForm(!showForm)} className="h-8 text-[11px] font-display bg-amber-500 text-black hover:bg-amber-400 px-3" data-testid="button-new-cash-drop">
<Plus className="w-3.5 h-3.5 mr-1" /> New Drop
</Button>
</div>

{showForm && (
<div className="glass-card rounded-xl p-6 space-y-5 border border-amber-500/30">
<div className="flex items-center gap-2 mb-1">
<DollarSign className="w-4 h-4 text-amber-400" />
<span className="text-xs text-muted-foreground uppercase tracking-wider font-display">{editingDrop ? `Editing: ${editingDrop.title}` : "Post Cash Drop"}</span>
</div>

<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Mission Title <span className="text-destructive">*</span></label>
<Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mountain Photo Challenge" className="premium-input rounded-md" data-testid="input-drop-title" />
</div>

<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Mission Description</label>
<Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the mission in detail — what do participants need to do?" className="premium-input rounded-md min-h-[100px]" data-testid="input-drop-description" />
</div>

<div className="space-y-2">
<div className="flex items-center justify-between">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Sponsored Drop</label>
<div className="flex items-center gap-2">
<span className="text-[10px] text-muted-foreground font-display">Mark as Sponsored</span>
<Switch checked={form.isSponsored} onCheckedChange={(v) => setForm(f => ({ ...f, isSponsored: v }))} data-testid="toggle-is-sponsored" />
</div>
</div>
{form.isSponsored && (
  <div className="space-y-2">
    <select
      value={form.sponsorId}
      onChange={(e) => {
        const selected = approvedSponsors.find((s: any) => String(s.id) === e.target.value);
        setForm(f => ({ ...f, sponsorId: e.target.value, sponsorName: selected ? selected.companyName : f.sponsorName }));
      }}
      className="w-full rounded-md border border-border/30 bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
      data-testid="select-approved-sponsor"
    >
      <option value="">— Select approved sponsor (or enter below) —</option>
      {approvedSponsors.map((s: any) => (
        <option key={s.id} value={String(s.id)}>{s.companyName} ({s.contactEmail})</option>
      ))}
    </select>
    <Input value={form.sponsorName} onChange={(e) => setForm(f => ({ ...f, sponsorName: e.target.value }))} placeholder="Sponsor name (auto-filled from picker above)" className="premium-input rounded-md" data-testid="input-drop-sponsor" />
  </div>
)}
</div>

{form.isSponsored && (
<div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
<p className="text-[10px] font-display font-bold tracking-widest text-amber-400 uppercase flex items-center gap-1">
<Flame className="w-3 h-3" /> Sponsored Reward Settings
</p>
<div className="flex items-center justify-between">
<div>
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Show Sponsor Branding</label>
<p className="text-[10px] text-muted-foreground/40">Display sponsor name/logo on drop card and detail</p>
</div>
<Switch checked={form.brandingEnabled} onCheckedChange={(v) => setForm(f => ({ ...f, brandingEnabled: v }))} data-testid="toggle-branding-enabled" />
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Reward Type</label>
<select
value={form.rewardType}
onChange={(e) => setForm(f => ({ ...f, rewardType: e.target.value }))}
className="w-full rounded-md border border-border/30 bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
data-testid="select-reward-type"
>
<option value="cash">Cash (GUBER handles payout)</option>
<option value="discount">Discount / Coupon</option>
<option value="free_item">Free Product or Service</option>
<option value="gift_card">Gift Card</option>
</select>
</div>
{form.rewardType !== "cash" && (
<>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Reward Description</label>
<Input value={form.rewardDescription} onChange={(e) => setForm(f => ({ ...f, rewardDescription: e.target.value }))} placeholder="e.g. 20% off next purchase" className="premium-input rounded-md" data-testid="input-reward-description" />
</div>
<div className="grid grid-cols-2 gap-3">
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Reward Quantity</label>
<Input type="number" value={form.rewardQuantity} onChange={(e) => setForm(f => ({ ...f, rewardQuantity: parseInt(e.target.value) || 0 }))} className="premium-input rounded-md" data-testid="input-reward-quantity" />
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Redemption Method</label>
<select
value={form.rewardRedemptionType}
onChange={(e) => setForm(f => ({ ...f, rewardRedemptionType: e.target.value }))}
className="w-full rounded-md border border-border/30 bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
data-testid="select-reward-redemption-type"
>
<option value="">— Select —</option>
<option value="visit_store">Visit store in person</option>
<option value="show_screen">Show screen to staff</option>
<option value="code">Use a code</option>
</select>
</div>
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Redemption Instructions</label>
<Textarea value={form.redemptionInstructions} onChange={(e) => setForm(f => ({ ...f, redemptionInstructions: e.target.value }))} placeholder="e.g. Show this screen to any cashier." className="premium-input rounded-md min-h-[60px]" data-testid="input-redemption-instructions" />
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">No Purchase Required Text</label>
<Input value={form.noPurchaseRequiredText} onChange={(e) => setForm(f => ({ ...f, noPurchaseRequiredText: e.target.value }))} placeholder="No purchase necessary to participate." className="premium-input rounded-md" data-testid="input-no-purchase-text" />
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Disclaimer (optional)</label>
<Input value={form.disclaimerText} onChange={(e) => setForm(f => ({ ...f, disclaimerText: e.target.value }))} placeholder="e.g. Valid for first-time customers only." className="premium-input rounded-md" data-testid="input-disclaimer-text" />
</div>
</>
)}
</div>
)}

<div className="space-y-2">
<div className="flex items-center justify-between">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
<MapPin className="w-3 h-3" />
Drop Location <span className="text-destructive">*</span>
</label>
<button
type="button"
onClick={handleUseLocation}
disabled={useLocating}
className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-display font-bold tracking-wider transition-colors disabled:opacity-50"
data-testid="button-use-location"
>
{useLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
USE MY LOCATION
</button>
</div>
<PlacesAutocomplete
value={addressInput}
onChange={setAddressInput}
onPlaceSelect={(place) => {
setAddressInput(place.name ? `${place.name}, ${place.address}` : place.address);
setForm(f => ({ ...f, gpsLat: String(place.lat.toFixed(6)), gpsLng: String(place.lng.toFixed(6)) }));
if (place.zip) setZipInput(place.zip);
toast({ title: "Location pinpointed!", description: place.address });
}}
placeholder="Search address or place name..."
data-testid="input-drop-address"
/>
{form.gpsLat && form.gpsLng && (
<div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
<p className="text-[11px] text-primary font-mono font-semibold" data-testid="text-drop-coordinates">{form.gpsLat}, {form.gpsLng}</p>
<button type="button" onClick={() => setForm(f => ({ ...f, gpsLat: "", gpsLng: "" }))} className="text-muted-foreground/40 hover:text-destructive" data-testid="button-clear-coordinates">
<X className="w-3.5 h-3.5" />
</button>
</div>
)}
</div>

<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Arrival Radius</label>
<div className="flex items-center gap-3">
<Input type="number" value={form.gpsRadius} onChange={(e) => setForm(f => ({ ...f, gpsRadius: parseInt(e.target.value) || 200 }))} className="premium-input rounded-md w-28" data-testid="input-drop-radius" />
<span className="text-[10px] text-muted-foreground font-display">{form.gpsRadius <= 100 ? "Very close — same building" : form.gpsRadius <= 250 ? "~1 city block" : form.gpsRadius <= 500 ? "~2-3 blocks" : "Wide area"} ({form.gpsRadius}m)</span>
</div>
</div>

<div className="grid grid-cols-2 gap-3">
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Reward Per Winner ($)</label>
<Input type="number" value={form.rewardPerWinner} onChange={(e) => setForm(f => ({ ...f, rewardPerWinner: parseFloat(e.target.value) || 0 }))} className="premium-input rounded-md" data-testid="input-drop-reward" />
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Max Winners</label>
<Input type="number" value={form.winnerLimit} onChange={(e) => setForm(f => ({ ...f, winnerLimit: parseInt(e.target.value) || 1 }))} className="premium-input rounded-md" data-testid="input-drop-winner-limit" />
</div>
</div>

<div className="grid grid-cols-2 gap-3 rounded-xl border border-border/20 p-3">
<div className="space-y-2">
<label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Cash Winner Cap</label>
<Input type="number" min={0} value={form.cashWinnerCount} onChange={(e) => { const v = parseInt(e.target.value); setForm(f => ({ ...f, cashWinnerCount: isNaN(v) ? 1 : Math.max(0, v) })); }} className="premium-input rounded-md" data-testid="input-cash-winner-count" />
<p className="text-[10px] text-muted-foreground/40">Admin confirms up to N cash winners</p>
</div>
<div className="space-y-2">
<label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Reward Winner Cap</label>
<Input type="number" min={0} value={form.rewardWinnerCount} onChange={(e) => setForm(f => ({ ...f, rewardWinnerCount: parseInt(e.target.value) || 0 }))} className="premium-input rounded-md" data-testid="input-reward-winner-count" />
<p className="text-[10px] text-muted-foreground/40">Auto-selected by arrival after cash cap hit</p>
</div>
</div>

<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Final Location Mode</label>
<select
value={form.finalLocationMode}
onChange={(e) => setForm(f => ({ ...f, finalLocationMode: e.target.value }))}
className="w-full rounded-md border border-border/30 bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
data-testid="select-final-location-mode"
>
<option value="none">None (no location info shared)</option>
<option value="name_only">Name Only (business name shared, no address)</option>
<option value="destination">Destination (full route-to-location)</option>
</select>
</div>

{(form.rewardPerWinner > 0 && form.winnerLimit > 0) && (
<div className="p-3 rounded-md glass-card-strong premium-border-glow">
<div className="flex justify-between items-center text-sm">
<span className="text-muted-foreground font-display flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Payout</span>
<span className="guber-text-green font-display font-bold" data-testid="text-total-payout">${(form.rewardPerWinner * form.winnerLimit).toFixed(2)}</span>
</div>
</div>
)}

<div className="space-y-3">
<div className="flex items-center gap-2">
<Clock className="w-3.5 h-3.5 text-muted-foreground" />
<span className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Schedule (optional)</span>
</div>
<div className="grid grid-cols-2 gap-3">
<div className="space-y-1">
<label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">Start</label>
<Input type="datetime-local" value={form.startTime} onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))} className="premium-input rounded-md text-xs" data-testid="input-drop-start" />
</div>
<div className="space-y-1">
<label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-display">End</label>
<Input type="datetime-local" value={form.endTime} onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))} className="premium-input rounded-md text-xs" data-testid="input-drop-end" />
</div>
</div>
</div>

<div className="space-y-3">
<div className="flex items-center gap-2">
<Eye className="w-3.5 h-3.5 text-muted-foreground" />
<span className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Mission Config</span>
</div>
<div className="space-y-2">
<label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Clue Text</label>
<Textarea value={form.clueText} onChange={(e) => setForm(f => ({ ...f, clueText: e.target.value }))} placeholder="Optional hint shown to participants — e.g. 'Look for the red awning'" className="premium-input rounded-md min-h-[70px]" data-testid="input-drop-clue" />
</div>
<div className="flex items-center justify-between p-3 rounded-md glass-card-strong premium-border">
<div>
<p className="text-sm font-display">Reveal clue on arrival</p>
<p className="text-[10px] text-muted-foreground">Only show after GPS confirms they're close</p>
</div>
<Switch checked={form.clueRevealOnArrival} onCheckedChange={(v) => setForm(f => ({ ...f, clueRevealOnArrival: v }))} data-testid="switch-clue-on-arrival" />
</div>
<div className="flex items-center justify-between p-3 rounded-md glass-card-strong premium-border">
<div>
<p className="text-sm font-display">In-app camera only</p>
<p className="text-[10px] text-muted-foreground">Disables gallery uploads — live proof only</p>
</div>
<Switch checked={form.requireInAppCamera} onCheckedChange={(v) => setForm(f => ({ ...f, requireInAppCamera: v }))} data-testid="switch-in-app-camera" />
</div>
</div>

<div className="space-y-3">
<div className="flex items-center gap-2">
<Camera className="w-3.5 h-3.5 text-muted-foreground" />
<span className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Proof Items</span>
</div>
{form.proofItems.map((item, i) => (
<div key={i} className="flex items-center gap-2">
<Input value={item.label} onChange={(e) => { const items = [...form.proofItems]; items[i] = { ...items[i], label: e.target.value }; setForm(f => ({ ...f, proofItems: items })); }} placeholder="e.g. Front of building" className="premium-input rounded-md flex-1" data-testid={`input-proof-label-${i}`} />
<select value={item.type} onChange={(e) => { const items = [...form.proofItems]; items[i] = { ...items[i], type: e.target.value }; setForm(f => ({ ...f, proofItems: items })); }} className="bg-background border border-border/30 rounded-md text-xs px-2 h-9 text-foreground" data-testid={`select-proof-type-${i}`}>
<option value="photo">Photo</option>
<option value="video">Video</option>
</select>
<button type="button" onClick={() => setForm(f => ({ ...f, proofItems: f.proofItems.filter((_, idx) => idx !== i) }))} className="text-muted-foreground/30 hover:text-destructive p-1" data-testid={`button-remove-proof-${i}`}><Trash2 className="w-3.5 h-3.5" /></button>
</div>
))}
<Button type="button" variant="outline" onClick={() => setForm(f => ({ ...f, proofItems: [...f.proofItems, { label: "", type: "photo" }] }))} className="w-full h-9 font-display text-[11px] border-dashed border-border/30 text-muted-foreground hover:text-foreground" data-testid="button-add-proof-item">
<Plus className="w-3.5 h-3.5 mr-1" /> Add Proof Item
</Button>
</div>

<div className="flex gap-2 pt-2">
<Button variant="ghost" onClick={closeForm} className="font-display text-muted-foreground" data-testid="button-cancel-drop">Cancel</Button>
<div className="flex-1" />
{!editingDrop && (
<Button variant="outline" onClick={() => createMutation.mutate(undefined)} disabled={createMutation.isPending || !form.title || !form.gpsLat} className="font-display border-border/30" data-testid="button-save-draft">
{createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as Draft"}
</Button>
)}
<Button onClick={() => createMutation.mutate(editingDrop ? undefined : "active")} disabled={createMutation.isPending || !form.title || !form.gpsLat} className="font-display bg-amber-500 text-black hover:bg-amber-400 gap-1" data-testid="button-post-drop">
{createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingDrop ? <><Save className="w-4 h-4" /> Save Changes</> : <><Zap className="w-4 h-4" /> Post Now — Activate</>}
</Button>
</div>
</div>
)}

{isLoading ? (
<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
) : drops && drops.length > 0 ? (
<div className="space-y-3">
{drops.map((drop: any) => (
<div key={drop.id} className="bg-card rounded-xl border border-border/20 p-4 space-y-3" data-testid={`cashdrop-card-${drop.id}`}>
<div className="flex items-start justify-between gap-2">
<div className="min-w-0">
<div className="flex items-center gap-2 flex-wrap">
<p className="text-sm font-display font-semibold truncate">{drop.title}</p>
<Badge variant="outline" className={`text-[9px] capitalize ${statusColor[drop.status] || "bg-muted/20 text-muted-foreground"}`}>{drop.status}</Badge>
</div>
<p className="text-[10px] text-muted-foreground">${drop.reward_per_winner} × {drop.winner_limit} winner{drop.winner_limit !== 1 ? "s" : ""} · {drop.winners_found || 0} found</p>
</div>
<div className="flex items-center gap-1.5 flex-shrink-0">
{drop.status === "draft" && (
<Button size="sm" onClick={() => patchMutation.mutate({ id: drop.id, data: { status: "active" } })} disabled={patchMutation.isPending} className="h-7 text-[10px] font-display bg-amber-500 text-black hover:bg-amber-400 px-2" data-testid={`button-activate-drop-${drop.id}`}>Activate</Button>
)}
{drop.status === "active" && (
<Button size="sm" onClick={() => patchMutation.mutate({ id: drop.id, data: { status: "closed" } })} disabled={patchMutation.isPending} variant="outline" className="h-7 text-[10px] font-display border-border/30 px-2" data-testid={`button-close-drop-${drop.id}`}>Close</Button>
)}
<Button size="sm" variant="ghost" onClick={() => setReviewDrop(reviewDrop === drop.id ? null : drop.id)} className="h-7 text-[10px] font-display px-2 text-primary" data-testid={`button-review-drop-${drop.id}`}>
{reviewDrop === drop.id ? "Hide" : "Submissions"}
</Button>
<Button size="sm" variant="ghost" onClick={() => openEdit(drop)} className="h-7 text-[10px] font-display px-2 text-amber-400 hover:text-amber-300" data-testid={`button-edit-drop-${drop.id}`}>
<Edit className="w-3.5 h-3.5" />
</Button>
<Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this Cash Drop?")) deleteMutation.mutate(drop.id); }} disabled={deleteMutation.isPending} className="h-7 text-[10px] font-display px-2 text-muted-foreground/40 hover:text-destructive" data-testid={`button-delete-drop-${drop.id}`}>
<Trash2 className="w-3.5 h-3.5" />
</Button>
</div>
</div>

{reviewDrop === drop.id && (
<div className="pt-2 border-t border-border/10 space-y-3">
<p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">Submissions</p>
{!attempts || attempts.length === 0 ? (
<p className="text-[11px] text-muted-foreground/40 text-center py-4">No submissions yet</p>
) : (
attempts.filter((a: any) => a.status === "submitted").map((attempt: any) => (
<div key={attempt.id} className="bg-background rounded-xl border border-border/10 p-4 space-y-3" data-testid={`attempt-card-${attempt.id}`}>
<div className="flex items-center justify-between">
<div>
<p className="text-sm font-semibold">{attempt.user_name || `User #${attempt.user_id}`}</p>
<p className="text-[10px] text-muted-foreground">
Submitted {(attempt.submittedAt || attempt.submitted_at) ? new Date(attempt.submittedAt || attempt.submitted_at).toLocaleString() : "—"} ·
GPS: {(attempt.gpsLat || attempt.gps_lat) ? `${parseFloat(attempt.gpsLat || attempt.gps_lat).toFixed(4)}, ${parseFloat(attempt.gpsLng || attempt.gps_lng).toFixed(4)}` : "N/A"}
</p>
</div>
<Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">Pending Review</Badge>
</div>

{(attempt.proofUrls || attempt.proof_urls) && (attempt.proofUrls || attempt.proof_urls).length > 0 && (
<div className="grid grid-cols-3 gap-1.5">
{(attempt.proofUrls || attempt.proof_urls).map((url: string, i: number) => (
<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border/10" data-testid={`proof-photo-${attempt.id}-${i}`}>
<img src={url} className="w-full h-full object-cover" alt={`proof ${i + 1}`} />
</a>
))}
</div>
)}

{(attempt.payoutMethod || attempt.payout_method) && (
<div className="bg-muted/10 rounded-lg px-3 py-2 space-y-1" data-testid={`attempt-payout-info-${attempt.id}`}>
<p className="text-[10px] font-display font-bold tracking-widest text-foreground uppercase mb-1">Payout Details</p>
<p className="text-[12px] text-foreground">
Method: <span className="font-semibold capitalize">{(attempt.payoutMethod || attempt.payout_method)?.replace("_", " ")}</span>
{(attempt.payoutHandle || attempt.payout_handle) && <span className="ml-2 text-foreground font-semibold">({attempt.payoutHandle || attempt.payout_handle})</span>}
</p>
{(attempt.payoutBankName || attempt.payout_bank_name) && (
<p className="text-[11px] text-foreground">
Bank: <span className="text-foreground font-semibold">{attempt.payoutBankName || attempt.payout_bank_name}</span>
{(attempt.payoutAccountType || attempt.payout_account_type) && <span className="ml-1">({attempt.payoutAccountType || attempt.payout_account_type})</span>}
{(attempt.payoutRoutingNumber || attempt.payout_routing_number) && <span className="ml-2">Routing: •••{(attempt.payoutRoutingNumber || attempt.payout_routing_number).slice(-4)}</span>}
{(attempt.payoutAccountNumber || attempt.payout_account_number) && <span className="ml-2">Acct: •••{(attempt.payoutAccountNumber || attempt.payout_account_number).slice(-4)}</span>}
</p>
)}
</div>
)}

<div className="flex gap-2 pt-1">
<Button
size="sm"
onClick={() => confirmMutation.mutate({ dropId: drop.id, attemptId: attempt.id })}
disabled={confirmMutation.isPending}
className="flex-1 h-8 text-[11px] font-display bg-primary text-primary-foreground"
data-testid={`button-confirm-winner-${attempt.id}`}
>
{confirmMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Winner"}
</Button>
<Button
size="sm"
variant="outline"
onClick={() => {
const reason = prompt("Rejection reason:");
if (reason !== null) rejectMutation.mutate({ dropId: drop.id, attemptId: attempt.id, reason });
}}
disabled={rejectMutation.isPending}
className="flex-1 h-8 text-[11px] font-display border-destructive/30 text-destructive"
data-testid={`button-reject-attempt-${attempt.id}`}
>
Reject
</Button>
</div>
</div>
))
)}

{attempts && attempts.filter((a: any) => a.status !== "submitted").length > 0 && (
<div>
<p className="text-[10px] font-display text-foreground/70 uppercase tracking-widest mb-2 font-bold">Other attempts</p>
{attempts.filter((a: any) => a.status !== "submitted").map((attempt: any) => (
<div key={attempt.id} className="flex items-center gap-3 py-1.5 border-t border-border/10">
<div className="flex-1 min-w-0">
<p className="text-[12px] font-semibold text-foreground">{attempt.user_name || `User #${attempt.user_id}`}</p>
{(attempt.payoutMethod || attempt.payout_method) && (
<div>
<p className="text-[11px] text-foreground font-medium">
Payout: <span className="font-semibold capitalize">{(attempt.payoutMethod || attempt.payout_method)?.replace("_", " ")}</span> {(attempt.payoutHandle || attempt.payout_handle) ? <span className="font-semibold">({attempt.payoutHandle || attempt.payout_handle})</span> : ""}
{(attempt.payoutStatus || attempt.payout_status) === "paid" && <span className="text-emerald-400 font-bold"> — PAID</span>}
</p>
{(attempt.payoutBankName || attempt.payout_bank_name) && (
<p className="text-[11px] text-foreground font-medium">
Bank: {attempt.payoutBankName || attempt.payout_bank_name}
{(attempt.payoutAccountType || attempt.payout_account_type) && ` (${attempt.payoutAccountType || attempt.payout_account_type})`}
{(attempt.payoutAccountNumber || attempt.payout_account_number) && ` •••${(attempt.payoutAccountNumber || attempt.payout_account_number).slice(-4)}`}
</p>
)}
</div>
)}
</div>
<div className="flex items-center gap-2">
<Badge variant="outline" className="text-[9px] capitalize">{attempt.status}</Badge>
{attempt.status === "won" && (attempt.payoutStatus || attempt.payout_status) !== "paid" && (attempt.payoutMethod || attempt.payout_method) && (
<Button
size="sm"
className="h-6 text-[9px] px-2 bg-emerald-500 text-white"
onClick={() => markPaidMutation.mutate(attempt.id)}
disabled={markPaidMutation.isPending}
data-testid={`button-mark-paid-${attempt.id}`}
>
Mark Paid
</Button>
)}
</div>
</div>
))}
</div>
)}
</div>
)}
</div>
))}
</div>
) : (
<div className="text-center py-12">
<p className="text-sm text-muted-foreground/40 font-display">No Cash Drops created yet</p>
<p className="text-[11px] text-muted-foreground/25 mt-1">Create one above; activate it to make it live</p>
</div>
)}
</div>
);
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function SponsorsTab({ onCreateDrop }: { onCreateDrop?: (sponsor: any) => void }) {
  const { toast } = useToast();
  const [selectedSponsor, setSelectedSponsor] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [linkedDropId, setLinkedDropId] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const { data: sponsors = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/drop-sponsors", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/admin/drop-sponsors"
        : `/api/admin/drop-sponsors?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sponsors");
      return res.json();
    },
  });

  const { data: allSponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/drop-sponsors", "all"],
    queryFn: async () => {
      const res = await fetch("/api/admin/drop-sponsors", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: drops = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/cash-drops"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cash-drops", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/admin/drop-sponsors/${id}`, data),
    onSuccess: () => {
      toast({ title: "Sponsor updated" });
      refetch();
      setSelectedSponsor(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusColor: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
    active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-muted/20 text-muted-foreground border-border/20",
  };

  const pendingCount = allSponsors.filter((s: any) => s.status === "pending").length;
  const STATUS_FILTERS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-display font-bold">Cash Drop Sponsors</p>
            <p className="text-[11px] text-muted-foreground">{allSponsors.length} total · {pendingCount} pending review</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="text-[9px] font-display font-black tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 uppercase">
            {pendingCount} New
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap" data-testid="sponsor-status-filter">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            data-testid={`filter-sponsor-${key}`}
            className={`px-3 py-1 rounded-full text-[10px] font-display font-bold tracking-widest uppercase transition-colors ${
              statusFilter === key
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-muted-foreground/40 border border-border/20 hover:text-muted-foreground"
            }`}
          >
            {label}
            {key === "pending" && pendingCount > 0 && (
              <span className="ml-1 text-amber-400">({pendingCount})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : sponsors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground/40 font-display text-sm">
          No sponsor requests yet
        </div>
      ) : (
        <div className="space-y-3">
          {sponsors.map((sponsor: any) => (
            <div
              key={sponsor.id}
              className="rounded-xl border border-border/20 bg-muted/5 p-4 cursor-pointer hover:bg-muted/10 transition-colors"
              onClick={() => {
                setSelectedSponsor(sponsor);
                setAdminNotes(sponsor.adminNotes || "");
                setLinkedDropId(sponsor.linkedDropId ? String(sponsor.linkedDropId) : "");
              }}
              data-testid={`card-sponsor-${sponsor.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-display font-bold truncate">{sponsor.companyName}</p>
                    <span className={`text-[9px] font-display font-black tracking-widest uppercase px-1.5 py-0.5 rounded-full border ${statusColor[sponsor.status] || "bg-muted/20 text-muted-foreground"}`}>
                      {sponsor.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{sponsor.contactEmail}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {sponsor.targetCityState && (
                      <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{sponsor.targetCityState}
                      </span>
                    )}
                    {sponsor.cashContribution ? (
                      <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />${sponsor.cashContribution} contrib
                      </span>
                    ) : sponsor.proposedBudget ? (
                      <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />${sponsor.proposedBudget} budget
                      </span>
                    ) : null}
                    <span className={`text-[9px] font-display font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                      sponsor.paymentStatus === "received" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                      sponsor.paymentStatus === "donated" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
                      "text-muted-foreground/40 bg-muted/10 border-border/20"
                    }`} data-testid={`text-payment-status-${sponsor.id}`}>
                      pay: {sponsor.paymentStatus || "pending"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30">
                      {new Date(sponsor.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mt-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSponsor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedSponsor(null)}>
          <div
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.3)", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-base">{selectedSponsor.companyName}</p>
                <button onClick={() => setSelectedSponsor(null)} className="text-muted-foreground/40 hover:text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-[12px] text-muted-foreground">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Contact</span><br />{selectedSponsor.contactName || "—"} · {selectedSponsor.contactEmail}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Budget</span><br />{selectedSponsor.proposedBudget ? `$${selectedSponsor.proposedBudget}` : "Not specified"}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Location</span><br />{selectedSponsor.targetCityState || "—"} {selectedSponsor.targetZipCode && `(${selectedSponsor.targetZipCode})`}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Preferred Date</span><br />{selectedSponsor.requestedDropDate || "Flexible"}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Sponsorship Type</span><br /><span className="capitalize">{selectedSponsor.sponsorshipType || "cash"}</span></div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Cash Contribution</span><br />{selectedSponsor.cashContribution ? `$${selectedSponsor.cashContribution}` : "—"}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Reward Type</span><br />{selectedSponsor.rewardType}</div>
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Redemption</span><br />{selectedSponsor.redemptionType?.replace(/_/g, " ") || "—"}</div>
                </div>
                {selectedSponsor.rewardDescription && (
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Reward Description</span><br />{selectedSponsor.rewardDescription}</div>
                )}
                {selectedSponsor.sponsorMessage && (
                  <div className="rounded-lg bg-muted/10 p-3">
                    <p className="text-muted-foreground/40 font-display uppercase text-[10px] mb-1">Message</p>
                    <p>{selectedSponsor.sponsorMessage}</p>
                  </div>
                )}
                {selectedSponsor.redemptionInstructions && (
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Redemption Instructions</span><br />{selectedSponsor.redemptionInstructions}</div>
                )}
                {selectedSponsor.noPurchaseRequiredText && (
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">No Purchase Required Text</span><br />{selectedSponsor.noPurchaseRequiredText}</div>
                )}
                {selectedSponsor.disclaimerText && (
                  <div><span className="text-muted-foreground/40 font-display uppercase text-[10px]">Disclaimer</span><br />{selectedSponsor.disclaimerText}</div>
                )}
              </div>

              {/* Payment Status section */}
              <div className="border-t border-border/20 pt-4">
                <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase mb-2">Payment Status</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: "pending", label: "Pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
                    { key: "received", label: "Received", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                    { key: "donated", label: "Donated", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                  ].map(({ key, label, cls }) => (
                    <button
                      key={key}
                      onClick={() => updateMutation.mutate({ id: selectedSponsor.id, data: { paymentStatus: key } })}
                      data-testid={`button-payment-status-${key}`}
                      className={`text-[10px] font-display font-black tracking-widest uppercase px-3 py-1.5 rounded-full border transition-all ${cls} ${selectedSponsor.paymentStatus === key ? "ring-2 ring-offset-1 ring-current ring-offset-background" : "opacity-60 hover:opacity-100"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/20 pt-4 space-y-3">
                <div>
                  <label className="text-[10px] font-display font-bold tracking-widest text-[#00E5E5] uppercase block mb-1.5">Admin Notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes about this sponsor..."
                    className="w-full rounded-xl border border-border/30 bg-muted/10 p-3 text-sm text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none"
                    rows={3}
                    data-testid="input-sponsor-admin-notes"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-display font-bold tracking-widest text-[#00E5E5] uppercase block mb-1.5">Link to Cash Drop (optional)</label>
                  <select
                    value={linkedDropId}
                    onChange={(e) => setLinkedDropId(e.target.value)}
                    className="w-full rounded-xl border border-border/30 bg-muted/10 p-2.5 text-sm text-foreground focus:outline-none"
                    data-testid="select-linked-drop"
                  >
                    <option value="">— Not linked —</option>
                    {drops.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.title} ({d.status})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Create Drop from Sponsor shortcut */}
              {onCreateDrop && (
                <div className="border-t border-amber-500/20 pt-4">
                  <Button
                    className="w-full h-10 text-[11px] font-display font-black tracking-widest uppercase bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20"
                    variant="ghost"
                    onClick={() => {
                      onCreateDrop(selectedSponsor);
                      setSelectedSponsor(null);
                    }}
                    data-testid="button-create-drop-from-sponsor"
                  >
                    <Flame className="w-3.5 h-3.5 mr-2" />
                    Create Drop from this Sponsor
                  </Button>
                  <p className="text-[10px] text-muted-foreground/40 text-center mt-1.5">Switches to Cash Drops tab and pre-fills form</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 border-t border-border/20 pt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-[11px] font-display border border-muted/30 hover:bg-muted/10"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selectedSponsor.id, data: { adminNotes, linkedDropId: linkedDropId || null } })}
                  data-testid="button-sponsor-save-notes"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Notes"}
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-[11px] font-display bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selectedSponsor.id, data: { status: "approved", adminNotes, linkedDropId: linkedDropId || null } })}
                  data-testid="button-sponsor-approve"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9 text-[11px] font-display"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selectedSponsor.id, data: { status: "rejected", adminNotes } })}
                  data-testid="button-sponsor-reject"
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});

  const queryKey = statusFilter === "all" ? ["/api/admin/feedback"] : ["/api/admin/feedback", statusFilter];
  const feedbackUrl = statusFilter === "all" ? "/api/admin/feedback" : `/api/admin/feedback?status=${statusFilter}`;

  const { data: feedbackList, isLoading, refetch } = useQuery<any[]>({
    queryKey,
    queryFn: () => fetch(feedbackUrl, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/feedback/unread-count"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: number; status?: string; adminNote?: string }) =>
      apiRequest("PATCH", `/api/admin/feedback/${id}`, { status, adminNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback/unread-count"] });
      toast({ title: "Updated" });
    },
  });

  const statusColors: Record<string, string> = {
    new: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    read: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    addressed: "border-muted-foreground/30 text-muted-foreground bg-muted/10",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-display font-bold text-foreground">User Feedback</p>
          <p className="text-[11px] text-muted-foreground">{unreadData?.count ?? 0} unread</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-background border border-border/20 rounded-lg px-2.5 py-1.5 outline-none text-foreground font-display"
            data-testid="select-feedback-status-filter"
          >
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="addressed">Addressed</option>
          </select>
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="font-display text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-center py-8 text-xs text-muted-foreground/40">Loading feedback…</div>}

      {!isLoading && (!feedbackList || feedbackList.length === 0) && (
        <div className="text-center py-12">
          <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/40 font-display">No feedback {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}</p>
        </div>
      )}

      <div className="space-y-3">
        {feedbackList?.map((item: any) => (
          <div key={item.id} className={`bg-card border rounded-xl p-4 space-y-3 transition-all ${item.status === "new" ? "border-emerald-500/20" : "border-border/20"}`} data-testid={`card-feedback-${item.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-display font-bold text-xs text-foreground">{item.userName || "Anonymous"}</span>
                  {item.userEmail && <span className="text-[10px] text-muted-foreground">{item.userEmail}</span>}
                  <Badge variant="outline" className={`text-[9px] font-display ${statusColors[item.status] || statusColors.new}`}>
                    {item.status === "new" ? "New" : item.status === "read" ? "Read" : "Addressed"}
                  </Badge>
                  {item.category && item.category !== "general" && (
                    <Badge variant="outline" className="text-[9px] border-muted-foreground/20 text-muted-foreground">{item.category}</Badge>
                  )}
                </div>
                {item.subject && <p className="text-xs font-semibold text-foreground/80 mb-0.5">{item.subject}</p>}
                <p className="text-xs text-muted-foreground leading-relaxed">{item.message}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1">{relativeTime(item.createdAt)}</p>
              </div>
            </div>

            {item.adminNote && (
              <div className="rounded-lg bg-muted/10 border border-border/10 p-2.5">
                <p className="text-[10px] text-muted-foreground font-display mb-0.5">Admin Note</p>
                <p className="text-xs text-muted-foreground">{item.adminNote}</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex gap-1">
                <input
                  className="flex-1 text-xs bg-background/50 border border-border/20 rounded-lg px-2.5 py-1.5 outline-none text-foreground placeholder:text-muted-foreground/30"
                  placeholder="Add admin note…"
                  value={noteInputs[item.id] ?? item.adminNote ?? ""}
                  onChange={e => setNoteInputs(n => ({ ...n, [item.id]: e.target.value }))}
                  data-testid={`input-admin-note-${item.id}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updateMutation.mutate({ id: item.id, adminNote: noteInputs[item.id] ?? item.adminNote ?? "" })}
                  disabled={updateMutation.isPending}
                  className="shrink-0 text-xs font-display"
                  data-testid={`button-save-note-${item.id}`}
                >
                  <Save className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex gap-2">
                {item.status !== "read" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateMutation.mutate({ id: item.id, status: "read" })}
                    disabled={updateMutation.isPending}
                    className="flex-1 h-7 text-[10px] font-display border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    data-testid={`button-mark-read-${item.id}`}
                  >
                    <Eye className="w-3 h-3 mr-1" /> Mark Read
                  </Button>
                )}
                {item.status !== "addressed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateMutation.mutate({ id: item.id, status: "addressed" })}
                    disabled={updateMutation.isPending}
                    className="flex-1 h-7 text-[10px] font-display border-muted-foreground/30 text-muted-foreground hover:bg-muted/20"
                    data-testid={`button-mark-addressed-${item.id}`}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Mark Addressed
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyQueueTab({ allUsers, usersLoading, bgCheckMutation }: {
  allUsers: User[] | undefined;
  usersLoading: boolean;
  bgCheckMutation: { mutate: (args: { id: number; status: string; restrictions: string[] }) => void; isPending: boolean };
}) {
  const [searches, setSearches] = useState<Record<number, { loading: boolean; results: unknown[]; searchUrl: string; done: boolean; error: string | null }>>({});

  const pendingUsers = (allUsers ?? [])
    .filter(u => !u.backgroundCheckStatus || u.backgroundCheckStatus === "none")
    .sort((a, b) => new Date((b as any).createdAt ?? 0).getTime() - new Date((a as any).createdAt ?? 0).getTime());

  const searchNSOPW = async (userId: number, fullName: string) => {
    const parts = (fullName || "").trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || parts[0] || "";
    setSearches(prev => ({ ...prev, [userId]: { loading: true, results: [], searchUrl: "", done: false, error: null } }));
    try {
      const res = await fetch(`/api/admin/nsopw-search?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`);
      const data = await res.json();
      setSearches(prev => ({ ...prev, [userId]: { loading: false, results: data.results ?? [], searchUrl: data.searchUrl ?? "", done: true, error: null } }));
    } catch {
      setSearches(prev => ({ ...prev, [userId]: { loading: false, results: [], searchUrl: "", done: true, error: "Search unavailable — use the NSOPW link." } }));
    }
  };

  if (usersLoading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-[#00E5E5]" />
        <h2 className="text-lg font-display font-bold">Safety Queue</h2>
        <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">{pendingUsers.length} pending</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">New signups not yet reviewed. Search the federal sex offender registry, then mark each user clear or flag them.</p>
      {pendingUsers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="w-10 h-10 mx-auto mb-2 text-primary" />
          <p className="font-display">Queue is clear — all users reviewed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingUsers.map(u => {
            const s = searches[u.id];
            const name = (u as any).fullName || u.username || "Unknown";
            return (
              <div key={u.id} className="rounded-xl border border-border/30 bg-card p-4 space-y-3" data-testid={`safety-card-${u.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm">{name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {(u as any).createdAt ? new Date((u as any).createdAt).toLocaleDateString() : "—"}
                        {(u as any).zip ? ` · ZIP ${(u as any).zip}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-[#00E5E5]/40 text-[#00E5E5] hover:bg-[#00E5E5]/10"
                    disabled={s?.loading}
                    onClick={() => searchNSOPW(u.id, name)}
                    data-testid={`btn-nsopw-search-${u.id}`}
                  >
                    {s?.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                    Search Registry
                  </Button>
                </div>

                {s?.done && (
                  <div className="rounded-lg bg-background/50 border border-border/20 p-3 space-y-2">
                    {s.results.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <CheckCircle className="w-4 h-4" /> No registry matches found
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> {s.results.length} match{s.results.length !== 1 ? "es" : ""} found — review carefully
                        </p>
                        {(s.results as Record<string, string>[]).slice(0, 3).map((r, i) => (
                          <div key={i} className="text-xs text-muted-foreground pl-2 border-l border-red-500/30">
                            {r.name || ((r.firstName ?? "") + " " + (r.lastName ?? "")).trim() || "Match"}
                            {r.state ? ` — ${r.state}` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {s.searchUrl && (
                      <a href={s.searchUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                        <ExternalLink className="w-3 h-3" /> View full results on NSOPW.gov
                      </a>
                    )}
                  </div>
                )}

                {s?.error && (
                  <p className="text-xs text-amber-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{s.error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                    disabled={bgCheckMutation.isPending}
                    onClick={() => bgCheckMutation.mutate({ id: u.id, status: "clear", restrictions: [] })}
                    data-testid={`btn-mark-clear-${u.id}`}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Mark Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    disabled={bgCheckMutation.isPending}
                    onClick={() => bgCheckMutation.mutate({ id: u.id, status: "flagged", restrictions: [] })}
                    data-testid={`btn-flag-user-${u.id}`}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Flag
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
const { user } = useAuth();
const { toast } = useToast();
const [activeTab, setActiveTab] = useState("users");
const [sponsorPrefill, setSponsorPrefill] = useState<any | null>(null);
const [strikeUserId, setStrikeUserId] = useState("");
const [strikeReason, setStrikeReason] = useState("");
const [strikeSeverity, setStrikeSeverity] = useState("standard");
const [expandedUser, setExpandedUser] = useState<number | null>(null);
const [bgRestrictions, setBgRestrictions] = useState<string[]>([]);
const [disputeNotes, setDisputeNotes] = useState<Record<number, string>>({});
const [disputeResolution, setDisputeResolution] = useState<Record<number, string>>({});
const [disputeRefund, setDisputeRefund] = useState<Record<number, boolean>>({});
const [proofModalJob, setProofModalJob] = useState<{ id: number; title: string } | null>(null);

const createDropFromSponsor = (sponsor: any) => {
  setSponsorPrefill(sponsor);
  setActiveTab("cashdrop");
};

const { data: allUsers, isLoading: usersLoading } = useQuery<User[]>({
queryKey: ["/api/admin/users"], enabled: user?.role === "admin",
});
const { data: allJobs, isLoading: jobsLoading } = useQuery<Job[]>({
queryKey: ["/api/admin/jobs"], enabled: user?.role === "admin",
});
const { data: feedbackUnreadData } = useQuery<{ count: number }>({
queryKey: ["/api/admin/feedback/unread-count"], enabled: user?.role === "admin",
});
const feedbackUnread = feedbackUnreadData?.count ?? 0;

const updateUserMutation = useMutation({
mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/users/${id}`, data),
onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Updated" }); },
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const tierMutation = useMutation({
mutationFn: ({ id, tier }: { id: number; tier: string }) => apiRequest("PATCH", `/api/admin/users/${id}/tier`, { tier }),
onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Tier updated" }); },
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const grantBusinessMutation = useMutation({
mutationFn: (id: number) => apiRequest("POST", `/api/admin/users/${id}/grant-business-access`, {}),
onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Business access granted", description: "User is now pending_business and can complete setup." }); },
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const bgCheckMutation = useMutation({
mutationFn: ({ id, status, restrictions }: { id: number; status: string; restrictions: string[] }) =>
apiRequest("PATCH", `/api/admin/users/${id}/background-check`, { status, restrictions }),
onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Background check updated" }); },
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const strikeMutation = useMutation({
mutationFn: () => apiRequest("POST", "/api/admin/strike", {
userId: parseInt(strikeUserId),
reason: strikeReason,
severity: strikeSeverity,
}),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
toast({ title: "Strike issued" });
setStrikeUserId("");
setStrikeReason("");
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const disputeMutation = useMutation({
mutationFn: (data: { jobId: number; resolution: string; refundBuyer: boolean; notes?: string }) =>
apiRequest("POST", "/api/admin/resolve-dispute", data),
onSuccess: (_, variables) => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
toast({ title: "Dispute resolved" });
setDisputeNotes(prev => { const n = { ...prev }; delete n[variables.jobId]; return n; });
setDisputeResolution(prev => { const n = { ...prev }; delete n[variables.jobId]; return n; });
setDisputeRefund(prev => { const n = { ...prev }; delete n[variables.jobId]; return n; });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const removeJobMutation = useMutation({
mutationFn: ({ jobId, reason }: { jobId: number; reason?: string }) =>
apiRequest("POST", `/api/admin/jobs/${jobId}/remove`, { reason }),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
toast({ title: "Job removed", description: "Job has been flagged and cancelled." });
},
onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});

const refundJobMutation = useMutation({
mutationFn: ({ jobId, refundApplicationFee }: { jobId: number; refundApplicationFee: boolean }) =>
apiRequest("POST", `/api/admin/jobs/${jobId}/refund`, { refundApplicationFee }),
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
toast({ title: "Refund issued", description: "Payment has been refunded to the buyer." });
},
onError: (err: any) => toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
});

if (user?.role !== "admin") {
return <GuberLayout><div className="text-center py-20"><Shield className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" /><p className="text-muted-foreground font-display">Admin access required</p></div></GuberLayout>;
}

const disputedJobs = allJobs?.filter((j) => j.status === "disputed") || [];

const stats = {
users: allUsers?.length || 0,
jobs: allJobs?.length || 0,
open: allJobs?.filter((j) => j.status === "posted_public").length || 0,
disputes: disputedJobs.length,
};

return (
<>
<GuberLayout>
<div className="max-w-3xl mx-auto px-4 py-6" data-testid="page-admin">
<h1 className="text-xl font-display font-bold mb-4">Admin Panel</h1>

<div className="grid grid-cols-4 gap-2 mb-6">
{[
{ label: "Users", value: stats.users, icon: Users, color: "guber-text-green" },
{ label: "Jobs", value: stats.jobs, icon: Briefcase, color: "guber-text-purple" },
{ label: "Open", value: stats.open, icon: Briefcase, color: "text-yellow-500" },
{ label: "Disputes", value: stats.disputes, icon: AlertTriangle, color: "text-destructive" },
].map((s) => (
<div key={s.label} className="bg-card rounded-xl border border-border/20 p-3 text-center">
<p className={`text-xl font-display font-bold ${s.color}`}>{s.value}</p>
<p className="text-[10px] text-muted-foreground">{s.label}</p>
</div>
))}
</div>

<Tabs value={activeTab} onValueChange={setActiveTab}>
<div className="overflow-x-auto scrollbar-none mb-4 -mx-4 px-4">
<TabsList className="bg-card border border-border/20 w-max min-w-full flex flex-nowrap">
<TabsTrigger value="users" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-users">Users</TabsTrigger>
<TabsTrigger value="verifications" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-verifications">Verifications</TabsTrigger>
<TabsTrigger value="jobs" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-jobs">Jobs</TabsTrigger>
<TabsTrigger value="catalog" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-catalog">Catalog</TabsTrigger>
<TabsTrigger value="templates" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-templates">Templates</TabsTrigger>
<TabsTrigger value="strikes" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-strikes">Strikes</TabsTrigger>
<TabsTrigger value="disputes" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-disputes">Disputes</TabsTrigger>
<TabsTrigger value="audit" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-audit">Audit</TabsTrigger>
<TabsTrigger value="og" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-og">Day-1 OG</TabsTrigger>
<TabsTrigger value="trustbox" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-trustbox">Trust Box</TabsTrigger>
<TabsTrigger value="broadcast" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-broadcast">Broadcast</TabsTrigger>
<TabsTrigger value="cashdrop" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-cashdrop">⚡ Cash Drop</TabsTrigger>
<TabsTrigger value="sponsors" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-sponsors">🔥 Sponsors</TabsTrigger>
<TabsTrigger value="qualifications" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-qualifications">Qualifications</TabsTrigger>
<TabsTrigger value="wallet" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-wallet">Wallet</TabsTrigger>
<TabsTrigger value="payouts" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-payouts">💸 Payouts</TabsTrigger>
<TabsTrigger value="settings" className="font-display shrink-0 whitespace-nowrap" data-testid="tab-settings">Settings</TabsTrigger>
<TabsTrigger value="feedback" className="font-display shrink-0 whitespace-nowrap relative" data-testid="tab-feedback">
  Feedback
  {feedbackUnread > 0 && (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-emerald-500 text-[9px] font-black text-white flex items-center justify-center px-0.5">{feedbackUnread}</span>
  )}
</TabsTrigger>
<TabsTrigger value="safetyqueue" className="font-display shrink-0 whitespace-nowrap relative" data-testid="tab-safetyqueue">
  🛡️ Safety Queue
  {((allUsers ?? []).filter(u => !u.backgroundCheckStatus || u.backgroundCheckStatus === "none").length > 0) && (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-yellow-500 text-[9px] font-black text-black flex items-center justify-center px-0.5">
      {(allUsers ?? []).filter(u => !u.backgroundCheckStatus || u.backgroundCheckStatus === "none").length}
    </span>
  )}
</TabsTrigger>
</TabsList>
</div>

<TabsContent value="verifications">
<VerificationsTab />
</TabsContent>

<TabsContent value="users">
{usersLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
<div className="space-y-2">
<div className="bg-muted/20 rounded-lg p-3 mb-3">
<div className="flex items-center gap-2 mb-1">
<ShieldCheck className="w-4 h-4 guber-text-green" />
<span className="text-xs font-display font-semibold">Second Chance Program</span>
</div>
<p className="text-[10px] text-muted-foreground">
Users with a flagged background check can still participate in unrestricted categories.
Restrictions only block specific service categories, not the entire platform. This supports
fair access while maintaining safety standards.
</p>
</div>

{allUsers?.map((u) => {
const isExpanded = expandedUser === u.id;

return (
<div key={u.id} className="bg-card rounded-xl border border-border/20 overflow-hidden" data-testid={`admin-user-${u.id}`}>
<div className="p-3 flex items-center justify-between gap-3">
<div className="flex items-center gap-2 min-w-0">
<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
<span className="text-xs font-display text-muted-foreground">{u.fullName?.split(" ").map((n) => n[0]).join("") || "?"}</span>
</div>
<div className="min-w-0">
<div className="flex items-center gap-1.5 flex-wrap">
<p className="text-sm font-semibold truncate">{u.fullName}</p>
{u.suspended && <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">Suspended</Badge>}
{u.banned && <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">Banned</Badge>}
{u.day1OG && <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30 gap-0.5 pl-0"><Day1OGLogo size="sm" />OG</Badge>}
{(u as any).idVerified && <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">ID</Badge>}
{(u as any).credentialVerified && <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30"><UserCheck className="w-2.5 h-2.5 mr-0.5" />Cred</Badge>}
<Badge variant="outline" className="text-[8px]">{u.tier}</Badge>
{u.backgroundCheckStatus && u.backgroundCheckStatus !== "none" && (
<Badge variant="outline" className={`text-[8px] ${u.backgroundCheckStatus === "clear" ? "bg-primary/10 text-primary border-primary/30" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"}`}>
BG: {u.backgroundCheckStatus}
</Badge>
)}
</div>
<p className="text-[11px] text-muted-foreground truncate">{u.email} -- Strikes: {u.strikes || 0}</p>
</div>
</div>
<div className="flex items-center gap-1.5 shrink-0">
<Button size="icon" variant="ghost" onClick={() => setExpandedUser(isExpanded ? null : u.id)} data-testid={`toggle-user-${u.id}`}>
<ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
</Button>
</div>
</div>

{isExpanded && (
<div className="border-t border-border/10 px-3 pb-3 pt-2 space-y-3">
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-[10px] text-muted-foreground font-semibold">Tier</label>
<Select value={u.tier} onValueChange={(v) => tierMutation.mutate({ id: u.id, tier: v })}>
<SelectTrigger className="bg-background border-border/30 text-xs" data-testid={`select-tier-${u.id}`}><SelectValue /></SelectTrigger>
<SelectContent>
<SelectItem value="community">Community</SelectItem>
<SelectItem value="verified">Verified</SelectItem>
<SelectItem value="credentialed">Credentialed</SelectItem>
<SelectItem value="elite">Elite</SelectItem>
</SelectContent>
</Select>
</div>
<div>
<label className="text-[10px] text-muted-foreground font-semibold">Role</label>
<Select value={u.role} onValueChange={(v) => updateUserMutation.mutate({ id: u.id, data: { role: v } })}>
<SelectTrigger className="bg-background border-border/30 text-xs" data-testid={`select-role-${u.id}`}><SelectValue /></SelectTrigger>
<SelectContent>
<SelectItem value="buyer">Buyer</SelectItem>
<SelectItem value="helper">Helper</SelectItem>
<SelectItem value="both">Both</SelectItem>
<SelectItem value="admin">Admin</SelectItem>
</SelectContent>
</Select>
</div>
</div>

<div>
<label className="text-[10px] text-muted-foreground font-semibold">Background Check Status</label>
<Select
value={u.backgroundCheckStatus || "none"}
onValueChange={(v) => {
if (v === "flagged") {
setBgRestrictions((u.backgroundCheckRestrictions as string[]) || []);
}
bgCheckMutation.mutate({
id: u.id,
status: v,
restrictions: v === "flagged" ? ((u.backgroundCheckRestrictions as string[]) || []) : [],
});
}}
>
<SelectTrigger className="bg-background border-border/30 text-xs" data-testid={`select-bg-status-${u.id}`}><SelectValue /></SelectTrigger>
<SelectContent>
<SelectItem value="none">None</SelectItem>
<SelectItem value="pending">Pending Review</SelectItem>
<SelectItem value="passed">Passed</SelectItem>
<SelectItem value="clear">Clear</SelectItem>
<SelectItem value="flagged">Flagged</SelectItem>
</SelectContent>
</Select>
</div>

{u.backgroundCheckStatus === "flagged" && (
<div>
<label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Restriction Categories</label>
<div className="flex flex-wrap gap-2">
{RESTRICTION_CATEGORIES.map(cat => {
const currentRestrictions = (u.backgroundCheckRestrictions as string[]) || [];
const isChecked = currentRestrictions.includes(cat);
return (
<label key={cat} className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={isChecked}
onCheckedChange={(checked) => {
const updated = checked
? [...currentRestrictions, cat]
: currentRestrictions.filter(r => r !== cat);
bgCheckMutation.mutate({ id: u.id, status: "flagged", restrictions: updated });
}}
data-testid={`check-restriction-${u.id}-${cat.replace(/\s+/g, "-").toLowerCase()}`}
/>
{cat}
</label>
);
})}
</div>
</div>
)}

<div className="flex flex-wrap gap-3 pt-1">
<label className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={!!u.credentialVerified}
onCheckedChange={(v) => updateUserMutation.mutate({ id: u.id, data: { credentialVerified: !!v } })}
data-testid={`check-credential-${u.id}`}
/>
Credential Verified
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={!!u.idVerified}
onCheckedChange={(v) => updateUserMutation.mutate({ id: u.id, data: { idVerified: !!v } })}
data-testid={`check-id-verified-${u.id}`}
/>
ID Verified
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={!!u.suspended}
onCheckedChange={(v) => updateUserMutation.mutate({ id: u.id, data: { suspended: !!v } })}
data-testid={`check-suspended-${u.id}`}
/>
Suspended
</label>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={!!u.banned}
onCheckedChange={(v) => updateUserMutation.mutate({ id: u.id, data: { banned: !!v } })}
data-testid={`check-banned-${u.id}`}
/>
Banned
</label>
</div>
{!u.day1OG && (
<Button
size="sm"
className="h-7 text-[10px] font-display font-bold w-full rounded-lg"
style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 90% 45%))", color: "#000" }}
onClick={() => updateUserMutation.mutate({ id: u.id, data: { day1OG: true, aiOrNotCredits: 5, aiOrNotUnlimitedText: true } })}
disabled={updateUserMutation.isPending}
data-testid={`button-grant-og-${u.id}`}
>
👑 Grant Day-1 OG
</Button>
)}
{u.day1OG && (
<p className="text-[10px] text-amber-400/70 font-display text-center">👑 OG Active — {(u as any).aiOrNotCredits ?? 0} AI credits remaining</p>
)}

{(u as any).accountType !== "business" && (u as any).accountType !== "pending_business" && (
<Button
size="sm"
className="h-7 text-[10px] font-display font-bold w-full rounded-lg bg-card border border-border/30 text-muted-foreground hover:text-primary hover:border-primary/40"
onClick={() => grantBusinessMutation.mutate(u.id)}
disabled={grantBusinessMutation.isPending}
data-testid={`button-grant-business-${u.id}`}
>
🏢 Grant Business Access
</Button>
)}
{(u as any).accountType === "pending_business" && (
<p className="text-[10px] text-blue-400/70 font-display text-center">🏢 Business access granted — awaiting setup</p>
)}

<UserDocHistory userId={u.id} />
</div>
)}
</div>
);
})}
</div>
)}
</TabsContent>

<TabsContent value="jobs">
{jobsLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
<div className="space-y-2">
{allJobs?.map((j) => (
<div key={j.id} className={`bg-card rounded-xl border p-3 ${(j as any).removedByAdmin ? "border-destructive/30 opacity-60" : "border-border/20"}`} data-testid={`admin-job-${j.id}`}>
<div className="flex items-start justify-between gap-3">
<div className="min-w-0 flex-1">
<p className="text-sm font-semibold truncate">{j.title}</p>
<p className="text-[11px] text-muted-foreground">{j.category} — ${j.budget || 0} — ID:{j.id}</p>
{(j as any).removedByAdmin && (
<p className="text-[10px] text-destructive/70 mt-0.5 font-display">Removed: {(j as any).removedByAdminReason || "Admin action"}</p>
)}
{(j as any).payoutStatus && (j as any).payoutStatus !== "pending" && (
<p className="text-[10px] text-muted-foreground mt-0.5">
Payout: <span className={`font-semibold ${(j as any).payoutStatus === "paid_out" ? "text-emerald-400" : (j as any).payoutStatus === "payout_processing" ? "text-blue-400" : (j as any).payoutStatus === "refunded" ? "text-red-400" : "text-amber-400"}`}>{String((j as any).payoutStatus).replace(/_/g, " ")}</span>
</p>
)}
</div>
<div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
{["proof_submitted", "completion_submitted", "completed_paid", "disputed", "in_progress"].includes(j.status) && (
<Button
size="sm"
variant="outline"
className="h-7 text-[10px] font-display border-primary/30 text-primary hover:bg-primary/10 rounded-lg px-2"
onClick={() => setProofModalJob({ id: j.id, title: j.title })}
data-testid={`button-view-proof-${j.id}`}
>
<Eye className="w-3 h-3 mr-1" /> Proof
</Button>
)}
{(j as any).isPaid && !["paid_out", "refunded"].includes((j as any).payoutStatus) && (
<Button
size="sm"
variant="outline"
className="h-7 text-[10px] font-display border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-lg px-2"
onClick={() => { if (confirm(`Refund "${j.title}"? This will reverse the transfer and refund the buyer.`)) refundJobMutation.mutate({ jobId: j.id, refundApplicationFee: true }); }}
disabled={refundJobMutation.isPending}
data-testid={`button-refund-job-${j.id}`}
>
<DollarSign className="w-3 h-3 mr-1" /> Refund
</Button>
)}
{!(j as any).removedByAdmin && j.status !== "cancelled" && (
<Button
size="sm"
variant="outline"
className="h-7 text-[10px] font-display border-destructive/30 text-destructive hover:bg-destructive/10 rounded-lg px-2"
onClick={() => { if (confirm(`Remove job "${j.title}"? This will cancel it and flag it as removed.`)) removeJobMutation.mutate({ jobId: j.id, reason: "Removed by admin" }); }}
disabled={removeJobMutation.isPending}
data-testid={`button-remove-job-${j.id}`}
>
<Ban className="w-3 h-3 mr-1" /> Remove
</Button>
)}
{(j as any).removedByAdmin ? (
<Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">Removed</Badge>
) : (
<Badge variant="outline" className="text-[10px] capitalize bg-primary/10 text-primary border-primary/30">
{j.status.replace(/_/g, " ")}
</Badge>
)}
</div>
</div>
</div>
))}
</div>
)}
</TabsContent>

<TabsContent value="catalog">
<CatalogTab />
</TabsContent>

<TabsContent value="templates">
<ProofTemplateEditor />
</TabsContent>

<TabsContent value="strikes">
<div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4">
<h3 className="font-display font-semibold text-sm flex items-center gap-2">
<Gavel className="w-4 h-4" /> Issue a Strike
</h3>
<div className="space-y-3">
<Select value={strikeUserId} onValueChange={setStrikeUserId}>
<SelectTrigger className="bg-background border-border/30" data-testid="select-strike-user">
<SelectValue placeholder="Select user" />
</SelectTrigger>
<SelectContent>
{allUsers?.filter(u => u.role !== "admin").map(u => (
<SelectItem key={u.id} value={String(u.id)}>{u.fullName} ({u.email})</SelectItem>
))}
</SelectContent>
</Select>
<Textarea value={strikeReason} onChange={(e) => setStrikeReason(e.target.value)}
className="bg-background border-border/30" placeholder="Reason for strike..." data-testid="input-strike-reason" />
<Select value={strikeSeverity} onValueChange={setStrikeSeverity}>
<SelectTrigger className="bg-background border-border/30" data-testid="select-strike-severity">
<SelectValue />
</SelectTrigger>
<SelectContent>
<SelectItem value="standard">Standard (3 = suspension)</SelectItem>
<SelectItem value="severe">Severe (immediate ban)</SelectItem>
</SelectContent>
</Select>
<Button onClick={() => strikeMutation.mutate()}
disabled={strikeMutation.isPending || !strikeUserId || !strikeReason}
className="bg-destructive text-destructive-foreground font-display" data-testid="button-issue-strike">
<Ban className="w-4 h-4 mr-1" /> Issue Strike
</Button>
</div>
</div>
</TabsContent>

<TabsContent value="disputes">
<div className="space-y-3" data-testid="admin-disputes">
{disputedJobs.length === 0 ? (
<p className="text-center py-8 text-muted-foreground font-display">No active disputes</p>
) : (
disputedJobs.map((j) => {
const poster = allUsers?.find(u => u.id === j.postedById);
const helper = allUsers?.find(u => u.id === j.assignedHelperId);

return (
<div key={j.id} className="bg-card rounded-xl border border-destructive/30 p-4 space-y-3" data-testid={`dispute-job-${j.id}`}>
<div>
<p className="text-sm font-semibold">{j.title}</p>
<p className="text-[11px] text-muted-foreground mb-1">Job #{j.id} -- ${j.budget || 0} -- {j.category}</p>
<div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
<span>Poster: {poster?.fullName || `User #${j.postedById}`}</span>
{j.assignedHelperId && <span>Helper: {helper?.fullName || `User #${j.assignedHelperId}`}</span>}
{j.serviceType && <span>Service: {j.serviceType}</span>}
</div>
{j.description && <p className="text-[10px] text-muted-foreground mt-1 bg-muted/10 rounded p-2">{j.description}</p>}
</div>

<DisputeProofInline jobId={j.id} />

<div className="border-t border-border/10 pt-3 space-y-2">
<p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
<FileText className="w-3 h-3" /> Resolution
</p>
<div className="grid grid-cols-2 gap-2">
<Select value={disputeResolution[j.id] || ""} onValueChange={v => setDisputeResolution(prev => ({ ...prev, [j.id]: v }))}>
<SelectTrigger className="bg-background border-border/20 text-xs" data-testid={`select-resolution-${j.id}`}>
<SelectValue placeholder="Resolution..." />
</SelectTrigger>
<SelectContent>
<SelectItem value="completed">Completed (Release to Helper)</SelectItem>
<SelectItem value="split">Split 50/50</SelectItem>
<SelectItem value="cancelled">Cancelled (Refund Buyer)</SelectItem>
</SelectContent>
</Select>
<label className="flex items-center gap-1.5 text-xs">
<Checkbox
checked={disputeRefund[j.id] || false}
onCheckedChange={v => setDisputeRefund(prev => ({ ...prev, [j.id]: !!v }))}
data-testid={`check-refund-${j.id}`}
/>
Refund Buyer
</label>
</div>
<Textarea
value={disputeNotes[j.id] || ""}
onChange={e => setDisputeNotes(prev => ({ ...prev, [j.id]: e.target.value }))}
placeholder="Resolution notes..."
className="bg-background border-border/20 text-xs"
data-testid={`input-dispute-notes-${j.id}`}
/>
<Button
size="sm"
disabled={!disputeResolution[j.id] || disputeMutation.isPending}
onClick={() => disputeMutation.mutate({
jobId: j.id,
resolution: disputeResolution[j.id],
refundBuyer: disputeRefund[j.id] || false,
notes: disputeNotes[j.id] || "",
})}
className="font-display"
data-testid={`button-resolve-dispute-${j.id}`}
>
<Gavel className="w-3 h-3 mr-1" /> Resolve Dispute
</Button>
</div>
</div>
);
})
)}
</div>
</TabsContent>

<TabsContent value="audit">
<AuditLogTab />
</TabsContent>

<TabsContent value="og">
<OGTab allUsers={allUsers} usersLoading={usersLoading} refetchUsers={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] })} />
</TabsContent>

<TabsContent value="trustbox">
<TrustBoxTab allUsers={allUsers} usersLoading={usersLoading} />
</TabsContent>

<TabsContent value="broadcast">
<BroadcastTab />
</TabsContent>
<TabsContent value="cashdrop">
<CashDropTab sponsorPrefill={sponsorPrefill} onSponsorPrefillUsed={() => setSponsorPrefill(null)} />
</TabsContent>
<TabsContent value="sponsors">
<SponsorsTab onCreateDrop={createDropFromSponsor} />
</TabsContent>
<TabsContent value="qualifications">
<QualificationReviewTab />
</TabsContent>
<TabsContent value="wallet">
<WalletTab allUsers={allUsers} />
</TabsContent>
<TabsContent value="payouts">
<PayoutsTab />
</TabsContent>
<TabsContent value="settings">
<PlatformSettingsTab />
</TabsContent>
<TabsContent value="feedback">
<FeedbackTab />
</TabsContent>
<TabsContent value="safetyqueue">
<SafetyQueueTab allUsers={allUsers} usersLoading={usersLoading} bgCheckMutation={bgCheckMutation} />
</TabsContent>
</Tabs>
</div>
</GuberLayout>

{proofModalJob && (
<ProofModal
jobId={proofModalJob.id}
jobTitle={proofModalJob.title}
onClose={() => setProofModalJob(null)}
/>
)}
</>
);
}
