import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    include: ["server/tests/**/*.test.ts"],
    globals: false,
    testTimeout: 10000,
  },
});
