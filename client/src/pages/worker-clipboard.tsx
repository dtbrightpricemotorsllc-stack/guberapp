import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  X,
  Video,
  ClipboardCheck,
  Send,
  Eye,
  Loader2,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import type { Job, ProofTemplate, ProofChecklistItem } from "@shared/schema";
import { Link } from "wouter";

type TemplateWithItems = ProofTemplate & { checklistItems: ProofChecklistItem[] };

interface ChecklistItemState {
  files: string[];
  gpsLat: number | null;
  gpsLng: number | null;
  gpsTimestamp: string | null;
  gpsStatus: "idle" | "loading" | "success" | "error";
  notEncountered: boolean;
  notEncounteredReason: string;
  notes: string;
  submitted: boolean;
}

const statusLabels: Record<string, string> = {
  draft: "Draft", open: "Open", pending: "Pending",
  locked: "Locked", in_progress: "In Progress", completed: "Completed",
  proof_submitted: "Proof Submitted", disputed: "Disputed",
};

const statusColors: Record<string, string> = {
  locked: "bg-secondary/15 text-secondary border-secondary/30",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  proof_submitted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function resizeImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (file.type.startsWith("video/")) {
        resolve(e.target?.result as string);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas error")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadToCloudinary(base64: string): Promise<string> {
  const signRes = await fetch("/api/upload-photo/sign", {
    method: "POST",
    credentials: "include",
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({ error: "Could not get upload token" }));
    throw new Error(err.error || "Could not get upload token");
  }
  const { signature, timestamp, cloud_name, api_key, folder } = await signRes.json();

  const blob = base64ToBlob(base64);
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`,
    { method: "POST", body: formData }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({ error: { message: "Upload failed" } }));
    throw new Error(err.error?.message || "Upload failed");
  }
  const data = await uploadRes.json();
  return data.secure_url as string;
}

export default function WorkerClipboard() {
  const [, params] = useRoute("/worker-clipboard/:id");
  const { user } = useAuth();
  const { toast } = useToast();
  const jobId = params?.id;

  const [activeItem, setActiveItem] = useState<number | null>(null);
  const [itemStates, setItemStates] = useState<Record<number, ChecklistItemState>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: job, isLoading: jobLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    enabled: !!jobId,
  });

  const { data: template, isLoading: templateLoading } = useQuery<TemplateWithItems | null>({
    queryKey: ["/api/jobs", jobId, "proof-template"],
    enabled: !!jobId,
  });

  const getState = useCallback((itemId: number): ChecklistItemState => {
    return itemStates[itemId] || {
      files: [],
      gpsLat: null,
      gpsLng: null,
      gpsTimestamp: null,
      gpsStatus: "idle",
      notEncountered: false,
      notEncounteredReason: "",
      notes: "",
      submitted: false,
    };
  }, [itemStates]);

  const updateState = useCallback((itemId: number, updates: Partial<ChecklistItemState>) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: { ...( prev[itemId] || {
        files: [], gpsLat: null, gpsLng: null, gpsTimestamp: null,
        gpsStatus: "idle", notEncountered: false, notEncounteredReason: "",
        notes: "", submitted: false,
      }), ...updates },
    }));
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = async (itemId: number) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      toast({ title: "Camera Error", description: "Could not access camera", variant: "destructive" });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = async (itemId: number) => {
    if (!videoRef.current) return;

    // Geo-Lock: If required, capture GPS before photo
    let gpsData: Partial<ChecklistItemState> = {};
    if (template?.geoRequired) {
      updateState(itemId, { gpsStatus: "loading" });
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        gpsData = {
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
          gpsTimestamp: new Date().toISOString(),
          gpsStatus: "success",
        };
      } catch (err) {
        console.error("GPS capture failed during photo capture:", err);
        updateState(itemId, { gpsStatus: "error" });
        toast({ 
          title: "GPS Required", 
          description: "This task requires GPS coordinates. Please ensure location services are enabled.", 
          variant: "destructive" 
        });
        return; // Block capture if GPS is required but failed
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const url = await uploadToCloudinary(dataUrl);
      const current = getState(itemId);
      updateState(itemId, { files: [...current.files, url], ...gpsData });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleFileUpload = useCallback(async (itemId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const current = getState(itemId);
    const newFiles = [...current.files];
    for (let i = 0; i < files.length; i++) {
      try {
        const base64 = await resizeImage(files[i], 1200);
        const url = await uploadToCloudinary(base64);
        newFiles.push(url);
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message || "Failed to upload file", variant: "destructive" });
      }
    }
    updateState(itemId, { files: newFiles });
  }, [getState, updateState, toast]);

  const removeFile = useCallback((itemId: number, fileIndex: number) => {
    const current = getState(itemId);
    const newFiles = current.files.filter((_, i) => i !== fileIndex);
    updateState(itemId, { files: newFiles });
  }, [getState, updateState]);

  const captureGPS = useCallback((itemId: number) => {
    updateState(itemId, { gpsStatus: "loading" });
    if (!navigator.geolocation) {
      updateState(itemId, { gpsStatus: "error" });
      toast({ title: "GPS Unavailable", description: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateState(itemId, {
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
          gpsTimestamp: new Date().toISOString(),
          gpsStatus: "success",
        });
      },
      () => {
        updateState(itemId, { gpsStatus: "error" });
        toast({ title: "GPS Error", description: "Could not get location", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [updateState, toast]);

  const submitMutation = useMutation({
    mutationFn: async (data: { itemId: number; state: ChecklistItemState }) => {
      return apiRequest("POST", `/api/jobs/${jobId}/submit-proof`, {
        checklistItemId: data.itemId,
        imageUrls: JSON.stringify(data.state.files),
        gpsLat: data.state.gpsLat,
        gpsLng: data.state.gpsLng,
        gpsTimestamp: data.state.gpsTimestamp,
        notEncountered: data.state.notEncountered,
        notEncounteredReason: data.state.notEncounteredReason || null,
        notes: data.state.notes || null,
      });
    },
    onSuccess: (_, variables) => {
      updateState(variables.itemId, { submitted: true });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Proof Submitted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmitItem = useCallback((itemId: number) => {
    const state = getState(itemId);
    if (state.notEncountered && state.files.length === 0) {
      toast({ title: "Photo Required", description: "Upload at least 1 attempt proof photo before marking as Not Encountered", variant: "destructive" });
      return;
    }
    if (!state.notEncountered && state.files.length === 0) {
      toast({ title: "Photo Required", description: "Upload at least 1 proof photo", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ itemId, state });
  }, [getState, submitMutation, toast]);

  if (jobLoading || templateLoading) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-8 space-y-4" data-testid="page-worker-clipboard-loading">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </GuberLayout>
    );
  }

  if (!job) {
    return (
      <GuberLayout>
        <div className="text-center py-20 text-muted-foreground font-display" data-testid="text-job-not-found">Job not found</div>
      </GuberLayout>
    );
  }

  const isHelper = user?.id === job.assignedHelperId;
  if (!isHelper) {
    return (
      <GuberLayout>
        <div className="text-center py-20 text-muted-foreground font-display" data-testid="text-not-assigned">
          You are not assigned to this job.
        </div>
      </GuberLayout>
    );
  }

  const checklistItems = template?.checklistItems || [];
  const completedCount = checklistItems.filter(item => getState(item.id).submitted).length;
  const totalCount = checklistItems.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-worker-clipboard">
        <Link href={`/jobs/${jobId}`}>
          <Button variant="ghost" size="sm" className="mb-3 gap-1 text-muted-foreground px-0" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> Back to Job
          </Button>
        </Link>

        <div className="glass-card rounded-2xl p-5 mb-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold text-foreground" data-testid="text-clipboard-title">
              Mission Clipboard
            </h1>
          </div>
          <h2 className="text-sm text-muted-foreground mb-3" data-testid="text-job-title">{job.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[11px] bg-muted/50 border-border/30" data-testid="badge-category">{job.category}</Badge>
            {job.serviceType && (
              <Badge variant="outline" className="text-[11px] bg-muted/50 border-border/30" data-testid="badge-service-type">{job.serviceType}</Badge>
            )}
            <Badge variant="outline" className={`text-[11px] ${statusColors[job.status] || "bg-muted/50 border-border/30"}`} data-testid="badge-status">
              {statusLabels[job.status] || job.status}
            </Badge>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-4 border border-white/[0.06]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">Progress</span>
              <span className="text-xs font-display font-bold text-primary" data-testid="text-progress">
                {completedCount}/{totalCount} completed
              </span>
            </div>
            <Progress value={progressPct} className="h-2" data-testid="progress-bar" />
          </div>
        )}

        {!template && (
          <div className="glass-card rounded-2xl p-5 border border-white/[0.06] text-center">
            <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-template">
              No proof template found for this job. Contact support if this is unexpected.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {checklistItems.map((item, idx) => {
            const state = getState(item.id);
            const isSubmitted = state.submitted;

            return (
              <div
                key={item.id}
                className={`glass-card rounded-2xl p-5 border transition-all ${isSubmitted ? "border-emerald-500/30" : "border-white/[0.06]"}`}
                data-testid={`card-checklist-item-${item.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isSubmitted ? "bg-emerald-500/20 text-emerald-400" : "bg-primary/15 text-primary"}`}>
                      {isSubmitted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-semibold" data-testid={`text-item-label-${item.id}`}>{item.label}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] bg-muted/30 border-border/20">
                          {item.mediaType === "video" ? <Video className="w-2.5 h-2.5 mr-0.5" /> : <Camera className="w-2.5 h-2.5 mr-0.5" />}
                          {item.mediaType}
                        </Badge>
                        {item.quantityRequired && item.quantityRequired > 1 && (
                          <Badge variant="outline" className="text-[10px] bg-muted/30 border-border/20">
                            {item.quantityRequired}x required
                          </Badge>
                        )}
                        {item.geoRequired && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-400 border-blue-500/30">
                            <MapPin className="w-2.5 h-2.5 mr-0.5" /> GPS
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {item.instruction && (
                  <p className="text-xs text-muted-foreground mb-3 pl-9" data-testid={`text-item-instruction-${item.id}`}>
                    {item.instruction}
                  </p>
                )}

                {!isSubmitted && (
                  <div className="space-y-3 pl-9">
                    {activeItem === item.id ? (
                      <div className="space-y-3">
                        <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-3">
                          {stream ? (
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                              <Camera className="w-8 h-8 text-muted-foreground" />
                              <Button size="sm" onClick={() => startCamera(item.id)}>Start Camera</Button>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => capturePhoto(item.id)} disabled={!stream} data-testid={`button-capture-${item.id}`}>
                            <Camera className="w-4 h-4 mr-2" /> Capture
                          </Button>
                          <Button variant="ghost" onClick={() => { stopCamera(); setActiveItem(null); }}>Done</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          ref={(el) => { fileInputRefs.current[item.id] = el; }}
                          type="file"
                          accept={item.mediaType === "video" ? "video/*" : "image/*"}
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileUpload(item.id, e.target.files)}
                          data-testid={`input-file-${item.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1 border-dashed border-border/40 text-muted-foreground rounded-xl"
                            onClick={() => { setActiveItem(item.id); startCamera(item.id); }}
                            data-testid={`button-camera-${item.id}`}
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Open Camera
                          </Button>
                          <Button
                            variant="outline"
                            className="w-12 border-dashed border-border/40 text-muted-foreground rounded-xl"
                            onClick={() => fileInputRefs.current[item.id]?.click()}
                            data-testid={`button-upload-${item.id}`}
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {state.files.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {state.files.map((file, fi) => (
                          <div key={fi} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/20">
                            {file.startsWith("data:video") ? (
                              <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                                <Video className="w-6 h-6 text-muted-foreground" />
                              </div>
                            ) : (
                              <img src={file} alt={`Proof ${fi + 1}`} className="w-full h-full object-cover" data-testid={`img-preview-${item.id}-${fi}`} />
                            )}
                            <button
                              onClick={() => removeFile(item.id, fi)}
                              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                              data-testid={`button-remove-file-${item.id}-${fi}`}
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.geoRequired && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => captureGPS(item.id)}
                          disabled={state.gpsStatus === "loading"}
                          className="rounded-xl"
                          data-testid={`button-gps-${item.id}`}
                        >
                          {state.gpsStatus === "loading" ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <MapPin className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Capture GPS
                        </Button>
                        {state.gpsStatus === "success" && (
                          <span className="flex items-center gap-1 text-xs text-emerald-400" data-testid={`gps-success-${item.id}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> GPS Captured
                          </span>
                        )}
                        {state.gpsStatus === "error" && (
                          <span className="flex items-center gap-1 text-xs text-destructive" data-testid={`gps-error-${item.id}`}>
                            <X className="w-3.5 h-3.5" /> GPS Failed
                          </span>
                        )}
                      </div>
                    )}

                    <div className="border-t border-border/10 pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          variant={state.notEncountered ? "default" : "outline"}
                          size="sm"
                          className={`rounded-xl text-xs ${state.notEncountered ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "border-border/30 text-muted-foreground"}`}
                          onClick={() => updateState(item.id, { notEncountered: !state.notEncountered })}
                          data-testid={`button-not-encountered-${item.id}`}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Cannot Complete
                        </Button>
                      </div>

                      {state.notEncountered && (
                        <div className="space-y-2 mb-2" data-testid={`section-cannot-complete-${item.id}`}>
                          <p className="text-[10px] text-yellow-500/70 font-display uppercase tracking-wider mb-1">
                            Explanation Required + Location Photo
                          </p>
                          <Textarea
                            placeholder="Explain why this item cannot be completed..."
                            value={state.notEncounteredReason}
                            onChange={(e) => updateState(item.id, { notEncounteredReason: e.target.value })}
                            className="bg-background border-border/30 rounded-xl text-sm min-h-[80px]"
                            data-testid={`textarea-reason-${item.id}`}
                          />
                        </div>
                      )}
                    </div>

                    <Textarea
                      placeholder="Add notes (optional)..."
                      value={state.notes}
                      onChange={(e) => updateState(item.id, { notes: e.target.value })}
                      className="bg-background border-border/30 rounded-xl text-sm min-h-[60px]"
                      data-testid={`input-notes-${item.id}`}
                    />

                    <Button
                      onClick={() => handleSubmitItem(item.id)}
                      disabled={submitMutation.isPending}
                      className="w-full bg-primary text-primary-foreground font-display tracking-wider rounded-xl"
                      data-testid={`button-submit-item-${item.id}`}
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Submit Proof
                    </Button>
                  </div>
                )}

                {isSubmitted && (
                  <div className="pl-9">
                    <p className="text-xs text-emerald-400 flex items-center gap-1" data-testid={`text-submitted-${item.id}`}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Proof submitted successfully
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {checklistItems.length === 0 && template && (
          <div className="glass-card rounded-2xl p-5 border border-white/[0.06]">
            <p className="text-sm text-muted-foreground text-center">
              No checklist items defined. You may submit a general proof.
            </p>
            <GeneralProofSubmit jobId={jobId!} template={template} />
          </div>
        )}
      </div>
    </GuberLayout>
  );
}

function GeneralProofSubmit({ jobId, template }: { jobId: string; template: TemplateWithItems }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsTimestamp, setGpsTimestamp] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [notEncountered, setNotEncountered] = useState(false);
  const [notEncounteredReason, setNotEncounteredReason] = useState("");
  const [notes, setNotes] = useState("");

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/submit-proof`, {
      imageUrls: JSON.stringify(files),
      gpsLat, gpsLng, gpsTimestamp,
      notEncountered,
      notEncounteredReason: notEncounteredReason || null,
      notes: notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Proof Submitted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles = [...files];
    for (let i = 0; i < fileList.length; i++) {
      try {
        const b64 = await resizeImage(fileList[i], 1200);
        const url = await uploadToCloudinary(b64);
        newFiles.push(url);
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message || "Failed to upload file", variant: "destructive" });
      }
    }
    setFiles(newFiles);
  };

  const captureGPS = () => {
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsTimestamp(new Date().toISOString()); setGpsStatus("success"); },
      () => { setGpsStatus("error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3 mt-4">
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files)} data-testid="input-file-general" />
      <Button variant="outline" className="w-full border-dashed rounded-xl" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-general">
        <Upload className="w-4 h-4 mr-2" /> Upload Proof
      </Button>
      {files.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/20">
              <img src={f} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      {template.geoRequired && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={captureGPS} disabled={gpsStatus === "loading"} className="rounded-xl" data-testid="button-gps-general">
            <MapPin className="w-3.5 h-3.5 mr-1.5" /> Capture GPS
          </Button>
          {gpsStatus === "success" && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> GPS OK</span>}
          {gpsStatus === "error" && <span className="text-xs text-destructive flex items-center gap-1"><X className="w-3.5 h-3.5" /> Failed</span>}
        </div>
      )}
      <Button variant={notEncountered ? "default" : "outline"} size="sm"
        className={`rounded-xl text-xs ${notEncountered ? "bg-yellow-500/20 text-yellow-400" : ""}`}
        onClick={() => setNotEncountered(!notEncountered)} data-testid="button-not-encountered-general">
        <Eye className="w-3 h-3 mr-1" /> Not Encountered
      </Button>
      {notEncountered && template.notEncounteredReasons && (
        <Select value={notEncounteredReason} onValueChange={setNotEncounteredReason}>
          <SelectTrigger className="bg-background border-border/30 rounded-xl" data-testid="select-reason-general"><SelectValue placeholder="Reason..." /></SelectTrigger>
          <SelectContent>
            {template.notEncounteredReasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Textarea placeholder="Notes..." value={notes} onChange={e => setNotes(e.target.value)} className="bg-background border-border/30 rounded-xl min-h-[60px]" data-testid="input-notes-general" />
      <Button onClick={() => {
        if (files.length === 0) { toast({ title: "Photo Required", variant: "destructive" }); return; }
        submitMutation.mutate();
      }} disabled={submitMutation.isPending} className="w-full bg-primary text-primary-foreground font-display rounded-xl" data-testid="button-submit-general">
        {submitMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Submit
      </Button>
    </div>
  );
}