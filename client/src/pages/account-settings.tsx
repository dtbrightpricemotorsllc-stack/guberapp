import { useState, useEffect, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";
import { useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, LogOut, Trash2, Lock, Camera, AlertCircle, Shield, ShieldCheck, Building2, MessageSquare, CheckCircle, Fingerprint, Map, Bell, VolumeX } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isBiometricSupported, getBiometricEnabled, setBiometricEnabled, performBiometricAuth } from "@/lib/biometric";
import {
  getNotifSoundEnabled, setNotifSoundEnabled,
  getNotifVibrationEnabled, setNotifVibrationEnabled,
  playGuberSound, unlockAudio, type SoundType,
} from "@/lib/notification-sound";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push";
import { GlobalDisclaimerModal } from "@/components/liability-modals";

async function getCroppedImg(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  const size = Math.min(pixelCrop.width, pixelCrop.height, 400);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function AccountSettings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bizConvertOpen, setBizConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [disclaimerReviewOpen, setDisclaimerReviewOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [cropOpen, setCropOpen] = useState(false);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  const [notifSoundEnabled, setNotifSoundEnabledState] = useState(true);
  const [notifVibrationEnabled, setNotifVibrationEnabledState] = useState(true);
  const [vibrationSupported, setVibrationSupported] = useState(false);
  const [audioBlockedWarning, setAudioBlockedWarning] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);

  const [preferredMapApp, setPreferredMapApp] = useState<string>("ask");

  useEffect(() => {
    if (user) {
      setPreferredMapApp(((user as any).preferredMapApp as string) || "ask");
    }
  }, [user]);

  const preferredMapMutation = useMutation({
    mutationFn: async (value: string) => {
      const apiValue = value === "ask" ? null : value;
      const r = await apiRequest("POST", "/api/users/me/preferred-map-app", { app: apiValue });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Map preference saved" });
    },
    onError: (err: any) => toast({ title: "Could not save preference", description: err?.message, variant: "destructive" }),
  });

  useEffect(() => {
    (async () => {
      const supported = await isBiometricSupported();
      setBiometricSupported(supported);
      if (supported) {
        const enabled = await getBiometricEnabled();
        setBiometricEnabledState(enabled);
      }
    })();
  }, []);

  useEffect(() => {
    setNotifSoundEnabledState(getNotifSoundEnabled());
    setNotifVibrationEnabledState(getNotifVibrationEnabled());
    setVibrationSupported("vibrate" in navigator);
    setPushStatus(getPushStatus());
  }, []);

  const handleEnablePush = async () => {
    if (!user?.id) return;
    setEnablingPush(true);
    try {
      const granted = await subscribeToPush(user.id);
      if (granted) {
        setPushStatus("granted");
        toast({ title: "Push alerts enabled", description: "You'll get instant notifications for new jobs and payments." });
      } else {
        // Re-read status to surface "denied" transitions on web.
        setPushStatus(getPushStatus());
        toast({
          title: "Couldn't enable push alerts",
          description: "Make sure notifications are allowed for GUBER in your phone's settings.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Couldn't enable push alerts", description: err?.message || "Try again in a moment.", variant: "destructive" });
    } finally {
      setEnablingPush(false);
    }
  };

  useEffect(() => {
    if (window.location.hash === "#test-sounds") {
      const el = document.getElementById("test-sounds");
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.setAttribute("tabindex", "-1");
          el.focus({ preventScroll: true });
        }, 300);
      }
    }
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const verified = await performBiometricAuth("Confirm your identity to enable biometric unlock");
      if (!verified) {
        toast({
          title: "Biometric verification failed",
          description: "Make sure Face ID or fingerprint is enrolled on this device, then try again.",
          variant: "destructive",
        });
        return;
      }
    }
    setBiometricEnabledState(value);
    try {
      await setBiometricEnabled(value);
      toast({ title: value ? "Biometric unlock enabled" : "Biometric unlock disabled" });
    } catch {
      setBiometricEnabledState(!value);
      toast({ title: "Could not update biometric setting", variant: "destructive" });
    }
  };

  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/feedback", { category: feedbackCategory, message: feedbackMessage }).then(r => r.json()),
    onSuccess: () => { setFeedbackSent(true); setFeedbackMessage(""); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [form, setForm] = useState({
    fullName: "", username: "", email: "", userBio: "",
    zipcode: "", role: "buyer", skills: "", isAvailable: false,
  });

  useEffect(() => {
    if (user) setForm({
      fullName: user.fullName || "", username: user.username || "", email: user.email || "",
      userBio: user.userBio || "", zipcode: user.zipcode || "", role: user.role || "buyer",
      skills: user.skills || "", isAvailable: user.isAvailable || false,
    });
  }, [user]);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRawSrc(reader.result as string); setCropOpen(true); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const onCropComplete = useCallback((_: any, pixels: any) => setCroppedAreaPixels(pixels), []);

  const applyCrop = async () => {
    if (!rawSrc || !croppedAreaPixels) return;
    try {
      const cropped = await getCroppedImg(rawSrc, croppedAreaPixels);
      setPendingPhoto(cropped);
      setCropOpen(false);
      setRawSrc(null);
    } catch {
      toast({ title: "Crop failed", variant: "destructive" });
    }
  };

  const previewSrc = pendingPhoto ?? user?.profilePhoto ?? null;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: any = { ...form };
      if (pendingPhoto) payload.profilePhoto = pendingPhoto;
      return apiRequest("PATCH", `/api/users/${user?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setPendingPhoto(null);
      toast({ title: "Saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/users/${user?.id}`),
    onSuccess: async () => { await logout(); setLocation("/"); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => {
      if (pwForm.newPassword !== pwForm.confirmPassword) throw new Error("New passwords don't match");
      return apiRequest("POST", "/api/auth/change-password", { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
    },
    onSuccess: () => { toast({ title: "Password updated" }); setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <GuberLayout showBack backHref="/profile" title="Settings">
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-account-settings">
        <h1 className="text-xl font-display font-bold mb-4">Settings</h1>

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()} data-testid="button-change-photo">
              <Avatar className="w-16 h-16 border-2 border-primary/30">
                {previewSrc && <AvatarImage src={previewSrc} alt={user?.fullName} className="object-cover" />}
                <AvatarFallback className="bg-muted text-primary font-display text-lg">
                  {form.fullName?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
              {pendingPhoto && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background" />
              )}
            </div>
            <div>
              <p className="font-display font-semibold" data-testid="text-settings-name">{form.fullName}</p>
              <p className="text-xs text-muted-foreground">{form.email}</p>
              <button
                className="text-[11px] text-primary underline-offset-2 hover:underline mt-0.5"
                onClick={() => fileInputRef.current?.click()}
              >
                {pendingPhoto ? "Photo ready — save to apply" : "Change photo"}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
            data-testid="input-photo-file"
          />

          {[
            { label: "Full Name", field: "fullName", testid: "input-settings-name" },
            { label: "Username", field: "username", testid: "input-settings-username" },
            { label: "Email", field: "email", testid: "input-settings-email", type: "email" },
            { label: "Zip Code", field: "zipcode", testid: "input-settings-zip" },
            { label: "Skills", field: "skills", testid: "input-settings-skills" },
          ].map((f) => (
            <div key={f.field} className="space-y-1.5">
              <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">{f.label}</Label>
              <Input value={(form as any)[f.field]} onChange={update(f.field)}
                type={f.type || "text"} className="bg-background border-border/30" data-testid={f.testid} />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Bio</Label>
            <Textarea value={form.userBio} onChange={update("userBio")}
              className="bg-background border-border/30" placeholder="About you" data-testid="input-settings-bio" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger className="bg-background border-border/30" data-testid="select-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer">Buyer</SelectItem>
                <SelectItem value="helper">Helper</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/20">
            <div>
              <p className="font-display font-semibold text-sm">Available for Work</p>
              <p className="text-[11px] text-muted-foreground">Show as available to accept jobs</p>
            </div>
            <Switch checked={form.isAvailable} onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} data-testid="switch-available" />
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            className="w-full h-12 font-display tracking-wider bg-primary text-primary-foreground rounded-xl" data-testid="button-save-settings">
            {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "SAVE"}
          </Button>
        </div>

        {user?.authProvider !== "google" && (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4 mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Change Password</h3>
            </div>
            {[
              { label: "Current Password", field: "currentPassword", testid: "input-current-password" },
              { label: "New Password", field: "newPassword", testid: "input-new-password" },
              { label: "Confirm New Password", field: "confirmPassword", testid: "input-confirm-password" },
            ].map((f) => (
              <div key={f.field} className="space-y-1.5">
                <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">{f.label}</Label>
                <Input
                  type="password"
                  value={(pwForm as any)[f.field]}
                  onChange={e => setPwForm(p => ({ ...p, [f.field]: e.target.value }))}
                  className="bg-background border-border/30"
                  data-testid={f.testid}
                />
              </div>
            ))}
            <Button
              onClick={() => changePasswordMutation.mutate()}
              disabled={changePasswordMutation.isPending || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}
              className="w-full h-11 font-display tracking-wider rounded-xl"
              variant="outline"
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "UPDATE PASSWORD"}
            </Button>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3 mb-4" data-testid="card-preferred-map">
          <div className="flex items-center gap-2 mb-1">
            <Map className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Preferred Map App</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">When you tap Open in Maps, we'll use this app instead of asking each time.</p>
          <Select
            value={preferredMapApp}
            onValueChange={(v) => { setPreferredMapApp(v); preferredMapMutation.mutate(v); }}
          >
            <SelectTrigger className="bg-background border-border/30" data-testid="select-preferred-map-app">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ask">Always ask</SelectItem>
              <SelectItem value="google_maps">Google Maps</SelectItem>
              <SelectItem value="apple_maps">Apple Maps</SelectItem>
              <SelectItem value="waze">Waze</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {biometricSupported && (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3" data-testid="card-biometric">
            <div className="flex items-center gap-2 mb-1">
              <Fingerprint className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Biometric Unlock</h3>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/20">
              <div>
                <p className="font-display font-semibold text-sm">Require biometric to open app</p>
                <p className="text-[11px] text-muted-foreground">Face ID or fingerprint gates access to your session</p>
              </div>
              <Switch
                checked={biometricEnabled}
                onCheckedChange={handleBiometricToggle}
                data-testid="switch-biometric-unlock"
              />
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3 mb-4" data-testid="card-notification-settings">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Notification Settings</h3>
          </div>

          {pushStatus && pushStatus !== "unsupported" && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/20">
              <div className="flex-1 min-w-0 pr-3">
                <p className="font-display font-semibold text-sm">Push alerts</p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {pushStatus === "granted"
                    ? "You're set up to get instant alerts for new jobs and payments."
                    : pushStatus === "denied"
                    ? "Alerts are blocked. Allow notifications for GUBER in your phone's settings, then come back here."
                    : pushStatus === "ios-needs-install"
                    ? "Add GUBER to your home screen first (Safari → Share → Add to Home Screen) to enable push alerts."
                    : "Get instant alerts when someone accepts your job, pays you, or a cash drop is nearby."}
                </p>
              </div>
              {pushStatus === "granted" ? (
                <span className="text-[11px] font-display font-semibold text-primary px-2 py-1 rounded-md bg-primary/10 border border-primary/30 shrink-0" data-testid="status-push-enabled">
                  ON
                </span>
              ) : pushStatus === "default" ? (
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[12px] h-8 px-3 shrink-0"
                  onClick={handleEnablePush}
                  disabled={enablingPush}
                  data-testid="button-enable-push"
                >
                  {enablingPush ? "..." : "Enable"}
                </Button>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/20">
            <div>
              <p className="font-display font-semibold text-sm">Notification sounds</p>
              <p className="text-[11px] text-muted-foreground">Play audio for alerts and events</p>
            </div>
            <Switch
              checked={notifSoundEnabled}
              onCheckedChange={(v) => {
                setNotifSoundEnabledState(v);
                setNotifSoundEnabled(v);
                setAudioBlockedWarning(false);
                toast({ title: v ? "Notification sounds on" : "Notification sounds off" });
              }}
              data-testid="switch-notif-sound"
            />
          </div>

          {vibrationSupported && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/20">
              <div>
                <p className="font-display font-semibold text-sm">Vibration feedback</p>
                <p className="text-[11px] text-muted-foreground">Vibrate on notifications and actions</p>
              </div>
              <Switch
                checked={notifVibrationEnabled}
                onCheckedChange={(v) => {
                  setNotifVibrationEnabledState(v);
                  setNotifVibrationEnabled(v);
                  toast({ title: v ? "Vibration on" : "Vibration off" });
                }}
                data-testid="switch-notif-vibration"
              />
            </div>
          )}

          <div id="test-sounds" className="pt-2 mt-1 border-t border-white/[0.06] space-y-2" data-testid="card-test-sounds">
            <p className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Test alert sounds</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">Tap a button to hear each alert. If you hear nothing, your phone may be on silent or sounds may be disabled above.</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { type: "nearby",  label: "Nearby drop" },
                { type: "money",   label: "Money / paid" },
                { type: "action",  label: "Action needed" },
                { type: "closed",  label: "Closed / claimed" },
                { type: "default", label: "General alert" },
              ] as Array<{ type: SoundType; label: string }>).map((s) => (
                <Button
                  key={s.type}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-display border-border/30 justify-start"
                  onClick={async () => {
                    if (!notifSoundEnabled) {
                      toast({
                        title: "Notification sounds are off",
                        description: "Turn the toggle on above to hear test sounds.",
                        variant: "destructive",
                      });
                      return;
                    }
                    unlockAudio();
                    const ok = await playGuberSound(s.type);
                    setAudioBlockedWarning(!ok);
                  }}
                  data-testid={`button-test-sound-${s.type}`}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            {audioBlockedWarning && (
              <div
                className="mt-2 flex items-start gap-2 p-3 rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-200"
                role="alert"
                data-testid="banner-audio-muted-warning"
              >
                <VolumeX className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" />
                <div className="space-y-0.5">
                  <p className="font-display font-semibold text-[12px] leading-snug">Sound is muted on this device</p>
                  <p className="text-[10px] leading-relaxed text-amber-100/90">
                    Your device may be muted or audio is blocked. Check your ringer switch and volume.
                  </p>
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-1">
              <strong className="text-muted-foreground">Not hearing alerts on iPhone?</strong> Check that your ringer switch is on, GUBER notifications are allowed in iOS Settings, and Focus / Do Not Disturb is off. iOS only plays GUBER's custom sounds while the app is open in the foreground — locked-screen alerts use your phone's default notification sound.
            </p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            Safety &amp; Support
          </h3>
          <div className="p-3 rounded-xl border border-white/[0.06] bg-muted/10 space-y-2" data-testid="card-disclaimer-status">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display font-semibold text-[12px]">Safety Disclaimer</p>
                {user?.liabilityDisclaimerAcceptedAt ? (
                  <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="text-disclaimer-accepted-date">
                    Acknowledged on{" "}
                    {new Date(user.liabilityDisclaimerAcceptedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 italic" data-testid="text-disclaimer-not-acknowledged">
                    Not yet acknowledged
                  </p>
                )}
              </div>
              <button
                className="text-[11px] text-primary/70 hover:text-primary underline-offset-2 hover:underline font-display tracking-wider shrink-0 mt-0.5"
                onClick={() => {
                  setDisclaimerReviewOpen(true);
                  apiRequest("POST", "/api/users/me/review-liability-disclaimer").catch(() => {});
                }}
                data-testid="button-reread-disclaimer"
              >
                Re-read
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <a href="mailto:support@guberapp.com?subject=Safety Issue Report"
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-muted/10 hover:bg-muted/20 transition-colors text-sm"
              data-testid="link-settings-report-safety">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div>
                <p className="font-display font-semibold text-[12px]">Report a Safety Issue</p>
                <p className="text-[10px] text-muted-foreground">support@guberapp.com</p>
              </div>
            </a>
            <a href="mailto:support@guberapp.com?subject=Abuse or Fraud Report"
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-muted/10 hover:bg-muted/20 transition-colors text-sm"
              data-testid="link-settings-report-abuse">
              <ShieldCheck className="w-4 h-4 text-destructive/70 flex-shrink-0" />
              <div>
                <p className="font-display font-semibold text-[12px]">Report Abuse or Fraud</p>
                <p className="text-[10px] text-muted-foreground">support@guberapp.com</p>
              </div>
            </a>
            <div className="p-3 rounded-xl border border-white/[0.06] bg-muted/10">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Always meet in safe, public, well-lit locations. Do not perform tasks beyond your qualifications. For emergencies, call 911.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Link href="/terms" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-terms-settings">Terms</Link>
              <span className="text-muted-foreground text-[10px]">·</span>
              <Link href="/privacy" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-privacy-settings">Privacy</Link>
              <span className="text-muted-foreground text-[10px]">·</span>
              <Link href="/acceptable-use" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-aup-settings">Acceptable Use</Link>
            </div>
          </div>
        </div>

        {/* ── Restart Tutorial ── */}
        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm mb-1">App Tour</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Replay the onboarding walkthrough to re-learn GUBER's core features.</p>
          <button
            className="w-full h-10 rounded-xl font-display font-black text-xs tracking-[0.12em] text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,rgba(0,229,118,0.25),rgba(0,229,118,0.15))", border: "1.5px solid rgba(0,229,118,0.4)" }}
            onClick={() => {
              if (typeof localStorage !== "undefined") {
                localStorage.removeItem("guber_tour_v2_complete");
                localStorage.removeItem("guber_tour_step");
              }
              window.location.href = "/";
            }}
            data-testid="button-restart-tutorial"
          >
            ↺ Restart Tutorial
          </button>
        </div>

        {user?.accountType === "business" ? (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Business Portal</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Manage your business profile, post jobs in bulk, and access business-only tools.</p>
            <p className="text-[10px] text-muted-foreground" data-testid="text-biz-personal-reminder">Personal features require a separate personal account.</p>
            <Link href="/biz/dashboard">
              <Button variant="outline" className="w-full border-border/30 font-display text-sm gap-2" data-testid="button-go-biz-portal">
                <Building2 className="w-4 h-4" />
                Go to Business Portal
              </Button>
            </Link>
          </div>
        ) : user?.accountType === "pending_business" ? (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              GUBER Business Mode
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Your business access has been approved. Complete setup to activate your Business Portal.</p>
            <p className="text-[10px] text-muted-foreground" data-testid="text-pending-biz-personal-reminder">Personal features require a separate personal account.</p>
            <Button
              variant="outline"
              className="w-full border-border/30 font-display text-sm gap-2"
              data-testid="button-switch-to-business"
              onClick={() => setBizConvertOpen(true)}
            >
              <Building2 className="w-4 h-4" />
              Complete Business Setup
            </Button>
            <AlertDialog open={bizConvertOpen} onOpenChange={setBizConvertOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Convert to Business Account?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>This moves your account into the GUBER Business system.</p>
                      <p>If approved, your account will lose access to the regular personal side, including:</p>
                      <ul className="list-disc list-inside space-y-1 pl-1">
                        <li>Cash Drops participation</li>
                        <li>Work / earn features</li>
                        <li>Personal user tools</li>
                      </ul>
                      <p>Business accounts are for:</p>
                      <ul className="list-disc list-inside space-y-1 pl-1">
                        <li>Hiring workers</li>
                        <li>Sponsoring cash drops</li>
                        <li>Managing campaigns</li>
                        <li>Reviewing field work and business data</li>
                      </ul>
                      <p>To continue using personal features, create a separate personal account.</p>
                      <p className="font-medium text-foreground">This should be treated as permanent once approved.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-stay-personal">Stay Personal</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="button-continue-biz-setup"
                    onClick={() => setLocation("/business-onboarding")}
                  >
                    Continue to Business Setup
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              GUBER Business
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Business accounts are reviewed and approved by the GUBER team. Contact support to apply.</p>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider" data-testid="text-biz-apply-info">support@guberapp.com</p>
          </div>
        )}

        {/* Feedback */}
        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3" data-testid="card-feedback">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            Send Feedback
          </h3>
          {feedbackSent ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle className="w-8 h-8 text-primary" />
              <p className="text-sm font-display font-semibold text-primary">Thank you!</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs">We take every submission into consideration to make GUBER the world's greatest economic platform. We're nothing without you. 💚</p>
              <button className="text-[11px] text-primary/60 hover:text-primary underline-offset-2 hover:underline mt-1" onClick={() => setFeedbackSent(false)}>
                Send another
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={feedbackCategory} onValueChange={setFeedbackCategory}>
                <SelectTrigger className="h-9 text-xs border-border/20" data-testid="select-feedback-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Feedback</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="compliment">Compliment</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Tell us what's on your mind..."
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                className="min-h-[90px] max-h-[120px] text-sm border-border/20 resize-none"
                data-testid="textarea-feedback-message"
              />
              <Button
                className="w-full h-9 text-xs font-display font-bold guber-button gap-2"
                onClick={() => feedbackMutation.mutate()}
                disabled={feedbackMutation.isPending || !feedbackMessage.trim()}
                data-testid="button-submit-feedback"
              >
                {feedbackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                {feedbackMutation.isPending ? "Sending..." : "Send Feedback"}
              </Button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-destructive/20 p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm text-destructive">Danger Zone</h3>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 border-border/30 text-muted-foreground font-display gap-1"
              onClick={() => { logout(); setLocation("/"); }} data-testid="button-signout">
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
            <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setDeleteStep(1); setDeleteConfirmText(""); } }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1 border-destructive/30 text-destructive font-display gap-1" data-testid="button-delete-account">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                {deleteStep === 1 ? (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-destructive">Delete Account?</DialogTitle>
                      <DialogDescription className="space-y-2 pt-1">
                        <span className="block font-semibold text-foreground">Your profile and login will be removed immediately.</span>
                        <span className="block">Your name, photo, bio, location, and login credentials are wiped right away. You'll be signed out and unable to sign back in with this account.</span>
                        <span className="block text-xs pt-2 text-muted-foreground" data-testid="text-retention-disclaimer">
                          Some data may be retained for legal, safety, and fraud prevention purposes — including job history, payment records, device/IP logs, and verification records — for at least 90 days, or longer if required by law.
                        </span>
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 pt-2">
                      <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Never mind</Button>
                      <Button variant="destructive" onClick={() => setDeleteStep(2)} data-testid="button-delete-step2">
                        I understand — continue
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-destructive">Confirm Deletion</DialogTitle>
                      <DialogDescription className="pt-1">
                        Type your email address <strong className="text-foreground">{user?.email}</strong> below to confirm you want to delete your account.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                      <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type your email to confirm"
                        className="border-destructive/40 focus:border-destructive"
                        data-testid="input-delete-confirm"
                        autoComplete="off"
                      />
                    </div>
                    <DialogFooter className="gap-2">
                      <Button variant="ghost" onClick={() => { setDeleteStep(1); setDeleteConfirmText(""); }}>Back</Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteMutation.mutate()}
                        disabled={deleteMutation.isPending || deleteConfirmText.trim().toLowerCase() !== (user?.email || "").toLowerCase()}
                        data-testid="button-confirm-delete"
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "DELETE MY ACCOUNT"}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <GlobalDisclaimerModal
        open={disclaimerReviewOpen}
        readOnly
        onDismiss={() => setDisclaimerReviewOpen(false)}
      />

      <Dialog open={cropOpen} onOpenChange={(open) => { if (!open) { setCropOpen(false); setRawSrc(null); } }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle>Crop Photo</DialogTitle>
            <DialogDescription>Drag and pinch to position your photo</DialogDescription>
          </DialogHeader>

          <div className="relative w-full bg-black" style={{ height: 300 }}>
            {rawSrc && (
              <Cropper
                image={rawSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="px-5 pb-2 pt-3">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display mb-2 block">Zoom</Label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
              data-testid="slider-crop-zoom"
            />
          </div>

          <DialogFooter className="px-5 pb-5 gap-2">
            <Button variant="ghost" onClick={() => { setCropOpen(false); setRawSrc(null); }}>Cancel</Button>
            <Button onClick={applyCrop} className="bg-primary text-primary-foreground" data-testid="button-apply-crop">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GuberLayout>
  );
}
