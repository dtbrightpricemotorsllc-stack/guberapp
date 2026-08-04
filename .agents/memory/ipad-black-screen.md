---
name: iPad black screen — LoadingSplash + auth timeout
description: Root cause and fix for Capacitor iPad showing permanent black screen on TestFlight.
---

## The Bug
`LoadingSplash` component: `position: fixed; inset: 0; z-index: 99998; background: #000`.
It stays visible while `isLoading` (from `useAuth()`) is `true`.

`auth-context.tsx` queryFn called `fetch("/api/auth/me")` with **no timeout**.
On Autoscale cold starts (or flaky mobile networks), the fetch hangs indefinitely.
→ `isLoading` stays `true` forever → black screen never resolves.

The "two dots" visible in iPad photo were the two neon aura glow circles inside
LoadingSplash (`guber-loading-halo-pulse` + `guber-loading-badger-pulse`) — the only
elements visible when the badger/city bg images also fail to load.

## The Fix (commit ecb2c647)

1. **auth-context.tsx**: `AbortController` with 10s timeout on `fetch("/api/auth/me")`.
   `AbortError` → return `null` (treat as logged-out). Ensures `isLoading` resolves ≤10s.

2. **App.tsx**: `splashDone` initialized to `true` when `isNativeApp === true`.
   Web splash entirely skipped on Capacitor iOS/Android. Native splash screen handles launch.

3. **root-error-boundary.tsx** + **main.tsx**: React `ErrorBoundary` wraps entire app.
   Any render crash shows a dark-blue screen with error message + RETRY button (not black).

**Why:**
- `server.url` in capacitor.config.ts means the app loads from `https://guberapp.app`.
- Autoscale can cold-start and take 10-30s before responding.
- WKWebView's default fetch has no built-in timeout → hangs → splash stuck.
- Skipping splash on native is safe: Capacitor's native SplashScreen plugin
  already covers the launch gap; `PageLoader` spinners are shown inside pages anyway.
