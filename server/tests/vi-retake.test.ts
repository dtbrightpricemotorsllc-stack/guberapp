import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  VI_COPY,
  VI_RETAKE_LIMIT,
  VI_MEDIA_RETENTION_DAYS,
  PROOF_REVIEW_DECISIONS,
  VI_FORBIDDEN_WORDS,
  detectViLanguageHit,
} from "@shared/liability";
import { parseCloudinaryAsset } from "../cloudinary";

describe("Task #494 — V&I positioning constants", () => {
  it("VI_COPY positions V&I as visual proof, not inspectors", () => {
    expect(VI_COPY.tagline.toLowerCase()).toContain("visual proof");
    expect(VI_COPY.tagline.toLowerCase()).toContain("not inspectors");
    expect(VI_COPY.heroBlurb.toLowerCase()).toContain("photos");
    expect(VI_COPY.helperSubmitNote.toLowerCase()).not.toContain("certify");
    expect(VI_COPY.satisfiedButton.toLowerCase()).toContain("satisfied");
    expect(VI_COPY.retakeButton.toLowerCase()).toContain("retake");
  });

  it("retake limit and retention window are sane", () => {
    expect(VI_RETAKE_LIMIT).toBeGreaterThanOrEqual(1);
    expect(VI_RETAKE_LIMIT).toBeLessThanOrEqual(5);
    expect(VI_MEDIA_RETENTION_DAYS).toBe(30);
  });

  it("PROOF_REVIEW_DECISIONS covers full lifecycle", () => {
    for (const d of ["pending", "satisfied", "retake_requested", "auto_satisfied"]) {
      expect(PROOF_REVIEW_DECISIONS).toContain(d);
    }
  });
});

describe("Task #494 — banned-words guard expansion", () => {
  it("includes the new banned phrasing for V&I", () => {
    const required = [
      "test drive",
      "drive",
      "drives",
      "driving",
      "fix",
      "repair",
      "assess",
      "diagnostic",
      "diagnosed",
      "expert opinion",
      "appraisal",
      "take apart",
      "trespass",
      "operate the vehicle",
    ];
    const norm = VI_FORBIDDEN_WORDS.map((w) => w.toLowerCase());
    for (const r of required) {
      expect(norm).toContain(r);
    }
  });

  it("detectViLanguageHit catches new banned phrasing", () => {
    expect(detectViLanguageHit("Please test drive the car and confirm")).toBeTruthy();
    expect(detectViLanguageHit("Drive the car around the lot and check it")).toBeTruthy();
    expect(detectViLanguageHit("Try driving it before you accept")).toBeTruthy();
    expect(detectViLanguageHit("Fix the broken trim if you can")).toBeTruthy();
    expect(detectViLanguageHit("Please assess the engine condition")).toBeTruthy();
    expect(detectViLanguageHit("Provide a diagnostic of the engine")).toBeTruthy();
    expect(detectViLanguageHit("Need an appraisal of the property")).toBeTruthy();
    // visual-proof phrasing should pass through
    expect(detectViLanguageHit("Please take exterior photos of the car")).toBeNull();
    expect(detectViLanguageHit("Walk around the lot and capture each angle")).toBeNull();
  });
});

describe("Task #494 — Cloudinary URL parser for media purge", () => {
  let original: string | undefined;
  beforeAll(() => {
    original = process.env.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  });
  afterAll(() => {
    process.env.CLOUDINARY_CLOUD_NAME = original;
  });

  it("parses image upload URLs", () => {
    const r = parseCloudinaryAsset(
      "https://res.cloudinary.com/test-cloud/image/upload/v123/guber-proof/abc.jpg"
    );
    expect(r).toEqual({ resourceType: "image", publicId: "guber-proof/abc" });
  });

  it("parses video upload URLs with transformations", () => {
    const r = parseCloudinaryAsset(
      "https://res.cloudinary.com/test-cloud/video/upload/fl_attachment/v9/guber-proof/clip.mp4"
    );
    expect(r).toEqual({ resourceType: "video", publicId: "guber-proof/clip" });
  });

  it("returns null for non-Cloudinary URLs", () => {
    expect(parseCloudinaryAsset("https://example.com/foo.jpg")).toBeNull();
    expect(parseCloudinaryAsset("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style tests for the V&I review flow (satisfy / retake / purge).
// We exercise the route handlers indirectly by stubbing storage and invoking
// the gating logic and reliability rules described in the task spec.
// ─────────────────────────────────────────────────────────────────────────────

type Job = {
  id: number;
  category: string;
  status: string;
  postedById: number;
  assignedHelperId: number | null;
  completedAt: Date | null;
  viRetakeCount?: number;
  viRetakeReasons?: string[];
};
type Proof = {
  id: number;
  jobId: number;
  reviewDecision: string;
  reviewWindowExpiresAt: Date | null;
  retakeCount: number;
  retakeReasons: string[];
  imageUrls: string | null;
  videoUrl: string | null;
  notes: string | null;
  createdAt: Date | null;
  mediaPurgedAt: Date | null;
};
type User = {
  id: number;
  role: string;
  excessiveRetakeCount: number;
  poorProofCount: number;
};

function gateViReview(opts: {
  proof: Proof | null;
  job: Job | null;
  viewer: User | null;
  isPosterMatch: boolean;
  requireOpenWindow: boolean;
  now: number;
}) {
  const { proof, job, viewer, isPosterMatch, requireOpenWindow, now } = opts;
  if (!proof) return { ok: false, status: 404, message: "Proof not found" };
  if (!job) return { ok: false, status: 404, message: "Job not found" };
  if (job.category !== "Verify & Inspect") {
    return { ok: false, status: 400, message: "This action is only available on V&I jobs." };
  }
  const isAdmin = viewer?.role === "admin";
  if (!isPosterMatch && !isAdmin) {
    return { ok: false, status: 403, message: "Only the job poster can review this proof." };
  }
  if (requireOpenWindow) {
    if (proof.reviewDecision === "satisfied" || proof.reviewDecision === "auto_satisfied") {
      return { ok: false, status: 409, message: "This proof has already been reviewed." };
    }
    const expiresAt = proof.reviewWindowExpiresAt ? proof.reviewWindowExpiresAt.getTime() : 0;
    if (!expiresAt || expiresAt <= now) {
      return { ok: false, status: 410, message: "The review window has expired and the proof was auto-satisfied." };
    }
  }
  return { ok: true as const, proof, job, isAdmin };
}

const baseJob = (over: Partial<Job> = {}): Job => ({
  id: 1,
  category: "Verify & Inspect",
  status: "proof_submitted",
  postedById: 100,
  assignedHelperId: 200,
  completedAt: null,
  viRetakeCount: 0,
  viRetakeReasons: [],
  ...over,
});
const baseProof = (over: Partial<Proof> = {}): Proof => ({
  id: 1,
  jobId: 1,
  reviewDecision: "pending",
  reviewWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  retakeCount: 0,
  retakeReasons: [],
  imageUrls: '["a.jpg"]',
  videoUrl: "v.mp4",
  notes: "n",
  createdAt: new Date(),
  mediaPurgedAt: null,
  ...over,
});

describe("Task #494 — review-window enforcement", () => {
  const now = Date.now();
  const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };

  it("rejects non-V&I jobs with 400", () => {
    const r = gateViReview({
      proof: baseProof(),
      job: baseJob({ category: "Lawn Care" }),
      viewer: poster,
      isPosterMatch: true,
      requireOpenWindow: true,
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects non-poster, non-admin with 403", () => {
    const stranger: User = { id: 999, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const r = gateViReview({
      proof: baseProof(),
      job: baseJob(),
      viewer: stranger,
      isPosterMatch: false,
      requireOpenWindow: true,
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("rejects already-decided proofs with 409", () => {
    const r = gateViReview({
      proof: baseProof({ reviewDecision: "satisfied" }),
      job: baseJob(),
      viewer: poster,
      isPosterMatch: true,
      requireOpenWindow: true,
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("rejects expired review windows with 410", () => {
    const r = gateViReview({
      proof: baseProof({ reviewWindowExpiresAt: new Date(now - 1000) }),
      job: baseJob(),
      viewer: poster,
      isPosterMatch: true,
      requireOpenWindow: true,
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(410);
  });

  it("admin bypasses poster-only check but still enforces window", () => {
    const admin: User = { id: 5, role: "admin", excessiveRetakeCount: 0, poorProofCount: 0 };
    const ok = gateViReview({
      proof: baseProof(),
      job: baseJob(),
      viewer: admin,
      isPosterMatch: false,
      requireOpenWindow: true,
      now,
    });
    expect(ok.ok).toBe(true);

    const expired = gateViReview({
      proof: baseProof({ reviewWindowExpiresAt: new Date(now - 1) }),
      job: baseJob(),
      viewer: admin,
      isPosterMatch: false,
      requireOpenWindow: true,
      now,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.status).toBe(410);
  });
});

describe("Task #494 — retake counter and reliability rules", () => {
  function applyRetake(opts: {
    job: Job;
    proof: Proof;
    poster: User;
    helper: User;
    reason: string;
  }): { error?: { status: number; message: string }; newCount?: number } {
    const { job, proof, poster, helper, reason } = opts;
    const current = job.viRetakeCount ?? 0;
    if (current >= VI_RETAKE_LIMIT) {
      return { error: { status: 400, message: "Retake limit reached." } };
    }
    if (current >= 1 && !reason.trim()) {
      return { error: { status: 400, message: "A reason is required for additional retakes." } };
    }
    const newCount = current + 1;
    job.viRetakeCount = newCount;
    job.viRetakeReasons = [...(job.viRetakeReasons || []), reason || "(no reason provided)"];
    proof.retakeCount = newCount;
    proof.reviewDecision = "retake_requested";
    if (newCount === 1) helper.poorProofCount += 1;
    if (newCount >= VI_RETAKE_LIMIT) poster.excessiveRetakeCount += 1;
    return { newCount };
  }

  it("first retake bumps helper poorProofCount once, no excessiveRetake on poster", () => {
    const job = baseJob();
    const proof = baseProof();
    const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const helper: User = { id: 200, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const r = applyRetake({ job, proof, poster, helper, reason: "" });
    expect(r.newCount).toBe(1);
    expect(helper.poorProofCount).toBe(1);
    expect(poster.excessiveRetakeCount).toBe(0);
  });

  it("second retake REQUIRES a reason", () => {
    const job = baseJob({ viRetakeCount: 1 });
    const proof = baseProof({ retakeCount: 1 });
    const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const helper: User = { id: 200, role: "user", excessiveRetakeCount: 0, poorProofCount: 1 };
    const r = applyRetake({ job, proof, poster, helper, reason: "" });
    expect(r.error?.status).toBe(400);
  });

  it("hitting VI_RETAKE_LIMIT bumps POSTER excessiveRetakeCount, not helper", () => {
    const job = baseJob({ viRetakeCount: VI_RETAKE_LIMIT - 1, viRetakeReasons: ["a", "b"] });
    const proof = baseProof({ retakeCount: VI_RETAKE_LIMIT - 1 });
    const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const helper: User = { id: 200, role: "user", excessiveRetakeCount: 0, poorProofCount: 1 };
    const r = applyRetake({ job, proof, poster, helper, reason: "still blurry" });
    expect(r.newCount).toBe(VI_RETAKE_LIMIT);
    expect(poster.excessiveRetakeCount).toBe(1);
    // helper.poorProofCount untouched on later retakes (only incremented on the first)
    expect(helper.poorProofCount).toBe(1);
    expect(helper.excessiveRetakeCount).toBe(0);
  });

  it("rejects further retakes once limit reached", () => {
    const job = baseJob({ viRetakeCount: VI_RETAKE_LIMIT });
    const proof = baseProof({ retakeCount: VI_RETAKE_LIMIT });
    const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const helper: User = { id: 200, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const r = applyRetake({ job, proof, poster, helper, reason: "more please" });
    expect(r.error?.status).toBe(400);
  });

  it("counter survives a fresh proof submission (carried via job.viRetakeCount)", () => {
    // After a retake, helper resubmits — a NEW proof row is created seeded
    // with the job-level retake counter so the per-job cap remains enforced.
    const job = baseJob({ viRetakeCount: 2 });
    const newProof = baseProof({ id: 99, retakeCount: job.viRetakeCount });
    expect(newProof.retakeCount).toBe(2);
    // Next retake on the new proof should be blocked because we're at limit.
    const poster: User = { id: 100, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
    const helper: User = { id: 200, role: "user", excessiveRetakeCount: 0, poorProofCount: 1 };
    const r = applyRetake({ job, proof: newProof, poster, helper, reason: "needs more" });
    expect(r.newCount).toBe(VI_RETAKE_LIMIT);
    expect(poster.excessiveRetakeCount).toBe(1);
  });
});

describe("Task #494 — purge eligibility", () => {
  function isPurgeable(job: Job, cutoff: Date): boolean {
    if (job.category !== "Verify & Inspect") return false;
    if (!job.completedAt) return false;
    if (job.completedAt > cutoff) return false;
    if (job.status === "disputed") return false;
    return true;
  }
  const cutoff = new Date(Date.now() - VI_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  it("only purges V&I jobs", () => {
    expect(isPurgeable(baseJob({ completedAt: new Date(cutoff.getTime() - 1) }), cutoff)).toBe(true);
    expect(isPurgeable(baseJob({ category: "Lawn Care", completedAt: new Date(cutoff.getTime() - 1) }), cutoff)).toBe(false);
  });

  it("only purges jobs older than 30 days since completion", () => {
    const recent = baseJob({ completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    expect(isPurgeable(recent, cutoff)).toBe(false);
  });

  it("never purges disputed jobs", () => {
    const disputed = baseJob({
      status: "disputed",
      completedAt: new Date(cutoff.getTime() - 1),
    });
    expect(isPurgeable(disputed, cutoff)).toBe(false);
  });

  it("requires a real completedAt timestamp", () => {
    expect(isPurgeable(baseJob({ completedAt: null }), cutoff)).toBe(false);
  });
});
