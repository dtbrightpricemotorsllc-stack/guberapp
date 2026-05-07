import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (err) => {
  console.error("[db.pool] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
