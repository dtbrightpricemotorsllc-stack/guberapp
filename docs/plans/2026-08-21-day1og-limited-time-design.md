# Day-1 OG limited-time campaign

## Goal

Offer Day-1 OG to any eligible member during one honest, limited-time campaign. The campaign ends on September 30, 2026 at 11:59 PM Eastern; Day-1 OG status and its stated benefits remain permanent for members who complete a qualifying purchase before that cutoff.

## Decisions

- Remove the 100-per-ZIP founder quota and any associated “spots remaining,” “founder class closed,” or founder-number claims.
- Keep ZIP lookup as a local community activation view only. It may report local member progress, but it must not determine Day-1 OG availability.
- Centralize the deadline in shared code and enforce it in the Stripe checkout endpoint. Checkout sessions expire no later than the campaign deadline.
- Show the exact deadline across the in-app Day-1 OG pages, homepage promotion, and public landing page.
- Route public landing-page calls to the authenticated, server-enforced Day-1 OG flow rather than a direct Stripe payment link.

## User experience

Before the deadline, eligible users see “Limited-time founding offer” with the exact end date. After the deadline, the server refuses new checkout sessions and purchase surfaces no longer offer an activation action. Existing Day-1 OG members remain recognized as OG members.

## Error handling

The checkout endpoint returns HTTP 410 with the campaign end date when the offer has ended or is too close to the deadline to issue a Stripe session that can safely expire on time. The client displays that response as a standard purchase error.

## Verification

Tests cover the shared deadline helper and the checkout guard. A targeted render/build check confirms that no ZIP-cap or “founder class closes” copy remains in Day-1 OG surfaces.