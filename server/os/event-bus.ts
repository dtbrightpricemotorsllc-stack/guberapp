import { pool, db } from "../db";
import { osEvents } from "@shared/os-schema";

/**
 * Emit a platform event into the OS event bus.
 * Fire-and-forget: never throws — existing platform routes must not fail due to OS.
 */
export async function emitOSEvent(
  eventType: string,
  payload: Record<string, any>,
  source = "platform"
): Promise<void> {
  try {
    await db.insert(osEvents).values({
      eventType,
      source,
      payload,
      processedBy: [],
    });
    await pool.query(`SELECT pg_notify('os_event', $1)`, [
      JSON.stringify({ eventType, source }),
    ]);
  } catch (err) {
    console.error("[os/event-bus] Failed to emit event:", eventType, err);
  }
}

type EventHandler = (eventType: string, source: string) => void;

let listenerClient: any = null;

export async function startOSEventListener(onEvent: EventHandler): Promise<void> {
  try {
    listenerClient = await pool.connect();
    await listenerClient.query("LISTEN os_event");

    listenerClient.on("notification", (msg: any) => {
      try {
        const data = JSON.parse(msg.payload);
        onEvent(data.eventType, data.source);
      } catch (e) {
        console.error("[os/event-bus] Notification parse error:", e);
      }
    });

    listenerClient.on("error", (err: any) => {
      console.error("[os/event-bus] Listener client error:", err.message);
      listenerClient = null;
    });

    console.log("[os/event-bus] Listening for os_event notifications.");
  } catch (err) {
    console.error("[os/event-bus] Failed to start listener:", err);
  }
}

export function stopOSEventListener(): void {
  if (listenerClient) {
    try {
      listenerClient.release();
    } catch (_) {}
    listenerClient = null;
  }
}
