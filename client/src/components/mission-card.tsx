import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Zap, CheckCircle, Clock, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [acceptedInstanceId, setAcceptedInstanceId] = useState<number | null>(null);

  const currentStatus = mission.activeStatus;
  const isActive = !!currentStatus;

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
      toast({ title: "Mission accepted!", description: "Now take your proof photo to complete it." });
      onAccepted?.(data.instanceId);
    },
    onError: (err: any) => {
      toast({ title: "Could not accept mission", description: err.message, variant: "destructive" });
    },
  });

  const displayCredits = mission.effectiveCredits;
  const isDouble = mission.isOG && mission.ogBonusPct >= 100;

  return (
    <div
      className="rounded-2xl overflow-hidden"
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
          GUBER Mission
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
              <p className="text-xs mt-0.5 leading-snug" style={{ color: "rgba(243,244,246,0.55)", fontFamily: "Inter, sans-serif" }}>
                {mission.description}
              </p>
            )}
          </div>

          {/* Credit pill */}
          <div
            className="flex-shrink-0 flex flex-col items-end gap-0.5"
          >
            <span
              className="text-sm font-black"
              style={{ color: "#4ade80", fontFamily: "Inter, sans-serif" }}
              data-testid={`text-mission-credits-${mission.id}`}
            >
              +{displayCredits.toLocaleString()}
            </span>
            <span className="text-[9px] font-semibold" style={{ color: "rgba(74,222,128,0.65)" }}>
              credits
            </span>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          {isActive ? (
            <>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: `${STATUS_COLOR[currentStatus] ?? "#6b7280"}22`,
                  border: `1px solid ${STATUS_COLOR[currentStatus] ?? "#6b7280"}44`,
                  color: STATUS_COLOR[currentStatus] ?? "#9ca3af",
                }}
                data-testid={`badge-mission-status-${mission.id}`}
              >
                {currentStatus === "proof_submitted" ? (
                  <Clock className="w-2.5 h-2.5" />
                ) : (
                  <CheckCircle className="w-2.5 h-2.5" />
                )}
                {STATUS_LABEL[currentStatus] ?? currentStatus}
              </div>

              {(currentStatus === "accepted" || currentStatus === "in_progress") && (
                <button
                  onClick={() => {
                    const id = acceptedInstanceId;
                    if (id && onOpenProof) onOpenProof(id, mission.title);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full text-[11px] font-bold active:scale-95 transition-all"
                  style={{ background: "#7c3aed", color: "#fff", fontFamily: "Inter, sans-serif" }}
                  data-testid={`button-submit-proof-${mission.id}`}
                >
                  <Camera className="w-3 h-3" />
                  Submit Proof
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className="flex-1 h-8 rounded-full text-[11px] font-bold active:scale-95 transition-all disabled:opacity-50"
              style={{ background: "rgba(139,92,246,0.85)", color: "#fff", fontFamily: "Inter, sans-serif" }}
              data-testid={`button-accept-mission-${mission.id}`}
            >
              {acceptMutation.isPending ? "…" : "Accept Mission"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
