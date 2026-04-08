import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin, AlertTriangle, Clock, Lock, ShieldCheck, Award, TrendingUp, Handshake } from "lucide-react";
import { Link } from "wouter";
import type { Job } from "@shared/schema";

const statusColors: Record<string, string> = {
  posted_public: "bg-primary/15 text-primary border-primary/30",
  accepted_pending_payment: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  funded: "bg-secondary/15 text-secondary border-secondary/30",
  active: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completion_submitted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed_paid: "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  disputed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted/50 text-muted-foreground border-border/30",
  canceled_by_hirer: "bg-muted/50 text-muted-foreground border-border/30",
};

const categoryAccent: Record<string, string> = {
  "General Labor": "from-emerald-500/20 to-transparent",
  "Skilled Labor": "from-yellow-600/20 to-transparent",
  "On-Demand Help": "from-purple-500/20 to-transparent",
  "Verify & Inspect": "from-blue-500/20 to-transparent",
  "Barter Labor": "from-violet-500/20 to-transparent",
  "Marketplace": "from-teal-500/20 to-transparent",
};

const tierBadgeInfo: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  verified: {
    label: "Verified+",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />,
  },
  credentialed: {
    label: "Credentialed",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <Award className="w-2.5 h-2.5 mr-0.5" />,
  },
  elite: {
    label: "Elite Only",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: <Award className="w-2.5 h-2.5 mr-0.5" />,
  },
};

export function JobCard({ job }: { job: Job }) {
  const showApproxLocation = !["funded", "active", "in_progress", "completion_submitted", "completed_paid"].includes(job.status);

  const tierRequired = job.category === "Skilled Labor"
    ? (job as any).minTierRequired || "verified"
    : null;
  const tierBadge = tierRequired && tierRequired !== "community" ? tierBadgeInfo[tierRequired] || tierBadgeInfo.verified : null;

  return (
    <Link href={`/jobs/${job.id}`}>
      <Card
        className="glass-card rounded-xl overflow-visible cursor-pointer transition-all duration-200 hover-elevate active-elevate-2"
        data-testid={`card-job-${job.id}`}
      >
        <div className={`absolute inset-0 rounded-xl bg-gradient-to-r ${categoryAccent[job.category] || "from-primary/10 to-transparent"} opacity-50 pointer-events-none`} />
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-foreground text-[15px] leading-tight">{job.title}</h3>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {job.budget != null && job.budget > 0 && (
                <div className="flex items-baseline gap-0.5" data-testid={`text-payout-${job.id}`}>
                  <span className="text-[10px] font-display text-primary/70 font-semibold tracking-wider">EARN</span>
                  <span className="text-xl font-display font-black guber-text-green leading-none">${job.budget}</span>
                </div>
              )}
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {(job as any).autoIncreaseEnabled && (
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]" data-testid={`badge-auto-increase-${job.id}`}>
                    <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                    {(() => {
                      const nextAt = (job as any).nextIncreaseAt ? new Date((job as any).nextIncreaseAt) : null;
                      const amt = (job as any).autoIncreaseAmount;
                      if (nextAt && amt) {
                        const mins = Math.max(0, Math.round((nextAt.getTime() - Date.now()) / 60000));
                        const timeStr = mins < 60 ? `~${mins}m` : `~${Math.round(mins / 60)}h`;
                        return `+$${amt} in ${timeStr}`;
                      }
                      return "Auto-increasing";
                    })()}
                  </Badge>
                )}
                {tierBadge && (
                  <Badge variant="outline" className={`text-[10px] ${tierBadge.color}`} data-testid={`badge-tier-${job.id}`}>
                    {tierBadge.icon}
                    {tierBadge.label}
                  </Badge>
                )}
                {job.isBoosted && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]" data-testid={`badge-boosted-${job.id}`}>
                    <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                    Boosted
                  </Badge>
                )}
                {job.urgentSwitch && (
                  <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                    Urgent
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {job.category === "Barter Labor" && ((job as any).barterNeed || (job as any).barterOffering) ? (
            <div className="space-y-1.5 mb-3">
              {(job as any).barterNeed && (
                <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed" data-testid="text-barter-need">
                  <span className="font-semibold text-foreground/80">Need:</span> {(job as any).barterNeed}
                </p>
              )}
              {(job as any).barterOffering && (
                <div className="flex items-start gap-1.5">
                  <Handshake className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#14B8A6" }} />
                  <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed" data-testid="text-barter-offering">
                    <span className="font-semibold text-foreground/80">Offering:</span> {(job as any).barterOffering}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(job as any).barterEstimatedValue && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5" style={{ background: "rgba(20,184,166,0.12)", color: "#14B8A6", borderColor: "rgba(20,184,166,0.25)" }}>
                    Est. value: {(job as any).barterEstimatedValue}
                  </Badge>
                )}
                {(job as any).estimatedMinutes && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5" style={{ background: "rgba(20,184,166,0.12)", color: "#14B8A6", borderColor: "rgba(20,184,166,0.25)" }}>
                    Est. time: {(job as any).estimatedMinutes < 60
                      ? `${(job as any).estimatedMinutes}m`
                      : `${((job as any).estimatedMinutes / 60).toFixed(1).replace(/\.0$/, '')}h`}
                  </Badge>
                )}
              </div>
            </div>
          ) : job.jobDetails && Object.keys(job.jobDetails).length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-3" data-testid="highlights-checklist">
              {Object.entries(job.jobDetails).slice(0, 3).map(([key, value]) => {
                let displayValue = value;
                if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
                  try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) displayValue = parsed[0] + (parsed.length > 1 ? ` +${parsed.length - 1}` : "");
                  } catch {}
                } else if (Array.isArray(value)) {
                  displayValue = value[0] + (value.length > 1 ? ` +${value.length - 1}` : "");
                }
                return (
                  <Badge key={key} variant="secondary" className="text-[10px] px-2 py-0 h-5 font-normal bg-secondary/30 border-secondary/10 text-muted-foreground truncate max-w-[120px]">
                    <span className="font-bold mr-1 text-foreground/70">{key.replace(/_/g, ' ')}:</span> {String(displayValue)}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed" data-testid="text-job-description">
              {job.description}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {showApproxLocation && (job.locationApprox || job.zip) && (
                <span className="flex items-center gap-0.5 truncate max-w-[140px]">
                  <Lock className="w-3 h-3" />{job.locationApprox || `${job.zip} area`}
                </span>
              )}
              {!showApproxLocation && job.location && (
                <span className="flex items-center gap-0.5 truncate max-w-[140px]">
                  <MapPin className="w-3 h-3" />{job.location}
                </span>
              )}
              {(job as any).estimatedMinutes && (
                <span className="flex items-center gap-0.5" data-testid={`text-time-${job.id}`}>
                  <Clock className="w-3 h-3" />
                  {(job as any).estimatedMinutes < 60
                    ? `${(job as any).estimatedMinutes}m`
                    : `${((job as any).estimatedMinutes / 60).toFixed(1).replace(/\.0$/, '')}h`}
                </span>
              )}
              {job.createdAt && !(job as any).estimatedMinutes && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {new Date(job.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <Badge variant="outline" className={`text-[10px] ${statusColors[job.status] || ""}`}>
              {job.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </Card>
    </Link>
  );
}
