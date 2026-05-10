// task-626: Verify that createStudioFeaturedClip catches the Postgres 23505
// unique-violation error that surfaces in the TOCTOU race window (two simultaneous
// POSTs both pass the SELECT guard, then one INSERT wins and the second hits the
// DB unique constraint) and re-throws it as the typed DuplicateSlugError so the
// route handler can return 409 without any string-parsing.
//
// Strategy: mock ../db so that db.select returns no rows (simulating the race
// window — the SELECT check finds nothing) and db.insert throws a raw Postgres
// 23505 error.  Then call the real DatabaseStorage.createStudioFeaturedClip and
// assert DuplicateSlugError is thrown.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DuplicateSlugError } from "../errors";

// ── Postgres unique-violation stub ───────────────────────────────────────────

class PgUniqueViolation extends Error {
  code = "23505";
  detail = "Key (slug)=(race-slug) already exists.";
  constraint = "studio_featured_clips_slug_unique";
  constructor() {
    super("duplicate key value violates unique constraint");
    this.name = "DatabaseError";
  }
}

// ── Drizzle db mock ──────────────────────────────────────────────────────────
// We need to intercept the fluent builder chains used inside the method:
//   SELECT: db.select({...}).from(...).where(...).limit(1)  → []
//   INSERT: db.insert(...).values(...).returning()           → throws PgUniqueViolation

const mockLimit = vi.fn();
const mockReturning = vi.fn();

vi.mock("../db", () => {
  const selectChain = {
    from: () => ({
      where: () => ({ limit: mockLimit }),
    }),
  };
  const insertChain = {
    values: () => ({ returning: mockReturning }),
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => insertChain,
    },
  };
});

// ── Import real storage AFTER the mock is registered ─────────────────────────

import { DatabaseStorage } from "../storage";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createStudioFeaturedClip — race-condition 23505 → DuplicateSlugError (task-626)", () => {
  const storage = new DatabaseStorage();

  const VALID_CLIP = {
    slug: "race-slug",
    label: "Race Test",
    caption: "Inserted in a race",
    videoUrl: "https://example.com/v.mp4",
    position: 1,
    active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws DuplicateSlugError when the INSERT hits a 23505 constraint violation", async () => {
    // SELECT finds nothing — simulates the TOCTOU window
    mockLimit.mockResolvedValueOnce([]);
    // INSERT fails with a raw Postgres 23505 (another request won the race)
    mockReturning.mockRejectedValueOnce(new PgUniqueViolation());

    await expect(storage.createStudioFeaturedClip(VALID_CLIP)).rejects.toThrow(
      DuplicateSlugError,
    );
  });

  it("error message from DuplicateSlugError contains the slug", async () => {
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockRejectedValueOnce(new PgUniqueViolation());

    try {
      await storage.createStudioFeaturedClip(VALID_CLIP);
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(DuplicateSlugError);
      expect((e as DuplicateSlugError).message).toContain(VALID_CLIP.slug);
    }
  });

  it("re-throws non-23505 DB errors unchanged so callers see the real failure", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const connErr = Object.assign(new Error("connection refused"), { code: "08006" });
    mockReturning.mockRejectedValueOnce(connErr);

    await expect(storage.createStudioFeaturedClip(VALID_CLIP)).rejects.toThrow(
      "connection refused",
    );
  });

  it("does not throw when INSERT succeeds (happy path passes through correctly)", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const row = { id: 42, ...VALID_CLIP, posterUrl: null };
    mockReturning.mockResolvedValueOnce([row]);

    const result = await storage.createStudioFeaturedClip(VALID_CLIP);
    expect(result).toMatchObject({ id: 42, slug: VALID_CLIP.slug });
  });
});
