import path from "node:path";
import { defineConfig } from "vitest/config";

const webStorageExecArgv = process.allowedNodeEnvironmentFlags.has(
  "--no-experimental-webstorage"
)
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "**/.tmp-tests/**", "api/**"],
    include: ["tests/**/*.test.{ts,tsx}"],
    poolOptions: {
      forks: { execArgv: webStorageExecArgv },
      threads: { execArgv: webStorageExecArgv }
    }
  }
});
