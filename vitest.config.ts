import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    include: ["server/tests/**/*.test.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
    globals: false,
    testTimeout: 10000,
  },
});
