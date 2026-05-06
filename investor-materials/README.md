# GUBER — Investor Materials

This folder contains everything needed to pitch GUBER to an investor or profit-share partner.

## What's in here

| File | What it is | When to use it |
|---|---|---|
| `investor-deck.html` | Full 14-slide pitch deck (title, problem, solution, product, business model, multi-sided marketplace, infrastructure & traction, cost story, market, competition, growth, roadmap, appendix of shipped surfaces, the ask). Dark-themed, branded, keyboard-navigable, has a Download PDF button, prints cleanly. | In-person meetings, screen-shares, Zoom calls. |
| `executive-summary.html` | One-page summary, prints to a single Letter/A4 page. | Cold outreach attachments, leave-behinds, "send me a one-pager" requests. |
| `monetization-matrix.md` | Source-of-truth table of every revenue stream with exact code references. | Answering "how exactly do you make money?" and prepping for due diligence. |
| `README.md` | This file. | You are here. |

## How to use the deck

### Present it live
1. Open `investor-deck.html` in any browser (Chrome works best). In Replit, click the file in the file pane and choose "Open in new tab", or just double-click locally.
2. Use **→ / Space** to advance, **←** to go back, **F** for fullscreen.
3. The progress bar at the top and slide counter at the bottom show where you are.

### Save as PDF
1. Open `investor-deck.html` in Chrome.
2. **File → Print** (or Cmd/Ctrl+P).
3. Destination: **Save as PDF**.
4. Layout: **Landscape**.
5. Margins: **None**.
6. Background graphics: **On** (very important — that's what makes the dark theme print).
7. Save.

Same recipe for the one-pager (`executive-summary.html`), but use **Portrait** layout.

## How to edit the content

You don't need to be a developer. Both HTML files are commented at the top with quick instructions. The slides live inside `<section class="slide">…</section>` blocks. Just open the file in any text editor (or directly in Replit's file editor), find the words you want to change, and change them.

**Things you'll definitely want to fill in before any meeting:**
- Your real traction numbers (look for `[ ___ ]` placeholders in the deck and one-pager).
- Your contact info on the final "Ask" slide and at the bottom of the one-pager.
- Your raise amount and use-of-funds breakdown on the "Ask" slide.
- The market sizing numbers — verify against the latest reports before quoting them, the figures included are conservative ranges.

**Things that are already accurate (taken straight from the codebase):**
- All revenue stream prices and percentages.
- The "what's shipped" infrastructure list.
- The cost-cut story (~$50/day → ~$0/day idle).
- The competitive comparison table.

## Keeping this in sync with the product

If you change a fee in `server/pricing.ts` or add a new monetization stream, update `monetization-matrix.md` to match — that's the file that has exact code references and is the easiest to keep accurate. Then carry the change into the deck and one-pager.

## Files NOT to share publicly

This folder is intentionally outside `client/public/` so it's **not served by the live website**. Don't copy these files into a public folder unless you're okay with the world reading them. Share by attaching the PDF (printed from the HTML) or by sharing the HTML file directly with named recipients.
