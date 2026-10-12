import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bound parallel app bootstraps and child-process checks on CI/shared hosts.
    maxWorkers: 2,
    minWorkers: 1,
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts"]
  }
});
