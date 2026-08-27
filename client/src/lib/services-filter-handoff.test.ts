import { describe, expect, it } from "vitest";
import { parseServiceBrowseFilters } from "./services-filter-handoff";

describe("service browse filter handoff", () => {
  it("hydrates search, category, and urgency from a JAC route", () => {
    expect(parseServiceBrowseFilters(
      "q=plumber&category=Skilled%20Labor&availableNow=true",
    )).toEqual({
      search: "plumber",
      category: "Skilled Labor",
      availableOnly: true,
    });
  });

  it("keeps availability off unless availableNow is exactly true", () => {
    expect(parseServiceBrowseFilters("q=cleaning&availableNow=false").availableOnly).toBe(false);
    expect(parseServiceBrowseFilters("q=cleaning&availableNow=1").availableOnly).toBe(false);
    expect(parseServiceBrowseFilters("q=cleaning").availableOnly).toBe(false);
  });

  it("ignores an unknown category without dropping the search term", () => {
    expect(parseServiceBrowseFilters(
      "q=handyman&category=Unknown&availableNow=true",
    )).toEqual({
      search: "handyman",
      category: null,
      availableOnly: true,
    });
  });
});