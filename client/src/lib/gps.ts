const SESSION_KEY = "guber_gps_ok";

type Resolver = () => void;
const pendingResolvers: Resolver[] = [];

export function isGpsDisclaimerAccepted(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

export function acceptGpsDisclaimer(): void {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
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

export async function gpsGetCurrentPosition(opts?: PositionOptions): Promise<GeolocationPosition> {
  await ensureGpsDisclaimer();
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not available")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

export async function gpsStartWatchPosition(
  success: PositionCallback,
  error: PositionErrorCallback,
  opts?: PositionOptions
): Promise<number> {
  await ensureGpsDisclaimer();
  if (!navigator.geolocation) { error({ code: 2, message: "Geolocation not available", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); return -1; }
  return navigator.geolocation.watchPosition(success, error, opts);
}
