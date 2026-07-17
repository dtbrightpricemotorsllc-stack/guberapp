/**
 * Server-side Commerce Mode enforcement.
 *
 * The active mode is stored in the DB (commerce_mode_config table, single row)
 * and cached in memory with a 60-second TTL so every request doesn't hit the DB.
 * On cache miss or DB error the system falls back to EARNED_CREDITS_ONLY — never
 * to FULL_COMMERCE.
 */

import { Request, Response, NextFunction } from "express";
import { pool } from "./db";
import {
  CommerceMode,
  DEFAULT_COMMERCE_MODE,
  PURCHASE_BLOCKED_MESSAGE,
  isCommerceHidden,
  isEarnedCreditsOnly,
  canOpenCheckout,
  canPurchaseCredits,
} from "../shared/commerce-mode";

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _cachedMode: CommerceMode | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export async function getCommerceMode(): Promise<CommerceMode> {
  if (_cachedMode && Date.now() < _cacheExpiry) return _cachedMode;
  try {
    const result = await pool.query(
      "SELECT mode FROM commerce_mode_config ORDER BY id LIMIT 1"
    );
    const row = result.rows[0];
    const mode = (row?.mode as CommerceMode) || DEFAULT_COMMERCE_MODE;
    const valid: CommerceMode[] = ["HIDDEN", "EARNED_CREDITS_ONLY", "FULL_COMMERCE"];
    _cachedMode = valid.includes(mode) ? mode : DEFAULT_COMMERCE_MODE;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return _cachedMode;
  } catch (err) {
    console.error("[commerce-mode] DB read failed, defaulting to", DEFAULT_COMMERCE_MODE, err);
    return DEFAULT_COMMERCE_MODE;
  }
}

export function invalidateCommerceModeCache(): void {
  _cachedMode = null;
  _cacheExpiry = 0;
}

export async function setCommerceMode(
  mode: CommerceMode,
  adminId: number
): Promise<void> {
  const valid: CommerceMode[] = ["HIDDEN", "EARNED_CREDITS_ONLY", "FULL_COMMERCE"];
  if (!valid.includes(mode)) throw new Error(`Invalid commerce mode: ${mode}`);

  const previous = await getCommerceMode();

  await pool.query(`
    INSERT INTO commerce_mode_config (id, mode, updated_at, updated_by)
    VALUES (1, $1, NOW(), $2)
    ON CONFLICT (id) DO UPDATE SET mode = $1, updated_at = NOW(), updated_by = $2
  `, [mode, adminId]);

  await pool.query(`
    INSERT INTO commerce_mode_log (admin_id, previous_mode, new_mode, changed_at)
    VALUES ($1, $2, $3, NOW())
  `, [adminId, previous, mode]);

  invalidateCommerceModeCache();
  console.log(`[commerce-mode] Mode changed: ${previous} → ${mode} by admin ${adminId}`);
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Attach the current commerce mode to res.locals so route handlers can read it
 * without another DB call.
 */
export async function commerceModeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.locals.commerceMode = await getCommerceMode();
  } catch {
    res.locals.commerceMode = DEFAULT_COMMERCE_MODE;
  }
  next();
}

/**
 * Block GUBER digital-product checkout creation in non-FULL_COMMERCE modes.
 * Attach after authentication middleware on purchase endpoints.
 */
export function requireFullCommerce(req: Request, res: Response, next: NextFunction): void {
  const mode: CommerceMode = res.locals.commerceMode || DEFAULT_COMMERCE_MODE;
  if (!canOpenCheckout(mode, "GUBER_DIGITAL_BENEFIT")) {
    res.status(403).json({
      error: "commerce_blocked",
      message: PURCHASE_BLOCKED_MESSAGE,
      commerceMode: mode,
    });
    return;
  }
  next();
}

/**
 * Block credit-purchase endpoints specifically.
 */
export function requireCreditPurchaseEnabled(req: Request, res: Response, next: NextFunction): void {
  const mode: CommerceMode = res.locals.commerceMode || DEFAULT_COMMERCE_MODE;
  if (!canPurchaseCredits(mode)) {
    res.status(403).json({
      error: "credit_purchase_blocked",
      message: PURCHASE_BLOCKED_MESSAGE,
      commerceMode: mode,
    });
    return;
  }
  next();
}
