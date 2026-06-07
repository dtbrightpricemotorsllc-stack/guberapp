---
name: GUBER commercial / promo video builds
description: How to assemble the Load Board / Asset Protection TV-style commercial from AI clips + the real app UI
---

# GUBER commercial video (9:16 TV-style, ~30s)

Build script pattern: `scripts/build-guber-commercial-v4.sh` — concats real AI motion clips
(generateVideoAsync, 1080x1920, 8s max each) and muxes the pre-made VO + music in
`attached_assets/generated_audio/` (vo1@0, vo2@7s, vo3@14s, vo4@23.8s, music bed; total ~30s).

## Durable decisions
- **Showing "the actual app on the phone": use a dedicated phone-mockup INSERT, not a composite onto an AI phone.**
  **Why:** AI-video phones drift/tilt and there is no motion-tracking tool, so any overlay slides off and looks fake.
  **How:** crop the real app content column out of `attached_assets/_stills2/guber_screen.jpg`, round corners,
  drop it into an ImageMagick phone frame (bezel + notch) over a blurred clip frame, then ffmpeg `zoompan` slow push-in.
- **Cars:** prompt for "variety of luxury/exotic cars, different colors and brands"; negative-prompt `yellow Lamborghini`
  and `repeated identical cars` (user disliked many yellow Lambos). Also negative `text/logo/VIN sticker, deformed hands`.
- **Captions:** drawtext headline at fontsize 72 only fits ~16 chars across 1080px — longer headlines overflow and get
  cut off both edges. Keep headlines short (e.g. "FULLY DOCUMENTED", not "EVERY DETAIL DOCUMENTED").
- **No persistent wordmark overlay** — user explicitly dislikes a logo "stuck on screen". Logo appears only as the end card.
- ffmpeg in-place overwrite fails (exit 234); always write a temp file then mv. Build to a versioned output name.
