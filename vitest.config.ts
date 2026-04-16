import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/tests/**/*.test.ts"],
    globals: false,
    testTimeout: 10000,
  },
});
