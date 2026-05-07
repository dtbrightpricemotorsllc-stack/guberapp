import type { ComponentType } from "react";
import { SiLinkedin, SiFacebook, SiTiktok, SiInstagram, SiX } from "react-icons/si";
import { INVESTOR_CONFIG, type InvestorSocial } from "@/lib/investor-config";

const ICONS: Record<InvestorSocial["brand"], ComponentType<{ className?: string }>> = {
  linkedin: SiLinkedin,
  facebook: SiFacebook,
  tiktok: SiTiktok,
  instagram: SiInstagram,
  x: SiX,
};

interface SocialLinksProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  testIdPrefix?: string;
  variant?: "ghost" | "tile";
}

export function SocialLinks({
  size = "md",
  className = "",
  testIdPrefix = "link-social",
  variant = "ghost",
}: SocialLinksProps) {
  const sizeCls = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const iconCls = size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-5 h-5" : "w-4 h-4";

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="group-social-links">
      {INVESTOR_CONFIG.socials.map((s) => {
        const Icon = ICONS[s.brand];
        const base =
          variant === "tile"
            ? "border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white"
            : "border border-white/10 bg-transparent hover:bg-white/5 hover:border-white/25 text-muted-foreground hover:text-white";
        return (
          <a
            key={s.brand}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.name}
            title={s.name}
            className={`${sizeCls} ${base} inline-flex items-center justify-center rounded-lg transition-colors`}
            data-testid={`${testIdPrefix}-${s.brand}`}
          >
            <Icon className={iconCls} />
          </a>
        );
      })}
    </div>
  );
}
