import { Link, useLocation } from "wouter";
import { AlertTriangle, Navigation, MapPin, ChevronRight } from "lucide-react";
import { useActiveJob } from "@/hooks/use-active-job";

/**
 * Persistent banner shown across the consumer shell whenever the user has an
 * active scheduled job. Worker variant nudges them into the in-app navigation
 * screen. Poster variant surfaces helper status (en-route / arrived / at-risk).
 *
 * Hidden on the navigation screen itself so it doesn't double up.
 */
export function ActiveJobBanner() {
  const [location] = useLocation();
  const active = useActiveJob();

  // Hide on the in-app navigation page itself.
  if (/^\/jobs\/\d+\/navigate$/.test(location)) return null;
  if (!active) return null;

  const { job, role, jobAtRisk } = active;
  const helperStage = (job as any).helperStage as string | null;
  const title = job.title || "Active job";

  // Visuals: red when at risk, blue/green for live progress.
  const palette = jobAtRisk
    ? {
        bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(220,38,38,0.10))",
        border: "rgba(239,68,68,0.45)",
        accent: "text-red-300",
        icon: <AlertTriangle className="w-4 h-4 text-red-300" />,
      }
    : helperStage === "arrived"
      ? {
          bg: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.10))",
          border: "rgba(16,185,129,0.45)",
          accent: "text-emerald-300",
          icon: <MapPin className="w-4 h-4 text-emerald-300" />,
        }
      : {
          bg: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(29,78,216,0.10))",
          border: "rgba(37,99,235,0.45)",
          accent: "text-blue-300",
          icon: <Navigation className="w-4 h-4 text-blue-300" />,
        };

  let leadCopy: string;
  let subCopy: string;
  let href: string;

  if (role === "worker") {
    href = `/jobs/${job.id}/navigate`;
    if (helperStage === "arrived") {
      leadCopy = "You've arrived";
      subCopy = title;
    } else if (helperStage === "on_the_way") {
      leadCopy = "On the way";
      subCopy = `Tap to keep navigating · ${title}`;
    } else {
      leadCopy = "Active job";
      subCopy = `Tap to navigate · ${title}`;
    }
  } else {
    href = `/jobs/${job.id}`;
    if (jobAtRisk) {
      leadCopy = "Job at risk";
      subCopy = `Helper hasn't started · ${title}`;
    } else if (helperStage === "arrived") {
      leadCopy = "Helper arrived";
      subCopy = title;
    } else {
      leadCopy = "Helper on the way";
      subCopy = title;
    }
  }

  return (
    <div className="px-3 pt-2" data-testid="banner-active-job">
      <Link href={href}>
        <div
          className="rounded-2xl px-3.5 py-2.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all"
          style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.25)" }}>
            {palette.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-display font-bold tracking-widest uppercase ${palette.accent}`}>
              {leadCopy}
            </p>
            <p className="text-xs text-foreground truncate" data-testid="text-active-job-subcopy">
              {subCopy}
            </p>
          </div>
          <ChevronRight className={`w-4 h-4 ${palette.accent} flex-shrink-0`} />
        </div>
      </Link>
    </div>
  );
}
