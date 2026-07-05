---
name: JAC System Guardian + both-surface rule
description: How JAC's dual role works — user coordinator + system guardian — and the invariant that every JAC change must land on BOTH chat surfaces.
---

# JAC dual role & the both-surface rule

## Both-surface rule (invariant)
JAC has TWO independent chat endpoints and **every** behavior change (prompt
text, short-circuits, guardrails) must be applied to BOTH, or the two surfaces
drift:
- `POST /api/jac/onboard` — guest/auth-optional (guest homepage). Session user
  may be null; fetch role via `storage.getUser(session.userId)` before any
  admin-only branch.
- `POST /api/ai/guber-assist` — `requireAuth`; `sessionUser` already fetched.

**Why:** replit.md mandates it and past changes shipped to only one surface,
producing inconsistent JAC answers depending on login state.
**How to apply:** when editing one endpoint, grep the other for the parallel
block (both share a voice-tech short-circuit + a `tryLocalAnswer` fallback +
an `openai.chat.completions.create` call) and mirror the edit.

## System Guardian telemetry (`server/system-issues.ts`)
- Failures are upserted into `system_issues` deduped by a **fingerprint** =
  `module + normalizedMessage + route + platform` (volatile ids/hex/long
  numbers stripped from the message), so a repeating failure bumps
  `occurrence_count`, not row count.
- Severity is **always server-classified** (`classifySeverity`) — the public
  `/api/issues/report` endpoint never trusts a client-declared severity, or
  anyone could spam "critical" and trigger founder alerts.
- Severity is **monotonic (worst-ever)**: the upsert takes the more severe of
  old vs new, so a later non-blocking re-fire can't mask an earlier critical
  and can't cause escalation flapping.

## Critical escalation (no floods)
- `escalateCriticalIssue()` notifies all `role='admin'` users
  (`storage.createNotification` → also fires push) with cta
  `/admin/qa?tab=system-issues`.
- Fire it when `severity==='critical' && (isNew || oldSeverity !== 'critical')`
  — i.e. a brand-new critical OR an **upgrade** to critical on a known issue.
  A repeat of an already-critical fingerprint never re-notifies.
- `isNew` comes from `(xmax = 0)`; `oldSeverity` comes from a `prev` CTE that
  reads the pre-upsert row under the same snapshot.
**Why:** dedupe must silence repeats but must NOT silence a failure that only
becomes blocking later; both are required for trustworthy alerts.

## Admin monitoring answers are cost-free
- `tryAdminMonitoringAnswer(message)` detects monitoring intent ("did payments
  work today", "any critical issues", "system health") and returns a formatted
  reply from `getIssuesSummary` / `getModuleHealthToday`, else null.
- Both JAC endpoints call it ONLY when the requester is admin, and return its
  reply **before** the OpenAI call — so admin monitoring adds ZERO model cost.
- Pure DB reads; regexes are built from a fixed word list via `escapeRegExp`
  (user text is only the test subject, never regex source).

## Client global capture (`report-issue.ts`, `queryClient.ts`)
- The reporter posts via **raw fetch** to `/api/issues/report` (never
  `apiRequest`/`getQueryFn`), guarded by an `isReporting()` recursion flag and a
  per-key session cap — so global `window.onerror`/`unhandledrejection` +
  network capture can't recurse or flood.
- Network layer reports only **5xx** (4xx are expected: auth/validation/404).
