# JAC services filter handoff

## Goal

When JAC sends someone to Browse Providers, preserve the service category and
known urgency context alongside the existing free-text search term.

## Design

- JAC's browse-provider route may include `q`, `category`, and
  `availableNow=true`. The category must use one of the services page's
  supported labels: `On-Demand Help`, `General Labor`, `Skilled Labor`, or
  `Verify & Inspect`.
- `availableNow` is optional and should only be `true` when the conversation
  establishes an immediate/urgent need. Its absence or any other value leaves
  the page's availability filter off.
- The services page reads all three parameters once during initial mounting.
  It keeps the existing `q` behavior, applies only recognized categories, and
  turns on the existing available-now filter only for the exact true value.
- Existing direct links and manually selected filters remain unchanged.

## Validation

Add focused unit coverage for query hydration and route-policy guidance, then
run the relevant unit tests and the project's typecheck baseline.