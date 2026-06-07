---
name: Release-code / secret-verifier handling
description: How one-time pickup codes (and similar secret verifiers) must be stored, compared, and exposed in the Asset Custody / Verified Release System.
---

Any one-time secret verifier (release/pickup codes) in this codebase must follow ALL of:

1. **Hash at rest** — store an HMAC digest (`codeHash`), never plaintext. The human-facing `code` column holds only a masked display value.
2. **Match by digest, timing-safe** — redemption pulls the asset's codes and compares HMAC digests with a constant-time compare; never `WHERE code = $plaintext`.
3. **Redact on the way out** — strip `codeHash` from every API response. The plain code is returned exactly once (at approval) and never retrievable again. A code-review FAIL was caused by returning raw DB rows that still carried `codeHash`.
4. **Rate-limit wrong attempts** — count recent `code_failed` immutable custody events (5 / 15min); over the threshold throw with `err.code = "RATE_LIMITED"` → route returns HTTP 429. Wrong codes append a `code_failed` event (also drives fraud escalation).
5. **Bind to the assigned driver, not the carrier** — `/release/request` and `/release/redeem` must gate on the `"driver"` role only (NOT `["carrier","driver"]`); redemption additionally requires the authorization's `requested_by === session userId` (else `DRIVER_MISMATCH` → 403 + `code_failed`). Because the load-board offer-accept paths originally assigned only `"carrier"`, they now assign BOTH `"carrier"` and `"driver"` to the connecting carrier (default owner-operator) — otherwise the driver-only gate breaks every standard pickup. A later driver-change/custody-transfer reassigns `"driver"`.

**Why:** these codes authorize physical hand-off of high-value assets; plaintext storage, plaintext SQL lookup, or leaking the verifier digest all undermine the custody guarantee.

**How to apply:** when adding any new secret-code surface, mirror the helpers in `server/asset-custody.ts` (`hashReleaseCode`, `timingSafeHashEqual`, `maskReleaseCode`, `redactReleaseCode`) and gate the whole feature behind its flag.

Separately: the whole Verified Release System ships dark behind the `verified_release_system` flag (default scope `off`). Gating is a single `requireVerifiedReleaseSystem` `app.use` middleware mounted (before the route handlers) on `/api/asset-protection`, `/api/assets`, `/api/witness`, `/api/admin/{assets,incidents,issues}` — returns 404 when disabled; admins always preview regardless of scope.

**Integration-test harness gotchas** (`server/tests/asset-release-handoff.test.ts`): `/release/request` rejects any selfie URL that doesn't start with `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`, so the test env must set `CLOUDINARY_CLOUD_NAME` and build a matching URL. `requestReleaseAuthorization` throws (→ route 500) if tow `plateNumber` or trailer `trailerType` is missing — both are mandatory at request time. Approve already hard-blocks VIN mismatch / out-of-fence, so to exercise the redeem-time VIN re-check you must mint a valid code then tamper the linked `vin_verifications` row to `status='mismatch'`.
