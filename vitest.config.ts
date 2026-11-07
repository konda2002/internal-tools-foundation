import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-secret-0123456789abcdef",
    },
    // Tests share one SQLite file; run files sequentially to avoid lock contention.
    fileParallelism: false,
  },
});
