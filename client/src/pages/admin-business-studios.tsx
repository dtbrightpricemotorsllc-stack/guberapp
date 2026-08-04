import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, BarChart2, Plus, Pencil, Trash2,
  CheckCircle, XCircle, ChevronDown, ChevronRight, RefreshCw,
  ClipboardList, Image,
} from "lucide-react";

interface Studio {
  id: number;
  studio_id: string;
  name: string;
  tagline?: string;
  logo_url?: string;
  primary_color: string;
  accent_color: string;
  contact_email?: string;
  monthly_image_limit: number;
  is_active: boolean;
  created_at: string;
  user_count: number;
  content_count: number;
}

interface StudioUser {
  id: number;
  email: string;
  role: string;
  full_name?: string;
  is_active: boolean;
  added_by?: string;
  created_at: string;
}

interface UsageStats {
  photo_uploads: string;
  ai_images: string;
  ai_images_this_month: string;
  approved: string;
  archived: string;
  total: string;
}

interface AuditEntry {
  user_email?: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

// ── Studio row ─────────────────────────────────────────────────────────────
function StudioRow({ studio, onUpdate }: { studio: Studio; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("client");
  const [addName, setAddName] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "usage" | "audit">("users");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: studio.name, tagline: studio.tagline ?? "", logoUrl: studio.logo_url ?? "", accentColor: studio.accent_color, monthlyImageLimit: studio.monthly_image_limit, isActive: studio.is_active });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: users = [], refetch: refetchUsers } = useQuery<StudioUser[]>({
    queryKey: [`/api/admin/bs/studios/${studio.studio_id}/users`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bs/studios/${studio.studio_id}/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: expanded && activeTab === "users",
  });

  const { data: usage } = useQuery<UsageStats>({
    queryKey: [`/api/admin/bs/studios/${studio.studio_id}/usage`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bs/studios/${studio.studio_id}/usage`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: expanded && activeTab === "usage",
  });

  const { data: auditLog = [] } = useQuery<AuditEntry[]>({
    queryKey: [`/api/admin/bs/studios/${studio.studio_id}/audit`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bs/studios/${studio.studio_id}/audit`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: expanded && activeTab === "audit",
  });

  const addUser = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/bs/studios/${studio.studio_id}/users`, { email: addEmail, role: addRole, fullName: addName }),
    onSuccess: () => {
      toast({ title: "User added" });
      setAddEmail(""); setAddName(""); setAddRole("client");
      qc.invalidateQueries({ queryKey: [`/api/admin/bs/studios/${studio.studio_id}/users`] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeUser = useMutation({
    mutationFn: (email: string) => apiRequest("DELETE", `/api/admin/bs/studios/${studio.studio_id}/users/${encodeURIComponent(email)}`),
    onSuccess: () => {
      toast({ title: "User removed" });
      qc.invalidateQueries({ queryKey: [`/api/admin/bs/studios/${studio.studio_id}/users`] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStudio = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/bs/studios/${studio.studio_id}`, {
      name: editForm.name,
      tagline: editForm.tagline,
      logoUrl: editForm.logoUrl || null,
      accentColor: editForm.accentColor,
      monthlyImageLimit: Number(editForm.monthlyImageLimit),
      isActive: editForm.isActive,
    }),
    onSuccess: () => {
      toast({ title: "Studio updated" });
      setEditing(false);
      onUpdate();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const ACCENT = studio.accent_color || "#c9a84c";

  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <button
          data-testid={`studio-expand-${studio.studio_id}`}
          onClick={() => setExpanded(e => !e)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center" }}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <div style={{ width: 10, height: 10, borderRadius: "50%", background: studio.is_active ? "#4ade80" : "#f87171", flexShrink: 0 }} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15 }}>{studio.name}</span>
            <code style={{ fontSize: 11, color: "#64748b", background: "#0f172a", padding: "2px 6px", borderRadius: 4 }}>
              {studio.studio_id}
            </code>
            {!studio.is_active && <Badge style={{ background: "#450a0a", color: "#f87171", border: "1px solid #7f1d1d", fontSize: 10 }}>Suspended</Badge>}
          </div>
          {studio.tagline && <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0 0" }}>{studio.tagline}</p>}
        </div>

        <div style={{ display: "flex", gap: 20, color: "#64748b", fontSize: 13 }}>
          <span data-testid={`studio-user-count-${studio.studio_id}`}><Users size={13} style={{ display: "inline", marginRight: 4 }} />{studio.user_count} users</span>
          <span><Image size={13} style={{ display: "inline", marginRight: 4 }} />{studio.content_count} items</span>
          <span>Limit: {studio.monthly_image_limit}/mo</span>
        </div>

        <button
          data-testid={`studio-edit-${studio.studio_id}`}
          onClick={() => setEditing(e => !e)}
          style={{ background: "none", border: "1px solid #334155", cursor: "pointer", color: "#94a3b8", borderRadius: 6, padding: "4px 8px" }}
        >
          <Pencil size={14} />
        </button>
      </div>

      {editing && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #334155", paddingTop: 16 }}>
          <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Edit Studio</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Studio Name</label>
              <Input data-testid={`edit-name-${studio.studio_id}`} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Tagline</label>
              <Input data-testid={`edit-tagline-${studio.studio_id}`} value={editForm.tagline} onChange={e => setEditForm(f => ({ ...f, tagline: e.target.value }))} style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Logo URL</label>
              <Input data-testid={`edit-logo-${studio.studio_id}`} value={editForm.logoUrl} onChange={e => setEditForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Accent Color</label>
              <Input data-testid={`edit-accent-${studio.studio_id}`} value={editForm.accentColor} onChange={e => setEditForm(f => ({ ...f, accentColor: e.target.value }))} placeholder="#c9a84c" style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Monthly AI Image Limit</label>
              <Input data-testid={`edit-limit-${studio.studio_id}`} type="number" value={editForm.monthlyImageLimit} onChange={e => setEditForm(f => ({ ...f, monthlyImageLimit: Number(e.target.value) }))} style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#94a3b8", fontSize: 13 }}>
                <input data-testid={`edit-active-${studio.studio_id}`} type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))} />
                Studio Active
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button data-testid={`save-studio-${studio.studio_id}`} onClick={() => updateStudio.mutate()} disabled={updateStudio.isPending} style={{ background: "#c9a84c", color: "#0f172a", fontWeight: 700 }}>
              {updateStudio.isPending ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} style={{ borderColor: "#334155", color: "#94a3b8" }}>Cancel</Button>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: "1px solid #334155" }}>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #334155" }}>
            {(["users", "usage", "audit"] as const).map(t => (
              <button key={t} data-testid={`studio-tab-${t}-${studio.studio_id}`} onClick={() => setActiveTab(t)} style={{ background: "none", border: "none", padding: "12px 20px", cursor: "pointer", color: activeTab === t ? ACCENT : "#64748b", fontWeight: activeTab === t ? 600 : 400, fontSize: 13, borderBottom: activeTab === t ? `2px solid ${ACCENT}` : "2px solid transparent", textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ padding: 20 }}>
            {activeTab === "users" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px auto", gap: 8, marginBottom: 16, alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Email</label>
                    <Input data-testid={`add-user-email-${studio.studio_id}`} value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="user@example.com" style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Role</label>
                    <select data-testid={`add-user-role-${studio.studio_id}`} value={addRole} onChange={e => setAddRole(e.target.value)} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
                      <option value="client">Client</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Full Name (optional)</label>
                    <Input data-testid={`add-user-name-${studio.studio_id}`} value={addName} onChange={e => setAddName(e.target.value)} placeholder="Jane Smith" style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
                  </div>
                  <Button data-testid={`add-user-btn-${studio.studio_id}`} onClick={() => addUser.mutate()} disabled={!addEmail || addUser.isPending} style={{ background: "#c9a84c", color: "#0f172a", fontWeight: 700, height: 38 }}>
                    <Plus size={14} />
                  </Button>
                </div>

                {users.length === 0 ? (
                  <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No approved users yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {users.map(u => (
                      <div key={u.id} data-testid={`user-row-${u.email}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{u.email}</span>
                          {u.full_name && <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>{u.full_name}</span>}
                        </div>
                        <Badge style={{ background: "#1e293b", color: ACCENT, border: `1px solid ${ACCENT}33`, fontSize: 10 }}>{u.role}</Badge>
                        {u.is_active
                          ? <CheckCircle size={14} color="#4ade80" />
                          : <XCircle size={14} color="#f87171" />
                        }
                        <button
                          data-testid={`remove-user-${u.email}`}
                          onClick={() => removeUser.mutate(u.email)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "usage" && usage && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                {[
                  { label: "Total Content", value: usage.total },
                  { label: "Photo Uploads", value: usage.photo_uploads },
                  { label: "AI Images", value: usage.ai_images },
                  { label: "AI Images This Month", value: `${usage.ai_images_this_month} / ${studio.monthly_image_limit}` },
                  { label: "Approved", value: usage.approved },
                  { label: "Archived", value: usage.archived },
                ].map(stat => (
                  <div key={stat.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "audit" && (
              <div style={{ maxHeight: 400, overflow: "auto" }}>
                {auditLog.length === 0 ? (
                  <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No audit entries yet.</p>
                ) : auditLog.map((entry, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #1e293b", fontSize: 12 }}>
                    <span style={{ color: "#64748b", minWidth: 140 }}>{new Date(entry.created_at).toLocaleString()}</span>
                    <span style={{ color: "#94a3b8", minWidth: 100 }}>{entry.user_email ?? "system"}</span>
                    <Badge style={{ background: "#0f172a", color: "#c9a84c", border: "1px solid #334155", fontSize: 10, flexShrink: 0 }}>{entry.action}</Badge>
                    <span style={{ color: "#475569", flex: 1 }}>{entry.ip_address}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Studio Modal ────────────────────────────────────────────────────
function CreateStudioForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ studioId: "", name: "", tagline: "", contactEmail: "", monthlyImageLimit: 100 });
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/bs/studios", form),
    onSuccess: () => {
      toast({ title: "Studio created" });
      onCreated();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480 }}>
        <h3 style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Create New Studio</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {([
            { key: "studioId", label: "Studio ID (slug)", placeholder: "mycompany" },
            { key: "name", label: "Studio Name", placeholder: "My Company Content Studio" },
            { key: "tagline", label: "Tagline", placeholder: "Powered by GUBER Global" },
            { key: "contactEmail", label: "Contact Email", placeholder: "studio@company.com" },
          ] as const).map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{f.label}</label>
              <Input
                data-testid={`create-studio-${f.key}`}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }}
              />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Monthly AI Image Limit</label>
            <Input data-testid="create-studio-limit" type="number" value={form.monthlyImageLimit} onChange={e => setForm(p => ({ ...p, monthlyImageLimit: Number(e.target.value) }))} style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Button data-testid="create-studio-submit" onClick={() => create.mutate()} disabled={!form.studioId || !form.name || create.isPending} style={{ background: "#c9a84c", color: "#0f172a", fontWeight: 700 }}>
            {create.isPending ? "Creating…" : "Create Studio"}
          </Button>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "#334155", color: "#94a3b8" }}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main admin page ────────────────────────────────────────────────────────
export default function AdminBusinessStudios() {
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const { data: studios = [], refetch, isLoading } = useQuery<Studio[]>({
    queryKey: ["/api/admin/bs/studios"],
    queryFn: async () => {
      const res = await fetch("/api/admin/bs/studios", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load studios");
      return res.json();
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f1f5f9", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: 10 }}>
              <Building2 size={22} color="#c9a84c" /> Business Studios
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
              Manage private content studios for law firms and businesses.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              data-testid="refresh-studios"
              onClick={() => refetch()}
              style={{ background: "none", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#94a3b8" }}
            >
              <RefreshCw size={14} />
            </button>
            <Button
              data-testid="create-studio-btn"
              onClick={() => setShowCreate(true)}
              style={{ background: "#c9a84c", color: "#0f172a", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={14} /> New Studio
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Loading studios…</div>
        ) : studios.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "#1e293b", borderRadius: 12, border: "1px solid #334155" }}>
            <Building2 size={40} color="#334155" style={{ margin: "0 auto 16px" }} />
            <p style={{ color: "#64748b", fontWeight: 600 }}>No studios yet</p>
            <p style={{ color: "#475569", fontSize: 13, marginBottom: 20 }}>Create a studio to get started.</p>
            <Button data-testid="create-first-studio" onClick={() => setShowCreate(true)} style={{ background: "#c9a84c", color: "#0f172a", fontWeight: 700 }}>
              Create First Studio
            </Button>
          </div>
        ) : (
          studios.map(s => <StudioRow key={s.studio_id} studio={s} onUpdate={refetch} />)
        )}

        <div style={{ marginTop: 32, background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "20px 24px" }}>
          <h3 style={{ color: "#94a3b8", fontSize: 14, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={14} color="#c9a84c" /> Studio Architecture
          </h3>
          <ul style={{ color: "#64748b", fontSize: 12, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
            <li>Access via: <code style={{ color: "#94a3b8" }}>/nxtgenlawgroup-studio</code> — fully isolated from GUBER marketplace</li>
            <li>Authentication: Email OTP only — separate from GUBER accounts</li>
            <li>Storage: Private Cloudinary folder per studio — signed URLs, 1-hour expiry</li>
            <li>All content requires staff/admin approval before publishing</li>
            <li>Audit log captures all actions: login, upload, generate, approve, download, archive</li>
            <li>Monthly AI image limits enforced server-side per studio</li>
            <li>Law firm safeguards: blocks fake testimonials, guaranteed outcomes, confidential client content</li>
          </ul>
        </div>
      </div>

      {showCreate && <CreateStudioForm onClose={() => setShowCreate(false)} onCreated={refetch} />}
    </div>
  );
}
