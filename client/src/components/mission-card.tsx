import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Zap, CheckCircle, Clock, Camera, ChevronRight, Star, Coins, MapPin, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface MissionTemplate {
  id: number;
  emoji: string;
  title: string;
  description: string | null;
  rewardCredits: number;
  ogBonusPct: number;
  category: string;
  activeStatus: string | null;
  effectiveCredits: number;
  isOG: boolean;
}

interface MissionCardProps {
  mission: MissionTemplate;
  userZip?: string;
  userLat?: number;
  userLng?: number;
  onAccepted?: (instanceId: number) => void;
  onOpenProof?: (instanceId: number, missionTitle: string) => void;
  compact?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  in_progress: "In Progress",
  proof_submitted: "Under Review",
};

const STATUS_COLOR: Record<string, string> = {
  accepted: "#f59e0b",
  in_progress: "#3b82f6",
  proof_submitted: "#8b5cf6",
};

const CATEGORY_LABEL: Record<string, string> = {
  referral:   "GUBER GROWTH TASK",
  community:  "GUBER COMMUNITY TASK",
  scout:      "GUBER SCOUT TASK",
};

function categoryLabel(cat: string) {
  return CATEGORY_LABEL[cat] ?? "GUBER MISSION";
}

export function MissionCard({
  mission,
  userZip,
  userLat,
  userLng,
  onAccepted,
  onOpenProof,
  compact = false,
}: MissionCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [acceptedInstanceId, setAcceptedInstanceId] = useState<number | null>(null);

  const currentStatus = mission.activeStatus;
  const isActive = !!currentStatus;
  const isDouble = mission.isOG && mission.ogBonusPct >= 100;

  const acceptMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/missions/${mission.id}/accept`, {
        zip: userZip,
        lat: userLat,
        lng: userLng,
      }),
    onSuccess: async (data: any) => {
      setAcceptedInstanceId(data.instanceId);
      await queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/missions/active"] });
      toast({ title: "Mission accepted!", description: "Tap 'Submit Proof' when you're ready." });
      onAccepted?.(data.instanceId);
    },
    onError: (err: any) => {
      toast({ title: "Could not accept mission", description: err.message, variant: "destructive" });
    },
  });

  const displayCredits = mission.effectiveCredits;

  return (
    <>
      {/* ── Tappable summary card ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={e => e.key === "Enter" && setOpen(true)}
        className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform select-none"
        style={{
          background: "rgba(14,15,22,0.85)",
          border: "1px solid rgba(139,92,246,0.25)",
          backdropFilter: "blur(12px)",
        }}
        data-testid={`card-mission-${mission.id}`}
      >
        {/* Header strip */}
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ background: "rgba(139,92,246,0.18)", borderBottom: "1px solid rgba(139,92,246,0.2)" }}
        >
          <Zap className="w-3 h-3" style={{ color: "#a78bfa" }} />
          <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: "#a78bfa", fontFamily: "Inter, sans-serif" }}>
            {categoryLabel(mission.category)}
          </span>
          {isDouble && (
            <span
              className="ml-auto text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(234,179,8,0.2)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.35)" }}
            >
              2× OG
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">{mission.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight" style={{ color: "#f3f4f6", fontFamily: "Inter, sans-serif" }}>
                {mission.title}
              </p>
              {!compact && mission.description && (
                <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: "rgba(243,244,246,0.55)", fontFamily: "Inter, sans-serif" }}>
                  {mission.description}
                </p>
              )}
            </div>

            {/* Right side: credit + chevron */}
            <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
              <span className="text-sm font-black" style={{ color: "#4ade80", fontFamily: "Inter, sans-serif" }} data-testid={`text-mission-credits-${mission.id}`}>
                +{displayCredits.toLocaleString()}
              </span>
              <span className="text-[9px] font-semibold" style={{ color: "rgba(74,222,128,0.65)" }}>
                credits
              </span>
            </div>
            <ChevronRight className="w-4 h-4 self-center ml-1 flex-shrink-0" style={{ color: "rgba(139,92,246,0.6)" }} />
          </div>

          {/* Status row (if already accepted) */}
          {isActive && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: `${STATUS_COLOR[currentStatus] ?? "#6b7280"}22`,
                  border: `1px solid ${STATUS_COLOR[currentStatus] ?? "#6b7280"}44`,
                  color: STATUS_COLOR[currentStatus] ?? "#9ca3af",
                }}
                data-testid={`badge-mission-status-${mission.id}`}
              >
                {currentStatus === "proof_submitted" ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle className="w-2.5 h-2.5" />}
                {STATUS_LABEL[currentStatus] ?? currentStatus}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Sheet ── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-10"
          style={{ background: "#0a0b11", border: "1px solid rgba(139,92,246,0.3)", maxHeight: "90vh", overflowY: "auto" }}
        >
          {/* Purple accent bar */}
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(139,92,246,0.5)" }} />

          <SheetHeader className="px-5 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: "#a78bfa" }}>
                {categoryLabel(mission.category)}
              </span>
              {isDouble && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "rgba(234,179,8,0.2)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.35)" }}>
                  2× OG BONUS
                </span>
              )}
            </div>
            <SheetTitle className="text-xl font-black flex items-center gap-3" style={{ color: "#f3f4f6", fontFamily: "Inter, sans-serif" }}>
              <span className="text-3xl">{mission.emoji}</span>
              {mission.title}
            </SheetTitle>
          </SheetHeader>

          <div className="px-5 space-y-5 mt-2">
            {/* Description */}
            {mission.description && (
              <p className="text-sm leading-relaxed" style={{ color: "rgba(243,244,246,0.7)" }}>
                {mission.description}
              </p>
            )}

            {/* Reward breakdown */}
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}
            >
              <p className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: "#a78bfa" }}>
                Mission Reward
              </p>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4" style={{ color: "#4ade80" }} />
                <span className="text-lg font-black" style={{ color: "#4ade80" }}>
                  +{displayCredits.toLocaleString()} credits
                </span>
              </div>
              {mission.isOG && mission.ogBonusPct > 0 && (
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
                  <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
                    Day-1 OG bonus +{mission.ogBonusPct}% already applied
                  </span>
                </div>
              )}
              {userZip && (
                <div className="flex items-center gap-2 pt-1">
                  <MapPin className="w-3.5 h-3.5" style={{ color: "rgba(243,244,246,0.4)" }} />
                  <span className="text-xs" style={{ color: "rgba(243,244,246,0.45)" }}>ZIP {userZip}</span>
                </div>
              )}
            </div>

            {/* How to complete */}
            <div className="space-y-2">
              <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: "rgba(139,92,246,0.7)" }}>
                How to Complete
              </p>
              <div className="space-y-2">
                {[
                  { n: "1", text: "Accept this mission below" },
                  { n: "2", text: "Complete the task in your area" },
                  { n: "3", text: "Submit a photo as proof" },
                  { n: "4", text: "Credits land once approved" },
                ].map(step => (
                  <div key={step.n} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                      style={{ background: "rgba(139,92,246,0.25)", color: "#a78bfa" }}
                    >
                      {step.n}
                    </span>
                    <span className="text-sm" style={{ color: "rgba(243,244,246,0.65)" }}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            {isActive ? (
              <div className="space-y-3 pt-1">
                <div
                  className="flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold"
                  style={{
                    background: `${STATUS_COLOR[currentStatus] ?? "#6b7280"}22`,
                    border: `1px solid ${STATUS_COLOR[currentStatus] ?? "#6b7280"}44`,
                    color: STATUS_COLOR[currentStatus] ?? "#9ca3af",
                  }}
                  data-testid={`badge-mission-detail-status-${mission.id}`}
                >
                  {currentStatus === "proof_submitted" ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  {STATUS_LABEL[currentStatus] ?? currentStatus}
                </div>

                {(currentStatus === "accepted" || currentStatus === "in_progress") && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      const id = acceptedInstanceId;
                      if (id && onOpenProof) onOpenProof(id, mission.title);
                    }}
                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-black active:scale-[0.98] transition-transform"
                    style={{ background: "#7c3aed", color: "#fff", fontFamily: "Inter, sans-serif" }}
                    data-testid={`button-submit-proof-detail-${mission.id}`}
                  >
                    <Camera className="w-4 h-4" />
                    Submit Proof Photo
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontFamily: "Inter, sans-serif",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.45)",
                }}
                data-testid={`button-accept-mission-${mission.id}`}
              >
                {acceptMutation.isPending ? (
                  "Accepting…"
                ) : (
                  <>
                    Accept This Mission
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
