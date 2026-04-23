import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GuberLayout } from "@/components/guber-layout";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gpsGetCurrentPosition } from "@/lib/gps";
import { DollarSign, MapPin, Loader2, ChevronLeft, Info, Camera, Trash2 } from "lucide-react";

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function LogoSlotManager({ user, onLogoChange }: { user: any; onLogoChange: (logoUrl: string) => void }) {
  const { toast } = useToast();
  const [logoUploading, setLogoUploading] = useState<1 | 2 | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<1 | 2 | null>(null);
  const [localLogo1, setLocalLogo1] = useState<string | null>(user?.cashDropBrandLogo ?? null);
  const [localLogo2, setLocalLogo2] = useState<string | null>(user?.cashDropLogo2 ?? null);
  const [activeLogo, setActiveLogo] = useState<1 | 2>((user?.cashDropActiveLogo ?? 1) as 1 | 2);
  const [logo1AdminUploaded] = useState<boolean>(!!user?.cashDropLogo1AdminUploaded);
  const [logo2AdminUploaded] = useState<boolean>(!!user?.cashDropLogo2AdminUploaded);
  const logoRef1 = useRef<HTMLInputElement>(null);
  const logoRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const activeUrl = activeLogo === 1 ? localLogo1 : localLogo2;
    onLogoChange(activeUrl || localLogo1 || localLogo2 || "");
  }, [localLogo1, localLogo2, activeLogo]);

  const uploadLogo = async (slot: 1 | 2, file: File) => {
    setLogoUploading(slot);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await apiRequest("POST", `/api/users/me/cash-drop-logo`, { slot, imageBase64 });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const url = data.url as string;
      if (slot === 1) setLocalLogo1(url);
      else setLocalLogo2(url);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Logo saved" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(null);
    }
  };

  const deleteLogo = async (slot: 1 | 2) => {
    try {
      const res = await apiRequest("DELETE", `/api/users/me/cash-drop-logo/${slot}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (slot === 1) setLocalLogo1(null);
      else setLocalLogo2(null);
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Logo removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const setActive = async (slot: 1 | 2) => {
    try {
      await apiRequest("PATCH", `/api/users/me/cash-drop-logo/active`, { slot });
      setActiveLogo(slot);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <Label className="text-xs font-display text-muted-foreground tracking-[0.12em]">DROP PIN LOGOS <span className="text-destructive">*</span></Label>
      <p className="text-[10px] text-muted-foreground mt-0.5 mb-3">Upload up to 2 logos. The active one will appear as your map pin.</p>
      <div className="grid grid-cols-2 gap-3">
        {([1, 2] as const).map(slot => {
          const logoUrl = slot === 1 ? localLogo1 : localLogo2;
          const isActive = activeLogo === slot;
          const isUploading = logoUploading === slot;
          const isAdminLogo = slot === 1 ? logo1AdminUploaded : logo2AdminUploaded;
          const fileRef = slot === 1 ? logoRef1 : logoRef2;
          return (
            <div key={slot} className={`rounded-xl border p-2.5 space-y-2 transition-colors ${isActive ? "border-amber-500/50 bg-amber-500/5" : "border-border/20"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-display font-semibold text-foreground">Logo {slot}</span>
                  {isAdminLogo && <span className="text-[7px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-display font-bold">Admin</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setActive(slot)}
                  className={`text-[8px] px-1.5 py-0.5 rounded-full font-display font-bold transition-colors ${isActive ? "bg-amber-500 text-black" : "bg-muted/30 text-muted-foreground hover:bg-amber-500/20 hover:text-amber-600"}`}
                  data-testid={`button-set-active-logo-${slot}`}
                >
                  {isActive ? "ACTIVE" : "SET ACTIVE"}
                </button>
              </div>

              {logoUrl ? (
                <div className="relative group">
                  <img src={logoUrl} alt={`Logo ${slot}`} className="w-full aspect-square object-cover rounded-lg border border-border/20" />
                  {!isAdminLogo && (
                    deleteConfirm === slot ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/90 rounded-lg">
                        <button type="button" onClick={() => deleteLogo(slot)} className="text-[9px] px-2 py-1 bg-destructive text-white rounded-md font-display font-bold" data-testid={`button-confirm-delete-logo-${slot}`}>Delete</button>
                        <button type="button" onClick={() => setDeleteConfirm(null)} className="text-[9px] px-2 py-1 bg-muted text-foreground rounded-md">Cancel</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(slot)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-delete-logo-${slot}`}
                      >
                        <Trash2 className="w-2.5 h-2.5 text-white" />
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div
                  className="aspect-square rounded-lg border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-1 hover:border-amber-500/40 transition-colors bg-muted/10 cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                  data-testid={`placeholder-logo-slot-${slot}`}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-[8px] text-muted-foreground">{isUploading ? "Uploading…" : "Upload"}</span>
                </div>
              )}

              {logoUrl && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1 text-[8px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-replace-logo-${slot}`}
                >
                  {isUploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Camera className="w-2.5 h-2.5" />}
                  {isUploading ? "Uploading…" : "Replace"}
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) { await uploadLogo(slot, file); e.target.value = ""; }
                }}
                data-testid={`input-logo-file-${slot}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(
    (user as any)?.cashDropActiveLogo === 2
      ? ((user as any)?.cashDropLogo2 || user?.cashDropBrandLogo || "")
      : (user?.cashDropBrandLogo || (user as any)?.cashDropLogo2 || "")
  );

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
              {resolvedLogoUrl && <img src={resolvedLogoUrl} alt={brandName} className="w-6 h-6 rounded-full object-cover" />}
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

          <LogoSlotManager user={user} onLogoChange={setResolvedLogoUrl} />

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

          {!resolvedLogoUrl && (
            <p className="text-[11px] text-destructive text-center">A brand logo is required before submitting your drop.</p>
          )}

          <Button
            className="w-full h-14 font-display tracking-[0.15em] text-sm font-bold rounded-2xl"
            style={{ background: "linear-gradient(135deg,#C9A84C,#a8873c)", color: "#000" }}
            disabled={!title || !rewardPerWinner || !resolvedLogoUrl || createMutation.isPending}
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
