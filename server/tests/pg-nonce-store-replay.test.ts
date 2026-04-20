/**
 * Replay-attack durability test for PgNonceStore.
 *
 * The whole point of the PostgreSQL-backed nonce store is that consumed nonces
 * survive server restarts and are shared across all instances. This suite
 * proves that guarantee using a mock pool whose state (the nonce table) is
 * shared between two separate PgNonceStore instances, simulating what happens
 * when the process restarts but the database persists.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PgNonceStore, type DbPool } from "../oauth";

// ---------------------------------------------------------------------------
// Mock pool — mimics the INSERT … ON CONFLICT behaviour of oauth_used_nonces
// ---------------------------------------------------------------------------

/**
 * In-memory simulation of the `oauth_used_nonces` table.
 *
 * Stores nonce → expiry timestamp so the INSERT … ON CONFLICT logic can be
 * faithfully reproduced without a real PostgreSQL server.
 *
 * SQL semantics reproduced:
 *   INSERT INTO oauth_used_nonces (nonce, expires_at) VALUES ($1, $2)
 *   ON CONFLICT (nonce) DO UPDATE
 *     SET expires_at = EXCLUDED.expires_at
 *     WHERE oauth_used_nonces.expires_at < NOW()
 *
 * Outcome mapping:
 *   - Nonce absent        → INSERT succeeds  → rowCount = 1  (fresh)
 *   - Nonce present, NOT expired  → DO NOTHING → rowCount = 0  (replay)
 *   - Nonce present, EXPIRED      → UPDATE wins → rowCount = 1  (fresh — recycled)
 */
class MockDbPool implements DbPool {
  /** Shared table state: nonce → expiry Date */
  readonly table = new Map<string, Date>();

  async query(
    _sql: string,
    values?: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const nonce = values?.[0] as string;
    const expiresAt = values?.[1] as Date;
    const now = new Date();

    const existing = this.table.get(nonce);

    if (existing === undefined) {
      // Row absent → INSERT succeeds.
      this.table.set(nonce, expiresAt);
      return { rowCount: 1 };
    }

    if (existing < now) {
      // Row present but EXPIRED → UPDATE wins (recycles the row).
      this.table.set(nonce, expiresAt);
      return { rowCount: 1 };
    }

    // Row present and still valid → DO NOTHING (replay).
    return { rowCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PgNonceStore — cross-instance replay rejection (server-restart simulation)", () => {
  const TTL_MS = 10 * 60 * 1000; // 10 minutes, same as production
  const TEST_NONCE = "deadbeef0102030405060708090a0b0c"; // 32-char hex nonce

  let sharedPool: MockDbPool;

  beforeEach(() => {
    // Fresh shared pool for each test — represents the persistent database.
    sharedPool = new MockDbPool();
  });

  it("accepts a nonce on first use (instance 1)", async () => {
    const store = new PgNonceStore(sharedPool);
    const fresh = await store.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(fresh).toBe(true);
  });

  it("rejects the same nonce on a second call to the same instance", async () => {
    const store = new PgNonceStore(sharedPool);

    const first = await store.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(first).toBe(true);

    const second = await store.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(second).toBe(false);
  });

  it("rejects a replayed nonce after a simulated server restart (new PgNonceStore instance, same pool)", async () => {
    // ── "Before restart": instance 1 consumes the nonce ──────────────────
    const instanceBeforeRestart = new PgNonceStore(sharedPool);
    const fresh = await instanceBeforeRestart.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(fresh).toBe(true);

    // The nonce row now lives in the shared pool (the database).
    expect(sharedPool.table.has(TEST_NONCE)).toBe(true);

    // ── "After restart": brand-new instance, same underlying pool ─────────
    // This is the critical test: a new PgNonceStore has no in-memory state
    // from the previous instance, so if it were backed by an in-memory store
    // it would incorrectly accept the nonce again.
    const instanceAfterRestart = new PgNonceStore(sharedPool);
    const replay = await instanceAfterRestart.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(replay).toBe(false);
  });

  it("accepts a different nonce from the new instance even after another nonce was consumed before restart", async () => {
    const OTHER_NONCE = "cafebabe0102030405060708090a0b0c";

    const instanceBeforeRestart = new PgNonceStore(sharedPool);
    await instanceBeforeRestart.consumeIfFresh(TEST_NONCE, TTL_MS);

    // New instance after restart.
    const instanceAfterRestart = new PgNonceStore(sharedPool);

    // A completely different nonce should still be accepted.
    const fresh = await instanceAfterRestart.consumeIfFresh(OTHER_NONCE, TTL_MS);
    expect(fresh).toBe(true);
  });

  it("recycles an expired nonce so a fresh token with the same value is accepted", async () => {
    // Seed the pool with an already-expired entry to simulate a very old nonce.
    const expiredDate = new Date(Date.now() - 1); // 1 ms in the past → expired
    sharedPool.table.set(TEST_NONCE, expiredDate);

    // A new instance should treat the expired row as recyclable.
    const instanceAfterRestart = new PgNonceStore(sharedPool);
    const fresh = await instanceAfterRestart.consumeIfFresh(TEST_NONCE, TTL_MS);
    expect(fresh).toBe(true);
  });

  it("rowCount=null from the pool is safely coerced to 0 and treated as a replay", async () => {
    // Edge-case: some pg driver versions return rowCount=null rather than 0
    // for a DO NOTHING conflict. The code guards with `(result.rowCount ?? 0) > 0`,
    // so null must be treated as "not inserted" (replay), never as fresh.
    const nullRowCountPool: DbPool = {
      async query() {
        return { rowCount: null };
      },
    };

    const store = new PgNonceStore(nullRowCountPool);
    const result = await store.consumeIfFresh(TEST_NONCE, TTL_MS);
    // rowCount null → coerces to 0 → rejected as replay
    expect(result).toBe(false);
  });
});
