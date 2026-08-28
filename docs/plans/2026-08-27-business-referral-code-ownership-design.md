# Business referral code ownership

## Goal

Connect each supplied Team GUBER invitation code to a real GUBER user account without changing prior signup attribution when an administrator later reassigns the code.

## Data model

- Keep the invitation code and its seeded Team GUBER label stable.
- Store the current payout owner on the code row.
- Snapshot the payout owner and display label on each business referral attribution.
- Append every code-owner change to a dedicated history table with the previous owner, new owner, administrator, and timestamp.

## Reward behavior

- A signup using an unassigned code remains attributable to that code, but it cannot qualify as payable until an owner is assigned.
- If a code had an owner when the signup occurred, that owner remains attached to the attribution even if the code is reassigned before verification.
- Referral earnings may accrue for any existing GUBER user.
- Cash-out remains blocked until the attributed owner has completed GUBER identity verification and has an active Stripe Connect payout account.

## Admin experience

Provide a dedicated admin page that lists all supplied codes with:

- stable code label and invitation code
- current owner and payout-readiness status
- total signups and verified signups
- current owner’s available and paid referral cash
- a control to assign, reassign, or unassign the owner

Assignments use existing GUBER users only. The server derives the owner label from the selected user rather than accepting an arbitrary payout identity.

## Validation

Cover owner resolution, historical attribution, unassigned reward blocking, payout eligibility, report output, and owner-change auditing with automated tests. Run the project’s strict type-check baseline, focused unit tests, build, workflow restart, logs, and a visual preview check.