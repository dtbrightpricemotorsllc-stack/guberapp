import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("@/lib/gps", () => ({
  gpsStartWatchPosition: vi.fn(),
  gpsClearWatch: vi.fn(),
}));
vi.mock("@/lib/foreground-tracking", () => ({
  startForegroundTracking: vi.fn(),
  stopForegroundTracking: vi.fn(),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

import { gpsStartWatchPosition, gpsClearWatch } from "@/lib/gps";
import { apiRequest } from "@/lib/queryClient";
import { TaskTrackingService, haversineMeters } from "./TaskTrackingService";

type SuccessCb = (pos: GeolocationPosition) => void;

function makePos(lat: number, lng: number, ts: number, accuracy = 10): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: ts,
  } as GeolocationPosition;
}

// ~10 m of latitude per 0.00009 deg, so steps below give predictable distances.
const BASE_LAT = 40;
const BASE_LNG = -75;

describe("TaskTrackingService", () => {
  let svc: TaskTrackingService;
  let success: SuccessCb;

  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* node env */ }
    (gpsStartWatchPosition as any).mockImplementation(async (s: SuccessCb) => {
      success = s;
      return 4242;
    });
    (gpsClearWatch as any).mockResolvedValue(undefined);
    (apiRequest as any).mockResolvedValue({ json: async () => ({ active: true, stored: 0 }) });
    svc = new TaskTrackingService();
  });

  afterEach(async () => {
    await svc.stopTask();
  });

  it("starts a GPS watch and tracks the active job", async () => {
    await svc.startTask(101);
    expect(gpsStartWatchPosition).toHaveBeenCalledTimes(1);
    expect(svc.getActiveJobId()).toBe(101);
    expect(svc.isTracking()).toBe(true);
  });

  it("clears the watch and flushes the queue on stop", async () => {
    await svc.startTask(101);
    success(makePos(BASE_LAT, BASE_LNG, 1_000));
    success(makePos(BASE_LAT + 0.001, BASE_LNG, 70_000)); // ~111 m, accepted
    expect(apiRequest).not.toHaveBeenCalled(); // under BATCH_SIZE, no auto-flush

    await svc.stopTask();
    expect(gpsClearWatch).toHaveBeenCalledWith(4242);
    expect(apiRequest).toHaveBeenCalledTimes(1); // task-end forced flush
    const [, , body] = (apiRequest as any).mock.calls[0];
    expect(body.points).toHaveLength(2);
    expect(svc.getActiveJobId()).toBeNull();
  });

  it("throttles fixes by distance and time (5 m skipped, 30 m kept)", async () => {
    const seen: Array<{ lat: number; lng: number }> = [];
    await svc.startTask(101);
    svc.subscribe((c) => seen.push(c));

    success(makePos(BASE_LAT, BASE_LNG, 1_000)); // first — always kept
    success(makePos(BASE_LAT + 0.000045, BASE_LNG, 2_000)); // ~5 m, +1 s — skipped
    success(makePos(BASE_LAT + 0.00027, BASE_LNG, 3_000)); // ~30 m — kept

    expect(seen).toHaveLength(2);
  });

  it("keeps a fix after 60 s even when stationary", async () => {
    const seen: Array<{ lat: number; lng: number }> = [];
    await svc.startTask(101);
    svc.subscribe((c) => seen.push(c));

    success(makePos(BASE_LAT, BASE_LNG, 1_000)); // first — kept
    success(makePos(BASE_LAT, BASE_LNG, 5_000)); // same spot, +4 s — skipped
    success(makePos(BASE_LAT, BASE_LNG, 70_000)); // same spot, +69 s — kept

    expect(seen).toHaveLength(2);
  });

  it("batches uploads: 9 fixes hold, the 10th triggers one POST of 10 points", async () => {
    await svc.startTask(101);
    // Space each fix > 60 s apart so all 10 are accepted regardless of distance.
    for (let i = 0; i < 9; i++) {
      success(makePos(BASE_LAT, BASE_LNG, (i + 1) * 61_000));
    }
    expect(apiRequest).not.toHaveBeenCalled();

    success(makePos(BASE_LAT, BASE_LNG, 10 * 61_000));
    // flush is async (fire-and-forget from onPosition) — let microtasks settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [method, url, body] = (apiRequest as any).mock.calls[0];
    expect(method).toBe("POST");
    expect(url).toBe("/api/jobs/101/location-batch");
    expect(body.points).toHaveLength(10);
  });

  it("auto-stops when the server reports the job is no longer trackable", async () => {
    (apiRequest as any).mockResolvedValue({ json: async () => ({ active: false }) });
    await svc.startTask(101);
    success(makePos(BASE_LAT, BASE_LNG, 1_000));
    success(makePos(BASE_LAT, BASE_LNG, 70_000));
    await svc.flush(true); // deterministic: awaits the internal stopTask

    expect(gpsClearWatch).toHaveBeenCalled();
    expect(svc.getActiveJobId()).toBeNull();
  });

  it("stops on the periodic heartbeat even when the queue is empty and the job ended", async () => {
    await svc.startTask(101);
    // No accepted fixes queued. Server now reports the job is no longer trackable.
    (apiRequest as any).mockResolvedValue({ json: async () => ({ active: false }) });
    await svc.flush(true, true); // heartbeat path (allowEmpty) the timer uses

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [, , body] = (apiRequest as any).mock.calls[0];
    expect(body.points).toHaveLength(0);
    expect(svc.getActiveJobId()).toBeNull();
    expect(gpsClearWatch).toHaveBeenCalled();
  });

  it("does not contact the server on an empty queue without allowEmpty", async () => {
    await svc.startTask(101);
    await svc.flush(true); // force, but no heartbeat and nothing queued
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("tears down a resumed tracker when the server rejects with 403 (stale / wrong user)", async () => {
    try {
      localStorage.setItem("guber.tracking.activeJobId", "777");
      localStorage.setItem("guber.tracking.startedAt", String(Date.now()));
    } catch { /* node env: simulate via startTask below */ }
    const err: any = new Error("Not assigned");
    err.status = 403;
    (apiRequest as any).mockRejectedValue(err);

    if (typeof localStorage === "undefined") {
      // Fallback for environments without localStorage: drive startTask directly.
      await svc.startTask(777);
      await svc.flush(true, true);
    } else {
      await svc.resumeIfActive();
    }

    expect(gpsClearWatch).toHaveBeenCalled();
    expect(svc.getActiveJobId()).toBeNull();
  });

  it("does not corrupt a new job's queue when an in-flight flush resolves after a job switch", async () => {
    let resolveFirst!: (v: any) => void;
    (apiRequest as any).mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; }),
    );
    await svc.startTask(101);
    success(makePos(BASE_LAT, BASE_LNG, 1_000)); // queued for job 101
    const firstFlush = svc.flush(true); // starts, awaits the pending apiRequest

    // Switch to a different job while the first upload is still in flight.
    (apiRequest as any).mockResolvedValue({ json: async () => ({ active: true }) });
    await svc.startTask(202);
    success(makePos(BASE_LAT + 0.001, BASE_LNG, 100_000)); // queued for job 202

    // Now let the stale job-101 upload resolve — it must NOT slice job 202's queue.
    resolveFirst({ json: async () => ({ active: true }) });
    await firstFlush;

    expect(svc.getActiveJobId()).toBe(202);
    // The job-202 breadcrumb is still queued (the stale flush left it alone).
    await svc.flush(true);
    const lastCall = (apiRequest as any).mock.calls.at(-1);
    expect(lastCall[1]).toBe("/api/jobs/202/location-batch");
    expect(lastCall[2].points).toHaveLength(1);
  });

  it("haversineMeters is roughly correct", () => {
    const d = haversineMeters({ lat: BASE_LAT, lng: BASE_LNG }, { lat: BASE_LAT + 0.001, lng: BASE_LNG });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});

describe("watch cleanup guards (source scan)", () => {
  const files = {
    "google-map.tsx": resolve(process.cwd(), "client/src/components/google-map.tsx"),
    "job-navigate.tsx": resolve(process.cwd(), "client/src/pages/job-navigate.tsx"),
  };

  for (const [name, path] of Object.entries(files)) {
    it(`${name} clears GPS watches via gpsClearWatch and never raw navigator.geolocation.clearWatch`, () => {
      const src = readFileSync(path, "utf8");
      expect(src.includes("gpsClearWatch")).toBe(true);
      expect(src.includes("navigator.geolocation.clearWatch")).toBe(false);
    });
  }
});
