# Light-Mode Visual QA — Findings

Walked the busy screens with `<html>` temporarily switched out of `class="dark"`. The hardcoded `class="dark"` on `client/index.html` was put back after the sweep — see "Meta" below. A `?nosplash=1` query-string bypass was added to `App.tsx` to skip the 2.2s splash overlay during QA.

Public pages were captured live; protected pages (Dashboard, Browse Jobs, Job Detail, Profile, Cash Drops, Biz Dashboard, Post Job, Admin) were audited via static code review for hardcoded dark surfaces that ignore the new light tokens.

## Meta — light mode is unreachable in production

- `client/index.html` line 2 hard-locks `<html class="dark">` and there is no runtime toggle (`grep`-verified: no `classList`, no `setTheme`, no `prefers-color-scheme` in `client/src`).
- The light tokens and `:root:not(.dark)` rules added during the bright-day pass therefore never fire in production. Any QA work on light mode is preventative until a toggle ships.
- Fix note: ship a theme toggle (or remove the hardcoded `dark` and follow OS preference) before treating the light-mode polish as user-visible.

## Findings fixed in this pass

These were busy-screen primitives whose dark hardcoded styles bled through every page that used them. Light variants added in `client/src/index.css`:

1. **`.premium-input`** — was `hsl(225 18% 7% / 0.8)` background with a near-black border. In light mode the inputs rendered as dark gray rectangles on the white card. **Fix:** added `:root:not(.dark) .premium-input` with white background, `hsl(220 10% 65%)` border, and a softer green focus ring. Used on Login, Signup, Forgot Password, Post Job, Browse Jobs, Admin, Dashboard, etc. (`screenshots/light-qa/01-login.jpg`, `02-signup.jpg`, `03-forgot.jpg`).
2. **`.btn-glass-premium`** — dark glass background + heavy `rgba(0,0,0,.4)` shadow. **Fix:** added light variant with white surface, lighter border, soft shadow.
3. **`.stat-card`** — dark gradient + dark border. **Fix:** added light variant matching the new `.glass-card` light treatment.
4. **`.premium-toggle`** — dark inset shell. **Fix:** added light variant.

After the fixes the auth screens render cleanly in light mode (see `01-login.jpg`, `02-signup.jpg`, `03-forgot.jpg`).

## Findings logged but NOT fixed (intentional dark "treatment" or out of scope)

5. **Business Signup (`pages/business-signup.tsx:115`)** — hardcoded `style={{ background: "#000000" }}` plus gold/purple radial accents. Reads as an intentional brand-immersive dark hero for the private-business gate. **Fix note:** if light mode ships, replace `#000000` with `bg-background` and re-skin the accents with theme-aware tokens. (`screenshots/light-qa/04-biz-signup.jpg`).
6. **Cash Drop Detail (`pages/cash-drop-detail.tsx`)** — multiple dark amber gradient cards (`linear-gradient(135deg, #1a0a00, #2d1200)` etc.) and dark emerald payout cards (`#001a0a → #002d12`). These are cash-drop "glow" treatments with amber/emerald rims. **Fix note:** in light mode swap the dark gradient stops for warm-cream / pale-mint so the amber/emerald rims still read as the hero, e.g. `linear-gradient(135deg, #fff8eb, #ffefcc)` for amber and `#ecfdf5 → #d1fae5` for emerald.
7. **Job Detail (`pages/job-detail.tsx` lines 2211, 2277, 2343, 2416)** — bottom-sheet modals hardcoded `bg-[#0d0d1a]`. **Fix note:** replace with `bg-card` so the sheets follow the active theme. Also the print-button inline `style="background:#111"` at line 357 should switch to the primary token.
8. **Job Detail payout-complete card (line 2111)** — `linear-gradient(135deg,#001a0a,#002d12)`. Same note as #6.
9. **Biz Dashboard (`pages/biz-dashboard.tsx` lines 225, 242)** — cards hardcoded `style={{ background: "#0A0A0A" }}` with gold borders. In light mode these become near-black panels on a light surface — visually heavy. **Fix note:** swap to `hsl(var(--card))` and rely on the gold border for the brand cue.
10. **Dashboard (`pages/dashboard.tsx`)** — many inline `rgba(...)` chips for referral/sponsored badges (lines 723, 850, 910). Low-opacity overlays on a dark base; in light mode the contrast collapses to barely-visible tints. **Fix note:** raise the alpha (e.g. `0.18 → 0.32`) and darken the text token under `:root:not(.dark)`, or drive the chip from a `--badge-*` variable so it adapts.

## Files touched

- `client/src/index.css` — added `:root:not(.dark)` variants for `.premium-input`, `.btn-glass-premium`, `.stat-card`, `.premium-toggle`.
- `client/src/App.tsx` — added `?nosplash=1` bypass for the splash overlay so QA / dev iteration is not blocked by the 2.2s intro.
- `client/index.html` — temporarily removed `class="dark"` during the sweep, then restored. No net change.

## Screenshots

- `00-root.jpg` — splash overlay (before bypass) for reference
- `01-login.jpg` — Login, light, after fix
- `02-signup.jpg` — Signup, light, after fix
- `03-forgot.jpg` — Forgot password, light, after fix
- `04-biz-signup.jpg` — Business Signup, hardcoded black hero (finding #5)
