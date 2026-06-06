---
name: tsx stale routes after big edits
description: New Express routes 404-ing into the SPA catch-all after large routes.ts edits
---
Newly added Express routes in `server/routes.ts` returned the Vite SPA index.html (Content-Type text/html, 200, no JSON body in the express logger line) even though the route code was correct and on disk (verified with `rg`/`sed`/`wc -l`).

**Cause:** the running `tsx` dev process hot-reloaded but kept a stale route table — the new `app.get/post(...)` registrations were not live. The code on disk was fine.

**Fix:** restart the `Start application` workflow. After restart the routes returned proper JSON (e.g. 401 from `requireAuth`).

**How to apply:** if a brand-new route returns HTML/SPA fallback, do NOT chase route-ordering or shadowing first. Confirm the code is on disk with `rg`, then `restart_workflow`, then re-test. Also note: the `read`/`edit` tools can show a STALE shorter copy of very large files (`server/routes.ts`); trust `rg`/`sed`/`wc -l` for live line numbers.
