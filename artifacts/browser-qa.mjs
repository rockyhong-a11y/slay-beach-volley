import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
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
  await snapshot('artifacts/offline-game.png');
  console.log(JSON.stringify({ offline: true, unrelatedCachePreserved: true, phase: await page.locator('body').getAttribute('data-phase'), errors, responses }));
  await writeFile('artifacts/offline-qa-results.json', JSON.stringify({ offline: true, unrelatedCachePreserved: true, errors, responses }, null, 2));
  await browser.close(); process.exit(0);
}
await snapshot('artifacts/desktop-lobby.png');
console.log(JSON.stringify({ title: await page.title(), errors, responses, roster: await page.locator('.roster-item').count() }));
await page.setViewportSize({ width: 393, height: 852 });
await snapshot('artifacts/mobile-lobby.png');
console.log(JSON.stringify(await page.evaluate(() => ({ viewport: innerHeight, width: innerWidth, bodyWidth: document.body.scrollWidth, height: document.documentElement.scrollHeight, arena: document.querySelector('#arena-wrap').getBoundingClientRect().toJSON() }))));
await page.getByRole('button', { name: '경기 시작', exact: true }).click();
await page.waitForSelector('body[data-phase="rally"]');
await snapshot('artifacts/mobile-game.png');
const touch = await context.newCDPSession(page);
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
await page.locator('#music-setting').uncheck(); await page.locator('#sfx-setting').uncheck(); await page.locator('#assist-setting').uncheck();
await page.getByRole('button', { name: '설정 완료' }).click();
await page.reload(); await page.waitForSelector('body[data-ready="true"]');
await page.getByRole('button', { name: '게임 설정', exact: true }).click();
await expect(page.locator('#assist-setting')).not.toBeChecked();
await page.locator('#assist-setting').check(); await page.getByRole('button', { name: '설정 완료' }).click();
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
let foundAttack = false;
for (let frame = 0; frame < 200; frame++) {
  await page.clock.runFor(150);
  if (await page.locator('body').getAttribute('data-cue') === 'spike') { foundAttack = true; break; }
}
expect(foundAttack, 'an automatically jumping player must get a real attack opportunity').toBe(true);
await expect(page.locator('#spike-button')).toHaveClass(/ready/);
await snapshot('artifacts/automatic-attack-ready.png');
await page.getByRole('button', { name: '스파이크. 길게 눌렀다 놓으면 더 강하게 공격합니다.' }).click();
await page.clock.runFor(180);
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
await writeFile('artifacts/browser-qa-results.json', JSON.stringify({ errors, responses, layouts, longPressGuards, checked: ['10 original characters','keyboard movement and block','800 ms touch charge without selection or popup','automatic jump and real manual spike','charge button','joystick pointer capture','pause and resume','persistent character and settings','help modal','60 second practice and result','dark mode','reduced motion'] }, null, 2));
if(errors.length || responses.length) throw new Error(JSON.stringify({errors,responses}));
await browser.close();
