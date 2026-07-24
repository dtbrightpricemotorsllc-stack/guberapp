import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, Sparkles, Image, LogOut, ArrowLeft,
  CheckCircle, Download, Trash2,
  Video, RefreshCw, ShieldCheck, Users, Plus, X,
  Clapperboard, ChevronRight, Library,
} from "lucide-react";

const STUDIO_ID = "nxtgenlawgroup";
const API = (path: string) => `/api/bs/${STUDIO_ID}${path}`;

type View = "login-email" | "login-code" | "dashboard" | "library" | "upload" | "generate" | "generate-video" | "team";
type LibraryTab = "all" | "photo_upload" | "ai_image" | "ai_video";

interface StudioSession { authenticated: boolean; email?: string; role?: string; fullName?: string; }
interface StudioConfig { name: string; tagline: string; logo_url?: string; primary_color: string; accent_color: string; welcome_message?: string; }
interface ContentItem {
  id: number; content_type: string; status: string; approval_status: string;
  title?: string; caption?: string; thumbnail_url?: string; prompt?: string;
  platform_format?: string; created_at: string; owner_email: string;
}
interface TeamMember { email: string; role: string; full_name?: string; is_active: boolean; created_at: string; }

// Premium dark palette
const GOLD = "#c9a84c";
const BG = "#111111";
const CARD = "#1c1c1e";
const CARD2 = "#242426";
const BORDER = "#2c2c2e";
const SURFACE = "#0a0a0a";
const TEXT = "#ffffff";
const TEXT2 = "#8e8e93";
const TEXT3 = "#48484a";

// ── Shell ───────────────────────────────────────────────────────────────────
function StudioShell({ children, session, onLogout, onNavigate }: {
  children: React.ReactNode;
  session?: StudioSession;
  onLogout?: () => void;
  onNavigate?: (v: View) => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>
      {session?.authenticated && (
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: `${BG}ee`, backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <button
            data-testid="studio-logo-home"
            onClick={() => onNavigate?.("dashboard")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <img src="/nxtgen-law-logo.png" alt="NXTGEN Law" style={{ height: 28, objectFit: "contain", display: "block" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {session.role === "admin" && (
              <button
                data-testid="studio-team-btn"
                onClick={() => onNavigate?.("team")}
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "5px 12px", cursor: "pointer", color: TEXT2, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
              >
                <Users size={12} /> Team
              </button>
            )}
            <button
              data-testid="studio-logout"
              onClick={onLogout}
              title="Sign out"
              style={{ width: 34, height: 34, borderRadius: "50%", background: CARD, border: `1px solid ${BORDER}`, cursor: "pointer", color: TEXT3, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>
      )}
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 80px" }}>
        {children}
      </main>
    </div>
  );
}

// ── Login: email ────────────────────────────────────────────────────────────
function LoginEmailView({ config, onCodeSent }: { config?: StudioConfig; onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const requestCode = useMutation({
    mutationFn: (email: string) => apiRequest("POST", API("/auth/request-code"), { email }),
    onSuccess: () => {
      toast({ title: "Code sent", description: "Check your email for the 6-digit access code." });
      onCodeSent(email.trim().toLowerCase());
    },
    onError: (err: any) => toast({ title: "Error", description: err.message || "Could not send code.", variant: "destructive" }),
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {config?.logo_url && (
          <img src={config.logo_url} alt="Studio logo" style={{ height: 52, objectFit: "contain", display: "block", margin: "0 auto 36px" }} />
        )}

        <div style={{ background: CARD, borderRadius: 22, padding: "32px 28px", border: `1px solid ${BORDER}` }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${GOLD}15`, border: `1px solid ${GOLD}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <ShieldCheck size={22} color={GOLD} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: "0 0 6px 0" }}>Private Studio</h2>
          <p style={{ color: TEXT2, fontSize: 13, marginBottom: 28, lineHeight: 1.5 }}>
            Enter your email to receive a one-time access code.
          </p>
          <Input
            data-testid="studio-email-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && email && requestCode.mutate(email)}
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 48, fontSize: 15, marginBottom: 12 }}
          />
          <Button
            data-testid="studio-request-code-btn"
            onClick={() => requestCode.mutate(email)}
            disabled={!email || requestCode.isPending}
            style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 48, fontSize: 15 }}
          >
            {requestCode.isPending ? "Sending…" : "Get Access Code"}
          </Button>
        </div>
        <p style={{ color: TEXT3, fontSize: 11, marginTop: 20 }}>NXTGEN Law Group · Powered by GUBER Global</p>
      </div>
    </div>
  );
}

// ── Login: OTP ──────────────────────────────────────────────────────────────
function LoginCodeView({ email, config, onSuccess, onBack }: { email: string; config?: StudioConfig; onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const verifyCode = useMutation({
    mutationFn: (code: string) => apiRequest("POST", API("/auth/verify-code"), { email, code }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); onSuccess(); },
    onError: (err: any) => toast({ title: "Invalid code", description: err.message || "Check the code and try again.", variant: "destructive" }),
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {config?.logo_url && <img src={config.logo_url} alt="logo" style={{ height: 44, objectFit: "contain", display: "block", margin: "0 auto 32px" }} />}
        <div style={{ background: CARD, borderRadius: 22, padding: "32px 28px", border: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT2, fontSize: 13, marginBottom: 4 }}>Code sent to</p>
          <p style={{ color: TEXT, fontWeight: 600, marginBottom: 28, fontSize: 15 }}>{email}</p>
          <Input
            data-testid="studio-otp-input"
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => e.key === "Enter" && code.length === 6 && verifyCode.mutate(code)}
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: GOLD, fontSize: 32, letterSpacing: 16, textAlign: "center", borderRadius: 12, height: 68, marginBottom: 14 }}
          />
          <Button
            data-testid="studio-verify-code-btn"
            onClick={() => verifyCode.mutate(code)}
            disabled={code.length !== 6 || verifyCode.isPending}
            style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 48, fontSize: 15, marginBottom: 14 }}
          >
            {verifyCode.isPending ? "Verifying…" : "Sign In"}
          </Button>
          <button data-testid="studio-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, fontSize: 13 }}>
            ← Different email
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────
function DashboardView({ config, session, onNavigate }: { config?: StudioConfig; session: StudioSession; onNavigate: (v: View) => void }) {
  const { data: recent = [] } = useQuery<ContentItem[]>({
    queryKey: [API("/content"), "recent"],
    queryFn: async () => {
      const res = await fetch(`${API("/content")}?limit=6`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const tools = [
    { icon: <Sparkles size={28} color={GOLD} />, label: "AI Image", sub: "Generate", view: "generate" as View, accent: "#1a140a" },
    { icon: <Video size={28} color="#a78bfa" />, label: "AI Video", sub: "Generate", view: "generate-video" as View, accent: "#13101a" },
    { icon: <Upload size={28} color="#60a5fa" />, label: "Upload", sub: "Add photo", view: "upload" as View, accent: "#0a1018" },
  ];

  return (
    <div>
      {/* Hero banner */}
      <div style={{ position: "relative", height: 220, overflow: "hidden", marginBottom: 24 }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, #1a1000 0%, #0d0d0d 40%, #0a0a14 70%, #0d0014 100%)",
        }} />
        {/* Cinematic grid lines */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 39px, #ffffff04 39px, #ffffff04 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, #ffffff04 39px, #ffffff04 40px)" }} />
        {/* Gold glow orb */}
        <div style={{ position: "absolute", top: -60, right: -40, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${GOLD}18 0%, transparent 70%)` }} />
        <div style={{ position: "absolute", bottom: -40, left: -20, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, #6d28d918 0%, transparent 70%)" }} />
        {/* Content */}
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 24px 24px" }}>
          <span style={{ fontSize: 10, color: `${GOLD}cc`, letterSpacing: "3px", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, display: "block" }}>
            NXTGEN LAW GROUP
          </span>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: TEXT, margin: "0 0 6px 0", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            Content Studio
          </h1>
          <p style={{ color: TEXT2, fontSize: 13, margin: 0 }}>
            {session.fullName ? `Welcome back, ${session.fullName.split(" ")[0]}.` : "Create. Generate. Download."}
          </p>
        </div>
      </div>

      {/* Tool cards — Kling-style square buttons */}
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
          {tools.map((t, i) => (
            <button
              key={i}
              data-testid={`studio-tool-${t.view}`}
              onClick={() => onNavigate(t.view)}
              style={{
                background: t.accent,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: "18px 10px 16px",
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                transition: "transform 0.1s, border-color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; (e.currentTarget as HTMLElement).style.borderColor = GOLD; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: CARD, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {t.icon}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: TEXT2 }}>{t.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Library section */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>My Library</span>
          <button onClick={() => onNavigate("library")} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT2, display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            See all <ChevronRight size={14} />
          </button>
        </div>

        {recent.length === 0 ? (
          <div style={{ background: CARD, borderRadius: 16, padding: "36px 20px", textAlign: "center", border: `1px solid ${BORDER}` }}>
            <Library size={28} color={TEXT3} style={{ margin: "0 auto 10px" }} />
            <p style={{ color: TEXT2, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Nothing yet</p>
            <p style={{ color: TEXT3, fontSize: 13 }}>Generate an image or video to get started.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {recent.slice(0, 6).map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate("library")}
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", aspectRatio: "1", cursor: "pointer", position: "relative", padding: 0 }}
              >
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.content_type === "ai_video" ? <Video size={20} color={TEXT3} /> : <Image size={20} color={TEXT3} />}
                  </div>
                )}
                {item.content_type === "ai_video" && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${GOLD}aa`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: `8px solid ${GOLD}`, marginLeft: 2 }} />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Back button ─────────────────────────────────────────────────────────────
function BackBtn({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button data-testid="back-btn" onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: GOLD, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 14, fontWeight: 600, padding: "20px 20px 0" }}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
}

// ── Padded content wrapper ──────────────────────────────────────────────────
function Padded({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "0 20px" }}>{children}</div>;
}

// ── Photo Upload ────────────────────────────────────────────────────────────
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
      toast({ title: "Uploaded ✓", description: "Saved to your library." });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      setPreview(null); setFile(null); setTitle(""); setCaption("");
      onBack();
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <BackBtn onClick={onBack} />
      <Padded>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Upload a Photo</h2>
        <p style={{ color: TEXT2, fontSize: 13, marginBottom: 24 }}>Add photos to your private content library.</p>

        {preview ? (
          <div style={{ marginBottom: 20 }}>
            <img src={preview} alt="Preview" style={{ width: "100%", borderRadius: 16, objectFit: "cover", maxHeight: 340, display: "block" }} />
            <button onClick={() => { setPreview(null); setFile(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, fontSize: 12, marginTop: 8 }}>
              ✕ Remove
            </button>
          </div>
        ) : (
          <div
            data-testid="upload-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{ border: `2px dashed ${BORDER}`, borderRadius: 16, padding: "52px 32px", textAlign: "center", cursor: "pointer", marginBottom: 20, background: CARD }}
          >
            <Upload size={32} color={TEXT3} style={{ margin: "0 auto 12px" }} />
            <p style={{ color: TEXT2, fontWeight: 600, marginBottom: 4, fontSize: 15 }}>Drop or tap to choose</p>
            <p style={{ color: TEXT3, fontSize: 12 }}>JPG, PNG, WebP — max 10 MB</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} data-testid="upload-file-input" />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <Input data-testid="upload-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 48 }} />
          <Textarea data-testid="upload-caption-input" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional)" rows={2} style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12 }} />
          <select data-testid="upload-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <option>Instagram (1:1)</option>
            <option>Instagram Story (9:16)</option>
            <option>LinkedIn (1.91:1)</option>
            <option>Facebook Cover (16:9)</option>
            <option>Twitter/X (16:9)</option>
            <option>General / Website</option>
          </select>
        </div>

        <Button data-testid="upload-submit-btn" onClick={() => upload.mutate()} disabled={!file || upload.isPending} style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 52, fontSize: 16 }}>
          {upload.isPending ? "Uploading…" : "Upload Photo"}
        </Button>
      </Padded>
    </div>
  );
}

// ── AI Image Generation ─────────────────────────────────────────────────────
function GenerateView({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("Instagram (1:1)");
  const [result, setResult] = useState<{ id: number; previewUrl: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => apiRequest("POST", API("/generate"), { prompt, title, platformFormat: platform }),
    onSuccess: (data: any) => {
      setResult({ id: data.id, previewUrl: data.previewUrl || data.thumbnailUrl });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Image created ✓" });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" }),
  });

  const EXAMPLES = [
    { label: "Attorney Team", text: "A professional team of diverse attorneys in a modern law office with city skyline view, dark blue and gold tones" },
    { label: "Justice Symbol", text: "Abstract scales of justice with modern geometric design, dark blue and gold color scheme, premium aesthetic" },
    { label: "Conference Room", text: "Elegant law firm conference room, polished mahogany table, city view through floor-to-ceiling windows, cinematic lighting" },
    { label: "Legal Handshake", text: "Professional handshake in a modern office setting, trust and partnership concept, soft focus background" },
  ];

  return (
    <div>
      <BackBtn onClick={onBack} label="AI Image" />
      <Padded>
        {result && (
          <div style={{ marginBottom: 24 }}>
            <img
              src={result.previewUrl}
              alt="Generated"
              style={{ width: "100%", borderRadius: 18, display: "block", boxShadow: `0 0 40px ${GOLD}22` }}
            />
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle size={15} color="#4ade80" />
              <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 600 }}>Saved to your library</span>
              <button
                data-testid="generate-another-btn"
                onClick={() => { setResult(null); setPrompt(""); }}
                style={{ marginLeft: "auto", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", color: TEXT2, fontSize: 13 }}
              >
                New image
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input data-testid="generate-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 48 }} />
          <Textarea
            data-testid="generate-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image in detail — setting, mood, colors, style…"
            rows={4}
            style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12 }}
          />
          <select data-testid="generate-platform-select" value={platform} onChange={e => setPlatform(e.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <option>Instagram (1:1)</option>
            <option>Instagram Story (9:16)</option>
            <option>LinkedIn (1.91:1)</option>
            <option>Facebook Cover (16:9)</option>
            <option>Twitter/X (16:9)</option>
            <option>YouTube Thumbnail (16:9)</option>
          </select>
        </div>

        <p style={{ color: TEXT3, fontSize: 12, fontWeight: 600, margin: "20px 0 10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Inspiration</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex.text)} data-testid={`example-prompt-${i}`}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left", lineHeight: 1.4 }}>
              <span style={{ color: GOLD, fontWeight: 700, fontSize: 11, display: "block", marginBottom: 3 }}>{ex.label}</span>
              <span style={{ color: TEXT2, fontSize: 11 }}>{ex.text.slice(0, 55)}…</span>
            </button>
          ))}
        </div>

        <Button
          data-testid="generate-submit-btn"
          onClick={() => generate.mutate()}
          disabled={!prompt.trim() || generate.isPending}
          style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 52, fontSize: 16 }}
        >
          {generate.isPending ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={15} className="animate-spin" /> Generating… (up to 30s)
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={15} /> {result ? "Generate New Image" : "Generate Image"}
            </span>
          )}
        </Button>
      </Padded>
    </div>
  );
}

// ── AI Video Generation ─────────────────────────────────────────────────────
function GenerateVideoView({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [result, setResult] = useState<{ id: number; previewUrl: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => apiRequest("POST", API("/generate-video"), { prompt, title, aspectRatio }),
    onSuccess: (data: any) => {
      setResult({ id: data.id, previewUrl: data.previewUrl || data.thumbnailUrl });
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Video created ✓" });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" }),
  });

  const EXAMPLES = [
    { label: "Office Reveal", text: "Sleek law firm office, camera slowly panning across modern furniture, city skyline in background, professional lighting" },
    { label: "Attorney Walk", text: "Confident attorney walking through a glass-walled corridor of a high-rise office building, purposeful stride" },
    { label: "Justice Symbol", text: "Golden scales of justice rotating slowly in a dark elegant setting, dramatic lighting, cinematic camera move" },
    { label: "Team Meeting", text: "Legal team around a conference table, aerial shot slowly zooming out, professional corporate atmosphere" },
  ];

  const ratios = [["16:9", "Landscape", "🖥"], ["9:16", "Vertical", "📱"], ["1:1", "Square", "⬜"]] as const;

  return (
    <div>
      <BackBtn onClick={onBack} label="AI Video" />
      <Padded>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>AI Video</h2>
          <span style={{ fontSize: 10, color: GOLD, fontWeight: 700, background: `${GOLD}18`, border: `1px solid ${GOLD}33`, borderRadius: 10, padding: "3px 8px", letterSpacing: "0.5px" }}>5 SEC</span>
        </div>
        <p style={{ color: TEXT2, fontSize: 13, marginBottom: 24 }}>Cinematic marketing video. Takes 2–3 minutes.</p>

        {result && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: `0 0 40px ${"#a78bfa"}22` }}>
              <div style={{ position: "relative", paddingBottom: aspectRatio === "9:16" ? "177%" : aspectRatio === "1:1" ? "100%" : "56.25%" }}>
                <video src={result.previewUrl} autoPlay loop muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle size={15} color="#4ade80" />
              <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 600 }}>Saved to your library</span>
              <button onClick={() => { setResult(null); setPrompt(""); }} style={{ marginLeft: "auto", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", color: TEXT2, fontSize: 13 }}>
                New video
              </button>
            </div>
          </div>
        )}

        {/* Aspect ratio */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {ratios.map(([ratio, label, icon]) => (
            <button
              key={ratio}
              onClick={() => setAspectRatio(ratio)}
              style={{
                flex: 1, background: aspectRatio === ratio ? `${GOLD}18` : CARD,
                border: `1px solid ${aspectRatio === ratio ? GOLD : BORDER}`,
                borderRadius: 12, padding: "12px 8px", cursor: "pointer",
                color: aspectRatio === ratio ? GOLD : TEXT2, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>{ratio}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input data-testid="video-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 48 }} />
          <Textarea
            data-testid="video-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the scene, camera movement, mood, setting…"
            rows={4}
            style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12 }}
          />
        </div>

        <p style={{ color: TEXT3, fontSize: 12, fontWeight: 600, margin: "20px 0 10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Scene Ideas</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex.text)} data-testid={`video-example-${i}`}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 11, display: "block", marginBottom: 3 }}>{ex.label}</span>
              <span style={{ color: TEXT2, fontSize: 11, lineHeight: 1.4 }}>{ex.text.slice(0, 55)}…</span>
            </button>
          ))}
        </div>

        <Button
          data-testid="video-submit-btn"
          onClick={() => generate.mutate()}
          disabled={!prompt.trim() || generate.isPending}
          style={{ width: "100%", background: "#7c3aed", color: "#fff", fontWeight: 700, borderRadius: 12, height: 52, fontSize: 16 }}
        >
          {generate.isPending ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={15} className="animate-spin" /> Generating… (2–3 min)
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clapperboard size={15} /> {result ? "Generate New Video" : "Generate Video"}
            </span>
          )}
        </Button>
      </Padded>
    </div>
  );
}

// ── Content Library ─────────────────────────────────────────────────────────
function LibraryView({ session, onBack }: { session: StudioSession; onBack: () => void }) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = new URLSearchParams();
  if (tab === "photo_upload" || tab === "ai_image" || tab === "ai_video") params.set("type", tab);

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
  });

  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", API(`/content/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/content")] }); toast({ title: "Removed" }); },
  });

  const download = async (id: number, type: string) => {
    try {
      const res = await fetch(API(`/content/${id}/url`), { credentials: "include" });
      const data = await res.json();
      if (!data.url) throw new Error("No URL");
      const a = document.createElement("a");
      a.href = data.url; a.target = "_blank";
      a.download = `nxtgen-${type}-${id}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { toast({ title: "Download error", variant: "destructive" }); }
  };

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ai_image", label: "Images" },
    { id: "ai_video", label: "Videos" },
    { id: "photo_upload", label: "Uploads" },
  ];

  const typeLabel = (t: string) => ({ photo_upload: "Photo", ai_image: "Image", ai_video: "Video" }[t] ?? t);

  return (
    <div>
      <BackBtn onClick={onBack} label="Library" />
      <Padded>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>My Library</h2>
          <button data-testid="library-refresh-btn" onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3 }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto" }}>
          {tabs.map(t => (
            <button
              key={t.id}
              data-testid={`library-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? GOLD : CARD,
                border: `1px solid ${tab === t.id ? GOLD : BORDER}`,
                color: tab === t.id ? "#000" : TEXT2,
                borderRadius: 20, padding: "6px 16px", cursor: "pointer",
                fontSize: 13, fontWeight: tab === t.id ? 700 : 400, whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <RefreshCw size={22} color={TEXT3} className="animate-spin" style={{ margin: "0 auto" }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: CARD, borderRadius: 18, border: `1px solid ${BORDER}` }}>
            <Image size={36} color={TEXT3} style={{ margin: "0 auto 12px" }} />
            <p style={{ fontWeight: 600, color: TEXT2, marginBottom: 4 }}>No content here yet</p>
            <p style={{ fontSize: 13, color: TEXT3 }}>Generate or upload to get started.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {items.map(item => (
              <div key={item.id} data-testid={`content-card-${item.id}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                {/* Thumbnail */}
                <div style={{ position: "relative", aspectRatio: "1", background: SURFACE, overflow: "hidden" }}>
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt={item.title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                      {item.content_type === "ai_video" ? <Video size={28} color={TEXT3} /> : <Image size={28} color={TEXT3} />}
                    </div>
                  )}
                  {/* Video play icon overlay */}
                  {item.content_type === "ai_video" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${GOLD}bb`, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
                        <div style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: `12px solid ${GOLD}`, marginLeft: 3 }} />
                      </div>
                    </div>
                  )}
                  {/* Type badge */}
                  <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 7px" }}>
                    <span style={{ fontSize: 10, color: TEXT, fontWeight: 600 }}>{typeLabel(item.content_type)}</span>
                  </div>
                  {/* Staff approve button (only shown for staff/admin on pending items) */}
                  {(session.role === "staff" || session.role === "admin") && item.approval_status === "pending" && (
                    <button
                      data-testid={`approve-btn-${item.id}`}
                      onClick={() => approve.mutate(item.id)}
                      style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", border: "1px solid #4ade8066", borderRadius: 6, padding: "3px 7px", cursor: "pointer", color: "#4ade80", fontSize: 10, fontWeight: 700 }}
                    >
                      ✓ OK
                    </button>
                  )}
                </div>
                {/* Info row */}
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    {item.title && <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>}
                    <p style={{ fontSize: 11, color: TEXT3, margin: 0 }}>{new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      data-testid={`download-btn-${item.id}`}
                      onClick={() => download(item.id, item.content_type)}
                      style={{ width: 32, height: 32, background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: 8, cursor: "pointer", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Download"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      data-testid={`archive-btn-${item.id}`}
                      onClick={() => archive.mutate(item.id)}
                      style={{ width: 32, height: 32, background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", color: TEXT3, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Padded>
    </div>
  );
}

// ── Team Management ─────────────────────────────────────────────────────────
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

  const roleColor = (r: string) => r === "admin" ? GOLD : r === "staff" ? "#60a5fa" : TEXT2;

  return (
    <div>
      <BackBtn onClick={onBack} label="Studio Team" />
      <Padded>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Team</h2>
        <p style={{ color: TEXT2, fontSize: 13, marginBottom: 24 }}>Manage who can access this studio.</p>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 16px", marginBottom: 20 }}>
          <p style={{ color: TEXT2, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12, margin: "0 0 12px 0" }}>Add member</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input data-testid="team-email-input" type="email" placeholder="email@address.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 10, height: 44 }} />
            <Input data-testid="team-name-input" placeholder="Full Name (optional)" value={newName} onChange={e => setNewName(e.target.value)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 10, height: 44 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <select data-testid="team-role-select" value={newRole} onChange={e => setNewRole(e.target.value)} style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
                <option value="client">Client</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <Button data-testid="team-add-btn" onClick={() => addMember.mutate()} disabled={!newEmail || addMember.isPending} style={{ background: GOLD, color: "#000", fontWeight: 700, borderRadius: 10, paddingInline: 20 }}>
                <Plus size={15} />
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: TEXT3 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.filter(m => m.is_active).map(m => (
              <div key={m.email} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${roleColor(m.role)}18`, border: `1px solid ${roleColor(m.role)}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: roleColor(m.role), fontWeight: 700, flexShrink: 0 }}>
                  {(m.email[0] ?? "?").toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: TEXT, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name || m.email}</p>
                  {m.full_name && <p style={{ fontSize: 11, color: TEXT3, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</p>}
                </div>
                <span style={{ fontSize: 10, color: roleColor(m.role), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>{m.role}</span>
                {m.email !== session.email && (
                  <button data-testid={`remove-member-${m.email}`} onClick={() => removeMember.mutate(m.email)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, padding: 4, flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Padded>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
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
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
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
