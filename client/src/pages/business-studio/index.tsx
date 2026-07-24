import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Sparkles, Image, Library, LogOut, ArrowLeft,
  CheckCircle, Clock, AlertCircle, Download, Trash2,
  Video, RefreshCw, ShieldCheck, Users, Plus, X,
  Film, Clapperboard,
} from "lucide-react";

const STUDIO_ID = "nxtgenlawgroup";
const API = (path: string) => `/api/bs/${STUDIO_ID}${path}`;

type View = "login-email" | "login-code" | "dashboard" | "library" | "upload" | "generate" | "generate-video" | "team";
type LibraryTab = "all" | "photo_upload" | "ai_image" | "ai_video" | "approved" | "pending";

interface StudioSession { authenticated: boolean; email?: string; role?: string; fullName?: string; }
interface StudioConfig { name: string; tagline: string; logo_url?: string; primary_color: string; accent_color: string; welcome_message?: string; }
interface ContentItem {
  id: number; content_type: string; status: string; approval_status: string;
  title?: string; caption?: string; thumbnail_url?: string; prompt?: string;
  platform_format?: string; created_at: string; owner_email: string;
}
interface TeamMember { email: string; role: string; full_name?: string; is_active: boolean; created_at: string; }

const GOLD = "#c9a84c";
const NAVY = "#0f172a";
const CARD = "#1e293b";
const BORDER = "#334155";
const DARK = "#0d1626";

// ── Header ─────────────────────────────────────────────────────────────────
function StudioShell({ children, session, onLogout, onNavigate }: {
  children: React.ReactNode;
  session?: StudioSession;
  onLogout?: () => void;
  onNavigate?: (v: View) => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: NAVY, color: "#f1f5f9" }}>
      {session?.authenticated && (
        <header style={{ background: DARK, borderBottom: `1px solid ${BORDER}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <button
            data-testid="studio-logo-home"
            onClick={() => onNavigate?.("dashboard")}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
          >
            <img src="/nxtgen-law-logo.png" alt="NXTGEN Law" style={{ height: 30, objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 10, color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase", display: "none", whiteSpace: "nowrap" }} className="studio-label">Studio</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {session.role === "admin" && (
              <button
                data-testid="studio-team-btn"
                onClick={() => onNavigate?.("team")}
                style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
              >
                <Users size={12} /> Team
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${GOLD}11`, border: `1px solid ${GOLD}33`, borderRadius: 20, padding: "4px 10px 4px 6px" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${GOLD}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: GOLD, fontWeight: 700 }}>
                {(session.email?.[0] ?? "?").toUpperCase()}
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.email}</span>
              {session.role && session.role !== "client" && (
                <span style={{ fontSize: 9, color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{session.role}</span>
              )}
            </div>
            <button
              data-testid="studio-logout"
              onClick={onLogout}
              title="Sign out"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", padding: 4 }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>
      )}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px 60px" }}>
        {children}
      </main>
      <footer style={{ textAlign: "center", padding: "20px", color: "#1e293b", fontSize: 11, borderTop: `1px solid #131f2e` }}>
        Powered by <span style={{ color: `${GOLD}88` }}>GUBER Global</span> · Private Studio · All content requires approval before publishing
      </footer>
    </div>
  );
}

// ── Login: email entry ─────────────────────────────────────────────────────
function LoginEmailView({ config, onCodeSent }: { config?: StudioConfig; onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const requestCode = useMutation({
    mutationFn: (email: string) => apiRequest("POST", API("/auth/request-code"), { email }),
    onSuccess: () => {
      toast({ title: "Code sent", description: "Check your email for the 6-digit access code." });
      onCodeSent(email.trim().toLowerCase());
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not send code.", variant: "destructive" });
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        {config?.logo_url ? (
          <img src={config.logo_url} alt="Studio logo" style={{ height: 56, objectFit: "contain", display: "block", margin: "0 auto 28px" }} />
        ) : (
          <h1 style={{ fontSize: 26, fontWeight: 700, color: GOLD, margin: "0 0 6px 0" }}>{config?.name ?? "NXTGEN Law Group"}</h1>
        )}
        <p style={{ color: "#475569", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 36px 0" }}>
          {config?.tagline ?? "Content Studio · Powered by GUBER Global"}
        </p>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "32px 28px" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${GOLD}18`, border: `1px solid ${GOLD}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <ShieldCheck size={20} color={GOLD} />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px 0" }}>Private Studio Access</h2>
          <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Enter your approved email to receive a one-time access code.
          </p>
          <Input
            data-testid="studio-email-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && email && requestCode.mutate(email)}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 12, borderRadius: 10 }}
          />
          <Button
            data-testid="studio-request-code-btn"
            onClick={() => requestCode.mutate(email)}
            disabled={!email || requestCode.isPending}
            style={{ width: "100%", background: GOLD, color: NAVY, fontWeight: 700, borderRadius: 10, height: 44 }}
          >
            {requestCode.isPending ? "Sending…" : "Send Access Code"}
          </Button>
          <p style={{ marginTop: 20, fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
            Only approved NXTGEN Law Group team members may access this studio.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Login: OTP entry ──────────────────────────────────────────────────────
function LoginCodeView({ email, config, onSuccess, onBack }: { email: string; config?: StudioConfig; onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const verifyCode = useMutation({
    mutationFn: (code: string) => apiRequest("POST", API("/auth/verify-code"), { email, code }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); onSuccess(); },
    onError: (err: any) => { toast({ title: "Invalid code", description: err.message || "Check the code and try again.", variant: "destructive" }); },
  });

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        {config?.logo_url && <img src={config.logo_url} alt="logo" style={{ height: 48, objectFit: "contain", display: "block", margin: "0 auto 28px" }} />}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "32px 28px" }}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>Code sent to</p>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 28, fontSize: 15 }}>{email}</p>
          <Input
            data-testid="studio-otp-input"
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => e.key === "Enter" && code.length === 6 && verifyCode.mutate(code)}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: GOLD, fontSize: 28, letterSpacing: 14, textAlign: "center", marginBottom: 14, borderRadius: 10, height: 60 }}
          />
          <Button
            data-testid="studio-verify-code-btn"
            onClick={() => verifyCode.mutate(code)}
            disabled={code.length !== 6 || verifyCode.isPending}
            style={{ width: "100%", background: GOLD, color: NAVY, fontWeight: 700, borderRadius: 10, height: 44, marginBottom: 10 }}
          >
            {verifyCode.isPending ? "Verifying…" : "Sign In"}
          </Button>
          <button data-testid="studio-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 12 }}>
            ← Use a different email
          </button>
          <p style={{ marginTop: 16, fontSize: 11, color: "#334155" }}>Code expires in 15 minutes. Check spam if you don't see it.</p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function DashboardView({ config, session, onNavigate }: { config?: StudioConfig; session: StudioSession; onNavigate: (v: View) => void }) {
  const cards = [
    {
      icon: <Sparkles size={26} color={GOLD} />,
      label: "AI Image",
      desc: "Generate professional marketing visuals",
      view: "generate" as View,
      gradient: "linear-gradient(135deg, #1e293b 0%, #0f2444 100%)",
      preview: (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "12px 12px 0 0" }}>
          <div style={{ position: "absolute", top: 12, right: 12, width: 60, height: 60, borderRadius: "50%", background: `${GOLD}22`, border: `1px solid ${GOLD}44` }} />
          <div style={{ position: "absolute", bottom: 8, left: 12, width: 80, height: 3, background: `${GOLD}44`, borderRadius: 2 }} />
          <div style={{ position: "absolute", bottom: 16, left: 12, width: 50, height: 3, background: `${GOLD}22`, borderRadius: 2 }} />
          <div style={{ position: "absolute", top: 20, left: 16, fontSize: 32 }}>⚖️</div>
        </div>
      ),
    },
    {
      icon: <Video size={26} color={GOLD} />,
      label: "AI Video",
      desc: "Create short cinematic marketing videos",
      view: "generate-video" as View,
      gradient: "linear-gradient(135deg, #1e293b 0%, #1a0a2e 100%)",
      preview: (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: `2px solid ${GOLD}66`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderLeft: `16px solid ${GOLD}99`, marginLeft: 4 }} />
          </div>
        </div>
      ),
    },
    {
      icon: <Upload size={26} color={GOLD} />,
      label: "Upload Photo",
      desc: "Add photos to your content library",
      view: "upload" as View,
      gradient: "linear-gradient(135deg, #1e293b 0%, #0a1628 100%)",
      preview: (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, border: `2px dashed ${GOLD}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Upload size={18} color={`${GOLD}88`} />
          </div>
        </div>
      ),
    },
    {
      icon: <Library size={26} color={GOLD} />,
      label: "Content Library",
      desc: "Browse, download, and manage your content",
      view: "library" as View,
      gradient: "linear-gradient(135deg, #1e293b 0%, #0d1f1a 100%)",
      preview: (
        <div style={{ position: "absolute", inset: 0, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {["#c9a84c22", "#0f244422", "#1a0a2e22", "#0d1f1a22"].map((bg, i) => (
            <div key={i} style={{ background: bg, border: `1px solid ${BORDER}`, borderRadius: 4 }} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Hero */}
      <div style={{ marginBottom: 32, background: `linear-gradient(135deg, #0d1626 0%, #0f172a 60%, #1a0e00 100%)`, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "32px 32px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 160, height: 160, borderRadius: "50%", background: `${GOLD}08`, border: `1px solid ${GOLD}15` }} />
        <div style={{ position: "absolute", bottom: -40, right: 60, width: 100, height: 100, borderRadius: "50%", background: `${GOLD}05` }} />
        <div style={{ position: "relative" }}>
          <p style={{ color: GOLD, fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 10px 0", fontWeight: 600 }}>NXTGEN Law Group</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px 0", lineHeight: 1.2 }}>
            What are we creating today?
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0, maxWidth: 480 }}>
            {config?.welcome_message ?? "Generate AI-powered marketing visuals and videos for your firm. All content is stored privately and requires approval before use."}
          </p>
          {session.fullName && (
            <p style={{ color: `${GOLD}88`, fontSize: 12, marginTop: 12 }}>Welcome back, {session.fullName}.</p>
          )}
        </div>
      </div>

      {/* Action Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        {cards.map((card, i) => (
          <button
            key={i}
            data-testid={`studio-action-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => onNavigate(card.view)}
            style={{
              background: card.gradient,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, transform 0.1s",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            {/* Visual preview area */}
            <div style={{ height: 90, background: DARK, position: "relative", borderBottom: `1px solid ${BORDER}` }}>
              {card.preview}
            </div>
            <div style={{ padding: "14px 16px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {card.icon}
                <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>{card.label}</span>
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{card.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Legal reminder */}
      <div style={{ background: DARK, border: `1px solid #1e293b`, borderRadius: 10, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AlertCircle size={14} color={`${GOLD}99`} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ color: "#475569", fontSize: 12, margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: "#64748b" }}>Legal Marketing Reminder:</strong> All content requires approval before publishing. Never upload confidential client materials, generate fake case results, testimonials, or guaranteed outcomes.
        </p>
      </div>
    </>
  );
}

// ── Back button helper ─────────────────────────────────────────────────────
function BackBtn({ onClick, label = "Back to Dashboard" }: { onClick: () => void; label?: string }) {
  return (
    <button data-testid="back-btn" onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 13 }}>
      <ArrowLeft size={14} /> {label}
    </button>
  );
}

// ── Photo Upload ───────────────────────────────────────────────────────────
function UploadView({ onBack }: { onBack: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState("Instagram (1:1)");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) { toast({ title: "Images only", variant: "destructive" }); return; }
    if (f.size > 10 * 1024 * 1024) { toast({ title: "Max 10MB", variant: "destructive" }); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, [toast]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file");
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => { reader.onload = e => resolve(e.target?.result as string); reader.onerror = reject; reader.readAsDataURL(file); });
      return apiRequest("POST", API("/upload"), { imageData, title, caption, platformFormat: platform });
    },
    onSuccess: () => {
      toast({ title: "Uploaded", description: "Added to your content library — pending approval." });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      setPreview(null); setFile(null); setTitle(""); setCaption("");
      onBack();
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>Upload a Photo</h2>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 28 }}>Add photos to your private content library. Requires approval before publishing.</p>

      <div style={{ display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div>
          <div
            data-testid="upload-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{ border: `2px dashed ${preview ? GOLD : BORDER}`, borderRadius: 14, padding: "40px 32px", textAlign: "center", cursor: "pointer", background: DARK, transition: "border-color 0.15s" }}
          >
            <Upload size={28} color={GOLD} style={{ margin: "0 auto 10px" }} />
            <p style={{ color: "#94a3b8", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Drop image here or click to browse</p>
            <p style={{ color: "#475569", fontSize: 12 }}>JPG, PNG, WebP — max 10MB</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} data-testid="upload-file-input" />
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Title (optional)</label>
              <Input data-testid="upload-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Office Team Photo" style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Caption (optional)</label>
              <Textarea data-testid="upload-caption-input" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption…" rows={2} style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Platform</label>
              <select data-testid="upload-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
                <option>Instagram (1:1)</option>
                <option>Instagram Story (9:16)</option>
                <option>LinkedIn (1.91:1)</option>
                <option>Facebook Cover (16:9)</option>
                <option>Twitter/X (16:9)</option>
                <option>General / Website</option>
              </select>
            </div>
          </div>
        </div>

        {preview && (
          <div>
            <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>Preview</p>
            <img src={preview} alt="Preview" style={{ width: "100%", borderRadius: 12, border: `1px solid ${BORDER}`, objectFit: "cover", maxHeight: 320 }} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <Button data-testid="upload-submit-btn" onClick={() => upload.mutate()} disabled={!file || upload.isPending} style={{ background: GOLD, color: NAVY, fontWeight: 700 }}>
          {upload.isPending ? "Uploading…" : "Upload Photo"}
        </Button>
        <Button variant="outline" onClick={onBack} style={{ borderColor: BORDER, color: "#64748b" }}>Cancel</Button>
      </div>
    </div>
  );
}

// ── AI Image Generation ────────────────────────────────────────────────────
function GenerateView({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("Instagram (1:1)");
  const [result, setResult] = useState<{ id: number; thumbnailUrl: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => apiRequest("POST", API("/generate"), { prompt, title, platformFormat: platform }),
    onSuccess: (data: any) => {
      setResult({ id: data.id, thumbnailUrl: data.thumbnailUrl });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Image created!", description: "Added to your library — pending approval." });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" }),
  });

  const EXAMPLES = [
    { label: "Attorney Team", text: "A professional team of diverse attorneys in a modern law office with city skyline view, dark blue and gold tones" },
    { label: "Justice Symbol", text: "Abstract scales of justice with modern geometric design, dark blue and gold color scheme, premium aesthetic" },
    { label: "Conference Room", text: "Elegant law firm conference room, polished mahogany table, city view through floor-to-ceiling windows, cinematic lighting" },
    { label: "Legal Handshake", text: "Professional handshake in a modern office setting, trust and partnership concept, soft focus background" },
  ];

  const STYLE_CARDS = [
    { label: "Corporate", bg: "linear-gradient(135deg, #0f172a, #0f2444)", emoji: "🏢" },
    { label: "Cinematic", bg: "linear-gradient(135deg, #1a0a2e, #0f172a)", emoji: "🎬" },
    { label: "Elegant", bg: "linear-gradient(135deg, #1a0e00, #0f172a)", emoji: "⚖️" },
    { label: "Modern", bg: "linear-gradient(135deg, #0d1f1a, #0f172a)", emoji: "✨" },
  ];

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>Create an AI Image</h2>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>Generate professional legal marketing visuals. Takes about 15–30 seconds.</p>

      {/* Style inspiration row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {STYLE_CARDS.map((s, i) => (
          <div key={i} style={{ flexShrink: 0, width: 90, height: 70, background: s.bg, border: `1px solid ${BORDER}`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "default" }}>
            <span style={{ fontSize: 22 }}>{s.emoji}</span>
            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div>
          <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Title (optional)</label>
          <Input data-testid="generate-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Team Photo" style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 14 }} />

          <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Describe the image</label>
          <Textarea
            data-testid="generate-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Be specific about setting, mood, colors, and style…"
            rows={4}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 14 }}
          />

          <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Platform</label>
          <select data-testid="generate-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 18 }}>
            <option>Instagram (1:1)</option>
            <option>Instagram Story (9:16)</option>
            <option>LinkedIn (1.91:1)</option>
            <option>Facebook Cover (16:9)</option>
            <option>Twitter/X (16:9)</option>
            <option>YouTube Thumbnail (16:9)</option>
          </select>

          <p style={{ color: "#475569", fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Tap a prompt for inspiration:</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 18 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setPrompt(ex.text)} data-testid={`example-prompt-${i}`}
                style={{ background: DARK, border: `1px solid #1e293b`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "#64748b", fontSize: 11, textAlign: "left", lineHeight: 1.4 }}>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 10, display: "block", marginBottom: 2 }}>{ex.label}</span>
                {ex.text.slice(0, 60)}…
              </button>
            ))}
          </div>

          <Button
            data-testid="generate-submit-btn"
            onClick={() => generate.mutate()}
            disabled={!prompt.trim() || generate.isPending}
            style={{ background: GOLD, color: NAVY, fontWeight: 700, width: "100%", height: 46 }}
          >
            {generate.isPending ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RefreshCw size={14} className="animate-spin" /> Generating… (up to 30s)
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={14} /> Generate Image
              </span>
            )}
          </Button>
        </div>

        {result && (
          <div>
            <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>Generated</p>
            <img src={result.thumbnailUrl} alt="Generated" style={{ width: "100%", borderRadius: 12, border: `1px solid ${GOLD}44`, boxShadow: `0 0 24px ${GOLD}18` }} />
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge style={{ background: "#fef08a18", color: "#fef08a", border: "1px solid #fef08a33", fontSize: 11 }}>
                <Clock size={10} style={{ marginRight: 4 }} /> Pending Approval
              </Badge>
            </div>
            <p style={{ color: "#475569", fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>Saved to library. Staff must approve before publishing.</p>
            <Button data-testid="generate-another-btn" variant="outline" onClick={() => { setResult(null); setPrompt(""); }} style={{ marginTop: 10, borderColor: BORDER, color: "#64748b", fontSize: 12 }}>
              Generate Another
            </Button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, background: DARK, border: `1px solid #1e293b`, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 10 }}>
        <AlertCircle size={13} color={`${GOLD}88`} style={{ marginTop: 1, flexShrink: 0 }} />
        <p style={{ color: "#475569", fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          Do not request fake case results, testimonials, guaranteed outcomes, or content referencing specific clients. Images are not used for AI training.
        </p>
      </div>
    </div>
  );
}

// ── AI Video Generation ────────────────────────────────────────────────────
function GenerateVideoView({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [result, setResult] = useState<{ id: number; thumbnailUrl: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => apiRequest("POST", API("/generate-video"), { prompt, title, aspectRatio }),
    onSuccess: (data: any) => {
      setResult({ id: data.id, thumbnailUrl: data.thumbnailUrl });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Video created!", description: "5-second AI video added to your library — pending approval." });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" }),
  });

  const EXAMPLES = [
    { label: "Office Reveal", text: "Sleek law firm office, camera slowly panning across modern furniture, city skyline in background, professional lighting" },
    { label: "Attorney Walk", text: "Confident attorney walking through a glass-walled corridor of a high-rise office building, purposeful stride" },
    { label: "Justice Symbol", text: "Golden scales of justice rotating slowly in a dark elegant setting, dramatic lighting, cinematic camera move" },
    { label: "Team Meeting", text: "Legal team around a conference table, aerial shot slowly zooming out, professional corporate atmosphere" },
  ];

  return (
    <div>
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Create an AI Video</h2>
        <Badge style={{ background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}44`, fontSize: 10 }}>5 seconds</Badge>
      </div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        Generate a cinematic 5-second marketing video using AI. Takes 2–3 minutes. Perfect for social media intros.
      </p>

      {/* Format selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[["16:9", "Landscape", "🖥"], ["9:16", "Vertical", "📱"], ["1:1", "Square", "⬜"]].map(([ratio, label, icon]) => (
          <button
            key={ratio}
            onClick={() => setAspectRatio(ratio)}
            style={{
              flex: 1, background: aspectRatio === ratio ? `${GOLD}22` : DARK,
              border: `1px solid ${aspectRatio === ratio ? GOLD : BORDER}`,
              borderRadius: 10, padding: "12px 8px", cursor: "pointer",
              color: aspectRatio === ratio ? GOLD : "#64748b", fontSize: 12, textAlign: "center",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontWeight: 600, fontSize: 11 }}>{label}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{ratio}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div>
          <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Title (optional)</label>
          <Input data-testid="video-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Office Intro" style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 14 }} />

          <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 5 }}>Describe the video scene</label>
          <Textarea
            data-testid="video-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the scene, camera movement, mood, and setting…"
            rows={4}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 18 }}
          />

          <p style={{ color: "#475569", fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Scene ideas:</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 18 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setPrompt(ex.text)} data-testid={`video-example-${i}`}
                style={{ background: DARK, border: `1px solid #1e293b`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "#64748b", fontSize: 11, textAlign: "left", lineHeight: 1.4 }}>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 10, display: "block", marginBottom: 2 }}>{ex.label}</span>
                {ex.text.slice(0, 60)}…
              </button>
            ))}
          </div>

          <Button
            data-testid="video-submit-btn"
            onClick={() => generate.mutate()}
            disabled={!prompt.trim() || generate.isPending}
            style={{ background: GOLD, color: NAVY, fontWeight: 700, width: "100%", height: 46 }}
          >
            {generate.isPending ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RefreshCw size={14} className="animate-spin" /> Generating video… (2–3 min)
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clapperboard size={14} /> Generate Video
              </span>
            )}
          </Button>
        </div>

        {result && (
          <div>
            <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>Generated</p>
            <div style={{ background: DARK, border: `1px solid ${GOLD}44`, borderRadius: 12, overflow: "hidden", boxShadow: `0 0 24px ${GOLD}18` }}>
              <div style={{ position: "relative", paddingBottom: aspectRatio === "9:16" ? "177%" : aspectRatio === "1:1" ? "100%" : "56.25%", background: "#000" }}>
                {result.thumbnailUrl && (
                  <img src={result.thumbnailUrl} alt="Video thumb" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Film size={32} color={`${GOLD}99`} />
                </div>
              </div>
            </div>
            <Badge style={{ marginTop: 10, background: "#fef08a18", color: "#fef08a", border: "1px solid #fef08a33", fontSize: 11 }}>
              <Clock size={10} style={{ marginRight: 4 }} /> Pending Approval
            </Badge>
            <p style={{ color: "#475569", fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>Saved to library. Download it from your Content Library.</p>
            <Button variant="outline" onClick={() => { setResult(null); setPrompt(""); }} style={{ marginTop: 10, borderColor: BORDER, color: "#64748b", fontSize: 12 }}>
              Generate Another
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Content Library ────────────────────────────────────────────────────────
function LibraryView({ session, onBack }: { session: StudioSession; onBack: () => void }) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = new URLSearchParams();
  if (tab === "photo_upload" || tab === "ai_image" || tab === "ai_video") params.set("type", tab);
  if (tab === "approved") params.set("approvalStatus", "approved");
  if (tab === "pending") params.set("approvalStatus", "pending");

  const { data: items = [], isLoading, refetch } = useQuery<ContentItem[]>({
    queryKey: [API("/content"), tab],
    queryFn: async () => {
      const res = await fetch(`${API("/content")}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approve = useMutation({
    mutationFn: (id: number) => apiRequest("POST", API(`/content/${id}/approve`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/content")] }); toast({ title: "Approved ✓" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", API(`/content/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/content")] }); toast({ title: "Archived" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const download = async (id: number, type: string) => {
    try {
      const res = await fetch(API(`/content/${id}/url`), { credentials: "include" });
      const data = await res.json();
      if (!data.url) throw new Error("No URL");
      const a = document.createElement("a");
      a.href = data.url;
      a.target = "_blank";
      a.download = `nxtgen-studio-${type}-${id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { toast({ title: "Download error", variant: "destructive" }); }
  };

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "photo_upload", label: "Photos" },
    { id: "ai_image", label: "AI Images" },
    { id: "ai_video", label: "Videos" },
    { id: "approved", label: "✓ Approved" },
    { id: "pending", label: "Pending" },
  ];

  const typeLabel = (t: string) => ({ photo_upload: "Photo", ai_image: "AI Image", ai_video: "AI Video" }[t] ?? t);
  const statusColor = (s: string) => s === "approved" ? "#4ade80" : s === "rejected" ? "#f87171" : GOLD;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <BackBtn onClick={onBack} label="Back" />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Content Library</h2>
        <button data-testid="library-refresh-btn" onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", marginLeft: "auto" }}>
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 20, overflowX: "auto", borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map(t => (
          <button
            key={t.id}
            data-testid={`library-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? GOLD : "#64748b",
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 13, padding: "10px 14px", whiteSpace: "nowrap",
              borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
          <RefreshCw size={24} color={BORDER} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13 }}>Loading…</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
          <Image size={40} color="#1e293b" style={{ margin: "0 auto 16px" }} />
          <p style={{ fontWeight: 600, color: "#64748b", marginBottom: 4 }}>No content yet</p>
          <p style={{ fontSize: 13 }}>Upload a photo or generate an AI image to get started.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {items.map(item => (
            <div key={item.id} data-testid={`content-card-${item.id}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ aspectRatio: "16/10", background: DARK, position: "relative", overflow: "hidden" }}>
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title ?? "Content"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    {item.content_type === "ai_video" ? <Video size={28} color="#334155" /> : <Image size={28} color="#334155" />}
                  </div>
                )}
                {item.content_type === "ai_video" && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${GOLD}88`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${GOLD}`, marginLeft: 2 }} />
                    </div>
                  </div>
                )}
                <div style={{ position: "absolute", top: 6, right: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(item.approval_status), boxShadow: `0 0 6px ${statusColor(item.approval_status)}` }} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{typeLabel(item.content_type)}</span>
                  <span style={{ fontSize: 10, color: statusColor(item.approval_status), fontWeight: 600 }}>{item.approval_status}</span>
                </div>
                {item.title && <p style={{ fontWeight: 600, fontSize: 12, color: "#e2e8f0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>}
                <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>{new Date(item.created_at).toLocaleDateString()}</p>
                <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                  <button
                    data-testid={`download-btn-${item.id}`}
                    onClick={() => download(item.id, item.content_type)}
                    style={{ flex: 1, background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: 6, padding: "5px 6px", cursor: "pointer", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 600 }}
                  >
                    <Download size={11} /> Download
                  </button>
                  {(session.role === "staff" || session.role === "admin") && item.approval_status === "pending" && (
                    <button
                      data-testid={`approve-btn-${item.id}`}
                      onClick={() => approve.mutate(item.id)}
                      style={{ background: "#064e3b", border: "1px solid #065f46", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#4ade80", display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}
                    >
                      <CheckCircle size={11} />
                    </button>
                  )}
                  <button
                    data-testid={`archive-btn-${item.id}`}
                    onClick={() => archive.mutate(item.id)}
                    style={{ background: "#1e293b", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Team Management (admin only) ───────────────────────────────────────────
function TeamView({ session, onBack }: { session: StudioSession; onBack: () => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("client");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: [API("/team")],
    queryFn: async () => {
      const res = await fetch(API("/team"), { credentials: "include" });
      if (!res.ok) throw new Error("Forbidden");
      return res.json();
    },
  });

  const addMember = useMutation({
    mutationFn: () => apiRequest("POST", API("/team"), { email: newEmail, role: newRole, fullName: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API("/team")] });
      toast({ title: "Added", description: `${newEmail} can now access the studio.` });
      setNewEmail(""); setNewName(""); setNewRole("client");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: (email: string) => apiRequest("DELETE", API(`/team/${encodeURIComponent(email)}`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/team")] }); toast({ title: "Removed" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const roleColor = (r: string) => r === "admin" ? GOLD : r === "staff" ? "#60a5fa" : "#94a3b8";

  return (
    <div>
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Users size={20} color={GOLD} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Studio Team</h2>
      </div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>Control who can access this studio. Only approved emails can sign in.</p>

      {/* Add member form */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 20px 20px", marginBottom: 24 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 14, margin: "0 0 14px 0" }}>Add Team Member</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Input
            data-testid="team-email-input"
            type="email"
            placeholder="their@email.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9" }}
          />
          <Input
            data-testid="team-name-input"
            placeholder="Full Name (optional)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            data-testid="team-role-select"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            style={{ background: DARK, border: `1px solid ${BORDER}`, color: "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 13, flex: 1 }}
          >
            <option value="client">Client — can create & download</option>
            <option value="staff">Staff — can also approve content</option>
            <option value="admin">Admin — full control + manage team</option>
          </select>
          <Button
            data-testid="team-add-btn"
            onClick={() => addMember.mutate()}
            disabled={!newEmail || addMember.isPending}
            style={{ background: GOLD, color: NAVY, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            {addMember.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>

      {/* Members list */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>Loading…</div>
      ) : members.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>No team members yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map(m => (
            <div key={m.email} style={{ background: CARD, border: `1px solid ${m.is_active ? BORDER : "#1e293b"}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, opacity: m.is_active ? 1 : 0.5 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${roleColor(m.role)}22`, border: `1px solid ${roleColor(m.role)}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: roleColor(m.role), fontWeight: 700, flexShrink: 0 }}>
                {(m.email[0] ?? "?").toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name || m.email}</p>
                {m.full_name && <p style={{ fontSize: 11, color: "#475569", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</p>}
              </div>
              <span style={{ fontSize: 10, color: roleColor(m.role), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>{m.role}</span>
              {!m.is_active && <Badge style={{ background: "#1e293b", color: "#475569", border: "1px solid #334155", fontSize: 9 }}>Removed</Badge>}
              {m.email !== session.email && m.is_active && (
                <button
                  data-testid={`remove-member-${m.email}`}
                  onClick={() => removeMember.mutate(m.email)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 4, flexShrink: 0 }}
                  title="Remove access"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function NxtgenLawGroupStudio() {
  const [view, setView] = useState<View>("login-email");
  const [pendingEmail, setPendingEmail] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config } = useQuery<StudioConfig>({
    queryKey: [API("/config")],
    queryFn: async () => { const res = await fetch(API("/config")); if (!res.ok) throw new Error("Studio not found"); return res.json(); },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: session, isLoading: sessionLoading } = useQuery<StudioSession>({
    queryKey: [API("/auth/session")],
    queryFn: async () => { const res = await fetch(API("/auth/session"), { credentials: "include" }); return res.json(); },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const logout = useMutation({
    mutationFn: () => apiRequest("POST", API("/auth/logout"), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); setView("login-email"); toast({ title: "Signed out" }); },
  });

  if (!sessionLoading && session?.authenticated && (view === "login-email" || view === "login-code")) {
    setView("dashboard");
  }

  if (sessionLoading) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 14px" }} />
          <p style={{ fontSize: 12, color: "#475569" }}>Loading studio…</p>
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    if (view === "login-code") {
      return <LoginCodeView email={pendingEmail} config={config} onSuccess={() => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); setView("dashboard"); }} onBack={() => setView("login-email")} />;
    }
    return <LoginEmailView config={config} onCodeSent={email => { setPendingEmail(email); setView("login-code"); }} />;
  }

  return (
    <StudioShell session={session} onLogout={() => logout.mutate()} onNavigate={setView}>
      {view === "dashboard" && <DashboardView config={config} session={session} onNavigate={setView} />}
      {view === "upload" && <UploadView onBack={() => setView("dashboard")} />}
      {view === "generate" && <GenerateView onBack={() => setView("dashboard")} />}
      {view === "generate-video" && <GenerateVideoView onBack={() => setView("dashboard")} />}
      {view === "library" && <LibraryView session={session} onBack={() => setView("dashboard")} />}
      {view === "team" && <TeamView session={session} onBack={() => setView("dashboard")} />}
    </StudioShell>
  );
}
