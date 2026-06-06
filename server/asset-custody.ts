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
  users,
  type ProtectedAsset,
  type AssetRole,
  type ReleaseAuthorization,
  type ReleaseCode,
  type TowVehicleVerification,
  type TrailerVerification,
  type VinVerification,
} from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
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

/**
 * Atomically claim a Founders Club spot for `userId`. Uses a transaction-scoped
 * advisory lock so concurrent purchases can never over-sell the 500 cap or
 * double-grant the same user. Returns whether the user got a FOUNDER spot
 * (i.e. was within the cap) — callers still charge the appropriate price.
 *
 * Idempotent: if the user is already a founder, returns granted=false,
 * alreadyMember=true without incrementing.
 */
export async function claimFounderSpot(
  userId: number,
): Promise<{ granted: boolean; alreadyMember: boolean; soldOut: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Single global lock for the founders counter.
    await client.query("SELECT pg_advisory_xact_lock($1)", [987654321]);

    const already = await client.query(
      "SELECT founding_asset_protection_member AS m FROM users WHERE id = $1",
      [userId],
    );
    if (already.rows[0]?.m) {
      await client.query("COMMIT");
      return { granted: false, alreadyMember: true, soldOut: false };
    }

    const stateRes = await client.query(
      "SELECT total_claimed, cap_limit FROM founders_club_state WHERE id = 1 FOR UPDATE",
    );
    const totalClaimed = stateRes.rows[0]?.total_claimed ?? 0;
    const capLimit = stateRes.rows[0]?.cap_limit ?? FOUNDERS_CLUB.defaultCap;
    if (totalClaimed >= capLimit) {
      await client.query("COMMIT");
      return { granted: false, alreadyMember: false, soldOut: true };
    }

    await client.query(
      "UPDATE founders_club_state SET total_claimed = total_claimed + 1, updated_at = NOW() WHERE id = 1",
    );
    await client.query(
      "UPDATE users SET founding_asset_protection_member = true WHERE id = $1",
      [userId],
    );
    await client.query("COMMIT");
    return { granted: true, alreadyMember: false, soldOut: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Grant founder membership AFTER a successful payment. Idempotent and honors the
 * payment even in the rare race where the cap filled between checkout creation
 * and webhook delivery (enrollment is gated on soldOut at the route, so overage
 * is at most a handful and is admin-visible). Returns whether it was newly granted.
 */
export async function grantFounderMembership(userId: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [987654321]);
    const already = await client.query(
      "SELECT founding_asset_protection_member AS m FROM users WHERE id = $1",
      [userId],
    );
    if (already.rows[0]?.m) {
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      "UPDATE users SET founding_asset_protection_member = true WHERE id = $1",
      [userId],
    );
    await client.query(
      "UPDATE founders_club_state SET total_claimed = total_claimed + 1, updated_at = NOW() WHERE id = 1",
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

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
): Promise<{ fulfilled: boolean; alreadyDone: boolean }> {
  const [purchase] = await db
    .select()
    .from(assetProtectionPurchases)
    .where(eq(assetProtectionPurchases.stripeSessionId, stripeSessionId));
  if (!purchase) return { fulfilled: false, alreadyDone: false };
  if (purchase.status === "paid") return { fulfilled: false, alreadyDone: true };

  // Flip to paid first (idempotency guard).
  const updated = await db
    .update(assetProtectionPurchases)
    .set({ status: "paid", fulfilledAt: new Date(), stripePaymentIntentId: paymentIntentId ?? null })
    .where(
      and(eq(assetProtectionPurchases.stripeSessionId, stripeSessionId), eq(assetProtectionPurchases.status, "pending")),
    )
    .returning();
  if (!updated.length) return { fulfilled: false, alreadyDone: true };

  const p = updated[0];

  if (p.productType === "package" && p.assetId && p.packageTier && isProtectionPackageKey(p.packageTier)) {
    await updateAsset(p.assetId, { packageTier: p.packageTier, status: "active" } as any);
    await appendCustodyEvent(p.assetId, "package_purchased", {
      actorId: p.userId,
      description: `Protection package purchased: ${p.packageTier}`,
      metadata: { amountCents: p.amountCents, packageTier: p.packageTier, sessionId: stripeSessionId },
    });
  } else if (p.productType === "witness_addon" && p.assetId) {
    await updateAsset(p.assetId, { witnessAddon: true } as any);
    await appendCustodyEvent(p.assetId, "package_purchased", {
      actorId: p.userId,
      description: `Witness add-on purchased: ${p.packageTier ?? "witness"}`,
      metadata: { amountCents: p.amountCents, addon: p.packageTier, sessionId: stripeSessionId },
    });
  }
  // founders_club fulfillment is handled by claimFounderSpot at purchase time.

  return { fulfilled: true, alreadyDone: false };
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

export interface ApproveResult {
  authorization: ReleaseAuthorization;
  code: ReleaseCode;
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
    if (existing) return { authorization: auth, code: existing };
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

  const [approved] = await db
    .update(releaseAuthorizations)
    .set({ status: "approved", approvedBy: approverId, approvedAt: new Date() } as any)
    .where(and(eq(releaseAuthorizations.id, authId), eq(releaseAuthorizations.status, "pending")))
    .returning();
  if (!approved) throw new Error("Authorization could not be approved (already acted on)");

  const [code] = await db
    .insert(releaseCodes)
    .values({
      assetId: auth.assetId,
      authorizationId: authId,
      code: makeReleaseCode(),
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

  return { authorization: approved, code };
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize redemptions per-asset so a code can never be consumed twice.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [747474, input.assetId]);

    const codeRes = await client.query(
      "SELECT * FROM release_codes WHERE asset_id = $1 AND code = $2 ORDER BY id DESC LIMIT 1",
      [input.assetId, supplied],
    );
    const codeRow = codeRes.rows[0];
    if (!codeRow) {
      await client.query("ROLLBACK");
      throw new Error("Invalid pickup code");
    }
    if (codeRow.status === "used") {
      await client.query("COMMIT");
      const code = (await db.select().from(releaseCodes).where(eq(releaseCodes.id, codeRow.id)))[0];
      return { ok: false, alreadyRedeemed: true, code, geofence };
    }
    if (codeRow.status !== "active") {
      await client.query("ROLLBACK");
      throw new Error(`Pickup code is ${codeRow.status}`);
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
      await client.query("UPDATE release_codes SET status = 'expired' WHERE id = $1", [codeRow.id]);
      await client.query("COMMIT");
      throw new Error("Pickup code has expired");
    }

    // Re-assert the VIN hard block against the linked authorization.
    if (codeRow.authorization_id) {
      const vinRes = await client.query(
        "SELECT status FROM vin_verifications WHERE authorization_id = $1 ORDER BY id DESC LIMIT 1",
        [codeRow.authorization_id],
      );
      if (vinRes.rows[0]?.status === "mismatch") {
        await client.query("ROLLBACK");
        throw new Error("Release blocked: VIN mismatch");
      }
    }

    const consumed = await client.query(
      "UPDATE release_codes SET status = 'used', used_at = NOW(), used_by = $2 WHERE id = $1 AND status = 'active' RETURNING *",
      [codeRow.id, input.redeemedBy],
    );
    if (!consumed.rows.length) {
      await client.query("ROLLBACK");
      throw new Error("Pickup code could not be redeemed (already used)");
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // Outside the lock: flip asset state and append the immutable custody trail.
  await updateAsset(input.assetId, { status: "in_transit" } as any);
  const [code] = await db.select().from(releaseCodes).where(
    and(eq(releaseCodes.assetId, input.assetId), eq(releaseCodes.code, supplied)),
  ).orderBy(desc(releaseCodes.id));
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
