---
name: Full-screen overlay sequencing (GPS notice vs onboarding tour)
description: Why the GPS disclaimer and dashboard onboarding tour must never co-mount, and the contract that enforces GPS-first.
---

# Full-screen overlays must be mutually exclusive

The GPS "Location Access" disclaimer (`GpsDisclaimerModal`, mounted globally in `guber-layout.tsx` at `z-[200]`, opened via the `guber:show-gps-disclaimer` window event from `lib/gps.ts`) and the `DashboardTour` onboarding coach-mark (rendered in `dashboard.tsx`) are independent and were both mounting on first launch, overlapping into an unreadable stack.

**Rule:** GPS disclaimer takes priority. Any first-run/onboarding overlay must defer while the GPS notice is open.

**Contract (in `lib/gps.ts`):**
- `ensureGpsDisclaimer()` sets a module-level `disclaimerPending=true` and fires `guber:show-gps-disclaimer`.
- `acceptGpsDisclaimer()` / `dismissGpsDisclaimer()` set `disclaimerPending=false` and fire `guber:gps-disclaimer-resolved`.
- `isGpsDisclaimerPending()` lets UI mounted *after* the show event still know the modal is open (closes the race where a listener missed the event).

Consumers gate themselves on both the events and the pending flag (see `gpsBlocking` in `dashboard.tsx`). Any new full-screen overlay should do the same rather than rendering unconditionally.

**Why:** This class of bug — two valid overlays at the same z-layer — is invisible to TypeScript, the state-bleed audit, unit tests, and the Mission Control watchdog. Nothing in the pipeline does visual-regression/screenshot diffing, and the collision only happens in the brand-new-user state (GPS not yet accepted + tour not yet seen) that seeded test accounts skip. So it ships silently. Keep overlays mutually exclusive at the source.
