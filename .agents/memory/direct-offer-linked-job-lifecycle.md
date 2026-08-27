---
name: Direct-offer linked job lifecycle
description: Rules for keeping provider-specific service-request jobs synchronized with the protected direct-offer lifecycle.
---

Provider-specific service requests must treat the direct offer as the payment and lifecycle authority while mirroring every state transition onto its linked job. This includes normal negotiation, funding, work/proof/completion, cancellation, disputes, expiry, and dispute resolution.

Acceptance must re-read the provider's current identity, liability acknowledgement, and (for Skilled / Pro) tier, credential, and background eligibility. Never trust verification fields captured when the public service offer was published; return an actionable provider error and notify the hirer when a gate blocks acceptance.

**Why:** A job can otherwise remain pending, disputed, or unpaid after its linked direct offer reaches a terminal state. Stripe Checkout completion can also race the offer-expiry sweep: an already-completed payment must never be discarded because a local row was marked expired.

**How to apply:** When adding or changing a direct-offer transition, update the linked-job synchronizer in the same change. Before provider acceptance, load current user verification and the linked service catalog requirements. Expiry must safely close an open Checkout session before cancelling; completed Checkout sessions should stay eligible for verified webhook/client reconciliation. Refund outcomes cancel the linked job and clear authorization, while payout/split outcomes finish it as paid.