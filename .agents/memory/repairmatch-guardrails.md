---
name: RepairMatch guardrails
description: Durable product, privacy, and AI constraints for GUBER RepairMatch.
---

RepairMatch is a dedicated GUBER module, not a generic business-request subtype. Keep the original AI findings immutable and store shop-reviewed edits as a separately attributed copy.

**Why:** Customers and shops need clear provenance, and later shop review must not make preliminary AI output look like an official or final estimate.

**How to apply:** Describe every AI result as preliminary and subject to physical inspection, teardown, current parts pricing, OEM procedures, and shop approval. Never label it a CCC ONE estimate or final repair authorization.

Customer contact stays hidden until the customer accepts a responding shop. Sharing photos, incident details, approximate location, and the preliminary assessment requires explicit customer approval.

**Why:** RepairMatch coordinates introductions without exposing private contact information to shops that the customer has not chosen.

**How to apply:** New shop-facing fields and endpoints must preserve the pre-acceptance mask and release contact only to the accepted shop.

Single-shop review is the default. Optional nearby distribution is capped at five eligible participating shops and comparisons must emphasize fit, availability, timing, warranty, towing, parts approach, capabilities, and communication—not lowest price.

**Why:** RepairMatch is a service-fit marketplace, not a reverse auction.

**How to apply:** Do not add price sorting, bidding language, cheapest badges, or hard-coded preferred shops. Any legitimate shop, including test participants, enrolls through the same profile and eligibility rules.