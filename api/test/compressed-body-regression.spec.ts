import { spawn } from "node:child_process";
import { request } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";

const apiRequire = createRequire(resolve(process.cwd(), "package.json"));
const platformRequire = createRequire(apiRequire.resolve("@nestjs/platform-express/package.json"));
const parserPath = platformRequire.resolve("body-parser");

function send(port: number, body?: Buffer): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", port, path: "/", method: body ? "POST" : "GET",
      ...(body ? { headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Content-Length": body.length } } : {})
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(3_000, () => req.destroy(new Error("Local parser response timed out")));
    req.once("error", reject);
    req.end(body);
  });
}

it("keeps the HTTP process available after a gzip frame with trailing bytes", async () => {
  // Isolate the real middleware in a disposable process: a regressed dependency
  // could throw after replying and terminate the server, beyond a route's catch.
  const child = spawn(process.execPath, ["-e", `
    const http = require('node:http');
    const parse = require(process.argv[1]).json();
    const server = http.createServer((req, res) => {
      if (req.method === 'GET') return res.end('healthy');
      parse(req, res, error => { res.statusCode = error ? 400 : 200; res.end('parsed'); });
    });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));
  `, parserPath], { stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let stderr = "";
  child.stderr.on("data", chunk => { if (stderr.length < 8_192) stderr += String(chunk); });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local parser did not start")), 8_000);
      let stdout = "";
      child.stdout.on("data", chunk => {
        stdout += String(chunk);
        if (/^\d+\s*$/.test(stdout) && stdout.includes("\n")) { clearTimeout(timer); resolve(Number(stdout.trim())); }
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Local parser exited (${code}): ${stderr}`)); });
    });
    const malformed = Buffer.concat([gzipSync(Buffer.from('{"test":true}')), Buffer.from("trailing bytes")]);
    const response = await send(port, malformed);
    // Either accepting the completed frame or rejecting malformed compression
    // is safe; the essential contract is that decoder errors cannot kill HTTP.
    expect([200, 400]).toContain(response.status);
    expect(await send(port)).toEqual({ status: 200, body: "healthy" });
    expect(child.exitCode, stderr).toBeNull();
  } finally {
    child.kill("SIGKILL");
    await closed;
  }
}, 15_000);
