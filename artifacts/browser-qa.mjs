import { chromium, expect } from '@playwright/test';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const urlArgument = process.argv.indexOf('--url');
const gameURL = process.env.GAME_URL || (urlArgument >= 0 ? process.argv[urlArgument + 1] : 'http://localhost:5173/');
const audit = process.argv.includes('--audit');
const browser = await chromium.launch({ headless: true, args: audit ? ['--remote-debugging-port=9225'] : [], executablePath: process.env.PLAYWRIGHT_CHROME || (existsSync(chromePath) ? chromePath : undefined) });
if (audit) {
  const { default: lighthouse } = await import('lighthouse');
  const result = await lighthouse(gameURL, { port: 9225, output: ['html','json'], logLevel: 'error', onlyCategories: ['performance','accessibility','best-practices','seo'] });
  await writeFile('artifacts/lighthouse.report.html', result.report[0]);
  await writeFile('artifacts/lighthouse.report.json', result.report[1]);
  console.log(JSON.stringify({ scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([key,category]) => [key,category.score * 100])), metrics: { LCP: result.lhr.audits['largest-contentful-paint'].displayValue, CLS: result.lhr.audits['cumulative-layout-shift'].displayValue }, failed: Object.values(result.lhr.audits).filter(item => item.score !== null && item.score < 1 && Array.isArray(item.details?.items)).map(item => ({ id: item.id, title: item.title, score: item.score, details: item.details.items.slice(0,3) })) }));
  await browser.close(); process.exit(0);
}
if (process.argv.includes('--upgrade')) {
  const target = new URL(gameURL);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/dist/' || target.searchParams.get('v') !== '7') {
    await browser.close();
    throw new Error('Upgrade QA requires the local /dist/?v=7 URL.');
  }
  const base = new URL('./', target), workerURL = new URL('sw.js', base).href;
  const legacyWorkerURL = new URL('qa-legacy-sw.js', base).href;
  const fixturePath = 'dist/qa-legacy-sw.js';
  const legacyCache = 'slay-beach-volley-v6', currentCache = 'slay-beach-volley-v7';
  const contexts = [], errors = [];
  let fixtureCreated = false;
  try {
    // Keep the fixture entirely inside the production /dist/ scope. It models
    // The legacy ignoreSearch cache hit without loading any current app code first.
    await writeFile(fixturePath, `const VERSION=${JSON.stringify(legacyCache)};
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION)); self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(VERSION).then(cache => cache.match(event.request, {ignoreSearch:true})).then(cached => cached || fetch(event.request)));
});`, { flag: 'wx' });
    fixtureCreated = true;
    const freshContext = await browser.newContext(); contexts.push(freshContext);
    const freshPage = await freshContext.newPage();
    let freshNavigations = 0;
    freshPage.on('framenavigated', frame => { if (frame === freshPage.mainFrame()) freshNavigations++; });
    freshPage.on('pageerror', error => errors.push(error.message));
    await freshPage.goto(gameURL);
    await freshPage.waitForSelector('body[data-ready="true"]');
    await freshPage.evaluate(async ({ workerURL, scope }) => {
      await caches.open('other-game-cache');
      await navigator.serviceWorker.register(workerURL, { scope });
      await navigator.serviceWorker.ready;
    }, { workerURL, scope: base.pathname });
    await expect.poll(() => freshPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await freshPage.waitForTimeout(600);
    expect(freshNavigations, 'first installation must not force an extra navigation').toBe(1);
    expect(await freshPage.evaluate(() => caches.has('other-game-cache'))).toBe(true);

    const upgradeContext = await browser.newContext(); contexts.push(upgradeContext);
    const upgradePage = await upgradeContext.newPage();
    upgradePage.on('pageerror', error => errors.push(error.message));
    await upgradePage.goto(gameURL);
    await upgradePage.waitForSelector('body[data-ready="true"]');
    await upgradePage.evaluate(async ({ legacyWorkerURL, scope, legacyCache, baseURL, workerURL }) => {
      await navigator.serviceWorker.register(legacyWorkerURL, { scope });
      await navigator.serviceWorker.ready;
      const cache = await caches.open(legacyCache);
      const html = `<!doctype html><html><head><title>Legacy v6 fixture</title></head><body data-legacy="v6"><div id="legacy-marker">Cached v6 app</div><script>
sessionStorage.setItem('volley-legacy-loads', String(Number(sessionStorage.getItem('volley-legacy-loads') || 0) + 1));
if (new URL(location.href).searchParams.get('v') === '7') navigator.serviceWorker.register(${JSON.stringify(workerURL)}, {scope:${JSON.stringify(scope)}}).catch(error => console.error(error));
<\/script></body></html>`;
      await cache.put(baseURL, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v6' } }));
      await cache.put(new URL('index.html', baseURL).href, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v6' } }));
      await caches.open('other-game-cache');
    }, { legacyWorkerURL, scope: base.pathname, legacyCache, baseURL: base.href, workerURL });
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(legacyWorkerURL);

    // An existing v6 game tab must remain open; only the explicit v7 link may
    // be navigated again when the new worker takes control.
    const oldPage = await upgradeContext.newPage();
    const oldURL = new URL(base); oldURL.searchParams.set('v', '6');
    let oldNavigations = 0;
    oldPage.on('framenavigated', frame => { if (frame === oldPage.mainFrame()) oldNavigations++; });
    oldPage.on('pageerror', error => errors.push(error.message));
    await oldPage.goto(oldURL.href); await oldPage.waitForSelector('#legacy-marker');
    expect(oldNavigations).toBe(1);

    let upgradeNavigations = 0, legacyResponseSeen = false;
    upgradePage.on('framenavigated', frame => { if (frame === upgradePage.mainFrame()) upgradeNavigations++; });
    upgradePage.on('response', response => {
      if (response.request().isNavigationRequest() && response.headers()['x-volley-qa'] === 'legacy-v6') legacyResponseSeen = true;
    });
    await upgradePage.goto(gameURL, { waitUntil: 'domcontentloaded' });
    await upgradePage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await expect(upgradePage.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v2');
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(workerURL);
    expect(legacyResponseSeen, 'the first request must actually exercise the stale v6 HTML').toBe(true);
    expect(await upgradePage.evaluate(() => sessionStorage.getItem('volley-legacy-loads'))).toBe('1');
    await upgradePage.waitForTimeout(800);
    expect(upgradeNavigations, 'one upgrade reload is required, without a navigation loop').toBe(2);
    expect(oldNavigations, 'an existing v6 game must not be interrupted').toBe(1);
    await expect(oldPage.locator('#legacy-marker')).toBeVisible();
    const cachesAfter = await upgradePage.evaluate(async ({ legacyCache, currentCache }) => ({
      legacyRemoved: !await caches.has(legacyCache), currentPresent: await caches.has(currentCache), unrelatedPreserved: await caches.has('other-game-cache'),
    }), { legacyCache, currentCache });
    expect(cachesAfter).toEqual({ legacyRemoved: true, currentPresent: true, unrelatedPreserved: true });
    expect(errors).toEqual([]);
    const report = { upgrade: true, staleV6ResponseSeen: legacyResponseSeen, freshInstallNavigations: freshNavigations, upgradeNavigations, existingV6Navigations: oldNavigations, ...cachesAfter, errors };
    await writeFile('artifacts/upgrade-qa-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    if (fixtureCreated) await unlink(fixturePath);
    await browser.close();
  }
  process.exit(0);
}
if (process.argv.includes('--motions')) {
  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
  const motionPage = await motionContext.newPage();
  const errors = [], responses = [];
  motionPage.on('pageerror', error => errors.push(error.message));
  motionPage.on('response', response => { if (response.status() >= 400) responses.push({ status: response.status(), url: response.url() }); });
  try {
    await motionPage.goto(gameURL);
    await motionPage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await expect(motionPage.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v2');
    await expect(motionPage.locator('#game-canvas')).toHaveAttribute('data-animation', 'directional-rig-60');
    const authored = await motionPage.evaluate(async gameURL => {
      const moduleURL = new URL('src/character-motion.js', gameURL);
      const { CharacterAnimator, MOTION_TIMING, CONTACT_PHASE, sampleMotion } = await import(moduleURL.href);
      const { projectCourtPoint } = await import(new URL('src/render.js', gameURL).href);
      const { ROSTER } = await import(new URL('src/roster.js', gameURL).href);
      const manifest = await (await fetch(new URL('assets/motions/manifest.json', gameURL))).json();
      const images = Object.fromEntries(await Promise.all(ROSTER.map(async character => {
        const image = new Image(); image.src = new URL(manifest.characters[character.id].source, moduleURL).href;
        await image.decode(); return [character.id, image];
      })));
      const proof = document.createElement('main'); proof.id = 'motion-proof';
      Object.assign(proof.style, { position: 'absolute', top: '0', left: '0', zIndex: '9999', display: 'block', background: '#e8e3d6', width: '1920px' });
      document.body.append(proof);
      const makeCanvas = (id, width, height) => {
        const canvas = document.createElement('canvas'); canvas.id = id; canvas.width = width; canvas.height = height;
        Object.assign(canvas.style, { display: 'block', width: `${width}px`, height: `${height}px` }); proof.append(canvas);
        return canvas;
      };
      const facings = ['down', 'up', 'left', 'right'];
      const directions = makeCanvas('motion-directions', 1040, 3000);
      const actionCanvases = Object.fromEntries(facings.map(facing => [facing, makeCanvas(`motion-actions-${facing}`, 2160, 3000)]));
      const directionsCtx = directions.getContext('2d');
      const hash = canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let h = 2166136261;
        for (let i = 0; i < pixels.length; i++) h = Math.imul(h ^ pixels[i], 16777619);
        return h >>> 0;
      };
      const alphaShapes = new Map();
      const alphaShape = (id, facing, name) => {
        const key = `${id}/${facing}/${name}`;
        if (alphaShapes.has(key)) return alphaShapes.get(key);
        const part = manifest.characters[id].views[facing].parts[name], [sx, sy, width, height] = part.rect;
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(images[id], sx, sy, width, height, 0, 0, width, height);
        const rgba = ctx.getImageData(0, 0, width, height).data, pixels = [];
        for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) if (rgba[(py * width + px) * 4 + 3] >= 32) pixels.push([px + .5, py + .5]);
        const crownStart = pixels[0]?.[1] || 0, crownColumns = new Set(pixels.filter(([, y]) => y - crownStart < 2).map(([x]) => x));
        const opaqueColumns = pixels.map(([x]) => x), opaqueWidth = Math.max(...opaqueColumns) - Math.min(...opaqueColumns) + 1;
        const shape = { part, pixels, crownCutRatio: crownColumns.size / opaqueWidth }; alphaShapes.set(key, shape); return shape;
      };
      const quantile = (values, at) => { const sorted = values.sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * at)] || 0; };
      const inspectPart = (ctx, id, facing, name, destination) => {
        const { part, pixels } = alphaShape(id, facing, name), [dx, dy, width, height] = destination, transform = ctx.getTransform();
        const map = ([x, y]) => {
          const px = dx + x * width / part.rect[2], py = dy + y * height / part.rect[3];
          return { x: transform.a * px + transform.c * py + transform.e, y: transform.b * px + transform.d * py + transform.f };
        };
        const pivot = map(part.pivot), tip = map(part.tip), length = Math.hypot(tip.x - pivot.x, tip.y - pivot.y);
        const along = { x: (tip.x - pivot.x) / length, y: (tip.y - pivot.y) / length }, across = { x: -along.y, y: along.x };
        const points = pixels.map(map), acrossValues = [], alongValues = [];
        let pivotGap = Infinity, tipGap = Infinity, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minAlong = Infinity, maxAlong = -Infinity;
        for (const p of points) {
          acrossValues.push((p.x - pivot.x) * across.x + (p.y - pivot.y) * across.y);
          const axial = (p.x - pivot.x) * along.x + (p.y - pivot.y) * along.y;
          alongValues.push(axial); minAlong = Math.min(minAlong, axial); maxAlong = Math.max(maxAlong, axial);
          pivotGap = Math.min(pivotGap, Math.hypot(p.x - pivot.x, p.y - pivot.y));
          tipGap = Math.min(tipGap, Math.hypot(p.x - tip.x, p.y - tip.y));
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        const pixelAxes = { x: { x: transform.a * width / part.rect[2], y: transform.b * width / part.rect[2] }, y: { x: transform.c * height / part.rect[3], y: transform.d * height / part.rect[3] } };
        return { across: quantile(acrossValues, .95) - quantile(acrossValues, .05), along: quantile(alongValues, .95) - quantile(alongValues, .05), alongBounds: maxAlong - minAlong, bounds: [minX, minY, maxX, maxY], pivotGap, tipGap, pivot, tip, points, pixelAxes };
      };
      const draw = (ctx, id, facing, clip, phase, x, y, width, height, label = true, inspect = false) => {
        ctx.fillStyle = '#e8e3d6'; ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#c3bbab'; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        ctx.fillStyle = '#193a36'; ctx.font = 'bold 12px sans-serif';
        if (label) ctx.fillText(`${id.toUpperCase()} / ${facing} / ${clip} ${phase.toFixed(2)}`, x + 8, y + 18);
        const animator = new CharacterAnimator();
        const actor = { id, index: 0, team: 0, x: 500, y: 900, z: clip === 'idle' || clip === 'run' ? 0 : 75, facing, moving: clip === 'run' ? 1 : 0, actionAt: 0, contactAt: -10, landAt: -10 };
        let state = { time: 0, phase: 'rally' };
        if (clip === 'run') {
          animator.pose(actor, state);
          actor.x += phase * 180; state.time = phase * MOTION_TIMING.run;
        } else if (clip !== 'idle') {
          actor.jumpKind = clip; state.time = phase * MOTION_TIMING[clip];
          if (phase >= CONTACT_PHASE[clip]) {
            actor.contactKind = clip === 'toss' ? 'set' : clip;
            actor.contactAt = state.time - (phase - CONTACT_PHASE[clip]) * MOTION_TIMING[clip];
          }
        }
        const anchor = projectCourtPoint(actor.x, actor.y, 0, 960, 1440), scale = clip === 'idle' ? 1.14 : .97;
        const project = (wx, wy, wz) => {
          const p = projectCourtPoint(wx, wy, wz, 960, 1440);
          return { x: x + width / 2 + (p.x - anchor.x) * scale, y: y + height - 20 + (p.y - anchor.y) * scale };
        };
        const parts = new Set(), metrics = {}, actualDraw = ctx.drawImage;
        const names = Object.fromEntries(Object.entries(manifest.characters[id].views[facing].parts).map(([name, part]) => [part.rect.join(','), name]));
        ctx.drawImage = function(image, sx, sy, sw, sh, ...rest) {
          const key = [sx, sy, sw, sh].join(','); parts.add(key);
          if (inspect && names[key]) metrics[names[key]] = inspectPart(this, id, facing, names[key], rest);
          return actualDraw.call(this, image, sx, sy, sw, sh, ...rest);
        };
        animator.draw(ctx, actor, state, { image: images[id], view: manifest.characters[id].views[facing], project });
        ctx.drawImage = actualDraw;
        return { parts: parts.size, clip: animator.pose(actor, state).clip, metrics };
      };
      for (const [row, character] of ROSTER.entries()) {
        for (const [column, facing] of facings.entries()) draw(directionsCtx, character.id, facing, 'idle', 0, column * 260, row * 300, 260, 300);
        for (const facing of facings) for (const [actionIndex, clip] of ['run', 'toss', 'spike', 'block'].entries()) {
          const phases = clip === 'run' ? [.1, .42, .75] : [.15, CONTACT_PHASE[clip], .84];
          for (const [phaseIndex, phase] of phases.entries()) draw(actionCanvases[facing].getContext('2d'), character.id, facing, clip, phase, (actionIndex * 3 + phaseIndex) * 180, row * 300, 180, 300);
        }
      }
      const frameCanvas = document.createElement('canvas'); frameCanvas.width = 180; frameCanvas.height = 266;
      const ctx = frameCanvas.getContext('2d'), characters = [];
      for (const character of ROSTER) {
        const entry = manifest.characters[character.id], facingFrames = {};
        for (const facing of ['down', 'up', 'left', 'right']) {
          const animator = new CharacterAnimator();
          const actor = { id: character.id, index: 0, team: 0, x: 500, y: 900, z: 0, facing, moving: 1, contactAt: -10, landAt: -10 };
          const state = { time: 0, phase: 'rally' }, hashes = new Set();
          let maxJointStep = 0, previous = null, partCount = 0;
          animator.pose(actor, state);
          for (let frame = 0; frame < 60; frame++) {
            actor.x = 500 + frame * 3; state.time = frame / 60;
            ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
            const anchor = projectCourtPoint(actor.x, actor.y, 0, 960, 1440);
            const project = (x, y, z) => { const p = projectCourtPoint(x, y, z, 960, 1440); return { x: 90 + p.x - anchor.x, y: 246 + p.y - anchor.y }; };
            const actualDraw = ctx.drawImage, used = new Set();
            ctx.drawImage = function(image, sx, sy, sw, sh, ...rest) { used.add([sx, sy, sw, sh].join(',')); return actualDraw.call(this, image, sx, sy, sw, sh, ...rest); };
            animator.draw(ctx, actor, state, { image: images[character.id], view: entry.views[facing], project });
            ctx.drawImage = actualDraw; partCount = Math.max(partCount, used.size);
            const pose = animator.pose(actor, state);
            if (previous) for (const name of Object.keys(pose.joints)) {
              const a = previous[name], b = pose.joints[name]; maxJointStep = Math.max(maxJointStep, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
            }
            previous = pose.joints; hashes.add(hash(frameCanvas));
          }
          facingFrames[facing] = { frames: 60, distinctCanvasFrames: hashes.size, maxJointStep, articulatedPartsDrawn: partCount };
        }
        const actions = Object.fromEntries(['toss', 'spike', 'block'].map(clip => {
          const hashes = new Set(), poses = [];
          for (let frame = 0; frame < 60; frame++) {
            const phase = frame / 60;
            draw(ctx, character.id, 'right', clip, phase, 0, 0, frameCanvas.width, frameCanvas.height, false);
            hashes.add(hash(frameCanvas)); poses.push(JSON.stringify(sampleMotion(clip, phase).joints));
          }
          return [clip, { frames: 60, distinctCanvasFrames: hashes.size, distinctJointPoses: new Set(poses).size }];
        }));
        const proportions = {};
        for (const facing of facings) {
          const snapshots = [];
          for (const clip of ['idle', 'run', 'toss', 'spike', 'block']) {
            const phases = clip === 'idle' ? [0] : clip === 'run' ? [.1, .42, .75] : [.15, CONTACT_PHASE[clip], .84];
            for (const phase of phases) {
              const { metrics } = draw(ctx, character.id, facing, clip, phase, 0, 0, frameCanvas.width, frameCanvas.height, false, true);
              const head = metrics.head, headWidth = head.across;
              const names = ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'];
              const legNames = ['thighL', 'thighR', 'shinL', 'shinR'];
              const seams = [['upperArmL', 'forearmL'], ['upperArmR', 'forearmR'], ['thighL', 'shinL'], ['thighR', 'shinR'], ['body', 'head']].map(([a, b]) => ({
                parts: [a, b], endpointGap: Math.hypot(metrics[a].tip.x - metrics[b].pivot.x, metrics[a].tip.y - metrics[b].pivot.y), opacityGap: Math.max(metrics[a].tipGap, metrics[b].pivotGap) / headWidth,
              }));
              const bodyGrid = new Map();
              for (const p of metrics.body.points) { const key = `${Math.floor(p.x)},${Math.floor(p.y)}`; if (!bodyGrid.has(key)) bodyGrid.set(key, []); bodyGrid.get(key).push(p); }
              for (const name of ['upperArmL', 'upperArmR', 'thighL', 'thighR']) {
                // A shoulder/hip pivot lies at the centre of a round cap. Its
                // alpha edge must meet the torso; the pivot need not be inside
                // torso pixels. Compare only the cap near this joint, so a
                // hand touching the waist cannot hide a detached shoulder.
                const joint = metrics[name].pivot, capRadius = headWidth * .18, search = Math.ceil(headWidth * .03 + 1);
                let gap = Infinity, centreGap = Infinity;
                for (const p of metrics[name].points) {
                  if (Math.hypot(p.x - joint.x, p.y - joint.y) > capRadius) continue;
                  const gx = Math.floor(p.x), gy = Math.floor(p.y);
                  for (let dx = -search; dx <= search; dx++) for (let dy = -search; dy <= search; dy++) for (const bodyPixel of bodyGrid.get(`${gx + dx},${gy + dy}`) || []) {
                    const vx = p.x - bodyPixel.x, vy = p.y - bodyPixel.y, distance = Math.hypot(vx, vy);
                    centreGap = Math.min(centreGap, distance);
                    const direction = { x: vx / Math.max(1e-8, distance), y: vy / Math.max(1e-8, distance) };
                    // Alpha samples represent transformed unit pixel squares,
                    // not zero-area points. Measure their facing edge coverage
                    // along the separation axis, including both footprints.
                    const radius = ({ pixelAxes }) => .5 * (Math.abs(direction.x * pixelAxes.x.x + direction.y * pixelAxes.x.y) + Math.abs(direction.x * pixelAxes.y.x + direction.y * pixelAxes.y.y));
                    gap = Math.min(gap, Math.max(0, distance - radius(metrics.body) - radius(metrics[name])));
                  }
                  if (gap < .25) break;
                }
                seams.push({ parts: ['body', name], endpointGap: 0, opacityGap: gap / headWidth, pixelEdgeGap: gap, pixelCentreGap: centreGap / headWidth, pixelCentreGapPixels: centreGap });
              }
              const minY = Math.min(...Object.values(metrics).map(part => part.bounds[1])), maxY = Math.max(...Object.values(metrics).map(part => part.bounds[3]));
              snapshots.push({ clip, phase, headWidth, headLength: head.along, headAlphaLength: head.alongBounds, alphaHeight: maxY - minY, standingHeads: (maxY - minY) / head.alongBounds, denseHeadCount: (maxY - minY) / head.along, torsoWidthRatio: metrics.body.across / headWidth, armWidthRatio: Math.max(...names.map(name => metrics[name].across / headWidth)), legWidthRatio: Math.max(...legNames.map(name => metrics[name].across / headWidth)), seams, partWidths: Object.fromEntries(Object.entries(metrics).map(([name, part]) => [name, part.across / headWidth])) });
            }
          }
          const standing = snapshots[0];
          proportions[facing] = { standing, headCrownCutRatio: alphaShape(character.id, facing, 'head').crownCutRatio, maxArmWidthRatio: Math.max(...snapshots.map(frame => frame.armWidthRatio)), maxLegWidthRatio: Math.max(...snapshots.map(frame => frame.legWidthRatio)), maxSeamOpacityGap: Math.max(...snapshots.flatMap(frame => frame.seams.map(seam => seam.opacityGap))), maxSeamExcessPixels: Math.max(...snapshots.flatMap(frame => frame.seams.map(seam => (seam.opacityGap - .03) * frame.headWidth))), maxSeamEndpointGap: Math.max(...snapshots.flatMap(frame => frame.seams.map(seam => seam.endpointGap))), partWidthVariation: Object.fromEntries(Object.keys(standing.partWidths).filter(name => name !== 'hair').map(name => { const widths = snapshots.map(frame => frame.partWidths[name]); return [name, Math.max(...widths) / Math.max(.0001, Math.min(...widths))]; })), snapshots };
        }
        characters.push({ id: character.id, image: [images[character.id].naturalWidth, images[character.id].naturalHeight], generatedDirectionalKit: entry.identity.generatedDirectionalKit, facingFrames, actions, proportions });
      }
      return { method: 'Real generated images and CharacterAnimator.draw, calibrated projectCourtPoint, 60 sequential movement poses, all-direction preparation/contact/recovery action snapshots; alpha silhouettes measured under the actual drawImage transforms', characters };
    }, gameURL);
    // Preserve the raster evidence even when an assertion exposes a regression.
    await writeFile('artifacts/motion-qa-results.json', JSON.stringify({ ...authored, runtime: [], errors, responses }, null, 2));
    await motionPage.locator('#motion-directions').screenshot({ path: 'artifacts/motion-directions.png' });
    for (const facing of ['down', 'up', 'left', 'right']) await motionPage.locator(`#motion-actions-${facing}`).screenshot({ path: `artifacts/motion-actions-${facing}.png` });
    await motionPage.locator('#motion-actions-right').screenshot({ path: 'artifacts/motion-actions.png' });
    expect(authored.characters).toHaveLength(10);
    for (const character of authored.characters) {
      expect(character.generatedDirectionalKit, character.id).toBe(true);
      for (const [facing, frames] of Object.entries(character.facingFrames)) {
        expect(frames.articulatedPartsDrawn, `${character.id} ${facing} upper/lower limb parts`).toBe(11);
        expect(frames.distinctCanvasFrames, `${character.id} ${facing} rendered run poses`).toBeGreaterThanOrEqual(55);
        expect(frames.maxJointStep, `${character.id} ${facing} movement continuity`).toBeLessThan(18);
      }
      for (const [action, frames] of Object.entries(character.actions)) {
        expect(frames.distinctJointPoses, `${character.id} ${action} authored poses`).toBe(60);
        expect(frames.distinctCanvasFrames, `${character.id} ${action} rendered poses`).toBeGreaterThanOrEqual(55);
      }
      for (const [facing, proportions] of Object.entries(character.proportions)) {
        const label = `${character.id} ${facing}`;
        // Ratios use visible atlas alpha under the real draw transform, rather
        // than the rig constants. Hair remains cosmetic around the SD skull.
        // Count heads using the central 90% of painted head-alpha density.
        // Full min/max alpha extent includes buns and ponytails: Tempest's
        // complete side ponytail produces 1.964 decorated heads while the dense
        // face/skull silhouette is 2.531 heads. Neither uses SD_ANATOMY values.
        expect(proportions.standing.denseHeadCount, `${label} SD dense skull silhouette head count`).toBeGreaterThan(2.3);
        expect(proportions.standing.denseHeadCount, `${label} SD dense skull silhouette head count`).toBeLessThan(3.3);
        expect(proportions.headCrownCutRatio, `${label} complete crown without a horizontal crop`).toBeLessThan(.4);
        expect(proportions.standing.torsoWidthRatio, `${label} torso stays narrower than the SD head`).toBeLessThan(.9);
        expect(proportions.maxArmWidthRatio, `${label} arms do not flare into broad skin wedges`).toBeLessThan(.4);
        expect(proportions.maxLegWidthRatio, `${label} compact leg thickness`).toBeLessThan(.45);
        expect(proportions.maxSeamEndpointGap, `${label} articulated endpoints remain joined`).toBeLessThan(.05);
        // Allow half a raster pixel around the 3%-of-head seam threshold.
        // A transformed pixel square resolves onto integer canvas pixels: the
        // final Viper rear stride has 1.462px edge separation vs1.423px nominal
        // tolerance, a0.039px difference that cannot form another visible pixel.
        expect(proportions.maxSeamExcessPixels, `${label} limbs, torso and head remain connected (3% + half a raster pixel)`).toBeLessThan(.5);
        for (const [part, variation] of Object.entries(proportions.partWidthVariation)) expect(variation, `${label} ${part} thickness remains constant while moving`).toBeLessThan(1.08);
      }
    }
    await motionPage.evaluate(() => document.querySelector('#motion-proof').remove());
    await motionPage.getByRole('button', { name: '노바 선택', exact: true }).click();
    await motionPage.locator('#desktop-start').click();
    await motionPage.waitForSelector('body[data-phase="rally"]');
    const runtime = [];
    for (const [key, facing] of [['ArrowRight', 'right'], ['ArrowLeft', 'left'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) {
      const before = await motionPage.locator('#you-indicator').evaluate(element => element.style.transform);
      await motionPage.keyboard.down(key);
      const frames = await motionPage.evaluate(async () => {
        const canvas = document.querySelector('#game-canvas'), ctx = canvas.getContext('2d'), hashes = new Set(), timestamps = [];
        for (let frame = 0; frame < 60; frame++) {
          const timestamp = await new Promise(requestAnimationFrame); timestamps.push(timestamp);
          const box = canvas.getBoundingClientRect(), player = document.querySelector('#you-indicator').getBoundingClientRect();
          const px = ((player.left + player.width / 2 - box.left) / box.width) * canvas.width;
          const py = ((player.bottom - box.top) / box.height) * canvas.height;
          const x = Math.max(0, Math.min(canvas.width - 150, Math.floor(px - 75))), y = Math.max(0, Math.min(canvas.height - 220, Math.floor(py + 8)));
          const pixels = ctx.getImageData(x, y, 150, 220).data;
          let h = 2166136261; for (let i = 0; i < pixels.length; i += 4) h = Math.imul(h ^ pixels[i] ^ pixels[i + 1] ^ pixels[i + 2], 16777619);
          hashes.add(h >>> 0);
        }
        return { frames: timestamps.length, distinctPlayerFrames: hashes.size, meanFrameMs: (timestamps.at(-1) - timestamps[0]) / (timestamps.length - 1), renderedFacing: document.body.dataset.facing };
      });
      await motionPage.keyboard.up(key);
      const after = await motionPage.locator('#you-indicator').evaluate(element => element.style.transform);
      expect(after, `${facing} movement reaches actual game`).not.toBe(before);
      expect(frames.distinctPlayerFrames, `${facing} actual player frames`).toBeGreaterThan(40);
      expect(frames.meanFrameMs, 'actual animation frame delivery').toBeLessThan(40);
      expect(frames.renderedFacing).toBe(facing);
      runtime.push({ key, facing, ...frames });
    }
    await motionPage.setViewportSize({ width: 393, height: 852 });
    await motionPage.waitForTimeout(120);
    await motionPage.screenshot({ path: 'artifacts/motion-mobile-runtime.png', fullPage: false });
    expect(errors).toEqual([]); expect(responses).toEqual([]);
    const report = { ...authored, runtime, errors, responses };
    await writeFile('artifacts/motion-qa-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ motions: true, characters: authored.characters.length, directionalMovementFrames: 2400, authoredActionFrames: 1800, runtime, errors, responses }));
  } finally { await motionContext.close(); await browser.close(); }
  process.exit(0);
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
await context.addInitScript(() => {
  const key = 'slay-beach-volley-v1';
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ wins: 2, settings: { assist: true } }));
  window.__volleySampleDecodes = 0;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio) {
    const decode = Audio.prototype.decodeAudioData;
    Audio.prototype.decodeAudioData = function(...args) {
      return decode.apply(this, args).then(buffer => { window.__volleySampleDecodes++; return buffer; });
    };
  }
});
const page = await context.newPage();
async function snapshot(path) {
  // Let ResizeObserver and the canvas draw after a viewport or media change.
  await page.clock.runFor(90);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    return canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data.slice(0, 3).some(channel => channel > 0);
  }), { message: 'The resized canvas must paint before capture' }).toBe(true);
  await page.screenshot({ path, fullPage: false });
}
await page.clock.install();
const errors = [], responses = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) responses.push({ status: response.status(), url: response.url() }); });
await page.goto(gameURL);
await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
await expect(page.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v2');
await expect(page.locator('#game-canvas')).toHaveAttribute('data-animation', 'directional-rig-60');
const migratedSave = await page.evaluate(() => JSON.parse(localStorage.getItem('slay-beach-volley-v1')));
expect(migratedSave.settings).not.toHaveProperty('assist'); expect(migratedSave.wins).toBe(2);
await expect(page.locator('#assist-setting')).toHaveCount(0);
const longPressGuards = await page.evaluate(() => {
  const ui = ['#desktop-start', '.brand', '#help-button img', '.roster-item small', '.roster-item img', '#game-canvas', '#block-button span', '#spike-button span'];
  const results = ui.map(selector => {
    const element = document.querySelector(selector);
    return { selector, unselectable: getComputedStyle(element).userSelect === 'none', guarded: ['contextmenu', 'selectstart', 'dragstart'].every(type => !element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))) };
  });
  const editors = ['input', 'textarea', 'select', 'div'].map(tag => {
    const element = document.createElement(tag); if (tag === 'div') { element.contentEditable = 'true'; element.innerHTML = '<span>Editable</span>'; }
    document.body.append(element); const target = element.querySelector('span') || element;
    const result = { tag, editable: getComputedStyle(target).userSelect === 'text', nativeMenuAvailable: target.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true })) };
    element.remove(); return result;
  });
  return { ui: results, editors };
});
for (const item of longPressGuards.ui) { expect(item.unselectable, item.selector).toBe(true); expect(item.guarded, item.selector).toBe(true); }
for (const item of longPressGuards.editors) { expect(item.editable, item.tag).toBe(true); expect(item.nativeMenuAvailable, item.tag).toBe(true); }
console.log('Long-press selection, context menus and dragging are suppressed across the UI; real fields stay editable.');
if (process.argv.includes('--offline')) {
  await page.evaluate(async () => { await caches.open('other-game-cache'); await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  if (!await page.evaluate(() => caches.has('other-game-cache'))) throw new Error('Other game cache was removed');
  await context.setOffline(true); await page.reload(); await page.waitForSelector('body[data-ready="true"]');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: '템페스트 선택', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '템페스트 선택', exact: true }).click();
  await page.getByRole('button', { name: '경기 시작', exact: true }).click(); await page.waitForSelector('body[data-phase="rally"]');
  await expect.poll(() => page.evaluate(() => window.__volleySampleDecodes)).toBe(4);
  await snapshot('artifacts/offline-game.png');
  console.log(JSON.stringify({ offline: true, sampledAudioDecoded: 4, unrelatedCachePreserved: true, phase: await page.locator('body').getAttribute('data-phase'), errors, responses }));
  await writeFile('artifacts/offline-qa-results.json', JSON.stringify({ offline: true, sampledAudioDecoded: 4, unrelatedCachePreserved: true, errors, responses }, null, 2));
  await browser.close(); process.exit(0);
}
await snapshot('artifacts/desktop-lobby.png');
console.log(JSON.stringify({ title: await page.title(), errors, responses, roster: await page.locator('.roster-item').count() }));
await page.setViewportSize({ width: 393, height: 852 });
await snapshot('artifacts/mobile-lobby.png');
for (const name of ['SUNSET COVE', 'MOONLIGHT BAY', 'CORAL BEACH']) {
  await page.getByRole('button', { name: '다음 해변', exact: true }).click();
  await expect(page.locator('#court-name')).toHaveText(name);
  await snapshot(`artifacts/stadium-${name.split(' ')[0].toLowerCase()}.png`);
}
const touch = await context.newCDPSession(page);
const soundButton = page.locator('#sound-toggle'), ordinaryRect = await soundButton.boundingBox();
const previousMute = await soundButton.getAttribute('aria-pressed');
await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ordinaryRect.x + ordinaryRect.width / 2, y: ordinaryRect.y + ordinaryRect.height / 2, id: 1 }] });
await new Promise(resolve => setTimeout(resolve, 800));
expect(await page.evaluate(() => getSelection().toString())).toBe('');
expect(await page.locator('dialog[open]').count()).toBe(0);
await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
if (await soundButton.getAttribute('aria-pressed') !== previousMute) await soundButton.click();
console.log('Three physical lighting renders display; an ordinary mobile button also holds without a selection menu or popup.');
console.log(JSON.stringify(await page.evaluate(() => ({ viewport: innerHeight, width: innerWidth, bodyWidth: document.body.scrollWidth, height: document.documentElement.scrollHeight, arena: document.querySelector('#arena-wrap').getBoundingClientRect().toJSON() }))));
await page.getByRole('button', { name: '경기 시작', exact: true }).click();
await page.waitForSelector('body[data-phase="rally"]');
await expect.poll(() => page.evaluate(() => window.__volleySampleDecodes)).toBe(4);
await snapshot('artifacts/mobile-game.png');
const initialPosition = await page.locator('#you-indicator').evaluate(element => element.style.transform);
await page.keyboard.down('ArrowRight'); await page.clock.runFor(220); await page.keyboard.up('ArrowRight'); await page.clock.runFor(32);
const stoppedPosition = await page.locator('#you-indicator').evaluate(element => element.style.transform);
expect(stoppedPosition).not.toBe(initialPosition);
await page.clock.runFor(1000);
expect(await page.locator('#you-indicator').evaluate(element => element.style.transform)).toBe(stoppedPosition);
console.log('Direction input moves the player; releasing it leaves the player in place, even with a legacy assistance preference.');
const spikeRect = await page.locator('#spike-button').boundingBox();
await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spikeRect.x + spikeRect.width / 2, y: spikeRect.y + spikeRect.height / 2, id: 1 }] });
// Hold in wall-clock time too, so native long-press gesture timers can fire.
await new Promise(resolve => setTimeout(resolve, 800));
await expect(page.locator('#power-meter')).toBeVisible();
expect(await page.evaluate(() => getSelection().toString())).toBe('');
expect(await page.locator('dialog[open]').count()).toBe(0);
await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.clock.runFor(120);
await expect(page.locator('#power-meter')).not.toBeVisible();
console.log('An 800 ms touch hold charges and releases the spike without a selection menu or popup.');
await page.locator('#block-button').click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: '스파이크. 길게 눌렀다 놓으면 더 강하게 공격합니다.' }).click();
await page.getByRole('button', { name: '일시정지', exact: true }).click();
await snapshot('artifacts/mobile-pause.png');
console.log(JSON.stringify({ pause: await page.locator('#pause-dialog').evaluate(el => el.open), errors, responses }));
await page.getByRole('button', { name: '선수 선택으로', exact: true }).filter({ visible: true }).click();
const sizes = [[320,568], [320,720], [360,780], [393,852], [430,932], [844,390]];
const layouts = [];
for (const [width, height] of sizes) {
  await page.setViewportSize({ width, height });
  await snapshot(`artifacts/lobby-${width}x${height}.png`);
  layouts.push(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, startVisible: document.querySelector('#mobile-start').getBoundingClientRect().bottom <= innerHeight })));
}
console.log(JSON.stringify({ layouts }));
await page.setViewportSize({ width: 393, height: 852 });
for (const name of ['노바','레이븐','발키리','바이퍼','엠버','아틀라스','세라프','링스','템페스트','오닉스']) {
  const button = page.getByRole('button', { name: `${name} 선택`, exact: true });
  await button.scrollIntoViewIfNeeded(); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
}
await page.reload(); await page.waitForSelector('body[data-ready="true"]');
await expect(page.getByRole('button', { name: '오닉스 선택', exact: true })).toHaveAttribute('aria-pressed','true');
console.log('All 10 characters can be selected; selection persists after reload.');
await page.getByRole('button', { name: /함께 뛸 파트너:/ }).click();
await page.getByRole('button', { name: '게임 설정', exact: true }).click();
await page.locator('#music-setting').uncheck(); await page.locator('#sfx-setting').uncheck();
await page.getByRole('button', { name: '설정 완료' }).click();
await page.reload(); await page.waitForSelector('body[data-ready="true"]');
await page.getByRole('button', { name: '게임 설정', exact: true }).click();
await expect(page.locator('#assist-setting')).toHaveCount(0);
await expect(page.locator('#music-setting')).not.toBeChecked(); await expect(page.locator('#sfx-setting')).not.toBeChecked();
await page.getByRole('button', { name: '설정 완료' }).click();
await page.getByRole('button', { name: '조작 방법' }).click();
await expect(page.locator('#help-dialog')).toBeVisible(); await page.keyboard.press('Escape');
await page.getByRole('button', { name: '경기 시작', exact: true }).click(); await page.waitForSelector('body[data-phase="rally"]');
await page.keyboard.press('Space'); await page.keyboard.down('KeyJ'); await page.waitForTimeout(300); await page.keyboard.up('KeyJ');
const stick = await page.locator('#joystick').boundingBox();
await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2); await page.mouse.down(); await page.mouse.move(stick.x + stick.width - 5, stick.y + stick.height / 2);
await expect(page.locator('#joystick-thumb')).not.toHaveCSS('transform','none'); await page.mouse.up();
await page.getByRole('button', { name: '일시정지', exact: true }).click();
const pausedScore = await page.locator('#scoreboard').innerText(); await page.waitForTimeout(400); await expect(page.locator('#scoreboard')).toHaveText(pausedScore, { useInnerText: true });
await page.getByRole('button', { name: '경기 계속' }).click(); await expect(page.locator('#pause-dialog')).not.toBeVisible();
await page.getByRole('button', { name: '일시정지', exact: true }).click();
await page.getByRole('button', { name: '선수 선택으로', exact: true }).filter({ visible: true }).click();
await page.getByRole('button', { name: /빠른 경기.*변경/ }).click();
await page.getByRole('button', { name: /타이밍 연습.*60초 동안 실력 다지기/ }).click();
await page.getByRole('button', { name: '경기 시작', exact: true }).click();
await page.waitForSelector('body[data-phase="rally"]');
await page.keyboard.down('ArrowUp'); await page.clock.runFor(350); await page.keyboard.up('ArrowUp');
let foundAttack = false;
for (let frame = 0; frame < 200; frame++) {
  await page.clock.runFor(150);
  if (await page.locator('body').getAttribute('data-cue') === 'spike') { foundAttack = true; break; }
}
expect(foundAttack, 'an automatically jumping player must get a real attack opportunity').toBe(true);
await expect(page.locator('#spike-button')).toHaveClass(/ready/);
await snapshot('artifacts/automatic-attack-ready.png');
await page.getByRole('button', { name: '스파이크. 길게 눌렀다 놓으면 더 강하게 공격합니다.' }).click();
await page.clock.runFor(25);
await expect(page.locator('#game-callout strong')).toHaveText(/SPIKE!|PERFECT!/);
await snapshot('artifacts/manual-spike.png');
console.log('The player jumps automatically, waits for input and hits a real manually triggered spike.');
await page.clock.runFor(61000);
await expect(page.locator('#result-dialog')).toBeVisible({ timeout: 10000 });
await expect(page.locator('#result-title')).toHaveText('한 번 더, 더 정확하게.');
await snapshot('artifacts/training-result.png');
console.log('Real browser practice finishes and opens the result screen.');
await page.getByRole('button', { name: '선수 선택으로', exact: true }).filter({ visible: true }).click();
await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
await snapshot('artifacts/mobile-dark.png');
await page.setViewportSize({ width: 1440, height: 1000 });
await snapshot('artifacts/desktop-dark.png');
await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
await snapshot('artifacts/desktop-lobby.png');
await writeFile('artifacts/browser-qa-results.json', JSON.stringify({ errors, responses, layouts, longPressGuards, sampledAudioDecoded: 4, checked: ['three physically lit Blender stadiums and calibrated 2D scene','four sampled volleyball sounds decoded after a real play gesture','ordinary mobile button long press without native popup','10 original characters','manual movement stops when input is released','legacy movement assistance removed without losing records','keyboard movement and block','800 ms touch charge without selection or popup','automatic jump and real manual spike after manual positioning','charge button','joystick pointer capture','pause and resume','persistent character and settings','help modal','60 second practice and result','dark mode','reduced motion'] }, null, 2));
if(errors.length || responses.length) throw new Error(JSON.stringify({errors,responses}));
await browser.close();
