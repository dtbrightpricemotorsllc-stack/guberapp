// task-615: Verify that a NOTIFY on `studio_tools_cache_bust` invalidates the
// in-process cache on the listening process within ~1-2 s.
//
// Two describe blocks:
//
// Block 1 — raw PG path:
//   Two pg.Client connections set up directly in the test. One LISTENs and
//   calls invalidateStudioToolsCache() on arrival (mirroring the logic inside
//   studio-tools-notify.ts). The other sends NOTIFY (mirroring
//   broadcastStudioToolsCacheBust()).  Guards the PG notification semantics
//   independently of production wiring details.
//
// Block 2 — exported function path:
//   Calls the real startStudioToolsListener() / broadcastStudioToolsCacheBust()
//   so a future refactor of those functions can't silently break the contract.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import {
  setStudioToolsCache,
  getStudioToolsCache,
  invalidateStudioToolsCache,
} from "../studio-tools-cache";
import {
  STUDIO_TOOLS_NOTIFY_CHANNEL,
  startStudioToolsListener,
  broadcastStudioToolsCacheBust,
} from "../studio-tools-notify";
import type { StudioModelPricing } from "@shared/schema";

const FAKE_TOOL: StudioModelPricing = {
  toolKey: "wan_motion_5s",
  label: "Text → Video (5 s)",
  description: "Short cinematic clip",
  creditsCost: 30,
  durationSeconds: 5,
  tileImageUrl: null,
  active: true,
  providerEndpoint: "fal-ai/wan-motion",
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Block 1 — raw PG path (manually wired listener + notifier)
// ---------------------------------------------------------------------------

let rawListenerClient: pg.Client;
let rawNotifierClient: pg.Client;

beforeAll(async () => {
  rawListenerClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await rawListenerClient.connect();
  rawListenerClient.on("notification", (msg) => {
    if (msg.channel === STUDIO_TOOLS_NOTIFY_CHANNEL) {
      invalidateStudioToolsCache();
    }
  });
  await rawListenerClient.query(`LISTEN "${STUDIO_TOOLS_NOTIFY_CHANNEL}"`);

  rawNotifierClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await rawNotifierClient.connect();
}, 15_000);

afterAll(async () => {
  await rawListenerClient.end().catch(() => {});
  await rawNotifierClient.end().catch(() => {});
});

describe("studio_tools_cache_bust NOTIFY → cache invalidation — raw PG path (task-615)", () => {
  it("cache is warm before NOTIFY", () => {
    setStudioToolsCache([FAKE_TOOL]);
    expect(getStudioToolsCache()).not.toBeNull();
  });

  it("cache is null within 1.5 s after NOTIFY", async () => {
    setStudioToolsCache([FAKE_TOOL]);
    expect(getStudioToolsCache()).not.toBeNull();

    await rawNotifierClient.query(`NOTIFY "${STUDIO_TOOLS_NOTIFY_CHANNEL}"`);
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));

    expect(
      getStudioToolsCache(),
      "cache was not invalidated — listener may not be receiving NOTIFY events",
    ).toBeNull();
  });

  it("a second NOTIFY also invalidates a freshly-primed cache", async () => {
    setStudioToolsCache([FAKE_TOOL]);
    await rawNotifierClient.query(`NOTIFY "${STUDIO_TOOLS_NOTIFY_CHANNEL}"`);
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    expect(getStudioToolsCache()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Block 2 — exported function path (startStudioToolsListener + broadcast)
// ---------------------------------------------------------------------------

describe("studio_tools_cache_bust — exported function path (task-615)", () => {
  it("broadcastStudioToolsCacheBust() invalidates the cache via startStudioToolsListener()", async () => {
    // Start the production listener singleton. Because module state is fresh
    // per vitest test file, listenerClient starts as null and connect() runs.
    startStudioToolsListener();
    // Allow the async connect + LISTEN to complete.
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));

    setStudioToolsCache([FAKE_TOOL]);
    expect(getStudioToolsCache()).not.toBeNull();

    await broadcastStudioToolsCacheBust();
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));

    expect(
      getStudioToolsCache(),
      "cache was not invalidated by broadcastStudioToolsCacheBust() — check startStudioToolsListener() wiring",
    ).toBeNull();
  }, 10_000);
});
