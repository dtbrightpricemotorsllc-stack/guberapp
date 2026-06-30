import { Capacitor, registerPlugin } from "@capacitor/core";

// Background-capable location watcher for iOS.
// The @capacitor-community/background-geolocation plugin registers itself as
// "BackgroundGeolocation" in the native layer. We call it via Capacitor's
// registerPlugin() bridge — no direct package import needed, which means Vite
// never tries to bundle the native-only package for the web build.
//
// On Android and web this module always returns null (caller falls back to
// gpsStartWatchPosition + foreground service).

const isIOSNative = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();

interface BgGeoPlugin {
  addWatcher(
    options: {
      backgroundMessage: string;
      backgroundTitle: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location: BgLocation | null, error: BgError | null) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

interface BgLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  time: number;
}

interface BgError {
  code: string;
  message: string;
}

const BackgroundGeolocation = registerPlugin<BgGeoPlugin>("BackgroundGeolocation");

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
 * Returns a synthetic numeric watch ID on iOS native, or null on other
 * platforms so the caller falls back to gpsStartWatchPosition.
 */
export async function bgStartWatch(
  onLocation: (c: BgCoords) => void,
  onError: (code: string) => void,
  distanceFilter = 25,
): Promise<number | null> {
  if (!isIOSNative) return null;
  try {
    console.info("[GUBER GPS] iOS bg-geo: starting background watch…");
    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "GUBER is tracking your location for your active job. Tap to return to GUBER.",
        backgroundTitle: "GUBER GPS Active",
        requestPermissions: true,
        stale: false,
        distanceFilter,
      },
      (location, error) => {
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
    console.info(`[GUBER GPS] iOS bg-geo: stopping watch id=${id}`);
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
    console.info("[GUBER GPS] iOS bg-geo: watch stopped");
  } catch {}
}
