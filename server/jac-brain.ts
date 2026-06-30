/**
 * JAC Brain — local knowledge lookup, intent matching, response cache.
 * Called before external AI to reduce cost and latency.
 */
import { pool } from "./db";
import { createHash } from "crypto";

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function makeCacheKey(text: string): string {
  return createHash("md5").update(normalizeText(text)).digest("hex");
}

export interface LocalAnswer {
  answer: string;
  category: string;
  source: "cache" | "kb" | "intent";
  confidence: number;
  followUpActions?: Array<{ label: string; message: string }>;
  intentName?: string;
  kbId?: number;
  cacheId?: number;
}

/**
 * Try to answer from local KB/cache/intents before calling OpenAI.
 * Returns null if no confident local answer exists.
 */
export async function tryLocalAnswer(userText: string): Promise<LocalAnswer | null> {
  const normalized = normalizeText(userText);
  if (normalized.length < 3) return null;
  const key = makeCacheKey(normalized);

  // 1. Exact match in response cache (admin-approved)
  try {
    const r = await pool.query(
      `SELECT id, answer_text, intent_name
       FROM jac_response_cache
       WHERE cache_key = $1 AND admin_approved = TRUE
       LIMIT 1`,
      [key]
    );
    if (r.rows.length > 0) {
      const row = r.rows[0];
      pool.query(
        `UPDATE jac_response_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = $1`,
        [row.id]
      ).catch(() => {});
      return {
        answer: row.answer_text,
        category: row.intent_name ?? "general",
        source: "cache",
        confidence: 0.97,
        cacheId: row.id,
      };
    }
  } catch {}

  // 2. Knowledge base — keyword + pattern matching
  try {
    const r = await pool.query(
      `SELECT id, category, answer, follow_up_actions
       FROM jac_knowledge
       WHERE active = TRUE AND admin_approved = TRUE
         AND (
           EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(question_patterns) qp
             WHERE $1 ILIKE '%' || qp || '%'
           )
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(keywords) kw
             WHERE $1 ILIKE '%' || kw || '%'
           )
         )
       ORDER BY hit_count DESC
       LIMIT 1`,
      [normalized]
    );
    if (r.rows.length > 0) {
      const row = r.rows[0];
      pool.query(
        `UPDATE jac_knowledge SET hit_count = hit_count + 1, updated_at = NOW() WHERE id = $1`,
        [row.id]
      ).catch(() => {});
      return {
        answer: row.answer,
        category: row.category,
        source: "kb",
        confidence: 0.87,
        followUpActions: Array.isArray(row.follow_up_actions) ? row.follow_up_actions : [],
        kbId: row.id,
      };
    }
  } catch {}

  // 3. Intent phrase matching
  try {
    const r = await pool.query(
      `SELECT id, intent_name, fallback_response, target_route
       FROM jac_intents
       WHERE active = TRUE AND fallback_response IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(sample_phrases) p
           WHERE $1 ILIKE '%' || p || '%'
         )
       ORDER BY hit_count DESC
       LIMIT 1`,
      [normalized]
    );
    if (r.rows.length > 0) {
      const row = r.rows[0];
      pool.query(
        `UPDATE jac_intents SET hit_count = hit_count + 1, updated_at = NOW() WHERE id = $1`,
        [row.id]
      ).catch(() => {});
      return {
        answer: row.fallback_response,
        category: row.intent_name,
        source: "intent",
        confidence: 0.80,
        intentName: row.intent_name,
      };
    }
  } catch {}

  return null;
}

/**
 * Promote a Q&A pair into the response cache for future reuse.
 */
export async function promoteToCache(
  questionText: string,
  answerText:   string,
  intentName:   string | null,
  source:       "admin" | "ai_approved" | "template" = "admin"
): Promise<void> {
  const key = makeCacheKey(questionText);
  await pool.query(
    `INSERT INTO jac_response_cache
       (cache_key, question_text, answer_text, intent_name, source, admin_approved, created_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (cache_key) DO UPDATE
       SET answer_text = $3, intent_name = $4, source = $5, admin_approved = TRUE`,
    [key, questionText.slice(0, 500), answerText, intentName, source]
  );
}

/**
 * Return brain stats (cost savings, hit rates).
 */
export async function getJacBrainStats(): Promise<{
  kbEntries: number;
  kbHits: number;
  intentEntries: number;
  intentHits: number;
  cacheEntries: number;
  cacheHits: number;
  totalLocalHits: number;
  estimatedSavedCalls: number;
}> {
  try {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM jac_knowledge WHERE active = TRUE AND admin_approved = TRUE)::int AS kb_entries,
        (SELECT COALESCE(SUM(hit_count),0) FROM jac_knowledge)::int AS kb_hits,
        (SELECT COUNT(*) FROM jac_intents WHERE active = TRUE)::int AS intent_entries,
        (SELECT COALESCE(SUM(hit_count),0) FROM jac_intents)::int AS intent_hits,
        (SELECT COUNT(*) FROM jac_response_cache WHERE admin_approved = TRUE)::int AS cache_entries,
        (SELECT COALESCE(SUM(hit_count),0) FROM jac_response_cache)::int AS cache_hits
    `);
    const row = r.rows[0];
    const kbHits = parseInt(row.kb_hits) || 0;
    const intentHits = parseInt(row.intent_hits) || 0;
    const cacheHits = parseInt(row.cache_hits) || 0;
    const totalLocalHits = kbHits + intentHits + cacheHits;
    return {
      kbEntries:           parseInt(row.kb_entries) || 0,
      kbHits,
      intentEntries:       parseInt(row.intent_entries) || 0,
      intentHits,
      cacheEntries:        parseInt(row.cache_entries) || 0,
      cacheHits,
      totalLocalHits,
      estimatedSavedCalls: totalLocalHits,
    };
  } catch {
    return { kbEntries: 0, kbHits: 0, intentEntries: 0, intentHits: 0, cacheEntries: 0, cacheHits: 0, totalLocalHits: 0, estimatedSavedCalls: 0 };
  }
}
