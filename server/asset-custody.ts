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
import { db, pool } from "./db";
import {
  protectedAssets,
  assetRoles,
  custodyEvents,
  assetProtectionPurchases,
  foundersClubState,
  users,
  type ProtectedAsset,
  type AssetRole,
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
