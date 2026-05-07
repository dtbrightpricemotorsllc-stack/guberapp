import { Capacitor } from "@capacitor/core";

const SESSION_KEY = "guber_gps_ok";

type Resolver = () => void;
const pendingResolvers: Resolver[] = [];

export function isGpsDisclaimerAccepted(): boolean {
  try { return localStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

export function acceptGpsDisclaimer(): void {
  try { localStorage.setItem(SESSION_KEY, "1"); } catch {}
  while (pendingResolvers.length > 0) {
    pendingResolvers.shift()?.();
  }
}

export function ensureGpsDisclaimer(): Promise<void> {
  if (isGpsDisclaimerAccepted()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    pendingResolvers.push(resolve);
    window.dispatchEvent(new Event("guber:show-gps-disclaimer"));
  });
}

// Native-aware geolocation: when running inside a Capacitor app we use the
// @capacitor/geolocation plugin (more reliable in foreground, handles
// permission prompts properly). On web/PWA we fall through to
// navigator.geolocation. Both code paths return the standard
// GeolocationPosition shape so call sites don't need to change.
const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

async function nativeGetCurrent(opts?: PositionOptions): Promise<GeolocationPosition> {
  const { Geolocation } = await import("@capacitor/geolocation");
  // Permissions flow: ask only if needed.
  try {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const r = await Geolocation.requestPermissions();
      if (r.location !== "granted") {
        const err: any = new Error("Location permission denied");
        err.code = 1; // PERMISSION_DENIED parity
        throw err;
      }
    }
  } catch (e: any) {
    // checkPermissions may not be implemented on every platform — if so
    // just fall through to getCurrentPosition which prompts itself.
    if (e?.message === "Location permission denied") throw e;
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: opts?.enableHighAccuracy ?? true,
    timeout: opts?.timeout ?? 10000,
    maximumAge: opts?.maximumAge ?? 0,
  });
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude ?? null,
      altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
      heading: pos.coords.heading ?? null,
      speed: pos.coords.speed ?? null,
    } as GeolocationCoordinates,
    timestamp: pos.timestamp,
  } as GeolocationPosition;
}

export async function gpsGetCurrentPosition(opts?: PositionOptions): Promise<GeolocationPosition> {
  await ensureGpsDisclaimer();
  if (isNative) {
    return nativeGetCurrent(opts);
  }
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not available")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

// Native watch handles. We return synthetic numeric IDs that map back to the
// plugin's string handle so existing call sites can keep using
// navigator.geolocation.clearWatch() for web and a new gpsClearWatch() for
// native code paths.
const nativeWatchMap = new Map<number, string>();
let nativeWatchSeq = 1_000_000;

export async function gpsStartWatchPosition(
  success: PositionCallback,
  error: PositionErrorCallback,
  opts?: PositionOptions
): Promise<number> {
  await ensureGpsDisclaimer();
  if (isNative) {
    const { Geolocation } = await import("@capacitor/geolocation");
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const r = await Geolocation.requestPermissions();
        if (r.location !== "granted") {
          error({ code: 1, message: "Location permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          throw new Error("Location permission denied");
        }
      }
    } catch {}
    const handle = await Geolocation.watchPosition(
      {
        enableHighAccuracy: opts?.enableHighAccuracy ?? true,
        timeout: opts?.timeout ?? 10000,
        maximumAge: opts?.maximumAge ?? 0,
      },
      (pos, err) => {
        if (err) {
          error({ code: 2, message: err.message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          return;
        }
        if (!pos) return;
        success({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? null,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
          } as GeolocationCoordinates,
          timestamp: pos.timestamp,
        } as GeolocationPosition);
      },
    );
    const id = nativeWatchSeq++;
    nativeWatchMap.set(id, handle);
    return id;
  }
  if (!navigator.geolocation) {
    error({ code: 2, message: "Geolocation not available", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    throw new Error("Geolocation not available");
  }
  return navigator.geolocation.watchPosition(success, error, opts);
}

// Cross-platform clearWatch — safe to call with either a native synthetic ID
// or a real navigator.geolocation handle.
export async function gpsClearWatch(id: number): Promise<void> {
  const handle = nativeWatchMap.get(id);
  if (handle !== undefined) {
    nativeWatchMap.delete(id);
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      await Geolocation.clearWatch({ id: handle });
    } catch {}
    return;
  }
  try { navigator.geolocation?.clearWatch(id); } catch {}
}
