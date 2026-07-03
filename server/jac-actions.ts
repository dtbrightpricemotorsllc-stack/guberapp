/**
 * JAC Pending Actions — confirm-before-submit execution layer.
 *
 * JAC never silently submits or charges anything. When a conversation gathers
 * enough structured detail to post a job, list a marketplace item, post a
 * transport/load-board request, or request Verify & Inspect, JAC stages the
 * action here and shows the user a plain-language confirmation summary.
 * Nothing is created in the real system until the user explicitly confirms,
 * at which point we call GUBER's own existing, already-validated creation
 * endpoint (same code path a human tapping through the UI would hit) so all
 * business rules (ID verification, content filters, pricing minimums, Stripe
 * checkout, etc.) are enforced identically.
 */
import http from "http";
import { pool } from "./db";

export type JacActionType =
  | "post_job"
  | "marketplace_listing"
  | "transport_request"
  | "vi_request";

interface ActionDef {
  path: string;
  requiredFields: string[] | ((fields: Record<string, any>) => string[]);
  buildBody: (fields: Record<string, any>) => Record<string, any>;
  buildSummary: (fields: Record<string, any>) => string;
}

function money(n: any): string {
  const v = parseFloat(n);
  return isNaN(v) ? "an amount you'll set" : `$${v.toFixed(2)}`;
}

const ACTION_DEFS: Record<JacActionType, ActionDef> = {
  post_job: {
    path: "/api/jobs/create-checkout",
    requiredFields: (f) =>
      f.category === "Verify & Inspect"
        ? ["category", "useCaseName", "catalogServiceTypeName"]
        : ["category", "serviceType", "zip"],
    buildBody: (f) => ({
      category: f.category,
      serviceType: f.serviceType ?? null,
      budget: f.budget ?? null,
      zip: f.zip ?? null,
      location: f.location ?? f.zip ?? null,
      locationApprox: f.locationApprox ?? null,
      title: f.title ?? null,
      description: f.description ?? null,
      useCaseName: f.useCaseName ?? null,
      catalogServiceTypeName: f.catalogServiceTypeName ?? null,
      jobDetails: f.jobDetails ?? null,
      urgentSwitch: !!f.urgentSwitch,
      availabilityWindows: f.availabilityWindows ?? null,
    }),
    buildSummary: (f) =>
      `Post a ${f.category || "job"}${f.serviceType ? ` — ${f.serviceType}` : ""} job` +
      (f.zip ? ` in ${f.zip}` : "") +
      (f.budget ? ` for ${money(f.budget)}` : "") +
      (f.description ? `. Details: "${String(f.description).slice(0, 140)}"` : "") +
      ". Posting is free — you'll only pay once a worker is locked in.",
  },
  marketplace_listing: {
    path: "/api/marketplace",
    requiredFields: ["title", "category"],
    buildBody: (f) => ({
      title: f.title,
      description: f.description ?? null,
      category: f.category,
      condition: f.condition ?? null,
      price: f.price ?? null,
      makeOfferEnabled: !!f.makeOfferEnabled,
      brand: f.brand ?? null,
      model: f.model ?? null,
      year: f.year ?? null,
      city: f.city ?? null,
      state: f.state ?? null,
      zipcode: f.zipcode ?? null,
      photos: f.photos ?? [],
      vinNumber: f.vin ?? f.vinNumber ?? null,
      vehicleMileage: f.mileage ?? f.vehicleMileage ?? null,
      titleStatus: f.titleStatus ?? null,
      purchaseType: f.purchaseType ?? null,
    }),
    buildSummary: (f) =>
      `List "${f.title}" (${f.category})` +
      (f.year || f.brand || f.model ? ` — ${[f.year, f.brand, f.model].filter(Boolean).join(" ")}` : "") +
      (f.condition ? `, condition: ${f.condition}` : "") +
      (f.price ? ` for ${money(f.price)}` : ", price open to offers") +
      " on GUBER Marketplace.",
  },
  transport_request: {
    path: "/api/load-board",
    requiredFields: ["transportType", "pickupCity", "pickupState", "deliveryCity", "deliveryState"],
    buildBody: (f) => ({
      transportType: f.transportType,
      pickupCity: f.pickupCity,
      pickupState: f.pickupState,
      pickupZip: f.pickupZip ?? null,
      deliveryCity: f.deliveryCity,
      deliveryState: f.deliveryState,
      deliveryZip: f.deliveryZip ?? null,
      estimatedMiles: f.estimatedMiles ?? null,
      pricingMode: f.pricingMode ?? "fixed",
      postedPrice: f.postedPrice ?? null,
      notes: f.notes ?? null,
      urgent: !!f.urgent,
    }),
    buildSummary: (f) =>
      `Post a ${f.transportType || "transport"} load from ${f.pickupCity}, ${f.pickupState} to ${f.deliveryCity}, ${f.deliveryState}` +
      (f.estimatedMiles ? ` (~${f.estimatedMiles} mi)` : "") +
      (f.postedPrice ? ` for ${money(f.postedPrice)}` : ", open to carrier offers") +
      " on the GUBER Load Board.",
  },
  vi_request: {
    path: "/api/jobs/create-checkout",
    requiredFields: ["useCaseName", "catalogServiceTypeName"],
    buildBody: (f) => ({
      category: "Verify & Inspect",
      useCaseName: f.useCaseName,
      catalogServiceTypeName: f.catalogServiceTypeName,
      jobDetails: f.jobDetails ?? null,
      budget: f.budget ?? null,
      zip: f.zip ?? null,
      location: f.location ?? f.zip ?? null,
    }),
    buildSummary: (f) =>
      `Request Verify & Inspect: ${f.catalogServiceTypeName || "inspection"} for ${f.useCaseName || "your asset"}` +
      (f.zip ? ` in ${f.zip}` : "") +
      (f.budget ? ` — budget ${money(f.budget)}` : " — budget defaults to $50 if unset") +
      ". This provides visual documentation only, not a guarantee of condition or ownership.",
  },
};

export function isValidActionType(t: any): t is JacActionType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(ACTION_DEFS, t);
}

export function validateAndSummarize(
  type: JacActionType,
  fields: Record<string, any>
): { ok: boolean; missing: string[]; summary: string } {
  const def = ACTION_DEFS[type];
  const required = typeof def.requiredFields === "function" ? def.requiredFields(fields) : def.requiredFields;
  const missing = required.filter((k) => fields[k] === undefined || fields[k] === null || fields[k] === "");
  const summary = missing.length === 0 ? def.buildSummary(fields) : "";
  return { ok: missing.length === 0, missing, summary };
}

/**
 * Execute a confirmed action by calling GUBER's own creation endpoint
 * in-process, forwarding the user's session cookie so auth + every existing
 * business rule (ID verification, content filters, tier gates, Stripe, etc.)
 * runs exactly as it would for a normal in-app submission.
 */
export function executeAction(
  type: JacActionType,
  fields: Record<string, any>,
  cookieHeader: string | undefined,
  port: number
): Promise<{ status: number; body: any }> {
  const def = ACTION_DEFS[type];
  const body = JSON.stringify(def.buildBody(fields));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: def.path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed: any = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = { message: data };
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function createPendingAction(
  userId: number,
  type: JacActionType,
  fields: Record<string, any>,
  summary: string
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO jac_pending_actions (user_id, action_type, payload, summary, status, created_at, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, 'pending', NOW(), NOW() + INTERVAL '30 minutes')
     RETURNING id`,
    [userId, type, JSON.stringify(fields), summary]
  );
  return r.rows[0].id;
}
