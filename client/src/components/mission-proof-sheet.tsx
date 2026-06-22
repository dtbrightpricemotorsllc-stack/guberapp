import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Camera, MapPin, X, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { gpsGetCurrentPosition } from "@/lib/gps";

const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

interface MissionProofSheetProps {
  instanceId: number;
  missionTitle: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function MissionProofSheet({ instanceId, missionTitle, onClose, onSubmitted }: MissionProofSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [businessName, setBusinessName] = useState("");
  const [notes, setNotes] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/missions/instances/${instanceId}/submit`, {
        photoDataUrl,
        gpsLat,
        gpsLng,
        businessName: businessName || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/missions/active"] });
      toast({
        title: "Proof submitted!",
        description: "Admin will review within 24–48 hours. Credits are awarded on approval.",
      });
      onSubmitted?.();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Submit failed", description: err.message, variant: "destructive" });
    },
  });

  async function capturePhoto() {
    setCaptureError(null);
    if (isNative) {
      try {
        const { Camera: CapCamera, CameraSource, CameraResultType } = await import("@capacitor/camera");
        const photo = await CapCamera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.DataUrl,
          quality: 80,
          allowEditing: false,
          saveToGallery: false,
        });
        if (photo.dataUrl) {
          setPhotoDataUrl(photo.dataUrl);
          await captureGps();
        }
      } catch (e: any) {
        if (!e?.message?.includes("cancelled") && !e?.message?.includes("cancel")) {
          setCaptureError("Camera not available. " + (e?.message ?? ""));
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setPhotoDataUrl(ev.target?.result as string);
      await captureGps();
    };
    reader.readAsDataURL(file);
  }

  async function captureGps() {
    setGpsStatus("locating");
    try {
      const pos = await gpsGetCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      setGpsLat(pos.coords.latitude);
      setGpsLng(pos.coords.longitude);
      setGpsStatus("ok");
    } catch {
      setGpsStatus("error");
      toast({
        title: "GPS unavailable",
        description: "Enable location access to submit mission proof.",
        variant: "destructive",
      });
    }
  }

  const canSubmit = !!photoDataUrl && gpsStatus === "ok" && !submitMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col"
      style={{ background: "rgba(0,0,0,0.85)" }}
      data-testid="sheet-mission-proof"
    >
      {/* Drag handle + header */}
      <div
        className="rounded-t-3xl px-4 pt-5 pb-4"
        style={{ background: "#0e0f16", borderTop: "1px solid rgba(139,92,246,0.3)", marginTop: "auto" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: "#a78bfa" }}>
              GUBER Mission Proof
            </p>
            <p className="text-base font-bold mt-0.5" style={{ color: "#f3f4f6", fontFamily: "Inter, sans-serif" }}>
              {missionTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
            data-testid="button-close-proof-sheet"
          >
            <X className="w-4 h-4" style={{ color: "#9ca3af" }} />
          </button>
        </div>

        {/* Photo section */}
        <div className="mb-4">
          {photoDataUrl ? (
            <div className="relative">
              <img
                src={photoDataUrl}
                alt="Mission proof"
                className="w-full h-40 object-cover rounded-xl"
                data-testid="img-mission-proof"
              />
              <button
                onClick={() => { setPhotoDataUrl(null); setGpsLat(null); setGpsLng(null); setGpsStatus("idle"); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.6)" }}
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
              {/* GPS indicator */}
              <div
                className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: gpsStatus === "ok" ? "rgba(22,163,74,0.85)" : "rgba(245,158,11,0.85)",
                  color: "#fff",
                }}
              >
                {gpsStatus === "locating" ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : gpsStatus === "ok" ? (
                  <CheckCircle className="w-2.5 h-2.5" />
                ) : (
                  <AlertTriangle className="w-2.5 h-2.5" />
                )}
                {gpsStatus === "locating" ? "Getting GPS…" : gpsStatus === "ok" ? "GPS locked" : "GPS failed"}
              </div>
            </div>
          ) : (
            <button
              onClick={capturePhoto}
              className="w-full h-36 rounded-xl flex flex-col items-center justify-center gap-3 active:scale-98 transition-all"
              style={{ background: "rgba(139,92,246,0.1)", border: "2px dashed rgba(139,92,246,0.4)" }}
              data-testid="button-capture-photo"
            >
              <Camera className="w-8 h-8" style={{ color: "#a78bfa" }} />
              <span className="text-sm font-bold" style={{ color: "#a78bfa", fontFamily: "Inter, sans-serif" }}>
                {isNative ? "Take Photo (live camera)" : "Take Photo"}
              </span>
              <span className="text-[10px]" style={{ color: "rgba(167,139,250,0.6)" }}>
                Gallery photos are not accepted — live camera only
              </span>
            </button>
          )}
          {captureError && (
            <p className="text-xs mt-1 text-red-400">{captureError}</p>
          )}
          {/* Hidden file input for web — enforce camera capture */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-photo-capture"
          />
        </div>

        {/* Business name */}
        <div className="mb-3">
          <label className="text-[11px] font-bold mb-1 block" style={{ color: "rgba(243,244,246,0.6)", fontFamily: "Inter, sans-serif" }}>
            Business Name (optional)
          </label>
          <input
            type="text"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="e.g. Joe's Auto Repair"
            className="w-full h-10 px-3 rounded-xl text-sm bg-transparent outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f3f4f6",
              fontFamily: "Inter, sans-serif",
            }}
            data-testid="input-business-name"
          />
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="text-[11px] font-bold mb-1 block" style={{ color: "rgba(243,244,246,0.6)", fontFamily: "Inter, sans-serif" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any details that help our reviewers verify this…"
            rows={3}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f3f4f6",
              fontFamily: "Inter, sans-serif",
            }}
            data-testid="textarea-mission-notes"
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit}
          className="w-full h-12 rounded-2xl text-sm font-black tracking-wide active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: canSubmit ? "#7c3aed" : "#374151", color: "#fff", fontFamily: "Inter, sans-serif" }}
          data-testid="button-submit-mission-proof"
        >
          {submitMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          ) : !photoDataUrl ? (
            <><Camera className="w-4 h-4" /> Take Photo to Continue</>
          ) : gpsStatus !== "ok" ? (
            <><MapPin className="w-4 h-4" /> Waiting for GPS…</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Submit Proof</>
          )}
        </button>

        <p className="text-center text-[10px] mt-2" style={{ color: "rgba(156,163,175,0.6)", fontFamily: "Inter, sans-serif" }}>
          Photos are reviewed by GUBER admins · Credits awarded on approval
        </p>
      </div>
    </div>
  );
}
