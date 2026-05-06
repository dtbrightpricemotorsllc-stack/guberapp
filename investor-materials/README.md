# GUBER — Investor Materials

This folder contains everything needed to pitch GUBER to an investor or profit-share partner.

## What's in here

| File | What it is | When to use it |
|---|---|---|
| `investor-deck.html` | Full 14-slide pitch deck (title, problem, solution, product, business model, multi-sided marketplace, infrastructure & traction, cost story, market, competition, growth, roadmap, appendix of shipped surfaces, the ask). Dark-themed, branded, keyboard-navigable, has a Download PDF button, prints cleanly. | In-person meetings, screen-shares, Zoom calls. |
| `executive-summary.html` | One-page summary, prints to a single Letter/A4 page. | Cold outreach attachments, leave-behinds, "send me a one-pager" requests. |
| `GUBER-Investor-Deck.pdf` | Pre-rendered landscape PDF of the deck. **Regenerate after editing the HTML** (see below). | Email attachment for cold outreach. |
| `GUBER-Executive-Summary.pdf` | Pre-rendered portrait one-pager. **Regenerate after editing the HTML** (see below). | Email attachment for cold outreach. |
| `build-pdfs.sh` | One-command regenerator for both PDFs (uses headless Chromium). | Run after editing either HTML file. |
| `monetization-matrix.md` | Source-of-truth table of every revenue stream with exact code references. | Answering "how exactly do you make money?" and prepping for due diligence. |
| `README.md` | This file. | You are here. |

## How to use the deck

### Present it live
1. Open `investor-deck.html` in any browser (Chrome works best). In Replit, click the file in the file pane and choose "Open in new tab", or just double-click locally.
2. Use **→ / Space** to advance, **←** to go back, **F** for fullscreen.
3. The progress bar at the top and slide counter at the bottom show where you are.

### Save as PDF (the easy way)

Just run the helper script — it regenerates both PDFs in one shot using headless Chromium:

```bash
./investor-materials/build-pdfs.sh
```

It writes `GUBER-Investor-Deck.pdf` (landscape, 14 pages) and `GUBER-Executive-Summary.pdf` (portrait, single page) into this folder. **Run it any time you edit either HTML file** so the attached PDFs stay in sync with the source.

### Save as PDF (manual fallback, if the script can't run)
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
- Your contact info on the final "Ask" slide and at the bottom of the one-pager.
- Your raise amount and use-of-funds breakdown on the "Ask" slide (look for the remaining `$[___]` placeholder).
- The market sizing numbers — verify against the latest reports before quoting them, the figures included are conservative ranges.

## Traction numbers (last refreshed May 6, 2026)

The traction numbers in slide 7 of `investor-deck.html` and the Traction section of `executive-summary.html` are pulled directly from the production database, not self-reported. Snapshot at last refresh:

| Metric | Value | Notes |
|---|---|---|
| Total registered users | 294 | `SELECT COUNT(*) FROM users` |
| Verified helpers | 22 | `users.id_verified = true` |
| Real jobs posted (lifetime) | 15 | excludes 2,445 demo/seed jobs flagged with `jobs.is_demo = true` |
| Real paid jobs | 14 | `is_paid=true AND is_demo=false` |
| GMV (helper-side) | $1,172 | `SUM(budget)` on real paid jobs (`final_price` is sparsely populated for early real jobs, so `budget` is the closer proxy; lifetime `SUM(final_price)` across all paid jobs incl. demo is $240) |
| Helper payouts | $986.50 | `SUM(helper_payout)` on real paid jobs |
| Platform-fee revenue | $180.94 | `SUM(platform_fee)` on real paid jobs ($228.94 incl. demo) |
| Active business accounts | 1 | `business_accounts` rows not in `(rejected, deleted)` |
| Lifetime Cash Drops created | 27 | `SELECT COUNT(*) FROM cash_drops` |
| Lifetime observations submitted | 0 | `SELECT COUNT(*) FROM observations` |
| Distinct ZIPs with a real job | 8 | `COUNT(DISTINCT zip)` on `is_demo=false` jobs (207 incl. demo) |

### How to refresh these numbers

Run the following read-only query against the production database (the agent's database skill supports this with `environment: "production"`; outside the agent, query the production read-replica directly):

```sql
SELECT
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM users WHERE id_verified = true) AS verified_helpers,
  (SELECT COUNT(*) FROM jobs WHERE COALESCE(is_demo,false) = false) AS jobs_posted_real,
  (SELECT COUNT(*) FROM jobs WHERE is_paid = true AND COALESCE(is_demo,false) = false) AS jobs_paid_real,
  (SELECT COALESCE(SUM(final_price),0) FROM jobs WHERE is_paid = true) AS gmv_finalprice_all,
  (SELECT COALESCE(SUM(budget),0) FROM jobs WHERE is_paid = true AND COALESCE(is_demo,false) = false) AS gmv_budget_real,
  (SELECT COALESCE(SUM(helper_payout),0) FROM jobs WHERE is_paid = true AND COALESCE(is_demo,false) = false) AS helper_payouts_real,
  (SELECT COALESCE(SUM(platform_fee),0) FROM jobs WHERE is_paid = true AND COALESCE(is_demo,false) = false) AS platform_fee_real,
  (SELECT COUNT(*) FROM business_accounts WHERE status NOT IN ('rejected','deleted')) AS active_business_accounts,
  (SELECT COUNT(*) FROM cash_drops) AS lifetime_cash_drops,
  (SELECT COUNT(*) FROM observations) AS lifetime_observations,
  (SELECT COUNT(DISTINCT zip) FROM jobs WHERE zip IS NOT NULL AND zip <> '' AND COALESCE(is_demo,false) = false) AS distinct_zips_real;
```

After running, update the four cards on slide 7 of `investor-deck.html`, the five list items in the Traction section of `executive-summary.html`, and the table above (and the "last refreshed" date in all three places).

**Things that are already accurate (taken straight from the codebase):**
- All revenue stream prices and percentages.
- The "what's shipped" infrastructure list.
- The cost-cut story (~$50/day → ~$0/day idle).
- The competitive comparison table.

## Keeping this in sync with the product

If you change a fee in `server/pricing.ts` or add a new monetization stream, update `monetization-matrix.md` to match — that's the file that has exact code references and is the easiest to keep accurate. Then carry the change into the deck and one-pager.

## Files NOT to share publicly

This folder is intentionally outside `client/public/` so it's **not served by the live website**. Don't copy these files into a public folder unless you're okay with the world reading them. Share by attaching the PDF (printed from the HTML) or by sharing the HTML file directly with named recipients.
