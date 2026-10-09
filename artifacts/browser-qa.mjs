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
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/dist/' || target.searchParams.get('v') !== '5') {
    await browser.close();
    throw new Error('Upgrade QA requires the local /dist/?v=5 URL.');
  }
  const base = new URL('./', target), workerURL = new URL('sw.js', base).href;
  const legacyWorkerURL = new URL('qa-legacy-sw.js', base).href;
  const fixturePath = 'dist/qa-legacy-sw.js';
  const legacyCache = 'slay-beach-volley-v4', currentCache = 'slay-beach-volley-v5';
  const contexts = [], errors = [];
  let fixtureCreated = false;
  try {
    // Keep the fixture entirely inside the production /dist/ scope. It models
    // v4's ignoreSearch cache hit without loading any current app code first.
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
      const html = `<!doctype html><html><head><title>Legacy v4 fixture</title></head><body data-legacy="v4"><div id="legacy-marker">Cached v4 app</div><script>
sessionStorage.setItem('volley-legacy-loads', String(Number(sessionStorage.getItem('volley-legacy-loads') || 0) + 1));
if (new URL(location.href).searchParams.get('v') === '5') navigator.serviceWorker.register(${JSON.stringify(workerURL)}, {scope:${JSON.stringify(scope)}}).catch(error => console.error(error));
<\/script></body></html>`;
      await cache.put(baseURL, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v4' } }));
      await cache.put(new URL('index.html', baseURL).href, new Response(html, { headers: { 'Content-Type': 'text/html', 'X-Volley-QA': 'legacy-v4' } }));
      await caches.open('other-game-cache');
    }, { legacyWorkerURL, scope: base.pathname, legacyCache, baseURL: base.href, workerURL });
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(legacyWorkerURL);

    // An existing v4 game tab must remain open; only the explicit v5 link may
    // be navigated again when the new worker takes control.
    const oldPage = await upgradeContext.newPage();
    const oldURL = new URL(base); oldURL.searchParams.set('v', '4');
    let oldNavigations = 0;
    oldPage.on('framenavigated', frame => { if (frame === oldPage.mainFrame()) oldNavigations++; });
    oldPage.on('pageerror', error => errors.push(error.message));
    await oldPage.goto(oldURL.href); await oldPage.waitForSelector('#legacy-marker');
    expect(oldNavigations).toBe(1);

    let upgradeNavigations = 0, legacyResponseSeen = false;
    upgradePage.on('framenavigated', frame => { if (frame === upgradePage.mainFrame()) upgradeNavigations++; });
    upgradePage.on('response', response => {
      if (response.request().isNavigationRequest() && response.headers()['x-volley-qa'] === 'legacy-v4') legacyResponseSeen = true;
    });
    await upgradePage.goto(gameURL, { waitUntil: 'domcontentloaded' });
    await upgradePage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await expect(upgradePage.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v1');
    await expect.poll(() => upgradePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toBe(workerURL);
    expect(legacyResponseSeen, 'the first request must actually exercise the stale v4 HTML').toBe(true);
    expect(await upgradePage.evaluate(() => sessionStorage.getItem('volley-legacy-loads'))).toBe('1');
    await upgradePage.waitForTimeout(800);
    expect(upgradeNavigations, 'one upgrade reload is required, without a navigation loop').toBe(2);
    expect(oldNavigations, 'an existing v4 game must not be interrupted').toBe(1);
    await expect(oldPage.locator('#legacy-marker')).toBeVisible();
    const cachesAfter = await upgradePage.evaluate(async ({ legacyCache, currentCache }) => ({
      legacyRemoved: !await caches.has(legacyCache), currentPresent: await caches.has(currentCache), unrelatedPreserved: await caches.has('other-game-cache'),
    }), { legacyCache, currentCache });
    expect(cachesAfter).toEqual({ legacyRemoved: true, currentPresent: true, unrelatedPreserved: true });
    expect(errors).toEqual([]);
    const report = { upgrade: true, staleV4ResponseSeen: legacyResponseSeen, freshInstallNavigations: freshNavigations, upgradeNavigations, existingV4Navigations: oldNavigations, ...cachesAfter, errors };
    await writeFile('artifacts/upgrade-qa-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    if (fixtureCreated) await unlink(fixturePath);
    await browser.close();
  }
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
await expect(page.locator('#game-canvas')).toHaveAttribute('data-scene', 'slay-stadium-v1');
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
await page.getByRole('button', { name: '블로킹. 네트 앞에서 눌러 상대 공격을 막습니다.', exact: true }).click();
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
