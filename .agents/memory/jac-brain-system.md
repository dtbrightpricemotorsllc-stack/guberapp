---
name: JAC Brain System
description: Local knowledge base + intent matching + response cache that bypasses OpenAI for common GUBER questions, with admin management UI.
---

## Architecture

**3 new tables:** `jac_knowledge`, `jac_intents`, `jac_response_cache` (created in `server/index.ts` startup block, seeded once via `WHERE NOT EXISTS` guard).
**Brain module:** `server/jac-brain.ts` — `tryLocalAnswer()`, `promoteToCache()`, `getJacBrainStats()`.
**Onboard hook:** inserted BEFORE the `const OpenAI = (await import("openai")).default` block in `/api/jac/onboard`; unique anchor is `console.error("[JAC onboard ctx]"...)` which precedes the OpenAI creation.

## Matching Pipeline (in order)
1. **Response cache** — exact MD5 hash match of normalized question, confidence 0.97
2. **Knowledge base** — JSONB keyword/pattern ILIKE match, confidence 0.87
3. **Intents** — sample phrase ILIKE match, confidence 0.80
4. Threshold for bypass: **≥ 0.85** — returns immediately without calling OpenAI

## Why keyword matching works broadly
The word "guber" appears in many KB question_patterns, so it often catches general GUBER questions. More specific KB entries (payments, safety, etc.) have specific keywords that take priority by `hit_count DESC` ordering. Fine-tune by adjusting keywords — more specific keywords win.

## Admin UI
- Route: `/admin/jac-brain`
- Tabs: Stats | Knowledge Base | Intents | Cache | Suggestions
- Stats computed from `hit_count` columns on each table, NOT from jac_interactions (no per-turn log)
- Suggestions query: last user message from jac_interactions.messages->-1 grouped by normalized text, filtered against KB keywords

## jac_interactions extended columns
`intent_detected TEXT`, `cost_source TEXT DEFAULT 'ai'`, `jac_response TEXT`, `user_feedback TEXT`, `admin_reviewed BOOL`, `admin_notes TEXT` — added via ALTER TABLE in startup.

## Seed guard
`WHERE NOT EXISTS (SELECT 1 FROM jac_knowledge WHERE created_by = 'system' LIMIT 1)` — 20 KB entries seeded once.
Same for intents: `WHERE NOT EXISTS (SELECT 1 FROM jac_intents LIMIT 1)` — 10 intents seeded once.

## Two separate JAC chat surfaces — fix both or one still misbehaves
`client/src/components/guber-assistant.tsx` (logged-in sheet, posts to `/api/ai/guber-assist`, requires auth) and `client/src/components/jac-homepage.tsx` (guest widget, posts to `/api/jac/onboard`, no auth) are independent implementations with their own mic/TTS wiring and their own system prompts.
**Why:** they were built at different times and never unified; a prompt/behavior fix (e.g. a deterministic short-circuit for a meta-question) applied to one endpoint silently leaves the other broken, and e2e tests against only one surface will pass while guests see the bug.
**How to apply:** any JAC behavior/voice-tech fix, or new capability like an always-listening conversation mode, must be applied to BOTH `server/routes.ts` handlers (`/api/ai/guber-assist` and `/api/jac/onboard`) and BOTH client components, then e2e-tested against both the guest homepage flow and the logged-in assistant sheet.
