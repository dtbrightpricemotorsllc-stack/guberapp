import { db } from "./db";
import { testerAllowlist } from "@shared/schema";
import { and, eq } from "drizzle-orm";

/** True if the viewer is on the allowlist for the given (itemType,itemId). */
export async function isOnAllowlist(
  itemType: "job" | "cash_drop",
  itemId: number,
  userId: number | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: testerAllowlist.id })
    .from(testerAllowlist)
    .where(
      and(
        eq(testerAllowlist.itemType, itemType),
        eq(testerAllowlist.itemId, itemId),
        eq(testerAllowlist.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Bulk fetch of (itemType,itemId) pairs the user is allowlisted for. */
export async function listAllowlistedItemIds(
  itemType: "job" | "cash_drop",
  userId: number | null | undefined,
): Promise<Set<number>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ itemId: testerAllowlist.itemId })
    .from(testerAllowlist)
    .where(and(eq(testerAllowlist.itemType, itemType), eq(testerAllowlist.userId, userId)));
  return new Set(rows.map((r) => r.itemId));
}

/** Async by-ID visibility check — returns true if the viewer is allowed to
 * see/interact with an allowlist-restricted item. Public items always pass.
 * Use at the top of any by-ID route on a resource that supports allowlist
 * visibility (jobs, cash drops). */
export async function canViewItem(
  itemType: "job" | "cash_drop",
  item: { id: number; visibility?: string | null },
  opts: { viewerId?: number | null; isAdmin: boolean; isOwner: boolean },
): Promise<boolean> {
  if ((item.visibility ?? "public") === "public") return true;
  if (opts.isAdmin) return true;
  if (opts.viewerId && opts.isOwner) return true;
  if (!opts.viewerId) return false;
  return isOnAllowlist(itemType, item.id, opts.viewerId);
}

/** Sync visibility filter for in-memory lists. Hides allowlist items unless the
 * viewer is admin, the owner, or in the allowlist set. `ownerCheck` returns
 * true when the viewer owns the item (always sees it). */
export function filterVisibleItems<T extends { id: number; visibility?: string | null }>(
  items: T[],
  opts: {
    viewerId?: number | null;
    isAdmin: boolean;
    allowlistedIds: Set<number>;
    ownerCheck: (item: T) => boolean;
  },
): T[] {
  return items.filter((item) => {
    if ((item.visibility ?? "public") === "public") return true;
    if (opts.isAdmin) return true;
    if (opts.viewerId && opts.ownerCheck(item)) return true;
    return opts.allowlistedIds.has(item.id);
  });
}
