import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { Link } from "wouter";

export function GpsTrackingBanner() {
  const [trackingJobId, setTrackingJobId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { active: boolean; jobId?: number };
      setTrackingJobId(detail.active ? (detail.jobId ?? null) : null);
    };
    window.addEventListener("guber:gps-tracking-changed", handler);
    return () => window.removeEventListener("guber:gps-tracking-changed", handler);
  }, []);

  if (!trackingJobId) return null;

  return (
    <Link href={`/jobs/${trackingJobId}`}>
      <div
        className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-display font-bold tracking-wider cursor-pointer"
        style={{ background: "linear-gradient(90deg, #00b4b4, #00E5E5)", color: "#000" }}
        data-testid="banner-gps-tracking"
      >
        <Navigation className="w-3 h-3 animate-pulse" />
        GPS ACTIVE — Sharing your location for this job
        <Navigation className="w-3 h-3 animate-pulse" />
      </div>
    </Link>
  );
}
