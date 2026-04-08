import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Plus, Trash2, FileText, ChevronLeft, Camera, MapPin, Video } from "lucide-react";
import { Link } from "wouter";

type ChecklistItem = { label: string; type: "photo" | "video" | "text"; required: boolean };

export default function BusinessTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    requiredPhotoCount: 1,
    requiredVideo: false,
    geoRequired: true,
    checklistItems: [] as ChecklistItem[],
  });

  const { data: templates, isLoading } = useQuery<any[]>({
    queryKey: ["/api/business/templates"],
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/business/templates", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/templates"] });
      setShowForm(false);
      setForm({ name: "", requiredPhotoCount: 1, requiredVideo: false, geoRequired: true, checklistItems: [] });
      toast({ title: "Template created!" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/business/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addChecklistItem = () => {
    setForm((f) => ({ ...f, checklistItems: [...f.checklistItems, { label: "", type: "photo", required: true }] }));
  };

  const updateChecklistItem = (i: number, patch: Partial<ChecklistItem>) => {
    setForm((f) => {
      const items = [...f.checklistItems];
      items[i] = { ...items[i], ...patch };
      return { ...f, checklistItems: items };
    });
  };

  const removeChecklistItem = (i: number) => {
    setForm((f) => ({ ...f, checklistItems: f.checklistItems.filter((_, idx) => idx !== i) }));
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/business-dashboard">
              <button className="flex items-center gap-1 text-muted-foreground/60 hover:text-foreground text-xs font-display tracking-wider transition-colors" data-testid="button-back">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </Link>
          </div>
          <h1 className="font-display font-black text-base">Inspection Templates</h1>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-8 text-[11px] font-display bg-primary text-primary-foreground rounded-lg px-3"
            data-testid="button-new-template"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        </div>

        {showForm && (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4 animate-fade-in">
            <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/50 uppercase">New Template</p>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-display">Template Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Storefront Audit"
                className="bg-background border-border/30"
                data-testid="input-template-name"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-display font-medium">GPS Required</p>
                <p className="text-[10px] text-muted-foreground/50">Require GPS at submission</p>
              </div>
              <Switch checked={form.geoRequired} onCheckedChange={(v) => setForm((f) => ({ ...f, geoRequired: v }))} data-testid="switch-geo-required" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-display font-medium">Video Required</p>
                <p className="text-[10px] text-muted-foreground/50">Add a video requirement</p>
              </div>
              <Switch checked={form.requiredVideo} onCheckedChange={(v) => setForm((f) => ({ ...f, requiredVideo: v }))} data-testid="switch-video-required" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-display">Required Photos</Label>
              <div className="flex items-center gap-3">
                <button onClick={() => setForm((f) => ({ ...f, requiredPhotoCount: Math.max(1, f.requiredPhotoCount - 1) }))} className="w-8 h-8 rounded-lg border border-border/30 flex items-center justify-center text-muted-foreground hover:bg-muted/20">−</button>
                <span className="font-display font-bold text-lg w-8 text-center">{form.requiredPhotoCount}</span>
                <button onClick={() => setForm((f) => ({ ...f, requiredPhotoCount: Math.min(10, f.requiredPhotoCount + 1) }))} className="w-8 h-8 rounded-lg border border-border/30 flex items-center justify-center text-muted-foreground hover:bg-muted/20">+</button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-display">Checklist Items</Label>
                <button onClick={addChecklistItem} className="text-[10px] text-primary font-display flex items-center gap-1 hover:text-primary/80" data-testid="button-add-checklist-item">
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>
              {form.checklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={item.label}
                    onChange={(e) => updateChecklistItem(i, { label: e.target.value })}
                    placeholder="e.g. Is the sign visible?"
                    className="bg-background border-border/30 flex-1 text-xs"
                    data-testid={`input-checklist-label-${i}`}
                  />
                  <select
                    value={item.type}
                    onChange={(e) => updateChecklistItem(i, { type: e.target.value as any })}
                    className="bg-background border border-border/30 rounded-md text-xs px-2 h-9 text-foreground"
                    data-testid={`select-checklist-type-${i}`}
                  >
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                    <option value="text">Text</option>
                  </select>
                  <button onClick={() => removeChecklistItem(i)} className="text-muted-foreground/40 hover:text-destructive transition-colors" data-testid={`button-remove-checklist-${i}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="flex-1 font-display" data-testid="button-cancel-template">Cancel</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name}
                className="flex-1 font-display bg-primary text-primary-foreground"
                data-testid="button-save-template"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Template"}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : templates && templates.length > 0 ? (
          <div className="space-y-2">
            {templates.map((tpl: any) => (
              <div key={tpl.id} className="bg-card rounded-xl border border-border/20 p-4" data-testid={`template-card-${tpl.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-display font-semibold">{tpl.name}</p>
                      <p className="text-[10px] text-muted-foreground/50">
                        {tpl.required_photo_count} photo{tpl.required_photo_count !== 1 ? "s" : ""}
                        {tpl.required_video ? " · video" : ""}
                        {tpl.geo_required ? " · GPS" : ""}
                        {tpl.checklist_items?.length > 0 ? ` · ${tpl.checklist_items.length} checklist items` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(tpl.id); }}
                    className="text-muted-foreground/30 hover:text-destructive transition-colors"
                    data-testid={`button-delete-template-${tpl.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/50 font-display">No templates yet</p>
            <p className="text-[11px] text-muted-foreground/30 mt-1">Create one to start bulk posting jobs</p>
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
