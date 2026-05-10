// task-618: Confirm that the studioFeaturedClips schema carries a unique
// constraint on the slug column so that duplicate-slug protection in the
// POST handler is always backed by a real DB constraint, not just app logic.
//
// Strategy: import the Drizzle table definition and assert the column-level
// flag directly — no database connection required.

import { describe, it, expect } from "vitest";
import { studioFeaturedClips } from "../../shared/schema";

describe("studioFeaturedClips schema — slug unique constraint (task-618)", () => {
  it("slug column has isUnique = true", () => {
    expect(studioFeaturedClips.slug.isUnique).toBe(true);
  });

  it("slug column is notNull", () => {
    expect(studioFeaturedClips.slug.notNull).toBe(true);
  });

  it("slug column name maps to the 'slug' DB column", () => {
    expect(studioFeaturedClips.slug.name).toBe("slug");
  });
});
