import { fileURLToPath } from "node:url";
import { runPnpm, requireSuccess } from "./process-runner.mjs";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

const gates = [
  ["check"],
  ["-C", "api", "launch:check"],
  ["-C", "api", "launch:smoke:marketplace"]
];

for (const args of gates) {
  requireSuccess(runPnpm(args, { cwd: rootDirectory }), "pnpm is required to run the release checks.");
}
