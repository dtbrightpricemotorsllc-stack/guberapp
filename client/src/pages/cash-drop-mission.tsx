/**
 * CashDropMission — Worker-facing placement mission page
 *
 * Flow: ACCEPT MISSION → PICKUP → START → TRAVEL → DROP → VERIFY DROP → COMPLETE
 *
 * The worker (hostUserId on the cashDrop record) physically places the sponsored drop.
 * GPS + photo proof required before the public activation releases.
 *
 * Safety: no trespassing, dangerous locations, or restricted-property instructions are
 * ever provided. All locations are approved by admin before this page is reachable.
 */

import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { GuberLayout } from "@/components/guber-layout";
import { GubeeActionPanel } from "@/components/gubee-action-panel";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Clock, DollarSign, CheckCircle, Camera, Navigation,
  Shield, AlertTriangle, ChevronRight, Loader2, Package,
} from "lucide-react";

type MissionStep =
  | "awaiting_acceptance"
  | "accepted"
  | "in_transit"
  | "at_location"
  | "proof_submitted"
  | "complete";

interface StepConfig {
  id: MissionStep;
  label: string;
  description: string;
  actionLabel?: string;
  nextStep?: MissionStep;
}

const STEPS: StepConfig[] = [
  {
    id: "awaiting_acceptance",
    label: "ACCEPT MISSION",
    description: "Review the mission details. You must personally decide whether to accept.",
    actionLabel: "ACCEPT MISSION",
    nextStep: "accepted",
  },
  {
    id: "accepted",
    label: "PICKUP",
    description: "Retrieve the drop package from the designated pickup point. Use the pickup code when prompted.",
    actionLabel: "CONFIRM PICKUP — START MISSION",
    nextStep: "in_transit",
  },
  {
    id: "in_transit",
    label: "TRAVEL",
    description: "Travel to the approved drop location. JAC will send you the final location instructions.",
    actionLabel: "I'VE ARRIVED — DROP IT HERE",
    nextStep: "at_location",
  },
  {
    id: "at_location",
    label: "DROP & VERIFY",
    description: "Place the drop in the approved location. Take a photo and record your GPS to verify placement.",
    actionLabel: "SUBMIT PROOF & COMPLETE",
    nextStep: "proof_submitted",
  },
  {
    id: "proof_submitted",
    label: "VERIFYING",
    description: "Your proof is being reviewed. The public activation will release once verified.",
  },
  {
    id: "complete",
    label: "COMPLETE",
    description: "Mission complete. Your reward will be processed.",
  },
];

const STEP_ORDER: MissionStep[] = [
  "awaiting_acceptance",
  "accepted",
  "in_transit",
  "at_location",
  "proof_submitted",
  "complete",
];

function stepIndex(s: MissionStep) {
  return STEP_ORDER.indexOf(s);
}

function localStepKey(dropId: string) {
  return `guber.drop_mission_step_${dropId}`;
}

function loadLocalStep(dropId: string): MissionStep {
  try {
    const v = localStorage.getItem(localStepKey(dropId));
    if (v && STEP_ORDER.includes(v as MissionStep)) return v as MissionStep;
  } catch {}
  return "awaiting_acceptance";
}

function saveLocalStep(dropId: string, step: MissionStep) {
  try { localStorage.setItem(localStepKey(dropId), step); } catch {}
}

export default function CashDropMission() {
  const [, params] = useRoute("/cash-drop-mission/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const dropId = params?.id ?? "";

  const [step, setStepRaw] = useState<MissionStep>(() => loadLocalStep(dropId));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function setStep(s: MissionStep) {
    setStepRaw(s);
    saveLocalStep(dropId, s);
  }

  // Fetch the cash drop details
  const { data: drop, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/cash-drops/${dropId}`],
    queryFn: async () => {
      const res = await fetch(`/api/cash-drops/${dropId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!dropId,
  });

  // Accept mission mutation
  const acceptMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/cash-drop-mission/${dropId}/accept`, {}),
    onSuccess: () => {
      setStep("accepted");
      toast({ title: "Mission accepted!", description: "Gubee is tracking your progress." });
      qc.invalidateQueries({ queryKey: [`/api/cash-drops/${dropId}`] });
    },
    onError: () => {
      toast({ title: "Error accepting mission", variant: "destructive" });
    },
  });

  // Complete mission mutation — sends GPS + photo proof
  const completeMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        gpsLat: gpsPos?.lat,
        gpsLng: gpsPos?.lng,
      };
      if (photoFile) {
        // Convert file to base64 for upload
        const b64 = await fileToBase64(photoFile);
        body.photoData = b64;
        body.photoMime = photoFile.type;
      }
      return apiRequest("POST", `/api/cash-drop-mission/${dropId}/complete`, body);
    },
    onSuccess: () => {
      setStep("proof_submitted");
      toast({ title: "Proof submitted!", description: "Activation will release after verification." });
      qc.invalidateQueries({ queryKey: [`/api/cash-drops/${dropId}`] });
    },
    onError: () => {
      toast({ title: "Error submitting proof", variant: "destructive" });
    },
  });

  // Get GPS when user reaches drop location step
  useEffect(() => {
    if (step !== "at_location") return;
    if (!navigator.geolocation) {
      setGpsError("GPS not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError("Could not get GPS. Please enable location access."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, [step]);

  // Sync server status back to local step if mission was already advanced
  useEffect(() => {
    if (!drop) return;
    const serverStatus: string = drop.placementStatus ?? drop.status ?? "";
    if (serverStatus === "placement_complete" || serverStatus === "active") {
      if (stepIndex(step) < stepIndex("proof_submitted")) {
        setStep("proof_submitted");
      }
    }
  }, [drop]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function advanceStep() {
    const current = STEPS.find((s) => s.id === step);
    if (!current?.nextStep) return;

    if (step === "awaiting_acceptance") {
      acceptMutation.mutate();
      return;
    }
    if (step === "at_location") {
      if (!photoFile) {
        toast({ title: "Photo required", description: "Please take a photo to verify the drop location.", variant: "destructive" });
        return;
      }
      completeMutation.mutate();
      return;
    }
    setStep(current.nextStep);
  }

  const currentStepConfig = STEPS.find((s) => s.id === step) ?? STEPS[0];
  const currentStepIndex = stepIndex(step);

  if (!dropId) return null;

  if (isLoading) {
    return (
      <GuberLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400/60" />
        </div>
      </GuberLayout>
    );
  }

  if (isError || !drop) {
    return (
      <GuberLayout>
        <div className="px-5 py-10 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-red-400/60" />
          <p className="font-display font-bold text-white/70">Mission not found.</p>
          <button onClick={() => navigate("/cash-drops")} className="mt-4 text-sm text-amber-400 underline">
            Back to Cash Drops
          </button>
        </div>
      </GuberLayout>
    );
  }

  // Gate: only the assigned host worker can access this page
  if (drop.hostUserId && (user as any)?.id && drop.hostUserId !== (user as any)?.id) {
    return (
      <GuberLayout>
        <div className="px-5 py-10 text-center">
          <Shield className="w-10 h-10 mx-auto mb-4 text-amber-400/50" />
          <p className="font-display font-bold text-white/70">This mission is assigned to a different Team GUBER member.</p>
        </div>
      </GuberLayout>
    );
  }

  const sponsorAttr = drop.isSponsored && drop.sponsorName
    ? `Presented by ${drop.sponsorName}`
    : drop.isHostDrop && drop.sponsorName
    ? `In partnership with ${drop.sponsorName}`
    : undefined;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[9px] font-display font-black tracking-[0.2em] uppercase"
              style={{ color: "rgba(245,158,11,0.7)" }}
            >
              Team GUBER Mission
            </span>
            {sponsorAttr && (
              <span
                className="text-[9px] font-display tracking-widest"
                style={{
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  color: "rgba(245,158,11,0.55)",
                  padding: "1px 7px",
                  borderRadius: 99,
                }}
              >
                {sponsorAttr}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-display font-black text-amber-300 tracking-tight leading-tight">
            {drop.title ?? "Cash Drop Placement"}
          </h1>
          {drop.description && (
            <p className="text-sm text-white/50 mt-1 leading-relaxed">{drop.description}</p>
          )}
        </div>

        {/* Mission details bar */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: DollarSign, label: "Reward", value: drop.rewardPerWinner != null ? `$${Number(drop.rewardPerWinner).toFixed(2)}` : "—" },
            { icon: MapPin, label: "Zone", value: drop.clueText ? "See instructions" : "Admin-approved" },
            { icon: Clock, label: "Status", value: step === "complete" ? "Done" : step === "proof_submitted" ? "Verifying" : "Active" },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              style={{
                borderRadius: 12,
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.16)",
                padding: "10px 12px",
              }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className="w-3 h-3" style={{ color: "rgba(245,158,11,0.6)" }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(245,158,11,0.5)", textTransform: "uppercase" }}>{label}</span>
              </div>
              <p style={{ fontSize: 12, fontWeight: 900, color: "rgba(245,200,100,0.9)" }} className="font-display">{value}</p>
            </div>
          ))}
        </div>

        {/* Step progress */}
        <div
          style={{
            borderRadius: 16,
            background: "rgba(245,158,11,0.04)",
            border: "1px solid rgba(245,158,11,0.14)",
            padding: "14px 16px",
          }}
        >
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "rgba(245,158,11,0.5)", textTransform: "uppercase", marginBottom: 10 }}>
            Mission Progress
          </p>
          <div className="flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const isDone = stepIndex(s.id) < currentStepIndex;
              const isCurrent = s.id === step;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3"
                  style={{ opacity: stepIndex(s.id) > currentStepIndex + 1 ? 0.3 : 1 }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      flexShrink: 0,
                      background: isDone
                        ? "rgba(34,197,94,0.2)"
                        : isCurrent
                        ? "rgba(245,158,11,0.25)"
                        : "rgba(255,255,255,0.05)",
                      border: isDone
                        ? "1.5px solid rgba(34,197,94,0.5)"
                        : isCurrent
                        ? "1.5px solid rgba(245,158,11,0.6)"
                        : "1px solid rgba(255,255,255,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isDone ? (
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: "rgba(34,197,94,0.8)" }} />
                    ) : isCurrent ? (
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: "rgba(245,158,11,0.9)" }} />
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>{i + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: isCurrent ? 900 : 600,
                        color: isDone ? "rgba(34,197,94,0.7)" : isCurrent ? "rgba(245,200,100,0.9)" : "rgba(255,255,255,0.35)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                      className="font-display"
                    >
                      {s.label}
                    </p>
                    {isCurrent && (
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.4 }}>
                        {s.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Safety notice — always visible */}
        <div
          style={{
            borderRadius: 12,
            background: "rgba(239,68,68,0.05)",
            border: "1px solid rgba(239,68,68,0.15)",
            padding: "10px 14px",
          }}
        >
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "rgba(239,68,68,0.6)" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
              <strong style={{ color: "rgba(239,68,68,0.7)" }}>Safety first.</strong>{" "}
              Only use approved locations. Do not trespass, enter restricted areas, obstruct traffic,
              or place drops in unsafe locations. If something feels wrong, cancel the mission.
            </p>
          </div>
        </div>

        {/* Drop instructions */}
        {drop.clueText && (step === "in_transit" || step === "at_location") && (
          <div
            style={{
              borderRadius: 14,
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.2)",
              padding: "14px 16px",
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "rgba(245,158,11,0.6)", textTransform: "uppercase", marginBottom: 6 }}>
              Drop Location Instructions
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>{drop.clueText}</p>
          </div>
        )}

        {/* Photo capture — only at_location step */}
        {step === "at_location" && (
          <div
            style={{
              borderRadius: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "14px 16px",
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
              Proof Photo Required
            </p>
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Drop proof"
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: 220 }}
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                >
                  Retake
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%",
                  height: 120,
                  borderRadius: 12,
                  background: "rgba(245,158,11,0.06)",
                  border: "1.5px dashed rgba(245,158,11,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
                data-testid="button-take-photo"
              >
                <Camera className="w-8 h-8" style={{ color: "rgba(245,158,11,0.5)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,158,11,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Take Drop Photo
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handlePhotoChange}
              data-testid="input-photo-capture"
            />

            {/* GPS status */}
            <div className="flex items-center gap-2 mt-3">
              <Navigation className="w-3.5 h-3.5 flex-shrink-0" style={{ color: gpsPos ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.3)" }} />
              <p style={{ fontSize: 11, color: gpsPos ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.4)" }}>
                {gpsPos
                  ? `GPS recorded (${gpsPos.lat.toFixed(4)}, ${gpsPos.lng.toFixed(4)})`
                  : gpsError ?? "Acquiring GPS…"}
              </p>
            </div>
          </div>
        )}

        {/* GubeeActionPanel — human action gate */}
        {step !== "proof_submitted" && step !== "complete" && (
          <GubeeActionPanel
            title={currentStepConfig.label}
            subtitle={
              step === "awaiting_acceptance"
                ? "You must personally decide to accept this mission. JAC will coordinate once you do."
                : step === "accepted"
                ? "Retrieve the drop package from the pickup point using your pickup code."
                : step === "in_transit"
                ? "Gubee is tracking your travel. Tap when you arrive at the approved location."
                : "Submit your photo and GPS proof. The public hunt releases after verification."
            }
            sponsorAttribution={sponsorAttr}
            mascotMode={step === "awaiting_acceptance" ? "ready" : "active"}
            details={
              step === "awaiting_acceptance"
                ? [
                    { icon: "dollar", label: "Reward", value: drop.rewardPerWinner != null ? `$${Number(drop.rewardPerWinner).toFixed(2)}` : "—" },
                    { icon: "map", label: "Area", value: drop.targetCityState ?? "See details" },
                    { icon: "clock", label: "Est. Time", value: "20–40 min" },
                  ]
                : undefined
            }
            actions={[
              {
                label: currentStepConfig.actionLabel ?? "CONTINUE",
                onClick: advanceStep,
                primary: true,
                loading: acceptMutation.isPending || completeMutation.isPending,
                disabled: step === "at_location" && (!photoFile || (!gpsPos && !gpsError)),
                testId: `button-mission-action-${step}`,
              },
              ...(step === "awaiting_acceptance"
                ? [{
                    label: "Not now",
                    onClick: () => navigate("/cash-drops"),
                    testId: "button-mission-decline",
                  }]
                : []),
            ]}
            footerNote={
              step === "awaiting_acceptance"
                ? "Your personal decision. JAC hands control back to you at every gate."
                : step === "proof_submitted"
                ? "Reward processed after admin verification."
                : undefined
            }
          />
        )}

        {/* Completion state */}
        {(step === "proof_submitted" || step === "complete") && (
          <div
            style={{
              borderRadius: 20,
              background: "linear-gradient(160deg, rgba(34,197,94,0.07) 0%, rgba(0,0,0,0) 100%)",
              border: "1.5px solid rgba(34,197,94,0.22)",
              padding: "24px 20px",
              textAlign: "center",
            }}
            data-testid="panel-mission-complete"
          >
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(34,197,94,0.8)" }} />
            <h3 className="font-display font-black text-lg text-green-300 mb-2">
              {step === "complete" ? "Mission Complete" : "Proof Submitted"}
            </h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              {step === "complete"
                ? "Great work, Team GUBER. Your reward has been queued for processing."
                : "Your placement proof is under review. Once verified, the public activation goes live and Gubee will announce the drop."}
            </p>
            <button
              onClick={() => navigate("/cash-drops")}
              className="mt-5 font-display font-bold text-xs tracking-widest h-11 px-8 rounded-xl"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "rgba(34,197,94,0.8)" }}
              data-testid="button-back-to-drops"
            >
              BACK TO CASH DROPS
            </button>
          </div>
        )}

      </div>
    </GuberLayout>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
