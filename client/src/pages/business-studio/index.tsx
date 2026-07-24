import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, Sparkles, Image, LogOut, ArrowLeft,
  CheckCircle, Download, Trash2, Video, RefreshCw,
  ShieldCheck, Users, Plus, X, ChevronRight,
  Library, ImagePlus, Save,
} from "lucide-react";

const STUDIO_ID = "nxtgenlawgroup";
const API = (path: string) => `/api/bs/${STUDIO_ID}${path}`;

type View = "login-email" | "login-code" | "dashboard" | "library" | "create" | "team";
type CreateMode = "image" | "video";
type LibraryTab = "all" | "photo_upload" | "ai_image" | "ai_video";

interface StudioSession { authenticated: boolean; email?: string; role?: string; fullName?: string; }
interface StudioConfig { name: string; tagline: string; logo_url?: string; primary_color: string; accent_color: string; welcome_message?: string; }
interface ContentItem {
  id: number; content_type: string; status: string; approval_status: string;
  title?: string; thumbnail_url?: string; prompt?: string;
  platform_format?: string; created_at: string; owner_email: string;
}
interface TeamMember { email: string; role: string; full_name?: string; is_active: boolean; created_at: string; }

const GOLD = "#c9a84c";
const BG = "#111111";
const CARD = "#1c1c1e";
const CARD2 = "#242426";
const BORDER = "#2c2c2e";
const SURFACE = "#0a0a0a";
const TEXT = "#ffffff";
const TEXT2 = "#8e8e93";
const TEXT3 = "#48484a";

// ── Shell ────────────────────────────────────────────────────────────────────
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
          <button data-testid="studio-logo-home" onClick={() => onNavigate?.("dashboard")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <img src="/nxtgen-law-logo.png" alt="NXTGEN Law" style={{ height: 28, objectFit: "contain", display: "block" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {session.role === "admin" && (
              <button data-testid="studio-team-btn" onClick={() => onNavigate?.("team")} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "5px 12px", cursor: "pointer", color: TEXT2, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <Users size={12} /> Team
              </button>
            )}
            <button data-testid="studio-logout" onClick={onLogout} title="Sign out" style={{ width: 34, height: 34, borderRadius: "50%", background: CARD, border: `1px solid ${BORDER}`, cursor: "pointer", color: TEXT3, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

// ── Login: email ─────────────────────────────────────────────────────────────
function LoginEmailView({ config, onCodeSent }: { config?: StudioConfig; onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  const requestCode = useMutation({
    mutationFn: (e: string) => apiRequest("POST", API("/auth/request-code"), { email: e }),
    onSuccess: () => { toast({ title: "Code sent", description: "Check your email." }); onCodeSent(email.trim().toLowerCase()); },
    onError: (err: any) => toast({ title: "Error", description: err.message || "Could not send code.", variant: "destructive" }),
  });
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {config?.logo_url && <img src={config.logo_url} alt="" style={{ height: 52, objectFit: "contain", display: "block", margin: "0 auto 36px" }} />}
        <div style={{ background: CARD, borderRadius: 22, padding: "32px 28px", border: `1px solid ${BORDER}` }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${GOLD}15`, border: `1px solid ${GOLD}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <ShieldCheck size={22} color={GOLD} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: "0 0 6px 0" }}>Private Studio</h2>
          <p style={{ color: TEXT2, fontSize: 13, marginBottom: 28, lineHeight: 1.5 }}>Enter your email to receive a one-time access code.</p>
          <Input data-testid="studio-email-input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && email && requestCode.mutate(email)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 48, fontSize: 15, marginBottom: 12 }} />
          <Button data-testid="studio-request-code-btn" onClick={() => requestCode.mutate(email)} disabled={!email || requestCode.isPending} style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 48, fontSize: 15 }}>
            {requestCode.isPending ? "Sending…" : "Get Access Code"}
          </Button>
        </div>
        <p style={{ color: TEXT3, fontSize: 11, marginTop: 20 }}>NXTGEN Law Group · Powered by GUBER Global</p>
      </div>
    </div>
  );
}

// ── Login: OTP ───────────────────────────────────────────────────────────────
function LoginCodeView({ email, config, onSuccess, onBack }: { email: string; config?: StudioConfig; onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const verifyCode = useMutation({
    mutationFn: (c: string) => apiRequest("POST", API("/auth/verify-code"), { email, code: c }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); onSuccess(); },
    onError: (err: any) => toast({ title: "Invalid code", description: err.message || "Check and try again.", variant: "destructive" }),
  });
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {config?.logo_url && <img src={config.logo_url} alt="" style={{ height: 44, objectFit: "contain", display: "block", margin: "0 auto 32px" }} />}
        <div style={{ background: CARD, borderRadius: 22, padding: "32px 28px", border: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT2, fontSize: 13, marginBottom: 4 }}>Code sent to</p>
          <p style={{ color: TEXT, fontWeight: 600, marginBottom: 28, fontSize: 15 }}>{email}</p>
          <Input data-testid="studio-otp-input" type="text" inputMode="numeric" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && code.length === 6 && verifyCode.mutate(code)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: GOLD, fontSize: 32, letterSpacing: 16, textAlign: "center", borderRadius: 12, height: 68, marginBottom: 14 }} />
          <Button data-testid="studio-verify-code-btn" onClick={() => verifyCode.mutate(code)} disabled={code.length !== 6 || verifyCode.isPending} style={{ width: "100%", background: GOLD, color: "#000", fontWeight: 700, borderRadius: 12, height: 48, fontSize: 15, marginBottom: 14 }}>
            {verifyCode.isPending ? "Verifying…" : "Sign In"}
          </Button>
          <button data-testid="studio-back-btn" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, fontSize: 13 }}>← Different email</button>
        </div>
      </div>
    </div>
  );
}

// ── Law templates ────────────────────────────────────────────────────────────
const LAW_TEMPLATES = [
  { label: "Scales of Justice", emoji: "⚖️", gradient: "linear-gradient(135deg,#1a1200,#0d0a00)", border: "#3d2e00", prompt: "Dramatic cinematic close-up of golden scales of justice on a polished mahogany desk, dark moody background with god rays of light, law firm premium aesthetic" },
  { label: "Grand Courtroom", emoji: "🏛", gradient: "linear-gradient(135deg,#0d1020,#070812)", border: "#1a2040", prompt: "Grand empty American courtroom with wooden pews, judge's bench, American flag, warm golden sunlight streaming through tall arched windows, cinematic wide angle" },
  { label: "Law Library", emoji: "📚", gradient: "linear-gradient(135deg,#100a00,#0a0600)", border: "#2a1800", prompt: "Elegant floor-to-ceiling law library with rows of leather-bound law books, rolling wooden ladder, warm amber lighting, rich mahogany shelving, premium luxury atmosphere" },
  { label: "Attorney Portrait", emoji: "👔", gradient: "linear-gradient(135deg,#0a0d14,#060810)", border: "#1a2030", prompt: "Professional attorney in a perfectly tailored dark navy suit, confident composed expression, modern glass-walled law office background with city view, dramatic studio lighting" },
  { label: "Justice Gavel", emoji: "🔨", gradient: "linear-gradient(135deg,#140800,#0a0500)", border: "#301500", prompt: "Extreme close-up of a polished dark wood gavel resting on a sound block, pitch black background, single dramatic spotlight from above, cinematic depth of field" },
  { label: "Trust & Partnership", emoji: "🤝", gradient: "linear-gradient(135deg,#001410,#000d0a)", border: "#003025", prompt: "Professional handshake between two people in executive business attire in a modern law office, trust and partnership concept, warm bokeh background" },
  { label: "City Law Office", emoji: "🌆", gradient: "linear-gradient(135deg,#090914,#050510)", border: "#18183a", prompt: "Luxury corner office in a high-rise law firm, floor-to-ceiling panoramic windows overlooking a glittering city skyline at golden hour, leather chairs, dark wood desk" },
  { label: "Legal Document", emoji: "📜", gradient: "linear-gradient(135deg,#0e0e0a,#080808)", border: "#252520", prompt: "Premium legal contract document on a polished glass desk with a luxury gold fountain pen, soft professional bokeh background, warm mood lighting" },
];

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ session, onNavigate, onCreateNavigate, onTemplateSelect }: {
  session: StudioSession;
  onNavigate: (v: View) => void;
  onCreateNavigate: (mode: CreateMode) => void;
  onTemplateSelect: (prompt: string) => void;
}) {
  const { data: recent = [] } = useQuery<ContentItem[]>({
    queryKey: [API("/content"), "recent"],
    queryFn: async () => {
      const res = await fetch(`${API("/content")}?limit=6`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div>
      {/* Hero */}
      <div style={{ position: "relative", height: 200, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1a1000 0%,#0d0d0d 40%,#0a0a14 70%,#0d0014 100%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,#ffffff04 39px,#ffffff04 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#ffffff04 39px,#ffffff04 40px)" }} />
        <div style={{ position: "absolute", top: -60, right: -40, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle,${GOLD}18 0%,transparent 70%)` }} />
        <div style={{ position: "absolute", bottom: -40, left: -20, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,#6d28d918 0%,transparent 70%)" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 24px 24px" }}>
          <span style={{ fontSize: 10, color: `${GOLD}cc`, letterSpacing: "3px", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, display: "block" }}>NXTGEN LAW GROUP</span>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: TEXT, margin: "0 0 6px 0", lineHeight: 1.15, letterSpacing: "-0.5px" }}>Content Studio</h1>
          <p style={{ color: TEXT2, fontSize: 13, margin: 0 }}>{session.fullName ? `Welcome back, ${session.fullName.split(" ")[0]}.` : "Create. Generate. Download."}</p>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Create tools */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
          {([
            { icon: <Sparkles size={30} color={GOLD} />, label: "Create Image", sub: "Text or photo → AI image", accent: "#1a140a", border: "#3a2c0a", mode: "image" as CreateMode },
            { icon: <Video size={30} color="#a78bfa" />, label: "Create Video", sub: "Text or photo → AI video", accent: "#13101a", border: "#28204a", mode: "video" as CreateMode },
          ] as const).map((t, i) => (
            <button key={i} data-testid={`studio-tool-${t.mode}`} onClick={() => onCreateNavigate(t.mode)}
              style={{ background: t.accent, border: `1px solid ${t.border}`, borderRadius: 18, padding: "20px 16px", cursor: "pointer", textAlign: "left", transition: "transform 0.1s, border-color 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, background: CARD, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>{t.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 12, color: TEXT2 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        {/* Templates */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>Templates</span>
            <span style={{ fontSize: 12, color: TEXT3 }}>Tap to generate</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {LAW_TEMPLATES.map((t, i) => (
              <button key={i} data-testid={`template-${i}`} onClick={() => onTemplateSelect(t.prompt)}
                style={{ background: t.gradient, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 13px", cursor: "pointer", textAlign: "left", transition: "transform 0.12s, border-color 0.12s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"; (e.currentTarget as HTMLElement).style.borderColor = GOLD; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.borderColor = t.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 7 }}>{t.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: TEXT2, lineHeight: 1.35 }}>{t.prompt.slice(0, 48)}…</div>
                <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 4, background: `${GOLD}18`, border: `1px solid ${GOLD}33`, borderRadius: 20, padding: "3px 10px" }}>
                  <Sparkles size={9} color={GOLD} />
                  <span style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>Generate</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent library */}
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
              <button key={item.id} onClick={() => onNavigate("library")} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", aspectRatio: "1", cursor: "pointer", position: "relative", padding: 0 }}>
                {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={18} color={TEXT3} /></div>}
                {item.content_type === "ai_video" && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${GOLD}aa`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `7px solid ${GOLD}`, marginLeft: 2 }} />
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

// ── Back button ──────────────────────────────────────────────────────────────
function BackBtn({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button data-testid="back-btn" onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: GOLD, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, padding: "20px 20px 0" }}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
}

// ── Unified Create View ──────────────────────────────────────────────────────
function CreateView({ onBack, initialMode = "image", initialPrompt = "" }: {
  onBack: () => void;
  initialMode?: CreateMode;
  initialPrompt?: string;
}) {
  const [mode, setMode] = useState<CreateMode>(initialMode); // statebleed-allow: result+videoJobId cleared in handleModeChange before setMode
  const [prompt, setPrompt] = useState(initialPrompt);
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ previewUrl: string; contentType: string; saved: boolean } | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollSeconds, setPollSeconds] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
    if (initialMode) setMode(initialMode);
  }, [initialPrompt, initialMode]);

  // Polling loop for async video jobs
  useEffect(() => {
    if (!videoJobId) return;
    setIsPolling(true);
    setPollSeconds(0);
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 5;
      setPollSeconds(elapsed);
      try {
        const res = await fetch(API(`/job/${videoJobId}`), { credentials: "include" });
        const data = await res.json();
        if (data.status === "completed") {
          clearInterval(pollRef.current!);
          setVideoJobId(null);
          setIsPolling(false);
          setResult({ previewUrl: data.previewUrl, contentType: data.contentType, saved: false });
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          setVideoJobId(null);
          setIsPolling(false);
          toast({ title: "Video generation failed", description: data.error || "Please try again.", variant: "destructive" });
        }
        // "pending" → keep polling
      } catch { /* network blip — keep polling */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [videoJobId]);

  const handleModeChange = (m: CreateMode) => {
    setResult(null);
    setVideoJobId(null);
    setIsPolling(false);
    if (pollRef.current) clearInterval(pollRef.current);
    setMode(m);
  };

  const handlePhoto = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) { toast({ title: "Images only", variant: "destructive" }); return; }
    if (f.size > 15 * 1024 * 1024) { toast({ title: "Max 15 MB", variant: "destructive" }); return; }
    setPhoto(f);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, [toast]);

  const clearPhoto = () => { setPhoto(null); setPhotoPreview(null); };

  const generate = useMutation({
    mutationFn: async () => {
      const body: any = { mode, prompt, title: title || undefined, aspectRatio };
      if (photo) {
        const reader = new FileReader();
        body.imageData = await new Promise<string>((resolve, reject) => {
          reader.onload = e => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(photo);
        });
      }
      const res = await fetch(API("/create"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Generation failed");
      return data;
    },
    onSuccess: (data: any) => {
      if (data.polling && data.jobId) {
        // Video: server submitted to queue, client polls for completion
        setResult(null);
        setVideoJobId(data.jobId);
      } else {
        // Image: result ready immediately
        setResult({ previewUrl: data.previewUrl, contentType: data.contentType, saved: false });
      }
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const saveToLibrary = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No result to save");
      return apiRequest("POST", API("/save-to-library"), { previewUrl: result.previewUrl, contentType: result.contentType, title: title || undefined, prompt });
    },
    onSuccess: () => {
      setResult(r => r ? { ...r, saved: true } : null);
      qc.invalidateQueries({ queryKey: [API("/content")] });
      toast({ title: "Saved to library ✓" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.previewUrl;
    a.target = "_blank";
    a.download = `nxtgen-${result.contentType}-${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const ratios = [["16:9", "Landscape", "🖥"], ["9:16", "Vertical", "📱"], ["1:1", "Square", "⬜"]] as const;

  return (
    <div>
      <BackBtn onClick={onBack} label="Create" />
      <div style={{ padding: "0 20px" }}>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: CARD, borderRadius: 14, padding: 4, marginBottom: 24, gap: 4 }}>
          {(["image", "video"] as CreateMode[]).map(m => (
            <button key={m} data-testid={`mode-${m}`} onClick={() => handleModeChange(m)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
              background: mode === m ? (m === "image" ? `${GOLD}22` : "#7c3aed22") : "transparent",
              color: mode === m ? (m === "image" ? GOLD : "#a78bfa") : TEXT3,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
            }}>
              {m === "image" ? <Sparkles size={14} /> : <Video size={14} />}
              {m === "image" ? "AI Image" : "AI Video"}
            </button>
          ))}
        </div>

        {/* Photo upload zone */}
        <div style={{ marginBottom: 16 }}>
          {photoPreview ? (
            <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 0 }}>
              <img src={photoPreview} alt="Source" style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 40%)" }} />
              <div style={{ position: "absolute", top: 10, left: 12, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <ImagePlus size={12} color={GOLD} />
                <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>Source photo — AI will transform this</span>
              </div>
              <button data-testid="clear-photo-btn" onClick={clearPhoto} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: `1px solid ${BORDER}`, cursor: "pointer", color: TEXT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button data-testid="add-photo-btn" onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePhoto(f); }}
              style={{ width: "100%", background: CARD, border: `1px dashed ${BORDER}`, borderRadius: 14, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: CARD2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Upload size={18} color={TEXT3} />
              </div>
              <div>
                <p style={{ color: TEXT2, fontSize: 13, fontWeight: 600, margin: 0 }}>Add a source photo <span style={{ color: TEXT3, fontWeight: 400 }}>(optional)</span></p>
                <p style={{ color: TEXT3, fontSize: 11, margin: "2px 0 0" }}>AI will use it as a base to transform or animate</p>
              </div>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} data-testid="photo-file-input" />
        </div>

        {/* Aspect ratio — video only */}
        {mode === "video" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {ratios.map(([ratio, label, icon]) => (
              <button key={ratio} onClick={() => setAspectRatio(ratio)} style={{ flex: 1, background: aspectRatio === ratio ? "#7c3aed22" : CARD, border: `1px solid ${aspectRatio === ratio ? "#7c3aed" : BORDER}`, borderRadius: 12, padding: "10px 6px", cursor: "pointer", color: aspectRatio === ratio ? "#a78bfa" : TEXT2, textAlign: "center" }}>
                <div style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{ratio}</div>
              </button>
            ))}
          </div>
        )}

        {/* Prompt */}
        <Input data-testid="create-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, height: 46, marginBottom: 10 }} />
        <Textarea
          data-testid="create-prompt-input"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={photoPreview
            ? mode === "image"
              ? "Describe how to transform the photo — e.g. make this person purple, change the background to a courtroom, turn into a painting…"
              : "Describe the video motion — e.g. slow zoom in, camera rotates around subject, atmospheric lighting…"
            : mode === "image"
              ? "Describe the image — setting, style, mood, colors…"
              : "Describe the video scene — camera movement, setting, mood…"}
          rows={4}
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 12, marginBottom: 16, fontSize: 14 }}
        />

        <Button data-testid="create-generate-btn" onClick={() => generate.mutate()}
          disabled={!prompt.trim() || generate.isPending || isPolling}
          style={{ width: "100%", background: mode === "image" ? GOLD : "#7c3aed", color: mode === "image" ? "#000" : "#fff", fontWeight: 700, borderRadius: 12, height: 52, fontSize: 16, marginBottom: (result || isPolling) ? 28 : 0 }}>
          {generate.isPending ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={15} className="animate-spin" />
              {mode === "video" ? "Submitting…" : "Generating image…"}
            </span>
          ) : isPolling ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={15} className="animate-spin" />
              Rendering video… {pollSeconds > 0 ? `${pollSeconds}s` : ""}
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {mode === "image" ? <Sparkles size={15} /> : <Video size={15} />}
              {result ? `Generate Another` : `Generate ${mode === "image" ? "Image" : "Video"}`}
              {photo ? " from Photo" : ""}
            </span>
          )}
        </Button>

        {/* ── Video polling progress ── */}
        {isPolling && !result && (
          <div data-testid="video-polling" style={{ marginTop: 4, background: "#13101a", border: "1px solid #28204a", borderRadius: 18, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: `3px solid #7c3aed44`, borderTopColor: "#a78bfa", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#a78bfa", fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>Creating your video…</p>
            <p style={{ color: TEXT3, fontSize: 12, margin: 0 }}>Kling AI is rendering — usually 2–3 minutes. {pollSeconds > 0 && `(${pollSeconds}s)`}</p>
          </div>
        )}

        {/* ── Result ── */}
        {result && (
          <div data-testid="create-result" style={{ marginTop: 4 }}>
            {/* Media */}
            <div style={{ borderRadius: 18, overflow: "hidden", background: SURFACE, marginBottom: 14, boxShadow: `0 0 40px ${result.contentType === "ai_video" ? "#7c3aed" : GOLD}18` }}>
              {result.contentType === "ai_video" ? (
                <div style={{ position: "relative", paddingBottom: aspectRatio === "9:16" ? "177%" : aspectRatio === "1:1" ? "100%" : "56.25%" }}>
                  <video src={result.previewUrl} autoPlay loop muted playsInline controls style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ) : (
                <img src={result.previewUrl} alt="Result" style={{ width: "100%", display: "block" }} />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Button data-testid="save-to-library-btn" onClick={() => saveToLibrary.mutate()} disabled={result.saved || saveToLibrary.isPending}
                style={{ background: result.saved ? "#064e3b" : `${GOLD}18`, border: `1px solid ${result.saved ? "#065f46" : GOLD}44`, color: result.saved ? "#4ade80" : GOLD, fontWeight: 700, borderRadius: 12, height: 48 }}>
                {saveToLibrary.isPending ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} className="animate-spin" /> Saving…</span>
                ) : result.saved ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={13} /> Saved</span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Save size={13} /> Save to Library</span>
                )}
              </Button>
              <Button data-testid="download-result-btn" onClick={handleDownload}
                style={{ background: CARD2, border: `1px solid ${BORDER}`, color: TEXT2, fontWeight: 600, borderRadius: 12, height: 48 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Download size={13} /> Download</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Content Library ──────────────────────────────────────────────────────────
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
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>My Library</h2>
          <button data-testid="library-refresh-btn" onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3 }}><RefreshCw size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} data-testid={`library-tab-${t.id}`} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? GOLD : CARD, border: `1px solid ${tab === t.id ? GOLD : BORDER}`, color: tab === t.id ? "#000" : TEXT2, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 400, whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 80 }}><RefreshCw size={22} color={TEXT3} className="animate-spin" style={{ margin: "0 auto" }} /></div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: CARD, borderRadius: 18, border: `1px solid ${BORDER}` }}>
            <Image size={36} color={TEXT3} style={{ margin: "0 auto 12px" }} />
            <p style={{ fontWeight: 600, color: TEXT2, marginBottom: 4 }}>No content here yet</p>
            <p style={{ fontSize: 13, color: TEXT3 }}>Generate or save something to get started.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {items.map(item => (
              <div key={item.id} data-testid={`content-card-${item.id}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ position: "relative", aspectRatio: "1", background: SURFACE, overflow: "hidden" }}>
                  {item.thumbnail_url ? <img src={item.thumbnail_url} alt={item.title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>{item.content_type === "ai_video" ? <Video size={28} color={TEXT3} /> : <Image size={28} color={TEXT3} />}</div>}
                  {item.content_type === "ai_video" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${GOLD}bb`, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
                        <div style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: `12px solid ${GOLD}`, marginLeft: 3 }} />
                      </div>
                    </div>
                  )}
                  <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 7px" }}>
                    <span style={{ fontSize: 10, color: TEXT, fontWeight: 600 }}>{typeLabel(item.content_type)}</span>
                  </div>
                  {(session.role === "staff" || session.role === "admin") && item.approval_status === "pending" && (
                    <button data-testid={`approve-btn-${item.id}`} onClick={() => approve.mutate(item.id)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", border: "1px solid #4ade8066", borderRadius: 6, padding: "3px 7px", cursor: "pointer", color: "#4ade80", fontSize: 10, fontWeight: 700 }}>✓ OK</button>
                  )}
                </div>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    {item.title && <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>}
                    <p style={{ fontSize: 11, color: TEXT3, margin: 0 }}>{new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button data-testid={`download-btn-${item.id}`} onClick={() => download(item.id, item.content_type)} style={{ width: 32, height: 32, background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: 8, cursor: "pointer", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }} title="Download"><Download size={13} /></button>
                    <button data-testid={`archive-btn-${item.id}`} onClick={() => archive.mutate(item.id)} style={{ width: 32, height: 32, background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", color: TEXT3, display: "flex", alignItems: "center", justifyContent: "center" }} title="Remove"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Management ──────────────────────────────────────────────────────────
function TeamView({ session, onBack }: { session: StudioSession; onBack: () => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("client");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: [API("/team")],
    queryFn: async () => { const res = await fetch(API("/team"), { credentials: "include" }); if (!res.ok) throw new Error("Forbidden"); return res.json(); },
  });

  const addMember = useMutation({
    mutationFn: () => apiRequest("POST", API("/team"), { email: newEmail, role: newRole, fullName: newName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/team")] }); toast({ title: "Added" }); setNewEmail(""); setNewName(""); setNewRole("client"); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: (email: string) => apiRequest("DELETE", API(`/team/${encodeURIComponent(email)}`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/team")] }); toast({ title: "Removed" }); },
  });

  const roleColor = (r: string) => r === "admin" ? GOLD : r === "staff" ? "#60a5fa" : TEXT2;

  return (
    <div>
      <BackBtn onClick={onBack} label="Studio Team" />
      <div style={{ padding: "0 20px" }}>
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
        {isLoading ? <div style={{ textAlign: "center", padding: 40, color: TEXT3 }}>Loading…</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.filter(m => m.is_active).map(m => (
              <div key={m.email} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${roleColor(m.role)}18`, border: `1px solid ${roleColor(m.role)}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: roleColor(m.role), fontWeight: 700, flexShrink: 0 }}>{(m.email[0] ?? "?").toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: TEXT, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name || m.email}</p>
                  {m.full_name && <p style={{ fontSize: 11, color: TEXT3, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</p>}
                </div>
                <span style={{ fontSize: 10, color: roleColor(m.role), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>{m.role}</span>
                {m.email !== session.email && <button data-testid={`remove-member-${m.email}`} onClick={() => removeMember.mutate(m.email)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, padding: 4, flexShrink: 0 }}><X size={14} /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function NxtgenLawGroupStudio() {
  const [view, setView] = useState<View>("login-email"); // statebleed-allow: createMode+createPrompt cleared via navigate() before every setView
  const [pendingEmail, setPendingEmail] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("image");
  const [createPrompt, setCreatePrompt] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const navigate = (v: View) => {
    if (v !== "create") { setCreateMode("image"); setCreatePrompt(""); } // statebleed-allow: createMode+createPrompt reset for all non-create views
    setView(v);
  };

  const { data: config } = useQuery<StudioConfig>({
    queryKey: [API("/config")],
    queryFn: async () => { const res = await fetch(API("/config")); if (!res.ok) throw new Error(); return res.json(); },
    retry: false, staleTime: 5 * 60 * 1000,
  });

  const { data: session, isLoading: sessionLoading } = useQuery<StudioSession>({
    queryKey: [API("/auth/session")],
    queryFn: async () => { const res = await fetch(API("/auth/session"), { credentials: "include" }); return res.json(); },
    staleTime: 60 * 1000, refetchInterval: 5 * 60 * 1000,
  });

  const logout = useMutation({
    mutationFn: () => apiRequest("POST", API("/auth/logout"), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); navigate("login-email"); toast({ title: "Signed out" }); },
  });

  if (!sessionLoading && session?.authenticated && (view === "login-email" || view === "login-code")) {
    navigate("dashboard");
  }

  if (sessionLoading) {
    return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 36, height: 36, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
    </div>;
  }

  if (!session?.authenticated) {
    if (view === "login-code") {
      return <LoginCodeView email={pendingEmail} config={config} onSuccess={() => { qc.invalidateQueries({ queryKey: [API("/auth/session")] }); navigate("dashboard"); }} onBack={() => navigate("login-email")} />;
    }
    return <LoginEmailView config={config} onCodeSent={email => { setPendingEmail(email); setView("login-code"); }} />;
  }

  return (
    <StudioShell session={session} onLogout={() => logout.mutate()} onNavigate={navigate}>
      {view === "dashboard" && (
        <DashboardView
          session={session}
          onNavigate={navigate}
          onCreateNavigate={(mode) => { setCreateMode(mode); setCreatePrompt(""); setView("create"); }}
          onTemplateSelect={p => { setCreateMode("image"); setCreatePrompt(p); setView("create"); }}
        />
      )}
      {view === "create" && (
        <CreateView
          onBack={() => navigate("dashboard")}
          initialMode={createMode}
          initialPrompt={createPrompt}
        />
      )}
      {view === "library" && <LibraryView session={session} onBack={() => navigate("dashboard")} />}
      {view === "team" && <TeamView session={session} onBack={() => navigate("dashboard")} />}
    </StudioShell>
  );
}
