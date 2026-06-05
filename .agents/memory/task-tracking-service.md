---
name: Live task location tracking
description: Durable invariants for GUBER's foreground worker-location tracking — the rules that keep it from leaking, over-tracking, or breaching iOS location-privacy scope.
---

# Live task location tracking

Worker live-location tracking is a standalone, UI-independent service that owns
the GPS watch — the map only subscribes for render updates. (Find it by topic:
search the client `services/location` dir.) These are the non-obvious rules;
the code itself shows the structure.

## Product invariant
- Tracking runs ONLY for an actively accepted/in-progress task (`helperStage`
  `on_the_way`/`arrived`). NEVER during browsing, searching, map-viewing, or
  posting. **Why:** continuous GPS while merely browsing is both a battery cost
  and an App Store privacy red flag.
- Foreground only — true OS-level background tracking is deliberately deferred.
  **How to apply:** do NOT add `UIBackgroundModes: location` or the iOS
  `NSLocationAlwaysAndWhenInUseUsageDescription` entitlement. Only
  `NSLocationWhenInUseUsageDescription` is permitted. A reviewer will (rightly)
  reject the build if the over-broad "Always" key reappears without a real
  background use case.

## Leak / lifecycle invariants (each was a real bug or review failure)
- **Clear Capacitor GPS watches via the gps.ts `gpsClearWatch` wrapper, never
  raw `navigator.geolocation.clearWatch`.** **Why:** the Capacitor shim hands
  back a synthetic numeric watch id the browser API can't clear, so the raw
  call silently leaks the watch. A source-scan unit test enforces this on the
  map + job-navigate screens.
- **The tracker self-stops on a server signal, not on component unmount.**
  **Why:** the watch must survive the worker leaving the map screen. The only
  authoritative "stop" is the batch endpoint replying `{ active:false }`.
- **The periodic flush must hit the server even when the queue is empty
  (heartbeat).** **Why:** otherwise a stationary worker whose queue has drained
  never learns the job ended and keeps the watch alive until the safety cap.
- **Treat 401/403/404 from the batch endpoint as terminal — stop.** **Why:**
  resume-at-boot restarts from a persisted job id; a wrong-user/reassigned/
  deleted job would otherwise retry forever as an orphaned watch. 5xx/network
  errors stay transient (retain queue, retry).
- **Re-check the active job id after an in-flight upload resolves before
  mutating the queue.** **Why:** a flush that completes after a job switch will
  otherwise drop the new job's freshly-queued breadcrumbs.

## Backend gate
- The batch endpoint is assigned-helper-only and runs the trackable check
  (active stage + non-terminal status) BEFORE any empty-points guard, so an
  empty POST is a valid liveness heartbeat. New ping table needs a
  CREATE TABLE IF NOT EXISTS at server startup — prod has no db:push step.
