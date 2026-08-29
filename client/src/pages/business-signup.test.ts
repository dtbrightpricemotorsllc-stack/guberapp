import { describe, expect, it } from "vitest";
import { normalizeOptionalWebsite } from "./business-signup";

describe("normalizeOptionalWebsite", () => {
  it("keeps the optional website field optional", () => {
    expect(normalizeOptionalWebsite("")).toBe("");
    expect(normalizeOptionalWebsite("   ")).toBe("");
  });

  it("accepts common website formats and adds https when needed", () => {
    expect(normalizeOptionalWebsite("www.guberapp.com")).toBe("https://www.guberapp.com/");
    expect(normalizeOptionalWebsite("guberapp.com")).toBe("https://guberapp.com/");
    expect(normalizeOptionalWebsite("https://guberapp.com/about")).toBe("https://guberapp.com/about");
  });

  it("rejects text that is not a website", () => {
    expect(normalizeOptionalWebsite("not a website")).toBeNull();
  });
});