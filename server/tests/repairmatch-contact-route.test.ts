import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const mockPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("../db", () => ({ pool: mockPool }));

import { registerRepairMatchRoutes } from "../repairmatch";

type Opportunity = {
  id: number;
  estimate_id: number;
  shop_profile_id: number;
  status: string;
  sharing_scope: Record<string, unknown>;
  accepted_at?: Date | null;
};

const state = {
  nextEstimateId: 1,
  nextOpportunityId: 10,
  nextResponseId: 20,
  estimates: [] as any[],
  shops: [
    { id: 101, owner_user_id: 201, active: true, collision_body: true },
    { id: 102, owner_user_id: 202, active: true, collision_body: true },
  ],
  opportunities: [] as Opportunity[],
  lines: [] as any[],
  responses: [] as any[],
  reviewedLines: [] as any[],
};

function rows(rows: any[] = []) {
  return { rows };
}

async function query(sql: string, params: any[] = []) {
  const normalized = sql.replace(/\s+/g, " ").trim();

  if (normalized.startsWith("INSERT INTO repairmatch_estimates")) {
    const estimate = {
      id: state.nextEstimateId++,
      customer_id: params[0],
      status: "draft",
      vehicle: JSON.parse(params[1]),
      incident: JSON.parse(params[2]),
      photo_urls: JSON.parse(params[3]),
      location_approx: params[4],
      customer_contact: JSON.parse(params[5]),
      generation_status: "not_requested",
    };
    state.estimates.push(estimate);
    return rows([estimate]);
  }
  if (normalized.includes("FROM repairmatch_estimates WHERE id=$1 AND customer_id=$2")) {
    return rows(state.estimates.filter((e) => e.id === params[0] && e.customer_id === params[1]));
  }
  if (normalized.startsWith("SELECT id FROM repairmatch_shop_profiles WHERE active=true")) {
    return rows(state.shops.filter((shop) => shop.active && shop.collision_body).map(({ id }) => ({ id })));
  }
  if (normalized.startsWith("INSERT INTO repairmatch_opportunities")) {
    if (!state.opportunities.some((o) => o.estimate_id === params[0] && o.shop_profile_id === params[1])) {
      state.opportunities.push({
        id: state.nextOpportunityId++,
        estimate_id: params[0],
        shop_profile_id: params[1],
        status: "new",
        sharing_scope: JSON.parse(params[2]),
        accepted_at: null,
      });
    }
    return rows();
  }
  if (normalized.startsWith("UPDATE repairmatch_estimates SET status='shared'")) {
    Object.assign(state.estimates.find((e) => e.id === params[0]), { status: "shared" });
    return rows();
  }
  if (normalized.includes("FROM repairmatch_opportunities o JOIN repairmatch_shop_profiles s") && normalized.includes("e.customer_contact")) {
    const opportunity = state.opportunities.find((o) => o.id === params[0]);
    const shop = state.shops.find((s) => s.id === opportunity?.shop_profile_id);
    const estimate = state.estimates.find((e) => e.id === opportunity?.estimate_id);
    return opportunity && shop?.owner_user_id === params[1] && estimate
      ? rows([{ ...estimate, ...opportunity, id: opportunity.id, estimate_id: estimate.id, estimate_status: estimate.status }])
      : rows();
  }
  if (normalized.startsWith("UPDATE repairmatch_opportunities SET viewed_at=")) {
    const opportunity = state.opportunities.find((o) => o.id === params[0]);
    if (opportunity?.status === "new") opportunity.status = "viewed";
    return rows();
  }
  if (normalized.includes("FROM repairmatch_estimate_lines WHERE estimate_id=$1")) {
    return rows(state.lines.filter((line) => line.estimate_id === params[0]).map((line) => ({ ...line })));
  }
  if (normalized.startsWith("SELECT * FROM repairmatch_shop_responses WHERE opportunity_id=$1")) {
    return rows(state.responses.filter((response) => response.opportunity_id === params[0]));
  }
  if (normalized.includes("FROM repairmatch_reviewed_lines WHERE response_id=$1")) {
    return rows(state.reviewedLines.filter((line) => line.response_id === params[0]).map((line) => ({ ...line })));
  }
  if (normalized.startsWith("INSERT INTO repairmatch_shop_responses")) {
    let response = state.responses.find((item) => item.opportunity_id === params[0]);
    if (!response) {
      response = { id: state.nextResponseId++, opportunity_id: params[0] };
      state.responses.push(response);
    }
    Object.assign(response, { status: params[1] });
    return rows([response]);
  }
  if (normalized.startsWith("DELETE FROM repairmatch_reviewed_lines")) {
    state.reviewedLines = state.reviewedLines.filter((line) => line.response_id !== params[0]);
    return rows();
  }
  if (normalized.startsWith("INSERT INTO repairmatch_reviewed_lines")) {
    state.reviewedLines.push({
      response_id: params[0],
      estimate_line_id: params[1],
      line_order: params[2],
      component: params[3],
      recommendation: params[4],
    });
    return rows();
  }
  if (normalized.startsWith("UPDATE repairmatch_opportunities SET status=$2")) {
    const opportunity = state.opportunities.find((o) => o.id === params[0]);
    if (opportunity) opportunity.status = params[1];
    return rows();
  }
  if (normalized.includes("FROM repairmatch_opportunities WHERE id=$1") && normalized.includes("status='responded'")) {
    return rows(state.opportunities.filter((o) => o.id === params[0] && o.estimate_id === params[1] && o.status === "responded"));
  }
  if (normalized.startsWith("UPDATE repairmatch_estimates SET status='matched'")) {
    Object.assign(state.estimates.find((e) => e.id === params[0]), { status: "matched" });
    return rows();
  }
  if (normalized.startsWith("UPDATE repairmatch_opportunities SET status=CASE")) {
    for (const opportunity of state.opportunities.filter((o) => o.estimate_id === params[1])) {
      if (opportunity.id === params[0]) {
        opportunity.status = "accepted";
        opportunity.accepted_at = new Date();
      } else if (["new", "viewed", "responded"].includes(opportunity.status)) {
        opportunity.status = "not_selected";
      }
    }
    return rows();
  }
  return rows();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: Number(req.get("x-test-user")) };
    next();
  });
  registerRepairMatchRoutes(app, {
    requireAuth: (req: any, res: any, next: any) => req.session.userId ? next() : res.sendStatus(401),
  });
  return app;
}

describe("RepairMatch shop contact route policy", () => {
  beforeEach(() => {
    state.nextEstimateId = 1;
    state.nextOpportunityId = 10;
    state.nextResponseId = 20;
    state.estimates = [];
    state.opportunities = [];
    state.lines = [];
    state.responses = [];
    state.reviewedLines = [];
    mockPool.query.mockImplementation(query);
    mockPool.connect.mockResolvedValue({ query, release: vi.fn() });
  });

  it("releases contact only to the accepted shop and preserves original AI lines", async () => {
    const app = buildApp();
    const customer = supertest(app);

    const created = await customer
      .post("/api/repairmatch/estimates")
      .set("x-test-user", "100")
      .send({
        vehicle: { year: "2024", make: "Toyota", model: "Camry", zip: "30303" },
        incident: { description: "Front bumper impact", drivable: "yes" },
        photoUrls: ["https://img.test/1.jpg", "https://img.test/2.jpg", "https://img.test/3.jpg"],
        customerContact: { name: "Private Customer", email: "private@example.com", phone: "555-0100" },
      })
      .expect(201);

    const estimate = state.estimates.find((item) => item.id === created.body.id);
    estimate.generation_status = "complete";
    state.lines.push({
      id: 501,
      estimate_id: estimate.id,
      line_order: 0,
      component: "Front bumper",
      recommendation: "repair",
    });

    await customer
      .post(`/api/repairmatch/estimates/${estimate.id}/distribute`)
      .set("x-test-user", "100")
      .send({ mode: "nearby", approveSharing: true })
      .expect(201);

    expect(state.opportunities).toHaveLength(2);
    const [firstOpportunity, secondOpportunity] = state.opportunities;

    for (const [shopUserId, opportunity] of [[201, firstOpportunity], [202, secondOpportunity]] as const) {
      const beforeAcceptance = await supertest(app)
        .get(`/api/repairmatch/shop/opportunities/${opportunity.id}`)
        .set("x-test-user", String(shopUserId))
        .expect(200);
      expect(beforeAcceptance.body).toMatchObject({
        vehicle: { year: "2024", make: "Toyota", model: "Camry" },
        incident: { description: "Front bumper impact" },
        photo_urls: ["https://img.test/1.jpg", "https://img.test/2.jpg", "https://img.test/3.jpg"],
        lines: [{ id: 501, component: "Front bumper", recommendation: "repair" }],
      });
      expect(beforeAcceptance.body).not.toHaveProperty("customer_contact");
    }

    await supertest(app)
      .put(`/api/repairmatch/shop/opportunities/${firstOpportunity.id}/response`)
      .set("x-test-user", "201")
      .send({
        status: "sent",
        reviewedLines: [{ estimateLineId: 501, component: "Front bumper", recommendation: "replace" }],
      })
      .expect(200);
    await supertest(app)
      .put(`/api/repairmatch/shop/opportunities/${secondOpportunity.id}/response`)
      .set("x-test-user", "202")
      .send({ status: "sent", reviewedLines: [] })
      .expect(200);

    expect(state.lines).toEqual([expect.objectContaining({ id: 501, recommendation: "repair" })]);
    expect(state.reviewedLines).toEqual([expect.objectContaining({ estimate_line_id: 501, recommendation: "replace" })]);

    await customer
      .post(`/api/repairmatch/estimates/${estimate.id}/accept-shop`)
      .set("x-test-user", "100")
      .send({ opportunityId: firstOpportunity.id })
      .expect(200);

    const accepted = await supertest(app)
      .get(`/api/repairmatch/shop/opportunities/${firstOpportunity.id}`)
      .set("x-test-user", "201")
      .expect(200);
    expect(accepted.body.status).toBe("accepted");
    expect(accepted.body.customer_contact).toEqual({
      name: "Private Customer",
      email: "private@example.com",
      phone: "555-0100",
    });

    const notSelected = await supertest(app)
      .get(`/api/repairmatch/shop/opportunities/${secondOpportunity.id}`)
      .set("x-test-user", "202")
      .expect(200);
    expect(notSelected.body.status).toBe("not_selected");
    expect(notSelected.body).not.toHaveProperty("customer_contact");
    expect(state.lines[0].recommendation).toBe("repair");
  });
});