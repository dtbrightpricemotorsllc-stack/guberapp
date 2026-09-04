# Safe Codebase Cleanup Design

## Goal

Reduce repository clutter without changing the running GUBER product, deployment, database, authentication, payments, onboarding, dashboards, native packaging, or JAC's active ElevenLabs/OpenAI behavior.

## Safety boundary

- Base the cleanup branch on verified commit `a480ca5411f7c5519cae07cd79fd9fc7d8cd5743`.
- Never update `main` or `safety/2026-09-03-pre-cleanup`.
- Delete only files with no production import, route, build, mobile, database, or deployment reachability.
- Keep unfinished product features when their future intent is uncertain.
- Keep the disabled JAC Realtime HTTP tombstones returning `410`.
- Preserve removed legacy JAC/OpenAI Realtime work permanently on the safety branch rather than copying it into the active tree.

## Cleanup set

- Remove standalone client modules with no importers.
- Remove the retired OpenAI Realtime relay, browser transport/session, and their direct tests.
- Remove the unused transport-neutral legacy JAC prompt/tool copy and its direct test.
- Remove one obsolete local voice engine superseded by the current provider/ConvAI paths.
- Remove one-off root comparison outputs, the default Python hello scaffold, and unreferenced generated root Android bundles.
- Remove the unused Replit Vite runtime-error-modal dependency.

## Validation

Record the existing type-check baseline, then run the checked-in type check, production build, focused JAC/voice tests, state-bleed audit, promo render smoke test, Android permissions guard, and promo preview roundtrip. Only cleanup-caused failures may be repaired.