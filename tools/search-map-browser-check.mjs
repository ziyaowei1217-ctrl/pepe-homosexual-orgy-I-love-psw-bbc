import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3100').origin;
const output = path.resolve(process.argv[3] ?? '.tmp-tests/native-map-check');
await mkdir(output, { recursive: false });
const report = { origin, profiles: [], pass: false, startedAt: new Date().toISOString() };
const save = () => writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const configurations = [
  { name: 'chromium-desktop', engine: chromium, width: 1440, height: 900 },
  { name: 'firefox-desktop', engine: firefox, width: 1440, height: 900 },
  { name: 'chromium-touch-phone', engine: chromium, width: 390, height: 844, touch: true },
  { name: 'webkit-phone-320', engine: webkit, width: 320, height: 900 }
];
try {
 for (const config of configurations) {
  const browser = await config.engine.launch();
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, hasTouch: !!config.touch, isMobile: !!config.touch });
  const page = await context.newPage();
  const result = { name: config.name, checks: [], pageErrors: [], consoleErrors: [], cspViolations: [], pass: false };
  report.profiles.push(result);
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
  await page.addInitScript(() => { window.__mapCsp = []; document.addEventListener('securitypolicyviolation', event => window.__mapCsp.push({ directive: event.effectiveDirective, blocked: event.blockedURI })); });
  const step = async (name, fn) => { const record = { name, pass: false }; result.checks.push(record); await fn(record); record.pass = true; await save(); };
  const map = page.locator('section[aria-label="房源地图"]');
  const viewport = () => map.evaluate(element => ({ lat: Number(element.dataset.mapLat), lng: Number(element.dataset.mapLng), zoom: Number(element.dataset.mapZoom) }));
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('section[aria-label="房源地图"]')?.dataset.mapReady === 'true', null, { timeout: 20000 });
    await page.evaluate(() => new Promise((resolve, reject) => {
      let previous = '', stable = 0, frame;
      const timeout = setTimeout(() => { cancelAnimationFrame(frame); reject(new Error('Native camera did not settle within20s')); }, 20000);
      const observe = () => {
        const element = document.querySelector('section[aria-label="房源地图"]');
        const current = element && [element.dataset.mapLat, element.dataset.mapLng, element.dataset.mapZoom, element.querySelectorAll('img.leaflet-tile').length].join(':');
        stable = current && current === previous && element.dataset.mapReady === 'true' ? stable + 1 : 0;
        previous = current;
        if (stable >= 4) { clearTimeout(timeout); resolve(); } else frame = requestAnimationFrame(observe);
      }; observe();
    }));
  };
  const hit = async locator => { await locator.waitFor({ state: 'visible' }); const box = await locator.boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44); assert.ok(await locator.evaluate(element => { const b = element.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return top === element || element.contains(top); })); await locator.click(); };
  try {
   await step('street-map render and real visible tile decoding', async record => {
    await page.goto(`${origin}/search?q=Los+Angeles&view=map`, { waitUntil: 'domcontentloaded' });
    assert.ok((await page.locator('body').innerText()).includes('均为虚构示例'));
    await ready();
    const v = await viewport(); assert.ok(v.zoom >= 9 && v.zoom <= 14); record.camera = v;
    const tiles = await map.evaluate(async element => {
      const b = element.getBoundingClientRect(), zoom = Math.round(Number(element.dataset.mapZoom));
      const visible = [...element.querySelectorAll('img.leaflet-tile')].filter(tile => { const t = tile.getBoundingClientRect(); return Number(tile.dataset.pswMapTileZoom) === zoom && t.width > 0 && t.height > 0 && t.right > b.left && t.left < b.right && t.bottom > b.top && t.top < b.bottom; });
      if (!visible.length) throw new Error('No current visible native tiles');
      await Promise.all(visible.map(tile => tile.decode()));
      return visible.map(tile => ({ url: tile.src, width: tile.naturalWidth, height: tile.naturalHeight }));
    });
    assert.ok(tiles.every(tile => /^https:\/\/tile\.openstreetmap\.de\/\d+\/\d+\/\d+\.png$/.test(tile.url) && tile.width === 256 && tile.height === 256)); record.tiles = tiles;
    assert.equal(await map.locator('.psw-map-surface').count(), 1);
    assert.equal(await map.locator('.leaflet-control-container').locator('button').count(), 0);
    await page.screenshot({ path: path.join(output, `${config.name}-streets.png`) });
   });
   await step('pointer-anchored wheel zoom follows the street under the pointer', async record => {
    const b = await map.boundingBox(), before = await viewport();
    const pointer = { x: b.x + b.width * .7, y: b.y + b.height * .65 };
    await page.mouse.move(pointer.x, pointer.y); await page.mouse.wheel(0, -120);
    await page.waitForFunction(previous => Number(document.querySelector('section[aria-label="房源地图"]').dataset.mapZoom) > previous, before.zoom);
    await ready(); const after = await viewport();
    const world = (v, zoom) => { const scale = 256 * 2 ** zoom, sine = Math.sin(v.lat * Math.PI / 180); return { x: (v.lng + 180) / 360 * scale, y: (.5 - Math.log((1+sine)/(1-sine)) / (4*Math.PI)) * scale }; };
    const a = world(before, before.zoom), c = world(after, after.zoom), factor = 2 ** (after.zoom - before.zoom);
    const dx = pointer.x - b.x - b.width/2, dy = pointer.y - b.y - b.height/2;
    assert.ok(Math.abs((a.x+dx)*factor-(c.x+dx)) <= 3 && Math.abs((a.y+dy)*factor-(c.y+dy)) <= 3, 'Zoom must preserve pointer geographic anchor'); record.before = before; record.after = after;
   });
   await step('native drag pans and keeps a single surface', async record => {
    const b = await map.boundingBox(), before = await viewport();
    await page.mouse.move(b.x+b.width*.65, b.y+b.height*.55); await page.mouse.down(); await page.mouse.move(b.x+b.width*.65-95, b.y+b.height*.55+30, { steps: 16 }); await page.mouse.up();
    await page.waitForFunction(previous => Math.abs(Number(document.querySelector('section[aria-label="房源地图"]').dataset.mapLng)-previous)>0.001, before.lng);
    await ready(); record.before = before; record.after = await viewport(); assert.equal(await map.locator('.psw-map-surface').count(), 1);
   });
   if (config.touch) await step('two-finger native pinch changes zoom and leaves valid coordinates', async record => {
    const b = await map.boundingBox(), before = await viewport(), cdp = await context.newCDPSession(page);
    const cx=b.x+b.width*.5, cy=b.y+b.height*.6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:cx-25,y:cy,id:1 },{ x:cx+25,y:cy,id:2 }] });
    for (const delta of [30,40,55,70]) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:cx-delta,y:cy,id:1 },{ x:cx+delta,y:cy,id:2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await cdp.detach();
    await page.waitForFunction(previous => Number(document.querySelector('section[aria-label="房源地图"]').dataset.mapZoom)>previous, before.zoom);
    await ready(); record.before=before; record.after=await viewport(); assert.ok(Number.isFinite(record.after.lat) && Number.isFinite(record.after.lng) && record.after.zoom<=18);
   });
   await step('list/map toggle retains the manually positioned map instance and zoom', async record => {
    const before=await viewport(); const surface = await map.locator('.psw-map-surface').elementHandle();
    await hit(page.locator('[aria-label="浏览方式"]').getByRole('button',{name:'列表',exact:true}));
    await map.waitFor({state:'hidden'});
    await hit(page.locator('[aria-label="浏览方式"]').getByRole('button',{name:'地图',exact:true})); await ready();
    const after=await viewport(); assert.equal(after.zoom,before.zoom); assert.ok(Math.abs(after.lng-before.lng)<.02 && Math.abs(after.lat-before.lat)<.02);
    assert.ok(await surface.evaluate(element=>element.isConnected)); record.before=before;record.after=after; await surface.dispose();
   });
   await step('all-results fit recovers pins; preview preserves lease information and detail navigation', async record => {
    await hit(map.getByRole('button',{name:'显示本页全部房源',exact:true})); await ready();
    const firstMarker=map.getByRole('button',{name:/^选择 /}).first(); await firstMarker.waitFor({state:'visible'});
    const markerLabel=await firstMarker.getAttribute('aria-label'); const marker=map.getByRole('button',{name:markerLabel,exact:true}); const opener=await marker.elementHandle(); await hit(marker);
    const preview=page.locator('.search-map-preview'); await preview.waitFor({state:'visible'});
    assert.match(await preview.innerText(), /租期 2026-\d{2}-\d{2} — 202[67]-\d{2}-\d{2}/);
    const link=preview.locator('a'); const href=await link.getAttribute('href'); record.href=href;
    await hit(map.getByRole('button',{name:'关闭地图房源预览',exact:true})); await preview.waitFor({state:'hidden'});
    await page.waitForFunction(element=>document.activeElement===(element.isConnected?element:document.querySelector('section[aria-label="房源地图"]')),opener,{timeout:12000});
    assert.ok(await opener.evaluate(element=>document.activeElement===(element.isConnected?element:document.querySelector('section[aria-label="房源地图"]')))); await opener.dispose();
    await hit(marker); await hit(link); await page.waitForURL(new URL(href,origin).href); assert.equal(new URL(page.url()).pathname,new URL(href,origin).pathname);
   });
   result.cspViolations=await page.evaluate(()=>window.__mapCsp);
   assert.deepEqual(result.pageErrors,[]); assert.deepEqual(result.consoleErrors,[]); assert.deepEqual(result.cspViolations,[]); result.pass=true;
  } catch(error) { result.failure=error.message; await page.screenshot({path:path.join(output,`${config.name}-failure.png`)}).catch(()=>{}); await save(); throw error; }
  finally { await context.close(); await browser.close(); await save(); }
 }
 report.pass=true; report.finishedAt=new Date().toISOString(); await save(); console.log(JSON.stringify({pass:true,profiles:report.profiles.length,checks:report.profiles.reduce((n,p)=>n+p.checks.length,0),output}));
} catch(error) { report.failure=error.message; report.finishedAt=new Date().toISOString(); await save(); throw error; }
