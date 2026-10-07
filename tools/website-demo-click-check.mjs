import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

// Actual pointer navigation on the isolated fictional website. No credentials,
// application records or providers: only synthetic Saved data in fresh contexts.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const startLocal = args.includes("--start-local");
const outputIndex = args.indexOf("--output");
const outputArgument = outputIndex < 0 ? undefined : args[outputIndex + 1];
assert.ok(outputIndex < 0 || outputArgument && !outputArgument.startsWith("--"), "--output requires a fresh directory");
const positional = args.filter((arg, index) => arg !== "--start-local" && arg !== "--output" && !(outputIndex >= 0 && index === outputIndex + 1));
assert.ok(positional.length <= 1, "Usage: website-demo-click-check.mjs [URL] [--start-local] [--output DIRECTORY]");
const target = new URL(positional[0] ?? "http://127.0.0.1:3100");
assert.ok(["http:", "https:"].includes(target.protocol) && !target.username && !target.password, "A credential-free HTTP(S) URL is required");
assert.equal(target.pathname, "/", "Supply the website origin, without a path");
assert.ok(!target.search && !target.hash, "Supply the website origin, without query or fragment");
const origin = target.origin;
const output = path.resolve(outputArgument ?? `.tmp-tests/website-demo-click-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false }); // Never overwrite an earlier failing run.
const repo = fileURLToPath(new URL("../", import.meta.url));
const report = { startedAt: new Date().toISOString(), origin, output, profiles: [], pass: false };
const persist = () => writeFile(path.join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
const profiles = [
  { name: "chromium-desktop", engine: chromium, width: 1440, height: 900 },
  { name: "firefox-desktop", engine: firefox, width: 1440, height: 900 },
  { name: "chromium-short-desktop", engine: chromium, width: 1440, height: 500 },
  { name: "webkit-phone-320", engine: webkit, width: 320, height: 900 },
  { name: "webkit-phone-390", engine: webkit, width: 390, height: 900 },
  { name: "webkit-landscape", engine: webkit, width: 568, height: 320 }
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stockImages = new Set([
  "/photo-1505693416388-ac5ce068fe85", "/photo-1522708323590-d24dbb6b0267",
  "/photo-1560448204-e02f11c3d0e2", "/photo-1493809842364-78817add7ffb",
  "/photo-1484154218962-a197022b5858", "/photo-1512917774080-9991f1c4c750"
]);
function diagnosticUrl(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "invalid URL"; }
}
function stockPhoto(url) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password && url.hostname === "images.unsplash.com" && stockImages.has(url.pathname);
}
function publicImage(url) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password &&
    (stockPhoto(url) ||
      url.hostname === "tile.openstreetmap.de" && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname));
}
function mapTile(url) {
  return publicImage(url) && url.hostname === "tile.openstreetmap.de";
}
function canonicalFavicon(value, expectedOrigin) {
  try {
    const url = new URL(value);
    return url.href === value && !url.username && !url.password && url.origin === expectedOrigin && url.pathname === "/icon.svg" && !url.hash &&
      /^(?:\?[a-f0-9]{16})?$/.test(url.search);
  } catch { return false; }
}
function oldReloadFaviconCancellation(failure, requestDocument, reload, expectedOrigin) {
  return reload?.active === true && canonicalFavicon(reload.url, expectedOrigin) &&
    failure.url === reload.url && failure.type === "image" && failure.error === "NS_BINDING_ABORTED" &&
    typeof requestDocument === "string" && requestDocument.length > 0 && requestDocument === reload.oldDocument;
}
function replacementReloadFavicon(response, reload) {
  return reload?.active === true && typeof reload.newDocument === "string" && reload.newDocument.length > 0 && reload.newDocument !== reload.oldDocument &&
    response.document === reload.newDocument && response.url === reload.url && response.type === "image" &&
    response.status === 200 && /^image\/svg\+xml(?:;|$)/i.test(response.contentType);
}
async function waitReloadFaviconReplacement(reload, responses, checkRuntime) {
  if (!reload.cancellations.length) return;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && !reload.replacement) {
    checkRuntime();
    reload.replacement = responses.find((response) => replacementReloadFavicon(response, reload));
    if (!reload.replacement) await sleep(25);
  }
  assert.ok(reload.replacement, "Canceled old favicon requires same SVG200 response in new document within12s");
}

let ownedServer;
let serverLog = "";
let stoppingServer;
const activeBrowsers = new Set();
async function startOwnedServer() {
  assert.equal(origin, "http://127.0.0.1:3100", "--start-local only owns the loopback3100 server");
  // Refuse to claim or stop another process already serving this port.
  try {
    await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(750) });
    throw new Error("Loopback3100 is already serving; omit --start-local for a separately owned server");
  } catch (error) { if (error.message.startsWith("Loopback3100")) throw error; }
  const require = createRequire(import.meta.url);
  ownedServer = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    cwd: repo, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_WEBSITE_DEMO: "true", NEXT_PUBLIC_API_BASE_URL: "https://demo.invalid/api/v1" }
  });
  const collect = (chunk) => { serverLog = `${serverLog}${chunk.toString()}`.slice(-20_000); };
  ownedServer.stdout.on("data", collect); ownedServer.stderr.on("data", collect);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(ownedServer.exitCode, null, "Owned Next server exited before readiness");
    assert.equal(ownedServer.signalCode, null, "Owned Next server was terminated before readiness");
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(750) });
      if (response.ok && JSON.stringify(await response.json()) === JSON.stringify({ status: "ok", service: "web" })) return;
    } catch { /* The owned listener may still be starting. */ }
    await sleep(200);
  }
  throw new Error("Owned production Next server did not become ready within30s");
}
function stopOwnedServer() {
  stoppingServer ??= stopServer();
  return stoppingServer;
}
async function stopServer() {
  if (!ownedServer) return;
  if (ownedServer.exitCode === null && ownedServer.signalCode === null) {
    const exited = once(ownedServer, "exit"); ownedServer.kill("SIGTERM");
    const stopped = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
    if (!stopped) { ownedServer.kill("SIGKILL"); await exited; }
  }
  await writeFile(path.join(output, "owned-server.log"), serverLog);
}
let interrupted = false;
function onSignal(signal) {
  if (interrupted) return;
  interrupted = true;
  report.pass = false; report.failure = `Interrupted by ${signal}`;
  report.finishedAt = new Date().toISOString();
  void (async () => {
    await Promise.race([Promise.allSettled([...activeBrowsers].map((browser) => browser.close())), sleep(5000)]);
    await stopOwnedServer(); await persist();
  })().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
}
const signalHandlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [signal, () => onSignal(signal)]));
for (const [signal, handler] of signalHandlers) process.once(signal, handler);

async function runProfile(profile) {
  const result = { name: profile.name, viewport: { width: profile.width, height: profile.height }, startedAt: new Date().toISOString(), demoValidated: false,
    steps: [], hits: [], pageErrors: [], consoleErrors: [], rscFaults: [], cspViolations: [], forbiddenRequests: [], assetFailures: [],
    requestFailures: [], speculativePrefetchCancellations: [], canceledRscRequests: [], canceledMapTiles: [], canceledReloadFavicons: [],
    documentTransitions: [], savedReloads: [], faviconResponses: [], cleanupCancellations: [], rscResponses: [], assetResponses: [], settledMapTiles: [], pass: false };
  report.profiles.push(result);
  const browser = await profile.engine.launch(); activeBrowsers.add(browser); result.browserVersion = browser.version();
  let context; let cleaning = false;
  try {
  context = await browser.newContext({ viewport: result.viewport, isMobile: profile.width < 768, hasTouch: profile.width < 768, serviceWorkers: "block" });
  const page = await context.newPage(); page.setDefaultTimeout(12_000); let phase = "initial demo guard";
  const requestDocuments = new WeakMap(); let currentDocument; let savedReload;
  await page.exposeFunction("__recordDemoClickDocument", (document) => {
    currentDocument = document; result.documentTransitions.push({ document, phase, at: new Date().toISOString() });
    if (savedReload?.active && document !== savedReload.oldDocument) savedReload.newDocument = document;
  });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    window.__demoClickDocument = crypto.randomUUID();
    window.__recordDemoClickDocument(window.__demoClickDocument);
  });
  page.on("request", (request) => {
    try { if (request.frame() === page.mainFrame()) requestDocuments.set(request, currentDocument); } catch { /* Unknown owners cannot qualify. */ }
  });
  const assertRuntime = () => {
    for (const name of ["pageErrors", "consoleErrors", "rscFaults", "cspViolations", "forbiddenRequests", "assetFailures"]) assert.deepEqual(result[name], [], `${profile.name} ${phase}: ${name}`);
  };
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const privatePath = url.pathname.startsWith("/api/") && url.pathname !== "/api/health" || url.pathname.includes("/socket.io");
    const external = url.origin !== origin && !(["data:", "blob:"].includes(url.protocol) || request.resourceType() === "image" && publicImage(url));
    const imageSource = url.pathname === "/_next/image" ? url.searchParams.get("url") : null;
    let forbiddenImage = false;
    if (imageSource !== null) {
      try { forbiddenImage = !stockPhoto(new URL(imageSource, origin)); } catch { forbiddenImage = true; }
    }
    if (Object.hasOwn(request.headers(), "authorization") || !["GET", "HEAD"].includes(request.method()) || privatePath || external || forbiddenImage) {
      result.forbiddenRequests.push({ phase, method: request.method(), type: request.resourceType(), url: diagnosticUrl(request.url()) });
      await route.abort("blockedbyclient"); return;
    }
    await route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => {
    result.forbiddenRequests.push({ phase, type: "websocket", url: diagnosticUrl(socket.url()) });
    socket.close({ code: 1008, reason: "Fictional demo check forbids sockets" });
  });
  await page.exposeFunction("__recordDemoClickCsp", (event) => result.cspViolations.push({ phase, ...event }));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => {
    window.__recordDemoClickCsp({ directive: event.violatedDirective, blocked: event.blockedURI });
  }));
  page.on("pageerror", (error) => result.pageErrors.push({ phase, message: error.message }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const fault = { phase, message: message.text().slice(0, 1000) }; result.consoleErrors.push(fault);
    if (/RSC|server component|fetch.*payload/i.test(message.text())) result.rscFaults.push(fault); // Separately retained, still fatal.
  });
  page.on("requestfailed", (request) => {
    const failure = { phase, url: diagnosticUrl(request.url()), type: request.resourceType(), error: request.failure()?.errorText ?? "unknown" };
    result.requestFailures.push(failure);
    const canceled = /abort|cancel/i.test(failure.error); const headers = request.headers();
    if (cleaning && canceled) result.cleanupCancellations.push(failure);
    else if (canceled && headers["next-router-prefetch"] === "1") result.speculativePrefetchCancellations.push(failure);
    // A canceled RSC wire request is retained separately. Every step still must
    // prove its intended URL AND rendered content; active faults stay fatal.
    else if (canceled && headers.rsc === "1") result.canceledRscRequests.push(failure);
    // Navigation/unmount and zoom replace old tile requests. Verify the current
    // fitted map's visible tiles below; non-cancelled/HTTP errors stay fatal.
    else if (canceled && failure.type === "image" && mapTile(new URL(request.url()))) result.canceledMapTiles.push(failure);
    // Firefox can start a favicon for the old Saved document just as reload
    // begins. Accept only this exact cancellation, contingent on a200 SVG
    // response from the replacement document below, with all evidence retained.
    else if (oldReloadFaviconCancellation({ ...failure, url: request.url() }, requestDocuments.get(request), savedReload, origin)) {
      const evidence = { ...failure, url: request.url(), document: requestDocuments.get(request), reloadStartedAt: savedReload.startedAt };
      result.canceledReloadFavicons.push(evidence); savedReload.cancellations.push(evidence);
    }
    else if (["script", "stylesheet", "image", "font"].includes(failure.type)) result.assetFailures.push(failure);
    else if (headers.rsc === "1") result.rscFaults.push(failure);
  });
  page.on("response", (response) => {
    const request = response.request(), type = request.resourceType(), url = new URL(response.url());
    const data = { phase, url: diagnosticUrl(response.url()), status: response.status(), type, contentType: response.headers()["content-type"] ?? "" };
    if (canonicalFavicon(response.url(), origin)) result.faviconResponses.push({ ...data, url: response.url(), document: requestDocuments.get(request) });
    if (request.headers().rsc === "1") { result.rscResponses.push(data); if (response.status() >= 400) result.rscFaults.push(data); }
    if (["script", "stylesheet", "image", "font"].includes(type)) { result.assetResponses.push(data); if (response.status() >= 400) result.assetFailures.push(data); }
    if (url.origin !== origin && type !== "image") result.forbiddenRequests.push(data);
  });
  const wait = (predicate, argument) => page.waitForFunction(predicate, argument, { timeout: 12_000 });
  const atPath = (pathname) => wait((expected) => location.pathname === expected, pathname);
  const visibleHeading = (text) => page.getByRole("heading", { level: 1 }).filter({ hasText: text }).waitFor({ state: "visible" });
  const search = () => page.locator("#result-heading").waitFor({ state: "visible" });
  const decodedVisibleImages = () => wait(() => [...document.images].filter((image) => {
    const box = image.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
  }).every((image) => image.complete && image.naturalWidth > 0));
  const navigation = () => page.getByRole("navigation", { name: profile.width >= 768 ? "主导航" : "手机导航", exact: true });
  const nav = (name) => navigation().getByRole("link", { name, exact: true });
  const logo = () => page.getByRole("link", { name: "psw 首页", exact: true });
  async function currentNavigation(name) {
    await navigation().waitFor({ state: "visible" });
    const selected = navigation().locator('a[aria-current="page"]');
    assert.equal(await selected.count(), name ? 1 : 0, "Exactly the intended destination may be selected");
    if (name) assert.equal(await nav(name).getAttribute("aria-current"), "page", `${name} must remain the current destination`);
  }
  async function privateNotice(heading, name) {
    await visibleHeading(heading);
    const title = page.getByRole("heading", { level: 1 });
    assert.equal(await title.innerText(), heading, "Private section heading matches its route");
    await currentNavigation(name);
    assert.equal(await page.locator("form, input, textarea").count(), 0, "Closed demo section must not collect credentials or private data");
    assert.match(await page.locator("main").innerText(), /暂未开放/, "Closed section explicitly explains availability");
    // Inspect the actual arrival position. Scrolling the title into view here
    // would hide a short-screen layout or restored-history overlap defect.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await title.evaluate((element) => {
      const box = element.getBoundingClientRect(), center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const header = document.querySelector(".marketplace-shell > header")?.getBoundingClientRect();
      const mobile = document.querySelector('nav[aria-label="手机导航"]')?.getBoundingClientRect();
      const target = document.elementFromPoint(center.x, center.y);
      return { path: location.pathname, scrollY, x: box.x, y: box.y, width: box.width, height: box.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight, headerBottom: header?.bottom ?? 0,
        bottomNavigationTop: mobile && mobile.width > 0 && mobile.height > 0 ? mobile.top : innerHeight,
        center, centerHits: target === element || element.contains(target), hitTag: target?.tagName,
        hitLabel: target?.getAttribute("aria-label") };
    });
    result.noticeHeadings ??= [];
    result.noticeHeadings.push({ phase, heading, ...geometry });
    assert.ok(geometry.width > 0 && geometry.height > 0, "Closed section title has visible dimensions");
    assert.ok(geometry.x >= -0.5 && geometry.x + geometry.width <= geometry.viewportWidth + 0.5 &&
      geometry.y >= Math.max(0, geometry.headerBottom) - 0.5 &&
      geometry.y + geometry.height <= Math.min(geometry.viewportHeight, geometry.bottomNavigationTop) + 0.5,
    `Closed section title must initially fit between the header and bottom navigation: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.centerHits, `Closed section title is initially covered: ${JSON.stringify(geometry)}`);
  }
  async function finishSameTabInboxNavigation() {
    if (await nav("消息").getAttribute("data-website-demo-navigation") === "document") {
      // Demo-only document links require their own positive wire proof. The
      // original RSC lifecycle checks below still apply to framework links.
      await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
      const oldDocument = await page.evaluate(() => window.__demoClickDocument);
      const evidence = { startedAt: new Date().toISOString(), path: "/inbox", oldDocument, mode: "document" };
      result.sameTabDocumentNavigations ??= []; result.sameTabDocumentNavigations.push(evidence);
      await directDocumentNavigation("/inbox", async () => {
        const pendingResponse = page.waitForResponse((response) => {
          const request = response.request(), url = new URL(response.url());
          return url.origin === origin && url.pathname === "/inbox" && request.method() === "GET" &&
            request.isNavigationRequest() && request.resourceType() === "document" && request.frame() === page.mainFrame();
        }, { timeout: 12_000 });
        await hit(nav("消息"), "Repeat navigation 消息", { scroll: false });
        const response = await pendingResponse;
        Object.assign(evidence, { url: response.url(), status: response.status(), method: response.request().method(),
          type: response.request().resourceType(), contentType: response.headers()["content-type"] ?? "",
          policy: response.headers()["content-security-policy"] ?? "", cacheControl: response.headers()["cache-control"] ?? "" });
        assert.equal(evidence.status, 200, "Same-tab document link response200");
        assert.match(evidence.contentType, /^text\/html(?:;|$)/i, "Same-tab document link serves HTML");
        assert.match(evidence.cacheControl, /\bno-store\b/i, "Same-tab document preserves private no-store policy");
        assert.match(evidence.cacheControl, /\bprivate\b/i, "Same-tab document is privately cached");
        assert.match(evidence.policy, /'nonce-[A-Za-z0-9+\/_=-]+'/i, "Same-tab document receives a nonce security policy");
        assert.ok(evidence.policy.includes("'strict-dynamic'"), "Same-tab document preserves strict dynamic script policy");
        assert.match(evidence.policy, /(?:^|;)\s*connect-src\s+'self'\s*(?:;|$)/, "Same-tab demo cannot connect to private or external services");
        const scriptPolicy = evidence.policy.split(";").find((directive) => directive.trim().startsWith("script-src "));
        assert.ok(scriptPolicy && !scriptPolicy.includes("'unsafe-inline'"), "Same-tab document has no unsafe inline script permission");
        assert.equal(await response.finished(), null, "Same-tab document response body finishes without error");
        evidence.finishedAt = new Date().toISOString();
        await atPath("/inbox"); await privateNotice("消息", "消息");
        evidence.newDocument = await page.evaluate(() => window.__demoClickDocument);
        assert.equal(typeof evidence.newDocument, "string", "Same-tab document identity is known");
        assert.ok(evidence.newDocument.length > 0, "Same-tab document identity is nonempty");
        assert.notEqual(evidence.newDocument, oldDocument, "Same-tab demo notice creates a fresh document");
        assertRuntime();
      });
      return;
    }
    const document = await page.evaluate(() => window.__demoClickDocument);
    assert.equal(typeof document, "string", "Known same-tab inbox document identity");
    assert.ok(document.length > 0, "Same-tab inbox document identity is nonempty");
    const evidence = { startedAt: new Date().toISOString(), path: "/inbox", document };
    result.sameTabRefreshes ??= []; result.sameTabRefreshes.push(evidence);
    let observed; let observedResponse; let settled = false; let resolveCompletion;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    const finish = (outcome) => {
      if (!settled) { settled = true; evidence.responseObservedBeforeTerminal = Boolean(observedResponse); resolveCompletion(outcome); }
    };
    const onRequest = (request) => {
      const url = new URL(request.url()), headers = request.headers();
      if (observed || url.origin !== origin || url.pathname !== "/inbox" || request.method() !== "GET" ||
        request.resourceType() !== "fetch" || headers.rsc !== "1" || headers["next-router-prefetch"] !== undefined ||
        headers["next-router-segment-prefetch"] !== undefined || !headers["next-router-state-tree"] || requestDocuments.get(request) !== document) return;
      observed = request;
      Object.assign(evidence, { requestedAt: new Date().toISOString(), url: request.url(), method: request.method(), type: request.resourceType(),
        ownerDocument: requestDocuments.get(request), rsc: headers.rsc, prefetch: headers["next-router-prefetch"] ?? null,
        segmentPrefetch: headers["next-router-segment-prefetch"] ?? null, routerStateTree: headers["next-router-state-tree"] });
    };
    const onResponse = (response) => {
      if (response.request() === observed) {
        observedResponse = response;
        Object.assign(evidence, { responseAt: new Date().toISOString(), status: response.status(), contentType: response.headers()["content-type"] ?? "" });
      }
    };
    const onFinished = (request) => { if (request === observed) { evidence.finishedAt = new Date().toISOString(); finish("finished"); } };
    const onFailed = (request) => {
      if (request === observed) { evidence.failedAt = new Date().toISOString(); evidence.error = request.failure()?.errorText ?? "unknown"; finish("failed"); }
    };
    page.on("request", onRequest); page.on("response", onResponse); page.on("requestfinished", onFinished); page.on("requestfailed", onFailed);
    const timeout = setTimeout(() => finish("timeout"), 12_000);
    try {
      // The existing heading and URL cannot prove a same-tab refresh completed.
      // Observe this click's new RSC request before deliberately reloading next.
      await hit(nav("消息"), "Repeat navigation 消息", { scroll: false });
      evidence.outcome = await completion;
      assert.ok(["finished", "failed"].includes(evidence.outcome), `Same-tab inbox request lifecycle must settle within12s: ${JSON.stringify(evidence)}`);
      const response = await observed.response();
      assert.ok(response, "Same-tab inbox navigation requires an actual response");
      assert.equal(evidence.responseObservedBeforeTerminal, true, "Same-tab inbox payload response precedes its terminal event");
      assert.equal(response, observedResponse, "Same-tab inbox response is observed before its terminal event");
      evidence.status = response.status(); evidence.contentType = response.headers()["content-type"] ?? "";
      assert.equal(evidence.status, 200, "Same-tab inbox response200");
      assert.match(evidence.contentType, /^text\/x-component(?:;|$)/i, "Same-tab inbox response is the framework payload");
      const chromiumPayloadCancellation = profile.engine === chromium && evidence.outcome === "failed" && evidence.error === "net::ERR_ABORTED";
      evidence.settlement = evidence.outcome === "finished" ? "response-finished" : chromiumPayloadCancellation ? "chromium-response-canceled-after200" : "rejected";
      // Local Chromium can record ERR_ABORTED after the framework reader has
      // consumed the200 payload through EOF. Wait for that exact owned request's
      // terminal event; retain every global fault rule and the rendered checks.
      assert.ok(evidence.outcome === "finished" || chromiumPayloadCancellation, `Same-tab inbox requires successful or verified Chromium payload settlement: ${JSON.stringify(evidence)}`);
      if (evidence.outcome === "finished") assert.equal(await response.finished(), null, "Same-tab inbox response body finishes without error");
      assert.equal(await page.evaluate(() => window.__demoClickDocument), document, "Same-tab inbox navigation preserves its document");
      await atPath("/inbox"); await privateNotice("消息", "消息");
      assertRuntime();
    } finally {
      clearTimeout(timeout); page.off("request", onRequest); page.off("response", onResponse); page.off("requestfinished", onFinished); page.off("requestfailed", onFailed);
    }
  }
  async function directDocumentNavigation(href, action) {
    const favicon = new URL(await page.locator('link[rel="icon"]').getAttribute("href"), origin).href;
    assert.ok(canonicalFavicon(favicon, origin), "Direct navigation requires the exact canonical favicon");
    currentDocument = await page.evaluate(() => window.__demoClickDocument);
    assert.equal(typeof currentDocument, "string", "Known old direct-navigation document identity");
    assert.ok(currentDocument.length > 0, "Direct-navigation document identity is nonempty");
    const transition = { active: true, startedAt: new Date().toISOString(), oldDocument: currentDocument, url: favicon,
      destination: new URL(href, origin).pathname, cancellations: [] };
    savedReload = transition;
    result.directDocumentNavigations ??= []; result.directDocumentNavigations.push(transition);
    try {
      // Every new direct-document case uses the existing strict old-favicon
      // ownership and replacement proof, without admitting other asset faults.
      await action();
      transition.newDocument = await page.evaluate(() => window.__demoClickDocument);
      assert.notEqual(transition.newDocument, transition.oldDocument, "Direct navigation creates a fresh document");
      if (transition.cancellations.length) await waitReloadFaviconReplacement(transition, result.faviconResponses, assertRuntime);
    } finally { transition.active = false; }
  }
  async function hit(control, label, { scroll = true, fully = true } = {}) {
    await control.waitFor({ state: "visible" });
    if (scroll) await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await control.evaluate((element) => {
      const box = element.getBoundingClientRect(), center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const target = document.elementFromPoint(center.x, center.y);
      return { x: box.x, y: box.y, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        center, centerHits: target === element || element.contains(target), hitTag: target?.tagName, hitLabel: target?.getAttribute("aria-label"), hitClass: typeof target?.className === "string" ? target.className : "" };
    });
    result.hits.push({ phase, label, ...geometry });
    assert.ok(geometry.width >= 43.5 && geometry.height >= 43.5, `${label} requires >=44px width and height`);
    if (fully) assert.ok(geometry.x >= -0.5 && geometry.y >= -0.5 && geometry.x + geometry.width <= geometry.viewportWidth + 0.5 && geometry.y + geometry.height <= geometry.viewportHeight + 0.5, `${label} must be fully in viewport`);
    assert.ok(geometry.centerHits, `${label} center is covered or outside the viewport: ${JSON.stringify(geometry)}`);
    // Locator.click/tap can auto-scroll after measurement, masking a covered
    // control. Click the measured viewport point without changing the frame.
    if (profile.width < 768) await page.touchscreen.tap(geometry.center.x, geometry.center.y);
    else await page.mouse.click(geometry.center.x, geometry.center.y);
  }
  async function step(name, action) {
    phase = name; const entry = { name, startedAt: new Date().toISOString(), pass: false }; result.steps.push(entry);
    await action(); assertRuntime();
    entry.state = await page.evaluate(() => ({ path: location.pathname, query: location.search, heading: document.querySelector("h1")?.innerText,
      searchInput: document.querySelector("input[name=q]")?.value, gallery: document.querySelector('[role="dialog"] [role="status"]')?.textContent,
      currentNavigation: [...document.querySelectorAll('nav a[aria-current="page"]')].map((link) => ({ href: link.getAttribute("href"), label: link.textContent?.trim() })),
      focused: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 100) }));
    entry.pass = true; entry.finishedAt = new Date().toISOString(); await persist();
  }
  try {
    const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assert.equal(response?.status(), 200, "Demo homepage200");
    const banner = page.locator('aside[aria-label="演示版说明"]'); await banner.waitFor({ state: "visible" });
    const disclosure = await banner.innerText(); assert.match(disclosure, /均为虚构示例/); assert.match(disclosure, /不提供登录、聊天、申请或付款/);
    result.demoValidated = true; result.initialHeaders = await response.headersArray();
    const policy = response.headers()["content-security-policy"] ?? "", nonce = /nonce-([^']+)/.exec(policy)?.[1];
    assert.ok(nonce && policy.includes("'strict-dynamic'") && /(?:^|;)\s*connect-src\s+'self'\s*(?:;|$)/.test(policy) && !/script-src[^;]*unsafe-inline/.test(policy), "Production demo CSP");
    assert.ok(["private", "no-store"].every((token) => (response.headers()["cache-control"] ?? "").includes(token)), "Demo document private/no-store");
    const crawl = result.initialHeaders.filter((header) => header.name.toLowerCase() === "x-robots-tag").flatMap((header) => header.value.toLowerCase().split(",").map((token) => token.trim()));
    assert.ok(["noindex", "nofollow", "noarchive"].every((token) => crawl.includes(token)), "Fictional demo crawl boundary");
    await wait(() => [...document.styleSheets].some((sheet) => { try { return sheet.cssRules.length > 0; } catch { return false; } }));
    await visibleHeading("留学生转租");
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    // Prove a client handler is hydrated before testing same-route AppRouter reuse.
    const location = page.getByRole("combobox", { name: "想住在哪里？", exact: true }); await location.click();
    await page.getByRole("listbox", { name: "地点建议", exact: true }).waitFor({ state: "visible" }); await location.press("Escape");
    await step("Boston actual city link", async () => {
      await hit(page.getByRole("link", { name: "Boston", exact: true }), "Boston city");
      await search(); await wait(() => location.pathname === "/search" && document.querySelector("input[name=q]")?.value === "Boston" && document.querySelector("#result-heading")?.innerText.includes("Boston"));
    });
    await step("Global navigation resets rendered search", async () => {
      await hit(nav("转租"), "Global 转租", { scroll: false });
      await wait(() => location.pathname === "/search" && !location.search && document.querySelector("input[name=q]")?.value === "" && document.querySelector("#result-heading")?.innerText === "全部地区的可租房源");
      assert.ok(await page.locator("article").count() > 6, "Global search must restore more than Boston's6results");
      await currentNavigation("转租");
    });
    for (const [name, pathname, heading] of [["室友", "/roommates", "找到合拍的室友"], ["收藏", "/saved", "收藏清单"], ["消息", "/inbox", "消息"], ["我的", "/account", "我的账户"]]) {
      await step(`Navigation ${name} changes visible UI`, async () => {
        await hit(nav(name), `Navigation ${name}`, { scroll: false }); await atPath(pathname); await visibleHeading(heading);
        await currentNavigation(name);
        if (name === "消息" || name === "我的") await privateNotice(heading, name);
      });
      if (name === "室友") await step("Actual roommate demo action preserves Roommates context", async () => {
        await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
        await hit(page.getByRole("link", { name: "演示说明", exact: true }), "Roommate demo action");
        await atPath("/roommates/likes"); await privateNotice("室友互动", "室友");
        await page.goBack({ waitUntil: "domcontentloaded" }); await atPath("/roommates"); await visibleHeading("找到合拍的室友");
        await currentNavigation("室友"); await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
      });
    }
    await step("Repeated Messages Account Messages and same-tab navigation", async () => {
      let index = 0;
      for (const [name, pathname, heading] of [["消息", "/inbox", "消息"], ["我的", "/account", "我的账户"], ["消息", "/inbox", "消息"], ["消息", "/inbox", "消息"]]) {
        if (index === 3) await finishSameTabInboxNavigation();
        else await hit(nav(name), `Repeat navigation ${name}`, { scroll: false });
        await atPath(pathname); await privateNotice(heading, name); index += 1;
      }
    });
    await step("Messages reload preserves route heading and current tab", async () => {
      await page.waitForLoadState("networkidle", { timeout: 12_000 });
      const favicon = new URL(await page.locator('link[rel="icon"]').getAttribute("href"), origin).href;
      assert.ok(canonicalFavicon(favicon, origin), "Exact canonical Messages favicon");
      currentDocument = await page.evaluate(() => window.__demoClickDocument);
      assert.equal(typeof currentDocument, "string", "Known old Messages document identity");
      savedReload = { active: true, startedAt: new Date().toISOString(), oldDocument: currentDocument, url: favicon, cancellations: [] };
      result.messagesReloads ??= []; result.messagesReloads.push(savedReload);
      try {
        await page.reload({ waitUntil: "domcontentloaded" }); await atPath("/inbox"); await privateNotice("消息", "消息");
        await page.waitForLoadState("networkidle", { timeout: 12_000 });
        savedReload.newDocument = await page.evaluate(() => window.__demoClickDocument);
        assert.notEqual(savedReload.newDocument, savedReload.oldDocument, "Messages reload creates a fresh document");
        if (savedReload.cancellations.length) await waitReloadFaviconReplacement(savedReload, result.faviconResponses, assertRuntime);
      } finally { savedReload.active = false; }
    });
    await step("Account icon opens its own closed account section", async () => {
      await hit(page.locator("header").getByRole("link", { name: "打开账户", exact: true }), "Account icon", { scroll: false });
      await atPath("/account"); await privateNotice("我的账户", "我的");
    });
    await step("Back Forward preserve Messages and Account section identity", async () => {
      await page.goBack({ waitUntil: "domcontentloaded" }); await atPath("/inbox"); await privateNotice("消息", "消息");
      await page.goForward({ waitUntil: "domcontentloaded" }); await atPath("/account"); await privateNotice("我的账户", "我的");
    });
    const privateMarker = "demo-navigation-query-marker";
    for (const [href, heading, name] of [
      [`/inbox/demo-conversation?section=account&text=${privateMarker}`, "消息", "消息"],
      [`/account/profile?section=inbox&email=${privateMarker}`, "我的账户", "我的"],
      [`/messages?conversationId=${privateMarker}`, "消息", "消息"],
      [`/roommates/likes?section=account&note=${privateMarker}`, "室友互动", "室友"],
      [`/host/listings/new?section=inbox&note=${privateMarker}`, "房东中心", "我的"],
      [`/applications/new?section=inbox&listingId=${privateMarker}`, "转租申请", "我的"],
      ["/demo", "这个演示仅供浏览", undefined],
      ["/unknown-demo-section", "这个演示仅供浏览", undefined]
    ]) {
      await step(`Direct closed route ${new URL(href, origin).pathname} keeps its context`, async () => {
        await directDocumentNavigation(href, async () => {
          const response = await page.goto(new URL(href, origin).href, { waitUntil: "domcontentloaded" });
          assert.equal(response?.status(), 200, "Closed route serves its inert notice");
          await atPath(new URL(href, origin).pathname); await privateNotice(heading, name);
          assert.ok(!(await page.locator("main").innerText()).includes(privateMarker), "Original private query values must not appear in notice content");
          await page.waitForLoadState("networkidle", { timeout: 12_000 });
        });
      });
    }
    await step("Demo recovery clicks back to search", async () => { await hit(page.getByRole("link", { name: "浏览房源", exact: true }), "Demo recovery"); await atPath("/search"); await search(); });
    let listingTitle; let listingPath;
    await step("Actual listing card opens detail", async () => {
      const card = page.locator('article a[href^="/listing/"]').filter({ has: page.locator("h2") }).first(); listingTitle = await card.locator("h2").innerText();
      listingPath = new URL(await card.getAttribute("href"), origin).pathname;
      await hit(card, "Listing card", { fully: false }); await atPath(listingPath); await visibleHeading(listingTitle);
    });
    await step("Sequential gallery tile Escape all-photos focus", async () => {
      const tile = page.getByRole("button", { name: "查看图片 1", exact: true }); await hit(tile, "Gallery tile", { fully: false });
      const dialog = page.getByRole("dialog", { name: "全部图片", exact: true }); await dialog.waitFor({ state: "visible" });
      assert.match(await dialog.getByRole("status").innerText(), /^1\s*\/\s*\d+$/);
      await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert.ok(await tile.evaluate((element) => element === document.activeElement), "Escape restores the actual gallery tile opener");
      const all = page.locator("#listing-photos").getByRole("button", { name: /^查看全部图片/ });
      await hit(all, "All-photos after focused tile Escape"); await dialog.waitFor({ state: "visible" });
      const count = Number((await dialog.getByRole("status").innerText()).split("/")[1]);
      if (count > 1) { await hit(dialog.getByRole("button", { name: "下一张图片", exact: true }), "Next gallery photo"); assert.match(await dialog.getByRole("status").innerText(), /^2\s*\//); }
      await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert.ok(await all.evaluate((element) => element === document.activeElement), "Escape restores all-photos opener");
    });
    if (profile.width < 768) await step("Date dialog restores mobile pointer opener", async () => {
      const editor = page.getByRole("button", { name: "编辑租期", exact: true }); await hit(editor, "Mobile date editor");
      const dialog = page.getByRole("dialog", { name: "选择租期", exact: true }); await dialog.waitFor({ state: "visible" });
      await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert.ok(await editor.evaluate((element) => element === document.activeElement), "Date Escape restores its pointer opener, not previous photo");
    });
    for (const [label, pathname, heading, name] of [["联系房东", "/inbox", "消息", "消息"], ["申请租住", "/applications/new", "转租申请", "我的"]]) {
      await step(`Actual listing ${label} keeps its destination and returns to original detail`, async () => {
        await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
        const detail = new URL(page.url());
        const action = page.getByRole("link", { name: label, exact: true });
        const destination = new URL(await action.getAttribute("href"), origin);
        assert.equal(destination.pathname, pathname, "Listing action points to its intended closed section");
        await hit(action, `Listing ${label}`); await atPath(pathname); await privateNotice(heading, name);
        assert.equal(new URL(page.url()).search, destination.search, "Listing action preserves its intended URL query");
        await page.goBack({ waitUntil: "domcontentloaded" }); await atPath(listingPath); await visibleHeading(listingTitle);
        assert.equal(new URL(page.url()).search, detail.search, "Back restores the original listing dates and URL");
        await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
      });
    }
    await step("Synthetic device Saved toggles visibly", async () => { await hit(page.getByRole("button", { name: "收藏房源", exact: true }), "Save fictional listing"); await page.getByRole("button", { name: "取消收藏房源", exact: true }).waitFor({ state: "visible" }); });
    await step("Saved navigation preserves synthetic listing", async () => {
      const saved = profile.width < 768 ? page.getByRole("navigation", { name: "手机快捷导航", exact: true }).getByRole("link", { name: "收藏房源", exact: true }) : nav("收藏");
      await hit(saved, "Saved navigation", { scroll: false }); await atPath("/saved"); await visibleHeading("收藏清单"); await page.getByRole("heading", { level: 3, name: listingTitle, exact: true }).waitFor({ state: "visible" });
    });
    await step("Reload retains only current-device synthetic Saved", async () => {
      // Bring the Saved photo into view before reload. A short screen can leave
      // it below the fold, so a visible-image check alone would miss its lazy load.
      await page.getByRole("img", { name: listingTitle, exact: true }).evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
      await decodedVisibleImages(); await page.waitForLoadState("networkidle", { timeout: 12_000 });
      const favicon = new URL(await page.locator('link[rel="icon"]').getAttribute("href"), origin).href;
      assert.ok(canonicalFavicon(favicon, origin), "Exact canonical Saved favicon");
      currentDocument = await page.evaluate(() => window.__demoClickDocument);
      assert.equal(typeof currentDocument, "string", "Known old Saved document identity");
      savedReload = { active: true, startedAt: new Date().toISOString(), oldDocument: currentDocument, url: favicon, cancellations: [] };
      result.savedReloads.push(savedReload);
      try {
        await page.reload({ waitUntil: "domcontentloaded" }); await visibleHeading("收藏清单");
        await page.getByRole("heading", { level: 3, name: listingTitle, exact: true }).waitFor({ state: "visible" });
        await page.getByRole("img", { name: listingTitle, exact: true }).evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
        await decodedVisibleImages();
        savedReload.newDocument = await page.evaluate(() => window.__demoClickDocument);
        assert.notEqual(savedReload.newDocument, savedReload.oldDocument, "Reload creates a fresh document");
        // With no cancellation, close the reload window synchronously; yielding
        // could admit a late cancellation without ever requiring replacement.
        if (savedReload.cancellations.length) await waitReloadFaviconReplacement(savedReload, result.faviconResponses, assertRuntime);
      } finally { savedReload.active = false; }
    });
    await step("Saved listing click opens its detail", async () => { await hit(page.locator('article a[href^="/listing/"]').filter({ has: page.locator("img") }).first(), "Saved listing image card", { fully: false }); await atPath(listingPath); await visibleHeading(listingTitle); });
    await step("Detail return restores actual search", async () => { await hit(page.getByRole("link", { name: "返回搜索", exact: true }), "Return search"); await atPath("/search"); await search(); });
    await step("Native Back Forward restore visible detail search", async () => { await page.goBack({ waitUntil: "domcontentloaded" }); await atPath(listingPath); await visibleHeading(listingTitle); await page.goForward({ waitUntil: "domcontentloaded" }); await atPath("/search"); await search(); });
    await step("Actual map switch and control hit targets", async () => {
      const toggle = page.locator('[aria-label="浏览方式"]').getByRole("button", { name: "地图", exact: true }); await hit(toggle, "Map switch", { scroll: false });
      const map = page.locator('section[aria-label="房源地图"][data-view="map"]'); await map.waitFor({ state: "visible" }); assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      const existingPreview = page.locator(".search-map-preview");
      if (await existingPreview.isVisible()) {
        await hit(map.getByRole("button", { name: "关闭地图房源预览", exact: true }), "Close retained map preview", { scroll: false });
        await existingPreview.waitFor({ state: "hidden" }); await wait(() => !new URL(location.href).searchParams.has("selected"));
      }
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // The default city focus is useful at street scale. This original
      // all-results control and cluster journey deliberately fits the full page.
      await hit(map.getByRole("button", { name: "显示本页全部房源", exact: true }), "Fit full page before existing map control journey", { scroll: false });
      await wait(() => {
        const element = document.querySelector('section[aria-label="房源地图"][data-view="map"]');
        return element?.querySelector('[style*="background-image"]') || element?.dataset.mapReady === "true";
      });
      const nativeTiles = await map.locator("img.leaflet-tile").count() > 0;
      const initialZoom = await map.evaluate((element) => {
        const background = element.querySelector('[style*="background-image"]');
        if (background) return Number(/openstreetmap\.de\/(\d+)\//.exec(background.style.backgroundImage)?.[1]);
        const zoom = Math.round(Number(element.dataset.mapZoom));
        const tile = [...element.querySelectorAll("img.leaflet-tile")].find((image) => Number(image.dataset.pswMapTileZoom) === zoom);
        return Number(/openstreetmap\.de\/(\d+)\//.exec(tile?.currentSrc || tile?.src || "")?.[1]);
      });
      assert.ok(Number.isInteger(initialZoom) && initialZoom >= 2, "Initial fitted map zoom");
      for (const [label, expectedZoom] of [["放大地图", initialZoom + 1], ["缩小地图", initialZoom], ["显示本页全部房源", initialZoom]]) {
        await hit(map.getByRole("button", { name: label, exact: true }), label, { scroll: false });
        if (!nativeTiles) await wait((expected) => document.querySelector('section[aria-label="房源地图"][data-view="map"] [style*="background-image"]')?.style.backgroundImage.includes(`openstreetmap.de/${expected}/`), expectedZoom);
        else await wait((expected) => {
          const element = document.querySelector('section[aria-label="房源地图"][data-view="map"]');
          if (!element || Number(element.dataset.mapZoom) !== expected || element.dataset.mapReady !== "true") return false;
          const frame = element.getBoundingClientRect();
          const current = [...element.querySelectorAll("img.leaflet-tile")].filter((image) => {
            const box = image.getBoundingClientRect();
            return Number(image.dataset.pswMapTileZoom) === expected && box.width > 0 && box.height > 0 && box.right > frame.left && box.left < frame.right && box.bottom > frame.top && box.top < frame.bottom;
          });
          return current.length > 0 && current.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && (image.currentSrc || image.src).includes(`openstreetmap.de/${expected}/`));
        }, expectedZoom);
      }
      result.settledMapTiles = await map.evaluate(async (element) => {
        const frame = element.getBoundingClientRect();
        const backgroundUrls = [...element.querySelectorAll('[style*="background-image"]')].flatMap((tile) => {
          const box = tile.getBoundingClientRect();
          if (box.right <= frame.left || box.left >= frame.right || box.bottom <= frame.top || box.top >= frame.bottom) return [];
          const match = /^url\(["']?(.*?)["']?\)$/.exec(tile.style.backgroundImage);
          return match ? [match[1]] : [];
        });
        const currentZoom = Math.round(Number(element.dataset.mapZoom));
        const nativeUrls = [...element.querySelectorAll("img.leaflet-tile")].flatMap((tile) => {
          const box = tile.getBoundingClientRect();
          if (box.width <= 0 || box.height <= 0 || box.right <= frame.left || box.left >= frame.right || box.bottom <= frame.top || box.top >= frame.bottom) return [];
          const value = tile.currentSrc || tile.src;
          // A retiring grid is excluded only when BOTH native tile coordinates
          // and its approved provider URL prove the same different integer z.
          // Unknown URLs, missing metadata and failed current tiles are retained.
          const url = new URL(value, location.href);
          const parsedZoom = Number(/^\/(\d+)\/\d+\/\d+\.png$/.exec(url.pathname)?.[1]);
          const recordedZoom = Number(tile.dataset.pswMapTileZoom);
          if (url.protocol === "https:" && !url.port && !url.username && !url.password && !url.search && !url.hash && url.hostname === "tile.openstreetmap.de" &&
              Number.isInteger(recordedZoom) && recordedZoom === parsedZoom && Number.isInteger(currentZoom) && recordedZoom !== currentZoom) return [];
          return [value];
        });
        const urls = [...new Set([...backgroundUrls, ...nativeUrls])];
        if (!urls.length) throw new Error("Settled active map has no visible tile backgrounds");
        return Promise.all(urls.map((url) => new Promise((resolve, reject) => {
          const image = new Image();
          const timeout = setTimeout(() => reject(new Error(`Active map tile did not decode within12s: ${url}`)), 12_000);
          image.onload = () => { clearTimeout(timeout); image.naturalWidth > 0 ? resolve({ url, width: image.naturalWidth, height: image.naturalHeight }) : reject(new Error(`Empty active map tile: ${url}`)); };
          image.onerror = () => { clearTimeout(timeout); reject(new Error(`Active map tile failed: ${url}`)); };
          image.src = url;
        })));
      });
      assert.ok(result.settledMapTiles.every((tile) => mapTile(new URL(tile.url)) && tile.width > 0 && tile.height > 0), "Every visible fitted-map tile is an approved decoded image");
    });
    await step("Map cluster actual row selection opens matching preview", async () => {
      const map = page.locator('section[aria-label="房源地图"]'); const cluster = map.getByRole("button", { name: /^查看此区域 \d+ 套房源$/ }).first();
      await hit(cluster, "Map cluster", { scroll: false }); const panel = page.locator(".search-map-cluster"); await panel.waitFor({ state: "visible" });
      const row = panel.locator(".search-map-cluster-list button").first(); listingTitle = await row.locator("span").first().innerText();
      await hit(row, "Cluster listing row", { scroll: false }); await panel.waitFor({ state: "hidden" });
      const preview = page.locator(".search-map-preview"); await preview.waitFor({ state: "visible" }); assert.ok((await preview.innerText()).includes(listingTitle), "Preview must show selected cluster row title");
    });
    await step("Map preview center actually navigates to matching detail", async () => {
      const link = page.locator('.search-map-preview a[href^="/listing/"]'); const href = new URL(await link.getAttribute("href"), origin);
      await hit(link, "Selected map preview center", { scroll: false }); await visibleHeading(listingTitle); assert.equal(new URL(page.url()).pathname, href.pathname);
    });
    await step("Final return leaves usable search controls", async () => {
      await hit(page.getByRole("link", { name: "返回搜索", exact: true }), "Map detail return search");
      await atPath("/search");
      await page.locator('section[aria-label="房源地图"]').waitFor({ state: "visible" });
      await hit(page.locator('[aria-label="浏览方式"]').getByRole("button", { name: "列表", exact: true }), "List switch after map detail", { scroll: false }); await search();
      await hit(logo(), "Logo returns home", { scroll: false }); await atPath("/"); await visibleHeading("留学生转租");
    });
    await step("Canonical stylesheet and visible image delivery", async () => {
      const css = await page.locator('link[rel="stylesheet"]').first().getAttribute("href"); assert.ok(css?.startsWith("/_next/static/"), "Canonical CSS reference");
      const response = await context.request.get(new URL(css, origin).href); assert.equal(response.status(), 200); assert.match(response.headers()["content-type"] ?? "", /text\/css/);
      await wait(() => [...document.images].filter((image) => { const box = image.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0; }).every((image) => image.complete && image.naturalWidth > 0));
      assert.ok(result.assetResponses.some((asset) => asset.type === "script" && asset.status === 200), "Actual JavaScript delivered");
      assert.ok(result.assetResponses.some((asset) => asset.type === "image" && asset.status === 200 && asset.contentType.startsWith("image/")), "Actual canonical images delivered");
    });
    assertRuntime(); result.pass = true; result.finishedAt = new Date().toISOString();
  } catch (error) {
    result.failure = { phase, message: error.message }; result.finishedAt = new Date().toISOString();
    // Never retain a non-demo site's user content if the guard failed.
    if (result.demoValidated) {
      await page.screenshot({ path: path.join(output, `${profile.name}-failure.png`) }).catch(() => {});
      await writeFile(path.join(output, `${profile.name}-failure.html`), await page.content().catch(() => "unavailable"));
      result.failure.state = await page.evaluate(() => ({ path: location.pathname, query: location.search,
        heading: document.querySelector("h1")?.innerText, input: document.querySelector("input[name=q]")?.value,
        focused: document.activeElement?.getAttribute("aria-label"), dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => element.getAttribute("aria-label") || element.querySelector("h2")?.textContent) })).catch(() => null);
    }
    console.error(JSON.stringify({ profile: profile.name, failure: result.failure, lastHits: result.hits.slice(-3),
      pageErrors: result.pageErrors, consoleErrors: result.consoleErrors, rscFaults: result.rscFaults,
      cspViolations: result.cspViolations, forbiddenRequests: result.forbiddenRequests, assetFailures: result.assetFailures }));
    await persist(); throw error;
  }
  } finally {
    cleaning = true;
    try { await context?.close(); } finally { await browser.close(); activeBrowsers.delete(browser); await persist(); }
  }
}

try {
  if (startLocal) await startOwnedServer();
  for (const profile of profiles) await runProfile(profile);
  report.pass = true; report.finishedAt = new Date().toISOString(); await persist();
  const checks = report.profiles.reduce((sum, profile) => sum + profile.steps.length, 0);
  console.log(`${checks} actual-click regression groups passed across${profiles.length} fresh Chromium/Firefox/WebKit profiles. Evidence: ${output}`);
} catch (error) {
  report.failure = error.message; report.finishedAt = new Date().toISOString(); await persist();
  console.error(`Website demo click regression failed: ${error.message}\nEvidence: ${output}`); process.exitCode = 1;
} finally {
  await stopOwnedServer();
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
}
