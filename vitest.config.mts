import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webStorageExecArgv = process.allowedNodeEnvironmentFlags.has(
  "--no-experimental-webstorage"
)
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "**/.tmp-tests/**", "api/**"],
    include: ["tests/**/*.test.{ts,tsx}"],
    execArgv: webStorageExecArgv
  }
});
