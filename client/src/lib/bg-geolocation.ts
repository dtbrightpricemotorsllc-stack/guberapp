import { Capacitor } from "@capacitor/core";

// Background-capable location watcher for iOS.
// Uses @capacitor-community/background-geolocation which keeps delivering
// fixes when the app is backgrounded (home button, switching apps, screen
// locked). Android uses the ForegroundTracking foreground-service path instead.
// Web falls back to navigator.geolocation.watchPosition.

const isIOSNative = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();

const bgWatchMap = new Map<number, string>();
let bgWatchSeq = 2_000_000;

export interface BgCoords {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
}

/**
 * Start a background-capable location watch on iOS.
 * Returns a synthetic numeric watch ID, or null if not on iOS (caller
 * should fall back to gpsStartWatchPosition).
 */
export async function bgStartWatch(
  onLocation: (c: BgCoords) => void,
  onError: (code: string) => void,
  distanceFilter = 25,
): Promise<number | null> {
  if (!isIOSNative) return null;
  try {
    const mod = await import("@capacitor-community/background-geolocation");
    const BackgroundGeolocation = (mod as any).default ?? mod;
    const watcherId: string = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "GUBER is tracking your location for your active job.",
        backgroundTitle: "Job in Progress",
        requestPermissions: true,
        stale: false,
        distanceFilter,
      },
      (location: any, error: any) => {
        if (error) {
          onError(error.code ?? "UNKNOWN");
          return;
        }
        if (!location) return;
        onLocation({
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy ?? 0,
          ts: location.time ?? Date.now(),
        });
      },
    );
    const id = bgWatchSeq++;
    bgWatchMap.set(id, watcherId);
    return id;
  } catch (err) {
    console.warn("[bg-geo] addWatcher failed:", err);
    return null;
  }
}

/** Stop a background watch started with bgStartWatch. */
export async function bgStopWatch(id: number): Promise<void> {
  const watcherId = bgWatchMap.get(id);
  if (!watcherId) return;
  bgWatchMap.delete(id);
  try {
    const mod = await import("@capacitor-community/background-geolocation");
    const BackgroundGeolocation = (mod as any).default ?? mod;
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } catch {}
}
