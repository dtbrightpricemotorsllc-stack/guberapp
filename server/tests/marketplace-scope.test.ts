import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseStorage } from "../storage";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../db", () => ({
  db: mockDb,
}));

const listings = [
  {
    id: 1,
    title: "Independent seller listing",
    category: "Vehicles",
    status: "available",
    businessAccountId: null,
    price: 1200,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    id: 2,
    title: "Business storefront listing",
    category: "Vehicles",
    status: "available",
    businessAccountId: 404,
    price: 2400,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
  },
  {
    id: 3,
    title: "Another business storefront listing",
    category: "Vehicles",
    status: "available",
    businessAccountId: 505,
    price: 3600,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
  },
  {
    id: 4,
    title: "Unavailable listing",
    category: "Vehicles",
    status: "draft",
    businessAccountId: 404,
    price: 4800,
    createdAt: new Date("2026-08-04T00:00:00.000Z"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnValue({
    from: vi.fn().mockResolvedValue(listings),
  });
});

describe("Marketplace business scope", () => {
  it("keeps normal Marketplace global when no business account filter is provided", async () => {
    const storage = new DatabaseStorage();

    const result = await storage.getMarketplaceItems({ status: "available" });

    expect(result.map((listing) => listing.id).sort()).toEqual([1, 2, 3]);
    expect(result.some((listing) => listing.businessAccountId === 404)).toBe(true);
    expect(result.some((listing) => listing.businessAccountId === 505)).toBe(true);
    expect(result.some((listing) => listing.businessAccountId === null)).toBe(true);
  });

  it("applies a business filter only when the caller explicitly requests one", async () => {
    const storage = new DatabaseStorage();

    const result = await storage.getMarketplaceItems({
      status: "available",
      businessAccountId: 404,
    });

    expect(result.map((listing) => listing.id)).toEqual([2]);
  });
});