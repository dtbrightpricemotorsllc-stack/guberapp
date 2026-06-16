import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, X, Star, Building2, Globe, Phone, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface LocalBusiness {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat: number;
  lng: number;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  status: string;
  featured: boolean;
  addedByAdminId?: number | null;
  createdAt: string;
}

const CATEGORIES = [
  "Restaurant", "Auto Services", "Retail", "Health & Wellness", "Beauty & Barber",
  "Mechanic", "Home Services", "Legal & Finance", "Education", "Entertainment",
  "Church & Faith", "Non-Profit", "Construction", "Trucking & Logistics", "Business",
];

const EMPTY: Partial<LocalBusiness> = {
  name: "", category: "Business", description: "", address: "", city: "",
  state: "", zip: "", lat: undefined, lng: undefined, phone: "", website: "",
  logoUrl: "", status: "active", featured: false,
};

export default function AdminLocalBusinesses() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocalBusiness | null>(null);
  const [form, setForm] = useState<Partial<LocalBusiness>>(EMPTY);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: businesses, isLoading } = useQuery<LocalBusiness[]>({
    queryKey: ["/api/admin/local-businesses"],
  });

  const createMutation = useMutation({
    mutationFn: (body: Partial<LocalBusiness>) =>
      apiRequest("POST", "/api/admin/local-businesses", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/local-businesses"] });
      closeModal();
      toast({ title: "Business added" });
    },
    onError: () => toast({ title: "Error creating business", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Partial<LocalBusiness> & { id: number }) =>
      apiRequest("PATCH", `/api/admin/local-businesses/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/local-businesses"] });
      closeModal();
      toast({ title: "Business updated" });
    },
    onError: () => toast({ title: "Error updating business", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/local-businesses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/local-businesses"] });
      setDeleteConfirm(null);
      toast({ title: "Business removed" });
    },
    onError: () => toast({ title: "Error deleting business", variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(b: LocalBusiness) {
    setEditing(b);
    setForm({ ...b });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
    };
    if (editing) {
      updateMutation.mutate({ ...payload, id: editing.id } as any);
    } else {
      createMutation.mutate(payload);
    }
  }

  const STATUS_COLOR: Record<string, string> = {
    active: "#00E576",
    pending: "#F59E0B",
    inactive: "#6b7280",
  };

  return (
    <div className="min-h-screen bg-background p-5" data-testid="page-admin-local-businesses">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin" className="text-muted-foreground text-xs font-display tracking-wider hover:text-foreground transition-colors" data-testid="link-admin-back">
                ← ADMIN
              </Link>
              <span className="text-muted-foreground/40 text-xs">/</span>
              <span className="text-xs font-display tracking-wider text-foreground">LOCAL BUSINESSES</span>
            </div>
            <h1 className="text-2xl font-display font-black tracking-wider">Local Business Pins</h1>
            <p className="text-muted-foreground text-sm mt-1">Map pins shown on the public Opportunity Map.</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-5 rounded-xl font-display tracking-[0.15em] text-sm premium-btn"
            data-testid="button-add-business"
          >
            <Plus className="w-4 h-4" />ADD BUSINESS
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "TOTAL", value: businesses?.length ?? 0, color: "#00E576" },
            { label: "ACTIVE", value: businesses?.filter((b) => b.status === "active").length ?? 0, color: "#00E576" },
            { label: "FEATURED", value: businesses?.filter((b) => b.featured).length ?? 0, color: "#EC4899" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 bg-card border border-border" data-testid={`stat-${label.toLowerCase()}`}>
              <p className="text-2xl font-display font-black" style={{ color }}>{value}</p>
              <p className="text-[10px] font-display tracking-wider text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : !businesses?.length ? (
          <div className="rounded-2xl border border-border p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-display font-bold text-muted-foreground">No businesses yet</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Add Business" to pin a local business on the map.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm" data-testid="table-businesses">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="text-left px-4 py-3 text-[10px] font-display tracking-wider text-muted-foreground">NAME</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display tracking-wider text-muted-foreground hidden sm:table-cell">CATEGORY</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display tracking-wider text-muted-foreground hidden md:table-cell">LOCATION</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display tracking-wider text-muted-foreground">STATUS</th>
                  <th className="text-right px-4 py-3 text-[10px] font-display tracking-wider text-muted-foreground">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-card/30 transition-colors" data-testid={`row-business-${b.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {b.featured && <Star className="w-3 h-3 text-pink-400 shrink-0" />}
                        <div>
                          <p className="font-display font-bold text-sm leading-tight">{b.name}</p>
                          {b.website && (
                            <a href={b.website} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5 mt-0.5" data-testid={`link-biz-website-${b.id}`}>
                              <Globe className="w-2.5 h-2.5" />{b.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-[11px] font-display text-muted-foreground">{b.category}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[11px] text-muted-foreground">{[b.city, b.state].filter(Boolean).join(", ") || `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${STATUS_COLOR[b.status] ?? "#6b7280"}18`, color: STATUS_COLOR[b.status] ?? "#6b7280" }}
                      >
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(b)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                          data-testid={`button-edit-business-${b.id}`}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {deleteConfirm === b.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(b.id)}
                              disabled={deleteMutation.isPending}
                              className="text-[10px] font-display font-bold px-2 py-1 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                              data-testid={`button-confirm-delete-${b.id}`}
                            >
                              {deleteMutation.isPending ? "..." : "CONFIRM"}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1 rounded text-muted-foreground"
                              data-testid={`button-cancel-delete-${b.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(b.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            data-testid={`button-delete-business-${b.id}`}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="modal-business-form">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl z-10">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-display font-black tracking-wider">
                {editing ? "EDIT BUSINESS" : "ADD BUSINESS"}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-modal">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4" data-testid="form-business">
              {/* Name + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">BUSINESS NAME *</label>
                  <input
                    type="text"
                    required
                    value={form.name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    placeholder="Joe's Auto Shop"
                    data-testid="input-business-name"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">CATEGORY *</label>
                  <select
                    value={form.category ?? "Business"}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    data-testid="select-business-category"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">DESCRIPTION</label>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-background border border-border focus:outline-none focus:border-primary/50 resize-none"
                  placeholder="What does this business do?"
                  data-testid="input-business-description"
                />
              </div>

              {/* Lat / Lng */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">LATITUDE *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.lat ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, lat: parseFloat(e.target.value) as any }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    placeholder="35.2271"
                    data-testid="input-business-lat"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">LONGITUDE *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.lng ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, lng: parseFloat(e.target.value) as any }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    placeholder="-80.8431"
                    data-testid="input-business-lng"
                  />
                </div>
              </div>

              {/* Address fields */}
              <div>
                <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">STREET ADDRESS</label>
                <input
                  type="text"
                  value={form.address ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                  placeholder="123 Main St"
                  data-testid="input-business-address"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">CITY</label>
                  <input
                    type="text"
                    value={form.city ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    data-testid="input-business-city"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">STATE</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={form.state ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    placeholder="NC"
                    data-testid="input-business-state"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">ZIP</label>
                  <input
                    type="text"
                    value={form.zip ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    data-testid="input-business-zip"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">PHONE</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="tel"
                      value={form.phone ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full h-10 rounded-xl pl-9 pr-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                      placeholder="(555) 000-0000"
                      data-testid="input-business-phone"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">WEBSITE</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="url"
                      value={form.website ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                      className="w-full h-10 rounded-xl pl-9 pr-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                      placeholder="https://example.com"
                      data-testid="input-business-website"
                    />
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">LOGO URL</label>
                <input
                  type="url"
                  value={form.logoUrl ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                  placeholder="https://..."
                  data-testid="input-business-logo"
                />
              </div>

              {/* Status + Featured */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-display tracking-wider text-muted-foreground mb-1.5 block">STATUS</label>
                  <select
                    value={form.status ?? "active"}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-sm bg-background border border-border focus:outline-none focus:border-primary/50"
                    data-testid="select-business-status"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end pb-0.5">
                  <label className="flex items-center gap-2.5 cursor-pointer" data-testid="label-business-featured">
                    <div
                      className="w-10 h-5 rounded-full relative transition-colors duration-200"
                      style={{ background: form.featured ? "#EC4899" : "rgba(255,255,255,0.1)" }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                        style={{ transform: form.featured ? "translateX(20px)" : "translateX(2px)" }}
                      />
                      <input
                        type="checkbox"
                        checked={!!form.featured}
                        onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                        className="sr-only"
                        data-testid="toggle-business-featured"
                      />
                    </div>
                    <span className="text-[11px] font-display text-muted-foreground flex items-center gap-1">
                      <Star className="w-3 h-3 text-pink-400" />FEATURED PIN
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 px-5 rounded-xl font-display tracking-wider text-sm btn-glass-premium"
                  data-testid="button-cancel-form"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex items-center gap-2 h-10 px-6 rounded-xl font-display tracking-[0.15em] text-sm premium-btn disabled:opacity-50"
                  data-testid="button-submit-business"
                >
                  <CheckCircle className="w-4 h-4" />
                  {editing ? "SAVE CHANGES" : "ADD TO MAP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
