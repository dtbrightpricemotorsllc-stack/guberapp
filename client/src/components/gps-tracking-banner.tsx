import { useEffect, useState } from "react";
import { Link } from "wouter";
import { isIOS, isWeb } from "@/lib/platform";

/**
 * GPS tracking indicator banner.
 *
 * Platform behaviour:
 *   iOS native   — shown: "🟢 Live GPS Tracking Active / Tracking for your active GUBER job."
 *                  iOS system location pill (top-right) also shows while bg-geo is running.
 *   Android native — hidden: the foreground-service system notification (GuberTrackingService)
 *                  already gives the persistent status-bar indicator.
 *   Web / PWA    — shown with a PWA-specific message: tracking only works while the tab is open.
 *                  Includes a nudge to download the native app for full background tracking.
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

  if (!trackingJobId) return null;

  // Android uses the system foreground-service notification — no in-app banner needed.
  if (!isIOS && !isWeb) return null;

  if (isWeb) {
    return (
      <Link href={`/jobs/${trackingJobId}`}>
        <div
          className="fixed top-0 left-0 right-0 z-[300] flex flex-col items-center justify-center gap-0.5 px-4 py-2 cursor-pointer"
          style={{ background: "linear-gradient(90deg, #0ea5e9, #38bdf8)", color: "#000" }}
          data-testid="banner-gps-tracking-pwa"
        >
          <span className="text-[12px] font-display font-bold tracking-wide">
            📍 GPS Active — keep this tab open
          </span>
          <span className="text-[10px] font-medium opacity-75">
            For full background tracking, use the GUBER app
          </span>
        </div>
      </Link>
    );
  }

  // iOS native
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
