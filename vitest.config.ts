import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", ".kiro", ".kilo"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "__tests__/mocks/server-only.ts"),
    },
  },
});
