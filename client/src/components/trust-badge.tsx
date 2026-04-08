import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, Award, Crown } from "lucide-react";
import ogLogoImg from "@assets/Gubergoldday1_1772471749839.png";

const tierConfig: Record<string, { label: string; icon: typeof Shield; className: string; glowClass: string }> = {
  community: {
    label: "Community",
    icon: Shield,
    className: "bg-primary/10 text-primary border-primary/25",
    glowClass: "",
  },
  verified: {
    label: "Verified",
    icon: ShieldCheck,
    className: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    glowClass: "",
  },
  credentialed: {
    label: "Credentialed",
    icon: Award,
    className: "bg-secondary/10 text-secondary border-secondary/25",
    glowClass: "shadow-[0_0_8px_hsl(275_85%_62%/0.15)]",
  },
  elite: {
    label: "Elite",
    icon: Crown,
    className: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    glowClass: "shadow-[0_0_10px_hsl(45_100%_50%/0.15)]",
  },
};

export function TrustBadge({ tier, showLabel = true }: { tier: string; showLabel?: boolean }) {
  const config = tierConfig[tier] || tierConfig.community;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} ${config.glowClass} gap-1.5 font-display text-[11px] tracking-wide`} data-testid={`badge-tier-${tier}`}>
      <Icon className="w-3 h-3" />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

export function TrustProgressBar({ score, tier }: { score: number; tier: string }) {
  const thresholds: Record<string, { max: number; next: string }> = {
    community: { max: 100, next: "Verified" },
    verified: { max: 200, next: "Credentialed" },
    credentialed: { max: 350, next: "Elite" },
    elite: { max: 500, next: "Max" },
  };
  const t = thresholds[tier] || thresholds.community;
  const pct = Math.min((score / t.max) * 100, 100);

  return (
    <div className="w-full space-y-1.5" data-testid="trust-progress">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground font-display">Trust Score: <span className="text-foreground font-semibold">{score}</span></span>
        <span className="text-muted-foreground font-display">Next: <span className="guber-text-purple font-semibold">{t.next}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-secondary transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Day1OGLogo({ size = "sm" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const sizes = { sm: "w-5 h-5", md: "w-9 h-9", lg: "w-16 h-16", xl: "w-24 h-24" };
  return (
    <img
      src={ogLogoImg}
      alt="Day-1 OG"
      className={`${sizes[size]} object-contain`}
      style={{ mixBlendMode: "screen" }}
      data-testid="img-og-logo"
    />
  );
}

export function Day1OGBadge() {
  return (
    <Badge
      variant="outline"
      className="bg-gradient-to-r from-amber-500/15 to-yellow-500/10 text-amber-400 border-amber-500/40 gap-1 font-display text-[11px] tracking-wide shadow-[0_0_12px_hsl(45_100%_50%/0.2)] pl-0.5"
      data-testid="badge-day1og"
    >
      <Day1OGLogo size="sm" />
      Day-1 OG
    </Badge>
  );
}
