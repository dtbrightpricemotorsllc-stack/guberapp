import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Clock, Camera, ArrowRight, Coins, MapPin, Star } from "lucide-react";
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
  instanceId?: number | null;
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
  /** @deprecated no-op, kept for compat */
  jobMode?: boolean;
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

function badgeFor(cat: string): { dot: string; label: string } {
  if (cat === "referral")        return { dot: "#3b82f6", label: "Referral" };
  if (cat === "day1_og")         return { dot: "#f59e0b", label: "Day-1 OG" };
  return                                { dot: "#8b5cf6", label: "Mission" };
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
  const badge = badgeFor(mission.category);
  const displayCredits = mission.effectiveCredits;
  const resolvedInstanceId = acceptedInstanceId ?? mission.instanceId ?? null;

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
      toast({ title: "Mission accepted!", description: "Complete it and submit a photo to earn your credits." });
      onAccepted?.(data.instanceId);
    },
    onError: (err: any) => {
      toast({ title: "Could not accept mission", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      {/* ── Unified opportunity card ─── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={e => e.key === "Enter" && setOpen(true)}
        className="glass-card rounded-xl p-4 cursor-pointer active:scale-[0.99] transition-transform select-none"
        data-testid={`card-mission-${mission.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{mission.emoji}</span>
            <div className="flex-1 min-w-0">
              {/* Opportunity badge */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: badge.dot }} />
                <span className="text-[10px] font-display font-bold tracking-wider uppercase" style={{ color: badge.dot }}>
                  {badge.label}
                </span>
              </div>

              <p className="font-display font-extrabold text-foreground text-sm leading-tight truncate">
                {mission.title}
              </p>
              {!compact && mission.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                  {mission.description}
                </p>
              )}

              {isActive && (
                <div className="mt-1.5">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: `${STATUS_COLOR[currentStatus] ?? "#6b7280"}18`,
                      border: `1px solid ${STATUS_COLOR[currentStatus] ?? "#6b7280"}44`,
                      color: STATUS_COLOR[currentStatus] ?? "#9ca3af",
                    }}
                    data-testid={`badge-mission-status-${mission.id}`}
                  >
                    {currentStatus === "proof_submitted" ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle className="w-2.5 h-2.5" />}
                    {STATUS_LABEL[currentStatus] ?? currentStatus}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pay in credits */}
          <div className="flex-shrink-0 text-right">
            <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-wide">
              Payout
            </p>
            <p className="font-display font-black text-base guber-text-green" data-testid={`text-mission-credits-${mission.id}`}>
              {displayCredits.toLocaleString()} cr
            </p>
          </div>
        </div>
      </div>

      {/* ── Detail Sheet ── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-10"
          style={{ background: "#0a0b11", border: "1px solid rgba(139,92,246,0.3)", maxHeight: "90vh", overflowY: "auto" }}
        >
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(139,92,246,0.5)" }} />

          <SheetHeader className="px-5 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: badge.dot }} />
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: badge.dot }}>
                {badge.label}
              </span>
              {mission.isOG && mission.ogBonusPct >= 100 && (
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
            {mission.description && (
              <p className="text-sm leading-relaxed" style={{ color: "rgba(243,244,246,0.7)" }}>
                {mission.description}
              </p>
            )}

            <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <p className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: "#a78bfa" }}>
                Mission Payout
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

            <div className="space-y-2">
              <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: "rgba(139,92,246,0.7)" }}>
                How to Complete
              </p>
              <div className="space-y-2">
                {[
                  { n: "1", text: "Accept this mission below" },
                  { n: "2", text: "Complete the task in your area" },
                  { n: "3", text: "Submit a live photo as proof" },
                  { n: "4", text: "Credits land once admin approves" },
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
                      if (resolvedInstanceId && onOpenProof) {
                        onOpenProof(resolvedInstanceId, mission.title);
                      } else {
                        toast({
                          title: "Couldn't open proof submission",
                          description: "Please refresh the page and try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-black active:scale-[0.98] transition-transform"
                    style={{ background: "#7c3aed", color: "#fff", fontFamily: "Inter, sans-serif" }}
                    data-testid={`button-submit-proof-detail-${mission.id}`}
                  >
                    <Camera className="w-4 h-4" /> Submit Proof Photo
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
                {acceptMutation.isPending ? "Accepting…" : <>Accept Mission <ArrowRight className="w-4 h-4" /></>}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
