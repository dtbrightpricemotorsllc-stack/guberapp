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
  Scale, Mic, Video, FileText, Plus, RefreshCw,
  ShieldCheck, Eye,
} from "lucide-react";

const STUDIO_ID = "nxtgenlawgroup";
const API = (path: string) => `/api/bs/${STUDIO_ID}${path}`;

type View = "login-email" | "login-code" | "dashboard" | "library" | "upload" | "generate";
type LibraryTab = "all" | "photo_upload" | "ai_image" | "approved" | "pending";

interface StudioSession {
  authenticated: boolean;
  email?: string;
  role?: string;
  fullName?: string;
}

interface StudioConfig {
  name: string;
  tagline: string;
  logo_url?: string;
  primary_color: string;
  accent_color: string;
  welcome_message?: string;
}

interface ContentItem {
  id: number;
  content_type: string;
  status: string;
  approval_status: string;
  title?: string;
  caption?: string;
  thumbnail_url?: string;
  prompt?: string;
  platform_format?: string;
  created_at: string;
  owner_email: string;
  approved_by?: string;
  approved_at?: string;
}

// ── Styled primitives ──────────────────────────────────────────────────────
const GOLD = "#c9a84c";
const NAVY = "#0f172a";
const CARD = "#1e293b";
const BORDER = "#334155";

function StudioShell({ children, session, onLogout, onNavigate }: {
  children: React.ReactNode;
  session?: StudioSession;
  onLogout?: () => void;
  onNavigate?: (v: View) => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: NAVY, color: "#f1f5f9" }}>
      {session?.authenticated && (
        <header style={{ background: "#0d1626", borderBottom: `1px solid ${BORDER}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            data-testid="studio-logo-home"
            onClick={() => onNavigate?.("dashboard")}
            style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", color: "#f1f5f9" }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: "0.03em" }}>NXTGEN Law Group</span>
            <span style={{ fontSize: 11, color: "#64748b", letterSpacing: "1px", textTransform: "uppercase" }}>Content Studio</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{session.email}</span>
            {session.role && session.role !== "client" && (
              <Badge style={{ background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}44`, fontSize: 10 }}>
                {session.role}
              </Badge>
            )}
            <button
              data-testid="studio-logout"
              onClick={onLogout}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>
      )}
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px" }}>
        {children}
      </main>
      <footer style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: 11, borderTop: `1px solid #1e293b`, marginTop: 40 }}>
        Powered by <span style={{ color: GOLD }}>GUBER Global</span> · Private Studio · All content requires approval before publishing
      </footer>
    </div>
  );
}

// ── Login: email entry ─────────────────────────────────────────────────────
function LoginEmailView({ config, onCodeSent }: { config?: StudioConfig; onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const requestCode = useMutation({
    mutationFn: (email: string) =>
      apiRequest("POST", API("/auth/request-code"), { email }),
    onSuccess: () => {
      toast({ title: "Code sent", description: "Check your email for the access code." });
      onCodeSent(email.trim().toLowerCase());
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not send code.", variant: "destructive" });
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        {config?.logo_url && (
          <img src={config.logo_url} alt="Studio logo" style={{ height: 60, objectFit: "contain", marginBottom: 24, display: "block", margin: "0 auto 24px" }} />
        )}
        <h1 style={{ fontSize: 26, fontWeight: 700, color: GOLD, margin: "0 0 6px 0" }}>
          {config?.name ?? "NXTGEN Law Group"}
        </h1>
        <p style={{ color: "#64748b", fontSize: 12, letterSpacing: "1.2px", textTransform: "uppercase", margin: "0 0 40px 0" }}>
          {config?.tagline ?? "Content Studio · Powered by GUBER Global"}
        </p>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
            <ShieldCheck size={16} color={GOLD} />
            <span style={{ fontSize: 13, color: "#94a3b8" }}>Private Studio Access</span>
          </div>
          <p style={{ color: "#cbd5e1", fontSize: 14, marginBottom: 24 }}>
            This studio is private. Enter your approved email address to receive a one-time access code.
          </p>
          <Input
            data-testid="studio-email-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && email && requestCode.mutate(email)}
            style={{ background: "#0f172a", border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 16 }}
          />
          <Button
            data-testid="studio-request-code-btn"
            onClick={() => requestCode.mutate(email)}
            disabled={!email || requestCode.isPending}
            style={{ width: "100%", background: GOLD, color: NAVY, fontWeight: 700 }}
          >
            {requestCode.isPending ? "Sending..." : "Send Access Code"}
          </Button>
          <p style={{ marginTop: 20, fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
            Only approved NXTGEN Law Group team members may access this studio.
            If you believe you should have access, contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Login: OTP code entry ──────────────────────────────────────────────────
function LoginCodeView({ email, config, onSuccess, onBack }: {
  email: string;
  config?: StudioConfig;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const verifyCode = useMutation({
    mutationFn: (code: string) =>
      apiRequest("POST", API("/auth/verify-code"), { email, code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API("/auth/session")] });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Invalid code", description: err.message || "Please check the code and try again.", variant: "destructive" });
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: GOLD, margin: "0 0 4px 0" }}>
          {config?.name ?? "NXTGEN Law Group"}
        </h1>
        <p style={{ color: "#64748b", fontSize: 12, letterSpacing: "1.2px", textTransform: "uppercase", margin: "0 0 40px 0" }}>
          Content Studio
        </p>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32 }}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Code sent to</p>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 28 }}>{email}</p>
          <Input
            data-testid="studio-otp-input"
            type="text"
            inputMode="numeric"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => e.key === "Enter" && code.length === 6 && verifyCode.mutate(code)}
            style={{ background: "#0f172a", border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 24, letterSpacing: 8, textAlign: "center", marginBottom: 16 }}
          />
          <Button
            data-testid="studio-verify-code-btn"
            onClick={() => verifyCode.mutate(code)}
            disabled={code.length !== 6 || verifyCode.isPending}
            style={{ width: "100%", background: GOLD, color: NAVY, fontWeight: 700, marginBottom: 12 }}
          >
            {verifyCode.isPending ? "Verifying..." : "Sign In"}
          </Button>
          <button
            data-testid="studio-back-btn"
            onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13 }}
          >
            ← Use a different email
          </button>
          <p style={{ marginTop: 20, fontSize: 11, color: "#475569" }}>
            Code expires in 15 minutes. Check your spam folder if you don't see it.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function DashboardView({ config, session, onNavigate }: {
  config?: StudioConfig;
  session: StudioSession;
  onNavigate: (v: View) => void;
}) {
  const actions = [
    { icon: <Upload size={32} color={GOLD} />, label: "Upload a Photo", desc: "Add photos to your content library", view: "upload" as View },
    { icon: <Sparkles size={32} color={GOLD} />, label: "Create an AI Image", desc: "Generate professional marketing visuals with AI", view: "generate" as View },
    { icon: <Image size={32} color={GOLD} />, label: "Turn My Photo Into a Post", desc: "Transform your photos into polished content", view: "generate" as View },
    { icon: <Scale size={32} color={GOLD} />, label: "Create a Legal Tip", desc: "Craft educational legal content for your audience", view: "generate" as View },
    { icon: <Mic size={32} color={GOLD} />, label: "Promote My Podcast", desc: "Create promotional content for your podcast", view: "generate" as View },
    { icon: <Video size={32} color={GOLD} />, label: "Create an AI Video", desc: "Coming in Phase 2 — AI video generation", view: null as any, disabled: true },
    { icon: <Library size={32} color={GOLD} />, label: "View My Content", desc: "Browse your uploaded and generated content", view: "library" as View },
  ];

  return (
    <>
      <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px 0" }}>
          What are we creating today?
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 15 }}>
          {config?.welcome_message ?? "Welcome to your private content studio."}
        </p>
        {session.fullName && (
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
            Good to see you, {session.fullName}.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {actions.map((a, i) => (
          <button
            key={i}
            data-testid={`studio-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => !a.disabled && onNavigate(a.view)}
            disabled={a.disabled}
            style={{
              background: a.disabled ? "#131f2e" : CARD,
              border: `1px solid ${a.disabled ? "#1e293b" : BORDER}`,
              borderRadius: 14,
              padding: "28px 24px",
              cursor: a.disabled ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
              opacity: a.disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => !a.disabled && ((e.currentTarget as HTMLElement).style.borderColor = GOLD)}
            onMouseLeave={e => !a.disabled && ((e.currentTarget as HTMLElement).style.borderColor = BORDER)}
          >
            <div style={{ marginBottom: 16 }}>{a.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#f1f5f9", marginBottom: 6 }}>{a.label}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{a.desc}</div>
            {a.disabled && (
              <Badge style={{ marginTop: 10, background: "#1e293b", color: "#64748b", border: "1px solid #334155", fontSize: 10 }}>
                Coming Soon
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 32, background: "#0d1626", border: `1px solid #1e293b`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <AlertCircle size={16} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px 0", fontWeight: 600 }}>Legal Marketing Reminder</p>
          <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            All content requires approval before publishing. Do not upload confidential client information, case files, or privileged materials.
            Never generate fake case results, testimonials, or guaranteed outcomes.
          </p>
        </div>
      </div>
    </>
  );
}

// ── Photo Upload ───────────────────────────────────────────────────────────
function UploadView({ onBack }: { onBack: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 10MB per image.", variant: "destructive" });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, [toast]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return apiRequest("POST", API("/upload"), { imageData, title, caption, platformFormat: platform });
    },
    onSuccess: () => {
      toast({ title: "Uploaded", description: "Your photo has been added to your content library." });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      setPreview(null); setFile(null); setTitle(""); setCaption("");
      onBack();
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div>
      <button data-testid="upload-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 14 }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Upload a Photo</h2>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 32 }}>
        Upload photos to your private content library. All uploads require approval before publishing.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div>
          <div
            data-testid="upload-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{
              border: `2px dashed ${preview ? GOLD : BORDER}`,
              borderRadius: 12,
              padding: 48,
              textAlign: "center",
              cursor: "pointer",
              background: "#0d1626",
              transition: "border-color 0.15s",
            }}
          >
            <Upload size={32} color={GOLD} style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>Drop image here or click to browse</p>
            <p style={{ color: "#475569", fontSize: 12 }}>JPG, PNG, WebP — max 10MB</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} data-testid="upload-file-input" />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Title (optional)</label>
            <Input data-testid="upload-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Office Team Photo" style={{ background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 12 }} />

            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Caption (optional)</label>
            <Textarea data-testid="upload-caption-input" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption for this photo..." rows={3} style={{ background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 12 }} />

            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Platform Format</label>
            <select data-testid="upload-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ width: "100%", background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 14 }}>
              <option value="instagram">Instagram (Square)</option>
              <option value="instagram_story">Instagram Story</option>
              <option value="linkedin">LinkedIn</option>
              <option value="facebook">Facebook</option>
              <option value="twitter">Twitter / X</option>
              <option value="general">General / Website</option>
            </select>
          </div>
        </div>

        {preview && (
          <div>
            <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10 }}>Preview</p>
            <img src={preview} alt="Preview" style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, objectFit: "cover", maxHeight: 360 }} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <Button
          data-testid="upload-submit-btn"
          onClick={() => upload.mutate()}
          disabled={!file || upload.isPending}
          style={{ background: GOLD, color: NAVY, fontWeight: 700 }}
        >
          {upload.isPending ? "Uploading..." : "Upload Photo"}
        </Button>
        <Button variant="outline" onClick={onBack} style={{ borderColor: BORDER, color: "#94a3b8" }}>
          Cancel
        </Button>
      </div>

      <div style={{ marginTop: 20, background: "#0d1626", border: `1px solid #1e293b`, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertCircle size={14} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ color: "#64748b", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          Do not upload confidential client documents, case files, evidence, or privileged materials.
          This studio is for marketing content only. Uploaded files are stored privately and require approval before use.
        </p>
      </div>
    </div>
  );
}

// ── AI Image Generation ────────────────────────────────────────────────────
function GenerateView({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [result, setResult] = useState<{ id: number; thumbnailUrl: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => apiRequest("POST", API("/generate"), { prompt, title, platformFormat: platform }),
    onSuccess: (data: any) => {
      setResult({ id: data.id, thumbnailUrl: data.thumbnailUrl });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Image created", description: "Your AI image is ready. It's been added to your library pending approval." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const EXAMPLES = [
    "A professional team of diverse attorneys in a modern law office with city skyline view",
    "Abstract scales of justice with modern geometric design, dark blue and gold color scheme",
    "Confident attorney at a polished conference table, professional corporate photography style",
    "Legal concept: handshake and gavel with soft focus background, premium marketing aesthetic",
  ];

  return (
    <div>
      <button data-testid="generate-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 14 }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Create an AI Image</h2>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 32 }}>
        Generate professional legal marketing visuals using AI. All images require approval before publishing.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div>
          <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Title (optional)</label>
          <Input data-testid="generate-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Team Photo" style={{ background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 14 }} />

          <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Describe the image you want</label>
          <Textarea
            data-testid="generate-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image in detail. Be specific about setting, mood, colors, and style..."
            rows={4}
            style={{ background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", marginBottom: 14 }}
          />

          <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Platform Format</label>
          <select data-testid="generate-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ width: "100%", background: "#0d1626", border: `1px solid ${BORDER}`, color: "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 14, marginBottom: 20 }}>
            <option value="instagram">Instagram (1:1)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="facebook">Facebook</option>
            <option value="twitter">Twitter / X</option>
            <option value="general">General / Website</option>
          </select>

          <p style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>Need inspiration? Try these prompts:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setPrompt(ex)} data-testid={`example-prompt-${i}`} style={{ background: "#0d1626", border: `1px solid #1e293b`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#94a3b8", fontSize: 12, textAlign: "left" }}>
                {ex}
              </button>
            ))}
          </div>

          <Button
            data-testid="generate-submit-btn"
            onClick={() => generate.mutate()}
            disabled={!prompt.trim() || generate.isPending}
            style={{ background: GOLD, color: NAVY, fontWeight: 700, width: "100%" }}
          >
            {generate.isPending ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RefreshCw size={14} className="animate-spin" /> Generating (up to 30 seconds)…
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
            <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10 }}>Generated Image</p>
            <img src={result.thumbnailUrl} alt="Generated" style={{ width: "100%", borderRadius: 10, border: `1px solid ${GOLD}44` }} />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <Badge style={{ background: "#fef08a22", color: "#fef08a", border: "1px solid #fef08a44", fontSize: 11 }}>
                <Clock size={10} style={{ marginRight: 4 }} /> Pending Approval
              </Badge>
            </div>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 10 }}>
              Saved to your content library. A staff member must approve it before it can be published.
            </p>
            <Button data-testid="generate-another-btn" variant="outline" onClick={() => { setResult(null); setPrompt(""); }} style={{ marginTop: 12, borderColor: BORDER, color: "#94a3b8", fontSize: 13 }}>
              Generate Another
            </Button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, background: "#0d1626", border: `1px solid #1e293b`, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertCircle size={14} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ color: "#64748b", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          AI content policy: Do not request fake case results, fake testimonials, guaranteed legal outcomes, or content referencing specific clients or cases.
          Generated images are not used for model training.
        </p>
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
  if (tab === "photo_upload" || tab === "ai_image") params.set("type", tab);
  if (tab === "approved") params.set("approvalStatus", "approved");
  if (tab === "pending") params.set("approvalStatus", "pending");

  const { data: items = [], isLoading, refetch } = useQuery<ContentItem[]>({
    queryKey: [API("/content"), tab],
    queryFn: async () => {
      const res = await fetch(`${API("/content")}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load content");
      return res.json();
    },
  });

  const approve = useMutation({
    mutationFn: (id: number) => apiRequest("POST", API(`/content/${id}/approve`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/content")] }); toast({ title: "Approved" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", API(`/content/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/content")] }); toast({ title: "Archived" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const downloadUrl = async (id: number) => {
    try {
      const res = await fetch(API(`/content/${id}/url`), { credentials: "include" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch { toast({ title: "Download error", variant: "destructive" }); }
  };

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "photo_upload", label: "Photos" },
    { id: "ai_image", label: "AI Images" },
    { id: "approved", label: "Approved" },
    { id: "pending", label: "Pending" },
  ];

  const typeLabel = (t: string) => ({ photo_upload: "Photo", ai_image: "AI Image", ai_video: "AI Video" }[t] ?? t);
  const statusIcon = (s: string) => s === "approved"
    ? <CheckCircle size={13} color="#4ade80" />
    : s === "rejected" ? <AlertCircle size={13} color="#f87171" />
    : <Clock size={13} color={GOLD} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button data-testid="library-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Content Library</h2>
        <button data-testid="library-refresh-btn" onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", marginLeft: "auto" }}>
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            data-testid={`library-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? GOLD : "#64748b",
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 14,
              padding: "10px 16px",
              borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Loading content…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
          <Image size={40} color="#334155" style={{ margin: "0 auto 16px" }} />
          <p style={{ fontWeight: 600, color: "#64748b" }}>No content yet</p>
          <p style={{ fontSize: 13 }}>Upload a photo or generate an AI image to get started.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {items.map(item => (
            <div key={item.id} data-testid={`content-card-${item.id}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ aspectRatio: "1", background: "#0d1626", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title ?? "Content"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Image size={32} color="#334155" />
                )}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <Badge style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", fontSize: 10 }}>
                    {typeLabel(item.content_type)}
                  </Badge>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                    {statusIcon(item.approval_status)} {item.approval_status}
                  </span>
                </div>
                {item.title && <p style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0", margin: "4px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>}
                {item.caption && <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.caption}</p>}
                <p style={{ fontSize: 11, color: "#475569", margin: "0 0 10px 0" }}>
                  {new Date(item.created_at).toLocaleDateString()}
                  {item.platform_format && ` · ${item.platform_format}`}
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    data-testid={`download-btn-${item.id}`}
                    onClick={() => downloadUrl(item.id)}
                    title="Download"
                    style={{ flex: 1, background: "#0d1626", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11 }}
                  >
                    <Download size={12} /> Download
                  </button>
                  {(session.role === "staff" || session.role === "admin") && item.approval_status === "pending" && (
                    <button
                      data-testid={`approve-btn-${item.id}`}
                      onClick={() => approve.mutate(item.id)}
                      title="Approve"
                      style={{ background: "#064e3b", border: "1px solid #065f46", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#4ade80", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                  )}
                  <button
                    data-testid={`archive-btn-${item.id}`}
                    onClick={() => archive.mutate(item.id)}
                    title="Archive"
                    style={{ background: "#1e293b", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Trash2 size={12} />
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

// ── Main exported page ─────────────────────────────────────────────────────
export default function NxtgenLawGroupStudio() {
  const [view, setView] = useState<View>("login-email");
  const [pendingEmail, setPendingEmail] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config } = useQuery<StudioConfig>({
    queryKey: [API("/config")],
    queryFn: async () => {
      const res = await fetch(API("/config"));
      if (!res.ok) throw new Error("Studio not found");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: session, isLoading: sessionLoading } = useQuery<StudioSession>({
    queryKey: [API("/auth/session")],
    queryFn: async () => {
      const res = await fetch(API("/auth/session"), { credentials: "include" });
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const logout = useMutation({
    mutationFn: () => apiRequest("POST", API("/auth/logout"), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API("/auth/session")] });
      setView("login-email");
      toast({ title: "Signed out" });
    },
  });

  // Auto-redirect if session is active
  if (!sessionLoading && session?.authenticated && (view === "login-email" || view === "login-code")) {
    setView("dashboard");
  }

  if (sessionLoading) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13 }}>Loading studio…</p>
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    if (view === "login-code") {
      return (
        <LoginCodeView
          email={pendingEmail}
          config={config}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: [API("/auth/session")] });
            setView("dashboard");
          }}
          onBack={() => setView("login-email")}
        />
      );
    }
    return <LoginEmailView config={config} onCodeSent={email => { setPendingEmail(email); setView("login-code"); }} />;
  }

  const handleLogout = () => logout.mutate();

  return (
    <StudioShell session={session} onLogout={handleLogout} onNavigate={setView}>
      {view === "dashboard" && <DashboardView config={config} session={session} onNavigate={setView} />}
      {view === "upload" && <UploadView onBack={() => setView("dashboard")} />}
      {view === "generate" && <GenerateView onBack={() => setView("dashboard")} />}
      {view === "library" && <LibraryView session={session} onBack={() => setView("dashboard")} />}
    </StudioShell>
  );
}
