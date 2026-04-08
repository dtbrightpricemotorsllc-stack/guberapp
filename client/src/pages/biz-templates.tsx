import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BizLayout } from "@/components/biz-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, FileText, Camera, MapPin, Video, X } from "lucide-react";

const GOLD = "#C9A84C";
const SURFACE = "#141417";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT_PRIMARY = "#F4F4F5";
const TEXT_SECONDARY = "#71717A";
const INPUT_BG = "#0f0f11";

type ChecklistItem = { label: string; type: "photo" | "video" | "text"; required: boolean };

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  padding: "0 12px",
  height: "38px",
  borderRadius: "8px",
  fontSize: "13px",
  outline: "none",
};

export default function BizTemplates() {
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
      toast({ title: "Template created" });
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

  function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <div className="flex items-center justify-between">
        <p style={{ color: TEXT_PRIMARY, fontSize: "13px" }}>{label}</p>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className="w-10 h-5 rounded-full transition-all relative flex-shrink-0"
          style={{ background: checked ? GOLD : "#2a2a2d" }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
            style={{ left: checked ? "22px" : "2px" }}
          />
        </button>
      </div>
    );
  }

  return (
    <BizLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-2xl" style={{ color: TEXT_PRIMARY }}>Inspection Templates</h1>
            <p style={{ color: TEXT_SECONDARY, fontSize: "13px", marginTop: "4px" }}>
              Reusable proof requirements for your job types
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all"
            style={{ background: GOLD, color: "#000" }}
            data-testid="button-new-template"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl p-6 space-y-5" style={{ background: SURFACE, border: `1px solid rgba(201,168,76,0.2)` }}>
            <div className="flex items-center justify-between">
              <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">
                New Template
              </p>
              <button onClick={() => setShowForm(false)} style={{ color: TEXT_SECONDARY }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase block">
                Template Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Storefront Audit"
                style={inputStyle}
                data-testid="input-template-name"
              />
            </div>

            <div className="space-y-3">
              <Toggle
                checked={form.geoRequired}
                onChange={(v) => setForm((f) => ({ ...f, geoRequired: v }))}
                label="GPS Required"
              />
              <Toggle
                checked={form.requiredVideo}
                onChange={(v) => setForm((f) => ({ ...f, requiredVideo: v }))}
                label="Video Required"
              />
            </div>

            <div className="space-y-1.5">
              <label style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase block">
                Required Photos
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, requiredPhotoCount: Math.max(1, f.requiredPhotoCount - 1) }))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg transition-all"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}
                >−</button>
                <span className="font-black text-2xl w-10 text-center" style={{ color: TEXT_PRIMARY }}>{form.requiredPhotoCount}</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, requiredPhotoCount: Math.min(10, f.requiredPhotoCount + 1) }))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg transition-all"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}
                >+</button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">
                  Checklist Items
                </label>
                <button
                  type="button"
                  onClick={addChecklistItem}
                  className="flex items-center gap-1 text-xs font-bold transition-colors"
                  style={{ color: GOLD }}
                  data-testid="button-add-checklist-item"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>
              {form.checklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={item.label}
                    onChange={(e) => updateChecklistItem(i, { label: e.target.value })}
                    placeholder="e.g. Is the sign visible?"
                    style={{ ...inputStyle, flex: 1 }}
                    data-testid={`input-checklist-label-${i}`}
                  />
                  <select
                    value={item.type}
                    onChange={(e) => updateChecklistItem(i, { type: e.target.value as ChecklistItem["type"] })}
                    style={{ ...inputStyle, width: "90px", padding: "0 8px", cursor: "pointer" }}
                    data-testid={`select-checklist-type-${i}`}
                  >
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                    <option value="text">Text</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(i)}
                    className="transition-colors flex-shrink-0"
                    style={{ color: TEXT_SECONDARY }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_SECONDARY)}
                    data-testid={`button-remove-checklist-${i}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-10 rounded-lg font-bold text-sm transition-all"
                style={{ border: `1px solid ${BORDER}`, color: TEXT_SECONDARY, background: "transparent" }}
                data-testid="button-cancel-template"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name}
                className="flex-1 h-10 rounded-lg font-bold text-sm transition-all disabled:opacity-40"
                style={{ background: GOLD, color: "#000" }}
                data-testid="button-save-template"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Save Template"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: SURFACE }} />
            ))}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="space-y-2">
            {templates.map((tpl: any) => (
              <div
                key={tpl.id}
                className="rounded-xl p-4 flex items-center gap-4"
                style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                data-testid={`template-card-${tpl.id}`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)" }}>
                  <FileText className="w-4 h-4" style={{ color: GOLD }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: TEXT_PRIMARY, fontSize: "14px" }}>{tpl.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {tpl.required_photo_count > 0 && (
                      <span className="flex items-center gap-1" style={{ color: TEXT_SECONDARY, fontSize: "11px" }}>
                        <Camera className="w-3 h-3" /> {tpl.required_photo_count} photos
                      </span>
                    )}
                    {tpl.required_video && (
                      <span className="flex items-center gap-1" style={{ color: TEXT_SECONDARY, fontSize: "11px" }}>
                        <Video className="w-3 h-3" /> video
                      </span>
                    )}
                    {tpl.geo_required && (
                      <span className="flex items-center gap-1" style={{ color: TEXT_SECONDARY, fontSize: "11px" }}>
                        <MapPin className="w-3 h-3" /> GPS
                      </span>
                    )}
                    {tpl.checklist_items?.length > 0 && (
                      <span style={{ color: TEXT_SECONDARY, fontSize: "11px" }}>· {tpl.checklist_items.length} checklist items</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(tpl.id); }}
                  className="transition-colors flex-shrink-0"
                  style={{ color: TEXT_SECONDARY }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_SECONDARY)}
                  data-testid={`button-delete-template-${tpl.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl flex flex-col items-center justify-center py-16 gap-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <FileText className="w-5 h-5" style={{ color: TEXT_SECONDARY }} />
            </div>
            <div className="text-center">
              <p style={{ color: TEXT_PRIMARY, fontSize: "14px", fontWeight: 600 }}>No templates yet</p>
              <p style={{ color: TEXT_SECONDARY, fontSize: "12px", marginTop: "4px" }}>Create one to standardize your inspection jobs</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="px-5 py-2.5 rounded-lg font-bold text-sm"
              style={{ background: GOLD, color: "#000" }}
            >
              CREATE FIRST TEMPLATE
            </button>
          </div>
        )}
      </div>
    </BizLayout>
  );
}
