---
name: Homepage intro splash
description: Why screenshots of the public homepage keep showing the animated mascot intro instead of page content
---

The public homepage (`client/src/pages/home.tsx`) plays a multi-phase animated mascot intro ("VERIFY ANYTHING." → "REAL OR FAKE" → "NEED HELP? GET IT DONE." → "DONE.") before revealing the actual hero/category content.

**Why:** The intro is gated so it plays once per session, but the screenshot/app_preview tool loads a fresh browser session on every capture, so the intro replays from the start each time and you can never screenshot past it.

**How to apply:** Don't try to verify homepage UI changes via repeated screenshots — you'll just keep catching the intro. Rely on typecheck + reading the rendered JSX, or test the interactive flow with the Playwright testing skill (which can wait/click through the intro) instead.
