import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";

// Run against a started production-mode demo, with synthetic or disposable data.
// These checks use no account credentials and never mutate application records.
const target = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
  throw new Error("A browser demo HTTP(S) URL without credentials is required.");
}
const routes = ["/", "/search", "/saved", "/account", "/inbox", "/host/listings", "/admin"];
const viewports = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
  { width: 844, height: 390 }
];
let checked = 0;
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.__browserSmokePolicyViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__browserSmokePolicyViolations.push(event.violatedDirective);
        });
      });
      try {
        for (const route of routes) {
          const response = await page.goto(new URL(route, target).href, { waitUntil: "networkidle", timeout: 30_000 });
          assert.equal(response?.status(), 200, `${name} ${route} response`);
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
          const policy = response.headers()["content-security-policy"] ?? "";
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
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(`${checked} production browser checks passed across Chromium, Firefox and WebKit.`);
