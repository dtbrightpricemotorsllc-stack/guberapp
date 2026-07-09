import { gpsStartWatchPosition, gpsClearWatch } from "@/lib/gps";
import { bgStartWatch, bgStopWatch } from "@/lib/bg-geolocation";
import { startForegroundTracking, stopForegroundTracking } from "@/lib/foreground-tracking";
import { apiRequest } from "@/lib/queryClient";

// Standalone, UI-independent live-location tracker for an actively in-progress
// job. It is deliberately NOT a React hook or component: the GPS watch must
// survive the worker navigating away from the map screen (foreground only —
// true OS-level background tracking is a deferred follow-up). The map UI just
// `subscribe()`s for render updates; the watch's lifetime is owned here and
// gated strictly on an accepted/paid task being en route or on site.
//
// Cost controls:
//  - distance/time throttle: a fix is only kept if it moved >= 25 m OR >= 60 s
//    since the last kept fix.
//  - network batching: kept fixes are queued and uploaded in batches (when the
//    queue reaches BATCH_SIZE, on a periodic timer, or when the task ends),
//    not one HTTP call per fix.
//  - crash recovery: the active job id + pending queue + last fix are persisted
//    to localStorage so a reload mid-task resumes without losing breadcrumbs.

export interface TrackPoint {
  lat: number;
  lng: number;
  ts: number;
}

type Coords = { lat: number; lng: number };
type Subscriber = (coords: Coords) => void;

// Server-reported geofence proximity. This is verification/telemetry only — it
// never authorizes a payout (the backend enforces a multi-factor guardrail).
export interface GeofenceStatus {
  withinRadius: boolean;
  meters: number | null;
  radius: number;
}
type GeofenceSubscriber = (status: GeofenceStatus) => void;

export const MIN_DISTANCE_M = 25;
export const MIN_INTERVAL_MS = 60_000;
export const BATCH_SIZE = 10;
export const BATCH_INTERVAL_MS = 120_000;
// Safety net: never let a foreground tracker run forever if a stop signal is
// somehow missed. 8 h comfortably exceeds any realistic single job.
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
// Raised from 300 m to 2 000 m so the service doesn't silently drop all fixes
// during GPS warm-up (cell-tower fixes can be 300-1 500 m before the radio has
// a clear-sky lock). The server accepts all points for audit; the Java native
// service uses the same threshold.
const ACCURACY_CEILING_M = 2000;

const LS_JOB = "guber.tracking.activeJobId";
const LS_TYPE = "guber.tracking.activeType";
const LS_QUEUE = "guber.tracking.queue";
const LS_LAST = "guber.tracking.lastKnown";
const LS_STARTED = "guber.tracking.startedAt";

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineMeters(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export class TaskTrackingService {
  private activeJobId: number | null = null;
  private activeType: "job" | "load_board" = "job";
  private watchId: number | null = null;
  private bgWatchId: number | null = null;
  private starting = false;
  private subscribers = new Set<Subscriber>();
  private geofenceSubscribers = new Set<GeofenceSubscriber>();
  private latestGeofence: GeofenceStatus | null = null;
  private latest: Coords | null = null;
  private lastAccepted: TrackPoint | null = null;
  private queue: TrackPoint[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private startedAt = 0;

  getActiveJobId(): number | null {
    return this.activeJobId;
  }

  getLatest(): Coords | null {
    return this.latest;
  }

  isTracking(): boolean {
    return this.activeJobId !== null;
  }

  /** Subscribe to throttled live position updates. Returns an unsubscribe fn. */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    if (this.latest) {
      try { cb(this.latest); } catch { /* listener errors must not break tracking */ }
    }
    return () => { this.subscribers.delete(cb); };
  }

  private emit(c: Coords): void {
    this.subscribers.forEach((s) => {
      try { s(c); } catch { /* ignore */ }
    });
  }

  /** Latest server-reported geofence proximity (verification only). */
  getGeofenceStatus(): GeofenceStatus | null {
    return this.latestGeofence;
  }

  /** Subscribe to geofence proximity updates. Returns an unsubscribe fn. */
  subscribeGeofence(cb: GeofenceSubscriber): () => void {
    this.geofenceSubscribers.add(cb);
    if (this.latestGeofence) {
      try { cb(this.latestGeofence); } catch { /* listener errors must not break tracking */ }
    }
    return () => { this.geofenceSubscribers.delete(cb); };
  }

  private emitGeofence(g: GeofenceStatus): void {
    this.geofenceSubscribers.forEach((s) => {
      try { s(g); } catch { /* ignore */ }
    });
  }

  /**
   * Begin (or resume) tracking for a job or load-board listing. Idempotent:
   * calling again for the already-active id is a no-op. Switching ids flushes
   * + stops the old one.
   * @param type  "job" (default) | "load_board" — controls which server
   *              endpoint the bg token request and location-batch uploads use.
   */
  async startTask(jobId: number, type: "job" | "load_board" = "job"): Promise<void> {
    if (this.activeJobId === jobId && this.watchId !== null) return;
    if (this.activeJobId !== null && this.activeJobId !== jobId) {
      await this.stopTask(this.activeJobId);
    }
    if (this.starting) return;
    this.starting = true;
    this.activeJobId = jobId;
    this.activeType = type;
    if (!this.startedAt) this.startedAt = Date.now();
    this.loadPersisted(jobId);
    this.persistMeta();
    console.info(`[GUBER TRACKING] startTask jobId=${jobId}`);
    try {
      // iOS: use the background-capable plugin so tracking survives the app
      // being backgrounded or the screen locking. Falls back to the standard
      // foreground watch on Android and web.
      const bgId = await bgStartWatch(
        (c) => {
          if (!this.activeJobId) return;
          const acc = c.accuracy;
          if (typeof acc === "number" && acc > ACCURACY_CEILING_M) return;
          if (this.startedAt && Date.now() - this.startedAt > MAX_SESSION_MS) {
            void this.stopTask(this.activeJobId);
            return;
          }
          const coords: Coords = { lat: c.lat, lng: c.lng };
          if (!this.shouldAccept(coords, c.ts)) return;
          const point: TrackPoint = { lat: c.lat, lng: c.lng, ts: c.ts };
          this.lastAccepted = point;
          this.latest = coords;
          this.queue.push(point);
          this.persistQueue();
          this.persistLast(coords);
          this.emit(coords);
          if (this.queue.length >= BATCH_SIZE) void this.flush(true);
        },
        (code) => {
          console.warn("[tracking] bg-geo error", code);
          if (code === "NOT_AUTHORIZED") void this.stopTask(this.activeJobId ?? undefined);
        },
        MIN_DISTANCE_M,
      );

      if (this.activeJobId !== jobId) {
        if (bgId !== null) await bgStopWatch(bgId);
        return;
      }

      if (bgId !== null) {
        // iOS background path — plugin handles delivery; no foreground watch needed.
        this.bgWatchId = bgId;
        this.startFlushTimer();
        console.info(`[GUBER TRACKING] iOS bg-geo watch started id=${bgId} jobId=${jobId}`);
      } else {
        // Android / web — standard foreground watch + optional foreground service.
        const id = await gpsStartWatchPosition(
          (pos) => this.onPosition(pos),
          (err) => {
            console.warn(`[GUBER TRACKING] gps watch error code=${(err as any)?.code} msg=${(err as any)?.message}`);
          },
          { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
        );
        if (this.activeJobId !== jobId) {
          await gpsClearWatch(id);
          return;
        }
        this.watchId = id;
        this.startFlushTimer();
        console.info(`[GUBER TRACKING] foreground watch started id=${id} jobId=${jobId}`);
        void this.startForegroundService(jobId);
      }
      console.info(`[GUBER TRACKING] tracking ACTIVE jobId=${jobId}`);
      window.dispatchEvent(new CustomEvent("guber:gps-tracking-changed", { detail: { active: true, jobId } }));
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stop tracking. By default flushes any queued breadcrumbs first (task ended
   * cleanly). Pass { flush: false } when the server has already told us the job
   * is no longer trackable (further uploads would just bounce).
   */
  async stopTask(jobId?: number, opts?: { flush?: boolean }): Promise<void> {
    if (jobId != null && this.activeJobId != null && jobId !== this.activeJobId) return;
    const id = this.watchId;
    const bgId = this.bgWatchId;
    this.watchId = null;
    this.bgWatchId = null;
    this.stopFlushTimer();
    if (id !== null) {
      try { await gpsClearWatch(id); } catch { /* ignore */ }
    }
    if (bgId !== null) {
      try { await bgStopWatch(bgId); } catch { /* ignore */ }
    }
    if (opts?.flush !== false) {
      await this.flush(true);
    }
    const stoppedJobId = this.activeJobId;
    this.activeJobId = null;
    this.lastAccepted = null;
    this.latest = null;
    this.queue = [];
    this.startedAt = 0;
    this.clearPersisted();
    // Android: dismiss the persistent foreground-service notification (no-op on
    // iOS/web). Best-effort.
    void stopForegroundTracking();
    console.info(`[GUBER TRACKING] tracking STOPPED jobId=${stoppedJobId}`);
    window.dispatchEvent(new CustomEvent("guber:gps-tracking-changed", { detail: { active: false } }));
  }

  private onPosition(pos: GeolocationPosition): void {
    if (!this.activeJobId) return;
    const acc = pos.coords.accuracy;
    if (typeof acc === "number" && acc > ACCURACY_CEILING_M) return; // drop junk fixes
    if (this.startedAt && Date.now() - this.startedAt > MAX_SESSION_MS) {
      void this.stopTask(this.activeJobId);
      return;
    }
    const coords: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const ts = pos.timestamp || Date.now();
    if (!this.shouldAccept(coords, ts)) return;
    const point: TrackPoint = { lat: coords.lat, lng: coords.lng, ts };
    this.lastAccepted = point;
    this.latest = coords;
    this.queue.push(point);
    this.persistQueue();
    this.persistLast(coords);
    this.emit(coords);
    if (this.queue.length >= BATCH_SIZE) void this.flush(true);
  }

  private shouldAccept(c: Coords, ts: number): boolean {
    if (!this.lastAccepted) return true;
    const movedFar = haversineMeters(this.lastAccepted, c) >= MIN_DISTANCE_M;
    const longEnough = ts - this.lastAccepted.ts >= MIN_INTERVAL_MS;
    return movedFar || longEnough;
  }

  /**
   * Fetch a short-lived bg-location token from the server, then start the
   * native Android foreground service with native GPS. The token lets the Java
   * service POST location batches directly to the server (bypassing the WebView
   * session cookie) so tracking continues when the screen locks.
   */
  private async startForegroundService(jobId: number): Promise<void> {
    const isLoadBoard = this.activeType === "load_board";
    const batchPath = isLoadBoard
      ? `/api/load-board/${jobId}/location-batch`
      : `/api/jobs/${jobId}/location-batch`;

    let authToken: string | undefined;
    try {
      const body = isLoadBoard
        ? { type: "load_board", listingId: jobId }
        : { jobId };
      const resp = await apiRequest("POST", "/api/auth/bg-location-token", body);
      if (resp.ok) {
        const data = await resp.json();
        authToken = data.token;
      }
    } catch {
      // Non-fatal — foreground service still starts; native GPS just won't post
    }
    void startForegroundTracking({ jobId, authToken, batchPath });
  }

  private startFlushTimer(): void {
    this.stopFlushTimer();
    // The periodic tick doubles as a server liveness check: it contacts the
    // batch endpoint even when the queue is empty (allowEmpty), so a job that
    // has ended/cancelled is detected ({ active:false }) and the tracker stops
    // — otherwise a stationary worker with a drained queue could keep the GPS
    // watch alive until the 8 h safety cap.
    this.flushTimer = setInterval(() => { void this.flush(true, true); }, BATCH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Upload queued breadcrumbs. Without `force` it only fires once the queue has
   * reached BATCH_SIZE (the periodic timer and task-end paths force it). On
   * network failure the queue is retained for the next attempt; if the server
   * replies { active: false } the whole tracker is torn down.
   */
  async flush(force = false, allowEmpty = false): Promise<void> {
    if (this.flushing) return;
    const jobId = this.activeJobId;
    if (jobId == null) return;
    if (this.queue.length === 0 && !allowEmpty) return;
    if (!force && this.queue.length < BATCH_SIZE) return;

    this.flushing = true;
    const batch = this.queue.slice();
    try {
      const batchUrl = this.activeType === "load_board"
        ? `/api/load-board/${jobId}/location-batch`
        : `/api/jobs/${jobId}/location-batch`;
      const resp = await apiRequest("POST", batchUrl, {
        points: batch.map((p) => ({ lat: p.lat, lng: p.lng, ts: p.ts })),
      });
      const data = await resp.json().catch(() => ({} as any));
      // If the tracker was stopped or switched to another job while this upload
      // was in flight, the points we sliced belong to a now-stale session —
      // never mutate the new job's queue.
      if (this.activeJobId !== jobId) return;
      // Drop the points we just uploaded; anything queued during the upload
      // stays for the next flush.
      this.queue = this.queue.slice(batch.length);
      this.persistQueue();
      // Surface server-reported geofence proximity (verification/telemetry only;
      // this never authorizes a payout — the backend enforces that separately).
      if (data && data.geofence && typeof data.geofence.withinRadius === "boolean") {
        this.latestGeofence = {
          withinRadius: data.geofence.withinRadius,
          meters: typeof data.geofence.meters === "number" ? data.geofence.meters : null,
          radius: typeof data.geofence.radius === "number" ? data.geofence.radius : 0,
        };
        this.emitGeofence(this.latestGeofence);
      }
      if (data && data.active === false) {
        this.queue = [];
        this.persistQueue();
        this.flushing = false;
        await this.stopTask(jobId, { flush: false });
        return;
      }
    } catch (err: any) {
      // A definitive auth / not-found response means this tracker has no
      // business running (session expired, wrong user, job reassigned or
      // deleted). Tear it down rather than retrying forever. Network / 5xx
      // errors are transient — keep the queue and retry on the next tick.
      const status = err?.status;
      if ((status === 401 || status === 403 || status === 404) && this.activeJobId === jobId) {
        this.flushing = false;
        await this.stopTask(jobId, { flush: false });
        return;
      }
    } finally {
      this.flushing = false;
    }
  }

  // ── persistence / crash recovery ──────────────────────────────────────────

  private persistMeta(): void {
    try {
      localStorage.setItem(LS_JOB, String(this.activeJobId));
      localStorage.setItem(LS_TYPE, this.activeType);
      localStorage.setItem(LS_STARTED, String(this.startedAt));
    } catch { /* storage unavailable — degrade to in-memory only */ }
  }

  private persistQueue(): void {
    try { localStorage.setItem(LS_QUEUE, JSON.stringify(this.queue)); } catch { /* ignore */ }
  }

  private persistLast(c: Coords): void {
    try { localStorage.setItem(LS_LAST, JSON.stringify(c)); } catch { /* ignore */ }
  }

  private clearPersisted(): void {
    try {
      localStorage.removeItem(LS_JOB);
      localStorage.removeItem(LS_TYPE);
      localStorage.removeItem(LS_QUEUE);
      localStorage.removeItem(LS_LAST);
      localStorage.removeItem(LS_STARTED);
    } catch { /* ignore */ }
  }

  private loadPersisted(jobId: number): void {
    try {
      const savedJob = localStorage.getItem(LS_JOB);
      if (savedJob && Number(savedJob) === jobId) {
        const t = localStorage.getItem(LS_TYPE);
        if (t === "job" || t === "load_board") this.activeType = t;
        const q = localStorage.getItem(LS_QUEUE);
        this.queue = q ? JSON.parse(q) : [];
        const last = localStorage.getItem(LS_LAST);
        if (last) {
          const c = JSON.parse(last) as Coords;
          this.latest = c;
          // ts:0 so the first post-resume fix is always accepted.
          this.lastAccepted = { ...c, ts: 0 };
        }
        const s = localStorage.getItem(LS_STARTED);
        if (s) this.startedAt = Number(s) || this.startedAt;
        return;
      }
    } catch { /* fall through to a clean slate */ }
    this.queue = [];
    this.lastAccepted = null;
  }

  /**
   * Call once at app boot. If a task was active when the app was last closed,
   * restart the watch and flush any pending breadcrumbs. The first upload
   * doubles as a liveness check — if the job has since ended the server replies
   * { active: false } and the tracker tears itself down.
   */
  async resumeIfActive(): Promise<void> {
    try {
      const savedJob = localStorage.getItem(LS_JOB);
      if (!savedJob) return;
      const jobId = Number(savedJob);
      if (!jobId || Number.isNaN(jobId)) {
        this.clearPersisted();
        return;
      }
      await this.startTask(jobId);
      // Heartbeat (allowEmpty) so resume self-corrects even with no pending
      // breadcrumbs: if the job ended, was reassigned, or this is the wrong
      // user, the server replies { active:false } / 403 / 404 and the tracker
      // tears itself down instead of running an orphaned watch.
      void this.flush(true, true);
    } catch { /* ignore */ }
  }
}

// App-wide singleton. Tests import the class directly for isolated instances.
export const taskTrackingService = new TaskTrackingService();
