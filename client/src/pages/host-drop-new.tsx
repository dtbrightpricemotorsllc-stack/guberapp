import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLayout } from "@/components/guber-layout";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gpsGetCurrentPosition } from "@/lib/gps";
import { DollarSign, MapPin, Loader2, ChevronLeft, Info, Camera, X } from "lucide-react";

async function uploadLogoToCloudinary(file: File): Promise<string> {
  const signRes = await fetch("/api/upload-photo/sign", { method: "POST", credentials: "include" });
  if (!signRes.ok) throw new Error("Could not get upload token");
  const { signature, timestamp, cloud_name, api_key, folder } = await signRes.json();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);
  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, { method: "POST", body: formData });
  if (!uploadRes.ok) throw new Error("Upload failed");
  const data = await uploadRes.json();
  return data.secure_url as string;
}

export default function HostDropNew() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardPerWinner, setRewardPerWinner] = useState("");
  const [winnerLimit, setWinnerLimit] = useState("1");
  const [clueText, setClueText] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [gpsRadius, setGpsRadius] = useState("200");
  const [locating, setLocating] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hostLogo, setHostLogo] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const resp = await apiRequest("POST", "/api/cash-drops/host/create", body);
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.needsApproval) {
        toast({ title: "Drop Submitted", description: "Your GUBER Drop has been submitted for admin approval." });
      } else {
        toast({ title: "Drop Created!", description: "Your GUBER Drop is now live on the map." });
      }
      navigate("/dashboard");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleLocate = async () => {
    setLocating(true);
    try {
      const pos = await gpsGetCurrentPosition();
      setGpsLat(String(pos.coords.latitude));
      setGpsLng(String(pos.coords.longitude));
      toast({ title: "Location set", description: "Drop location set to your current position." });
    } catch {
      toast({ title: "Location unavailable", description: "Could not get your current location.", variant: "destructive" });
    } finally {
      setLocating(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const url = await uploadLogoToCloudinary(file);
      setHostLogo(url);
      toast({ title: "Logo uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  if (!user?.cashDropHostEnabled) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-display font-bold mb-2">Host Drop Access Required</h1>
          <p className="text-sm text-muted-foreground">You don't have permission to host GUBER Drops. Contact an admin to get access.</p>
        </div>
      </GuberLayout>
    );
  }

  const brandName = user?.cashDropBrandName;
  const brandLogo = user?.cashDropBrandLogo;
  const resolvedLogo = hostLogo || brandLogo || "";

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-host-drop-new">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider mb-6 transition-colors"
          data-testid="button-back"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          BACK
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-display font-bold tracking-tight mb-1">Start a GUBER Drop</h1>
          {brandName && (
            <div className="flex items-center gap-2 mt-2">
              {resolvedLogo && <img src={resolvedLogo} alt={brandName} className="w-6 h-6 rounded-full object-cover" />}
              <span className="text-xs text-muted-foreground font-display">Hosting as <span className="text-foreground font-semibold">{brandName}</span></span>
            </div>
          )}
        </div>

        <div
          className="mb-5 p-3 rounded-xl flex items-start gap-2.5"
          style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}
        >
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            Your drop will be reviewed by admin before going live. You'll get a notification once it's approved.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]" data-testid="label-title">DROP TITLE</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Find Cash in Downtown Pensacola"
              className="rounded-xl"
              data-testid="input-drop-title"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">DESCRIPTION</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the drop event..."
              className="rounded-xl resize-none"
              rows={3}
              data-testid="input-drop-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">REWARD PER WINNER ($)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={rewardPerWinner}
                onChange={e => setRewardPerWinner(e.target.value)}
                placeholder="10.00"
                className="rounded-xl"
                data-testid="input-reward-amount"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">WINNER SLOTS</Label>
              <Input
                type="number"
                min="1"
                value={winnerLimit}
                onChange={e => setWinnerLimit(e.target.value)}
                className="rounded-xl"
                data-testid="input-winner-limit"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">DROP PIN LOGO <span className="text-destructive">*</span></Label>
            <p className="text-[10px] text-muted-foreground -mt-1">This logo will appear on the map as your drop pin. Required.</p>
            {resolvedLogo && (
              <div className="flex items-center gap-3">
                <img src={resolvedLogo} alt="Drop pin logo" className="w-10 h-10 rounded-full object-cover border-2 border-amber-500/40" />
                {hostLogo && (
                  <button
                    onClick={() => setHostLogo("")}
                    className="text-[10px] text-destructive flex items-center gap-1"
                    data-testid="button-remove-logo"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
            )}
            <label className="cursor-pointer">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleLogoUpload(file);
                }}
                data-testid="input-logo-upload"
              />
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/20 bg-muted/5 text-xs text-muted-foreground hover:text-foreground hover:border-border/40 transition-colors cursor-pointer w-fit">
                {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {logoUploading ? "Uploading..." : hostLogo ? "Replace logo" : "Upload logo"}
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">CLUE TEXT (optional)</Label>
            <Textarea
              value={clueText}
              onChange={e => setClueText(e.target.value)}
              placeholder="Give participants a clue to find the drop..."
              className="rounded-xl resize-none"
              rows={2}
              data-testid="input-clue-text"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">GPS LOCATION</Label>
              <button
                onClick={handleLocate}
                disabled={locating}
                className="flex items-center gap-1 text-[10px] font-display text-primary/70 hover:text-primary transition-colors"
                data-testid="button-use-location"
              >
                {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                Use my location
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input
                value={gpsLat}
                onChange={e => setGpsLat(e.target.value)}
                placeholder="Latitude"
                className="rounded-xl text-xs"
                data-testid="input-gps-lat"
              />
              <Input
                value={gpsLng}
                onChange={e => setGpsLng(e.target.value)}
                placeholder="Longitude"
                className="rounded-xl text-xs"
                data-testid="input-gps-lng"
              />
              <Input
                type="number"
                value={gpsRadius}
                onChange={e => setGpsRadius(e.target.value)}
                placeholder="Radius (m)"
                className="rounded-xl text-xs"
                data-testid="input-gps-radius"
              />
            </div>
            {gpsLat && gpsLng && (
              <p className="text-[10px] text-muted-foreground">
                Location set: {parseFloat(gpsLat).toFixed(4)}, {parseFloat(gpsLng).toFixed(4)} · {gpsRadius}m radius
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">START TIME (optional)</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="rounded-xl text-xs"
                data-testid="input-start-time"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">END TIME (optional)</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="rounded-xl text-xs"
                data-testid="input-end-time"
              />
            </div>
          </div>

          {!resolvedLogo && (
            <p className="text-[11px] text-destructive text-center">A brand logo is required before submitting your drop.</p>
          )}

          <Button
            className="w-full h-14 font-display tracking-[0.15em] text-sm font-bold rounded-2xl"
            style={{ background: "linear-gradient(135deg,#C9A84C,#a8873c)", color: "#000" }}
            disabled={!title || !rewardPerWinner || !resolvedLogo || createMutation.isPending || logoUploading}
            onClick={() => createMutation.mutate({
              title,
              description: description || undefined,
              rewardPerWinner,
              winnerLimit,
              clueText: clueText || undefined,
              gpsLat: gpsLat || undefined,
              gpsLng: gpsLng || undefined,
              gpsRadius,
              startTime: startTime || undefined,
              endTime: endTime || undefined,
              hostLogo: hostLogo || undefined,
            })}
            data-testid="button-submit-host-drop"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <DollarSign className="w-5 h-5 mr-2" />
                CREATE GUBER DROP
              </>
            )}
          </Button>
        </div>
      </div>
    </GuberLayout>
  );
}
