import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import { registerServiceOfferRoutes } from "../service-offers";

const HIRER_ID = 41;
const PROVIDER_ID = 77;

const mockPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("../db", () => ({ pool: mockPool }));
vi.mock("../auth", () => ({
  filterContactInfo: (value: string) => ({ blocked: false, clean: value }),
}));

const providerOffer = {
  id: 12,
  provider_user_id: PROVIDER_ID,
  title: "Furniture assembly",
  category: "General Labor",
  service_type: "Assembly",
  status: "published",
  moderation_status: "approved",
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: HIRER_ID };
    next();
  });
  const pass = (_req: any, _res: any, next: any) => next();
  registerServiceOfferRoutes(app, { requireAuth: pass, requireAdmin: pass, checkSuspended: pass });
  return app;
}

describe("provider-specific service requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [providerOffer] });
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 901 }] }) // job
        .mockResolvedValueOnce({ rows: [{ id: 902 }] }) // direct offer
        .mockResolvedValueOnce(undefined), // COMMIT
      release: vi.fn(),
    };
    mockPool.connect.mockResolvedValue(client);
  });

  it("creates a private job and direct offer bound to the selected provider", async () => {
    const response = await supertest(buildApp())
      .post("/api/service-offers/12/hire")
      .send({
        scope: "Assemble a six-drawer dresser in the living room.",
        timing: "Saturday afternoon",
        budget: 125,
        location: "123 Exact Street, Springfield",
        zip: "62704",
        estimatedMinutes: 120,
      })
      .expect(201);

    expect(response.body).toEqual({
      jobId: 901,
      directOfferId: 902,
      jobUrl: "/jobs/901",
    });

    const client = await mockPool.connect.mock.results[0].value;
    const jobInsert = client.query.mock.calls.find(([statement]: [string]) => statement.includes("INSERT INTO jobs"));
    const offerInsert = client.query.mock.calls.find(([statement]: [string]) => statement.includes("INSERT INTO direct_offers"));

    expect(jobInsert?.[1]).toEqual(expect.arrayContaining([
      "Furniture assembly",
      "Assemble a six-drawer dresser in the living room.",
      "General Labor",
      125,
      "123 Exact Street, Springfield",
      "Near 627••",
      HIRER_ID,
      PROVIDER_ID,
    ]));
    expect(jobInsert?.[0]).toContain("visibility");
    expect(jobInsert?.[0]).toContain("'private'");
    expect(offerInsert?.[1]).toEqual(expect.arrayContaining([
      901,
      12,
      HIRER_ID,
      PROVIDER_ID,
      125,
      "General Labor",
    ]));
  });

  it("rejects an attempt to request the hirer's own published service", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ ...providerOffer, provider_user_id: HIRER_ID }] });

    const response = await supertest(buildApp())
      .post("/api/service-offers/12/hire")
      .send({
        scope: "A real scope",
        timing: "Tomorrow",
        budget: 25,
        location: "123 Exact Street",
        zip: "62704",
      })
      .expect(400);

    expect(response.body.message).toMatch(/cannot hire your own/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});