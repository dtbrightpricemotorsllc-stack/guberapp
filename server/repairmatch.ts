import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { pool } from "./db";

type Guard = (req: Request, res: Response, next: Function) => unknown;
const MAX_PHOTOS = 10, MIN_PHOTOS = 3, MAX_LINES = 20, MULTI_SHOP_CAP = 5;
const MODEL = process.env.REPAIRMATCH_VISION_MODEL || "gpt-4o-mini";
export const REPAIRMATCH_DISCLOSURE = "This is a preliminary visual assessment, not a CCC ONE estimate and not a final estimate, diagnosis, repair authorization, insurer submission, or guaranteed price. Physical inspection, teardown, parts pricing, OEM procedures, taxes, fees, and shop approval may change it.";

export async function provisionRepairMatchTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS repairmatch_estimates (id SERIAL PRIMARY KEY,customer_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',vehicle JSONB NOT NULL DEFAULT '{}'::jsonb,incident JSONB NOT NULL DEFAULT '{}'::jsonb,photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,location_approx TEXT,customer_contact JSONB DEFAULT '{}'::jsonb,ai_result JSONB,model_version TEXT,generation_key TEXT,generation_status TEXT NOT NULL DEFAULT 'not_requested',generation_error TEXT,disclosures_accepted_at TIMESTAMP,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS repairmatch_estimates_customer_generation_key ON repairmatch_estimates(customer_id,generation_key) WHERE generation_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS repairmatch_estimate_lines (id SERIAL PRIMARY KEY,estimate_id INTEGER NOT NULL,line_order INTEGER NOT NULL,component TEXT NOT NULL,recommendation TEXT NOT NULL,body_hours_low REAL,body_hours_high REAL,refinish_hours_low REAL,refinish_hours_high REAL,mechanical_hours_low REAL,mechanical_hours_high REAL,parts_allowance_low REAL,parts_allowance_high REAL,confidence REAL,inspection_required BOOLEAN DEFAULT true,notes TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repairmatch_shop_profiles (id SERIAL PRIMARY KEY,owner_user_id INTEGER NOT NULL UNIQUE,active BOOLEAN NOT NULL DEFAULT false,collision_body BOOLEAN NOT NULL DEFAULT false,service_zip TEXT,service_radius_miles INTEGER NOT NULL DEFAULT 25,capabilities JSONB DEFAULT '[]'::jsonb,response_quality REAL NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repairmatch_opportunities (id SERIAL PRIMARY KEY,estimate_id INTEGER NOT NULL,shop_profile_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'new',sharing_scope JSONB NOT NULL DEFAULT '{}'::jsonb,sent_at TIMESTAMP DEFAULT NOW(),viewed_at TIMESTAMP,accepted_at TIMESTAMP,expires_at TIMESTAMP,UNIQUE(estimate_id,shop_profile_id));
CREATE TABLE IF NOT EXISTS repairmatch_shop_responses (id SERIAL PRIMARY KEY,opportunity_id INTEGER NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'draft',availability TEXT,inspection_request TEXT,expected_repair_timing TEXT,warranty TEXT,towing_available BOOLEAN DEFAULT false,parts_approach TEXT,capabilities_note TEXT,customer_note TEXT,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repairmatch_reviewed_lines (id SERIAL PRIMARY KEY,response_id INTEGER NOT NULL,estimate_line_id INTEGER,line_order INTEGER NOT NULL,component TEXT NOT NULL,recommendation TEXT NOT NULL,body_hours_low REAL,body_hours_high REAL,refinish_hours_low REAL,refinish_hours_high REAL,mechanical_hours_low REAL,mechanical_hours_high REAL,parts_allowance_low REAL,parts_allowance_high REAL,inspection_required BOOLEAN DEFAULT true,notes TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repairmatch_consent_events (id SERIAL PRIMARY KEY,estimate_id INTEGER NOT NULL,opportunity_id INTEGER,actor_user_id INTEGER NOT NULL,event_type TEXT NOT NULL,scope JSONB NOT NULL DEFAULT '{}'::jsonb,ip_address TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS repairmatch_audit_events (id SERIAL PRIMARY KEY,estimate_id INTEGER NOT NULL,opportunity_id INTEGER,actor_user_id INTEGER,action TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}'::jsonb,ip_address TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE INDEX IF NOT EXISTS repairmatch_opportunities_shop ON repairmatch_opportunities(shop_profile_id,status);
CREATE INDEX IF NOT EXISTS repairmatch_lines_estimate ON repairmatch_estimate_lines(estimate_id,line_order);`);
}

const userHits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now(), hits = (userHits.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now); userHits.set(key, hits); return true;
}
function text(v: unknown, max = 1000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function id(v: unknown) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
export function validateRepairMatchPhotos(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < MIN_PHOTOS || value.length > MAX_PHOTOS) return null;
  const urls = value.map(v => text(v, 2048));
  return urls.every(url => /^https:\/\//i.test(url) && !/[\s<>]/.test(url)) ? urls : null;
}
/** Pure policy used after eligibility matching; single is always one selected shop. */
export function repairMatchDistribution(mode: unknown, selectedShopId: unknown, eligibleShopIds: number[]) {
  if (mode === "single") { const shopId = id(selectedShopId); return shopId && eligibleShopIds.includes(shopId) ? [shopId] : []; }
  return Array.from(new Set(eligibleShopIds)).slice(0, MULTI_SHOP_CAP);
}
/** Builds the only contact field permitted in a shop-facing representation. */
export function repairMatchShopContact(status: string, contact: unknown) {
  return status === "accepted" && contact && typeof contact === "object" ? contact : undefined;
}
/** Shop lines are a separately-created copy; original AI line records are never mutated. */
export function repairMatchReviewedLineCopies<T extends object>(originalLines: readonly T[], edits: readonly object[]) {
  return { originalLines: [...originalLines], reviewedLines: edits.map(edit => ({ ...edit })) };
}
function safeJson(v: unknown) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
export function normalizeRepairMatchInput(value: unknown, fields: readonly string[]) {
  const source=safeJson(value) as Record<string, unknown>, output: Record<string,string>={};
  for(const field of fields) { const v=text(source[field], field==="description" ? 2000 : 160); if(v) output[field]=v; }
  return output;
}
export function repairMatchGenerationClaim(current: { generation_status: string; generation_key?: string | null }, key: string) {
  if(current.generation_key===key && current.generation_status==="complete") return "idempotent";
  if(current.generation_status==="processing") return current.generation_key===key ? "in_progress" : "conflict";
  return "claim";
}
function customerId(req: Request) { return Number(req.session.userId); }
async function estimateForCustomer(estimateId: number, userId: number) {
  const r = await pool.query("SELECT * FROM repairmatch_estimates WHERE id=$1 AND customer_id=$2", [estimateId, userId]);
  return r.rows[0] || null;
}
async function audit(estimateId: number, actor: number | null, action: string, req: Request, opportunityId?: number, details: object = {}) {
  await pool.query(`INSERT INTO repairmatch_audit_events (estimate_id,opportunity_id,actor_user_id,action,details,ip_address)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [estimateId, opportunityId || null, actor, action, JSON.stringify(details), req.ip]).catch(() => {});
}

const prompt = `You assess ONLY visible vehicle collision damage from photos. Return JSON ONLY:
{"summary":"string","severity":"minor|moderate|severe|unknown","confidence":0,"inspectionRequired":["string"],"lines":[{"component":"string","recommendation":"repair|replace|R&I|blend|inspect","bodyHoursLow":0,"bodyHoursHigh":0,"refinishHoursLow":0,"refinishHoursHigh":0,"mechanicalHoursLow":0,"mechanicalHoursHigh":0,"partsAllowanceLow":0,"partsAllowanceHigh":0,"confidence":0,"inspectionRequired":true,"notes":"string"}]}
Use unknown/inspectionRequired for non-visible damage. Never infer hidden damage, exact prices, OEM procedures, diagnostics, calibration, or CCC ONE values. At most ${MAX_LINES} lines.`;
export const repairMatchVisionJsonSchema = {
  name: "repairmatch_visual_assessment", strict: true,
  schema: { type: "object", additionalProperties: false, required: ["summary", "severity", "confidence", "inspectionRequired", "lines"], properties: {
    summary: { type: "string" }, severity: { type: "string", enum: ["minor", "moderate", "severe", "unknown"] }, confidence: { type: "number", minimum: 0, maximum: 1 },
    inspectionRequired: { type: "array", maxItems: 20, items: { type: "string" } },
    lines: { type: "array", maxItems: MAX_LINES, items: { type: "object", additionalProperties: false, required: ["component", "recommendation", "bodyHoursLow", "bodyHoursHigh", "refinishHoursLow", "refinishHoursHigh", "mechanicalHoursLow", "mechanicalHoursHigh", "partsAllowanceLow", "partsAllowanceHigh", "confidence", "inspectionRequired", "notes"], properties: {
      component: { type: "string" }, recommendation: { type: "string", enum: ["repair", "replace", "R&I", "blend", "inspect"] },
      bodyHoursLow: { type: ["number", "null"], minimum: 0 }, bodyHoursHigh: { type: ["number", "null"], minimum: 0 }, refinishHoursLow: { type: ["number", "null"], minimum: 0 }, refinishHoursHigh: { type: ["number", "null"], minimum: 0 },
      mechanicalHoursLow: { type: ["number", "null"], minimum: 0 }, mechanicalHoursHigh: { type: ["number", "null"], minimum: 0 }, partsAllowanceLow: { type: ["number", "null"], minimum: 0 }, partsAllowanceHigh: { type: ["number", "null"], minimum: 0 },
      confidence: { type: ["number", "null"], minimum: 0, maximum: 1 }, inspectionRequired: { type: "boolean" }, notes: { type: "string" },
    } } },
  } },
} as const;
function num(v: unknown) { return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000 ? v : null; }
export function computeRepairMatchTotals(lines: Array<Record<string, unknown>>) {
  const sum = (lo: string, hi: string) => lines.reduce((total, line) => ({
    low: total.low + (num(line[lo]) ?? 0), high: total.high + (num(line[hi]) ?? 0),
  }), { low: 0, high: 0 });
  const body = sum("bodyHoursLow", "bodyHoursHigh");
  const refinish = sum("refinishHoursLow", "refinishHoursHigh");
  const mechanical = sum("mechanicalHoursLow", "mechanicalHoursHigh");
  const parts = sum("partsAllowanceLow", "partsAllowanceHigh");
  return {
    bodyHoursLow: body.low, bodyHoursHigh: body.high, refinishHoursLow: refinish.low, refinishHoursHigh: refinish.high,
    mechanicalHoursLow: mechanical.low, mechanicalHoursHigh: mechanical.high, partsAllowanceLow: parts.low, partsAllowanceHigh: parts.high,
    totalLaborHoursLow: body.low + refinish.low + mechanical.low, totalLaborHoursHigh: body.high + refinish.high + mechanical.high,
  };
}
export function parseRepairMatchAnalysis(raw: string) {
  const x = JSON.parse(raw); if (!x || typeof x !== "object" || !Array.isArray(x.lines) || x.lines.length > MAX_LINES) throw new Error("Malformed analysis");
  const lines = x.lines.map((l: any, index: number) => {
    const recommendation = text(l.recommendation, 20);
    if (!text(l.component, 160) || !["repair", "replace", "R&I", "blend", "inspect"].includes(recommendation)) throw new Error("Malformed analysis line");
    const pair=(low:unknown,high:unknown)=>{const lo=num(low),hi=num(high);return [lo,lo!=null&&hi!=null&&hi<lo?lo:hi];};
    const body=pair(l.bodyHoursLow,l.bodyHoursHigh),refinish=pair(l.refinishHoursLow,l.refinishHoursHigh),mechanical=pair(l.mechanicalHoursLow,l.mechanicalHoursHigh),parts=pair(l.partsAllowanceLow,l.partsAllowanceHigh);
    return { lineOrder: index, component: text(l.component,160), recommendation, bodyHoursLow:body[0], bodyHoursHigh:body[1], refinishHoursLow:refinish[0], refinishHoursHigh:refinish[1], mechanicalHoursLow:mechanical[0], mechanicalHoursHigh:mechanical[1], partsAllowanceLow:parts[0], partsAllowanceHigh:parts[1], confidence:Math.min(1,num(l.confidence) ?? 0), inspectionRequired: Boolean(l.inspectionRequired), notes:text(l.notes,500) };
  });
  return { summary:text((x as any).summary,1000), severity:["minor","moderate","severe","unknown"].includes((x as any).severity) ? (x as any).severity : "unknown", confidence:Math.min(1,num((x as any).confidence) ?? 0), inspectionRequired:Array.isArray((x as any).inspectionRequired) ? (x as any).inspectionRequired.map((v:any)=>text(v,200)).slice(0,20) : [], totals:computeRepairMatchTotals(lines), lines };
}

export function registerRepairMatchRoutes(app: Express, guards: { requireAuth: Guard }) {
  const { requireAuth } = guards;
  app.put("/api/repairmatch/shop/profile", requireAuth, async (req,res) => {
    // Enrollment is deliberately business-account gated; a customer cannot
    // make themselves an eligible collision shop by sending a client flag.
    const account=await pool.query("SELECT status FROM business_accounts WHERE owner_user_id=$1",[customerId(req)]);
    if(account.rows[0]?.status!=="verified_business")return res.status(403).json({message:"A verified business account is required to participate in RepairMatch."});
    const zip=text(req.body.serviceZip,16);
    if(!zip)return res.status(400).json({message:"A service ZIP is required."});
    const capabilities=Array.isArray(req.body.capabilities)?req.body.capabilities.filter((x:any)=>typeof x==="string").slice(0,30):[];
    const radius=Math.max(1,Math.min(100,Number(req.body.serviceRadiusMiles)||25));
    const r=await pool.query(`INSERT INTO repairmatch_shop_profiles(owner_user_id,active,collision_body,service_zip,service_radius_miles,capabilities,updated_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW()) ON CONFLICT(owner_user_id) DO UPDATE SET active=EXCLUDED.active,collision_body=EXCLUDED.collision_body,service_zip=EXCLUDED.service_zip,service_radius_miles=EXCLUDED.service_radius_miles,capabilities=EXCLUDED.capabilities,updated_at=NOW() RETURNING *`,[customerId(req),Boolean(req.body.active),Boolean(req.body.collisionBody),zip,radius,JSON.stringify(capabilities)]);
    res.json(r.rows[0]);
  });
  app.get("/api/repairmatch/shop/profile", requireAuth, async (_req,res) => {
    const r=await pool.query("SELECT * FROM repairmatch_shop_profiles WHERE owner_user_id=$1",[customerId(_req)]);
    res.json(r.rows[0] || null);
  });
  app.get("/api/repairmatch/shops", requireAuth, async (req,res) => {
    const zip = text(req.query.zip, 16);
    const r = await pool.query(`SELECT s.id, b.company_name, b.company_logo, b.service_area, s.capabilities, s.service_radius_miles
      FROM repairmatch_shop_profiles s JOIN business_profiles b ON b.user_id=s.owner_user_id
      WHERE s.active=true AND s.collision_body=true ${zip ? "AND (s.service_zip=$1 OR s.service_zip IS NULL)" : ""} ORDER BY s.response_quality DESC, s.id ASC LIMIT 25`, zip ? [zip] : []);
    res.json(r.rows);
  });
  app.post("/api/repairmatch/estimates", requireAuth, async (req,res) => {
    if(!limit(`create:user:${customerId(req)}`,10,3600000)||!limit(`create:ip:${req.ip}`,30,3600000))return res.status(429).json({message:"Estimate creation limit reached. Try again later.",retryAfterSeconds:3600});
    const photoUrls=validateRepairMatchPhotos(req.body.photoUrls); if (!photoUrls) return res.status(400).json({message:"Provide 3 to 10 HTTPS photo URLs."});
    const vehicle=normalizeRepairMatchInput(req.body.vehicle,["year","make","model","vin","mileage","zip"]), incident=normalizeRepairMatchInput(req.body.incident,["description","date","damageAreas","drivable","towing"]);
    if (!text((vehicle as any).year, 8) || !text((vehicle as any).make,80) || !text((vehicle as any).model,80)) return res.status(400).json({message:"Vehicle year, make, and model are required."});
    const r=await pool.query(`INSERT INTO repairmatch_estimates(customer_id,vehicle,incident,photo_urls,location_approx,customer_contact,updated_at)
      VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,NOW()) RETURNING *`,[customerId(req),JSON.stringify(vehicle),JSON.stringify(incident),JSON.stringify(photoUrls),text(req.body.locationApprox,200)||null,JSON.stringify(normalizeRepairMatchInput(req.body.customerContact,["name","email","phone"]))]);
    await audit(r.rows[0].id,customerId(req),"draft_created",req); res.status(201).json({...r.rows[0],disclosure:REPAIRMATCH_DISCLOSURE});
  });
  app.get("/api/repairmatch/estimates", requireAuth, async(req,res) => { const r=await pool.query("SELECT id,status,vehicle,incident,photo_urls,location_approx,generation_status,generation_error,model_version,created_at,updated_at FROM repairmatch_estimates WHERE customer_id=$1 ORDER BY created_at DESC",[customerId(req)]); res.json(r.rows); });
  app.get("/api/repairmatch/estimates/:id", requireAuth, async(req,res) => {
    const e=await estimateForCustomer(Number(req.params.id),customerId(req)); if(!e)return res.status(404).json({message:"Estimate not found"});
    const [lines,opps,responses]=await Promise.all([pool.query("SELECT * FROM repairmatch_estimate_lines WHERE estimate_id=$1 ORDER BY line_order",[e.id]),pool.query("SELECT o.*, b.company_name,b.company_logo FROM repairmatch_opportunities o JOIN repairmatch_shop_profiles s ON s.id=o.shop_profile_id JOIN business_profiles b ON b.user_id=s.owner_user_id WHERE o.estimate_id=$1",[e.id]),pool.query("SELECT r.*,o.estimate_id,COALESCE((SELECT json_agg(rl ORDER BY rl.line_order) FROM repairmatch_reviewed_lines rl WHERE rl.response_id=r.id),'[]'::json) AS reviewed_lines FROM repairmatch_shop_responses r JOIN repairmatch_opportunities o ON o.id=r.opportunity_id WHERE o.estimate_id=$1",[e.id])]);
    res.json({...e, customer_contact: undefined, lines:lines.rows,opportunities:opps.rows,responses:responses.rows,disclosure:REPAIRMATCH_DISCLOSURE});
  });
  app.patch("/api/repairmatch/estimates/:id", requireAuth, async(req,res) => {
    const e=await estimateForCustomer(Number(req.params.id),customerId(req)); if(!e)return res.status(404).json({message:"Estimate not found"}); if(e.status!=="draft")return res.status(409).json({message:"A shared estimate cannot be edited."});
    const p=req.body.photoUrls === undefined ? null : validateRepairMatchPhotos(req.body.photoUrls); if(req.body.photoUrls!==undefined&&!p)return res.status(400).json({message:"Provide 3 to 10 HTTPS photo URLs."});
    const r=await pool.query(`UPDATE repairmatch_estimates SET vehicle=COALESCE($2::jsonb,vehicle),incident=COALESCE($3::jsonb,incident),photo_urls=COALESCE($4::jsonb,photo_urls),location_approx=COALESCE($5,location_approx),customer_contact=COALESCE($6::jsonb,customer_contact),updated_at=NOW() WHERE id=$1 RETURNING *`,[e.id,req.body.vehicle?JSON.stringify(normalizeRepairMatchInput(req.body.vehicle,["year","make","model","vin","mileage","zip"])):null,req.body.incident?JSON.stringify(normalizeRepairMatchInput(req.body.incident,["description","date","damageAreas","drivable","towing"])):null,p?JSON.stringify(p):null,req.body.locationApprox===undefined?null:text(req.body.locationApprox,200),req.body.customerContact?JSON.stringify(normalizeRepairMatchInput(req.body.customerContact,["name","email","phone"])):null]); await audit(e.id,customerId(req),"draft_updated",req); res.json(r.rows[0]);
  });
  app.post("/api/repairmatch/estimates/:id/generate", requireAuth, async(req,res) => {
    const e=await estimateForCustomer(Number(req.params.id),customerId(req)); if(!e)return res.status(404).json({message:"Estimate not found"}); const key=text(req.get("Idempotency-Key")||req.body.idempotencyKey,120); if(!key)return res.status(400).json({message:"Idempotency-Key is required."});
    const policy=repairMatchGenerationClaim(e,key);if(policy==="idempotent")return res.json({id:e.id,status:"complete",idempotent:true});if(policy==="in_progress")return res.status(202).json({id:e.id,status:"processing",inProgress:true});if(policy==="conflict")return res.status(409).json({message:"Another generation is already processing for this estimate."});
    if(!limit(`gen:user:${customerId(req)}`,3,3600000)||!limit(`gen:ip:${req.ip}`,10,3600000))return res.status(429).json({message:"Generation limit reached. Try again later.",retryAfterSeconds:3600});
    if(!process.env.AI_INTEGRATIONS_OPENAI_API_KEY||!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL)return res.status(503).json({message:"Vision provider is not configured. Your draft was preserved.",retryable:true});
    const claim=await pool.query("UPDATE repairmatch_estimates SET generation_key=$2,generation_status='processing',generation_error=NULL,updated_at=NOW() WHERE id=$1 AND generation_status<>'processing' RETURNING id",[e.id,key]);
    if(!claim.rows[0]) { const live=await estimateForCustomer(e.id,customerId(req));return live?.generation_key===key ? res.status(202).json({id:e.id,status:"processing",inProgress:true}) : res.status(409).json({message:"Another generation is already processing for this estimate."}); }
    try { const openai=new OpenAI({apiKey:process.env.AI_INTEGRATIONS_OPENAI_API_KEY,baseURL:process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}); const c=await openai.chat.completions.create({model:MODEL,temperature:0,max_completion_tokens:2200,response_format:{type:"json_schema",json_schema:repairMatchVisionJsonSchema} as any,messages:[{role:"system",content:prompt},{role:"user",content:[{type:"text",text:`Vehicle: ${JSON.stringify(e.vehicle)}. Incident: ${JSON.stringify(e.incident)}.`},...(e.photo_urls as string[]).slice(0,MAX_PHOTOS).map(url=>({type:"image_url" as const,image_url:{url,detail:"low" as const}}))]}]}); const a=parseRepairMatchAnalysis(c.choices[0]?.message?.content||""); const client=await pool.connect(); try{await client.query("BEGIN");await client.query("DELETE FROM repairmatch_estimate_lines WHERE estimate_id=$1",[e.id]);for(const l of a.lines)await client.query(`INSERT INTO repairmatch_estimate_lines(estimate_id,line_order,component,recommendation,body_hours_low,body_hours_high,refinish_hours_low,refinish_hours_high,mechanical_hours_low,mechanical_hours_high,parts_allowance_low,parts_allowance_high,confidence,inspection_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[e.id,l.lineOrder,l.component,l.recommendation,l.bodyHoursLow,l.bodyHoursHigh,l.refinishHoursLow,l.refinishHoursHigh,l.mechanicalHoursLow,l.mechanicalHoursHigh,l.partsAllowanceLow,l.partsAllowanceHigh,l.confidence,l.inspectionRequired,l.notes]);await client.query("UPDATE repairmatch_estimates SET ai_result=$2::jsonb,model_version=$3,generation_status='complete',generation_error=NULL,updated_at=NOW() WHERE id=$1",[e.id,JSON.stringify(a),MODEL]);await client.query("COMMIT")}catch(x){await client.query("ROLLBACK");throw x}finally{client.release()} await audit(e.id,customerId(req),"analysis_generated",req);res.json({id:e.id,status:"complete",disclosure:REPAIRMATCH_DISCLOSURE});}catch(error:any){await pool.query("UPDATE repairmatch_estimates SET generation_status='failed',generation_error=$2,updated_at=NOW() WHERE id=$1",[e.id,"Vision analysis could not be completed. Please retry."]);await audit(e.id,customerId(req),"analysis_failed",req,undefined,{reason:error?.name||"provider_or_parse_failure"});res.status(503).json({message:"Vision analysis could not be completed. Your draft and photos were preserved.",retryable:true});}
  });
  app.post("/api/repairmatch/estimates/:id/distribute", requireAuth, async(req,res) => {
    const e=await estimateForCustomer(Number(req.params.id),customerId(req)); if(!e)return res.status(404).json({message:"Estimate not found"});
    if(e.generation_status!=="complete")return res.status(409).json({message:"Complete preliminary analysis before sharing."});
    if(!req.body.approveSharing)return res.status(400).json({message:"Customer approval is required before sharing."});
    const mode=req.body.mode==="nearby"?"nearby":"single", selected=id(req.body.shopProfileId);
    if(mode==="single"&&!selected)return res.status(400).json({message:"Select one participating shop."});
    if(!limit(`dist:user:${customerId(req)}`,5,3600000)||!limit(`dist:ip:${req.ip}`,15,3600000))return res.status(429).json({message:"Distribution limit reached. Try again later.",retryAfterSeconds:3600});
    const zip=text((e.vehicle as any)?.zip || req.body.zip,16);
    const shops=mode==="single" ? await pool.query("SELECT id FROM repairmatch_shop_profiles WHERE id=$1 AND active=true AND collision_body=true",[selected]) : await pool.query(`SELECT id FROM repairmatch_shop_profiles WHERE active=true AND collision_body=true ${zip?"AND (service_zip=$1 OR service_zip IS NULL)":""} ORDER BY response_quality DESC,id LIMIT ${MULTI_SHOP_CAP}`,zip?[zip]:[]);
    const recipients=repairMatchDistribution(mode,selected,shops.rows.map((shop:any)=>Number(shop.id)));
    if(!recipients.length)return res.status(409).json({message:"No eligible participating shops found. Select a participating shop directly."});
    const scope={vehicle:true,incident:true,photos:true,preliminaryEstimate:true,location:"approximate",contact:false};
    const client=await pool.connect(); try { await client.query("BEGIN"); for(const shopId of recipients) await client.query(`INSERT INTO repairmatch_opportunities(estimate_id,shop_profile_id,status,sharing_scope) VALUES($1,$2,'new',$3::jsonb) ON CONFLICT (estimate_id,shop_profile_id) DO NOTHING`,[e.id,shopId,JSON.stringify(scope)]); await client.query("UPDATE repairmatch_estimates SET status='shared',disclosures_accepted_at=NOW(),updated_at=NOW() WHERE id=$1",[e.id]); await client.query("INSERT INTO repairmatch_consent_events(estimate_id,actor_user_id,event_type,scope,ip_address) VALUES($1,$2,'sharing_approved',$3::jsonb,$4)",[e.id,customerId(req),JSON.stringify(scope),req.ip]);await client.query("COMMIT");}catch(x){await client.query("ROLLBACK");throw x}finally{client.release()} await audit(e.id,customerId(req),"opportunities_distributed",req,undefined,{mode,count:recipients.length});res.status(201).json({distributed:recipients.length,scope});
  });
  async function shopOpportunity(req:Request, res:Response) {
    const opportunityId=id(req.params.id); if(!opportunityId)return null;
    const r=await pool.query(`SELECT o.*,e.customer_id,e.vehicle,e.incident,e.photo_urls,e.location_approx,e.ai_result,e.status estimate_status
      ,e.customer_contact FROM repairmatch_opportunities o JOIN repairmatch_shop_profiles s ON s.id=o.shop_profile_id JOIN repairmatch_estimates e ON e.id=o.estimate_id
      WHERE o.id=$1 AND s.owner_user_id=$2`,[opportunityId,customerId(req)]);
    if(!r.rows[0]){res.status(404).json({message:"Opportunity not found"});return null;} return r.rows[0];
  }
  app.get("/api/repairmatch/shop/opportunities",requireAuth,async(req,res)=>{
    const r=await pool.query(`SELECT o.id,o.status,o.sent_at,o.viewed_at,o.accepted_at,e.vehicle,e.incident,e.location_approx,b.company_name
      FROM repairmatch_opportunities o JOIN repairmatch_shop_profiles s ON s.id=o.shop_profile_id JOIN repairmatch_estimates e ON e.id=o.estimate_id
      JOIN business_profiles b ON b.user_id=s.owner_user_id WHERE s.owner_user_id=$1 ORDER BY o.sent_at DESC`,[customerId(req)]);res.json(r.rows);
  });
  app.get("/api/repairmatch/shop/opportunities/:id",requireAuth,async(req,res)=>{
    const o=await shopOpportunity(req,res);if(!o)return; await pool.query("UPDATE repairmatch_opportunities SET viewed_at=COALESCE(viewed_at,NOW()),status=CASE WHEN status='new' THEN 'viewed' ELSE status END WHERE id=$1",[o.id]);
    const [lines,response]=await Promise.all([pool.query("SELECT * FROM repairmatch_estimate_lines WHERE estimate_id=$1 ORDER BY line_order",[o.estimate_id]),pool.query("SELECT * FROM repairmatch_shop_responses WHERE opportunity_id=$1",[o.id])]);
    const reviewedLines=response.rows[0] ? await pool.query("SELECT * FROM repairmatch_reviewed_lines WHERE response_id=$1 ORDER BY line_order",[response.rows[0].id]) : { rows: [] };
    // Never expose contact or an exact address before acceptance.
    res.json({...o,customer_id:undefined,customer_contact:repairMatchShopContact(o.status,o.customer_contact),lines:lines.rows,response:response.rows[0]||null,reviewedLines:reviewedLines.rows});
  });
  app.put("/api/repairmatch/shop/opportunities/:id/response",requireAuth,async(req,res)=>{
    const o=await shopOpportunity(req,res);if(!o)return; const status=["draft","declined","sent"].includes(req.body.status)?req.body.status:"draft";
    if(["accepted","not_selected","expired"].includes(o.status))return res.status(409).json({message:"This opportunity can no longer be changed."});
    if(!limit(`response:user:${customerId(req)}`,30,3600000)||!limit(`response:ip:${req.ip}`,60,3600000))return res.status(429).json({message:"Shop response limit reached. Try again later.",retryAfterSeconds:3600});
    const submittedReviewed=Array.isArray(req.body.reviewedLines)?req.body.reviewedLines.slice(0,MAX_LINES):[];
    if(submittedReviewed.some((line:any)=>!text(line.component,160)||!text(line.recommendation,20)))return res.status(400).json({message:"Invalid reviewed lines."});
    const r=await pool.query(`INSERT INTO repairmatch_shop_responses(opportunity_id,status,availability,inspection_request,expected_repair_timing,warranty,towing_available,parts_approach,capabilities_note,customer_note,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(opportunity_id) DO UPDATE SET status=EXCLUDED.status,availability=EXCLUDED.availability,inspection_request=EXCLUDED.inspection_request,expected_repair_timing=EXCLUDED.expected_repair_timing,warranty=EXCLUDED.warranty,towing_available=EXCLUDED.towing_available,parts_approach=EXCLUDED.parts_approach,capabilities_note=EXCLUDED.capabilities_note,customer_note=EXCLUDED.customer_note,updated_at=NOW() RETURNING *`,[o.id,status,text(req.body.availability,500)||null,text(req.body.inspectionRequest,1000)||null,text(req.body.expectedRepairTiming,500)||null,text(req.body.warranty,1000)||null,Boolean(req.body.towingAvailable),text(req.body.partsApproach,500)||null,text(req.body.capabilitiesNote,1000)||null,text(req.body.customerNote,2000)||null]);
    const reviewed=submittedReviewed;const client=await pool.connect();try{await client.query("BEGIN");await client.query("DELETE FROM repairmatch_reviewed_lines WHERE response_id=$1",[r.rows[0].id]);for(let i=0;i<reviewed.length;i++){const l=reviewed[i];await client.query("INSERT INTO repairmatch_reviewed_lines(response_id,estimate_line_id,line_order,component,recommendation,body_hours_low,body_hours_high,refinish_hours_low,refinish_hours_high,mechanical_hours_low,mechanical_hours_high,parts_allowance_low,parts_allowance_high,inspection_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",[r.rows[0].id,id(l.estimateLineId),i,text(l.component,160),text(l.recommendation,20),num(l.bodyHoursLow),num(l.bodyHoursHigh),num(l.refinishHoursLow),num(l.refinishHoursHigh),num(l.mechanicalHoursLow),num(l.mechanicalHoursHigh),num(l.partsAllowanceLow),num(l.partsAllowanceHigh),Boolean(l.inspectionRequired),text(l.notes,500)||null])}await client.query("UPDATE repairmatch_opportunities SET status=$2 WHERE id=$1",[o.id,status==="sent"?"responded":status]);await client.query("COMMIT")}catch(x){await client.query("ROLLBACK");return res.status(400).json({message:"Invalid reviewed lines."})}finally{client.release()}await audit(o.estimate_id,customerId(req),"shop_response_"+status,req,o.id);res.json(r.rows[0]);
  });
  app.post("/api/repairmatch/estimates/:id/accept-shop",requireAuth,async(req,res)=>{
    const e=await estimateForCustomer(Number(req.params.id),customerId(req));if(!e)return res.status(404).json({message:"Estimate not found"});const oid=id(req.body.opportunityId);if(!oid)return res.status(400).json({message:"Opportunity is required"});
    const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query("SELECT * FROM repairmatch_opportunities WHERE id=$1 AND estimate_id=$2 AND status='responded' FOR UPDATE",[oid,e.id]);if(!r.rows[0]){await client.query("ROLLBACK");return res.status(409).json({message:"That shop response is not available for acceptance."});}const o=r.rows[0],scope={contact:true,acceptedShop:true};await client.query("UPDATE repairmatch_estimates SET status='matched',updated_at=NOW() WHERE id=$1",[e.id]);await client.query("UPDATE repairmatch_opportunities SET status=CASE WHEN id=$1 THEN 'accepted' WHEN status IN ('new','viewed','responded') THEN 'not_selected' ELSE status END,accepted_at=CASE WHEN id=$1 THEN NOW() ELSE accepted_at END WHERE estimate_id=$2",[o.id,e.id]);await client.query("INSERT INTO repairmatch_consent_events(estimate_id,opportunity_id,actor_user_id,event_type,scope,ip_address) VALUES($1,$2,$3,'contact_handoff',$4::jsonb,$5)",[e.id,o.id,customerId(req),JSON.stringify(scope),req.ip]);await client.query("COMMIT");await audit(e.id,customerId(req),"shop_accepted_contact_handoff",req,o.id);res.json({acceptedOpportunityId:o.id,contactReleasedToShop:true});}catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}finally{client.release()}
  });
}