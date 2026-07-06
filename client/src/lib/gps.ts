import { Capacitor } from "@capacitor/core";
import { reportIssue } from "./report-issue";

const SESSION_KEY = "guber_gps_ok";

// On native (iOS/Android) the OS shows its own permission dialog — our web
// disclaimer modal is redundant and blocks the GPS flow. Auto-accept it.
if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
  try { localStorage.setItem(SESSION_KEY, "1"); } catch {}
}

type Resolver = () => void;
type Rejector = (err: Error) => void;
const pendingResolvers: Resolver[] = [];
const pendingRejectors: Rejector[] = [];

let disclaimerPending = false;

export function isGpsDisclaimerAccepted(): boolean {
  try { return localStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

export function isGpsDisclaimerPending(): boolean {
  return disclaimerPending;
}

export function acceptGpsDisclaimer(): void {
  try { localStorage.setItem(SESSION_KEY, "1"); } catch {}
  disclaimerPending = false;
  pendingRejectors.length = 0;
  while (pendingResolvers.length > 0) pendingResolvers.shift()?.();
  try { window.dispatchEvent(new Event("guber:gps-disclaimer-resolved")); } catch {}
}

export function dismissGpsDisclaimer(): void {
  disclaimerPending = false;
  pendingResolvers.length = 0;
  const err = new Error("Location permission denied");
  (err as any).code = 1;
  while (pendingRejectors.length > 0) pendingRejectors.shift()?.(err);
  try { window.dispatchEvent(new Event("guber:gps-disclaimer-resolved")); } catch {}
}

export function ensureGpsDisclaimer(): Promise<void> {
  if (isGpsDisclaimerAccepted()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    pendingResolvers.push(resolve);
    pendingRejectors.push(reject);
    disclaimerPending = true;
    window.dispatchEvent(new Event("guber:show-gps-disclaimer"));
  });
}

const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

// ── Helper: map a native GPS error message to a GeolocationPositionError code ──
function mapNativeErrorCode(msg: string): number {
  if (/denied|permission|not authorized|access/i.test(msg)) return 1; // PERMISSION_DENIED
  if (/timeout/i.test(msg)) return 3;                                  // TIMEOUT
  return 2;                                                             // POSITION_UNAVAILABLE
}

async function nativeGetCurrent(opts?: PositionOptions): Promise<GeolocationPosition> {
  const { Geolocation } = await import("@capacitor/geolocation");
  try {
    const perm = await Geolocation.checkPermissions();
    console.log(`[GUBER GPS] getCurrentPosition checkPermissions: ${perm.location}`);
    if (perm.location !== "granted") {
      // Always request regardless of checkPermissions — handles Samsung reinstall
      // where old denial lingers; OS will show dialog or return denied silently.
      const r = await Geolocation.requestPermissions();
      console.log(`[GUBER GPS] requestPermissions (getCurrentPosition): ${r.location}`);
      if (r.location !== "granted") {
        const err: any = new Error("Location permission denied — enable in device Settings");
        err.code = 1;
        throw err;
      }
    }
  } catch (e: any) {
    if (e?.code === 1 || e?.message?.includes("permission denied")) throw e;
    console.warn(`[GUBER GPS] checkPermissions threw (non-fatal): ${e?.message}`);
  }
  console.log("[GUBER GPS] calling getCurrentPosition…");
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: opts?.enableHighAccuracy ?? true,
    timeout: opts?.timeout ?? 10000,
    maximumAge: opts?.maximumAge ?? 0,
  });
  console.log(`[GUBER GPS] getCurrentPosition: lat=${pos.coords.latitude?.toFixed(4)}, acc=${pos.coords.accuracy?.toFixed(0)}m`);
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
  if (isNative) return nativeGetCurrent(opts);
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not available")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

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

    // ── Permission check: must not silently swallow denied state ──────────
    let permissionDenied = false;
    try {
      const perm = await Geolocation.checkPermissions();
      console.log(`[GUBER GPS] watchPosition checkPermissions: location=${perm.location}`);

      if (perm.location !== "granted") {
        // Always call requestPermissions regardless of checkPermissions result.
        // On Android, a previous install's denial may linger after reinstall —
        // requestPermissions() lets the OS decide whether to show the dialog
        // or return "denied" silently (permanently blocked / "Don't ask again").
        const r = await Geolocation.requestPermissions();
        console.log(`[GUBER GPS] requestPermissions: ${r.location}`);
        if (r.location !== "granted") {
          console.warn("[GUBER GPS] Location permission not granted — Settings required");
          permissionDenied = true;
        }
      }
    } catch (permErr: any) {
      // checkPermissions not implemented on this platform variant — fall through
      // and let watchPosition prompt natively or surface its own error.
      console.warn(`[GUBER GPS] checkPermissions threw (non-fatal, continuing): ${permErr?.message}`);
    }

    if (permissionDenied) {
      error({
        code: 1,
        message: "Location access denied. Enable location in device Settings.",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      // Return a dummy ID — no watch was started.
      const dummyId = nativeWatchSeq++;
      return dummyId;
    }

    // ── Start the native position watch ───────────────────────────────────
    console.log("[GUBER GPS] Starting native watchPosition…");
    const handle = await Geolocation.watchPosition(
      {
        enableHighAccuracy: opts?.enableHighAccuracy ?? true,
        timeout: opts?.timeout ?? 10000,
        maximumAge: opts?.maximumAge ?? 0,
      },
      (pos, err) => {
        if (err) {
          const msg = err.message ?? "Unknown GPS error";
          const code = mapNativeErrorCode(msg);
          console.warn(`[GUBER GPS] watchPosition error → code=${code} (${msg})`);
          // Only report a hard permission denial (blocking) — transient
          // POSITION_UNAVAILABLE / TIMEOUT blips are noise, not outages.
          if (code === 1) {
            reportIssue({ module: "gps", attemptedAction: "watchPosition", error: msg, blocked: true, gpsPermission: "denied" });
          }
          error({ code, message: msg, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          return;
        }
        if (!pos) return;
        console.log(`[GUBER GPS] Position update: lat=${pos.coords.latitude?.toFixed(4)}, lng=${pos.coords.longitude?.toFixed(4)}, acc=${pos.coords.accuracy?.toFixed(0)}m`);
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
    console.log(`[GUBER GPS] Watch started: id=${id}, handle=${handle}`);
    return id;
  }

  // ── Web / PWA path ────────────────────────────────────────────────────────
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
      console.log(`[GUBER GPS] Cleared native watch id=${id}, handle=${handle}`);
    } catch {}
    return;
  }
  try { navigator.geolocation?.clearWatch(id); } catch {}
}
