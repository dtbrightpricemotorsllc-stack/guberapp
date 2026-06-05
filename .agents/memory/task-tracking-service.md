---
name: Live task location tracking
description: Durable invariants for GUBER's foreground worker-location tracking — the rules that keep it from leaking, over-tracking, or breaching iOS location-privacy scope.
---

# Live task location tracking

Worker live-location tracking is owned by a standalone, UI-independent service,
not the map (the map only subscribes for render updates). These are the
non-obvious rules a future change must respect; the current code shows the
structure, so this file deliberately avoids restating paths/constants.

## Product invariant
- Tracking runs ONLY for an actively accepted/in-progress task. NEVER during
  browsing, searching, map-viewing, or posting. **Why:** continuous GPS while
  merely browsing is both a battery cost and an App Store privacy red flag.
- Foreground only — OS-level background tracking is deliberately deferred.
  **How to apply:** do NOT add a background location mode or the iOS "Always"
  location entitlement; only When-In-Use is permitted. A reviewer will reject
  the build if the over-broad "Always" key reappears without a real background
  use case.

## Leak / lifecycle invariants (each was a real bug or review failure)
- **Clear Capacitor GPS watches via the gps wrapper, never raw
  `navigator.geolocation.clearWatch`.** **Why:** the Capacitor shim returns a
  synthetic numeric watch id the browser API can't clear, so the raw call
  silently leaks the watch. A source-scan unit test enforces this.
- **The tracker self-stops on a server signal, not on component unmount.**
  **Why:** the watch must survive the worker leaving the map screen; the only
  authoritative stop is the server reporting the job is no longer trackable.
- **The periodic flush must contact the server even with an empty queue
  (heartbeat).** **Why:** otherwise a stationary worker whose queue has drained
  never learns the job ended and keeps the watch alive until the safety cap.
- **Treat auth/not-found responses (401/403/404) as terminal — stop.** **Why:**
  resume-at-boot restarts from a persisted job id; a wrong-user/reassigned/
  deleted job would otherwise retry forever as an orphaned watch. Network/5xx
  errors stay transient (retain queue, retry).
- **Re-check the active job after an in-flight upload resolves before mutating
  the queue.** **Why:** a flush completing after a job switch will otherwise
  drop the new job's freshly-queued breadcrumbs.

## Backend gate
- The batch endpoint is assigned-helper-only and runs the trackable check
  (active stage + non-terminal status) BEFORE any empty-points guard, so an
  empty POST is a valid liveness heartbeat. Any new ping table needs a
  CREATE TABLE IF NOT EXISTS at server startup — prod has no db:push step.
