import { describe, it, expect } from "vitest";
import {
  sanitizeJobForPublic,
  POSTER_ONLY_PRICE_FIELDS,
  POSTER_ONLY_INTERNAL_FIELDS,
} from "../sanitize-job";

const POSTER_ID = 100;
const HELPER_ID = 200;
const STRANGER_ID = 999;
const ADMIN_ID = 1;

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 42,
    postedById: POSTER_ID,
    assignedHelperId: HELPER_ID,
    status: "posted_public",
    isPaid: true,
    title: "Mow the lawn",
    budget: 80,
    helperPayout: 70,
    platformFee: 10,
    location: "123 Real St, Springfield",
    locationApprox: "Springfield, IL",
    lat: 39.7817,
    lng: -89.6501,
    zip: "62704",
    // Poster-only pricing intent
    autoIncreaseEnabled: true,
    autoIncreaseAmount: 5,
    autoIncreaseMax: 120,
    autoIncreaseIntervalMins: 30,
    nextIncreaseAt: new Date("2026-04-25T12:00:00Z"),
    boostSuggested: true,
    suggestedBudget: 95,
    // Internal/admin
    removedByAdminReason: "test",
    stuckAcknowledgedAt: new Date("2026-04-23T00:00:00Z"),
    stuckAcknowledgedBy: ADMIN_ID,
    stripePaymentIntentId: "pi_secret",
    stripeSessionId: "cs_secret",
    stripeChargeId: "ch_secret",
    stripeTransferId: "tr_secret",
    disputeNotes: "internal",
    cancelNotes: "internal",
    ...overrides,
  };
}

describe("sanitizeJobForPublic", () => {
  it("strangers cannot see poster-only price-intent fields", () => {
    const out = sanitizeJobForPublic(makeJob(), STRANGER_ID, false);
    for (const f of POSTER_ONLY_PRICE_FIELDS) {
      expect(out[f], `stranger leaked ${f}`).toBeUndefined();
    }
  });

  it("strangers cannot see internal/admin fields", () => {
    const out = sanitizeJobForPublic(makeJob(), STRANGER_ID, false);
    for (const f of POSTER_ONLY_INTERNAL_FIELDS) {
      expect(out[f], `stranger leaked internal ${f}`).toBeUndefined();
    }
  });

  it("strangers see approximate location and no helper payout or platform fee", () => {
    const job = makeJob();
    const out = sanitizeJobForPublic(job, STRANGER_ID, false);
    expect(out.location).toBe("Springfield, IL");
    expect(out.location).not.toBe(job.location);
    expect(out.helperPayout).toBeUndefined();
    expect(out.platformFee).toBeUndefined();
    expect(out.lat).not.toBe(job.lat);
    expect(out.lng).not.toBe(job.lng);
  });

  it("assigned helpers see real coords + payout but never the price ladder", () => {
    const out = sanitizeJobForPublic(
      makeJob({ status: "active" }),
      HELPER_ID,
      false,
    );
    for (const f of POSTER_ONLY_PRICE_FIELDS) {
      expect(out[f], `helper leaked ${f}`).toBeUndefined();
    }
    for (const f of POSTER_ONLY_INTERNAL_FIELDS) {
      expect(out[f], `helper leaked internal ${f}`).toBeUndefined();
    }
    // Locked statuses preserve real coords for the assigned worker.
    expect(out.lat).toBe(39.7817);
    expect(out.lng).toBe(-89.6501);
    expect(out.helperPayout).toBe(70);
    // Platform fee is still hidden from helpers.
    expect(out.platformFee).toBeUndefined();
  });

  it("posters see every poster-only field", () => {
    const out = sanitizeJobForPublic(makeJob(), POSTER_ID, false);
    expect(out.autoIncreaseEnabled).toBe(true);
    expect(out.autoIncreaseMax).toBe(120);
    expect(out.suggestedBudget).toBe(95);
    expect(out.disputeNotes).toBe("internal");
    expect(out.stripeSessionId).toBe("cs_secret");
    // Platform fee is stripped even from owners (it's an internal accounting field).
    expect(out.platformFee).toBeUndefined();
  });

  it("admins see the full unsanitized job even when not the owner", () => {
    const out = sanitizeJobForPublic(makeJob(), ADMIN_ID, true);
    expect(out.autoIncreaseEnabled).toBe(true);
    expect(out.autoIncreaseMax).toBe(120);
    expect(out.suggestedBudget).toBe(95);
    expect(out.removedByAdminReason).toBe("test");
    expect(out.stripeChargeId).toBe("ch_secret");
    // Admins also see the real, unfuzzed coordinates.
    expect(out.lat).toBe(39.7817);
    expect(out.lng).toBe(-89.6501);
  });

  it("masked coordinates are deterministic across repeated calls (no averaging attack)", () => {
    // Repeated sanitization of the same job for the same viewer must return
    // the IDENTICAL masked point, otherwise an attacker can poll and average
    // results to recover the true location.
    const job = makeJob();
    const a = sanitizeJobForPublic(job, STRANGER_ID, false);
    const b = sanitizeJobForPublic(job, STRANGER_ID, false);
    const c = sanitizeJobForPublic(job, STRANGER_ID, false);
    expect(b.lat).toBe(a.lat);
    expect(b.lng).toBe(a.lng);
    expect(c.lat).toBe(a.lat);
    expect(c.lng).toBe(a.lng);
    // And the mask actually moves the point off the true coords.
    expect(a.lat).not.toBe(job.lat);
    expect(a.lng).not.toBe(job.lng);
    // Different jobs produce different offsets (so the mask isn't a constant).
    const otherJob = makeJob({ id: 7777, lat: 39.7817, lng: -89.6501 });
    const d = sanitizeJobForPublic(otherJob, STRANGER_ID, false);
    expect(d.lat === a.lat && d.lng === a.lng).toBe(false);
  });

  it("a third-party stranger CANNOT obtain the poster's auto-increase config via the API shape", () => {
    // Simulates the My Jobs / job detail surface returning the same job to
    // someone who is neither owner nor assigned helper. This is the
    // regression guard for task #296: a stranger should never be able to
    // read the price ladder, regardless of how the route reached them.
    const job = makeJob({
      assignedHelperId: HELPER_ID, // some other user accepted it
      status: "active",
    });
    const out = sanitizeJobForPublic(job, STRANGER_ID, false);
    expect(out.autoIncreaseEnabled).toBeUndefined();
    expect(out.autoIncreaseAmount).toBeUndefined();
    expect(out.autoIncreaseMax).toBeUndefined();
    expect(out.nextIncreaseAt).toBeUndefined();
    expect(out.boostSuggested).toBeUndefined();
    expect(out.suggestedBudget).toBeUndefined();
    // And no internal Stripe / dispute fields either.
    expect(out.stripePaymentIntentId).toBeUndefined();
    expect(out.disputeNotes).toBeUndefined();
  });
});
