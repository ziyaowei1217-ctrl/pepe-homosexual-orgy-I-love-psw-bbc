import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// v6's worker imports the sibling shared module. Copy both from the same
// installed dependency; a versioned URL prevents stale worker/client pairs.
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("maplibre-gl/package.json"));
const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Unsupported MapLibre asset version");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(project, "public/vendor/maplibre");
// This ignored directory contains generated dependency files only. Do not ship
// old worker versions after a dependency/security update.
rmSync(generated, { recursive: true, force: true });
const destination = join(generated, version);
mkdirSync(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(source, "dist", file), join(destination, file));
}
copyFileSync(join(source, "LICENSE.txt"), join(destination, "LICENSE.txt"));
console.log(`Prepared MapLibre ${version} worker and shared module.`);
