import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";

// Run against a started production-mode demo, with synthetic or disposable data.
// These checks use no account credentials and never mutate application records.
const target = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
  throw new Error("A browser demo HTTP(S) URL without credentials is required.");
}
const routes = ["/", "/search", "/saved", "/account", "/inbox", "/host/listings", "/admin"];
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").origin;
const mediaPath = "/api/v1/listing-media/00000000-0000-4000-8000-000000000001/content";
const viewports = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
  { width: 844, height: 390 }
];
let checked = 0;
let optimizerDenials = 0;

function diagnosticUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? `${url.origin}${url.pathname}` : url.protocol;
  } catch {
    return "unavailable";
  }
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext();
    try {
      for (const source of [mediaPath, new URL(mediaPath, apiOrigin).href]) {
        const url = new URL("/_next/image", target);
        url.search = new URLSearchParams({ url: source, w: "640", q: "75" }).toString();
        const response = await context.request.get(url.href);
        assert.equal(response.status(), 400, `${name} API photo optimizer denial`);
        optimizerDenials += 1;
      }
    } finally {
      await context.close();
    }
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
      const page = await context.newPage();
      const errors = [];
      const failedRequests = [];
      let activeRoute = "browser setup";
      let policy = "";
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => {
        failedRequests.push({ url: diagnosticUrl(request.url()), error: request.failure()?.errorText ?? "request failed" });
        if (failedRequests.length > 10) failedRequests.shift();
      });
      await page.addInitScript(() => {
        window.__browserSmokePolicyViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__browserSmokePolicyViolations.push(event.violatedDirective);
        });
      });
      try {
        for (const route of routes) {
          activeRoute = route;
          policy = "";
          const response = await page.goto(new URL(route, target).href, { waitUntil: "networkidle", timeout: 30_000 });
          assert.equal(response?.status(), 200, `${name} ${route} response`);
          policy = response.headers()["content-security-policy"] ?? "";
          // An HTTP loopback upgrade can silently prevent CSS loading in WebKit;
          // merely checking document status and overflow does not catch that.
          await page.waitForFunction(() => Array.from(document.styleSheets).some((sheet) => {
            try { return sheet.cssRules.length > 0; } catch { return false; }
          }), null, { timeout: 10_000 });
          const state = await page.evaluate(() => ({
            viewport: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            textLength: document.body.innerText.length,
            inlineNonces: Array.from(document.querySelectorAll("script:not([src])"), (script) => script.nonce)
          }));
          assert.ok(state.textLength > 20, `${name} ${route} content`);
          assert.ok(state.scrollWidth <= state.viewport + 1, `${name} ${viewport.width} ${route} horizontal overflow`);
          const nonce = /nonce-([^']+)/.exec(policy)?.[1];
          assert.ok(nonce, `${name} ${route} production CSP nonce`);
          assert.ok(state.inlineNonces.length > 0, `${name} ${route} hydration scripts`);
          assert.ok(state.inlineNonces.every((value) => value === nonce), `${name} ${route} hydration nonces`);
          assert.ok(!/script-src[^;]*unsafe-inline/.test(policy), `${name} ${route} inline script policy`);
          assert.deepEqual(errors, [], `${name} ${route} uncaught errors`);
          if (route === "/search") {
            const filters = page.getByRole("button", { name: /筛选/ }).first();
            await filters.click();
            await page.getByRole("dialog").waitFor({ state: "visible" });
            await page.keyboard.press("Escape");
            await page.getByRole("dialog").waitFor({ state: "hidden" });
          }
          assert.deepEqual(await page.evaluate(() => window.__browserSmokePolicyViolations), [], `${name} ${route} CSP violations`);
          assert.deepEqual(errors, [], `${name} ${route} interaction errors`);
          checked += 1;
        }
      } catch (error) {
        const sheets = await page.evaluate(() => Array.from(document.styleSheets, (sheet) => sheet.href)).catch(() => []);
        // Omit query strings, fragments and URL credentials from CI diagnostics.
        console.error(JSON.stringify({
          browserCheck: `${name} ${viewport.width}x${viewport.height} ${activeRoute}`,
          failedRequests,
          stylesheets: sheets.filter(Boolean).map(diagnosticUrl),
          upgradeInsecureRequests: policy.includes("upgrade-insecure-requests"),
          pageErrors: errors
        }));
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(`${checked} production browser checks and ${optimizerDenials} API photo cache denials passed across Chromium, Firefox and WebKit.`);
