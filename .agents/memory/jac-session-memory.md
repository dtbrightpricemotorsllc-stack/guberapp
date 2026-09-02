---
name: JAC Workflow Session Memory
description: Per-user mid-conversation state so JAC can resolve "change that to Friday" without restarting a workflow.
---

# JAC Workflow Session Memory

## The rule
After `create_job_draft`, session state is written to `jac_session_state` (one row per user). `edit_job_draft` and `publish_job` fall back to `session.draftObjectId` when the caller omits `draft_id`. Clear session after publish.

**Why:** ElevenLabs voice turns and text turns are stateless — no memory of the prior message. Session state is the only way to resolve pronouns ("that draft", "it") across turns.

**How to apply:** Any new workflow that creates a draft must call `setJacSession` with `currentWorkflow`, `draftObjectId`, `selectedModule`. Its edit/publish siblings must fall back to `session.draftObjectId` when the explicit ID is absent.

Guest-to-auth workflow handoff must be durably persisted before the guest session is deleted or the UI navigates away. A database write failure is a failed transfer, not a cache-only success.

**Why:** Registration and voice-provider redirects can destroy in-memory UI state; reporting success before PostgreSQL accepts the workflow loses the user's intent after authentication.

**How to apply:** Keep guest state available for retry until the authenticated session write succeeds. New workflow transfer logic must extend the existing guest-draft migration loop, never replace or skip its legacy draft types.

## Key files
- `server/jac-session.ts` — `getJacSession`, `setJacSession`, `clearJacSession`, `summarizeSession`
- `server/index.ts` — `jac_session_state` table provisioned at startup (idempotent)
- `server/routes.ts` — `/api/jac/action` handler; session loaded once at top as `_session`

## New actions added to /api/jac/action
- `get_session_state` — returns current workflow, draftObjectId, collectedFields (works unauthenticated → empty)
- `set_session_context` — JAC sets objective/workflow/module after interpreting user intent
- `clear_session` — resets session (user finishes workflow or explicitly starts over)

## Session TTL
2 hours (SESSION_TTL_MS), enforced in code at read time. DB rows are NOT auto-deleted — a cron cleanup is a planned follow-up.

## Cache
30-second in-memory read cache per user (single-process safe). If multi-instance ever runs, switch to Redis.
