import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // next/server-only guard is a no-op outside the Next bundler
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Real-Postgres mode (TEST_DATABASE_URL): one file at a time to stay within pooler limits.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    // Real Postgres adds a network round trip per query (the demo seed runs hundreds).
    testTimeout: process.env.TEST_DATABASE_URL ? 600000 : 30000,
    hookTimeout: 60000,
  },
});
