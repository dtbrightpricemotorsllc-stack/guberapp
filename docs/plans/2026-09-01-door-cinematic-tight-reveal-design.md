# Tight Door Cinematic Reveal

## Goal

Refine the approved GUBER door film so the physical door opening completes in
roughly 3–4 seconds, with JAC fully readable immediately afterward. The film
must remain a single continuous set: door panels carry their own branding away
as they open, while the environment behind them contains no duplicated,
mirrored, floating, or dissolving TEAM GUBER/logo/text layers.

## Design

- Regenerate the reference-conditioned 9:16 film at five seconds, with the
  sealed-door hold and center beam at the start, physical opening and flash
  concentrated in the first 3–4 seconds, and a short stable JAC environment
  tail.
- Strengthen the generation prompt and negative prompt to prohibit any
  free-floating typography, duplicate wordmarks, mirrored logos, ghosted
  panels, image dissolves, or partial text during the opening.
- Keep the app runtime to one video element plus the lightweight poster
  fallback. No source plates or CSS door/character layers are reintroduced.
- When the film ends (or the fallback completes), automatically add JAC’s
  greeting and mount/start the live voice session. The visitor does not press
  Talk to JAC. Keep a visible Type Instead control in the active voice footer;
  switching to text immediately stops the voice session and focuses the input.
- If microphone permission is denied or the connection fails, leave the Type
  Instead control available and keep the greeting visible rather than blocking
  the visitor.

## Verification

- Probe the replacement MP4 duration and dimensions.
- Run the production build.
- Run the focused door-entry E2E suite, including automatic voice activation
  and Type Instead fallback behavior.
- Restart the app workflow and inspect the first poster frame in preview.