// Generates the two FICTIONAL sample invoices used by the demo, the docs and the tests:
//   1. invoice-01.png        - a clean, flat scan (bundled in the app for the "Try a sample" button)
//   2. invoice-02-photo.jpg  - the same kind of paper photographed on a desk: rotated, shadowed, soft, noisy
// Vendors, addresses and amounts are invented. Run with: npm run make:samples
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p) => join(root, ...p);
mkdirSync(out('public/samples'), { recursive: true });
mkdirSync(out('docs/samples'), { recursive: true });
mkdirSync(out('e2e/fixtures'), { recursive: true });

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff;font-family:"Liberation Sans",Arial,FreeSans,"DejaVu Sans",sans-serif;color:#111;width:850px;height:1100px;padding:64px 70px;font-size:19px}
  h1{margin:0;font-size:34px;letter-spacing:.5px}
  .muted{color:#333;font-size:16px;line-height:1.5}
  .row{display:flex;justify-content:space-between;align-items:flex-start}
  .title{font-size:44px;font-weight:800;letter-spacing:3px;color:#0f4c47}
  .meta td{padding:3px 0 3px 18px;font-size:19px}
  table.items{width:100%;border-collapse:collapse;margin-top:34px}
  table.items th{background:#e6efee;text-align:left;padding:10px 10px;font-size:16px;letter-spacing:.5px;border-top:2px solid #111;border-bottom:2px solid #111}
  table.items td{padding:12px 10px;border-bottom:1px solid #999;font-size:19px}
  .r{text-align:right}
  .totals{width:340px;margin:22px 0 0 auto;font-size:20px}
  .totals div{display:flex;justify-content:space-between;padding:5px 0}
  .totals .grand{border-top:2px solid #111;margin-top:6px;padding-top:9px;font-weight:800;font-size:23px}
  .foot{position:absolute;left:70px;right:70px;bottom:60px;font-size:15px;color:#333;border-top:1px solid #999;padding-top:12px}
  hr{border:0;border-top:2px solid #111;margin:26px 0}
</style></head><body>${body}</body></html>`;

const invoice1 = page(`
  <div class="row">
    <div><h1>Harvest Lane Wholesale Ltd.</h1>
      <div class="muted">4820 Granville Avenue<br>Vancouver, BC V6H 2K7<br>Tel (604) 555-0142</div></div>
    <div class="title">INVOICE</div>
  </div>
  <hr>
  <div class="row">
    <div><div class="muted">BILL TO</div><div style="font-size:21px;font-weight:700">Northside Cafe</div>
      <div class="muted">118 Commercial Drive<br>Vancouver, BC</div></div>
    <table class="meta"><tr><td>Invoice No:</td><td><b>HL-20418</b></td></tr>
      <tr><td>Invoice Date:</td><td>2026-09-24</td></tr><tr><td>Terms:</td><td>Net 30</td></tr></table>
  </div>
  <table class="items">
    <tr><th style="width:52%">DESCRIPTION</th><th class="r">QTY</th><th class="r">UNIT PRICE</th><th class="r">AMOUNT</th></tr>
    <tr><td>All-purpose flour 20kg</td><td class="r">6</td><td class="r">28.50</td><td class="r">171.00</td></tr>
    <tr><td>Unsalted butter 5kg</td><td class="r">4</td><td class="r">46.75</td><td class="r">187.00</td></tr>
    <tr><td>Fine sea salt 10kg</td><td class="r">2</td><td class="r">12.40</td><td class="r">24.80</td></tr>
    <tr><td>Dry yeast 500g</td><td class="r">8</td><td class="r">9.95</td><td class="r">79.60</td></tr>
    <tr><td>Sesame seeds 2kg</td><td class="r">3</td><td class="r">18.20</td><td class="r">54.60</td></tr>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>517.00</span></div>
    <div><span>GST (5%)</span><span>25.85</span></div>
    <div class="grand"><span>Total</span><span>542.85</span></div>
  </div>
  <div class="foot">Thank you for your business. Payment due within 30 days. Sample document - fictional company.</div>`);

const invoice2 = page(`
  <div class="row">
    <div><h1>Coastal Fresh Produce Co.</h1>
      <div class="muted">77 Harbour Road, Richmond, BC V6X 1A3<br>Tel (604) 555-0177</div></div>
    <div class="title" style="font-size:38px">INVOICE</div>
  </div>
  <hr>
  <table class="meta" style="margin-left:auto"><tr><td>Invoice # </td><td><b>CF-7783</b></td></tr>
    <tr><td>Date:</td><td>Sep 27, 2026</td></tr><tr><td>Customer:</td><td>Northside Cafe</td></tr></table>
  <table class="items">
    <tr><th>QTY</th><th style="width:56%">ITEM</th><th class="r">PRICE</th><th class="r">TOTAL</th></tr>
    <tr><td>12</td><td>Romaine lettuce (case)</td><td class="r">18.00</td><td class="r">216.00</td></tr>
    <tr><td>5</td><td>Roma tomatoes 10lb</td><td class="r">21.50</td><td class="r">107.50</td></tr>
    <tr><td>3</td><td>Yellow onions 50lb</td><td class="r">32.00</td><td class="r">96.00</td></tr>
    <tr><td>10</td><td>Lemons (case)</td><td class="r">14.75</td><td class="r">147.50</td></tr>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>567.00</span></div>
    <div><span>GST (5%)</span><span>28.35</span></div>
    <div class="grand"><span>Total</span><span>595.35</span></div>
  </div>
  <div class="foot">Perishable goods - inspect on delivery. Sample document - fictional company.</div>`);

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const shoot = async (html, scale) => {
  const ctx = await browser.newContext({ viewport: { width: 850, height: 1100 }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.setContent(html);
  const buf = await p.screenshot({ type: 'png' });
  await ctx.close();
  return buf;
};

// 1) clean scan
const clean = await shoot(invoice1, 1.5);
await sharp(clean).png({ compressionLevel: 9, palette: true, colors: 64 }).toFile(out('public/samples/invoice-01.png'));
copyFileSync(out('public/samples/invoice-01.png'), out('docs/samples/invoice-01.png'));

// 2) "photographed on a desk": rotate, shadow, blur, noise, JPEG artefacts
const flat = await shoot(invoice2, 1.5); // 1275 x 1650
const W = 1700;
const H = 2050;
const rotated = await sharp(flat).rotate(-2.2, { background: '#00000000' }).png().toBuffer();
const shadow = await sharp(rotated).ensureAlpha().linear([0, 0, 0, 0.35], [0, 0, 0, 0]).blur(18).toBuffer().catch(() => null);
const desk = sharp({ create: { width: W, height: H, channels: 3, background: '#4a4038' } });
const layers = [];
if (shadow) layers.push({ input: shadow, left: 200, top: 190 });
layers.push({ input: rotated, left: 150, top: 120 });
const composed = await desk.composite(layers).png().toBuffer();
// uneven lighting: a soft dark vignette; then noise + slight blur + JPEG
const vignette = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="45%" cy="40%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
const noise = await sharp({ create: { width: W, height: H, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 14 } } }).png().toBuffer();
const photo = await sharp(composed)
  .composite([{ input: vignette }, { input: noise, blend: 'overlay', opacity: 0.35 }])
  .blur(0.9)
  .jpeg({ quality: 68 })
  .toBuffer();
await sharp(photo).toFile(out('docs/samples/invoice-02-photo.jpg'));
await sharp(photo).toFile(out('e2e/fixtures/invoice-photo.jpg'));

await browser.close();
console.log('samples written');
