import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  ArrowLeft, Video, Layers, Play, Check, X, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────────────────────
type FeaturedClip = {
  id: number; slug: string; label: string; caption: string;
  videoUrl: string; posterUrl: string | null; position: number; active: boolean;
  createdAt: string;
};

type PromptTemplate = {
  id: number; slug: string; label: string; tag: string; prompt: string;
  gradientKey: string; iconKey: string; kind: string; videoUrl: string | null;
  posterUrl: string | null; wizardKey: string | null; position: number;
  active: boolean; createdAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
const GRADIENTS: { label: string; value: string; preview: string }[] = [
  { label: "Teal", value: "from-emerald-400 via-teal-500 to-cyan-500", preview: "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500" },
  { label: "Purple-Pink", value: "from-violet-500 via-fuchsia-500 to-rose-500", preview: "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500" },
  { label: "Amber-Rose", value: "from-amber-500 via-rose-600 to-purple-700", preview: "bg-gradient-to-br from-amber-500 via-rose-600 to-purple-700" },
  { label: "Fuchsia-Orange", value: "from-fuchsia-500 via-pink-500 to-orange-400", preview: "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400" },
  { label: "Cyan-Violet", value: "from-cyan-400 via-violet-500 to-fuchsia-600", preview: "bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-600" },
  { label: "Emerald", value: "from-emerald-500 via-teal-500 to-cyan-600", preview: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" },
  { label: "Lime", value: "from-lime-400 via-emerald-500 to-cyan-600", preview: "bg-gradient-to-br from-lime-400 via-emerald-500 to-cyan-600" },
  { label: "Sky-Blue", value: "from-sky-400 via-blue-600 to-violet-700", preview: "bg-gradient-to-br from-sky-400 via-blue-600 to-violet-700" },
  { label: "Gold", value: "from-yellow-400 via-amber-600 to-neutral-900", preview: "bg-gradient-to-br from-yellow-400 via-amber-600 to-neutral-900" },
  { label: "Mixed", value: "from-emerald-400 via-cyan-500 to-violet-600", preview: "bg-gradient-to-br from-emerald-400 via-cyan-500 to-violet-600" },
  { label: "Neon-Night", value: "from-sky-400 via-blue-600 to-violet-700", preview: "bg-gradient-to-br from-sky-400 via-blue-600 to-violet-700" },
  { label: "Sunset", value: "from-orange-400 via-rose-500 to-purple-600", preview: "bg-gradient-to-br from-orange-400 via-rose-500 to-purple-600" },
];

const ICONS = [
  "zap", "film", "music", "flame", "megaphone", "image", "gamepad2",
  "repeat", "crown", "building2", "star", "sparkles", "wand2", "rocket",
  "camera", "video", "bolt", "cpu", "layers",
];

const KIND_OPTS = ["video", "audio", "image"] as const;
const WIZARD_OPTS = [
  { value: "", label: "None" },
  { value: "mirror_motion", label: "Mirror Motion" },
  { value: "commercial_builder", label: "Commercial Builder" },
];

// ── Shared form field ──────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function inputCls() {
  return "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-emerald-500/60 focus:ring-0";
}

// ── GradientPill ───────────────────────────────────────────────────────────
function GradientSwatch({ value }: { value: string }) {
  const g = GRADIENTS.find((g) => g.value === value);
  return (
    <span
      className={`inline-block w-5 h-5 rounded-md shrink-0 ${g?.preview ?? "bg-white/20"}`}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE FORM (create / edit)
// ═══════════════════════════════════════════════════════════════════════════
type TplForm = {
  slug: string; label: string; tag: string; prompt: string;
  gradientKey: string; iconKey: string; kind: string;
  videoUrl: string; posterUrl: string; wizardKey: string;
  position: string; active: boolean;
};

const EMPTY_TPL: TplForm = {
  slug: "", label: "", tag: "", prompt: "",
  gradientKey: "from-emerald-400 via-teal-500 to-cyan-500",
  iconKey: "zap", kind: "video",
  videoUrl: "", posterUrl: "", wizardKey: "",
  position: "100", active: true,
};

function tplErrors(f: TplForm) {
  const e: Record<string, string> = {};
  if (!f.slug.trim()) e.slug = "Required";
  else if (!/^[a-z0-9-]+$/.test(f.slug.trim())) e.slug = "Lowercase + hyphens only";
  if (!f.label.trim()) e.label = "Required";
  if (!f.prompt.trim()) e.prompt = "Required";
  const pos = Number(f.position);
  if (!Number.isFinite(pos)) e.position = "Must be a number";
  return e;
}

function TemplateForm({
  init, onSave, onCancel, saving,
}: {
  init: TplForm;
  onSave: (f: TplForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [f, setF] = useState<TplForm>(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const s = (patch: Partial<TplForm>) => setF((p) => ({ ...p, ...patch }));

  function submit() {
    const e = tplErrors(f);
    if (Object.keys(e).length) { setErrs(e); return; }
    onSave(f);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug *" error={errs.slug}>
          <Input className={inputCls()} value={f.slug} placeholder="my-template-slug"
            onChange={(e) => s({ slug: e.target.value })} data-testid="input-tpl-slug" />
        </Field>
        <Field label="Label *" error={errs.label}>
          <Input className={inputCls()} value={f.label} placeholder="Gig Ad"
            onChange={(e) => s({ label: e.target.value })} data-testid="input-tpl-label" />
        </Field>
        <Field label="Tag (shown top-right on card)">
          <Input className={inputCls()} value={f.tag} placeholder="Promote Yourself"
            onChange={(e) => s({ tag: e.target.value })} data-testid="input-tpl-tag" />
        </Field>
        <Field label="Kind">
          <Select value={f.kind} onValueChange={(v) => s({ kind: v })}>
            <SelectTrigger className={inputCls()} data-testid="select-tpl-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prompt / Starter text *" error={errs.prompt}>
          <Textarea className={`${inputCls()} min-h-[80px]`} value={f.prompt}
            placeholder="High-energy self-promo clip, bold on-screen text…"
            onChange={(e) => s({ prompt: e.target.value })} data-testid="input-tpl-prompt" />
        </Field>
        <div className="space-y-3">
          <Field label="Gradient">
            <Select value={f.gradientKey} onValueChange={(v) => s({ gradientKey: v })}>
              <SelectTrigger className={`${inputCls()} gap-2`} data-testid="select-tpl-gradient">
                <GradientSwatch value={f.gradientKey} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADIENTS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block w-4 h-4 rounded ${g.preview}`} />
                      {g.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Icon">
            <Select value={f.iconKey} onValueChange={(v) => s({ iconKey: v })}>
              <SelectTrigger className={inputCls()} data-testid="select-tpl-icon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Video URL (optional — looping preview behind card)">
          <Input className={inputCls()} value={f.videoUrl} placeholder="https://…/clip.mp4"
            onChange={(e) => s({ videoUrl: e.target.value })} data-testid="input-tpl-video-url" />
        </Field>
        <Field label="Poster URL (optional thumbnail)">
          <Input className={inputCls()} value={f.posterUrl} placeholder="https://…/thumb.jpg"
            onChange={(e) => s({ posterUrl: e.target.value })} data-testid="input-tpl-poster-url" />
        </Field>
        <Field label="Wizard (advanced routing)">
          <Select value={f.wizardKey} onValueChange={(v) => s({ wizardKey: v })}>
            <SelectTrigger className={inputCls()} data-testid="select-tpl-wizard">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {WIZARD_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Position (lower = first)" error={errs.position}>
          <Input type="number" className={inputCls()} value={f.position}
            onChange={(e) => s({ position: e.target.value })} data-testid="input-tpl-position" />
        </Field>
        <Field label="Active">
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="tpl-active" checked={f.active}
              onChange={(e) => s({ active: e.target.checked })}
              className="h-4 w-4 cursor-pointer" data-testid="checkbox-tpl-active" />
            <label htmlFor="tpl-active" className="text-sm text-white/70 cursor-pointer">
              Show in carousel
            </label>
          </div>
        </Field>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" className="text-white/60" onClick={onCancel} data-testid="button-tpl-cancel">
          Cancel
        </Button>
        <Button disabled={saving} onClick={submit}
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
          data-testid="button-tpl-save">
          {saving ? "Saving…" : "Save Template"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP FORM (create / edit)
// ═══════════════════════════════════════════════════════════════════════════
type ClipForm = {
  slug: string; label: string; caption: string;
  videoUrl: string; posterUrl: string; position: string; active: boolean;
};
const EMPTY_CLIP: ClipForm = {
  slug: "", label: "", caption: "", videoUrl: "", posterUrl: "", position: "100", active: true,
};
function clipErrors(f: ClipForm) {
  const e: Record<string, string> = {};
  if (!f.slug.trim()) e.slug = "Required";
  else if (!/^[a-z0-9-]+$/.test(f.slug.trim())) e.slug = "Lowercase + hyphens only";
  if (!f.label.trim()) e.label = "Required";
  if (!f.caption.trim()) e.caption = "Required";
  if (!f.videoUrl.trim()) e.videoUrl = "Required";
  if (!Number.isFinite(Number(f.position))) e.position = "Must be a number";
  return e;
}

function ClipFormComp({
  init, onSave, onCancel, saving,
}: {
  init: ClipForm;
  onSave: (f: ClipForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [f, setF] = useState<ClipForm>(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const s = (patch: Partial<ClipForm>) => setF((p) => ({ ...p, ...patch }));

  function submit() {
    const e = clipErrors(f);
    if (Object.keys(e).length) { setErrs(e); return; }
    onSave(f);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug *" error={errs.slug}>
          <Input className={inputCls()} value={f.slug} placeholder="my-clip-slug"
            onChange={(e) => s({ slug: e.target.value })} data-testid="input-clip-slug" />
        </Field>
        <Field label="Label *" error={errs.label}>
          <Input className={inputCls()} value={f.label} placeholder="Trending label"
            onChange={(e) => s({ label: e.target.value })} data-testid="input-clip-label" />
        </Field>
        <Field label="Video URL *" error={errs.videoUrl}>
          <Input className={inputCls()} value={f.videoUrl} placeholder="https://…/video.mp4"
            onChange={(e) => s({ videoUrl: e.target.value })} data-testid="input-clip-video-url" />
        </Field>
        <Field label="Poster URL (optional)">
          <Input className={inputCls()} value={f.posterUrl} placeholder="https://…/thumb.jpg"
            onChange={(e) => s({ posterUrl: e.target.value })} data-testid="input-clip-poster-url" />
        </Field>
        <Field label="Caption / Prompt *" error={errs.caption}>
          <Textarea className={`${inputCls()} min-h-[72px]`} value={f.caption}
            placeholder="Cinematic aerial shot of…"
            onChange={(e) => s({ caption: e.target.value })} data-testid="input-clip-caption" />
        </Field>
        <div className="space-y-3">
          <Field label="Position (lower = first)" error={errs.position}>
            <Input type="number" className={inputCls()} value={f.position}
              onChange={(e) => s({ position: e.target.value })} data-testid="input-clip-position" />
          </Field>
          <Field label="Active">
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="clip-active" checked={f.active}
                onChange={(e) => s({ active: e.target.checked })}
                className="h-4 w-4 cursor-pointer" data-testid="checkbox-clip-active" />
              <label htmlFor="clip-active" className="text-sm text-white/70 cursor-pointer">
                Show in Explore feed
              </label>
            </div>
          </Field>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" className="text-white/60" onClick={onCancel} data-testid="button-clip-cancel">
          Cancel
        </Button>
        <Button disabled={saving} onClick={submit}
          className="bg-violet-500 hover:bg-violet-400 text-white font-bold"
          data-testid="button-clip-save">
          {saving ? "Saving…" : "Save Clip"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES SECTION
// ═══════════════════════════════════════════════════════════════════════════
function TemplatesSection() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editInit, setEditInit] = useState<TplForm>(EMPTY_TPL);

  const { data: templates = [], isLoading } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/admin/studio/templates"],
  });

  const createMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/studio/templates", body).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/templates"] }); setShowCreate(false); toast({ title: "Template created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiRequest("PATCH", `/api/admin/studio/templates/${id}`, body).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/templates"] }); setEditId(null); toast({ title: "Template updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/studio/templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/templates"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sorted = useMemo(() => [...templates].sort((a, b) => a.position - b.position || a.id - b.id), [templates]);

  function startEdit(t: PromptTemplate) {
    setEditInit({
      slug: t.slug, label: t.label, tag: t.tag, prompt: t.prompt,
      gradientKey: t.gradientKey, iconKey: t.iconKey, kind: t.kind,
      videoUrl: t.videoUrl ?? "", posterUrl: t.posterUrl ?? "",
      wizardKey: t.wizardKey ?? "", position: String(t.position), active: t.active,
    });
    setEditId(t.id);
  }

  function saveCreate(f: TplForm) {
    createMut.mutate({
      slug: f.slug.trim(), label: f.label.trim(), tag: f.tag.trim(),
      prompt: f.prompt.trim(), gradientKey: f.gradientKey, iconKey: f.iconKey,
      kind: f.kind, videoUrl: f.videoUrl.trim() || null, posterUrl: f.posterUrl.trim() || null,
      wizardKey: f.wizardKey || null, position: Number(f.position), active: f.active,
    });
  }

  function saveEdit(f: TplForm) {
    if (editId === null) return;
    updateMut.mutate({
      id: editId, body: {
        slug: f.slug.trim(), label: f.label.trim(), tag: f.tag.trim(),
        prompt: f.prompt.trim(), gradientKey: f.gradientKey, iconKey: f.iconKey,
        kind: f.kind, videoUrl: f.videoUrl.trim() || null, posterUrl: f.posterUrl.trim() || null,
        wizardKey: f.wizardKey || null, position: Number(f.position), active: f.active,
      },
    });
  }

  function shiftPos(t: PromptTemplate, dir: "up" | "down") {
    const idx = sorted.findIndex((x) => x.id === t.id);
    const nb = dir === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!nb) return;
    updateMut.mutate({ id: t.id, body: { position: nb.position } });
    updateMut.mutate({ id: nb.id, body: { position: t.position } });
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" /> Template Cards
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            The "Trending Templates" carousel on <code className="bg-white/10 px-1 rounded">/studio</code>.
            {sorted.length === 0 && " (currently showing built-in defaults)"}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold gap-1"
          onClick={() => { setShowCreate(true); setEditId(null); }}
          data-testid="button-new-template"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-2xl bg-white/[0.04] border border-emerald-500/30 p-5 mb-4">
          <p className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Template Card
          </p>
          <TemplateForm
            init={EMPTY_TPL} saving={createMut.isPending}
            onSave={saveCreate} onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-white/40 py-6 text-center">Loading…</p>
      ) : sorted.length === 0 && !showCreate ? (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-8 text-center">
          <Layers className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">No templates yet — built-in defaults showing on Studio.</p>
          <p className="text-xs text-white/30 mt-1">Add your first card above to override them.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((t, idx) => (
            <div key={t.id}>
              {editId === t.id ? (
                <div className="rounded-2xl bg-white/[0.04] border border-emerald-500/30 p-5">
                  <p className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
                    <Pencil className="w-4 h-4" /> Edit: {t.label}
                  </p>
                  <TemplateForm
                    init={editInit} saving={updateMut.isPending}
                    onSave={saveEdit} onCancel={() => setEditId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.07] px-4 py-3 group hover:bg-white/[0.07] transition-colors">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button className="p-0.5 text-white/30 hover:text-white disabled:opacity-20" disabled={idx === 0}
                      onClick={() => shiftPos(t, "up")} data-testid={`button-tpl-up-${t.id}`}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-0.5 text-white/30 hover:text-white disabled:opacity-20" disabled={idx === sorted.length - 1}
                      onClick={() => shiftPos(t, "down")} data-testid={`button-tpl-down-${t.id}`}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span
                    className={`w-8 h-8 rounded-lg shrink-0 ${GRADIENTS.find((g) => g.value === t.gradientKey)?.preview ?? "bg-white/20"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{t.label}</span>
                      {t.tag && <Badge variant="outline" className="text-[10px] border-white/20 text-white/50 py-0">{t.tag}</Badge>}
                      <Badge variant="outline" className="text-[10px] border-white/20 text-white/40 py-0">{t.kind}</Badge>
                      {t.wizardKey && <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300 py-0">{t.wizardKey}</Badge>}
                      {!t.active && <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-300 py-0">Hidden</Badge>}
                    </div>
                    <p className="text-xs text-white/40 truncate mt-0.5">{t.prompt}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      onClick={() => updateMut.mutate({ id: t.id, body: { active: !t.active } })}
                      title={t.active ? "Hide" : "Show"}
                      data-testid={`button-tpl-toggle-${t.id}`}
                    >
                      {t.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      onClick={() => startEdit(t)}
                      data-testid={`button-tpl-edit-${t.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                      onClick={() => { if (confirm(`Delete "${t.label}"?`)) deleteMut.mutate(t.id); }}
                      data-testid={`button-tpl-delete-${t.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIPS SECTION (Explore feed)
// ═══════════════════════════════════════════════════════════════════════════
function ClipsSection() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editInit, setEditInit] = useState<ClipForm>(EMPTY_CLIP);

  const { data: clips = [], isLoading } = useQuery<FeaturedClip[]>({
    queryKey: ["/api/admin/studio/featured"],
  });

  const createMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/studio/featured", body).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] }); setShowCreate(false); toast({ title: "Clip added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiRequest("PATCH", `/api/admin/studio/featured/${id}`, body).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] }); setEditId(null); toast({ title: "Clip updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/studio/featured/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/studio/featured"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sorted = useMemo(() => [...clips].sort((a, b) => a.position - b.position || a.id - b.id), [clips]);

  function startEdit(c: FeaturedClip) {
    setEditInit({
      slug: c.slug, label: c.label, caption: c.caption,
      videoUrl: c.videoUrl, posterUrl: c.posterUrl ?? "",
      position: String(c.position), active: c.active,
    });
    setEditId(c.id);
  }

  function saveCreate(f: ClipForm) {
    createMut.mutate({
      slug: f.slug.trim(), label: f.label.trim(), caption: f.caption.trim(),
      videoUrl: f.videoUrl.trim(), posterUrl: f.posterUrl.trim() || null,
      position: Number(f.position), active: f.active,
    });
  }

  function saveEdit(f: ClipForm) {
    if (editId === null) return;
    updateMut.mutate({
      id: editId, body: {
        slug: f.slug.trim(), label: f.label.trim(), caption: f.caption.trim(),
        videoUrl: f.videoUrl.trim(), posterUrl: f.posterUrl.trim() || null,
        position: Number(f.position), active: f.active,
      },
    });
  }

  function shiftPos(c: FeaturedClip, dir: "up" | "down") {
    const idx = sorted.findIndex((x) => x.id === c.id);
    const nb = dir === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!nb) return;
    updateMut.mutate({ id: c.id, body: { position: nb.position } });
    updateMut.mutate({ id: nb.id, body: { position: c.position } });
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Play className="w-5 h-5 text-violet-400" /> Explore Feed Clips
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Full-bleed vertical scroll on <code className="bg-white/10 px-1 rounded">/studio/explore</code>.
            Caption = the prompt users get when they tap "Use this".
          </p>
        </div>
        <Button
          size="sm"
          className="bg-violet-500 hover:bg-violet-400 text-white font-bold gap-1"
          onClick={() => { setShowCreate(true); setEditId(null); }}
          data-testid="button-new-clip"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-2xl bg-white/[0.04] border border-violet-500/30 p-5 mb-4">
          <p className="text-sm font-bold text-violet-400 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Explore Clip
          </p>
          <ClipFormComp
            init={EMPTY_CLIP} saving={createMut.isPending}
            onSave={saveCreate} onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-white/40 py-6 text-center">Loading…</p>
      ) : sorted.length === 0 && !showCreate ? (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-8 text-center">
          <Video className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">No clips yet.</p>
          <p className="text-xs text-white/30 mt-1">Add a video URL + caption above to populate the Explore feed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c, idx) => (
            <div key={c.id}>
              {editId === c.id ? (
                <div className="rounded-2xl bg-white/[0.04] border border-violet-500/30 p-5">
                  <p className="text-sm font-bold text-violet-400 mb-4 flex items-center gap-2">
                    <Pencil className="w-4 h-4" /> Edit: {c.label}
                  </p>
                  <ClipFormComp
                    init={editInit} saving={updateMut.isPending}
                    onSave={saveEdit} onCancel={() => setEditId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.07] px-4 py-3 group hover:bg-white/[0.07] transition-colors">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button className="p-0.5 text-white/30 hover:text-white disabled:opacity-20" disabled={idx === 0}
                      onClick={() => shiftPos(c, "up")} data-testid={`button-clip-up-${c.id}`}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-0.5 text-white/30 hover:text-white disabled:opacity-20" disabled={idx === sorted.length - 1}
                      onClick={() => shiftPos(c, "down")} data-testid={`button-clip-down-${c.id}`}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="w-12 h-9 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {c.posterUrl ? (
                      <img src={c.posterUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <Play className="w-4 h-4 text-white/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{c.label}</span>
                      <span className="text-[10px] text-white/40">pos:{c.position}</span>
                      {!c.active && <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-300 py-0">Hidden</Badge>}
                    </div>
                    <p className="text-xs text-white/40 truncate mt-0.5">{c.caption}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      onClick={() => updateMut.mutate({ id: c.id, body: { active: !c.active } })}
                      title={c.active ? "Hide" : "Show"}
                      data-testid={`button-clip-toggle-${c.id}`}
                    >
                      {c.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      onClick={() => startEdit(c)}
                      data-testid={`button-clip-edit-${c.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                      onClick={() => { if (confirm(`Delete "${c.label}"?`)) deleteMut.mutate(c.id); }}
                      data-testid={`button-clip-delete-${c.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminStudio() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (user?.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-[#090e14] text-white">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/studio")}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            data-testid="button-back-to-studio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Studio Content</h1>
            <p className="text-sm text-white/40">Admin — manage demo templates and explore clips</p>
          </div>
        </div>

        {/* Templates */}
        <TemplatesSection />

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Clips */}
        <ClipsSection />
      </div>
    </div>
  );
}
