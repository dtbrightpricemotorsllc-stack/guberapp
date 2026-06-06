// ════════════════════════════════════════════════════════════════════════════
// GUBER Verified Release System™ — Asset Custody Engine (service layer)
// ────────────────────────────────────────────────────────────────────────────
// Server-authoritative helpers for the generic custody engine. Direct Drizzle
// access (same pattern as server/feature-flags.ts) keeps this additive and
// isolated from the large IStorage interface.
//
// Hard rules enforced here:
//   • custody_events is append-only (also enforced by a Postgres rule).
//   • Money/state are resolved server-side; prices come from the LOCKED catalog.
//   • Role-on-asset is verified from the DB, never from client claims.
// ════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { db, pool } from "./db";
import {
  protectedAssets,
  assetRoles,
  custodyEvents,
  assetProtectionPurchases,
  foundersClubState,
  releaseAuthorizations,
  releaseCodes,
  towVehicleVerifications,
  trailerVerifications,
  vinVerifications,
  masterTransportEvents,
  transportIssues,
  incidents,
  storageEvents,
  witnessAssignments,
  witnessReports,
  users,
  type ProtectedAsset,
  type AssetRole,
  type ReleaseAuthorization,
  type ReleaseCode,
  type TowVehicleVerification,
  type TrailerVerification,
  type VinVerification,
  type MasterTransportEvent,
  type TransportIssue,
  type Incident,
  type StorageEvent,
  type WitnessAssignment,
  type WitnessReport,
} from "@shared/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  FOUNDERS_CLUB,
  isProtectionPackageKey,
  priceForPackage,
  priceForWitnessAddon,
  isWitnessAddonKey,
  type ProtectionPackageKey,
} from "@shared/asset-protection";

export type AssetRoleName =
  | "owner"
  | "sender"
  | "buyer"
  | "seller"
  | "authorized_contact"
  | "carrier"
  | "driver"
  | "witness"
  | "pickup_contact"
  | "delivery_contact"
  | "recipient"
  | "admin";

// ── Custody events (append-only) ────────────────────────────────────────────
export async function appendCustodyEvent(
  assetId: number,
  eventType: string,
  opts: {
    actorId?: number | null;
    description?: string | null;
    metadata?: unknown;
    lat?: number | null;
    lng?: number | null;
    photoUrls?: string[] | null;
  } = {},
): Promise<void> {
  await db.insert(custodyEvents).values({
    assetId,
    actorId: opts.actorId ?? null,
    eventType,
    description: opts.description ?? null,
    metadata: (opts.metadata ?? null) as any,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
    photoUrls: opts.photoUrls ?? null,
  } as any);
}

export async function getCustodyTimeline(assetId: number) {
  return db
    .select()
    .from(custodyEvents)
    .where(eq(custodyEvents.assetId, assetId))
    .orderBy(desc(custodyEvents.createdAt));
}

// ── Protected assets + roles ────────────────────────────────────────────────
export async function getProtectedAsset(id: number): Promise<ProtectedAsset | undefined> {
  const [row] = await db.select().from(protectedAssets).where(eq(protectedAssets.id, id));
  return row;
}

export async function getAssetByListing(listingId: number): Promise<ProtectedAsset | undefined> {
  const [row] = await db
    .select()
    .from(protectedAssets)
    .where(eq(protectedAssets.listingId, listingId))
    .orderBy(desc(protectedAssets.id));
  return row;
}

export async function createProtectedAsset(input: {
  ownerId: number;
  listingId?: number | null;
  jobId?: number | null;
  assetType?: string;
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  description?: string | null;
  estimatedValue?: number | null;
  geofenceLat?: number | null;
  geofenceLng?: number | null;
  geofenceRadiusMeters?: number | null;
}): Promise<ProtectedAsset> {
  const [row] = await db
    .insert(protectedAssets)
    .values({
      ownerId: input.ownerId,
      listingId: input.listingId ?? null,
      jobId: input.jobId ?? null,
      assetType: input.assetType ?? "vehicle",
      vin: input.vin ?? null,
      year: input.year ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      description: input.description ?? null,
      estimatedValue: input.estimatedValue ?? null,
      geofenceLat: input.geofenceLat ?? null,
      geofenceLng: input.geofenceLng ?? null,
      geofenceRadiusMeters: input.geofenceRadiusMeters ?? 250,
      status: "pending",
    } as any)
    .returning();
  // Owner role + opening custody event (append-only).
  await assignRole(row.id, input.ownerId, "owner");
  await appendCustodyEvent(row.id, "created", {
    actorId: input.ownerId,
    description: "Protected asset created",
    metadata: { listingId: input.listingId ?? null, assetType: row.assetType },
  });
  return row;
}

export async function getAssetsByOwner(ownerId: number): Promise<ProtectedAsset[]> {
  return db
    .select()
    .from(protectedAssets)
    .where(eq(protectedAssets.ownerId, ownerId))
    .orderBy(desc(protectedAssets.id));
}

export async function assignRole(
  assetId: number,
  userId: number,
  role: AssetRoleName,
): Promise<AssetRole> {
  // Idempotent-ish: don't duplicate an active role for the same user.
  const existing = await db
    .select()
    .from(assetRoles)
    .where(and(eq(assetRoles.assetId, assetId), eq(assetRoles.userId, userId), eq(assetRoles.role, role)));
  if (existing.length && existing[0].status === "active") return existing[0];
  const [row] = await db
    .insert(assetRoles)
    .values({ assetId, userId, role, status: "active" })
    .returning();
  return row;
}

export async function getAssetRoles(assetId: number): Promise<AssetRole[]> {
  return db.select().from(assetRoles).where(eq(assetRoles.assetId, assetId));
}

/** Server-side authorization check: does this user hold one of these roles? */
export async function userHasRoleOnAsset(
  assetId: number,
  userId: number,
  roles: AssetRoleName[],
): Promise<boolean> {
  const rows = await db
    .select()
    .from(assetRoles)
    .where(and(eq(assetRoles.assetId, assetId), eq(assetRoles.userId, userId)));
  return rows.some((r) => r.status === "active" && roles.includes(r.role as AssetRoleName));
}

export async function updateAsset(id: number, patch: Partial<ProtectedAsset>): Promise<void> {
  await db
    .update(protectedAssets)
    .set({ ...patch, updatedAt: new Date() } as any)
    .where(eq(protectedAssets.id, id));
}

// ── Founders Club state ─────────────────────────────────────────────────────
export interface FoundersStatus {
  totalClaimed: number;
  capLimit: number;
  spotsRemaining: number;
  soldOut: boolean;
  founderPriceCents: number;
  standardPriceCents: number;
  /** The price a NEW buyer pays right now ($99 until the cap, then $299). */
  currentPriceCents: number;
}

export async function getFoundersStatus(): Promise<FoundersStatus> {
  let [row] = await db.select().from(foundersClubState).where(eq(foundersClubState.id, 1));
  if (!row) {
    await pool.query("INSERT INTO founders_club_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
    [row] = await db.select().from(foundersClubState).where(eq(foundersClubState.id, 1));
  }
  const totalClaimed = row?.totalClaimed ?? 0;
  const capLimit = row?.capLimit ?? FOUNDERS_CLUB.defaultCap;
  const founderPriceCents = row?.founderPriceCents ?? FOUNDERS_CLUB.founderPriceCents;
  const standardPriceCents = row?.standardPriceCents ?? FOUNDERS_CLUB.standardPriceCents;
  const spotsRemaining = Math.max(0, capLimit - totalClaimed);
  const soldOut = spotsRemaining <= 0;
  return {
    totalClaimed,
    capLimit,
    spotsRemaining,
    soldOut,
    founderPriceCents,
    standardPriceCents,
    currentPriceCents: soldOut ? standardPriceCents : founderPriceCents,
  };
}

/**
 * Admin-only update of the Founders Club configuration (cap / prices). Ensures
 * the singleton row exists first. The cap can never be set below the number of
 * spots already claimed (that would create a negative remaining count and
 * silently retro-close the club). Returns the fresh status.
 */
export async function updateFoundersConfig(patch: {
  capLimit?: number;
  founderPriceCents?: number;
  standardPriceCents?: number;
}): Promise<FoundersStatus> {
  // Ensure the singleton exists.
  await getFoundersStatus();
  const [current] = await db.select().from(foundersClubState).where(eq(foundersClubState.id, 1));
  const totalClaimed = current?.totalClaimed ?? 0;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.capLimit != null && Number.isFinite(patch.capLimit)) {
    set.capLimit = Math.max(totalClaimed, Math.floor(patch.capLimit));
  }
  if (patch.founderPriceCents != null && Number.isFinite(patch.founderPriceCents)) {
    set.founderPriceCents = Math.max(0, Math.floor(patch.founderPriceCents));
  }
  if (patch.standardPriceCents != null && Number.isFinite(patch.standardPriceCents)) {
    set.standardPriceCents = Math.max(0, Math.floor(patch.standardPriceCents));
  }
  await db.update(foundersClubState).set(set as any).where(eq(foundersClubState.id, 1));
  return getFoundersStatus();
}

export async function isFounder(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ f: users.foundingAssetProtectionMember })
    .from(users)
    .where(eq(users.id, userId));
  return !!u?.f;
}

// Founders Club enrollment is performed atomically inside fulfillPurchaseBySession
// (founder flag + cap increment + purchase row in one transaction under the
// global advisory lock 987654321), so there is no separate claim/grant helper —
// a single source of truth keeps "paid" and "enrolled" inseparable.

// ── Purchases (idempotent fulfillment) ──────────────────────────────────────
export async function recordPendingPurchase(opts: {
  userId: number;
  assetId?: number | null;
  listingId?: number | null;
  productType: "package" | "witness_addon" | "founders_club";
  packageTier?: string | null;
  amountCents: number;
  stripeSessionId: string;
}): Promise<void> {
  await db
    .insert(assetProtectionPurchases)
    .values({
      userId: opts.userId,
      assetId: opts.assetId ?? null,
      listingId: opts.listingId ?? null,
      productType: opts.productType,
      packageTier: opts.packageTier ?? null,
      amountCents: opts.amountCents,
      stripeSessionId: opts.stripeSessionId,
      status: "pending",
    } as any)
    .onConflictDoNothing();
}

/**
 * Find the most recent purchase row for a given asset + product + tier. Used to
 * make checkout *initiation* idempotent: a paid row means "already protected";
 * a pending row lets us try to reuse the existing Stripe session instead of
 * minting a second one (and a second charge surface).
 */
export async function findPurchaseForAsset(opts: {
  assetId: number;
  productType: "package" | "witness_addon";
  packageTier: string;
}): Promise<{ status: string; stripeSessionId: string | null } | null> {
  const rows = await db
    .select()
    .from(assetProtectionPurchases)
    .where(
      and(
        eq(assetProtectionPurchases.assetId, opts.assetId),
        eq(assetProtectionPurchases.productType, opts.productType),
        eq(assetProtectionPurchases.packageTier, opts.packageTier),
      ),
    )
    .orderBy(desc(assetProtectionPurchases.id));
  // Prefer a paid row if one exists, otherwise the latest pending.
  const paid = rows.find(r => r.status === "paid");
  const chosen = paid ?? rows[0];
  if (!chosen) return null;
  return { status: chosen.status, stripeSessionId: chosen.stripeSessionId };
}

/**
 * Mark a checkout session paid and apply its effects exactly once. Safe to call
 * repeatedly (webhook + success redirect): returns false if already fulfilled.
 */
export async function fulfillPurchaseBySession(
  stripeSessionId: string,
  paymentIntentId?: string | null,
): Promise<{ fulfilled: boolean; alreadyDone: boolean; founderGranted?: boolean; founderSoldOut?: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent fulfillment attempts (webhook + success redirect) on
    // this purchase row so the money/state effects apply exactly once.
    const pres = await client.query(
      "SELECT * FROM asset_protection_purchases WHERE stripe_session_id = $1 FOR UPDATE",
      [stripeSessionId],
    );
    const p = pres.rows[0];
    if (!p) {
      await client.query("COMMIT");
      return { fulfilled: false, alreadyDone: false };
    }
    if (p.status === "paid") {
      // Already fully fulfilled in a prior COMMITTED transaction. Because the
      // status flip and ALL entitlement effects share one transaction (below),
      // "paid" guarantees the effects landed too — nothing to reconcile.
      await client.query("COMMIT");
      return { fulfilled: false, alreadyDone: true };
    }

    // Mark paid AND apply every entitlement effect inside ONE transaction: either
    // all commit or none do. A mid-fulfillment failure rolls the row back to
    // "pending", so Stripe's retry converges cleanly — there is no window where a
    // purchase is "paid" but the asset/founder entitlement was never applied.
    await client.query(
      "UPDATE asset_protection_purchases SET status = 'paid', fulfilled_at = NOW(), stripe_payment_intent_id = $2 WHERE id = $1",
      [p.id, paymentIntentId ?? null],
    );

    let founderGranted: boolean | undefined;
    let founderSoldOut: boolean | undefined;

    if (p.product_type === "package" && p.asset_id && p.package_tier && isProtectionPackageKey(p.package_tier)) {
      await client.query(
        "UPDATE protected_assets SET package_tier = $2, status = 'active', updated_at = NOW() WHERE id = $1",
        [p.asset_id, p.package_tier],
      );
      await client.query(
        "INSERT INTO custody_events (asset_id, actor_id, event_type, description, metadata) VALUES ($1, $2, 'package_purchased', $3, $4)",
        [
          p.asset_id,
          p.user_id,
          `Protection package purchased: ${p.package_tier}`,
          JSON.stringify({ amountCents: p.amount_cents, packageTier: p.package_tier, sessionId: stripeSessionId }),
        ],
      );
    } else if (p.product_type === "witness_addon" && p.asset_id) {
      await client.query(
        "UPDATE protected_assets SET witness_addon = true, updated_at = NOW() WHERE id = $1",
        [p.asset_id],
      );
      await client.query(
        "INSERT INTO custody_events (asset_id, actor_id, event_type, description, metadata) VALUES ($1, $2, 'package_purchased', $3, $4)",
        [
          p.asset_id,
          p.user_id,
          `Witness add-on purchased: ${p.package_tier ?? "witness"}`,
          JSON.stringify({ amountCents: p.amount_cents, addon: p.package_tier, sessionId: stripeSessionId }),
        ],
      );
    } else if (p.product_type === "founders_club") {
      // Founder enrollment is part of the SAME atomic fulfillment so a paid
      // founders purchase can never end up un-enrolled. Strict cap under the
      // global founders lock; overage is refused and surfaced to the caller for
      // refund/convert reconciliation (never a silent oversubscription).
      await client.query("SELECT pg_advisory_xact_lock($1)", [987654321]);
      const memRes = await client.query(
        "SELECT founding_asset_protection_member AS m FROM users WHERE id = $1",
        [p.user_id],
      );
      if (memRes.rows[0]?.m) {
        founderGranted = false; // already a member — idempotent no-op
      } else {
        const capRes = await client.query(
          "SELECT total_claimed AS claimed, cap_limit AS cap FROM founders_club_state WHERE id = 1 FOR UPDATE",
        );
        const claimed = Number(capRes.rows[0]?.claimed ?? 0);
        const cap = Number(capRes.rows[0]?.cap ?? 0);
        if (claimed >= cap) {
          founderGranted = false;
          founderSoldOut = true;
        } else {
          const inc = await client.query(
            "UPDATE founders_club_state SET total_claimed = total_claimed + 1, updated_at = NOW() WHERE id = 1 AND total_claimed < cap_limit RETURNING total_claimed",
          );
          if (inc.rows.length) {
            await client.query(
              "UPDATE users SET founding_asset_protection_member = true WHERE id = $1",
              [p.user_id],
            );
            await client.query(
              "UPDATE protected_assets SET founder_protected = true, updated_at = NOW() WHERE id = $1",
              [p.asset_id],
            );
            founderGranted = true;
          } else {
            founderGranted = false;
            founderSoldOut = true;
          }
        }
      }
    }

    await client.query("COMMIT");
    return { fulfilled: true, alreadyDone: false, founderGranted, founderSoldOut };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Resolve the locked, server-authoritative price for a checkout request. */
export async function resolvePrice(
  userId: number,
  productType: "package" | "witness_addon",
  key: string,
): Promise<{ amountCents: number; founder: boolean } | null> {
  const founder = await isFounder(userId);
  if (productType === "package" && isProtectionPackageKey(key)) {
    return { amountCents: priceForPackage(key as ProtectionPackageKey, founder), founder };
  }
  if (productType === "witness_addon" && isWitnessAddonKey(key)) {
    return { amountCents: priceForWitnessAddon(key, founder), founder };
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 3 — Secure asset release (verified handoff, geofenced pickup, one-time
// code). The carrier requests authorization at the pickup point (live selfie +
// GPS + tow/trailer/VIN verification); the owner / authorized contacts approve;
// a one-time pickup code is issued and validated at hand-off, which appends the
// immutable "loaded" custody event. GPS is never trusted alone — a release also
// requires geofence proximity AND a matching VIN.
// ════════════════════════════════════════════════════════════════════════════

const RELEASE_AUTH_TTL_MS = 60 * 60 * 1000; // request must be acted on within 1h
const RELEASE_CODE_TTL_MS = 2 * 60 * 60 * 1000; // approved code valid for 2h

// Same haversine formula used across the app (server/routes.ts,
// server/notify-helpers.ts) — distance between two lat/lng points in meters.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceResult {
  /** True only when the asset has a pickup geofence AND the point is inside it. */
  verified: boolean;
  /** Distance in meters from the pickup point, or null if no geofence is set. */
  meters: number | null;
  /** The asset's geofence radius (meters) at the time of the check. */
  radiusMeters: number | null;
  /** True when the asset has no pickup coordinates configured. */
  unconfigured: boolean;
}

/** Check a live GPS reading against the asset's pickup geofence. */
export function checkGeofence(asset: ProtectedAsset, lat: number, lng: number): GeofenceResult {
  if (asset.geofenceLat == null || asset.geofenceLng == null) {
    return { verified: false, meters: null, radiusMeters: asset.geofenceRadiusMeters ?? null, unconfigured: true };
  }
  const radius = asset.geofenceRadiusMeters ?? 250;
  const meters = haversineMeters(asset.geofenceLat, asset.geofenceLng, lat, lng);
  return { verified: meters <= radius, meters: Math.round(meters), radiusMeters: radius, unconfigured: false };
}

/** Set the pickup geofence for an asset (owner / authorized only — enforced at route). */
export async function setAssetGeofence(
  assetId: number,
  lat: number,
  lng: number,
  radiusMeters?: number,
): Promise<void> {
  await updateAsset(assetId, {
    geofenceLat: lat,
    geofenceLng: lng,
    geofenceRadiusMeters: radiusMeters && radiusMeters > 0 ? Math.round(radiusMeters) : 250,
  } as any);
}

// ── VIN verification ────────────────────────────────────────────────────────
/** Normalize a VIN for comparison: upper-case, strip non-alphanumerics. */
export function normalizeVin(vin: string | null | undefined): string {
  return (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Record a VIN verification. When the asset has an expected VIN on file the
 * scanned VIN must match it (normalized) — a mismatch is a HARD BLOCK on
 * release (status = "mismatch"). When no VIN is on file the scan is recorded
 * but cannot be the basis for a match, so it is left "pending".
 */
export async function createVinVerification(input: {
  assetId: number;
  authorizationId?: number | null;
  expectedVin?: string | null;
  scannedVin?: string | null;
  photoUrl?: string | null;
  verifiedBy?: number | null;
}): Promise<VinVerification> {
  const expected = normalizeVin(input.expectedVin);
  const scanned = normalizeVin(input.scannedVin);
  let matched: boolean | null = null;
  let status = "pending";
  if (expected && scanned) {
    matched = expected === scanned;
    status = matched ? "matched" : "mismatch";
  }
  const [row] = await db
    .insert(vinVerifications)
    .values({
      assetId: input.assetId,
      authorizationId: input.authorizationId ?? null,
      expectedVin: input.expectedVin ?? null,
      scannedVin: input.scannedVin ?? null,
      matched,
      photoUrl: input.photoUrl ?? null,
      verifiedBy: input.verifiedBy ?? null,
      status,
    } as any)
    .returning();
  return row;
}

// ── Tow vehicle / trailer verification ──────────────────────────────────────
export async function createTowVehicleVerification(input: {
  assetId: number;
  authorizationId?: number | null;
  carrierId: number;
  vehicleType?: string | null;
  plateNumber?: string | null;
  plateState?: string | null;
  photoUrls?: string[] | null;
}): Promise<TowVehicleVerification> {
  // A submitted tow vehicle with a plate is considered verified at capture time;
  // an admin can still review the photos via the custody timeline.
  const verified = !!(input.plateNumber && input.plateNumber.trim());
  const [row] = await db
    .insert(towVehicleVerifications)
    .values({
      assetId: input.assetId,
      authorizationId: input.authorizationId ?? null,
      carrierId: input.carrierId,
      vehicleType: input.vehicleType ?? null,
      plateNumber: input.plateNumber ?? null,
      plateState: input.plateState ?? null,
      photoUrls: input.photoUrls ?? null,
      verified,
    } as any)
    .returning();
  return row;
}

export async function createTrailerVerification(input: {
  assetId: number;
  authorizationId?: number | null;
  carrierId: number;
  trailerType?: string | null;
  trailerNumber?: string | null;
  plateNumber?: string | null;
  photoUrls?: string[] | null;
}): Promise<TrailerVerification> {
  const verified = !!(input.trailerType && input.trailerType.trim());
  const [row] = await db
    .insert(trailerVerifications)
    .values({
      assetId: input.assetId,
      authorizationId: input.authorizationId ?? null,
      carrierId: input.carrierId,
      trailerType: input.trailerType ?? null,
      trailerNumber: input.trailerNumber ?? null,
      plateNumber: input.plateNumber ?? null,
      photoUrls: input.photoUrls ?? null,
      verified,
    } as any)
    .returning();
  return row;
}

// ── Release authorizations ──────────────────────────────────────────────────
export interface ReleaseRequestInput {
  assetId: number;
  requestedBy: number;
  selfieUrl?: string | null;
  lat: number;
  lng: number;
  tow?: {
    vehicleType?: string | null;
    plateNumber?: string | null;
    plateState?: string | null;
    photoUrls?: string[] | null;
  } | null;
  trailer?: {
    trailerType?: string | null;
    trailerNumber?: string | null;
    plateNumber?: string | null;
    photoUrls?: string[] | null;
  } | null;
  scannedVin?: string | null;
  vinPhotoUrl?: string | null;
}

export interface ReleaseRequestResult {
  authorization: ReleaseAuthorization;
  geofence: GeofenceResult;
  vin: VinVerification;
  tow: TowVehicleVerification | null;
  trailer: TrailerVerification | null;
}

/**
 * A carrier requests release authorization at the pickup point. Records the
 * live selfie + GPS, runs the geofence check, and creates the tow / trailer /
 * VIN verification rows linked to the new (pending) authorization. Approval is
 * routed to the asset owner / authorized contacts by the caller.
 */
export async function requestReleaseAuthorization(input: ReleaseRequestInput): Promise<ReleaseRequestResult> {
  const asset = await getProtectedAsset(input.assetId);
  if (!asset) throw new Error("Asset not found");

  // Mandatory tow vehicle + trailer verification (hard requirement). The carrier
  // must present a tow vehicle plate and a trailer type at the pickup point — no
  // release/loading can proceed without both. Fail fast here so we never create a
  // pending authorization that can never be approved.
  if (!input.tow || !input.tow.plateNumber || !input.tow.plateNumber.trim()) {
    throw new Error("Release blocked: tow vehicle verification (plate) is required");
  }
  if (!input.trailer || !input.trailer.trailerType || !input.trailer.trailerType.trim()) {
    throw new Error("Release blocked: trailer verification (type) is required");
  }

  const geofence = checkGeofence(asset, input.lat, input.lng);

  const [auth] = await db
    .insert(releaseAuthorizations)
    .values({
      assetId: input.assetId,
      requestedBy: input.requestedBy,
      status: "pending",
      selfieUrl: input.selfieUrl ?? null,
      lat: input.lat,
      lng: input.lng,
      geofenceVerified: geofence.verified,
      geofenceMeters: geofence.meters,
      expiresAt: new Date(Date.now() + RELEASE_AUTH_TTL_MS),
    } as any)
    .returning();

  const tow = input.tow
    ? await createTowVehicleVerification({
        assetId: input.assetId,
        authorizationId: auth.id,
        carrierId: input.requestedBy,
        ...input.tow,
      })
    : null;
  const trailer = input.trailer
    ? await createTrailerVerification({
        assetId: input.assetId,
        authorizationId: auth.id,
        carrierId: input.requestedBy,
        ...input.trailer,
      })
    : null;
  const vin = await createVinVerification({
    assetId: input.assetId,
    authorizationId: auth.id,
    expectedVin: asset.vin,
    scannedVin: input.scannedVin,
    photoUrl: input.vinPhotoUrl,
    verifiedBy: input.requestedBy,
  });

  // Link the verification rows back onto the authorization.
  const [updated] = await db
    .update(releaseAuthorizations)
    .set({
      towVerificationId: tow?.id ?? null,
      trailerVerificationId: trailer?.id ?? null,
      vinVerificationId: vin.id,
    } as any)
    .where(eq(releaseAuthorizations.id, auth.id))
    .returning();

  await appendCustodyEvent(input.assetId, "release_requested", {
    actorId: input.requestedBy,
    description: "Release authorization requested at pickup",
    metadata: {
      authorizationId: auth.id,
      geofenceVerified: geofence.verified,
      geofenceMeters: geofence.meters,
      vinStatus: vin.status,
      towVerificationId: tow?.id ?? null,
      trailerVerificationId: trailer?.id ?? null,
    },
    lat: input.lat,
    lng: input.lng,
    photoUrls: input.selfieUrl ? [input.selfieUrl] : null,
  });

  return { authorization: updated, geofence, vin, tow, trailer };
}

export async function getReleaseAuthorization(id: number): Promise<ReleaseAuthorization | undefined> {
  const [row] = await db.select().from(releaseAuthorizations).where(eq(releaseAuthorizations.id, id));
  return row;
}

export async function getReleaseAuthorizationsForAsset(assetId: number): Promise<ReleaseAuthorization[]> {
  return db
    .select()
    .from(releaseAuthorizations)
    .where(eq(releaseAuthorizations.assetId, assetId))
    .orderBy(desc(releaseAuthorizations.id));
}

export async function getVinVerification(id: number): Promise<VinVerification | undefined> {
  const [row] = await db.select().from(vinVerifications).where(eq(vinVerifications.id, id));
  return row;
}

function makeReleaseCode(): string {
  // 8 unambiguous chars (no O/0/I/1) — easy to read aloud at hand-off.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

// Release codes are never stored in plaintext. We persist only an HMAC-SHA256
// digest keyed by a server secret; redemption hashes the supplied code and
// compares digests with a timing-safe equality check.
// No hardcoded fallback: release codes are a custody-authorization primitive, so
// a predictable key in a misconfigured environment would undermine the whole
// guarantee. We require a strong env secret (RELEASE_CODE_SECRET, or the shared
// SESSION_SECRET which boot already enforces at ≥32 chars). If neither is set,
// every hash/redeem operation throws instead of silently using a known key.
function getReleaseCodeSecret(): string {
  const s = process.env.RELEASE_CODE_SECRET || process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "Release codes are disabled: set RELEASE_CODE_SECRET (or SESSION_SECRET) to a strong value (≥16 chars) before issuing or redeeming pickup codes.",
    );
  }
  return s;
}

export function hashReleaseCode(code: string): string {
  const normalized = (code ?? "").trim().toUpperCase();
  return crypto.createHmac("sha256", getReleaseCodeSecret()).update(normalized).digest("hex");
}

export function timingSafeHashEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Masked, non-redeemable representation kept for owner display only.
export function maskReleaseCode(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  if (c.length <= 2) return "••••••";
  return "••••••" + c.slice(-2);
}

// How many wrong-code attempts (within the window) lock redemption for an asset.
const RELEASE_CODE_MAX_FAILS = 5;
const RELEASE_CODE_FAIL_WINDOW_MS = 15 * 60 * 1000;

export interface ApproveResult {
  authorization: ReleaseAuthorization;
  code: ReleaseCode;
  // The plaintext pickup code, returned EXACTLY ONCE at mint time (never stored
  // and never recoverable afterwards). Null when re-approving an existing auth.
  plainCode: string | null;
}

/**
 * Approve a pending release authorization and mint a one-time pickup code.
 * HARD BLOCKS: a VIN mismatch or a failed geofence can never be approved.
 * Idempotent-ish: re-approving an already-approved auth returns its live code.
 */
export async function approveReleaseAuthorization(
  authId: number,
  approverId: number,
): Promise<ApproveResult> {
  const auth = await getReleaseAuthorization(authId);
  if (!auth) throw new Error("Authorization not found");

  if (auth.status === "approved") {
    const [existing] = await db
      .select()
      .from(releaseCodes)
      .where(and(eq(releaseCodes.authorizationId, authId), eq(releaseCodes.status, "active")))
      .orderBy(desc(releaseCodes.id));
    if (existing) return { authorization: auth, code: existing, plainCode: null };
  }
  if (auth.status !== "pending") {
    throw new Error(`Authorization is ${auth.status} and cannot be approved`);
  }
  if (auth.expiresAt && auth.expiresAt.getTime() < Date.now()) {
    await db.update(releaseAuthorizations).set({ status: "expired" } as any).where(eq(releaseAuthorizations.id, authId));
    throw new Error("Authorization request has expired");
  }
  if (!auth.geofenceVerified) {
    throw new Error("Release blocked: carrier was not within the pickup geofence");
  }
  // Mandatory VIN match (hard block). When the asset has a VIN on file the
  // authorization MUST carry a matched VIN verification — a mismatch OR a
  // missing/unmatched verification both block the release. This closes the gap
  // where a null vinVerificationId would otherwise skip the check entirely.
  const assetForVin = await getProtectedAsset(auth.assetId);
  const vin = auth.vinVerificationId ? await getVinVerification(auth.vinVerificationId) : undefined;
  if (vin && vin.status === "mismatch") {
    throw new Error("Release blocked: VIN mismatch");
  }
  if (normalizeVin(assetForVin?.vin) && (!vin || vin.status !== "matched")) {
    throw new Error("Release blocked: VIN has not been verified against the asset on file");
  }
  // Mandatory tow vehicle + trailer hard gate before a code is ever issued. The
  // authorization MUST carry a verified tow record AND a verified trailer record.
  const towRec = auth.towVerificationId ? await getTowVehicleVerification(auth.towVerificationId) : undefined;
  if (!towRec || !towRec.verified) {
    throw new Error("Release blocked: tow vehicle has not been verified");
  }
  const trailerRec = auth.trailerVerificationId ? await getTrailerVerification(auth.trailerVerificationId) : undefined;
  if (!trailerRec || !trailerRec.verified) {
    throw new Error("Release blocked: trailer has not been verified");
  }

  const [approved] = await db
    .update(releaseAuthorizations)
    .set({ status: "approved", approvedBy: approverId, approvedAt: new Date() } as any)
    .where(and(eq(releaseAuthorizations.id, authId), eq(releaseAuthorizations.status, "pending")))
    .returning();
  if (!approved) throw new Error("Authorization could not be approved (already acted on)");

  const plainCode = makeReleaseCode();
  const [code] = await db
    .insert(releaseCodes)
    .values({
      assetId: auth.assetId,
      authorizationId: authId,
      code: maskReleaseCode(plainCode),
      codeHash: hashReleaseCode(plainCode),
      status: "active",
      expiresAt: new Date(Date.now() + RELEASE_CODE_TTL_MS),
    } as any)
    .returning();

  await appendCustodyEvent(auth.assetId, "release_approved", {
    actorId: approverId,
    description: "Release authorization approved; one-time pickup code issued",
    metadata: { authorizationId: authId, codeId: code.id },
  });
  await appendCustodyEvent(auth.assetId, "code_issued", {
    actorId: approverId,
    description: "One-time pickup code issued to the asset owner",
    metadata: { authorizationId: authId, codeId: code.id, expiresAt: code.expiresAt },
  });

  return { authorization: approved, code, plainCode };
}

/** Deny a pending release authorization and revoke any code it produced. */
export async function denyReleaseAuthorization(
  authId: number,
  approverId: number,
  reason?: string | null,
): Promise<ReleaseAuthorization> {
  const auth = await getReleaseAuthorization(authId);
  if (!auth) throw new Error("Authorization not found");
  if (auth.status !== "pending" && auth.status !== "approved") {
    throw new Error(`Authorization is ${auth.status} and cannot be denied`);
  }
  const [denied] = await db
    .update(releaseAuthorizations)
    .set({ status: "denied", approvedBy: approverId, deniedReason: reason ?? null } as any)
    .where(eq(releaseAuthorizations.id, authId))
    .returning();
  await db
    .update(releaseCodes)
    .set({ status: "revoked" } as any)
    .where(and(eq(releaseCodes.authorizationId, authId), eq(releaseCodes.status, "active")));
  await appendCustodyEvent(auth.assetId, "release_denied", {
    actorId: approverId,
    description: reason ? `Release denied: ${reason}` : "Release denied",
    metadata: { authorizationId: authId },
  });
  return denied;
}

export async function getReleaseCodesForAsset(assetId: number): Promise<ReleaseCode[]> {
  return db
    .select()
    .from(releaseCodes)
    .where(eq(releaseCodes.assetId, assetId))
    .orderBy(desc(releaseCodes.id));
}

/**
 * Strip the secret verifier (`codeHash`) before a release code ever crosses the
 * API boundary. Clients only ever see the masked display value plus safe
 * metadata — never the HMAC digest used to validate a presented code.
 */
export function redactReleaseCode(code: ReleaseCode): Omit<ReleaseCode, "codeHash"> {
  const { codeHash, ...safe } = code as ReleaseCode & { codeHash?: string | null };
  return safe;
}

export interface RedeemResult {
  ok: boolean;
  alreadyRedeemed?: boolean;
  code: ReleaseCode;
  authorization?: ReleaseAuthorization;
  geofence: GeofenceResult;
}

/**
 * Validate and redeem a one-time pickup code at hand-off. This is the final
 * gate and re-checks every guard server-side: the code must be active and
 * unexpired, the redeemer must be inside the pickup geofence, and (if the asset
 * has a VIN on file) the authorization's VIN must have matched. On success the
 * code is consumed exactly once (transaction + advisory lock), the asset moves
 * to "in_transit", and the immutable "loaded" custody event is appended.
 */
export async function redeemReleaseCode(input: {
  assetId: number;
  code: string;
  redeemedBy: number;
  lat: number;
  lng: number;
}): Promise<RedeemResult> {
  const asset = await getProtectedAsset(input.assetId);
  if (!asset) throw new Error("Asset not found");

  const supplied = (input.code ?? "").trim().toUpperCase();
  if (!supplied) throw new Error("Pickup code is required");

  // Rate-limit: too many recent wrong-code attempts lock redemption for this
  // asset, blunting brute-force / shoulder-surf guessing. Failures are recorded
  // as immutable custody events, which also drive the fraud-flag escalation.
  const recentFails = (await getCustodyTimeline(input.assetId)).filter(
    (e) =>
      e.eventType === "code_failed" &&
      e.createdAt != null &&
      Date.now() - new Date(e.createdAt as any).getTime() < RELEASE_CODE_FAIL_WINDOW_MS,
  ).length;
  if (recentFails >= RELEASE_CODE_MAX_FAILS) {
    const err: any = new Error("Too many incorrect pickup-code attempts. Redemption is locked; please try again later.");
    err.code = "RATE_LIMITED";
    throw err;
  }

  // Geofence is a hard lock at hand-off.
  const geofence = checkGeofence(asset, input.lat, input.lng);
  if (geofence.unconfigured) {
    throw new Error("Release blocked: pickup geofence is not configured for this asset");
  }
  if (!geofence.verified) {
    throw new Error(
      `Release blocked: you are ${geofence.meters}m from the pickup point (must be within ${geofence.radiusMeters}m)`,
    );
  }

  const suppliedHash = hashReleaseCode(supplied);
  let codeNotFound = false;
  let driverMismatch = false;
  let consumedCodeId: number | null = null;
  let alreadyUsedCode: ReleaseCode | undefined;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize redemptions per-asset so a code can never be consumed twice.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [747474, input.assetId]);

    // Never query by plaintext. Pull this asset's codes and match the HMAC digest
    // with a timing-safe comparison so the lookup leaks no timing signal.
    const codeRes = await client.query(
      "SELECT * FROM release_codes WHERE asset_id = $1 ORDER BY id DESC",
      [input.assetId],
    );
    const codeRow = codeRes.rows.find((r: any) => timingSafeHashEqual(r.code_hash, suppliedHash));
    if (!codeRow) {
      await client.query("ROLLBACK");
      codeNotFound = true;
    } else if (codeRow.status === "used") {
      await client.query("COMMIT");
      alreadyUsedCode = (await db.select().from(releaseCodes).where(eq(releaseCodes.id, codeRow.id)))[0];
    } else if (codeRow.status !== "active") {
      await client.query("ROLLBACK");
      throw new Error(`Pickup code is ${codeRow.status}`);
    } else if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
      await client.query("UPDATE release_codes SET status = 'expired' WHERE id = $1", [codeRow.id]);
      await client.query("COMMIT");
      throw new Error("Pickup code has expired");
    } else {
      // Re-assert the VIN + tow/trailer hard blocks against the linked
      // authorization at the final hand-off (defense in depth).
      if (codeRow.authorization_id) {
        const vinRes = await client.query(
          "SELECT status FROM vin_verifications WHERE authorization_id = $1 ORDER BY id DESC LIMIT 1",
          [codeRow.authorization_id],
        );
        if (vinRes.rows[0]?.status === "mismatch") {
          await client.query("ROLLBACK");
          throw new Error("Release blocked: VIN mismatch");
        }
        const towRes = await client.query(
          "SELECT verified FROM tow_vehicle_verifications WHERE authorization_id = $1 ORDER BY id DESC LIMIT 1",
          [codeRow.authorization_id],
        );
        if (!towRes.rows[0]?.verified) {
          await client.query("ROLLBACK");
          throw new Error("Release blocked: tow vehicle has not been verified");
        }
        const trailerRes = await client.query(
          "SELECT verified FROM trailer_verifications WHERE authorization_id = $1 ORDER BY id DESC LIMIT 1",
          [codeRow.authorization_id],
        );
        if (!trailerRes.rows[0]?.verified) {
          await client.query("ROLLBACK");
          throw new Error("Release blocked: trailer has not been verified");
        }
      }

      // Bind redemption to the exact driver the owner approved. A valid code in
      // the wrong hands — including a different carrier-side user on the same
      // asset — must NOT release. Identity is checked server-side against the
      // authorization that minted the code, never trusted from the request.
      const authRes = codeRow.authorization_id
        ? await client.query(
            "SELECT requested_by FROM release_authorizations WHERE id = $1",
            [codeRow.authorization_id],
          )
        : { rows: [] as any[] };
      const requestedBy = authRes.rows[0]?.requested_by;
      if (requestedBy == null || Number(requestedBy) !== Number(input.redeemedBy)) {
        await client.query("ROLLBACK");
        driverMismatch = true;
      } else {
        const consumed = await client.query(
          "UPDATE release_codes SET status = 'used', used_at = NOW(), used_by = $2 WHERE id = $1 AND status = 'active' RETURNING *",
          [codeRow.id, input.redeemedBy],
        );
        if (!consumed.rows.length) {
          await client.query("ROLLBACK");
          throw new Error("Pickup code could not be redeemed (already used)");
        }
        consumedCodeId = codeRow.id;
        await client.query("COMMIT");
      }
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // Wrong code: record the failed attempt immutably (drives fraud escalation).
  if (codeNotFound) {
    await appendCustodyEvent(input.assetId, "code_failed", {
      actorId: input.redeemedBy,
      description: "Incorrect pickup code presented at hand-off",
      metadata: { reason: "invalid_code" },
      lat: input.lat,
      lng: input.lng,
    });
    throw new Error("Invalid pickup code");
  }

  // Right code, wrong person: the presenter is not the approved driver. Record
  // it immutably (feeds fraud escalation) and refuse the release.
  if (driverMismatch) {
    await appendCustodyEvent(input.assetId, "code_failed", {
      actorId: input.redeemedBy,
      description: "Pickup code presented by a user other than the approved driver",
      metadata: { reason: "driver_mismatch" },
      lat: input.lat,
      lng: input.lng,
    });
    const err: any = new Error("Release blocked: this pickup code is bound to a different driver");
    err.code = "DRIVER_MISMATCH";
    throw err;
  }
  if (alreadyUsedCode) {
    return { ok: false, alreadyRedeemed: true, code: alreadyUsedCode, geofence };
  }

  // Outside the lock: flip asset state and append the immutable custody trail.
  await updateAsset(input.assetId, { status: "in_transit" } as any);
  const [code] = await db.select().from(releaseCodes).where(
    eq(releaseCodes.id, consumedCodeId as number),
  );
  const authorization = code?.authorizationId ? await getReleaseAuthorization(code.authorizationId) : undefined;

  await appendCustodyEvent(input.assetId, "code_redeemed", {
    actorId: input.redeemedBy,
    description: "One-time pickup code validated at hand-off",
    metadata: { codeId: code?.id, authorizationId: code?.authorizationId ?? null, geofenceMeters: geofence.meters },
    lat: input.lat,
    lng: input.lng,
  });
  await appendCustodyEvent(input.assetId, "loaded", {
    actorId: input.redeemedBy,
    description: "Asset loaded and released to carrier",
    metadata: { authorizationId: code?.authorizationId ?? null, geofenceMeters: geofence.meters },
    lat: input.lat,
    lng: input.lng,
  });

  return { ok: true, code, authorization, geofence };
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4/5 — Transport lifecycle, master transport, incidents/storage/freeze,
// fraud-risk flags, witness dispatch + 80/20 payout, dashboard queries, and the
// Transport Passport aggregation. Everything appends an immutable custody event;
// nothing is ever deleted. Role-on-asset is enforced at the route layer.
// ════════════════════════════════════════════════════════════════════════════

export const WITNESS_PAYOUT_RATE = 0.8; // witness keeps 80%, GUBER keeps 20%

// ── Dashboard role queries ──────────────────────────────────────────────────
/** Assets where the user currently holds ANY of the given active roles. */
export async function getAssetsForUserByRoles(
  userId: number,
  roles: AssetRoleName[],
): Promise<ProtectedAsset[]> {
  const roleRows = await db
    .select()
    .from(assetRoles)
    .where(and(eq(assetRoles.userId, userId), eq(assetRoles.status, "active")));
  const ids = Array.from(
    new Set(
      roleRows.filter((r) => roles.includes(r.role as AssetRoleName)).map((r) => r.assetId),
    ),
  );
  if (!ids.length) return [];
  return db
    .select()
    .from(protectedAssets)
    .where(inArray(protectedAssets.id, ids))
    .orderBy(desc(protectedAssets.id));
}

// ── Per-asset verification / event reads (for dashboards + passport) ─────────
export async function getTowVerificationsForAsset(assetId: number): Promise<TowVehicleVerification[]> {
  return db.select().from(towVehicleVerifications).where(eq(towVehicleVerifications.assetId, assetId)).orderBy(desc(towVehicleVerifications.id));
}
export async function getTrailerVerificationsForAsset(assetId: number): Promise<TrailerVerification[]> {
  return db.select().from(trailerVerifications).where(eq(trailerVerifications.assetId, assetId)).orderBy(desc(trailerVerifications.id));
}
export async function getTowVehicleVerification(id: number): Promise<TowVehicleVerification | undefined> {
  const [row] = await db.select().from(towVehicleVerifications).where(eq(towVehicleVerifications.id, id));
  return row;
}
export async function getTrailerVerification(id: number): Promise<TrailerVerification | undefined> {
  const [row] = await db.select().from(trailerVerifications).where(eq(trailerVerifications.id, id));
  return row;
}
export async function getVinVerificationsForAsset(assetId: number): Promise<VinVerification[]> {
  return db.select().from(vinVerifications).where(eq(vinVerifications.assetId, assetId)).orderBy(desc(vinVerifications.id));
}

// ── Master transport events ─────────────────────────────────────────────────
export async function createMasterTransportEvent(input: {
  assetId: number;
  senderId: number;
  carrierId?: number | null;
  originAddress?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  destAddress?: string | null;
  destLat?: number | null;
  destLng?: number | null;
}): Promise<MasterTransportEvent> {
  const [row] = await db
    .insert(masterTransportEvents)
    .values({
      assetId: input.assetId,
      senderId: input.senderId,
      carrierId: input.carrierId ?? null,
      originAddress: input.originAddress ?? null,
      originLat: input.originLat ?? null,
      originLng: input.originLng ?? null,
      destAddress: input.destAddress ?? null,
      destLat: input.destLat ?? null,
      destLng: input.destLng ?? null,
      status: "created",
    } as any)
    .returning();
  return row;
}

export async function getMasterForAsset(assetId: number): Promise<MasterTransportEvent | undefined> {
  const [row] = await db
    .select()
    .from(masterTransportEvents)
    .where(eq(masterTransportEvents.assetId, assetId))
    .orderBy(desc(masterTransportEvents.id));
  return row;
}

export async function getMasterTransportEvent(id: number): Promise<MasterTransportEvent | undefined> {
  const [row] = await db.select().from(masterTransportEvents).where(eq(masterTransportEvents.id, id));
  return row;
}

/** Assets attached to a master transport (multi-asset hauls share a carrier). */
export async function getAssetsForMaster(masterId: number): Promise<number[]> {
  const master = await getMasterTransportEvent(masterId);
  if (!master?.carrierId) return master ? [master.assetId] : [];
  const rows = await db
    .select({ assetId: masterTransportEvents.assetId })
    .from(masterTransportEvents)
    .where(eq(masterTransportEvents.carrierId, master.carrierId));
  return Array.from(new Set(rows.map((r) => r.assetId)));
}

const MASTER_STATUS_STAMP: Record<string, string> = {
  loaded: "loadedAt",
  in_transit: "departedAt",
  arrived: "arrivedAt",
  delivered: "deliveredAt",
};

/**
 * Update a master transport's status and PROPAGATE to every asset on the haul
 * (per the spec: breakdown/delay/status updates fan out to all attached assets).
 * Each affected asset gets its own immutable custody event.
 */
export async function updateMasterTransportStatus(
  masterId: number,
  status: string,
  actorId: number,
  opts: { description?: string | null; lat?: number | null; lng?: number | null; propagate?: boolean } = {},
): Promise<{ master: MasterTransportEvent; affectedAssetIds: number[] }> {
  const stamp = MASTER_STATUS_STAMP[status];
  const set: Record<string, unknown> = { status, updatedAt: new Date() };
  if (stamp) set[stamp] = new Date();
  const [master] = await db
    .update(masterTransportEvents)
    .set(set as any)
    .where(eq(masterTransportEvents.id, masterId))
    .returning();

  const affected = opts.propagate === false ? [master.assetId] : await getAssetsForMaster(masterId);
  for (const aid of affected) {
    await appendCustodyEvent(aid, `master_${status}`, {
      actorId,
      description: opts.description ?? `Master transport status: ${status.replace(/_/g, " ")}`,
      metadata: { masterEventId: masterId, status, propagated: aid !== master.assetId },
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
    });
  }
  return { master, affectedAssetIds: affected };
}

// ── Carrier transport lifecycle ─────────────────────────────────────────────
// Maps each carrier "status button" to a custody event and, where appropriate,
// a transport issue or an incident. The lifecycle is append-only.
const LIFECYCLE_ISSUE_TYPES = new Set([
  "delayed",
  "weather_delay",
  "dot_inspection",
  "hos_delay",
  "mechanical_breakdown",
]);
const LIFECYCLE_INCIDENT: Record<string, { incidentType: string; severity: string }> = {
  accident: { incidentType: "accident", severity: "high" },
  fire: { incidentType: "fire", severity: "critical" },
  theft_attempt: { incidentType: "theft", severity: "critical" },
};

export interface LifecycleResult {
  eventType: string;
  issue?: TransportIssue;
  incident?: Incident;
}

/**
 * Record a carrier lifecycle update for an asset (running_normally, delayed,
 * mechanical_breakdown, accident, fire, weather_delay, dot_inspection, hos_delay,
 * arrived, …). Writes the custody event and, for incident/issue statuses, the
 * matching transport_issue / incident row. Blocked when the asset is frozen.
 */
export async function recordLifecycleEvent(input: {
  assetId: number;
  actorId: number;
  status: string;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrls?: string[] | null;
}): Promise<LifecycleResult> {
  const asset = await getProtectedAsset(input.assetId);
  if (!asset) throw new Error("Asset not found");
  if (asset.frozenAt) throw new Error("Asset is frozen — lifecycle updates are blocked until it is resolved");

  const status = input.status;
  let issue: TransportIssue | undefined;
  let incident: Incident | undefined;

  if (LIFECYCLE_INCIDENT[status]) {
    const cfg = LIFECYCLE_INCIDENT[status];
    incident = await createIncident({
      assetId: input.assetId,
      reportedBy: input.actorId,
      incidentType: cfg.incidentType,
      severity: cfg.severity,
      description: input.description ?? null,
      photoUrls: input.photoUrls ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      _skipCustody: true,
    });
  } else if (LIFECYCLE_ISSUE_TYPES.has(status)) {
    issue = await createTransportIssue({
      assetId: input.assetId,
      reportedBy: input.actorId,
      issueType: status,
      description: input.description ?? null,
      _skipCustody: true,
    });
  }

  await appendCustodyEvent(input.assetId, `lifecycle_${status}`, {
    actorId: input.actorId,
    description: input.description ?? `Transport update: ${status.replace(/_/g, " ")}`,
    metadata: { status, issueId: issue?.id ?? null, incidentId: incident?.id ?? null },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });

  return { eventType: `lifecycle_${status}`, issue, incident };
}

// ── Transport issues ────────────────────────────────────────────────────────
export async function createTransportIssue(input: {
  assetId: number;
  masterEventId?: number | null;
  reportedBy: number;
  issueType: string;
  description?: string | null;
  _skipCustody?: boolean;
}): Promise<TransportIssue> {
  const [row] = await db
    .insert(transportIssues)
    .values({
      assetId: input.assetId,
      masterEventId: input.masterEventId ?? null,
      reportedBy: input.reportedBy,
      issueType: input.issueType,
      description: input.description ?? null,
      status: "open",
    } as any)
    .returning();
  if (!input._skipCustody) {
    await appendCustodyEvent(input.assetId, "issue_reported", {
      actorId: input.reportedBy,
      description: `Issue reported: ${input.issueType.replace(/_/g, " ")}`,
      metadata: { issueId: row.id, issueType: input.issueType },
    });
  }
  return row;
}

export async function getIssuesForAsset(assetId: number): Promise<TransportIssue[]> {
  return db.select().from(transportIssues).where(eq(transportIssues.assetId, assetId)).orderBy(desc(transportIssues.id));
}

export async function resolveTransportIssue(issueId: number, actorId: number, note?: string | null): Promise<TransportIssue> {
  const [row] = await db
    .update(transportIssues)
    .set({ status: "resolved", resolvedAt: new Date() } as any)
    .where(eq(transportIssues.id, issueId))
    .returning();
  if (row) {
    await appendCustodyEvent(row.assetId, "issue_resolved", {
      actorId,
      description: note ? `Issue resolved: ${note}` : "Issue resolved",
      metadata: { issueId },
    });
  }
  return row;
}

// ── Incidents ───────────────────────────────────────────────────────────────
export async function createIncident(input: {
  assetId: number;
  reportedBy: number;
  incidentType: string;
  description?: string | null;
  photoUrls?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  severity?: string | null;
  _skipCustody?: boolean;
}): Promise<Incident> {
  const [row] = await db
    .insert(incidents)
    .values({
      assetId: input.assetId,
      reportedBy: input.reportedBy,
      incidentType: input.incidentType,
      description: input.description ?? null,
      photoUrls: input.photoUrls ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      severity: input.severity ?? "medium",
      status: "open",
      protectionClaimStatus: "none",
    } as any)
    .returning();
  await appendCustodyEvent(input.assetId, "incident_reported", {
    actorId: input.reportedBy,
    description: `Incident: ${input.incidentType} (${row.severity})`,
    metadata: { incidentId: row.id, incidentType: input.incidentType, severity: row.severity },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });
  void input._skipCustody;
  return row;
}

export async function getIncidentsForAsset(assetId: number): Promise<Incident[]> {
  return db.select().from(incidents).where(eq(incidents.assetId, assetId)).orderBy(desc(incidents.id));
}

export async function updateIncidentStatus(
  incidentId: number,
  actorId: number,
  patch: { status?: string; protectionClaimStatus?: string; note?: string | null },
): Promise<Incident> {
  const set: Record<string, unknown> = {};
  if (patch.status) set.status = patch.status;
  if (patch.protectionClaimStatus) set.protectionClaimStatus = patch.protectionClaimStatus;
  const [row] = await db.update(incidents).set(set as any).where(eq(incidents.id, incidentId)).returning();
  if (row) {
    await appendCustodyEvent(row.assetId, "incident_updated", {
      actorId,
      description: patch.note ? `Incident update: ${patch.note}` : `Incident status: ${row.status} / claim: ${row.protectionClaimStatus}`,
      metadata: { incidentId, status: row.status, protectionClaimStatus: row.protectionClaimStatus },
    });
  }
  return row;
}

// ── Storage events ──────────────────────────────────────────────────────────
export async function createStorageEvent(input: {
  assetId: number;
  actorId: number;
  eventType: string; // stored | retrieved | transferred
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrls?: string[] | null;
}): Promise<StorageEvent> {
  const [row] = await db
    .insert(storageEvents)
    .values({
      assetId: input.assetId,
      eventType: input.eventType,
      locationName: input.locationName ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      photoUrls: input.photoUrls ?? null,
      actorId: input.actorId,
    } as any)
    .returning();
  await appendCustodyEvent(input.assetId, `storage_${input.eventType}`, {
    actorId: input.actorId,
    description: input.locationName ? `Storage ${input.eventType} @ ${input.locationName}` : `Storage ${input.eventType}`,
    metadata: { storageEventId: row.id, eventType: input.eventType, locationName: input.locationName ?? null },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });
  return row;
}

export async function getStorageEventsForAsset(assetId: number): Promise<StorageEvent[]> {
  return db.select().from(storageEvents).where(eq(storageEvents.assetId, assetId)).orderBy(desc(storageEvents.id));
}

// ── Driver / tow vehicle / trailer changes ──────────────────────────────────
/** Record a new tow vehicle mid-transport (a change → new verification row). */
export async function changeTowVehicle(input: {
  assetId: number;
  carrierId: number;
  vehicleType?: string | null;
  plateNumber?: string | null;
  plateState?: string | null;
  photoUrls?: string[] | null;
}): Promise<TowVehicleVerification> {
  const row = await createTowVehicleVerification(input);
  await appendCustodyEvent(input.assetId, "tow_vehicle_changed", {
    actorId: input.carrierId,
    description: "Tow vehicle changed and re-verified",
    metadata: { towVerificationId: row.id, plateNumber: input.plateNumber ?? null },
    photoUrls: input.photoUrls ?? null,
  });
  return row;
}

export async function changeTrailer(input: {
  assetId: number;
  carrierId: number;
  trailerType?: string | null;
  trailerNumber?: string | null;
  plateNumber?: string | null;
  photoUrls?: string[] | null;
}): Promise<TrailerVerification> {
  const row = await createTrailerVerification(input);
  await appendCustodyEvent(input.assetId, "trailer_changed", {
    actorId: input.carrierId,
    description: "Trailer changed and re-verified",
    metadata: { trailerVerificationId: row.id, trailerType: input.trailerType ?? null },
    photoUrls: input.photoUrls ?? null,
  });
  return row;
}

/** Assign a new driver to the asset (driver change) with a fresh selfie + GPS. */
export async function changeDriver(input: {
  assetId: number;
  newDriverId: number;
  actorId: number;
  selfieUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  await assignRole(input.assetId, input.newDriverId, "driver");
  await appendCustodyEvent(input.assetId, "driver_changed", {
    actorId: input.actorId,
    description: "Driver changed and re-verified",
    metadata: { newDriverId: input.newDriverId },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.selfieUrl ? [input.selfieUrl] : null,
  });
}

/** Emergency custody transfer to a replacement carrier (append-only). */
export async function emergencyCustodyTransfer(input: {
  assetId: number;
  fromCarrierId: number;
  toCarrierId: number;
  reason?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrls?: string[] | null;
}): Promise<void> {
  await assignRole(input.assetId, input.toCarrierId, "carrier");
  await assignRole(input.assetId, input.toCarrierId, "driver");
  await appendCustodyEvent(input.assetId, "custody_transferred", {
    actorId: input.fromCarrierId,
    description: input.reason ? `Emergency custody transfer: ${input.reason}` : "Emergency custody transfer",
    metadata: { fromCarrierId: input.fromCarrierId, toCarrierId: input.toCarrierId },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });
}

// ── Delivery ────────────────────────────────────────────────────────────────
export async function recordDelivery(input: {
  assetId: number;
  actorId: number;
  receiverName?: string | null;
  odometer?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrls?: string[] | null;
}): Promise<void> {
  const asset = await getProtectedAsset(input.assetId);
  if (!asset) throw new Error("Asset not found");
  if (asset.frozenAt) throw new Error("Asset is frozen — delivery is blocked until it is resolved");
  await updateAsset(input.assetId, { status: "delivered" } as any);
  await appendCustodyEvent(input.assetId, "delivered", {
    actorId: input.actorId,
    description: input.receiverName ? `Delivered and verified — received by ${input.receiverName}` : "Delivered and verified",
    metadata: { receiverName: input.receiverName ?? null, odometer: input.odometer ?? null },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });
}

// ── Emergency freeze / unfreeze (sender / owner / admin) ─────────────────────
export async function freezeAsset(assetId: number, actorId: number, reason: string): Promise<void> {
  await updateAsset(assetId, { frozenAt: new Date(), frozenReason: reason } as any);
  await appendCustodyEvent(assetId, "asset_frozen", {
    actorId,
    description: `Asset frozen: ${reason}`,
    metadata: { reason },
  });
}

export async function unfreezeAsset(assetId: number, actorId: number, note?: string | null): Promise<void> {
  await updateAsset(assetId, { frozenAt: null, frozenReason: null } as any);
  await appendCustodyEvent(assetId, "asset_unfrozen", {
    actorId,
    description: note ? `Asset unfrozen: ${note}` : "Asset unfrozen",
    metadata: { note: note ?? null },
  });
}

export async function reportFraudConcern(assetId: number, actorId: number, concern: string): Promise<void> {
  await appendCustodyEvent(assetId, "fraud_reported", {
    actorId,
    description: `Fraud concern reported: ${concern}`,
    metadata: { concern },
  });
}

// ── Automatic fraud-risk flags (derived, read-only) ─────────────────────────
export interface FraudFlag {
  code: string;
  label: string;
  severity: "warning" | "critical";
}

/**
 * Derive fraud-risk flags from the immutable custody trail + verifications.
 * Pure read — never mutates. Surfaced in the sender + admin dashboards.
 */
export async function computeFraudFlags(assetId: number): Promise<FraudFlag[]> {
  const [timeline, vins, asset] = await Promise.all([
    getCustodyTimeline(assetId),
    getVinVerificationsForAsset(assetId),
    getProtectedAsset(assetId),
  ]);
  const flags: FraudFlag[] = [];
  const count = (t: string) => timeline.filter((e) => e.eventType === t).length;

  if (count("driver_changed") >= 2) flags.push({ code: "multiple_driver_changes", label: "Multiple driver changes", severity: "warning" });
  if (count("tow_vehicle_changed") >= 2) flags.push({ code: "multiple_tow_changes", label: "Multiple tow vehicle changes", severity: "warning" });
  if (count("trailer_changed") >= 2) flags.push({ code: "multiple_trailer_changes", label: "Multiple trailer changes", severity: "warning" });
  if (count("custody_transferred") >= 2) flags.push({ code: "excessive_custody_transfers", label: "Excessive custody transfers", severity: "critical" });
  if (vins.some((v) => v.status === "mismatch")) flags.push({ code: "vin_mismatch", label: "VIN mismatch on record", severity: "critical" });

  const geofenceFails = timeline.filter(
    (e) => e.eventType === "release_requested" && (e.metadata as any)?.geofenceVerified === false,
  ).length;
  if (geofenceFails >= 1) flags.push({ code: "outside_geofence", label: "Release requested outside pickup geofence", severity: "warning" });

  const codeFails = timeline.filter((e) => e.eventType === "code_failed").length;
  if (codeFails >= 3) flags.push({ code: "repeated_code_failures", label: "Repeated release-code failures", severity: "critical" });

  if (count("storage_stored") >= 1 && !timeline.some((e) => e.eventType === "release_approved")) {
    flags.push({ code: "storage_without_approval", label: "Stored without an approved release", severity: "warning" });
  }
  if (timeline.some((e) => e.eventType === "fraud_reported")) {
    flags.push({ code: "manual_fraud_report", label: "Manual fraud concern on file", severity: "critical" });
  }
  if (asset?.frozenAt) flags.push({ code: "frozen", label: "Asset is currently frozen", severity: "critical" });

  return flags;
}

// ── Witness dispatch + 80/20 payout ─────────────────────────────────────────
/** Create a witness assignment (open for a V&I user to accept). */
export async function requestWitness(input: {
  assetId: number;
  requestedBy: number;
  reportType: string; // loading | release | delivery
  feeCents: number;
  jobId?: number | null;
}): Promise<WitnessAssignment> {
  const payoutAmount = Math.round(input.feeCents * WITNESS_PAYOUT_RATE) / 100;
  const [row] = await db
    .insert(witnessAssignments)
    .values({
      assetId: input.assetId,
      witnessUserId: null,
      jobId: input.jobId ?? null,
      status: "open",
      payoutAmount,
      payoutStatus: "pending",
    } as any)
    .returning();
  await appendCustodyEvent(input.assetId, "witness_requested", {
    actorId: input.requestedBy,
    description: `Witness requested: ${input.reportType}`,
    metadata: { assignmentId: row.id, reportType: input.reportType, payoutAmount },
  });
  return row;
}

export async function getWitnessAssignment(id: number): Promise<WitnessAssignment | undefined> {
  const [row] = await db.select().from(witnessAssignments).where(eq(witnessAssignments.id, id));
  return row;
}

export async function getWitnessAssignmentsForAsset(assetId: number): Promise<WitnessAssignment[]> {
  return db.select().from(witnessAssignments).where(eq(witnessAssignments.assetId, assetId)).orderBy(desc(witnessAssignments.id));
}

/** Open (unclaimed) assignments + those already assigned to this witness. */
export async function getWitnessAssignmentsForUser(userId: number): Promise<WitnessAssignment[]> {
  return db
    .select()
    .from(witnessAssignments)
    .where(or(eq(witnessAssignments.status, "open"), eq(witnessAssignments.witnessUserId, userId)))
    .orderBy(desc(witnessAssignments.id));
}

/** A V&I user accepts an open witness assignment (atomic claim). */
export async function acceptWitnessAssignment(assignmentId: number, witnessUserId: number): Promise<WitnessAssignment> {
  const [row] = await db
    .update(witnessAssignments)
    .set({ witnessUserId, status: "accepted" } as any)
    .where(and(eq(witnessAssignments.id, assignmentId), eq(witnessAssignments.status, "open")))
    .returning();
  if (!row) throw new Error("Assignment is no longer available");
  await appendCustodyEvent(row.assetId, "witness_accepted", {
    actorId: witnessUserId,
    description: "Witness accepted the assignment",
    metadata: { assignmentId },
  });
  return row;
}

export interface WitnessReportResult {
  report: WitnessReport;
  payout: { status: string; transferId?: string | null; reason?: string };
}

/**
 * File a Witness Verification Report and trigger the 80/20 payout. The witness
 * must own the (accepted) assignment. Payout uses Stripe Connect transfers to
 * the witness's connected account; if they have none, payout stays "available"
 * for later collection (mirrors the worker-payout pattern).
 */
export async function fileWitnessReport(input: {
  assignmentId: number;
  witnessUserId: number;
  reportType: string;
  notes?: string | null;
  photoUrls?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  doTransfer: (witnessAccountId: string, amountCents: number, assignmentId: number) => Promise<string>;
}): Promise<WitnessReportResult> {
  const assignment = await getWitnessAssignment(input.assignmentId);
  if (!assignment) throw new Error("Assignment not found");
  if (assignment.witnessUserId !== input.witnessUserId) throw new Error("You are not the assigned witness");

  // Atomic single-report guard: only an "accepted" assignment may be completed,
  // and only once. This wins the race so a witness cannot file two reports (and
  // two payout attempts) for the same assignment.
  const [claimed] = await db
    .update(witnessAssignments)
    .set({ status: "completed" } as any)
    .where(and(eq(witnessAssignments.id, input.assignmentId), eq(witnessAssignments.status, "accepted")))
    .returning();
  if (!claimed) throw new Error("This assignment has already been reported or is not in an acceptable state");

  const [report] = await db
    .insert(witnessReports)
    .values({
      assignmentId: input.assignmentId,
      assetId: assignment.assetId,
      witnessUserId: input.witnessUserId,
      reportType: input.reportType,
      notes: input.notes ?? null,
      photoUrls: input.photoUrls ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    } as any)
    .returning();

  await appendCustodyEvent(assignment.assetId, "witness_report_filed", {
    actorId: input.witnessUserId,
    description: `Witness verification report filed: ${input.reportType}`,
    metadata: { assignmentId: input.assignmentId, reportId: report.id, reportType: input.reportType },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrls: input.photoUrls ?? null,
  });

  // 80/20 payout via the caller-provided Stripe transfer (idempotent guard here).
  let payout: WitnessReportResult["payout"] = { status: assignment.payoutStatus };
  if (assignment.payoutStatus !== "sent") {
    const [witness] = await db.select({ acct: users.stripeAccountId }).from(users).where(eq(users.id, input.witnessUserId));
    const amountCents = Math.round((assignment.payoutAmount ?? 0) * 100);
    if (witness?.acct && amountCents > 0) {
      try {
        const transferId = await input.doTransfer(witness.acct, amountCents, input.assignmentId);
        await db
          .update(witnessAssignments)
          .set({ payoutStatus: "sent", stripeTransferId: transferId } as any)
          .where(eq(witnessAssignments.id, input.assignmentId));
        payout = { status: "sent", transferId };
        await appendCustodyEvent(assignment.assetId, "witness_paid", {
          actorId: input.witnessUserId,
          description: `Witness payout sent ($${(amountCents / 100).toFixed(2)})`,
          metadata: { assignmentId: input.assignmentId, transferId, amountCents },
        });
      } catch (e: any) {
        await db.update(witnessAssignments).set({ payoutStatus: "available" } as any).where(eq(witnessAssignments.id, input.assignmentId));
        payout = { status: "available", reason: e?.message ?? "transfer_failed" };
      }
    } else {
      await db.update(witnessAssignments).set({ payoutStatus: "available" } as any).where(eq(witnessAssignments.id, input.assignmentId));
      payout = { status: "available", reason: witness?.acct ? "zero_amount" : "no_connected_account" };
    }
  }

  return { report, payout };
}

export async function getWitnessReportsForAsset(assetId: number): Promise<WitnessReport[]> {
  return db.select().from(witnessReports).where(eq(witnessReports.assetId, assetId)).orderBy(desc(witnessReports.id));
}

// ── Admin views ─────────────────────────────────────────────────────────────
export async function listAllAssets(filter?: "frozen" | "incidents" | "high_value"): Promise<ProtectedAsset[]> {
  const rows = await db.select().from(protectedAssets).orderBy(desc(protectedAssets.id));
  if (filter === "frozen") return rows.filter((a) => a.frozenAt != null);
  if (filter === "high_value") return rows.filter((a) => (a.estimatedValue ?? 0) >= 50000);
  if (filter === "incidents") {
    const inc = await db.select({ assetId: incidents.assetId }).from(incidents);
    const ids = new Set(inc.map((i) => i.assetId));
    return rows.filter((a) => ids.has(a.id));
  }
  return rows;
}

/** Admin "correction": append-only note onto the custody trail. Never deletes. */
export async function appendAdminNote(assetId: number, adminId: number, note: string): Promise<void> {
  await appendCustodyEvent(assetId, "admin_note", {
    actorId: adminId,
    description: note,
    metadata: { admin: true },
  });
}

// ── Transport Passport aggregation ──────────────────────────────────────────
export interface TransportPassport {
  asset: ProtectedAsset;
  roles: AssetRole[];
  master: MasterTransportEvent | undefined;
  timeline: Awaited<ReturnType<typeof getCustodyTimeline>>;
  vinVerifications: VinVerification[];
  towVerifications: TowVehicleVerification[];
  trailerVerifications: TrailerVerification[];
  releaseAuthorizations: ReleaseAuthorization[];
  issues: TransportIssue[];
  incidents: Incident[];
  storageEvents: StorageEvent[];
  witnessReports: WitnessReport[];
  fraudFlags: FraudFlag[];
}

export async function getTransportPassport(assetId: number): Promise<TransportPassport | null> {
  const asset = await getProtectedAsset(assetId);
  if (!asset) return null;
  const [
    roles,
    master,
    timeline,
    vinVerifications,
    towVerifications,
    trailerVerifications,
    releaseAuthorizations,
    issues,
    incidentRows,
    storageRows,
    witnessReportRows,
    fraudFlags,
  ] = await Promise.all([
    getAssetRoles(assetId),
    getMasterForAsset(assetId),
    getCustodyTimeline(assetId),
    getVinVerificationsForAsset(assetId),
    getTowVerificationsForAsset(assetId),
    getTrailerVerificationsForAsset(assetId),
    getReleaseAuthorizationsForAsset(assetId),
    getIssuesForAsset(assetId),
    getIncidentsForAsset(assetId),
    getStorageEventsForAsset(assetId),
    getWitnessReportsForAsset(assetId),
    computeFraudFlags(assetId),
  ]);
  return {
    asset,
    roles,
    master,
    timeline,
    vinVerifications,
    towVerifications,
    trailerVerifications,
    releaseAuthorizations,
    issues,
    incidents: incidentRows,
    storageEvents: storageRows,
    witnessReports: witnessReportRows,
    fraudFlags,
  };
}
