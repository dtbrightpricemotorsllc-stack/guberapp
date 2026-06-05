---
name: Live task location tracking
description: How GUBER's foreground worker-location tracking is structured and the non-obvious invariants that keep it from leaking or over-tracking.
---

# Live task location tracking

Worker live-location tracking lives in a standalone, UI-independent service
(`client/src/services/location/TaskTrackingService.ts`, singleton
`taskTrackingService`), NOT inside the map component. The map only `subscribe()`s
for render updates; the GPS watch lifetime is owned by the service.

## Hard rules (product invariant)
- Tracking runs ONLY for an actively accepted/in-progress task — gated on
  `helperStage` being `on_the_way` or `arrived`. NEVER during browsing,
  searching, map-viewing, or job posting.
- Foreground only. True OS-level background tracking was deliberately deferred.
- The service is started from `job-navigate.tsx` (idempotent `startTask`) and is
  intentionally NOT stopped on unmount — it self-stops on a server-driven signal.

## Non-obvious invariants (each caused a real bug / review failure)
- **Clear Capacitor watches via `gpsClearWatch`, never `navigator.geolocation.clearWatch`.**
  **Why:** the Capacitor geolocation shim returns a synthetic numeric watch id
  that the browser API cannot clear, so raw `clearWatch` silently leaks the
  watch. A source-scan test (`task-tracking.test.ts`) enforces that map +
  job-navigate use `gpsClearWatch` and never the raw call.
- **The periodic flush must contact the server even when the queue is empty**
  (heartbeat / `allowEmpty`). **Why:** the only way the client learns a job
  ended is the batch endpoint replying `{ active:false }`. A stationary worker
  with a drained queue would otherwise keep the GPS watch alive until the 8h
  safety cap. The 120s timer and `resumeIfActive()` both use the empty-allowed
  heartbeat; one-off batch/stop flushes do not.
- **Treat 401/403/404 from the batch endpoint as terminal** — stop the tracker.
  **Why:** resume-at-boot blindly restarts from a persisted job id; if it's the
  wrong user or a reassigned/deleted job the upload 403/404s, and retrying
  forever would run an orphaned watch. 5xx/network errors stay transient (keep
  the queue, retry next tick).
- **Guard against a job switch landing mid-flush:** after the in-flight upload
  resolves, re-check `activeJobId === jobId` before slicing the queue, or a
  stale flush will drop the new job's freshly-queued breadcrumbs.

## Cost controls
- Throttle: keep a fix only if it's the first, moved ≥25m, or ≥60s since the last
  kept fix.
- Batch upload: flush at ≥10 queued points, every 120s, or on task end.
- Crash recovery: active job id + queue + last fix persisted to localStorage;
  `resumeIfActive()` (called from `App.tsx` once authenticated) restarts the watch.

## Backend
- `POST /api/jobs/:id/location-batch` — assigned-helper-only; runs the trackable
  check (stage + non-terminal status) BEFORE the empty-points guard so an empty
  POST is a valid liveness heartbeat. Returns `{ active:false }` when not
  trackable. New table `job_location_pings` (needs a CREATE TABLE IF NOT EXISTS
  in `server/index.ts` startup — prod has no db:push).
