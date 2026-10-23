import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error Operator utility is executed directly by Node.
import { verifyNetlifyArtifact } from "../tools/verify-netlify-artifact.mjs";

const cli = fileURLToPath(new URL("../tools/verify-netlify-artifact.mjs", import.meta.url));
const directories: string[] = [];
// A real, small stored ZIP containing handler.js, including its central directory.
const archive = Buffer.from("UEsDBBQAAAAAACEFV112NHSHIQAAACEAAAAKAAAAaGFuZGxlci5qc2V4cG9ydCBjb25zdCBoYW5kbGVyID0gKCkgPT4ge307ClBLAQIUAxQAAAAAACEFV112NHSHIQAAACEAAAAKAAAAAAAAAAAAAACAAQAAAABoYW5kbGVyLmpzUEsFBgAAAAABAAEAOAAAAEkAAAAAAA==", "base64");

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(basePath = "") {
  const root = mkdtempSync(join(tmpdir(), "netlify artifact "));
  directories.push(root);
  const write = (path: string, value: string | Buffer) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const json = (path: string, value: unknown) => write(path, JSON.stringify(value));
  const asset = (reference: string, content = "public compiled asset") => {
    write(`.next/${reference}`, content);
    write(`.netlify/static${basePath}/_next/${reference}`, content);
  };
  write(".next/BUILD_ID", "current-build-id");
  json(".next/routes-manifest.json", { basePath });
  json(".next/app-build-manifest.json", { pages: { "/page": ["static/chunks/page-hash.js", "static/css/style-hash.css"] } });
  json(".next/build-manifest.json", { rootMainFiles: ["static/chunks/shared-hash.js"], lowPriorityFiles: ["static/current-build-id/_buildManifest.js"], pages: { "/_app": ["static/chunks/shared-hash.js"] } });
  for (const reference of ["static/chunks/page-hash.js", "static/css/style-hash.css", "static/chunks/shared-hash.js", "static/current-build-id/_buildManifest.js"]) asset(reference);
  asset("static/media/local-font.woff2", "bundled font");
  for (const file of ["rounded-core.woff2", "slogan.woff2"]) {
    write(`public/fonts/psw/${file}`, "public font");
    write(`.netlify/static${basePath}/fonts/psw/${file}`, "public font");
  }
  write(".netlify/functions/next-handler.zip", archive);
  json(".netlify/functions/manifest.json", { functions: [{ name: "next-handler", path: join(root, ".netlify/functions/next-handler.zip"), runtime: "js", generator: "@netlify/plugin-nextjs@5.16.3", ignoredPrivateField: "do-not-print-this-value" }] });
  json(".netlify/edge-functions/manifest.json", { functions: [{ function: "middleware", pattern: "^/.*" }] });
  write(".netlify/edge-functions/middleware/middleware.js", "export default function middleware() {}");
  json(".netlify/edge-functions-dist/manifest.json", { bundles: [{ asset: "edge-hash.eszip" }], routes: [{ function: "middleware" }] });
  write(".netlify/edge-functions-dist/edge-hash.eszip", "prepared edge bundle");
  return { root, write, json, asset, verify: (publishDirectory = ".netlify/static") => verifyNetlifyArtifact({ projectDirectory: root, publishDirectory }) };
}

describe("prepared Netlify artifact preflight", () => {
  it("accepts matching manifest assets, all public fonts and complete server/edge packaging", () => {
    const result = fixture().verify();
    expect(result).toEqual({ valid: true, buildId: "current-build-id", publishDirectory: ".netlify/static", staticAssetCount: 4,
      publicFontCount: 2, bundledFontCount: 1, functionArchiveCount: 1, edgeFunctionCount: 1, edgeBundleCount: 1, errors: [] });
  });

  it("rejects raw .next output even though its manifest-referenced files exist", () => {
    const f = fixture();
    f.write(".next/server/private-config.json", "DO_NOT_PRINT_PRIVATE_CONTENT");
    const result = f.verify(".next");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unsafe server/build directory in public root: .next/server");
    expect(result.errors).toContain("Missing prepared public asset: .next/_next/static/chunks/page-hash.js");
    expect(JSON.stringify(result)).not.toContain("DO_NOT_PRINT_PRIVATE_CONTENT");
  });

  it.each(["server", "standalone", "cache", "_next/server", "_next/cache"])("rejects exposed build material at %s", (path) => {
    const f = fixture();
    f.write(`.netlify/static/${path}/sensitive-file`, "DO_NOT_PRINT_PRIVATE_CONTENT");
    expect(f.verify().errors).toContain(`Unsafe server/build directory in public root: .netlify/static/${path}`);
  });

  it("requires the current build ID rather than an unrelated prepared build", () => {
    const f = fixture();
    rmSync(join(f.root, ".netlify/static/_next/static/current-build-id"), { recursive: true });
    f.write(".netlify/static/_next/static/previous-build/_buildManifest.js", "old manifest");
    expect(f.verify().errors).toContain("Missing current build ID directory: .netlify/static/_next/static/current-build-id");
  });

  it.each(["chunks/page-hash.js", "css/style-hash.css"])("rejects missing manifest reference %s", (reference) => {
    const f = fixture();
    rmSync(join(f.root, ".netlify/static/_next/static", reference));
    expect(f.verify().errors).toContain(`Missing prepared public asset: .netlify/static/_next/static/${reference}`);
  });

  it("derives new page chunks from the current manifest rather than a fixed chunk list", () => {
    const f = fixture();
    f.asset("static/chunks/new-page-new-hash.js");
    f.json(".next/app-build-manifest.json", { pages: { "/new-page": ["static/chunks/new-page-new-hash.js"] } });
    expect(f.verify().valid).toBe(true);
    rmSync(join(f.root, ".netlify/static/_next/static/chunks/new-page-new-hash.js"));
    expect(f.verify().errors).toContain("Missing prepared public asset: .netlify/static/_next/static/chunks/new-page-new-hash.js");
  });

  it("rejects corrupted copies even when their expected file names are present", () => {
    const f = fixture();
    f.write(".netlify/static/_next/static/chunks/page-hash.js", "wrong bytes with the same expected file name");
    expect(f.verify().errors).toContain("Prepared asset differs from current build: .netlify/static/_next/static/chunks/page-hash.js");
  });

  it.each(["fonts/psw/slogan.woff2", "_next/static/media/local-font.woff2"])("rejects an omitted font at %s", (path) => {
    const f = fixture();
    rmSync(join(f.root, ".netlify/static", path));
    expect(f.verify().errors).toContain(`Missing prepared public asset: .netlify/static/${path}`);
  });

  it("supports a configured Next base path for assets and public fonts", () => {
    expect(fixture("/student-housing").verify().valid).toBe(true);
  });

  it("rejects malformed manifests and unsafe references without reading outside the artifact", () => {
    const f = fixture();
    f.write(".next/build-manifest.json", "not json");
    f.json(".next/app-build-manifest.json", { pages: { "/page": ["static/../../sensitive.js"] } });
    const result = f.verify();
    expect(result.errors).toContain("Missing or invalid JSON metadata: .next/build-manifest.json");
    expect(result.errors).toContain("Invalid static asset reference: .next/app-build-manifest.json");
  });

  it("rejects missing or truncated function archives", () => {
    const f = fixture();
    f.write(".netlify/functions/next-handler.zip", archive.subarray(0, 30));
    expect(f.verify().errors).toContain("Missing or incomplete generated function ZIP: .netlify/functions/next-handler.zip");
    rmSync(join(f.root, ".netlify/functions/next-handler.zip"));
    expect(f.verify().functionArchiveCount).toBe(0);
  });

  it("rejects a missing middleware bundle or route in packaged edge metadata", () => {
    const f = fixture();
    rmSync(join(f.root, ".netlify/edge-functions-dist/edge-hash.eszip"));
    f.json(".netlify/edge-functions-dist/manifest.json", { bundles: [{ asset: "edge-hash.eszip" }], routes: {} });
    const result = f.verify();
    expect(result.errors).toContain("Missing packaged edge bundle: .netlify/edge-functions-dist/edge-hash.eszip");
    expect(result.errors).toContain("Packaged edge manifest omits generated middleware route.");
  });

  it("rejects nested symbolic links instead of publishing material outside the static root", () => {
    const f = fixture();
    mkdirSync(join(f.root, "private"));
    symlinkSync(join(f.root, "private"), join(f.root, ".netlify/static/_next/private-link"), "junction");
    expect(f.verify().errors).toContain("Symbolic link in public tree: .netlify/static/_next/private-link");
  });

  it("prints only verification metadata and paths, and exits nonzero for unsafe roots", () => {
    const f = fixture();
    const result = spawnSync(process.execPath, [cli, "--json"], { cwd: f.root, encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout).valid).toBe(true);
    expect(result.stdout).not.toContain("do-not-print-this-value");
    const unsafe = spawnSync(process.execPath, [cli, "--publish-dir", ".next", "--json"], { cwd: f.root, encoding: "utf8" });
    expect(unsafe.status).toBe(1);
    expect(JSON.parse(unsafe.stdout).valid).toBe(false);
    expect(readFileSync(join(f.root, ".next/BUILD_ID"), "utf8")).toBe("current-build-id");
    const invalid = spawnSync(process.execPath, [cli, "--credential=must-not-print"], { cwd: f.root, encoding: "utf8" });
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).not.toContain("must-not-print");
  });
});
