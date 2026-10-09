import { chromium, expect } from '@playwright/test';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ROSTER as EXPECTED_ROSTER } from '../src/roster.js';
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
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/dist/' || target.searchParams.get('v') !== '8') {
    await browser.close();
    throw new Error('Upgrade QA requires the local /dist/?v=8 URL.');
  }
  const base = new URL('./', target), workerURL = new URL('sw.js', base).href;
  const legacyWorkerURL = new URL('qa-legacy-sw.js', base).href;
  const fixturePath = 'dist/qa-legacy-sw.js';
  const legacyCache = 'slay-beach-volley-v7', currentCache = 'slay-beach-volley-v8';
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
      const html = `<!doctype html><html><head><title>Legacy v7 fixture</title></head><body data-legacy="v7"><div id="legacy-marker">Cached v7 app</div><script>
sessionStorage.setItem('volley-legacy-loads', String(Number(sessionStorage.getItem('volley-legacy-loads') || 0) + 1));
if (new URL(location.href).searchParams.get('v') === '8') navigator.serviceWorker.register(${JSON.stringify(workerURL)}, {scope:${JSON.stringify(scope)}}).catch(error => console.error(error));
<\/script></body></html>`;
      await cache.put(baseURL, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v7' } }));
      await cache.put(new URL('index.html', baseURL).href, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v7' } }));
      await caches.open('other-game-cache');
    }, { legacyWorkerURL, scope: base.pathname, legacyCache, baseURL: base.href, workerURL });
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(legacyWorkerURL);

    // An existing v7 game tab must remain open; only the explicit v8 link may
    // be navigated again when the new worker takes control.
    const oldPage = await upgradeContext.newPage();
    const oldURL = new URL(base); oldURL.searchParams.set('v', '7');
    let oldNavigations = 0;
    oldPage.on('framenavigated', frame => { if (frame === oldPage.mainFrame()) oldNavigations++; });
    oldPage.on('pageerror', error => errors.push(error.message));
    await oldPage.goto(oldURL.href); await oldPage.waitForSelector('#legacy-marker');
    expect(oldNavigations).toBe(1);

    let upgradeNavigations = 0, legacyResponseSeen = false;
    upgradePage.on('framenavigated', frame => { if (frame === upgradePage.mainFrame()) upgradeNavigations++; });
    upgradePage.on('response', response => {
      if (response.request().isNavigationRequest() && response.headers()['x-volley-qa'] === 'legacy-v7') legacyResponseSeen = true;
    });
    await upgradePage.goto(gameURL, { waitUntil: 'domcontentloaded' });
    await upgradePage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await expect(upgradePage.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v2');
    await expect(upgradePage.locator('#game-canvas')).toHaveAttribute('data-animation', 'whole-sprite-60');
    expect(await upgradePage.locator('.roster-item').count()).toBe(EXPECTED_ROSTER.length);
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(workerURL);
    expect(legacyResponseSeen, 'the first request must actually exercise the stale v7 HTML').toBe(true);
    expect(await upgradePage.evaluate(() => sessionStorage.getItem('volley-legacy-loads'))).toBe('1');
    await upgradePage.waitForTimeout(800);
    expect(upgradeNavigations, 'one upgrade reload is required, without a navigation loop').toBe(2);
    expect(oldNavigations, 'an existing v7 game must not be interrupted').toBe(1);
    await expect(oldPage.locator('#legacy-marker')).toBeVisible();
    const cachesAfter = await upgradePage.evaluate(async ({ legacyCache, currentCache }) => ({
      legacyRemoved: !await caches.has(legacyCache), currentPresent: await caches.has(currentCache), unrelatedPreserved: await caches.has('other-game-cache'),
    }), { legacyCache, currentCache });
    expect(cachesAfter).toEqual({ legacyRemoved: true, currentPresent: true, unrelatedPreserved: true });
    expect(errors).toEqual([]);
    const report = { upgrade: true, staleV7ResponseSeen: legacyResponseSeen, freshInstallNavigations: freshNavigations, upgradeNavigations, existingV7Navigations: oldNavigations, ...cachesAfter, errors };
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
  const runtimeOnly = process.argv.includes('--runtime-only');
  const motionReportPath = runtimeOnly ? 'artifacts/motion-runtime-qa-results.json' : 'artifacts/motion-qa-results.json';
  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
  const motionPage = await motionContext.newPage();
  const errors = [], responses = [];
  motionPage.on('pageerror', error => errors.push(error.message));
  motionPage.on('response', response => { if (response.status() >= 400) responses.push({ status: response.status(), url: response.url() }); });
  try {
    await motionPage.goto(gameURL);
    await motionPage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await expect(motionPage.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v2');
    await expect(motionPage.locator('#game-canvas')).toHaveAttribute('data-animation', 'whole-sprite-60');
    const authored = runtimeOnly ? { characters: [], method: 'Actual game runtime only' } : await motionPage.evaluate(async gameURL => {
      const { SpriteAnimator, SPRITE_HEIGHT, SPRITE_TIMING, SPRITE_CONTACT_PHASE, sampleSpriteFrames, loadAnimationAssets, loadAnimationManifest } = await import(new URL('src/sprite-animation.js', gameURL).href);
      const { projectCourtPoint } = await import(new URL('src/render.js', gameURL).href);
      const { ROSTER } = await import(new URL('src/roster.js', gameURL).href);
      const manifest = await loadAnimationManifest(), images = {};
      const facings = ['down', 'up', 'left', 'right'], clips = ['run', 'toss', 'spike', 'block'];
      const proof = document.createElement('main'); proof.id = 'motion-proof';
      Object.assign(proof.style, { position: 'absolute', top: '0', left: '0', zIndex: '9999', display: 'block', background: '#e8e3d6', width: '1080px' }); document.body.append(proof);
      const makeCanvas = (id, width, height) => {
        const canvas = document.createElement('canvas'); canvas.id = id; canvas.width = width; canvas.height = height;
        Object.assign(canvas.style, { display: 'block', width: `${width}px`, height: `${height}px` }); proof.append(canvas); return canvas;
      };
      const directions = makeCanvas('motion-directions', 960, ROSTER.length * 320);
      const runTimelines = Object.fromEntries(facings.map(facing => [facing, makeCanvas(`motion-run-timeline-${facing}`, 2400, ROSTER.length * 660)]));
      const actionCanvases = Object.fromEntries(facings.map(facing => [facing, makeCanvas(`motion-actions-${facing}`, 1080, ROSTER.length * 1000)]));
      const frameCanvas = document.createElement('canvas'); frameCanvas.width = 180; frameCanvas.height = 250;
      const hash = canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let value = 2166136261; for (let i = 0; i < pixels.length; i++) value = Math.imul(value ^ pixels[i], 16777619); return value >>> 0;
      };
      const imageRegistry = new Map();
      const prototypes = [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
      const originals = prototypes.map(prototype => prototype.drawImage), observed = [];
      const frameList = (id, clip, facing) => {
        const view = manifest.characters[id].clips[clip].views[facing]; return Array.isArray(view) ? view : view.frames;
      };
      for (const [index, prototype] of prototypes.entries()) prototype.drawImage = function(image, ...args) {
        const identity = imageRegistry.get(image);
        if (identity && args.length === 8) {
          const [sx, sy, sw, sh, dx, dy, dw, dh] = args, matrix = this.getTransform();
          const xScale = Math.hypot(matrix.a, matrix.b) * dw / sw, yScale = Math.hypot(matrix.c, matrix.d) * dh / sh;
          const fullFrames = facings.flatMap(facing => frameList(identity.id, identity.clip, facing).map((frame, frameIndex) => ({ facing, frameIndex, rect: frame.rect })));
          const matched = fullFrames.find(frame => frame.rect.join(',') === [sx, sy, sw, sh].join(','));
          observed.push({ ...identity, source: [sx, sy, sw, sh], destination: [dx, dy, dw, dh], uniformScaleError: Math.abs(xScale / yScale - 1), determinant: matrix.a * matrix.d - matrix.b * matrix.c, fullBodyCrop: Boolean(matched), facing: matched?.facing, frameIndex: matched?.frameIndex, alpha: this.globalAlpha });
        }
        return originals[index].call(this, image, ...args);
      };
      function draw(ctx, id, facing, clip, phase, x, y, width, height, label = true) {
        ctx.fillStyle = '#e8e3d6'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = '#c3bbab'; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        // These canonical art samples disable cut fading. A fresh animator has
        // no elapsed fade time; production rAF below keeps the default fade.
        const animator = new SpriteAnimator({ transition: 0, frameFade: 0, stride: 120 });
        const actor = { id, index: 0, team: 0, x: 500, y: 900, z: 0, facing, moving: clip === 'run' ? 1 : 0, action: 'idle', actionAt: 0, contactAt: -10, landAt: -10 };
        const state = { time: phase * SPRITE_TIMING[clip], phase: 'rally' };
        if (clip === 'run') { animator.pose(actor, { ...state, time: 0 }); actor.x += phase * 120; }
        else if (clip === 'land') { actor.action = 'land'; actor.landAt = 0; }
        else if (clip === 'serve' && phase < SPRITE_CONTACT_PHASE.serve) { state.phase = 'serve'; state.serving = 0; }
        else if (clip !== 'idle') {
          actor.z = 75; actor.jumpKind = clip === 'spike' ? 'attack' : clip;
          if (phase >= SPRITE_CONTACT_PHASE[clip]) { actor.contactKind = clip === 'toss' ? 'set' : clip; actor.contactAt = SPRITE_CONTACT_PHASE[clip] * SPRITE_TIMING[clip]; }
        }
        const anchor = projectCourtPoint(actor.x, actor.y, actor.z, 960, 1440), crown = projectCourtPoint(actor.x, actor.y, actor.z + SPRITE_HEIGHT, 960, 1440);
        const sourceArt = clip === 'idle' ? 'run' : ['serve', 'land'].includes(clip) ? 'spike' : clip;
        const allFrames = frameList(id, sourceArt, facing), bodyHeight = Math.hypot(crown.x - anchor.x, crown.y - anchor.y);
        const widthRatio = Math.max(...allFrames.map(frame => frame.pivot[0] / frame.bodyHeight)) + Math.max(...allFrames.map(frame => (frame.rect[2] - frame.pivot[0]) / frame.bodyHeight));
        const heightRatio = Math.max(...allFrames.map(frame => frame.rect[3] / frame.bodyHeight));
        const magnification = Math.min(1.25, (width - 20) / (widthRatio * bodyHeight), (height - 42) / (heightRatio * bodyHeight));
        const project = (wx, wy, wz) => { const point = projectCourtPoint(wx, wy, wz, 960, 1440); return { x: x + width / 2 + (point.x - anchor.x) * magnification, y: y + height - 18 + (point.y - anchor.y) * magnification }; };
        const start = observed.length;
        const result = animator.draw(ctx, actor, state, { images: images[id], character: manifest.characters[id], project });
        const calls = observed.slice(start), pose = animator.pose(actor, state);
        if (calls.length !== 1 || calls[0].frameIndex !== result.frameIndex) throw new Error(`${id}/${facing}/${clip}: displayed art must match CUT ${result.frameIndex + 1}`);
        if (label) { ctx.fillStyle = '#193a36'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`${id.toUpperCase()} / ${facing} / ${clip} / CUT ${result.frameIndex + 1}`, x + 7, y + 16); }
        return { ...result, artClip: sampleSpriteFrames(manifest.characters[id], pose).artClip, calls };
      }
      try {
        const characters = [];
        for (const [characterIndex, { id }] of ROSTER.entries()) {
          const loaded = await loadAnimationAssets({ ids: [id], manifest }); images[id] = loaded.images[id];
          for (const [clip, image] of Object.entries(images[id])) imageRegistry.set(image, { id, clip });
          const entry = { id, directions: {}, aliases: {} };
          for (const [directionIndex, facing] of facings.entries()) {
            draw(directions.getContext('2d'), id, facing, 'idle', 0, directionIndex * 240, characterIndex * 320, 240, 320);
            draw(frameCanvas.getContext('2d'), id, facing, 'idle', 0, 0, 0, 180, 250, false);
            const direction = { renderedDirectionHash: hash(frameCanvas), clips: {} };
            for (const [clipIndex, clip] of clips.entries()) {
              const contact = SPRITE_CONTACT_PHASE[clip], times = clip === 'run' ? Array.from({ length: 6 }, (_, i) => i / 6) : [0, contact * .32, contact * .72, contact, contact + (1 - contact) * .45, contact + (1 - contact) * .82];
              for (let cut = 0; cut < 6; cut++) {
                const phase = cut === 3 && clip !== 'run' ? times[cut] : (times[cut] + (times[cut + 1] ?? 1)) / 2;
                draw(actionCanvases[facing].getContext('2d'), id, facing, clip, phase, cut * 180, (characterIndex * 4 + clipIndex) * 250, 180, 250);
              }
              const hashes = new Set(), seen = new Set();
              let maxArtPosesDrawn = 0, maxUniformScaleError = 0, fullBodyCropsOnly = true, mirroredDraws = 0, compositeFrames = 0;
              for (let frame = 0; frame < 60; frame++) {
                const drawn = draw(frameCanvas.getContext('2d'), id, facing, clip, frame / 60, 0, 0, 180, 250, false);
                if (clip === 'run') {
                  const column = frame % 20, row = characterIndex * 3 + Math.floor(frame / 20), ctx = runTimelines[facing].getContext('2d');
                  const tile = draw(ctx, id, facing, clip, frame / 60, column * 120, row * 220, 120, 220, false);
                  ctx.fillStyle = '#193a36'; ctx.font = '9px sans-serif'; ctx.fillText(`${id} / ${facing} / ${frame + 1}: CUT ${tile.frameIndex + 1}`, column * 120 + 5, row * 220 + 14);
                }
                hashes.add(hash(frameCanvas)); maxArtPosesDrawn = Math.max(maxArtPosesDrawn, drawn.drawCount); compositeFrames += drawn.compositeDrawCount;
                for (const call of drawn.calls) { seen.add(call.frameIndex); maxUniformScaleError = Math.max(maxUniformScaleError, call.uniformScaleError); fullBodyCropsOnly &&= call.fullBodyCrop; if (call.determinant < 0) mirroredDraws++; }
              }
              const contactFrame = clip === 'run' ? null : draw(frameCanvas.getContext('2d'), id, facing, clip, contact, 0, 0, 180, 250, false);
              direction.clips[clip] = { timelineSamples: 60, authoredCutsSeen: [...seen].sort((a, b) => a - b), distinctCanvasFrames: hashes.size, maxArtPosesDrawn, maxUniformScaleError, fullBodyCropsOnly, mirroredDraws, compositeFrames, contact: contactFrame && { frameIndex: contactFrame.frameIndex, drawCount: contactFrame.drawCount, observedCuts: contactFrame.calls.map(call => call.frameIndex), weights: contactFrame.calls.map(call => call.alpha) } };
            }
            entry.directions[facing] = direction;
          }
          for (const clip of ['idle', 'serve', 'land']) {
            const seen = new Set(), art = new Set();
            for (let frame = 0; frame < 60; frame++) { const drawn = draw(frameCanvas.getContext('2d'), id, 'down', clip, frame / 60, 0, 0, 180, 250, false); art.add(drawn.artClip); for (const call of drawn.calls) seen.add(call.frameIndex); }
            entry.aliases[clip] = { timelineSamples: 60, artClips: [...art], authoredCutsSeen: [...seen].sort((a, b) => a - b) };
          }
          characters.push(entry);
          for (const image of Object.values(images[id])) { imageRegistry.delete(image); image.removeAttribute('src'); }
          delete images[id];
        }
        // This browser-only fixture proves the two-body blend preserves opaque
        // overlap; ordinary source-over blending would lower alpha to 191.
        const solidImage = async color => { const source = document.createElement('canvas'); source.width = 24; source.height = 36; const ctx = source.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 24, 36); const image = new Image(); image.src = source.toDataURL(); await image.decode(); return image; };
        const [red, green] = await Promise.all([solidImage('#ff0000'), solidImage('#00ff00')]);
        const rectangle = { rect: [0, 0, 24, 36], pivot: [12, 36], bodyHeight: 36 };
        const fixture = { clips: Object.fromEntries(['run', 'block'].map(clip => [clip, { views: { down: Array(6).fill(rectangle) } }])) };
        const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
        const animator = new SpriteAnimator(); animator.pose = () => ({ clip: 'block', phase: 0, facing: 'down', previous: { clip: 'run', phase: 0, facing: 'down' }, transitionWeight: .5 });
        const blended = animator.draw(canvas.getContext('2d'), { x: 0, y: 0, z: 0, index: 0 }, { time: 0 }, { images: { run: red, block: green }, character: fixture, project: (x, y, z) => ({ x: 50, y: 60 - z * 36 / SPRITE_HEIGHT }) });
        const overlap = [...canvas.getContext('2d').getImageData(50, 42, 1, 1).data];
        return { method: 'Actual whole-body atlas crops, SpriteAnimator.draw and calibrated court projection; 60 canonical timeline samples per clip with frameFade=0 so actual crops match cut labels; production rAF uses default fading; source and offscreen drawImage transforms observed without modifying artwork', characters, blendOpacity: { ...blended, overlap } };
      } finally { for (const [index, prototype] of prototypes.entries()) prototype.drawImage = originals[index]; }
    }, gameURL);
    await writeFile(motionReportPath, JSON.stringify({ ...authored, runtime: [], errors, responses }, null, 2));
    if (!runtimeOnly) {
      await motionPage.locator('#motion-directions').screenshot({ path: 'artifacts/motion-directions.png' });
      for (const facing of ['down', 'up', 'left', 'right']) await motionPage.locator(`#motion-run-timeline-${facing}`).screenshot({ path: `artifacts/motion-run-timeline-${facing}.png` });
      for (const facing of ['down', 'up', 'left', 'right']) await motionPage.locator(`#motion-actions-${facing}`).screenshot({ path: `artifacts/motion-actions-${facing}.png` });
      await motionPage.locator('#motion-actions-right').screenshot({ path: 'artifacts/motion-actions.png' });
      expect(authored.characters.map(character => character.id)).toEqual(EXPECTED_ROSTER.map(character => character.id));
      for (const character of authored.characters) {
        expect(new Set(Object.values(character.directions).map(direction => direction.renderedDirectionHash)).size, `${character.id}: four rendered views`).toBe(4);
        for (const [facing, direction] of Object.entries(character.directions)) for (const [clip, frames] of Object.entries(direction.clips)) {
          const label = `${character.id}/${facing}/${clip}`;
          expect(frames.timelineSamples, label).toBe(60); expect(frames.authoredCutsSeen, label).toEqual([0, 1, 2, 3, 4, 5]);
          expect(frames.distinctCanvasFrames, label).toBeGreaterThanOrEqual(6);
          expect(frames.maxArtPosesDrawn, `${label}: maximum two complete poses`).toBeLessThanOrEqual(2);
          expect(frames.maxUniformScaleError, `${label}: no anatomical stretching`).toBeLessThan(1e-7);
          expect(frames.fullBodyCropsOnly, label).toBe(true); expect(frames.mirroredDraws, label).toBe(0);
          if (frames.contact) { expect(frames.contact.frameIndex, label).toBe(3); expect(frames.contact.drawCount, label).toBe(1); expect(frames.contact.observedCuts, label).toEqual([3]); expect(frames.contact.weights, label).toEqual([1]); }
        }
        expect(character.aliases.idle.artClips).toEqual(['run']); expect(character.aliases.idle.authoredCutsSeen).toEqual([0]);
        expect(character.aliases.serve.artClips).toEqual(['spike']); expect(character.aliases.serve.authoredCutsSeen).toEqual([0, 1, 2, 3, 4, 5]);
        expect(character.aliases.land.authoredCutsSeen).toEqual([5]);
      }
      expect(authored.blendOpacity.drawCount).toBe(2); expect(authored.blendOpacity.compositeDrawCount).toBe(1);
      expect(authored.blendOpacity.overlap[3], 'crossfade keeps the opaque face/body overlap opaque').toBe(255);
      expect(authored.blendOpacity.overlap[0]).toBeGreaterThanOrEqual(120); expect(authored.blendOpacity.overlap[0]).toBeLessThanOrEqual(136);
      expect(authored.blendOpacity.overlap[1]).toBeGreaterThanOrEqual(120); expect(authored.blendOpacity.overlap[1]).toBeLessThanOrEqual(136);
    }
    await motionPage.evaluate(() => document.querySelector('#motion-proof')?.remove());
    await motionPage.getByRole('button', { name: '노바 선택', exact: true }).click(); await motionPage.locator('#desktop-start').click();
    await motionPage.waitForSelector('body[data-phase="rally"]');
    const runtime = [];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 393, height: 852 }]) {
      await motionPage.setViewportSize(viewport); await motionPage.waitForTimeout(100);
      for (const [key, facing] of [['ArrowRight', 'right'], ['ArrowLeft', 'left'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) {
        await motionPage.waitForSelector('body[data-phase="rally"]', { timeout: 15000 });
        const before = await motionPage.locator('#you-indicator').evaluate(element => element.style.transform); await motionPage.keyboard.down(key);
        const frames = await motionPage.evaluate(async ({ initialPosition, expectedFacing }) => {
          const { COURT_SCENE } = await import(new URL('src/court-scene.js', location.href).href);
          const timestamps = [], positions = [], groundSamples = [], phaseCounts = {}, canvas = document.querySelector('#game-canvas'), ctx = canvas.getContext('2d'), original = ctx.drawImage, originalEllipse = ctx.ellipse;
          let latestGround = null;
          function unprojectFloor(px, py) {
            const bounds = canvas.getBoundingClientRect(), [mx, my, mw] = COURT_SCENE.projection;
            const ux = px / bounds.width * COURT_SCENE.width, uy = py / bounds.height * COURT_SCENE.height;
            const a = mx[0] - ux * mw[0], b = mx[1] - ux * mw[1], c = ux * mw[3] - mx[3];
            const d = my[0] - uy * mw[0], e = my[1] - uy * mw[1], f = uy * mw[3] - my[3], det = a * e - b * d;
            return { x: (c * e - b * f) / det, y: (a * f - c * d) / det };
          }
          ctx.ellipse = function(x, y, rx, ry, ...args) { if (rx === 13 && ry === 4 && Math.abs(this.lineWidth - 1.3) < .001) latestGround = unprojectFloor(x, y - 2); return originalEllipse.call(this, x, y, rx, ry, ...args); };
          let pendingPaints = 0, gameRenderedFrames = 0, maxSpriteDrawsPerFrame = 0, maxUniformScaleError = 0;
          ctx.drawImage = function(image, ...args) {
            const isArt = image instanceof HTMLImageElement && image.src.includes('/assets/animation/');
            const isComposite = typeof OffscreenCanvas === 'function' && image instanceof OffscreenCanvas;
            if ((isArt || isComposite) && args.length === 8) {
              pendingPaints++;
              const [, , sw, sh, , , dw, dh] = args, matrix = this.getTransform();
              const xScale = Math.hypot(matrix.a, matrix.b) * dw / sw, yScale = Math.hypot(matrix.c, matrix.d) * dh / sh;
              maxUniformScaleError = Math.max(maxUniformScaleError, Math.abs(xScale / yScale - 1));
            }
            return original.call(this, image, ...args);
          };
          try {
            for (let frame = 0; frame < 60; frame++) { timestamps.push(await new Promise(requestAnimationFrame)); positions.push(document.querySelector('#you-indicator').style.transform); const phase = document.body.dataset.phase; phaseCounts[phase] = (phaseCounts[phase] || 0) + 1; if (latestGround) groundSamples.push({ ...latestGround, phase, facing: document.body.dataset.facing }); if (pendingPaints) gameRenderedFrames++; maxSpriteDrawsPerFrame = Math.max(maxSpriteDrawsPerFrame, pendingPaints); pendingPaints = 0; }
          } finally { ctx.drawImage = original; ctx.ellipse = originalEllipse; }
          let manualMovementFrames = 0, manualDistanceWorld = 0;
          for (let index = 1; index < groundSamples.length; index++) {
            const previous = groundSamples[index - 1], current = groundSamples[index], dx = current.x - previous.x, dy = current.y - previous.y;
            if (previous.phase !== 'rally' || current.phase !== 'rally' || current.facing !== expectedFacing) continue;
            const directed = expectedFacing === 'right' ? dx > .1 && Math.abs(dy) < 1 : expectedFacing === 'left' ? dx < -.1 && Math.abs(dy) < 1 : expectedFacing === 'up' ? dy < -.1 && Math.abs(dx) < 1 : dy > .1 && Math.abs(dx) < 1;
            if (directed) { manualMovementFrames++; manualDistanceWorld += Math.hypot(dx, dy); }
          }
          const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]), sorted = [...intervals].sort((a, b) => a - b);
          return { frames: timestamps.length, distinctPlayerPositions: new Set(positions).size, movementObserved: positions.some(position => position !== initialPosition), manualMovementFrames, manualDistanceWorld, firstGroundPosition: groundSamples[0], lastGroundPosition: groundSamples.at(-1), phaseCounts, gameRenderedFrames, maxSpriteDrawsPerFrame, maxUniformScaleError, meanFrameMs: intervals.reduce((a, b) => a + b, 0) / intervals.length, p95FrameMs: sorted[Math.floor((sorted.length - 1) * .95)], renderedFacing: document.body.dataset.facing };
        }, { initialPosition: before, expectedFacing: facing });
        await motionPage.keyboard.up(key); const after = await motionPage.locator('#you-indicator').evaluate(element => element.style.transform);
        runtime.push({ viewport, key, facing, initialPosition: before, finalPosition: after, ...frames });
        await writeFile(motionReportPath, JSON.stringify({ ...authored, runtime, errors, responses }, null, 2));
        expect(frames.manualMovementFrames, `${facing}: manual ground movement during consecutive rally frames`).toBeGreaterThanOrEqual(3); expect(frames.renderedFacing).toBe(facing);
        expect(frames.gameRenderedFrames, `${facing}: actual player paints across 60 browser frames`).toBeGreaterThanOrEqual(55);
        expect(frames.maxUniformScaleError, `${facing}: actual game whole-body scale`).toBeLessThan(1e-7);
        expect(frames.meanFrameMs, `${facing}: mean rAF delivery`).toBeLessThan(25); expect(frames.p95FrameMs, `${facing}: p95 rAF delivery`).toBeLessThan(40);
      }
    }
    await motionPage.screenshot({ path: 'artifacts/motion-mobile-runtime.png', fullPage: false });
    expect(errors).toEqual([]); expect(responses).toEqual([]);
    const report = { ...authored, runtime, errors, responses }; await writeFile(motionReportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ motions: true, runtimeOnly, characters: authored.characters.length, directionalTimelineSamples: authored.characters.length * 4 * 4 * 60, authoredCuts: authored.characters.length * 4 * 4 * 6, blendOpacity: authored.blendOpacity?.overlap, runtime, errors, responses }));
  } finally { await motionContext.close(); await browser.close(); }
  process.exit(0);
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
await context.addInitScript(() => {
  const key = 'slay-beach-volley-v1';
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ character: 'tempest', partner: 'onyx', wins: 2, tourWins: 1, bestTraining: 12, settings: { assist: true } }));
  window.__volleySampleDecodes = 0;
  const NativeImage = window.Image, allocated = []; let maximumSheets = 0;
  const inventory = () => allocated.filter(image => image.getAttribute('src')?.includes('/assets/animation/'));
  window.Image = function(...args) { const image = new NativeImage(...args); allocated.push(image); return image; };
  window.Image.prototype = NativeImage.prototype; Object.setPrototypeOf(window.Image, NativeImage);
  const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { source.set.call(this, value); maximumSheets = Math.max(maximumSheets, inventory().length); } });
  window.__volleyAnimationInventory = () => ({ maximumSheets, sheets: inventory().map(image => ({ source: image.src, complete: image.complete && image.naturalWidth > 0 })) });
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio) {
    const decode = Audio.prototype.decodeAudioData;
    Audio.prototype.decodeAudioData = function(...args) {
      return decode.apply(this, args).then(buffer => { window.__volleySampleDecodes++; return buffer; });
    };
  }
});
const page = await context.newPage();
async function verifyAnimationInventory() {
  const inventory = await page.evaluate(() => window.__volleyAnimationInventory());
  const players = await page.locator('body').getAttribute('data-animation-players');
  const ids = players.split(','); expect(new Set(ids).size).toBe(4);
  expect(inventory.sheets).toHaveLength(16); expect(inventory.maximumSheets).toBeLessThanOrEqual(16);
  expect(inventory.sheets.every(sheet => sheet.complete)).toBe(true);
  expect(new Set(inventory.sheets.map(sheet => new URL(sheet.source).pathname.split('/').at(-1).replace(/-(run|toss|spike|block)\.webp$/, '')))).toEqual(new Set(ids));
  return { activePlayers: ids, decodedSheets: inventory.sheets.length, maximumLiveSheets: inventory.maximumSheets };
}
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
await expect(page.locator('#game-canvas')).toHaveAttribute('data-animation', 'whole-sprite-60');
const migratedSave = await page.evaluate(() => JSON.parse(localStorage.getItem('slay-beach-volley-v1')));
expect(migratedSave.settings).not.toHaveProperty('assist'); expect(migratedSave.wins).toBe(2);
expect(migratedSave.tourWins).toBe(1); expect(migratedSave.bestTraining).toBe(12);
expect(migratedSave.character).toBe('tempest'); expect(migratedSave.partner).toBe('onyx');
expect(await page.locator('.roster-item').count()).toBe(EXPECTED_ROSTER.length);
const initialAnimationLoading = await verifyAnimationInventory();
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
  const cacheSheets = await page.evaluate(async () => (await (await caches.open('slay-beach-volley-v8')).keys()).filter(request => /\/assets\/animation\/.*\.webp$/.test(request.url)).length);
  expect(cacheSheets).toBe(EXPECTED_ROSTER.length * 4);
  const offlineSelections = [];
  for (const character of EXPECTED_ROSTER) {
    const button = page.getByRole('button', { name: `${character.ko} 선택`, exact: true });
    await button.scrollIntoViewIfNeeded(); await button.click(); await page.waitForSelector('body[data-players-ready="true"]');
    offlineSelections.push({ character: character.id, ...await verifyAnimationInventory() });
  }
  await page.getByRole('button', { name: '경기 시작', exact: true }).click(); await page.waitForSelector('body[data-phase="rally"]');
  await expect.poll(() => page.evaluate(() => window.__volleySampleDecodes)).toBe(4);
  await snapshot('artifacts/offline-game.png');
  console.log(JSON.stringify({ offline: true, cachedAnimationSheets: cacheSheets, offlineSelections, sampledAudioDecoded: 4, unrelatedCachePreserved: true, phase: await page.locator('body').getAttribute('data-phase'), errors, responses }));
  await writeFile('artifacts/offline-qa-results.json', JSON.stringify({ offline: true, cachedAnimationSheets: cacheSheets, offlineSelections, sampledAudioDecoded: 4, unrelatedCachePreserved: true, errors, responses }, null, 2));
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
// Points can finish during the movement check. Charge only in an active rally,
// then freeze game time during the real native long-press gesture interval.
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
let observedBetweenRallies = await page.locator('body').getAttribute('data-phase') !== 'rally', freshRally = false;
for (let ticks = 0; ticks < 600 && !freshRally; ticks++) {
  await page.clock.runFor(100);
  const phase = await page.locator('body').getAttribute('data-phase');
  if (phase !== 'rally') observedBetweenRallies = true;
  else if (observedBetweenRallies) freshRally = true;
}
expect(freshRally, 'native touch hold starts in a newly observed active rally').toBe(true);
await expect(page.locator('body')).toHaveAttribute('data-phase', 'rally');
const spikeRect = await page.locator('#spike-button').boundingBox();
let spikeTouchHeld = false;
try {
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spikeRect.x + spikeRect.width / 2, y: spikeRect.y + spikeRect.height / 2, id: 1 }] });
  spikeTouchHeld = true;
  await page.clock.runFor(120); // Paint the meter through the game's 90ms HUD throttle.
  await expect(page.locator('#power-meter')).toBeVisible();
  // Browser gesture timers still use wall time while game physics stays frozen.
  await new Promise(resolve => setTimeout(resolve, 800));
  await expect(page.locator('#power-meter')).toBeVisible();
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  expect(await page.locator('dialog[open]').count()).toBe(0);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  spikeTouchHeld = false;
  await page.clock.runFor(120);
  await expect(page.locator('#power-meter')).not.toBeVisible();
} finally {
  if (spikeTouchHeld) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.resume();
}
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
for (const { ko: name } of EXPECTED_ROSTER) {
  const button = page.getByRole('button', { name: `${name} 선택`, exact: true });
  await button.scrollIntoViewIfNeeded(); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.waitForSelector('body[data-players-ready="true"]'); await verifyAnimationInventory();
}
await page.evaluate(ids => { for (const id of ids) document.querySelector(`[data-character="${id}"]`).click(); }, EXPECTED_ROSTER.map(character => character.id));
await page.waitForSelector('body[data-players-ready="true"]');
const rapidSelectionLoading = await verifyAnimationInventory();
await page.reload(); await page.waitForSelector('body[data-ready="true"]');
await expect(page.getByRole('button', { name: `${EXPECTED_ROSTER.at(-1).ko} 선택`, exact: true })).toHaveAttribute('aria-pressed','true');
console.log('All original characters can be selected; selection persists after reload.');
await page.setViewportSize({ width: 1440, height: 1000 });
const beforePartner = await page.evaluate(() => JSON.parse(localStorage.getItem('slay-beach-volley-v1')));
await page.getByRole('button', { name: /함께 뛸 파트너:/ }).click();
await page.waitForSelector('body[data-players-ready="true"]');
const afterPartner = await page.evaluate(() => JSON.parse(localStorage.getItem('slay-beach-volley-v1')));
expect(afterPartner.character).toBe(beforePartner.character); expect(afterPartner.partner).not.toBe(beforePartner.partner);
await verifyAnimationInventory();
const partnerChoices = [afterPartner.partner];
for (let index = 1; index < EXPECTED_ROSTER.length - 1; index++) {
  await page.getByRole('button', { name: /함께 뛸 파트너:/ }).click(); await page.waitForSelector('body[data-players-ready="true"]');
  const choice = await page.evaluate(() => JSON.parse(localStorage.getItem('slay-beach-volley-v1')));
  expect(choice.character).toBe(beforePartner.character); expect(choice.partner).not.toBe(choice.character); partnerChoices.push(choice.partner);
  await verifyAnimationInventory();
}
expect(new Set(partnerChoices).size).toBe(EXPECTED_ROSTER.length - 1); expect(partnerChoices.at(-1)).toBe(beforePartner.partner);
await page.setViewportSize({ width: 393, height: 852 });
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
await writeFile('artifacts/browser-qa-results.json', JSON.stringify({ errors, responses, layouts, longPressGuards, initialAnimationLoading, rapidSelectionLoading, partnerChoices, sampledAudioDecoded: 4, checked: ['three physically lit Blender stadiums and calibrated 2D scene','four sampled volleyball sounds decoded after a real play gesture','ordinary mobile button long press without native popup','all ten original characters with whole-body action artwork','manual movement stops when input is released','legacy movement assistance removed without losing records','keyboard movement and block','800 ms touch charge without selection or popup','automatic jump and real manual spike after manual positioning','charge button','joystick pointer capture','pause and resume','persistent character and settings','help modal','60 second practice and result','dark mode','reduced motion'] }, null, 2));
if(errors.length || responses.length) throw new Error(JSON.stringify({errors,responses}));
await browser.close();
