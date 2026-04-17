import { useState, useRef, useEffect } from "react";
import { buildReferralShareText } from "@/lib/referral";
import { isStoreBuild } from "@/lib/platform";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TrustBadge, TrustProgressBar, Day1OGBadge, Day1OGLogo } from "@/components/trust-badge";
import { MapPin, Star, Edit, CheckCircle, Crown, Loader2, ShieldCheck, Camera, FileText, Upload, Clock, TrendingUp, Award, AlertCircle, FileUp, DollarSign, ExternalLink, Banknote, ChevronRight, Share2, Copy, Gift, Shield, Lock, Zap, MessageSquare, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { User, Review } from "@shared/schema";

function VerifBadge({ verified, pending }: { verified: boolean; pending?: boolean }) {
  if (verified) return <span className="text-[10px] font-display text-primary flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" />Verified</span>;
  if (pending) return <span className="text-[10px] font-display text-amber-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />Pending</span>;
  return <span className="text-[10px] font-display text-muted-foreground">Not submitted</span>;
}

function compressImage(file: File, maxWidth = 1200): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function UploadButton({ type, label, verified, pending, onUpload, documentType }: { type: string; label: string; verified: boolean; pending?: boolean; onUpload: (type: string, b64: string, docType?: string) => void; documentType?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPending, setLocalPending] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalPending(true);
    try {
      const compressed = await compressImage(file);
      onUpload(type, compressed, documentType);
    } finally {
      setLocalPending(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle className="w-3 h-3 text-green-400" />
        <span className="text-[11px] font-display font-semibold text-green-400">Verified</span>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Clock className="w-3 h-3 text-amber-400" />
        <span className="text-[11px] font-display font-semibold text-amber-400">Pending Review</span>
      </div>
    );
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid={`input-upload-${type}`} />
      <Button
        variant="outline"
        size="sm"
        disabled={localPending}
        className="rounded-lg font-display text-xs h-8 border-white/[0.15] hover:border-white/25 gap-1.5"
        onClick={() => inputRef.current?.click()}
        data-testid={`button-upload-${type}`}
      >
        {localPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        Upload
      </Button>
    </div>
  );
}

export default function Profile() {
  const [matched, params] = useRoute("/profile/:id");
  const { user: currentUser, isDemoUser } = useAuth();
  const { toast } = useToast();
  const isSharingRef = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pendingTypes, setPendingTypes] = useState<Set<string>>(new Set());
  const [idDocType, setIdDocType] = useState<string>("US Government-Issued Photo ID");
  const [pubUsernameInput, setPubUsernameInput] = useState<string>("");
  const [pubUsernameValidation, setPubUsernameValidation] = useState<{ valid: boolean; message?: string } | null>(null);
  const [pubUsernameSaving, setPubUsernameSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [ogCardHidden, setOgCardHidden] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("guber_og_card_hidden") === "true"
  );
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const feedbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/feedback", { message: feedbackMessage, category: feedbackCategory }),
    onSuccess: () => {
      setFeedbackSent(true);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't send feedback", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const profileId = matched ? params?.id : undefined;
  const isOwnProfile = !profileId || profileId === String(currentUser?.id);
  const targetId = isOwnProfile ? currentUser?.id : profileId;

  const { data: verificationStatus } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/user/verification-status"],
    enabled: isOwnProfile && !!currentUser,
  });

  const { data: profileUser, isLoading } = useQuery<User>({
    queryKey: ["/api/users", String(targetId)],
    enabled: !!targetId,
  });

  const { data: reviews } = useQuery<Review[]>({
    queryKey: ["/api/reviews/user", String(targetId)],
    enabled: !!targetId,
  });

  const { data: connectStatus, refetch: refetchConnect } = useQuery<{ status: string; accountId: string | null }>({
    queryKey: ["/api/stripe/connect/status"],
    enabled: isOwnProfile,
    staleTime: 0,
  });

  const { data: referralData } = useQuery<{ code: string; link: string; count: number; feePct: number; progress: number; nextThreshold: number; atMax: boolean; expiresAt: string | null; discountActive: boolean; daysRemaining: number | null }>({
    queryKey: ["/api/users/me/referral"],
    enabled: isOwnProfile,
  });

  const { data: notifPrefs } = useQuery<{
    notifNearbyJobs: boolean;
    notifMessages: boolean;
    notifJobUpdates: boolean;
    notifCashDrops: boolean;
  }>({
    queryKey: ["/api/users/me/notification-preferences"],
    enabled: isOwnProfile,
  });

  const notifPrefMutation = useMutation({
    mutationFn: async (updates: Partial<{ notifNearbyJobs: boolean; notifMessages: boolean; notifJobUpdates: boolean; notifCashDrops: boolean }>) => {
      const resp = await apiRequest("PATCH", "/api/users/me/notification-preferences", updates);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/notification-preferences"] });
    },
  });

  const toggleNotifPref = (key: "notifNearbyJobs" | "notifMessages" | "notifJobUpdates" | "notifCashDrops") => {
    if (!notifPrefs) return;
    notifPrefMutation.mutate({ [key]: !notifPrefs[key] });
  };

  const [countdownLabel, setCountdownLabel] = useState("");
  useEffect(() => {
    if (!referralData?.discountActive || !referralData.expiresAt) { setCountdownLabel(""); return; }
    const update = () => {
      const ms = new Date(referralData.expiresAt!).getTime() - Date.now();
      if (ms <= 0) { setCountdownLabel("Expired"); return; }
      const totalHours = Math.floor(ms / (1000 * 60 * 60));
      const d = Math.floor(totalHours / 24);
      const h = totalHours % 24;
      const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      setCountdownLabel(d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [referralData?.discountActive, referralData?.expiresAt]);

  const [showStripeGuide, setShowStripeGuide] = useState(false);
  const [selectedProfileType, setSelectedProfileType] = useState<"individual" | "company" | null>(null);
  const [workAuthChecked, setWorkAuthChecked] = useState(false);

  const onboardMutation = useMutation({
    mutationFn: async (vars: { stripeProfileType?: string } = {}) => {
      const resp = await apiRequest("POST", "/api/stripe/connect/onboard", vars.stripeProfileType ? { stripeProfileType: vars.stripeProfileType } : undefined);
      return resp.json();
    },
    onError: (err: any) => toast({ title: "Setup Failed", description: err.message, variant: "destructive" }),
  });

  const handleOnboard = () => {
    setSelectedProfileType(null);
    setWorkAuthChecked(false);
    setShowStripeGuide(true);
  };

  const doOnboard = async (overrideType?: "individual" | "company") => {
    setShowStripeGuide(false);
    try {
      const data = await onboardMutation.mutateAsync(overrideType ? { stripeProfileType: overrideType } : {});
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch {
    }
  };

  const accountTypeKnown = currentUser?.accountType === "personal" || currentUser?.accountType === "business";

  const dashboardLinkMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/stripe/connect/dashboard-link");
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setPubUsernameInput((currentUser as any).publicUsername || "");
    }
  }, [isOwnProfile, currentUser]);

  async function validatePubUsername(val: string) {
    if (!val.trim()) { setPubUsernameValidation(null); return; }
    try {
      const resp = await apiRequest("GET", `/api/users/me/validate-username?value=${encodeURIComponent(val.trim())}`);
      const data = await resp.json();
      setPubUsernameValidation(data);
    } catch { setPubUsernameValidation(null); }
  }

  async function savePubUsername() {
    setPubUsernameSaving(true);
    try {
      const resp = await apiRequest("PATCH", "/api/users/me/public-username", { publicUsername: pubUsernameInput.trim() });
      if (!resp.ok) { const d = await resp.json(); throw new Error(d.message); }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Username saved", description: pubUsernameInput.trim() ? `Your public username is @${pubUsernameInput.trim()}` : "Public username cleared." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setPubUsernameSaving(false); }
  }

  const [location] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectParam = params.get("connect");
    if (connectParam === "success") {
      refetchConnect();
      toast({ title: "Payout Account Connected!", description: "Your earnings will be transferred automatically after job completion." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (connectParam === "refresh") {
      toast({ title: "Let's try again", description: "Your onboarding session expired. Click 'Set Up Payouts' to restart.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  const ogMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/stripe/og-checkout");
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ type, imageBase64, documentType }: { type: string; imageBase64: string; documentType?: string }) => {
      const resp = await apiRequest("POST", "/api/user/submit-verification", { type, imageBase64, documentType });
      return resp.json();
    },
    onSuccess: (_data, vars) => {
      setPendingTypes((prev) => {
        const next = new Set(Array.from(prev));
        next.add(vars.type);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/verification-status"] });
      toast({ title: "Submitted", description: "Your document has been submitted for review." });
    },
    onError: (err: any) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" }),
  });

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const photoMutation = useMutation({
    mutationFn: async (profilePhoto: string) => {
      const resp = await apiRequest("PATCH", `/api/users/${currentUser?.id}`, { profilePhoto });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", String(targetId)] });
      toast({ title: "Photo updated", description: "Your profile photo has been saved." });
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file, 800);
      toast({
        title: "Photo policy reminder",
        description: "Images containing phone numbers, email addresses, or contact solicitation are not allowed and may result in account suspension.",
      });
      photoMutation.mutate(compressed);
    } catch {
      toast({ title: "Upload failed", description: "Could not process photo.", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
    e.target.value = "";
  }

  const credentialMutation = useMutation({
    mutationFn: async ({ file, type = "credential" }: { file: File; type?: string }) => {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      const resp = await apiRequest("POST", "/api/users/credential-upload", {
        fileBase64: base64,
        fileName: file.name,
        fileType: file.type
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Success", description: "Document uploaded and pending review." });
    },
    onError: (err: any) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" }),
  });

  const displayUser = isOwnProfile ? currentUser : profileUser;

  if (isLoading && !isOwnProfile) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </GuberLayout>
    );
  }

  if (!displayUser) {
    return <GuberLayout><div className="text-center py-20 text-muted-foreground font-display">User not found</div></GuberLayout>;
  }

  const tierLabel: Record<string, string> = {
    community: "Community",
    verified: "Verified",
    credentialed: "Credentialed",
    elite: "Elite",
  };
  const nextTier: Record<string, string> = {
    community: "Verified — Submit government ID",
    verified: "Credentialed — Submit license or certification",
    credentialed: "Elite — By invitation only",
    elite: "You're at the top tier",
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-profile">
        <Card className="glass-card rounded-xl p-6 mb-4 animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoFile}
                data-testid="input-profile-photo"
              />
              <Avatar className="w-20 h-20 border-2 border-primary/30 shadow-[0_0_15px_hsl(152_100%_44%/0.15)]">
                {displayUser.profilePhoto && (
                  <AvatarImage src={displayUser.profilePhoto} alt={(displayUser as any).publicUsername || (displayUser as any).guberId || "User"} className="object-cover" />
                )}
                <AvatarFallback className="bg-muted text-primary text-xl font-display">
                  {(displayUser as any).publicUsername?.slice(0, 2).toUpperCase() || (displayUser as any).guberId?.replace("GUB-", "").slice(0, 2) || "?"}
                </AvatarFallback>
              </Avatar>
              {isOwnProfile && (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading || photoMutation.isPending}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                  style={{ background: "hsl(152 100% 44%)", border: "2px solid hsl(var(--card))" }}
                  data-testid="button-change-photo"
                  title="Change profile photo"
                >
                  {photoUploading || photoMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
                    : <Camera className="w-3.5 h-3.5 text-black" />}
                </button>
              )}
              {!isOwnProfile && displayUser.isAvailable && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center shadow-[0_0_8px_hsl(152_100%_44%/0.4)]">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight" data-testid="text-public-identity">
              {(displayUser as any).publicUsername ? `@${(displayUser as any).publicUsername}` : ((displayUser as any).guberId || "GUBER Member")}
            </h1>
            {isOwnProfile && displayUser.fullName && (
              <p className="text-xs text-muted-foreground mb-0.5">{displayUser.fullName} <span className="text-[10px]">(private)</span></p>
            )}
            <p className="text-[11px] font-mono text-primary/70 mb-2.5 tracking-wider" data-testid="text-guber-id">{(displayUser as any).guberId || ""}</p>
            <div className="flex items-center gap-2 mb-3">
              <TrustBadge tier={displayUser.tier} />
              {displayUser.day1OG && <Day1OGBadge />}
            </div>
            {displayUser.userBio && (
              <p className="text-sm text-muted-foreground mb-3 leading-relaxed max-w-sm">{displayUser.userBio}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
              {displayUser.zipcode && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{displayUser.zipcode}</span>
              )}
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500" />{displayUser.rating?.toFixed(1) || "0.0"} ({displayUser.reviewCount || 0})
              </span>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {isOwnProfile && (
                <Link href="/account-settings">
                  <Button variant="outline" size="sm" className="font-display" data-testid="button-edit-profile">
                    <Edit className="w-3 h-3 mr-1" /> Edit My Profile
                  </Button>
                </Link>
              )}
              {isOwnProfile && (
                <Dialog open={feedbackOpen} onOpenChange={(open) => {
                  setFeedbackOpen(open);
                  if (!open) { setFeedbackMessage(""); setFeedbackCategory("general"); setFeedbackSent(false); }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="font-display text-muted-foreground hover:text-primary text-xs gap-1" data-testid="button-share-feedback">
                      <MessageSquare className="w-3 h-3" /> Share Feedback
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="font-display">Share Feedback</DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        Bug report, idea, or anything on your mind — we read everything.
                      </DialogDescription>
                    </DialogHeader>
                    {feedbackSent ? (
                      <div className="py-8 text-center space-y-3" data-testid="feedback-success-state">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                          <CheckCircle className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-display font-bold text-foreground">We got it! Thank you 💚</p>
                          <p className="text-xs text-muted-foreground mt-1">Your feedback helps make GUBER the world's greatest economic platform.</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { setFeedbackSent(false); setFeedbackMessage(""); setFeedbackOpen(false); }} className="font-display text-xs">
                          Close
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <Select value={feedbackCategory} onValueChange={setFeedbackCategory}>
                          <SelectTrigger className="h-9 text-xs" data-testid="select-feedback-category">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="bug">Bug Report</SelectItem>
                            <SelectItem value="suggestion">Suggestion</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          value={feedbackMessage}
                          onChange={e => setFeedbackMessage(e.target.value.slice(0, 1000))}
                          placeholder="Tell us what's on your mind — feature ideas, bugs, anything…"
                          className="resize-none h-28 text-xs"
                          data-testid="textarea-profile-feedback"
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground/40">{feedbackMessage.length}/1000</span>
                          <Button
                            size="sm"
                            onClick={() => feedbackMutation.mutate()}
                            disabled={feedbackMutation.isPending || !feedbackMessage.trim()}
                            className="font-display text-xs bg-primary text-primary-foreground"
                            data-testid="button-submit-profile-feedback"
                          >
                            {feedbackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <MessageSquare className="w-3 h-3 mr-1" />}
                            Send
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              )}

            </div>
          </div>
          {isOwnProfile && (
            <div className="mt-4 pt-4 border-t border-border/10">
              <p className="text-xs font-display font-bold text-foreground/60 mb-2 uppercase tracking-widest">Public Username</p>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">Choose a public name others see. No real names, phone numbers, emails, or social handles.</p>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <div className="flex items-center rounded-lg border border-border/20 bg-background/50 overflow-hidden">
                    <span className="pl-3 pr-1 text-muted-foreground text-sm">@</span>
                    <input
                      type="text"
                      value={pubUsernameInput}
                      maxLength={20}
                      placeholder="your_handle"
                      className="flex-1 bg-transparent text-sm py-2 pr-3 outline-none text-foreground placeholder:text-muted-foreground/40"
                      data-testid="input-public-username"
                      onChange={e => { setPubUsernameInput(e.target.value); validatePubUsername(e.target.value); }}
                    />
                  </div>
                  {pubUsernameValidation && (
                    <p className={`text-[11px] mt-1 ${pubUsernameValidation.valid ? "text-primary" : "text-destructive"}`}>
                      {pubUsernameValidation.valid ? "Available" : pubUsernameValidation.message}
                    </p>
                  )}
                  {!pubUsernameValidation && pubUsernameInput.trim().length === 0 && (
                    <p className="text-[10px] text-muted-foreground/40 mt-1">3–20 characters, letters/numbers/underscore/dash only</p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="h-[38px] font-display text-xs shrink-0"
                  disabled={pubUsernameSaving || (pubUsernameValidation !== null && !pubUsernameValidation.valid)}
                  onClick={savePubUsername}
                  data-testid="button-save-public-username"
                >
                  {pubUsernameSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {isOwnProfile && !displayUser.day1OG && !isStoreBuild && !isDemoUser && !ogCardHidden && (() => {
          const profileIncomplete = !displayUser.userBio || !displayUser.profilePhoto || !displayUser.publicUsername || !displayUser.zipcode;
          const accountAgeMs = displayUser.createdAt ? Date.now() - new Date(displayUser.createdAt).getTime() : 0;
          const isOnboardingWindow = accountAgeMs > 0 && accountAgeMs < 14 * 24 * 60 * 60 * 1000;
          if (!profileIncomplete || !isOnboardingWindow) return null;
          return (
          <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-2" style={{ border: "1px solid hsl(45 100% 50% / 0.25)", boxShadow: "0 0 18px hsl(45 100% 50% / 0.08)" }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0">
                <Day1OGLogo size="md" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-sm text-amber-400">Day-1 OG Badge</h3>
                <p className="text-xs text-foreground mt-1 leading-relaxed">
                  Permanent founding-member badge with FREE urgent toggle on every job you post (normally $10 each). One-time <span className="font-semibold text-amber-300">$1.99</span> — never billed again.
                </p>
              </div>
            </div>
            <Button
              onClick={() => ogMutation.mutate()}
              disabled={ogMutation.isPending}
              size="sm"
              className="w-full font-display bg-gradient-to-r from-amber-600 to-yellow-600 text-white border border-amber-500/30 hover:from-amber-500 hover:to-yellow-500"
              data-testid="button-buy-og"
            >
              {ogMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Day1OGLogo size="sm" />}
              <span className="ml-1">Activate Day-1 OG — $1.99</span>
            </Button>
            <button
              onClick={() => { localStorage.setItem("guber_og_card_hidden", "true"); setOgCardHidden(true); }}
              className="mt-2 w-full text-[10px] text-muted-foreground hover:text-foreground transition"
              data-testid="button-dismiss-og-card"
            >
              Not now
            </button>
          </Card>
          );
        })()}

        <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm tracking-wide">Trust & Credentials</h3>
            {isOwnProfile && displayUser.tier !== "elite" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] font-display gap-1 border-primary/20" data-testid="button-request-upgrade">
                    <FileUp className="w-3 h-3" />
                    Request Upgrade
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass-card-strong border-white/10">
                  <DialogHeader>
                    <DialogTitle className="font-display">Upgrade Trust Tier</DialogTitle>
                    <DialogDescription className="text-xs">
                      Submit professional licenses, certifications, or background clearance documents to unlock the next trust tier.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl p-8 hover:border-primary/30 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) credentialMutation.mutate({ file });
                        }}
                        accept=".pdf,image/*"
                      />
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-xs font-display text-muted-foreground">Click or drag to upload document</p>
                      <p className="text-[10px] text-muted-foreground/40 mt-1">PDF or Images (Max 5MB)</p>
                    </div>
                    {displayUser.credentialUploadPending && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <p className="text-[11px] text-amber-400">You already have a document pending review.</p>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <TrustProgressBar score={displayUser.trustScore || 0} tier={displayUser.tier} />
          <div className="bg-muted/10 rounded-lg p-2.5 mt-3 border border-border/10">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Current Tier</p>
              <Badge variant="outline" className="text-[10px] font-display bg-primary/10 border-primary/20 text-primary capitalize">
                {displayUser.tier}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {nextTier[displayUser.tier]}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="stat-card rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold guber-text-green">{displayUser.jobsCompleted || 0}</p>
              <p className="text-[11px] text-muted-foreground font-display">Completed</p>
            </div>
            <div className="stat-card rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-destructive">{displayUser.jobsDisputed || 0}</p>
              <p className="text-[11px] text-muted-foreground font-display">Disputed</p>
            </div>
          </div>
          {displayUser.isAvailable && (
            <div className="flex items-center gap-2 text-sm guber-text-green mt-3 font-display">
              <CheckCircle className="w-4 h-4" /> Available for work
            </div>
          )}

          {/* ── Payout Unlock Card (own profile only) ── */}
          {isOwnProfile && (() => {
            const score: number = displayUser.trustScore || 0;
            const level = score >= 80 ? "trusted" : score >= 60 ? "verified" : "new";
            const levelLabel = level === "trusted" ? "Trusted Worker" : level === "verified" ? "Verified Worker" : "New Worker";
            const levelColor = level === "trusted" ? "#86efac" : level === "verified" ? "#93c5fd" : "#94a3b8";
            const levelBg = level === "trusted" ? "rgba(34,197,94,0.08)" : level === "verified" ? "rgba(59,130,246,0.08)" : "rgba(100,116,139,0.08)";
            const levelBorder = level === "trusted" ? "rgba(34,197,94,0.25)" : level === "verified" ? "rgba(59,130,246,0.25)" : "rgba(100,116,139,0.2)";
            const nextThreshold = level === "new" ? 60 : level === "verified" ? 80 : null;
            const nextLabel = level === "new" ? "Verified (60)" : level === "verified" ? "Trusted (80)" : null;
            const progressPct = nextThreshold ? Math.min(100, Math.round((score / nextThreshold) * 100)) : 100;
            return (
              <div className="rounded-2xl border p-4 space-y-3 mt-3" style={{ background: levelBg, borderColor: levelBorder }} data-testid="card-trust-payout-profile">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" style={{ color: levelColor }} />
                    <p className="text-xs font-display font-bold" style={{ color: levelColor }}>{levelLabel}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] text-muted-foreground font-display">Trust Score</p>
                    <p className="text-sm font-display font-black tabular-nums" style={{ color: levelColor }} data-testid="text-trust-score-profile">{score}</p>
                  </div>
                </div>

                {nextThreshold && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%`, background: levelColor }} />
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 font-display">
                      {score} / {nextThreshold} — {nextThreshold - score} pts to {nextLabel}
                    </p>
                  </div>
                )}
                {!nextThreshold && (
                  <p className="text-[9px] text-emerald-400/50 font-display">Max trust level — all payout modes unlocked</p>
                )}

                <div className="grid grid-cols-3 gap-1.5" data-testid="grid-payout-unlocks-profile">
                  {([
                    { icon: <Banknote className="w-3 h-3" />, label: "Standard", sub: "2–5 days · Free", unlocked: true },
                    { icon: <Clock className="w-3 h-3" />, label: "Early", sub: "~1 day · 2% fee", unlocked: level !== "new" },
                    { icon: <Zap className="w-3 h-3" />, label: "Instant", sub: "Immediate · 5%", unlocked: level === "trusted" },
                  ] as Array<{ icon: React.ReactNode; label: string; sub: string; unlocked: boolean }>).map(({ icon, label, sub, unlocked }) => (
                    <div key={label} className="rounded-xl p-2 text-center space-y-1" style={{ background: unlocked ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.2)", border: `1px solid ${unlocked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}` }} data-testid={`tile-payout-unlock-${label.toLowerCase()}`}>
                      <div className="flex items-center justify-center" style={{ color: unlocked ? levelColor : "#475569" }}>
                        {unlocked ? icon : <Lock className="w-3 h-3" />}
                      </div>
                      <p className="text-[9px] font-display font-bold" style={{ color: unlocked ? "#e2e8f0" : "#475569" }}>{label}</p>
                      <p className="text-[8px]" style={{ color: unlocked ? "#64748b" : "#334155" }}>{sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {isOwnProfile && displayUser.isAvailable && displayUser.stripeAccountStatus !== "active" && (
            <div 
              className="mt-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 animate-in fade-in slide-in-from-top-2"
              data-testid="banner-stripe-required-profile"
            >
              <div className="flex gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] font-display font-bold text-foreground leading-tight mb-1 uppercase tracking-wider">Payout Setup Required</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                    You're marked as available, but you need to complete Stripe verification to accept jobs and receive payments.
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-0 text-[10px] font-display font-bold text-emerald-400 hover:text-emerald-300 hover:bg-transparent flex items-center gap-1 group"
                    onClick={handleOnboard}
                    disabled={onboardMutation.isPending}
                    data-testid="link-setup-payouts-profile"
                  >
                    {onboardMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        START ONBOARDING
                        <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {displayUser.skills && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {displayUser.skills.split(",").map((s) => (
                <Badge key={s} variant="outline" className="text-[11px] bg-muted/30 border-border/30">{s.trim()}</Badge>
              ))}
            </div>
          )}
        </Card>

        {((displayUser as any).badgeTier === "reliable" || (displayUser as any).onTimePct != null) && (
          <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-4" data-testid="section-reliability">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-amber-400" />
              <h3 className="font-display font-semibold text-sm tracking-wide">Reliability</h3>
              {(displayUser as any).badgeTier === "reliable" && (displayUser as any).badgeActive && (
                <Badge variant="outline" className="ml-auto text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400 font-display font-bold" data-testid="badge-reliable">
                  <Award className="w-2.5 h-2.5 mr-0.5" /> RELIABLE
                </Badge>
              )}
              {(displayUser as any).badgeTier === "reliable" && !(displayUser as any).badgeActive && (
                <Badge variant="outline" className="ml-auto text-[10px] bg-muted/20 border-border/20 text-muted-foreground font-display" data-testid="badge-reliable-inactive">
                  RELIABLE (RECOVERING)
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card rounded-md p-3 text-center" data-testid="stat-on-time">
                <div className="flex justify-center mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-lg font-display font-bold guber-text-green">
                  {(displayUser as any).onTimePct != null ? `${Math.round((displayUser as any).onTimePct)}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground font-display mt-0.5">On Time</p>
              </div>
              <div className="stat-card rounded-md p-3 text-center" data-testid="stat-canceled">
                <div className="flex justify-center mb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <p className="text-lg font-display font-bold text-amber-400">
                  {(displayUser as any).canceledCount ?? 0}
                </p>
                <p className="text-[10px] text-muted-foreground font-display mt-0.5">Cancels</p>
              </div>
              <div className="stat-card rounded-md p-3 text-center" data-testid="stat-cancel-rate">
                <div className="flex justify-center mb-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <p className="text-lg font-display font-bold text-foreground">
                  {(displayUser as any).cancellationRate != null
                    ? `${Math.round((displayUser as any).cancellationRate * 100)}%`
                    : "0%"}
                </p>
                <p className="text-[10px] text-muted-foreground font-display mt-0.5">Cancel Rate</p>
              </div>
            </div>
            {(displayUser as any).cancellationRate > 0.06 && (displayUser as any).cancellationRate <= 0.10 && (
              <div className="mt-3 rounded-lg p-2.5 flex items-center gap-2"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                data-testid="warning-reliability-slipping">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-400/80">Reliability slipping — 5 consecutive on-time jobs will restore your badge.</p>
              </div>
            )}
            {(displayUser as any).cancellationRate > 0.10 && (
              <div className="mt-3 rounded-lg p-2.5 flex items-center gap-2"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                data-testid="warning-reliability-restricted">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                <p className="text-[11px] text-destructive/80">High cancel rate — urgent and high-trust jobs may be restricted.</p>
              </div>
            )}
          </Card>
        )}

        {isOwnProfile && (
          <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-4" data-testid="section-verification">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm tracking-wide">Trust Tier Verification</h3>
            </div>

            <div className="bg-muted/20 rounded-lg p-3 mb-4 border border-border/20">
              <p className="text-[11px] text-muted-foreground font-display">
                <span className="text-foreground font-bold">Current: {tierLabel[displayUser.tier] || "Community"}</span>
                {displayUser.tier !== "elite" && (
                  <span className="ml-2">→ Next: {nextTier[displayUser.tier]}</span>
                )}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02]" data-testid="row-id-verification">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-display font-semibold text-foreground">Government ID</p>
                      <VerifBadge verified={!!displayUser.idVerified} pending={pendingTypes.has("id") || !!verificationStatus?.id} />
                    </div>
                  </div>
                  <UploadButton
                    type="id"
                    label="ID"
                    verified={!!displayUser.idVerified}
                    pending={pendingTypes.has("id") || !!verificationStatus?.id}
                    documentType={idDocType}
                    onUpload={(t, b64, docType) => verifyMutation.mutate({ type: t, imageBase64: b64, documentType: docType })}
                  />
                </div>
                {(pendingTypes.has("id") || !!verificationStatus?.id) && !displayUser.idVerified && (
                  <p className="text-[10px] text-amber-400/70 font-display mt-1 pl-10">Your Government ID has been submitted and is pending review.</p>
                )}
                {!displayUser.idVerified && !pendingTypes.has("id") && !verificationStatus?.id && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#00E5E5] uppercase font-bold tracking-wider">Document Type</label>
                    <Select value={idDocType} onValueChange={setIdDocType}>
                      <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10" data-testid="select-id-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US Government-Issued Photo ID">US Government ID</SelectItem>
                        <SelectItem value="Passport (any country)">Passport (any country)</SelectItem>
                        <SelectItem value="Permanent Resident Card (Green Card)">Green Card</SelectItem>
                        <SelectItem value="Work Visa (H-1B/H-2A/H-2B)">Work Visa</SelectItem>
                        <SelectItem value="Student Visa (F-1/J-1/M-1)">Student Visa</SelectItem>
                        <SelectItem value="ITIN Letter">ITIN Letter</SelectItem>
                        <SelectItem value="Military ID">Military ID</SelectItem>
                        <SelectItem value="Tribal ID">Tribal ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between" data-testid="row-selfie-verification">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Camera className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-display font-semibold text-foreground">Selfie / Liveness</p>
                    <VerifBadge verified={!!displayUser.selfieVerified} pending={pendingTypes.has("selfie") || !!verificationStatus?.selfie} />
                  </div>
                </div>
                <UploadButton
                  type="selfie"
                  label="Selfie"
                  verified={!!displayUser.selfieVerified}
                  pending={pendingTypes.has("selfie") || !!verificationStatus?.selfie}
                  onUpload={(t, b64) => verifyMutation.mutate({ type: t, imageBase64: b64 })}
                />
              </div>
              {(pendingTypes.has("selfie") || !!verificationStatus?.selfie) && !displayUser.selfieVerified && (
                <p className="text-[10px] text-amber-400/70 font-display pl-10">Your selfie has been submitted and is pending review.</p>
              )}

              <div className="flex items-center justify-between" data-testid="row-credential-verification">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-display font-semibold text-foreground">License / Credential</p>
                    <VerifBadge verified={!!displayUser.credentialVerified} pending={pendingTypes.has("credential") || !!verificationStatus?.credential} />
                  </div>
                </div>
                <UploadButton
                  type="credential"
                  label="Credential"
                  verified={!!displayUser.credentialVerified}
                  pending={pendingTypes.has("credential") || !!verificationStatus?.credential}
                  onUpload={(t, b64) => verifyMutation.mutate({ type: t, imageBase64: b64 })}
                />
              </div>
              {(pendingTypes.has("credential") || !!verificationStatus?.credential) && !displayUser.credentialVerified && (
                <p className="text-[10px] text-amber-400/70 font-display pl-10">Your credential has been submitted and is pending review.</p>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/40 font-display mt-4 leading-relaxed">
              Uploads are reviewed by the GUBER trust team within 24-48 hours. Approval unlocks higher trust tiers and skilled labor jobs.
            </p>
          </Card>
        )}

        {isOwnProfile && (
          <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-5" data-testid="card-payout-setup">
            <div className="flex items-center gap-2 mb-3">
              <Banknote className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm tracking-wide">Payout Account</h3>
              {connectStatus?.status === "active" && (
                <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20 ml-auto" data-testid="badge-payout-active">Active</Badge>
              )}
              {connectStatus?.status === "pending" && (
                <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/20 ml-auto" data-testid="badge-payout-pending">Setup Incomplete</Badge>
              )}
              {(!connectStatus?.status || connectStatus.status === "none") && (
                <Badge className="text-[9px] bg-muted/30 text-muted-foreground border-border/20 ml-auto" data-testid="badge-payout-none">Not Set Up</Badge>
              )}
            </div>

            {connectStatus?.status === "active" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/8 border border-green-500/15">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-display font-semibold text-green-400">Payouts Enabled</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Earnings are transferred automatically when jobs are confirmed complete.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-[11px] font-display gap-1.5 border-border/20"
                  onClick={() => dashboardLinkMutation.mutate()}
                  disabled={dashboardLinkMutation.isPending}
                  data-testid="button-payout-dashboard"
                >
                  {dashboardLinkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                  View Payout Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {connectStatus?.status === "pending"
                    ? "Your payout account is created but setup is not complete. Continue where you left off."
                    : "Set up your payout account to receive earnings when jobs are confirmed. You only need to do this once."}
                </p>
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <DollarSign className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-display font-semibold text-foreground">How it works</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">When a poster confirms your work, GUBER transfers your earnings directly to your bank account. Powered by Stripe.</p>
                  </div>
                </div>
                <Button
                  className="w-full h-9 text-xs font-display font-bold gap-2 guber-button"
                  onClick={handleOnboard}
                  disabled={onboardMutation.isPending}
                  data-testid="button-setup-payouts"
                >
                  {onboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  {connectStatus?.status === "pending" ? "Continue Payout Setup" : "Set Up Payouts"}
                </Button>
              </div>
            )}
          </Card>
        )}

        {isOwnProfile && referralData && (
          <Card className="glass-card rounded-xl p-5 mb-4 animate-fade-in stagger-5" data-testid="card-referrals">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm tracking-wide">Refer & Earn</h3>
              {referralData.discountActive ? (
                <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20 ml-auto" data-testid="badge-fee-discount">
                  −{Math.round(referralData.feePct * 100)}% fee active
                </Badge>
              ) : referralData.feePct > 0 && !referralData.discountActive ? (
                <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/20 ml-auto" data-testid="badge-fee-discount">
                  Discount lapsed
                </Badge>
              ) : null}
            </div>

            <div className="space-y-3">
              {referralData.discountActive && referralData.expiresAt && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/8 border border-green-500/15" data-testid="block-discount-timer">
                  <div>
                    <p className="text-[10px] font-display font-semibold text-green-400">Fee discount active</p>
                    <p className="text-[11px] font-mono text-green-300 mt-0.5" data-testid="text-countdown">{countdownLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">Expires</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(referralData.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/20 border border-border/20">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">Your referral code</p>
                  <p className="font-mono font-bold text-sm tracking-widest text-foreground" data-testid="text-referral-code">{referralData.code}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-display gap-1.5 border-border/20 flex-shrink-0"
                  data-testid="button-copy-code"
                  onClick={() => {
                    navigator.clipboard.writeText(referralData.code);
                    toast({ title: "Copied!", description: "Referral code copied to clipboard." });
                  }}
                >
                  <Copy className="w-3 h-3" />
                  Copy Code
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground truncate flex-1 font-mono" data-testid="text-referral-link">{referralData.link}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-display gap-1.5 border-border/20 flex-shrink-0"
                  data-testid="button-copy-link"
                  onClick={() => {
                    navigator.clipboard.writeText(referralData.link);
                    toast({ title: "Copied!", description: "Referral link copied to clipboard." });
                  }}
                >
                  <Copy className="w-3 h-3" />
                  Copy Link
                </Button>
              </div>

              <Button
                className="w-full h-11 text-xs font-display font-black gap-2 tracking-wider"
                style={{ background: "linear-gradient(135deg,#C9A84C,#a8873c)", color: "#000" }}
                data-testid="button-share-invite"
                disabled={isSharing}
                onClick={async () => {
                  if (isSharingRef.current) return;
                  isSharingRef.current = true;
                  setIsSharing(true);
                  const shareText = buildReferralShareText(referralData.link);
                  try {
                    if (navigator.share) {
                      try { await navigator.share({ title: "GUBER", text: shareText }); } catch (_) {}
                    } else {
                      await navigator.clipboard.writeText(shareText);
                      toast({ title: "Copied!", description: "Paste and send your invite message." });
                    }
                  } finally {
                    isSharingRef.current = false;
                    setIsSharing(false);
                  }
                }}
              >
                🚀 INVITE &amp; ACTIVATE YOUR CITY
              </Button>

              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground" data-testid="text-referral-count">
                    {referralData.count} verified referral{referralData.count !== 1 ? "s" : ""}
                  </p>
                  {referralData.atMax && referralData.discountActive ? (
                    <p className="text-[10px] text-green-400 font-display font-semibold">Max tier — 30d discount active</p>
                  ) : referralData.atMax ? (
                    <p className="text-[10px] text-amber-400 font-display font-semibold">Max tier — discount lapsed</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">{referralData.progress}/10 toward next −5% fee</p>
                  )}
                </div>
                {!referralData.atMax && (
                  <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden" data-testid="progress-referrals">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(referralData.progress / 10) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Every 10 verified referrals earns a <span className="text-foreground font-semibold">−5% platform fee for 30 days</span>. Max −15% at 30 referrals. Referral counts when they complete Stripe Connect. Day-1 OG fee is separate.
                </p>
              </div>
            </div>
          </Card>
        )}

        {isOwnProfile && (
          <Card className="glass-card rounded-xl p-5 animate-fade-in stagger-5">
            <h3 className="font-display font-semibold text-sm mb-4 tracking-wide flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Safety &amp; Support
            </h3>
            <div className="space-y-2">
              <a href="mailto:support@guberapp.com?subject=Safety Issue Report"
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-muted/10 hover:bg-muted/20 transition-colors text-sm"
                data-testid="link-report-safety">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="font-display font-semibold text-[12px]">Report a Safety Issue</p>
                  <p className="text-[10px] text-muted-foreground">support@guberapp.com</p>
                </div>
              </a>
              <a href="mailto:support@guberapp.com?subject=Abuse or Fraud Report"
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-muted/10 hover:bg-muted/20 transition-colors text-sm"
                data-testid="link-report-abuse">
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
                <Link href="/terms" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-terms-profile">Terms</Link>
                <span className="text-muted-foreground/20 text-[10px]">·</span>
                <Link href="/privacy" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-privacy-profile">Privacy</Link>
                <span className="text-muted-foreground/20 text-[10px]">·</span>
                <Link href="/acceptable-use" className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="link-aup-profile">Acceptable Use</Link>
              </div>
            </div>
          </Card>
        )}

        {isOwnProfile && (
          <Card className="glass-card rounded-xl p-5 animate-fade-in stagger-5" data-testid="card-notification-preferences">
            <div className="flex items-center gap-2 mb-4">
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bell style={{ width: 15, height: 15, color: "#C9A84C" }} />
              </div>
              <h3 className="font-display font-semibold text-sm tracking-wide">Alert Preferences</h3>
            </div>
            <div className="space-y-3">
              {[
                { key: "notifNearbyJobs" as const, label: "Nearby Jobs", desc: "New jobs posted near you" },
                { key: "notifMessages" as const, label: "Messages", desc: "Direct messages from hirers and workers" },
                { key: "notifJobUpdates" as const, label: "Job Updates", desc: "Status changes on your active jobs" },
                { key: "notifCashDrops" as const, label: "Cash Drops", desc: "Live cash drops in your area" },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0"
                  data-testid={`row-notif-${key}`}
                >
                  <div>
                    <p className="font-display text-xs font-semibold tracking-wide text-foreground/90">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                  <Switch
                    checked={notifPrefs?.[key] ?? true}
                    onCheckedChange={() => toggleNotifPref(key)}
                    disabled={notifPrefMutation.isPending}
                    data-testid={`switch-notif-${key}`}
                  />
                </div>
              ))}
            </div>
            {notifPrefs !== undefined && (
              <p className="text-[10px] text-muted-foreground/35 mt-3 leading-relaxed">
                These control which push alerts reach your device. You can change them at any time.
              </p>
            )}
          </Card>
        )}

        <Card className="glass-card rounded-xl p-5 animate-fade-in stagger-5">
          <h3 className="font-display font-semibold text-sm mb-3 tracking-wide">Recent Reviews</h3>
          {reviews && reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.slice(0, 5).map((r) => (
                <div key={r.id} className="bg-muted/20 rounded-md p-3 premium-border">
                  <div className="flex items-center gap-0.5 mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < r.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/20"}`} />
                    ))}
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1 font-display">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Star className="w-8 h-8 text-muted-foreground/15 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-display">No reviews yet</p>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showStripeGuide} onOpenChange={setShowStripeGuide}>
        <DialogContent className="max-w-sm rounded-2xl" data-testid="dialog-stripe-guide">
          <div className="flex justify-center mb-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
          </div>
          <DialogHeader className="text-center space-y-1">
            <DialogTitle className="font-display text-base text-center">Secure Payout Setup</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Stripe powers payments for Amazon, Lyft, Shopify, and millions of businesses worldwide.
            </DialogDescription>
          </DialogHeader>

          {/* Why do we need this */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 space-y-1.5 my-1">
            <p className="text-[11px] font-display font-bold text-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-primary shrink-0" />
              Why do we need this?
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              We need this to send you money, not to charge you. No credit check. No subscription. You're in control.
            </p>
          </div>

          {!accountTypeKnown && (
            <div className="space-y-2 py-1" data-testid="picker-profile-type">
              <p className="text-xs font-display font-semibold text-foreground text-center mb-2">Who should receive your earnings?</p>
              <button
                type="button"
                onClick={() => setSelectedProfileType("individual")}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${selectedProfileType === "individual" ? "border-primary bg-primary/8" : "border-white/[0.1] bg-white/[0.03] hover:border-white/20"}`}
                data-testid="option-me-personally"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedProfileType === "individual" ? "bg-primary/20" : "bg-white/[0.06]"}`}>
                  <Lock className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-display font-bold text-foreground">Me personally</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Most workers choose this · Individual payouts to your bank</p>
                </div>
                {selectedProfileType === "individual" && <CheckCircle className="w-4 h-4 text-primary ml-auto shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfileType("company")}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${selectedProfileType === "company" ? "border-primary bg-primary/8" : "border-white/[0.1] bg-white/[0.03] hover:border-white/20"}`}
                data-testid="option-my-business"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedProfileType === "company" ? "bg-primary/20" : "bg-white/[0.06]"}`}>
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-display font-bold text-foreground">My business or company</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">For registered businesses only · Payouts under a business name</p>
                </div>
                {selectedProfileType === "company" && <CheckCircle className="w-4 h-4 text-primary ml-auto shrink-0" />}
              </button>
            </div>
          )}

          {/* Work Authorization Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer mt-1" data-testid="checkbox-work-auth">
            <input
              type="checkbox"
              checked={workAuthChecked}
              onChange={(e) => setWorkAuthChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0 cursor-pointer"
            />
            <span className="text-[11px] text-muted-foreground/80 leading-relaxed">
              I confirm I am authorized to receive income in the United States.
            </span>
          </label>

          <p className="text-[10px] text-muted-foreground/40 text-center">
            Secured by Stripe · Bank-grade encryption · guberapp.app
          </p>

          <Button
            className="w-full h-10 text-sm font-display font-bold guber-button"
            onClick={() => {
              if (!accountTypeKnown && selectedProfileType) {
                doOnboard(selectedProfileType);
              } else if (accountTypeKnown) {
                doOnboard();
              }
            }}
            disabled={onboardMutation.isPending || (!accountTypeKnown && !selectedProfileType) || !workAuthChecked}
            data-testid="button-continue-to-stripe"
          >
            {onboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {onboardMutation.isPending ? "Opening Stripe..." : "Continue to Stripe"}
          </Button>
        </DialogContent>
      </Dialog>
    </GuberLayout>
  );
}
