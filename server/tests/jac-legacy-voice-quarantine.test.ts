import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

describe("retired JAC OpenAI Realtime voice path", () => {
  it("keeps the old session and tool endpoints fail-closed", () => {
    const routes = readFileSync(path.join(projectRoot, "server/routes.ts"), "utf8");

    expect(routes).toContain('app.post("/api/jac/realtime-session"');
    expect(routes).toContain('app.post("/api/jac/realtime-tool"');
    expect(routes).toMatch(
      /app\.post\("\/api\/jac\/realtime-session"[\s\S]*?res\.status\(410\)/
    );
    expect(routes).toMatch(
      /app\.post\("\/api\/jac\/realtime-tool"[\s\S]*?res\.status\(410\)/
    );
  });

  it("does not ship an orphaned browser transport that can speak with another voice", () => {
    for (const relativePath of [
      "client/src/lib/jac-realtime.ts",
      "client/src/components/jac/jac-realtime-voice.tsx",
      "client/src/pages/jac-realtime-test.tsx",
      "client/src/lib/jac-openai-realtime-transport.ts",
      "client/src/components/jac/jac-openai-realtime-session.tsx",
      "server/jac-realtime-relay.ts",
      "server/jac-prompt-tools.ts",
    ]) {
      expect(existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(false);
    }
  });
});