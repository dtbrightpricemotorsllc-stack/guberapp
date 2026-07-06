---
name: createAuditLog schema mismatch
description: storage.createAuditLog() only accepts userId/action/details/ipAddress/reviewStatus/reviewedAt — passing other field names crashes with a misleading error.
---

`storage.createAuditLog()` writes to the `audit_logs` table, whose schema (`shared/schema.ts`) only has: `userId`, `action`, `details`, `ipAddress`, `reviewStatus`, `reviewedAt`, `createdAt`.

Some call sites in `server/routes.ts` were written against a different (imagined) shape — `actorId`, `entityType`, `entityId`, `metadata` — none of which exist on the table. Drizzle's insert then throws, and because the thrown error serializes whatever was inside the bogus `metadata` object, the resulting 500 response can look like an unrelated bug (e.g. it surfaced client-side as "Cannot read properties of undefined (reading 'gpsLat')" on a clock-in endpoint that had nothing wrong with its GPS logic).

**Why:** the crash message is misleading because it echoes a field name from the audit-log payload, not the actual broken code path — easy to chase the wrong bug for a while.

**How to apply:** whenever adding/reviewing a `storage.createAuditLog(...)` call, confirm it only passes `userId`, `action`, `details` (JSON.stringify freeform data into `details`), and optionally `ipAddress`/`reviewStatus`/`reviewedAt`. If a 500 error message references a field that seems unrelated to the endpoint's real logic, check nearby `createAuditLog` calls first before assuming the field itself is broken.
