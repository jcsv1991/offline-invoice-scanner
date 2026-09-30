// Drives the REAL production build in a phone-sized browser and captures the README screenshots.
// Run: npm run build && node scripts/take-screenshots.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'docs', 'screenshots');
mkdirSync(shots, { recursive: true });
const shot = (name) => join(shots, name);

const server = await preview({ root, preview: { port: 4180, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const tid = (id) => page.getByTestId(id);

await page.goto('http://127.0.0.1:4180/');
await tid('offline-ready').and(page.locator('[data-state="ready"]')).waitFor({ timeout: 90_000 });
await page.screenshot({ path: shot('01-scan.png') });

// read the sample invoice and time it
const t0 = Date.now();
await tid('try-sample').click();
await tid('review-form').waitFor({ timeout: 120_000 });
const ms = Date.now() - t0;
console.log(`sample invoice: click -> editable form in ${ms} ms`);

await page.setViewportSize({ width: 390, height: 1500 });
await page.getByTestId('field-received-by').fill('Sam');
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: shot('02-review.png') });
await page.setViewportSize({ width: 390, height: 844 });

// go "offline" (demo switch), confirm the note -> it queues
await tid('nav-settings').click();
await tid('simulate-offline').check();
await tid('nav-scan').click();
await tid('generate-note').click();
await tid('note-card').waitFor();
await page.setViewportSize({ width: 390, height: 1150 });
await page.screenshot({ path: shot('03-note-queued.png') });
await page.setViewportSize({ width: 390, height: 844 });

await tid('nav-notes').click();
await page.screenshot({ path: shot('04-notes-queued.png') });

// connection returns
await tid('nav-settings').click();
await tid('simulate-offline').uncheck();
await tid('nav-notes').click();
await page.locator('[data-testid="note-row"] [data-status="synced"]').waitFor({ timeout: 30_000 });
await page.screenshot({ path: shot('05-notes-synced.png') });

await tid('nav-settings').click();
await page.getByTestId('cloud-inbox').waitFor();
await page.screenshot({ path: shot('06-settings.png'), fullPage: false });

await browser.close();
server.httpServer.closeAllConnections();
await server.close();

// overview strip for the top of the README
const pick = ['01-scan.png', '02-review.png', '03-note-queued.png', '05-notes-synced.png'];
const H = 1500;
const tiles = await Promise.all(
  pick.map(async (f) => {
    const buf = await sharp(shot(f)).resize({ height: H }).png().toBuffer();
    const { width: w, height: h } = await sharp(buf).metadata(); // real size after resize (rounding!)
    // rounded phone-ish frame drawn over the screenshot
    const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="36" fill="none" stroke="#cbd5e1" stroke-width="3"/></svg>`);
    return { buf: await sharp(buf).composite([{ input: frame }]).png().toBuffer(), w };
  }),
);
const gap = 40;
const pad = 48;
const totalW = tiles.reduce((s, t) => s + t.w, 0) + gap * (tiles.length - 1) + pad * 2;
let x = pad;
const layers = tiles.map((t) => {
  const l = { input: t.buf, left: x, top: pad };
  x += t.w + gap;
  return l;
});
const strip = await sharp({ create: { width: totalW, height: H + pad * 2, channels: 3, background: '#f1f5f9' } })
  .composite(layers)
  .png()
  .toBuffer();
// (sharp runs resize BEFORE composite inside one pipeline, so shrink in a second pass)
await sharp(strip).resize({ width: 2000 }).png({ compressionLevel: 9 }).toFile(shot('overview.png'));
console.log('screenshots written');
