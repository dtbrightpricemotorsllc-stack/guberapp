import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, CircleDot, Square, MapPin, Glasses, ShieldCheck, Loader2, Upload, FileVideo } from "lucide-react";

const MAX_DURATION_MS = 15 * 60 * 1000;
const CONSENT_VERSION = 1;

interface Props {
  jobId: number | string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
}

type Phase = "consent" | "ready" | "recording" | "uploading" | "done";

export function HandsFreeCapture({ jobId, open, onOpenChange, onUploaded }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const wakeLockRef = useRef<any>(null);
  const stopTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const gpsRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);

  const consentKey = `handsfree-consent-v${CONSENT_VERSION}-job-${jobId}`;
  const alreadyConsented = typeof window !== "undefined" && window.localStorage.getItem(consentKey) === "1";
  const [phase, setPhase] = useState<Phase>(alreadyConsented ? "ready" : "consent");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("consent");
      setElapsedSec(0);
      setError(null);
    }
  }, [open]);

  function cleanup() {
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (stopTimerRef.current) {
      window.clearInterval(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
  }

  async function startCapture() {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}

      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          gpsRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );

      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void handleStop(); };
      rec.start(1000);
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setPhase("recording");
      stopTimerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(sec);
        if (Date.now() - startedAtRef.current >= MAX_DURATION_MS) {
          stopRecording();
        }
      }, 500);
    } catch (e: any) {
      setError(e?.message || "Could not start camera");
      setPhase("ready");
    }
  }

  function stopRecording() {
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
  }

  async function handleImport(file: File) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setError("Clip too large (max 200 MB). Trim before importing.");
      return;
    }
    setPhase("uploading");
    try {
      await uploadBlob(file, "paired-android", file.name);
      toast({ title: "POV proof uploaded", description: "Imported clip recorded as Hands-Free proof." });
      setPhase("done");
      onUploaded?.();
      setTimeout(() => onOpenChange(false), 800);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setPhase("ready");
    }
  }

  async function uploadBlob(blob: Blob, deviceKind: "phone-handsfree" | "paired-android", fileName?: string) {
    const tokenResp = await apiRequest("GET", `/api/jobs/${jobId}/wearable-upload-token`);
    const { token } = await tokenResp.json();

    const signResp = await fetch("/api/upload-photo/sign", { method: "POST", credentials: "include" });
    if (!signResp.ok) throw new Error("Could not get upload token");
    const { signature, timestamp, cloud_name, api_key, folder } = await signResp.json();

    const fd = new FormData();
    fd.append("file", blob, fileName || `pov-${Date.now()}.webm`);
    fd.append("api_key", api_key);
    fd.append("timestamp", String(timestamp));
    fd.append("signature", signature);
    fd.append("folder", folder);
    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`, { method: "POST", body: fd });
    if (!upRes.ok) throw new Error("Video upload failed");
    const { secure_url } = await upRes.json();

    const startedAt = startedAtRef.current || Date.now();
    const endedAt = Date.now();
    await apiRequest("POST", `/api/proof/wearable-upload`, {
      token,
      videoUrl: secure_url,
      captureMeta: {
        deviceKind,
        deviceModel: navigator.userAgent.slice(0, 200),
        captureStartedAt: new Date(startedAt).toISOString(),
        captureEndedAt: new Date(endedAt).toISOString(),
        gpsAtStart: gpsRef.current,
        consentVersion: CONSENT_VERSION,
      },
    });
  }

  async function handleStop() {
    if (stopTimerRef.current) {
      window.clearInterval(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
    const endedAt = Date.now();
    const startedAt = startedAtRef.current;
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0] instanceof Blob ? (chunksRef.current[0] as Blob).type : "video/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      setError("No video captured");
      setPhase("ready");
      return;
    }
    setPhase("uploading");
    try {
      await uploadBlob(blob, "phone-handsfree");
      toast({ title: "POV proof uploaded", description: "Hirer will see the Hands-Free badge on review." });
      setPhase("done");
      onUploaded?.();
      setTimeout(() => onOpenChange(false), 800);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setPhase("ready");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cleanup(); onOpenChange(v); }}>
      <DialogContent className="max-w-md" data-testid="dialog-handsfree-capture">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Glasses className="w-4 h-4 text-primary" />
            Hands-Free POV Capture
          </DialogTitle>
          <DialogDescription>Record continuous point-of-view video for verification.</DialogDescription>
        </DialogHeader>

        {phase === "consent" && (
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-xl p-4 space-y-2 border border-border/30">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs leading-relaxed text-muted-foreground">
                  By continuing you confirm you are at the job site, the camera will record video and audio of your surroundings, and the recording (with timestamp + GPS) will be uploaded to GUBER as proof for this job. Recording stops automatically after 15 minutes.
                </div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Hold your phone in a chest mount or pocket clip with the back camera facing forward. Recording fails silently without a stable mount — practice once before the job.
            </div>
            <Button
              className="w-full font-display tracking-wider"
              onClick={async () => {
                try {
                  await apiRequest("POST", "/api/handsfree/consent", { consentVersion: CONSENT_VERSION, jobId });
                  window.localStorage.setItem(consentKey, "1");
                } catch {}
                setPhase("ready");
              }}
              data-testid="button-handsfree-consent"
            >
              I Understand — Continue
            </Button>
          </div>
        )}

        {phase !== "consent" && (
          <div className="space-y-3">
            <div className="relative bg-black rounded-xl overflow-hidden aspect-video border border-border/30">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" data-testid="video-handsfree-preview" />
              {phase === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600/90 text-white text-xs px-2 py-1 rounded-full font-display">
                  <CircleDot className="w-3 h-3 animate-pulse" />
                  REC {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
                </div>
              )}
              {gpsRef.current && (
                <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                  <MapPin className="w-2.5 h-2.5 mr-1" />GPS locked
                </Badge>
              )}
            </div>

            {error && <p className="text-xs text-destructive" data-testid="text-handsfree-error">{error}</p>}

            <div className="flex gap-2">
              {phase === "ready" && (
                <>
                  <Button className="flex-1" onClick={startCapture} data-testid="button-handsfree-start">
                    <Camera className="w-4 h-4 mr-2" /> Phone POV
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => importInputRef.current?.click()}
                    disabled={isIOS}
                    title={isIOS ? "Clip import is not yet available on iOS — use Phone POV." : undefined}
                    data-testid="button-handsfree-import"
                  >
                    <FileVideo className="w-4 h-4 mr-2" /> {isIOS ? "Import (iOS soon)" : "Import Clip"}
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImport(f);
                      e.target.value = "";
                    }}
                    data-testid="input-handsfree-import"
                  />
                </>
              )}
              {phase === "recording" && (
                <Button variant="destructive" className="flex-1" onClick={stopRecording} data-testid="button-handsfree-stop">
                  <Square className="w-4 h-4 mr-2" /> Stop & Upload
                </Button>
              )}
              {phase === "uploading" && (
                <Button disabled className="flex-1" data-testid="button-handsfree-uploading">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…
                </Button>
              )}
              {phase === "done" && (
                <Button disabled className="flex-1" data-testid="button-handsfree-done">
                  <Upload className="w-4 h-4 mr-2" /> Uploaded
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function pickMimeType(): string | null {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return null;
}
