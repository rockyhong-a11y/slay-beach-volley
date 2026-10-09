import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// A fresh Chrome context and a localhost-only server; no existing profile or
// authenticated browser state is read by this rendering verification.
const root = process.cwd();
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const content = await readFile(path);
    response.writeHead(200, { 'Content-Type': extname(path) === '.js' ? 'text/javascript' : 'text/html' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1090 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/artifacts/vfx-preview.html`);
  await page.waitForSelector('body[data-ready="true"]');
  await page.screenshot({ path: 'artifacts/vfx-contact-sheet.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Rendered 15 contact-effect snapshots: 65ms, 220ms, reduced motion.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
