# Provider-specific service requests

## Goal

Let a hirer request a published service from its selected provider while retaining the existing protected direct-offer and job lifecycle.

## Flow

1. The service browser gathers scope, requested timing, budget, and job location.
2. The server validates the published service and creates a private job plus a direct offer in one database transaction.
3. The direct offer is bound to the selected provider and source service offer. It remains the negotiation and payment authority.
4. The provider accepts, declines, or counters through the existing direct-offer lifecycle. Acceptance moves the linked job to pending payment; funding activates its normal protected work state.
5. The provider sees only an approximate service area until the direct offer is funded. The existing job/direct-offer payment, proof, dispute, and payout machinery remains authoritative.

## Safety constraints

- Service scopes and location text are contact-filtered before persistence.
- The request is private and assigned only to the selected provider.
- No new checkout, message, proof, dispute, or payout implementation is introduced.