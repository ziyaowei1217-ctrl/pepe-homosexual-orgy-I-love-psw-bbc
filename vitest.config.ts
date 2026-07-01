import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "**/.tmp-tests/**", "api/**"],
    include: ["tests/**/*.test.ts"]
  }
});
