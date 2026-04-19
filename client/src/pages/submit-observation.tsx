import { useState, useRef } from "react";
import { gpsGetCurrentPosition } from "@/lib/gps";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Navigation, Camera, X, MapPin, AlertTriangle, Eye, Plus } from "lucide-react";

const OBSERVATION_TYPES = [
  "Property Condition",
  "Vehicle Condition",
  "Business Activity",
  "Infrastructure Issue",
  "Environmental Hazard",
  "Code Violation",
  "Safety Concern",
  "Abandoned Property",
  "Signage / Branding",
  "General Observation",
];

async function uploadToCloudinary(file: File): Promise<string> {
  const signRes = await fetch("/api/upload-photo/sign", {
    method: "POST",
    credentials: "include",
  });
  if (!signRes.ok) throw new Error("Could not get upload token");
  const { signature, timestamp, cloud_name, api_key, folder } = await signRes.json();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);
  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!uploadRes.ok) throw new Error("Upload failed");
  const data = await uploadRes.json();
  return data.secure_url as string;
}

export default function SubmitObservation() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [observationType, setObservationType] = useState("");
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [photos, setPhotos] = useState<{ url: string; preview: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleGPS = () => {
    setGpsLoading(true);
    gpsGetCurrentPosition({ timeout: 10000 })
      .then(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsLat(latitude);
        setGpsLng(longitude);
        try {
          const resp = await fetch(`/api/places/reverse-geocode?lat=${latitude}&lng=${longitude}`, { credentials: "include" });
          if (resp.ok) {
            const data = await resp.json();
            setAddress(data.address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          } else {
            setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            toast({ title: "Location captured", description: "Enter address manually for accuracy." });
          }
        } catch {
          setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        setGpsLoading(false);
      })
      .catch(() => {
        toast({ title: "Location denied", description: "Please allow location access.", variant: "destructive" });
        setGpsLoading(false);
      });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (photos.length + files.length > 5) {
      toast({ title: "Max 5 photos", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        const preview = URL.createObjectURL(file);
        const url = await uploadToCloudinary(file);
        setPhotos(prev => [...prev, { url, preview }]);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/observations", {
        observationType,
        locationLat: gpsLat,
        locationLng: gpsLng,
        address,
        photoURLs: photos.map(p => p.url),
        notes: notes || null,
        tags,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Submission failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: "Observation Submitted!", description: "Your observation is now in the marketplace." });
      setLocation("/dashboard");
    },
    onError: (err: any) => {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = observationType && gpsLat !== null && gpsLng !== null && address && photos.length >= 1;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-submit-observation">
        <h1 className="text-xl font-display font-bold mb-1 tracking-tight">Submit Observation</h1>
        <p className="text-sm text-muted-foreground mb-5">Earn by submitting real-world observations that businesses can purchase</p>

        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-display font-bold text-amber-300 uppercase tracking-wider mb-1">Legal Notice</p>
            <p className="text-[11px] text-amber-400/70 leading-relaxed">
              Only document publicly visible information from public areas. No trespassing, no confrontation, no enforcement. You are acting as a neutral observer only.
            </p>
          </div>
        </div>

        <Card className="glass-card rounded-xl p-6 space-y-5">

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Observation Type <span className="text-destructive">*</span></Label>
            <Select value={observationType} onValueChange={setObservationType}>
              <SelectTrigger className="premium-input rounded-md" data-testid="select-observation-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {OBSERVATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">GPS Location <span className="text-destructive">*</span></Label>
            <Button
              variant="outline"
              className="w-full rounded-md premium-input justify-start gap-2"
              onClick={handleGPS}
              disabled={gpsLoading}
              data-testid="button-capture-gps"
            >
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4 text-primary" />}
              {gpsLat !== null ? `${gpsLat.toFixed(5)}, ${gpsLng?.toFixed(5)}` : "Capture GPS Location"}
            </Button>
            {gpsLat !== null && (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> GPS captured
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Address <span className="text-destructive">*</span></Label>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Enter address or it will auto-fill from GPS"
              className="premium-input rounded-md"
              data-testid="input-address"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
              Photos <span className="text-destructive">*</span>
              <span className="text-muted-foreground ml-2 normal-case tracking-normal">(min 1, max 5)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/30">
                  <img src={p.preview} alt="photo" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(idx)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    data-testid={`button-remove-photo-${idx}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg border border-dashed border-border/40 flex flex-col items-center justify-center gap-1 hover:border-primary/40 transition-colors"
                  disabled={uploadingPhoto}
                  data-testid="button-add-photo"
                >
                  {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Camera className="w-5 h-5 text-muted-foreground" />}
                  <span className="text-[9px] text-muted-foreground">Add Photo</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
              data-testid="input-photos"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Description</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              placeholder="Describe what you observed (500 chars max)..."
              className="premium-input rounded-md min-h-[80px]"
              maxLength={500}
              data-testid="input-notes"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Tags</Label>
            <Input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="e.g. damaged, vacant, commercial (comma-separated)"
              className="premium-input rounded-md"
              data-testid="input-tags"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Eye className="w-3 h-3" />
              <span>Businesses will see blurred photos and hidden address until they purchase</span>
            </div>

            <Button
              className="w-full premium-btn font-display tracking-[0.1em]"
              disabled={!canSubmit || submitMutation.isPending || uploadingPhoto}
              onClick={() => submitMutation.mutate()}
              data-testid="button-submit-observation"
            >
              {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              SUBMIT OBSERVATION
            </Button>

            {gpsLat === null && (
              <p className="text-[10px] text-destructive/70 text-center">GPS location required before submitting</p>
            )}
            {photos.length === 0 && (
              <p className="text-[10px] text-destructive/70 text-center">At least one photo required</p>
            )}
          </div>

        </Card>
      </div>
    </GuberLayout>
  );
}
