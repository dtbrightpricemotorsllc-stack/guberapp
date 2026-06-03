---
name: Mission Control Watchdog
description: The automated health-monitor engine — what it checks, how the endpoint is secured, and what must stay in sync.
---

# Mission Control Watchdog

`scripts/automated-watchdog.mjs` is GUBER's autonomous health engine. One pass
(`runHealthCheck()`) runs three checks and rolls them into a JSON report whose
counts are **measured live, never hardcoded**:

1. State-bleed audit (`scripts/audit-statebleed.mjs --json`) over form/flow components.
2. The protected vitest suites listed in `PROTECTED_TEST_SUITES`.
3. Native manifest key integrity (Android location/notification perms + FCM channel id, iOS location usage strings, iOS `aps-environment`).

Exposed at `GET|POST /api/internal/mission-control/status` (server/routes.ts).

**Rule:** if the set of protected test suites changes, update `PROTECTED_TEST_SUITES`
in the watchdog. If you add/rename a required native manifest key, update
`MANIFEST_REQUIREMENTS`. The endpoint and CLI both derive everything from those
two constants — there is no second place to edit.

**Why:** the whole point is to catch regressions; a stale suite list or hardcoded
count would report GREEN while real coverage rotted.

**How to apply:**
- Auth reuses `CRON_SECRET` (header `x-cron-secret` only — query secret is rejected
  to avoid log/referrer leakage). Dev with no `CRON_SECRET` set is open for local testing; prod with no secret returns 503.
- GREEN → HTTP 200, RED → HTTP 503 (so external monitors flag failed runs).
- The endpoint spawns the watchdog as a child process and is single-flighted:
  concurrent pings share one in-flight run (`shared_run: true` in the response).
- It runs the full vitest suite (~5–15s). Intended for dev/staging monitoring;
  Autoscale prod images that strip devDependencies/test files will report the
  test check as failing.
