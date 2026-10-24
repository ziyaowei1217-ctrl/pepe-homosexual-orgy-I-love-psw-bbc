import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const safeName = /^[a-zA-Z0-9_-]{1,128}$/;
const portable = (path) => path.split(sep).join("/");
const inside = (root, path) => { const value = relative(root, path); return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value); };

function archiveIsComplete(path) {
  let file;
  try {
    const size = statSync(path).size;
    if (size < 22) return false;
    file = openSync(path, "r");
    const header = Buffer.alloc(4);
    readSync(file, header, 0, 4, 0);
    if (header.readUInt32LE() !== 0x04034b50) return false;
    const tail = Buffer.alloc(Math.min(size, 65557));
    readSync(file, tail, 0, tail.length, size - tail.length);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0 || end + 22 > tail.length || end + 22 + tail.readUInt16LE(end + 20) !== tail.length) return false;
    if (tail.readUInt16LE(end + 4) !== 0 || tail.readUInt16LE(end + 6) !== 0 ||
        tail.readUInt16LE(end + 8) === 0 || tail.readUInt16LE(end + 8) !== tail.readUInt16LE(end + 10)) return false;
    const centralOffset = tail.readUInt32LE(end + 16);
    if (centralOffset + tail.readUInt32LE(end + 12) > size - tail.length + end) return false;
    readSync(file, header, 0, 4, centralOffset);
    return header.readUInt32LE() === 0x02014b50;
  } catch { return false; }
  finally { if (file !== undefined) closeSync(file); }
}

export function verifyNetlifyArtifact({ projectDirectory = process.cwd(), publishDirectory = ".netlify/static" } = {}) {
  const root = resolve(projectDirectory);
  const publish = resolve(root, publishDirectory);
  const errors = [];
  const result = { valid: false, buildId: null, publishDirectory: portable(relative(root, publish)), staticAssetCount: 0,
    publicFontCount: 0, bundledFontCount: 0, functionArchiveCount: 0, edgeFunctionCount: 0, edgeBundleCount: 0, errors };
  const fail = (message) => { if (errors.length < 100) errors.push(message); };
  const label = (path) => portable(relative(root, path));
  const fileExists = (path) => { try { return lstatSync(path).isFile(); } catch { return false; } };
  const directoryExists = (path) => { try { return lstatSync(path).isDirectory(); } catch { return false; } };
  const readJson = (path) => {
    try {
      if (!fileExists(path) || statSync(path).size > 4 * 1024 * 1024) throw new Error();
      const value = JSON.parse(readFileSync(path, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value;
    } catch { fail(`Missing or invalid JSON metadata: ${label(path)}`); return null; }
  };
  const sameFile = (source, target) => {
    if (!fileExists(source)) { fail(`Missing source artifact: ${label(source)}`); return; }
    if (!fileExists(target)) { fail(`Missing prepared public asset: ${label(target)}`); return; }
    if (statSync(source).size !== statSync(target).size ||
        createHash("sha256").update(readFileSync(source)).digest("hex") !== createHash("sha256").update(readFileSync(target)).digest("hex")) {
      fail(`Prepared asset differs from current build: ${label(target)}`);
    }
  };
  const fontFiles = (directory) => {
    if (!directoryExists(directory)) return [];
    const output = [];
    const walk = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isSymbolicLink()) { fail(`Symbolic link in artifact: ${label(child)}`); continue; }
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile() && /\.(?:woff2?|ttf|otf)$/i.test(entry.name)) output.push(child);
      }
    };
    walk(directory);
    return output;
  };
  if (!inside(root, publish) || publish === root) {
    result.publishDirectory = "(rejected)";
    fail("Publish directory must be a prepared subdirectory of the project.");
    return result;
  }
  if (!directoryExists(publish)) fail(`Missing prepared static root: ${label(publish)}`);
  for (const prefix of ["", "_next"]) {
    for (const name of ["server", "standalone", "cache", ".next", "node_modules", ".git"]) {
      const path = join(publish, prefix, name);
      if (existsSync(path)) fail(`Unsafe server/build directory in public root: ${label(path)}`);
    }
  }
  if (directoryExists(publish)) {
    for (const entry of readdirSync(publish, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) fail(`Symbolic link in public root: ${label(join(publish, entry.name))}`);
      if (/^\.env(?:\.|$)/.test(entry.name)) fail(`Environment file in public root: ${label(join(publish, entry.name))}`);
    }
    // A nested symlink can publish material outside the reviewed static tree.
    // Skip known unsafe trees already rejected above instead of scanning caches.
    let inspected = 0;
    const scan = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (++inspected > 100_000) { fail("Prepared static tree exceeds the inspection limit."); return; }
        const child = join(directory, entry.name);
        if (entry.isSymbolicLink()) fail(`Symbolic link in public tree: ${label(child)}`);
        else if (entry.isDirectory() && !["server", "standalone", "cache", ".next", "node_modules", ".git"].includes(entry.name)) scan(child);
      }
    };
    scan(publish);
  }
  try {
    const id = readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim();
    if (!safeName.test(id)) throw new Error();
    result.buildId = id;
  } catch { fail("Missing or invalid current build ID: .next/BUILD_ID"); }
  const routes = readJson(join(root, ".next/routes-manifest.json"));
  const basePath = routes?.basePath ?? "";
  const baseValid = typeof basePath === "string" && (basePath === "" || /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(basePath));
  if (!baseValid) fail("Invalid base path in .next/routes-manifest.json");
  const preparedRoot = join(publish, ...(baseValid ? basePath.split("/").filter(Boolean) : []));
  if (result.buildId && !directoryExists(join(preparedRoot, "_next/static", result.buildId))) {
    fail(`Missing current build ID directory: ${label(join(preparedRoot, "_next/static", result.buildId))}`);
  }
  const references = new Set();
  for (const name of ["app-build-manifest.json", "build-manifest.json"]) {
    const manifest = readJson(join(root, ".next", name));
    if (!manifest) continue;
    if (!manifest.pages || typeof manifest.pages !== "object" || Array.isArray(manifest.pages)) fail(`Invalid pages metadata: .next/${name}`);
    const collect = (value) => {
      if (Array.isArray(value)) { for (const item of value) collect(item); }
      else if (value && typeof value === "object") { for (const item of Object.values(value)) collect(item); }
      else if (typeof value === "string" && value.startsWith("static/") && /\.(?:js|css)$/.test(value)) {
        if (value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..") || /[?#\x00-\x1f]/.test(value)) {
          fail(`Invalid static asset reference: .next/${name}`);
        } else references.add(value);
      }
    };
    collect(manifest);
  }
  result.staticAssetCount = references.size;
  if (references.size === 0) fail("No JavaScript/CSS assets found in current Next build manifests.");
  for (const reference of references) sameFile(join(root, ".next", reference), join(preparedRoot, "_next", reference));
  const publicFonts = fontFiles(join(root, "public/fonts/psw"));
  result.publicFontCount = publicFonts.length;
  if (!publicFonts.length) fail("Missing source psw fonts: public/fonts/psw");
  for (const source of publicFonts) sameFile(source, join(preparedRoot, relative(join(root, "public"), source)));
  const bundledFonts = fontFiles(join(root, ".next/static/media"));
  result.bundledFontCount = bundledFonts.length;
  for (const source of bundledFonts) sameFile(source, join(preparedRoot, "_next", relative(join(root, ".next"), source)));

  const functionsRoot = join(root, ".netlify/functions");
  const functionManifest = readJson(join(functionsRoot, "manifest.json"));
  const functions = functionManifest?.functions;
  if (!Array.isArray(functions) || !functions.length) fail("No generated functions in .netlify/functions/manifest.json");
  else for (const entry of functions) {
    if (!entry || !safeName.test(entry.name ?? "") || typeof entry.path !== "string") { fail("Invalid function archive metadata."); continue; }
    const expected = join(functionsRoot, `${entry.name}.zip`);
    const actual = resolve(root, entry.path);
    // macOS' temporary directory, for example, has /var and /private/var aliases.
    const sameArchive = actual === expected || (fileExists(actual) && fileExists(expected) && realpathSync(actual) === realpathSync(expected));
    if (!sameArchive) { fail(`Unexpected archive path for function: ${entry.name}`); continue; }
    if (!fileExists(expected) || !archiveIsComplete(expected)) fail(`Missing or incomplete generated function ZIP: ${label(expected)}`);
    else result.functionArchiveCount++;
  }
  const edgeManifest = readJson(join(root, ".netlify/edge-functions/manifest.json"));
  const edgeFunctions = edgeManifest?.functions;
  if (!Array.isArray(edgeFunctions) || !edgeFunctions.length) fail("No generated middleware in .netlify/edge-functions/manifest.json");
  else for (const entry of edgeFunctions) {
    if (!entry || !safeName.test(entry.function ?? "") || typeof entry.pattern !== "string") { fail("Invalid edge middleware metadata."); continue; }
    const path = join(root, ".netlify/edge-functions", entry.function, `${entry.function}.js`);
    if (!fileExists(path)) fail(`Missing generated edge middleware: ${label(path)}`);
    else result.edgeFunctionCount++;
  }
  const packedEdge = readJson(join(root, ".netlify/edge-functions-dist/manifest.json"));
  if (!Array.isArray(packedEdge?.bundles) || !packedEdge.bundles.length) fail("No packaged edge bundles in .netlify/edge-functions-dist/manifest.json");
  else for (const entry of packedEdge.bundles) {
    if (!entry || typeof entry.asset !== "string" || !/^[a-zA-Z0-9_-]+\.eszip$/.test(entry.asset)) { fail("Invalid packaged edge bundle metadata."); continue; }
    const path = join(root, ".netlify/edge-functions-dist", entry.asset);
    if (!fileExists(path) || statSync(path).size === 0) fail(`Missing packaged edge bundle: ${label(path)}`);
    else result.edgeBundleCount++;
  }
  for (const entry of Array.isArray(edgeFunctions) ? edgeFunctions : []) {
    if (!Array.isArray(packedEdge?.routes) || !packedEdge.routes.some((route) => route?.function === entry?.function)) fail("Packaged edge manifest omits generated middleware route.");
  }
  result.valid = errors.length === 0;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let publishDirectory = ".netlify/static";
  let json = false;
  let validArguments = true;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--json") json = true;
    else if (args[index] === "--publish-dir" && args[index + 1] && !args[index + 1].startsWith("--")) publishDirectory = args[++index];
    else validArguments = false;
  }
  if (!validArguments) { console.error("Unsupported or incomplete artifact verification argument."); process.exitCode = 2; }
  else {
    const result = verifyNetlifyArtifact({ publishDirectory });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Netlify artifact ${result.valid ? "verified" : "rejected"}: ${result.publishDirectory}`);
      console.log(`Build ${result.buildId ?? "unavailable"}; ${result.staticAssetCount} JS/CSS assets; ${result.publicFontCount + result.bundledFontCount} fonts; ${result.functionArchiveCount} function ZIPs; ${result.edgeBundleCount} edge bundles.`);
      for (const error of result.errors) console.error(error);
    }
    process.exitCode = result.valid ? 0 : 1;
  }
}
