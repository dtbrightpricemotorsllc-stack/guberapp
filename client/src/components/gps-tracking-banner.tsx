import { useEffect, useState } from "react";
import { Link } from "wouter";
import { isIOS } from "@/lib/platform";

/**
 * iOS-only in-app banner that appears while the TaskTrackingService is
 * actively sharing the worker's location for a live job. On Android the
 * system foreground-service notification (GuberTrackingService) serves
 * the same purpose, so this banner is suppressed there.
 */
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

  // Show only on iOS native builds — Android uses the foreground-service
  // system notification instead.
  if (!isIOS || !trackingJobId) return null;

  return (
    <Link href={`/jobs/${trackingJobId}`}>
      <div
        className="fixed top-0 left-0 right-0 z-[300] flex flex-col items-center justify-center gap-0.5 px-4 py-2 cursor-pointer"
        style={{ background: "linear-gradient(90deg, #00b4b4, #00E5E5)", color: "#000" }}
        data-testid="banner-gps-tracking"
      >
        <span className="text-[12px] font-display font-bold tracking-wide">
          🟢 Live GPS Tracking Active
        </span>
        <span className="text-[10px] font-medium opacity-80">
          Tracking for your active GUBER job.
        </span>
      </div>
    </Link>
  );
}
