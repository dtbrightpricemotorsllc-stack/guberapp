import pg from "pg";
import { invalidateStudioToolsCache } from "./studio-tools-cache";

export const STUDIO_TOOLS_NOTIFY_CHANNEL = "studio_tools_cache_bust";
const CHANNEL = STUDIO_TOOLS_NOTIFY_CHANNEL;

let listenerClient: pg.Client | null = null;
let reconnecting = false;

async function connect(): Promise<void> {
  if (listenerClient || reconnecting) return;
  reconnecting = true;

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  client.on("error", (err) => {
    console.error("[studio-tools-listener] client error:", err.message);
    listenerClient = null;
    scheduleReconnect();
  });

  client.on("end", () => {
    if (listenerClient) {
      console.warn("[studio-tools-listener] connection closed, reconnecting…");
      listenerClient = null;
      scheduleReconnect();
    }
  });

  client.on("notification", (msg) => {
    if (msg.channel === CHANNEL) {
      invalidateStudioToolsCache();
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN "${CHANNEL}"`);
    listenerClient = client;
    console.log(`[studio-tools-listener] listening on channel "${CHANNEL}"`);
  } catch (err: any) {
    console.error("[studio-tools-listener] connect failed:", err.message);
    await client.end().catch(() => {});
    reconnecting = false;
    scheduleReconnect();
    return;
  }
  reconnecting = false;
}

function scheduleReconnect(): void {
  setTimeout(() => connect().catch(() => {}), 5_000);
}

export function startStudioToolsListener(): void {
  connect().catch((err) => {
    console.error("[studio-tools-listener] startup error:", err.message);
    scheduleReconnect();
  });
}

export async function broadcastStudioToolsCacheBust(): Promise<void> {
  const { pool } = await import("./db");
  const client = await pool.connect();
  try {
    await client.query(`NOTIFY "${CHANNEL}"`);
  } finally {
    client.release();
  }
}
